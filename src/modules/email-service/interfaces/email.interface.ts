/**
 * @fileoverview Email job interface — BullMQ job payload for all email queues.
 *
 * Imported by both queue producers ({@link EmailService}) and consumers
 * ({@link EmailProcessor}, {@link AuthEmailProcessor}) to keep the wire
 * format in lock-step across both pipelines.
 *
 * @module email-service/interfaces
 */

/** Payload stored inside each BullMQ email job. */
export interface EmailJobData {
  /** One recipient address per job (bulk send creates one job per address). */
  to: string;
  /** Subject line of the email. */
  subject: string;
  /** Caller-supplied HTML body. */
  html?: string;
  /** Plain-text fallback body. */
  text?: string;
}
