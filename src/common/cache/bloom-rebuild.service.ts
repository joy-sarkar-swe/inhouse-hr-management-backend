/**
 * @fileoverview BloomRebuildService — scheduled, atomic, distributed-safe Bloom filter rebuild.
 *
 * ── Why a periodic rebuild is necessary ─────────────────────────────────────────
 *
 * The Bloom filter is append-only at runtime: bits are SET on entity creation and
 * NEVER cleared on deletion. Over time, deleted entities accumulate as "stale" bits,
 * gradually increasing the false-positive rate. A periodic full rebuild restores
 * the filter to the exact current DB state, removing stale bits and resetting
 * the false-positive rate to its theoretical minimum.
 *
 * ── Correctness guarantees ──────────────────────────────────────────────────────
 *
 * 1. **Atomic swap** — The new filter is built in a shadow key
 *    (`bloom:rebuild:shadow:<ns>`) and then atomically RENAMEd to the live key
 *    (`bloom:<ns>`). There is never a moment where the live key is absent or
 *    partially populated. O(1) RENAME.
 *
 * 2. **Post-rebuild reconciliation** — Entities created DURING the rebuild window
 *    (between rebuild start and the RENAME) have their bits added to the live key
 *    immediately after the swap. This eliminates the "false negative" window that
 *    would otherwise last until the next nightly rebuild.
 *
 * 3. **Distributed lock** — A Redis SET NX PX lock prevents multiple nodes from
 *    rebuilding the same namespace concurrently. Lock value is a UUID unique to
 *    this run; the release uses a Lua CAS script to avoid releasing another
 *    node's lock on clock-skew expiry.
 *
 * 4. **Chunked processing** — DB reads use cursor-based keyset pagination and
 *    Redis writes use pipelines. An inter-chunk delay (BLOOM_REBUILD_INTER_CHUNK_DELAY_MS)
 *    spreads load across the cluster and avoids Redis pipeline spikes.
 *
 * 5. **Non-blocking startup** — The rebuild cron never runs on startup. Only the
 *    lightweight `onModuleInit()` warm-up in each DAO fires at startup.
 *
 * 6. **Fail-open** — Any error during rebuild leaves the OLD live key intact so
 *    the filter continues operating. The partial shadow key is cleaned up.
 *
 * ── Scheduling ───────────────────────────────────────────────────────────────────
 *
 * Controlled by `BLOOM_REBUILD_CRON` (default: `0 3 * * *` = 3 AM daily).
 * All namespaces are rebuilt sequentially in a single cron run to keep Redis
 * load predictable and avoid overlapping pipeline bursts.
 *
 * ── Namespace registry ────────────────────────────────────────────────────────────
 *
 * | Namespace | DB model | Filter condition |
 * |-----------|----------|-------------------|
 * | user      | User     | all users         |
 *
 * To add a namespace for a new domain model, append a `RebuildSpec` to
 * `this.specs` in the constructor and add a matching entry to
 * `BLOOM_KEY_PREFIX` in `cache.constants.ts`.
 *
 * @module common/cache
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import config from 'src/shared/config/app.config';
import { RedisClientService } from '../redis/redis.client';
import { BLOOM_KEY_PREFIX } from './cache.constants';
import { bloomBits } from './bloom-filter.service';

// ─── Internal constants ────────────────────────────────────────────────────────

/** Redis key prefix for shadow (in-progress rebuild) bit arrays. */
const SHADOW_PREFIX = `${BLOOM_KEY_PREFIX}rebuild:shadow:`;

/** Redis key prefix for distributed rebuild locks. */
const LOCK_PREFIX = `${BLOOM_KEY_PREFIX}rebuild:lock:`;

/**
 * Lua CAS script for safe lock release.
 *
 * Only DELetes the key when the stored value matches the caller's lock token.
 * Prevents accidentally releasing a lock that was acquired by a different node
 * after this node's lock expired (clock skew / GC pause scenario).
 *
 * Returns 1 if the lock was released, 0 if it was held by someone else.
 */
const RELEASE_LOCK_SCRIPT = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
  else
    return 0
  end
