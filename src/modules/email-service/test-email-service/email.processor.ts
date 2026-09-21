/**
 * @fileoverview General email processor worker.
 *
 * BullMQ worker that consumes jobs from {@link EMAIL_QUEUE} and delivers them
 * via the shared {@link SmtpClient} (circuit-breaker-wrapped Nodemailer).
 *
 * Lifecycle:
 *  - Worker created in {@link onModuleInit}, torn down in {@link onModuleDestroy}.
 *  - Concurrency: 5 (higher than auth queue — general emails are not as latency-sensitive).
 *  - Retry/failure events logged with full context for ops investigation.
 *
 * @module email-service/test-email-service
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
  EMAIL_JOB,
  EMAIL_MAX_ATTEMPTS,
  EMAIL_QUEUE,
} from '../constants/email.constants';
import { EmailJobData } from '../interfaces/email.interface';
import { SmtpClient } from '../smtp.client';

/**
 * EmailProcessor is a background worker that handles the actual delivery of emails.
 * It listens to the email queue and processes jobs asynchronously.
 */
@Injectable()
export class EmailProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailProcessor.name);
  private worker!: Worker<EmailJobData>;

  constructor(
    private readonly redisClientService: RedisClientService,
    private readonly smtpClient: SmtpClient,
  ) {}

  /**
   * Create the BullMQ worker and attach observability event listeners.
   *
   * Flow:
   *  1. Instantiate a `Worker` bound to {@link EMAIL_QUEUE} with concurrency 5.
   *  2. In the worker handler, call `SmtpClient.sendMail` with the job payload.
   *  3. Attach `failed` handler — logs retries or permanent failure with full context.
   *  4. Attach `completed` handler — debug-logs successful job completion.
   */
  onModuleInit(): void {
    this.worker = new Worker<EmailJobData>(
      EMAIL_QUEUE,
      async (job: Job<EmailJobData>) => {
        if (job.name !== EMAIL_JOB) return;

        this.logger.debug(`Processing job #${job.id} → to: ${job.data.to}`);

        await this.smtpClient.sendMail({
          to: job.data.to,
          subject: job.data.subject,
          html: job.data.html,
          text: job.data.text,
        });

        this.logger.log(
          `✅ Email sent → ${job.data.to} | subject: "${job.data.subject}"`,
        );
      },
      {
        connection: this.redisClientService.getClientEmailQueueOptions(),
        concurrency: 5,
      },
    );

    // ── Retry progress ──────────────────────────────────────────────────────
    this.worker.on(
      'failed',
      (job: Job<EmailJobData> | undefined, err: Error) => {
        if (!job) return;

        const remaining = EMAIL_MAX_ATTEMPTS - job.attemptsMade;

        if (job.attemptsMade < EMAIL_MAX_ATTEMPTS) {
          this.logger.warn(
            `⚠️  Job #${job.id} failed (attempt ${job.attemptsMade}/${EMAIL_MAX_ATTEMPTS}). ` +
              `Retrying ${remaining} more time(s). Error: ${err.message}`,
          );
          return;
        }

        // All attempts exhausted — log the full details for ops investigation
        this.logger.error(
          `❌ Email permanently failed after ${EMAIL_MAX_ATTEMPTS} attempts.\n` +
            `   Job ID  : ${job.id}\n` +
            `   To      : ${job.data.to}\n` +
            `   Subject : ${job.data.subject}\n` +
            `   Error   : ${err.message}\n` +
            `   Stack   : ${err.stack ?? 'n/a'}`,
        );
      },
    );

    // ── Completion ──────────────────────────────────────────────────────────
    this.worker.on('completed', (job: Job<Job<EmailJobData>['data']>) => {
      this.logger.debug(`Job #${job.id} completed.`);
    });

    this.logger.log('Email worker started.');
  }

  /**
   * Gracefully close the BullMQ worker on module teardown.
   * BullMQ drains in-flight jobs before resolving so no email is silently lost.
   */
  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    this.logger.log('Email worker shut down.');
  }
}
