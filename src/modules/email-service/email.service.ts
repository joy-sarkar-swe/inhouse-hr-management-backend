/**
 * @fileoverview Email service — queue facade for both general and auth email delivery.
 *
 * Two BullMQ queues are exposed through this single service so callers never
 * need to import queue tokens or job constants directly:
 *
 *  - {@link sendEmail}     → General-purpose emails (marketing, notifications).
 *                            Routed to {@link EMAIL_QUEUE}.
 *  - {@link sendAuthEmail} → Security-critical emails (OTP, verification).
 *                            Routed to {@link AUTH_EMAIL_QUEUE} on a dedicated
 *                            Redis DB, processed by a separate worker.
 *  - {@link sendBulkEmail} → Fan-out helper over {@link sendEmail}.
 *
 * All methods return immediately — SMTP delivery is fully asynchronous.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  AUTH_EMAIL_JOB,
  AUTH_EMAIL_MAX_ATTEMPTS,
  AUTH_EMAIL_QUEUE,
  EMAIL_JOB,
  EMAIL_MAX_ATTEMPTS,
  EMAIL_QUEUE,
} from './constants/email.constants';
import { SendEmailDto } from './dto/send-email.dto';
import { EmailJobData } from './interfaces/email.interface';

// ─── Shared job option builders ───────────────────────────────────────────────

/**
 * BullMQ job options applied to every general email job.
 * Failed jobs are retained (`removeOnFail: false`) so ops can inspect them in
 * the BullMQ dashboard without needing to reproduce the failure.
 */
const GENERAL_JOB_OPTIONS = {
  attempts: EMAIL_MAX_ATTEMPTS,
  backoff: { type: 'exponential' as const, delay: 3_000 },
  removeOnComplete: true,
  removeOnFail: false,
};

/**
 * BullMQ job options applied to every auth/OTP email job.
 * Identical retry policy to general emails; tune this independently if
 * security SLAs require faster retries or fewer total attempts.
 */
const AUTH_JOB_OPTIONS = {
  attempts: AUTH_EMAIL_MAX_ATTEMPTS,
  backoff: { type: 'exponential' as const, delay: 3_000 },
  removeOnComplete: true,
  removeOnFail: false,
};

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Facade over the two email BullMQ queues.
 *
 * Inject this service wherever emails need to be sent; choose the correct
 * method based on the sensitivity of the message.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  /**
   * @param emailQueue     - General-purpose email queue (injection token: {@link EMAIL_QUEUE}).
   * @param authEmailQueue - Auth/OTP email queue (injection token: {@link AUTH_EMAIL_QUEUE}).
   */
  constructor(
    @Inject(EMAIL_QUEUE)
    private readonly emailQueue: Queue<EmailJobData>,

    @Inject(AUTH_EMAIL_QUEUE)
    private readonly authEmailQueue: Queue<EmailJobData>,
  ) {}

  // ── General email ──────────────────────────────────────────────────────────

  /**
   * Enqueues a single email (or fans out one job per recipient when `to` is an
   * array) onto the **general** email queue.
   *
   * Use this for non-critical transactional emails (welcome messages, receipts,
   * marketing). For OTP and account-security emails use {@link sendAuthEmail}.
   *
   * @param dto - Email payload including recipient(s), subject, and body.
   * @returns The number of jobs enqueued and a human-readable status message.
   */
  async sendEmail(
    dto: SendEmailDto,
  ): Promise<{ queued: number; message: string }> {
    const recipients = Array.isArray(dto.to) ? dto.to : [dto.to];

    await Promise.all(
      recipients.map((email) =>
        this.emailQueue.add(
          EMAIL_JOB,
          { to: email, subject: dto.subject, html: dto.html, text: dto.text },
          GENERAL_JOB_OPTIONS,
        ),
      ),
    );

    this.logger.log(
      `Queued ${recipients.length} general email job(s) → subject: "${dto.subject}"`,
    );

    return {
      queued: recipients.length,
      message: 'Email(s) queued successfully',
    };
  }

  // ── Auth / OTP email ───────────────────────────────────────────────────────

  /**
   * Enqueues a single email onto the **auth** queue, which is backed by a
   * dedicated Redis DB and processed by {@link AuthEmailProcessor}.
   *
   * Use this for all security-sensitive messages:
   *  - Account verification OTP
   *  - Password reset OTP
   *  - Resend verification OTP
   *
   * The isolation guarantees that a general-email backlog or SMTP slowness
   * cannot delay time-critical OTP delivery.
   *
   * @param dto - Email payload. `to` must be a single address for auth emails
   *              (one OTP per recipient, no fan-out).
   * @returns The number of jobs enqueued (always `1`) and a status message.
   */
  async sendAuthEmail(
    dto: SendEmailDto,
  ): Promise<{ queued: number; message: string }> {
    const recipient = Array.isArray(dto.to) ? dto.to[0] : dto.to;

    await this.authEmailQueue.add(
      AUTH_EMAIL_JOB,
      {
        to: recipient,
        subject: dto.subject,
        html: dto.html,
        text: dto.text,
      },
      AUTH_JOB_OPTIONS,
    );

    this.logger.log(
      `Queued auth email job → to: ${recipient} | subject: "${dto.subject}"`,
    );

    return { queued: 1, message: 'Auth email queued successfully' };
  }

  // ── Bulk general email ─────────────────────────────────────────────────────

  /**
   * Enqueues multiple independent general emails in a single call.
   * Each DTO may target a single address or an array of addresses.
   *
   * @param dtos - Array of email payloads to enqueue.
   * @returns Total number of jobs enqueued and a status message.
   */
  async sendBulkEmail(
    dtos: SendEmailDto[],
  ): Promise<{ queued: number; message: string }> {
    let total = 0;

    await Promise.all(
      dtos.map(async (dto) => {
        const result = await this.sendEmail(dto);
        total += result.queued;
      }),
    );

    this.logger.log(`Bulk send complete — total jobs queued: ${total}`);

    return { queued: total, message: 'Bulk emails queued successfully' };
  }
}
