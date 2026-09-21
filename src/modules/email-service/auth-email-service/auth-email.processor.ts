/**
 * @fileoverview Auth email processor worker.
 *
 * Consumes jobs from the {@link AUTH_EMAIL_QUEUE} BullMQ queue and delivers them
 * via Nodemailer SMTP. This worker is intentionally separate from the general
 * {@link EmailProcessor} so that:
 *
 *  - Auth emails are processed on their own Redis DB connection.
 *  - Concurrency can be tuned independently (currently `3` vs `5` for general).
 *  - A general-email SMTP failure cannot starve OTP delivery.
 *
 * Lifecycle:
 *  - Worker is created in {@link onModuleInit} and torn down gracefully in
 *    {@link onModuleDestroy} (drains in-flight jobs before exit).
 */
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { RedisClientService } from 'src/common/redis/redis.client';
import {
  AUTH_EMAIL_JOB,
  AUTH_EMAIL_MAX_ATTEMPTS,
  AUTH_EMAIL_QUEUE,
} from '../constants/email.constants';
import { EmailJobData } from '../interfaces/email.interface';
import { SmtpClient } from '../smtp.client';

/**
 * Background worker that handles delivery of authentication-critical emails
 * (OTP codes, account verification links, password reset notices).
 *
 * Registered as a NestJS provider in {@link EmailModule}.
 */
@Injectable()
export class AuthEmailProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthEmailProcessor.name);

  /** BullMQ worker instance — initialised in {@link onModuleInit}. */
  private worker!: Worker<EmailJobData>;

  /**
   * @param redisClientService - Provides the auth-email-specific Redis
   *   connection options used to instantiate the BullMQ worker.
   * @param smtpClient - Shared circuit-breaker-wrapped Nodemailer transporter.
   */
  constructor(
    private readonly redisClientService: RedisClientService,
    private readonly smtpClient: SmtpClient,
  ) {}

  /**
   * Creates the BullMQ worker and attaches event listeners for observability.
   *
   * Concurrency is set to `3` (lower than the general queue's `5`) so that a
   * burst of registration OTPs does not exhaust the SMTP connection pool.
   */
  onModuleInit(): void {
    this.worker = new Worker<EmailJobData>(
      AUTH_EMAIL_QUEUE,
      async (job: Job<EmailJobData>) => {
        if (job.name !== AUTH_EMAIL_JOB) return;

        this.logger.debug(
          `[Auth] Processing job #${job.id} → to: ${job.data.to}`,
        );

        await this.smtpClient.sendMail({
          to: job.data.to,
          subject: job.data.subject,
          html: job.data.html,
          text: job.data.text,
        });

        this.logger.log(
          `✅ [Auth] Email sent → ${job.data.to} | subject: "${job.data.subject}"`,
        );
      },
      {
        connection: this.redisClientService.getClientAuthEmailQueueOptions(),
        /**
         * Lower concurrency than the general queue — auth emails are
         * individually small and latency-sensitive, not throughput-sensitive.
         */
        concurrency: 3,
      },
    );

    // ── Retry / failure logging ────────────────────────────────────────────
    this.worker.on(
      'failed',
      (job: Job<EmailJobData> | undefined, err: Error) => {
        if (!job) return;

        const remaining = AUTH_EMAIL_MAX_ATTEMPTS - job.attemptsMade;

        if (job.attemptsMade < AUTH_EMAIL_MAX_ATTEMPTS) {
          this.logger.warn(
            `⚠️  [Auth] Job #${job.id} failed (attempt ${job.attemptsMade}/${AUTH_EMAIL_MAX_ATTEMPTS}). ` +
              `Retrying ${remaining} more time(s). Error: ${err.message}`,
          );
          return;
        }

        // All attempts exhausted — surface full context for ops investigation.
        this.logger.error(
          `❌ [Auth] Email permanently failed after ${AUTH_EMAIL_MAX_ATTEMPTS} attempts.\n` +
            `   Job ID  : ${job.id}\n` +
            `   To      : ${job.data.to}\n` +
            `   Subject : ${job.data.subject}\n` +
            `   Error   : ${err.message}\n` +
            `   Stack   : ${err.stack ?? 'n/a'}`,
        );
      },
    );

    // ── Completion logging ─────────────────────────────────────────────────
    this.worker.on('completed', (job: Job<EmailJobData>) => {
      this.logger.debug(`[Auth] Job #${job.id} completed.`);
    });

    this.logger.log('Auth email worker started.');
  }

  /**
   * Gracefully closes the BullMQ worker on module teardown.
   * BullMQ drains in-flight jobs before resolving so no OTP is silently lost.
   */
  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    this.logger.log('Auth email worker shut down.');
  }
}
