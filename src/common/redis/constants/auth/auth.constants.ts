/**
 * @fileoverview Redis key-prefix constants.
 *
 * Centralises the key prefixes used across Redis services so that
 * naming conventions stay consistent and easy to audit.
 */

/** Key prefix used for storing JWT tokens in Redis. */
export const REDIS_TOKEN_PREFIX = 'auth:token:';
