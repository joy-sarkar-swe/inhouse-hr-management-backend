/**
 * @fileoverview Abstract base throttle guard — production-grade, multi-layer.
 *
 * ── Architecture ─────────────────────────────────────────────────────────────
 *
 * Every concrete guard extends this class and implements `buildLayers()`
 * to return one or more { identifier, config } pairs. The base evaluates a
 * Redis sliding-window check for each pair atomically; the first breach
 * short-circuits and raises HTTP 429.
 *
 * ── IP resolution (proxy-safe) ───────────────────────────────────────────────
 *
 * Trusted headers are honoured only when the connecting socket IP is inside
 * the TRUSTED_PROXIES list (CIDR-aware). Header priority:
 *   1. CF-Connecting-IP   (Cloudflare)
 *   2. X-Real-IP          (nginx)
 *   3. X-Forwarded-For    (first hop, standard)
 *   4. socket.remoteAddress (direct connection)
 *
 * ── Sliding-window algorithm ─────────────────────────────────────────────────
 *
 * Uses a Redis sorted set (ZSET) per key. Each request adds a timestamped
 * entry. Entries older than the window are pruned atomically via Lua script
 * to eliminate race conditions.
 *
 * ── Progressive backoff ──────────────────────────────────────────────────────
 *
 * Once hit count exceeds BLOCK_THRESHOLD an optional hard-block key is set.
 * While a block is active, requests receive an immediate 429 without touching
 * the main counter. For requests below the hard-block threshold but above the
 * soft limit, a synthetic delay is added proportional to excess attempts,
 * capped at BACKOFF_MAX_MS.
 *
 * ── Structured logging & observability ───────────────────────────────────────
 *
 * Every throttle decision (allow / delay / block) emits a structured log
 * entry with: ip, ua_hash, endpoint, identifier_type, attempt_count,
 * decision, block_reason.
 *
 * ── Redis key format ─────────────────────────────────────────────────────────
 *
 *   <keyPrefix>:sw:<sha256(identifier)>   — sliding-window ZSET
 *   <keyPrefix>:blk:<sha256(identifier)>  — hard-block string (value=1)
 *
 * @module throttles/base
 */
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import type { FastifyRequest } from 'fastify';
import { RedisClientService } from '../redis/redis.client';
import { PROGRESSIVE_BACKOFF, TRUSTED_PROXIES } from './config/throttle.config';
import { SLIDING_WINDOW_LUA } from './sliding-window.lua';

const TOO_MANY_REQUESTS = 'Too many requests. Please try again later.';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Per-layer throttle configuration.
 * Each layer represents one Redis sliding-window check.
 */
export interface ThrottleLayerConfig {
  keyPrefix: string;
  ttlSeconds: number;
  limit: number;
  blockSeconds?: number;
  identifierType: string;
}

/** Resolved throttle identifier bound to its layer config. */
export interface ThrottleLayer {
  /** Raw, un-hashed identifier (hashed before use as Redis key). */
  identifier: string;
  config: ThrottleLayerConfig;
}

/** Result of a single sliding-window evaluation. */
interface WindowResult {
  count: number;
  blocked: boolean;
}

// ─── Backward-compatible ThrottleConfig alias (used in legacy guards) ─────────

/** @deprecated Use ThrottleLayerConfig instead. Kept for backward compatibility. */
export interface ThrottleConfig {
  keyPrefix: string;
  ttlSeconds: number;
  limit: number;
}

// ─── IP resolution helpers ────────────────────────────────────────────────────

function ipToNum(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return null;
  return ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0;
}

function ipInCidr(ip: string, cidr: string): boolean {
  if (!cidr.includes('/')) return ip === cidr;
  const [range, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr, 10);
  if (!Number.isFinite(bits)) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  const ipNum = ipToNum(ip);
  const rangeNum = ipToNum(range);
  if (ipNum === null || rangeNum === null) return false;
  return (ipNum & mask) === (rangeNum & mask);
}

function isTrustedProxy(socketIp: string): boolean {
  const ip = socketIp.replace(/^::ffff:/, '');
  return TRUSTED_PROXIES.some((cidr) => {
    try {
      return ipInCidr(ip, cidr);
    } catch {
      return false;
    }
  });
}

/**
 * Resolve the real client IP from a Fastify request using a proxy-safe
 * header priority chain. Trusted forwarding headers are only honoured
 * when the socket peer IP belongs to a known trusted proxy.
 *
 * Priority (when trusted):
 *   CF-Connecting-IP > X-Real-IP > X-Forwarded-For[0] > socket
 *
 * Never returns an empty string — falls back to 'unknown'.
 */