`;

/** Simple promisified sleep for inter-chunk back-pressure. */
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

// ─── Rebuild spec interface ────────────────────────────────────────────────────

/**
 * Describes one Bloom namespace that BloomRebuildService manages.
 *
 * `fetchPage` must return results in stable `id ASC` order so cursor pagination
 * across chunks is consistent. It must never return the cursor row itself
 * (use `skip: 1` with Prisma cursor pagination).
 *
 * `fetchSince` is used for post-rebuild reconciliation: returns IDs of entities
 * created on or after `since`. Reference-data namespaces (loc:*) may omit it
 * because they are seeded once and never change at runtime.
 */
interface RebuildSpec {
  /** Short namespace key, e.g. `'products'`. Must match BLOOM_KEY_PREFIX keys. */
  namespace: string;
  /** Human-readable description used in log messages. */
  description: string;
  /**
   * Fetch one page of entity IDs from the DB.
   *
   * @param cursor  - ID of the last row from the previous page, or `null` for page 1.
   * @param limit   - Max rows to return.
   * @returns `{ ids, nextCursor }` — `nextCursor` is null when this is the last page.
   */
  fetchPage: (
    cursor: string | null,
    limit: number,
  ) => Promise<{ ids: string[]; nextCursor: string | null }>;
  /**
   * Optional reconciliation query — returns IDs of entities created on or after `since`.
   *
   * Called after the atomic swap to re-add entities that were inserted DURING the
   * rebuild window (preventing false negatives for recently-created entities).
   */
  fetchSince?: (since: Date) => Promise<string[]>;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class BloomRebuildService {
  private readonly logger = new Logger(BloomRebuildService.name);

  /** Ordered list of namespaces to rebuild each cron cycle. */
  private readonly specs: RebuildSpec[];

  /** Whether the rebuild cron is enabled (BLOOM_FILTER_ENABLED AND BLOOM_REBUILD_ENABLED). */
  private readonly enabled: boolean;

  /** Number of entity IDs per DB page + Redis pipeline batch. */
  private readonly chunkSize: number;

  /** Max milliseconds the distributed lock is held per namespace. */
  private readonly lockTtlMs: number;

  /** Milliseconds to pause between consecutive chunks. */
  private readonly interChunkDelayMs: number;

  constructor(
    private readonly redis: RedisClientService,
    private readonly prisma: PrismaService,
  ) {
    this.enabled = config.BLOOM_FILTER_ENABLED && config.BLOOM_REBUILD_ENABLED;
    this.chunkSize = config.BLOOM_REBUILD_CHUNK_SIZE;
    this.lockTtlMs = config.BLOOM_REBUILD_LOCK_TTL_SECS * 1_000;
    this.interChunkDelayMs = config.BLOOM_REBUILD_INTER_CHUNK_DELAY_MS;

    // ── Namespace registry ───────────────────────────────────────────────────
    //
    // Each spec must match the filter predicate used in the corresponding DAO's
    // onModuleInit warmBloom(). Mismatches cause filter divergence.
    this.specs = [
      {
        namespace: 'user',
        description: 'all user IDs',
        fetchPage: async (cursor, limit) => {
          const rows = await this.prisma.user.findMany({
            take: limit,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            orderBy: { id: 'asc' },
            select: { id: true },
          });
          return {
            ids: rows.map((r) => r.id),
            nextCursor: rows.length === limit ? rows[rows.length - 1].id : null,
          };
        },
        fetchSince: async (since) => {
          const rows = await this.prisma.user.findMany({
            where: { created_at: { gte: since } },
            select: { id: true },
          });
          return rows.map((r) => r.id);
        },
      },
    ];
  }

  // ─── Cron entry point ─────────────────────────────────────────────────────────

  /**
   * Periodic Bloom filter rebuild — triggered by `BLOOM_REBUILD_CRON` schedule.
   *
   * Rebuilds every registered namespace sequentially. Sequential execution keeps
   * Redis pipeline load predictable and avoids concurrent bitmap write bursts.
   *
   * The job name `'bloom-rebuild'` is registered with the NestJS SchedulerRegistry
   * so it can be inspected or manually triggered via admin tooling.
   */
  @Cron(config.BLOOM_REBUILD_CRON, { name: 'bloom-rebuild' })
  async runRebuildCycle(): Promise<void> {
    if (!this.enabled) {
      this.logger.debug('Bloom rebuild skipped — disabled by config.');
      return;
    }

    this.logger.log(
      `Bloom rebuild cycle started — ${this.specs.length} namespaces.`,
    );
    const cycleStart = Date.now();

    for (const spec of this.specs) {
      await this.rebuildNamespace(spec);
    }

    this.logger.log(
      `Bloom rebuild cycle complete — ${this.specs.length} namespaces in ${Date.now() - cycleStart} ms.`,
    );
  }

  // ─── Per-namespace rebuild ─────────────────────────────────────────────────────

  /**
   * Rebuild one Bloom namespace atomically.
   *
   * Flow:
   *  1. Acquire distributed lock (SET NX PX) — skip if another node holds it.
   *  2. DEL shadow key to remove any leftover partial state from a previous crash.
   *  3. Stream DB pages via cursor pagination → SETBIT pipeline to shadow key.
   *  4. Pause `interChunkDelayMs` between pages to spread Redis write load.
   *  5. RENAME shadow → live key (atomic, O(1)).
   *  6. Post-rebuild reconciliation: re-add entities created DURING the rebuild
   *     window to prevent a false-negative window for recently-created entities.
   *  7. Release lock via Lua CAS script (only releases own lock).
   *
   * On any error: log, delete shadow key, release lock. Old live key is untouched.
   *
   * @param spec - Namespace rebuild specification.
   */
  private async rebuildNamespace(spec: RebuildSpec): Promise<void> {
    const client = this.redis.getClientSignedUrlCache();
    const liveKey = `${BLOOM_KEY_PREFIX}${spec.namespace}`;
    const shadowKey = `${SHADOW_PREFIX}${spec.namespace}`;
    const lockKey = `${LOCK_PREFIX}${spec.namespace}`;

    // ── Step 1: Acquire distributed lock ────────────────────────────────────
    const lockValue = randomUUID();
    // SET <key> <value> PX <ttlMs> NX — returns 'OK' or null (ioredis: expiryMode first, then setMode)
    const lockResult = await client
      .set(lockKey, lockValue, 'PX', this.lockTtlMs, 'NX')
      .catch(() => null);

    if (lockResult !== 'OK') {
      this.logger.debug(
        `Bloom rebuild skipped: ns=${spec.namespace} — lock held by another node.`,
      );
      return;
    }

    // Record the moment the rebuild starts so we can reconcile concurrent inserts.
    const rebuildStartedAt = new Date();
    let totalIds = 0;
    const nsStart = Date.now();

    try {
      // ── Step 2: Clean up any previous partial shadow state ─────────────────
      await client.del(shadowKey).catch(() => undefined);

      // ── Step 3: Chunked DB read → pipelined SETBIT to shadow key ───────────
      let cursor: string | null = null;
      let pageCount = 0;

      do {
        const page = await spec.fetchPage(cursor, this.chunkSize);

        if (page.ids.length > 0) {
          await this.writeShadowChunk(shadowKey, page.ids);
          totalIds += page.ids.length;
        }

        cursor = page.nextCursor;
        pageCount++;

        this.logger.debug(
          `Bloom rebuild progress: ns=${spec.namespace} page=${pageCount} ids=${totalIds}`,
        );

        // ── Step 4: Inter-chunk delay ────────────────────────────────────────
        // Spread Redis pipeline write load across time. Prevents a sudden burst
        // of SETBIT commands saturating the Redis command queue.
        if (cursor !== null && this.interChunkDelayMs > 0) {
          await sleep(this.interChunkDelayMs);
        }
      } while (cursor !== null);

      // ── Step 5: Atomic shadow → live key swap ───────────────────────────────
      // If at least one bit was set, atomically replace the live key with the
      // freshly-built shadow key. RENAME is O(1) in Redis — there is no moment
      // where the live key is absent.
      //
      // If the namespace is empty (no entities), DEL the live key so that
      // mightExist() correctly returns false for all queries.
      const shadowExists = await client.exists(shadowKey).catch(() => 0);
      if (shadowExists && totalIds > 0) {
        await client.rename(shadowKey, liveKey);
      } else {
        // Empty namespace — clear the live filter to remove any stale bits
        await client.del(liveKey).catch(() => undefined);
      }

      // ── Step 6: Post-rebuild reconciliation ─────────────────────────────────
      // Entities created DURING the rebuild window would have had bloom.add()
      // called on the OLD live key. After the RENAME, those bits are gone.
      // We re-add them now to prevent a false-negative window.
      //
      // Reference-data namespaces (loc:*) skip this — they have no fetchSince.
      let reconciledCount = 0;
      if (spec.fetchSince) {
        const recentIds = await spec
          .fetchSince(rebuildStartedAt)
          .catch(() => []);
        if (recentIds.length > 0) {
          await this.writeChunkToKey(liveKey, recentIds);
          reconciledCount = recentIds.length;
        }
      }

      this.logger.log(
        `Bloom rebuild complete: ns=${spec.namespace} ids=${totalIds} ` +
          `reconciled=${reconciledCount} pages=${pageCount} ` +
          `elapsed=${Date.now() - nsStart}ms`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Bloom rebuild FAILED: ns=${spec.namespace} error="${message}" — old filter preserved.`,
      );
      // Clean up partial shadow to avoid confusion on next run
      await client.del(shadowKey).catch(() => undefined);
    } finally {
      // ── Step 7: Safe lock release via Lua CAS ─────────────────────────────
      // The Lua script is atomic: it only DELetes the lock key when the stored
      // value matches lockValue. Prevents accidentally releasing another node's
      // lock if this lock expired and was re-acquired during a long rebuild.
      await client
        .eval(RELEASE_LOCK_SCRIPT, 1, lockKey, lockValue)
        .catch((err: unknown) => {
          this.logger.warn(
            `Lock release failed for ns=${spec.namespace}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  /**
   * Write SETBIT commands for a batch of IDs to the shadow key using a pipeline.
   *
   * Each ID maps to BLOOM_K bit positions via MurmurHash3. All positions are set
   * in a single pipeline to minimise round trips. The pipeline is sent as one
   * command batch per chunk — Redis processes it atomically within the batch
   * but other commands can interleave between batches (acceptable for rebuilds).
   *
   * @param shadowKey - Destination Redis key (shadow bit array).
   * @param ids       - Batch of entity UUID strings to set in the filter.
   */
  private async writeShadowChunk(
    shadowKey: string,
    ids: string[],
  ): Promise<void> {
    await this.writeChunkToKey(shadowKey, ids);
  }

  /**
   * Write SETBIT commands for a batch of IDs to an arbitrary key using a pipeline.
   *
   * Extracted from `writeShadowChunk` so post-rebuild reconciliation can reuse
   * the same logic when writing to the live key.
   *
   * @param key - Redis key (live or shadow bit array).
   * @param ids - Batch of entity UUID strings to set.
   */
  private async writeChunkToKey(key: string, ids: string[]): Promise<void> {
    const client = this.redis.getClientSignedUrlCache();
    const pipeline = client.pipeline();
    for (const id of ids) {
      // bloomBits() returns BLOOM_K positions via MurmurHash3 seeds 0..K-1.
      // Must match the bit positions set by BloomFilterService.add() and .rebuild().
      for (const bit of bloomBits(id)) {
        pipeline.setbit(key, bit, 1);
      }
    }
    // Execute the pipeline. Errors are propagated to the caller for logging.
    const results = await pipeline.exec();
    if (results) {
      // Surface any individual SETBIT errors without crashing the whole chunk.
      for (const [err] of results) {
        if (err) {
          this.logger.warn(
            `SETBIT error in chunk for key=${key}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  }

  // ─── Public trigger (admin / test) ────────────────────────────────────────────

  /**
   * Manually trigger a full rebuild cycle outside of the cron schedule.
   *
   * Intended for use by admin endpoints, CI health checks, or tests. The same
   * distributed locking and atomic swap semantics apply.
   *
   * @returns Summary of namespaces rebuilt and total elapsed time.
   */
  async triggerRebuild(): Promise<{
    namespaces: string[];
    elapsedMs: number;
  }> {
    const start = Date.now();
    const namespaces = this.specs.map((s) => s.namespace);

    if (!this.enabled) {
      this.logger.debug('Manual Bloom rebuild skipped — disabled by config.');
      return { namespaces, elapsedMs: 0 };
    }

    this.logger.log('Manual Bloom rebuild cycle triggered.');
    for (const spec of this.specs) {
      await this.rebuildNamespace(spec);
    }
    const elapsed = Date.now() - start;
    this.logger.log(`Manual Bloom rebuild cycle complete in ${elapsed} ms.`);
    return { namespaces, elapsedMs: elapsed };
  }
}
