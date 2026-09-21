/**
 * @fileoverview Constants for the email module.
 *
 * Two separate BullMQ queues are maintained to ensure auth-critical emails
 * (OTPs, account verification) are never delayed by a backlog of general
 * marketing or notification emails:
 *
 *  - `EMAIL_QUEUE`      → General-purpose transactional emails.
 *  - `AUTH_EMAIL_QUEUE` → High-priority auth & OTP emails (separate Redis DB,
 *                         dedicated worker, lower concurrency for isolation).
 */

// ─── General email queue ──────────────────────────────────────────────────────

/**
 * BullMQ queue name for general-purpose email delivery.
 * Backed by `REDIS_DB_EMAIL_QUEUE`.
 */
export const EMAIL_QUEUE = 'email-queue';

/**
 * BullMQ job name used inside {@link EMAIL_QUEUE}.
 */
export const EMAIL_JOB = 'send-email';

/**
 * Maximum delivery attempts for a general email job before it is
 * marked permanently failed and retained for ops investigation.
 */
export const EMAIL_MAX_ATTEMPTS = 5;

// ─── Auth / OTP email queue ───────────────────────────────────────────────────

/**
 * BullMQ queue name for authentication-critical emails (OTP, verification).
 * Backed by a **dedicated** Redis DB (`REDIS_DB_AUTH_EMAIL_QUEUE`) so that
 * general email backlog can never delay security-sensitive messages.
 */
export const AUTH_EMAIL_QUEUE = 'auth-email-queue';

/**
 * BullMQ job name used inside {@link AUTH_EMAIL_QUEUE}.
 */
export const AUTH_EMAIL_JOB = 'send-auth-email';

/**
 * Maximum delivery attempts for an auth email job.
 * Kept equal to the general queue; tune independently if SLAs differ.
 */
export const AUTH_EMAIL_MAX_ATTEMPTS = 5;