export function resolveClientIp(req: FastifyRequest): string {
  const rawSocket = req.socket?.remoteAddress ?? '';
  const socketIp = rawSocket.replace(/^::ffff:/, '');
  const trusted = !socketIp || isTrustedProxy(socketIp);

  if (trusted) {
    const cf = req.headers['cf-connecting-ip'];
    if (cf) {
      const ip = (Array.isArray(cf) ? cf[0] : cf).trim();
      if (ip) return ip;
    }

    const realIp = req.headers['x-real-ip'];
    if (realIp) {
      const ip = (Array.isArray(realIp) ? realIp[0] : realIp).trim();
      if (ip) return ip;
    }

    const xff = req.headers['x-forwarded-for'];
    if (xff) {
      const raw = Array.isArray(xff) ? xff[0] : xff;
      const ip = raw.split(',')[0].trim();
      if (ip) return ip;
    }
  }

  return socketIp || (req.ip ?? 'unknown').replace(/^::ffff:/, '') || 'unknown';
}

// ─── UA normalisation ─────────────────────────────────────────────────────────

/**
 * Produce a short deterministic 8-char hex hash of a User-Agent string.
 * Normalized (trim + lowercase + collapse spaces) before hashing.
 */
export function hashUserAgent(ua: string | undefined): string {
  const normalized = (ua ?? 'unknown')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return crypto
    .createHash('sha256')
    .update(normalized)
    .digest('hex')
    .slice(0, 8);
}

/**
 * Normalize an optional x-device-id header.
 * - Returns empty string when absent.
 * - Strips non-ASCII-printable chars, trims, truncates to 64 chars.
 */
export function normalizedeviceId(raw: string | string[] | undefined): string {
  if (!raw) return '';
  const str = Array.isArray(raw) ? raw[0] : raw;
  return str
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
    .slice(0, 64);
}

/**
 * Build the hybrid deterministic throttle key for IP-based layers.
 *
 * Components (concatenated with ':'): IP + UA-hash + optional-device-id
 * When device-id is absent, the key degrades gracefully to IP + UA-hash.
 */
export function buildHybridIpKey(req: FastifyRequest): string {
  const ip = resolveClientIp(req);
  const uaHash = hashUserAgent(req.headers['user-agent']);
  const device = normalizedeviceId(req.headers['x-device-id']);
  return device ? `${ip}:${uaHash}:${device}` : `${ip}:${uaHash}`;
}

// ─── Redis Lua sliding-window script ─────────────────────────────────────────
// Hoisted to `./sliding-window.lua.ts` so the same algorithm is shared by
// HTTP throttle guards (this file) and WS throttle guards (chat module).
// ─── Abstract base guard ──────────────────────────────────────────────────────

/**
 * Abstract base guard for all throttle dimensions.
 *
 * Subclasses implement {@link buildLayers} to declare which throttle
 * dimensions (IP, email, userId, phone, etc.) to enforce.
 *
 * The base evaluates each layer sequentially, short-circuiting on the
 * first breach. It applies sliding-window counting, progressive backoff,
 * hard-block escalation, and structured logging automatically.
 */
@Injectable()
export abstract class BaseThrottleGuard implements CanActivate {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(protected readonly redis: RedisClientService) {}

