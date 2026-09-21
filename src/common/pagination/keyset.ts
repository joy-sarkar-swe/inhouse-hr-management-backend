/**
 * @fileoverview Keyset (cursor) pagination utilities.
 *
 * ── Why keyset over offset ────────────────────────────────────────────────────
 *
 * Offset pagination (`SKIP N LIMIT M`) costs O(N+M) at the database level —
 * page 1000 of a public product listing scans 20 000 rows even though the
 * client only consumes 20. For hot listing endpoints (public product search,
 * shop product page, order history) the cost dominates request latency above
 * a few thousand rows.
 *
 * Keyset pagination orders by a stable tuple and asks for rows strictly past
 * the last-seen key, so every page costs O(M) regardless of depth. The tuple
 * must be unique — pairing the natural sort column (`created_at`) with the
 * primary key (`id`) makes it so.
 *
 * ── Cursor encoding ───────────────────────────────────────────────────────────
 *
 * The cursor is the Base64URL-encoded JSON of `{ ts: ISO, id: UUID }`. It is
 * opaque to clients — only the server interprets it.
 *
 *   {"ts":"2026-05-19T10:11:12.000Z","id":"3f...-...-..."}
 *      ↓ Base64URL
 *   eyJ0cyI6IjIw...
 *
 * Tampered / malformed cursors are rejected with `BadRequestException` so we
 * never crash on bad input.
 *
 * @module common/pagination
 */
import { BadRequestException } from '@nestjs/common';

export interface KeysetCursor {
  /** ISO timestamp of the last-seen row (the secondary sort column). */
  ts: string;
  /** UUID of the last-seen row (tie-breaker for rows sharing `ts`). */
  id: string;
}

export interface KeysetPage<T> {
  data: T[];
  /** Opaque cursor pointing at the row AFTER the last returned row. Null on last page. */
  next_cursor: string | null;
  /**
   * Number of rows in this page. Total count is intentionally not provided —
   * computing it defeats the keyset performance win. Use a separate `count`
   * endpoint if a UI must show a global total.
   */
  count: number;
}

/**
 * Encode a `{ts, id}` pair into an opaque cursor string.
 */
export function encodeCursor(cursor: KeysetCursor): string {
  const json = JSON.stringify(cursor);
  return Buffer.from(json, 'utf8').toString('base64url');
}

/**
 * Decode an opaque cursor string into `{ts, id}`. Throws `BadRequestException`
 * on any decoding / shape error.
 */
export function decodeCursor(raw: string): KeysetCursor {
  let parsed: unknown;
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    parsed = JSON.parse(json);
  } catch {
    throw new BadRequestException('Invalid pagination cursor.');
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as Record<string, unknown>).ts !== 'string' ||
    typeof (parsed as Record<string, unknown>).id !== 'string'
  ) {
    throw new BadRequestException('Malformed pagination cursor.');
  }

  const ts = (parsed as Record<string, string>).ts;
  const id = (parsed as Record<string, string>).id;

  if (Number.isNaN(new Date(ts).getTime())) {
    throw new BadRequestException('Cursor timestamp is not parseable.');
  }

  return { ts, id };
}

/**
 * Bound an incoming `limit` to a safe value. Keyset pagination invites very
 * large pages; cap at a sensible default to protect the database.
 */
export function clampLimit(
  raw: number | undefined,
  fallback = 20,
  max = 100,
): number {
  if (!raw || !Number.isFinite(raw) || raw < 1) return fallback;
  return Math.min(Math.floor(raw), max);
}

/**
 * Build the next cursor from the last item of a fetched page, or return null
 * if the page is shorter than the requested limit (meaning we hit the end).
 *
 * The item must expose `created_at` (Date | string) and `id` (string).
 */
export function nextCursorFrom<
  T extends { id: string; created_at: Date | string },
>(rows: T[], limit: number): string | null {
  if (rows.length < limit) return null;
  const last = rows[rows.length - 1];
  const ts =
    typeof last.created_at === 'string'
      ? last.created_at
      : last.created_at.toISOString();
  return encodeCursor({ ts, id: last.id });
}
