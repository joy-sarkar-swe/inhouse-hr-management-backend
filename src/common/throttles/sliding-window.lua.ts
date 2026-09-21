/**
 * @fileoverview Shared Lua sliding-window rate-limit script.
 *
 * Atomically prunes expired entries from a Redis ZSET, adds a new
 * unique entry, sets TTL, and returns the current hit count.
 *
 * KEYS[1] = ZSET key (e.g. "throttle:foo:sw:<hash>")
 * ARGV[1] = now in milliseconds (epoch)
 * ARGV[2] = window size in milliseconds
 * ARGV[3] = unique member string (e.g. `${now}:${random}`)
 * ARGV[4] = TTL in seconds
 * Returns: integer — hit count within the current window.
 *
 * Both HTTP throttle guards (BaseThrottleGuard) and the WS throttle guard
 * (WsChatThrottleGuard) share this script so they remain in lock-step on
 * algorithm semantics — change the algorithm in ONE place.
 *
 * @module common/throttles/sliding-window.lua
 */
export const SLIDING_WINDOW_LUA = `
local key      = KEYS[1]
local now      = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local member   = ARGV[3]
local ttlSecs  = tonumber(ARGV[4])
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - windowMs)
redis.call('ZADD', key, now, member)
local count = redis.call('ZCARD', key)
redis.call('EXPIRE', key, ttlSecs)
return count
`.trim();