  /** SHA-256 hash a string — obscures PII in Redis keys. */
  protected hash(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  /**
   * Build throttle layers for this request.
   *
   * CONTRACT:
   *  - Must return at least one layer.
   *  - Must never throw — use safe fallback values for absent signals.
   *  - IP layer MUST always be included (use buildHybridIpKey as baseline).
   *  - Identity layers (email, phone, userId) are additive.
   *  - x-device-id MUST NEVER be required; fallback to IP+UA when absent.
   *
   * @param req  Incoming Fastify request.
   * @returns    Non-empty array of throttle layers to evaluate.
   */
  protected abstract buildLayers(req: FastifyRequest): ThrottleLayer[];

  // ─── Sliding-window evaluation ──────────────────────────────────────────

  private async evaluateWindow(
    keyPrefix: string,
    identifier: string,
    ttlSeconds: number,
  ): Promise<WindowResult> {
    const client = this.redis.getClientThrottle();
    const hashedId = this.hash(identifier);
    const swKey = `${keyPrefix}:sw:${hashedId}`;
    const blockKey = `${keyPrefix}:blk:${hashedId}`;

    // Fast-path: check hard-block before touching window counter
    const isBlocked = await client.exists(blockKey);
    if (isBlocked) {
      return {
        count: PROGRESSIVE_BACKOFF.BLOCK_THRESHOLD + 1,
        blocked: true,
      };
    }

    const nowMs = Date.now();
    const windowMs = ttlSeconds * 1_000;
    // Unique member prevents ZADD NX de-duplication of concurrent requests
    const member = `${nowMs}:${Math.random().toString(36).slice(2, 9)}`;

    const count = (await client.eval(
      SLIDING_WINDOW_LUA,
      1,
      swKey,
      String(nowMs),
      String(windowMs),
      member,
      String(ttlSeconds),
    )) as number;

    return { count, blocked: false };
  }

  private async activateBlock(
    keyPrefix: string,
    identifier: string,
    blockSeconds: number,
  ): Promise<void> {
    const blockKey = `${keyPrefix}:blk:${this.hash(identifier)}`;
    await this.redis.getClientThrottle().set(blockKey, '1', 'EX', blockSeconds);
  }

  // ─── Progressive backoff ─────────────────────────────────────────────────

  private computeBackoffMs(count: number, limit: number): number {
    if (count <= limit) return 0;
    const excess = count - limit;
    return Math.min(
      excess * PROGRESSIVE_BACKOFF.BASE_MS,
      PROGRESSIVE_BACKOFF.MAX_MS,
    );
  }

  // ─── canActivate ─────────────────────────────────────────────────────────

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();

    const ip = resolveClientIp(req);
    const uaHash = hashUserAgent(req.headers['user-agent']);
    const endpoint = `${req.method} ${(req as any).routerPath ?? req.url}`;

    const layers = this.buildLayers(req);

    for (const layer of layers) {
      const { identifier, config } = layer;
      const { count, blocked } = await this.evaluateWindow(
        config.keyPrefix,
        identifier,
        config.ttlSeconds,
      );

      // Hard-block active
      if (blocked) {
        this.logger.warn({
          msg: 'THROTTLE_BLOCKED',
          ip,
          ua_hash: uaHash,
          endpoint,
          identifier_type: config.identifierType,
          attempt_count: count,
          decision: 'block',
          block_reason: 'hard_block_active',
          key_prefix: config.keyPrefix,
        });
        throw new HttpException(
          TOO_MANY_REQUESTS,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Block threshold crossed — escalate to hard-block
      if (count > PROGRESSIVE_BACKOFF.BLOCK_THRESHOLD) {
        const blockSecs =
          config.blockSeconds ?? PROGRESSIVE_BACKOFF.BLOCK_DURATION_SECS;
        await this.activateBlock(config.keyPrefix, identifier, blockSecs);

        this.logger.warn({
          msg: 'THROTTLE_BLOCKED',
          ip,
          ua_hash: uaHash,
          endpoint,
          identifier_type: config.identifierType,
          attempt_count: count,
          decision: 'block',
          block_reason: 'threshold_exceeded',
          block_duration_secs: blockSecs,
          key_prefix: config.keyPrefix,
        });
        throw new HttpException(
          TOO_MANY_REQUESTS,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Soft limit exceeded — apply backoff delay then deny
      if (count > config.limit) {
        const backoffMs = this.computeBackoffMs(count, config.limit);
        if (backoffMs > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, backoffMs));
        }

        this.logger.warn({
          msg: 'THROTTLE_DENIED',
          ip,
          ua_hash: uaHash,
          endpoint,
          identifier_type: config.identifierType,
          attempt_count: count,
          limit: config.limit,
          decision: 'deny',
          backoff_ms: backoffMs,
          key_prefix: config.keyPrefix,
        });
        throw new HttpException(
          TOO_MANY_REQUESTS,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Within limit — log and allow (with optional near-limit delay)
      const backoffMs = this.computeBackoffMs(count, config.limit);
      if (backoffMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, backoffMs));
      }

      this.logger.debug({
        msg: 'THROTTLE_ALLOWED',
        ip,
        ua_hash: uaHash,
        endpoint,
        identifier_type: config.identifierType,
        attempt_count: count,
        limit: config.limit,
        decision: 'allow',
        backoff_ms: backoffMs,
        key_prefix: config.keyPrefix,
      });
    }

    return true;
  }
}
