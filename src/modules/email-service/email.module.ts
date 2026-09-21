/**
 * @fileoverview Email module definition.
 *
 * Registers two independent BullMQ queues and their respective workers:
 *
 * | Queue                  | Worker                  | Redis DB                     | Purpose                         |
 * |------------------------|-------------------------|------------------------------|---------------------------------|
 * | `email-queue`          | `EmailProcessor`        | `REDIS_DB_EMAIL_QUEUE`       | General transactional emails    |
 * | `auth-email-queue`     | `AuthEmailProcessor`    | `REDIS_DB_AUTH_EMAIL_QUEUE`  | OTP / security-critical emails  |
 *
 * Import this module in any feature module that needs to send emails.
 * Inject {@link EmailService} and call the appropriate method:
 *  - `sendEmail()`     → general queue
 *  - `sendAuthEmail()` → auth/OTP queue
 *
 * All SMTP transmission happens in background workers — API responses are
 * never blocked by email delivery.
 */
import { Module } from '@nestjs/common';
import { AuthEmailProcessor } from './auth-email-service/auth-email.processor';
import { AuthEmailQueueProvider } from './auth-email-service/auth-email.queue';
import { AUTH_EMAIL_QUEUE, EMAIL_QUEUE } from './constants/email.constants';
import { EmailService } from './email.service';
import { SmtpClient } from './smtp.client';
import { EmailProcessor } from './test-email-service/email.processor';
import { EmailQueueProvider } from './test-email-service/email.queue';

/**
 * Shared email module.
 *
 * Exports {@link EmailService} so that any importing module can enqueue
 * emails without knowing the underlying queue infrastructure.
 * Exports {@link SmtpClient} directly too, in case a future processor needs
 * the shared circuit-breaker-wrapped transporter without going through the
 * queue abstraction.
 */
@Module({
  providers: [
    // ── Shared low-level SMTP client (circuit-breaker-wrapped) ────────────
    SmtpClient,

    // ── General email pipeline ────────────────────────────────────────────
    EmailQueueProvider,
    EmailProcessor,

    // ── Auth / OTP email pipeline ─────────────────────────────────────────
    AuthEmailQueueProvider,
    AuthEmailProcessor,

    // ── Shared facade ─────────────────────────────────────────────────────
    EmailService,
  ],
  exports: [
    EmailService,
    SmtpClient,
    // Queue tokens exported so AppModule's QueueLifecycleService can close
    // them on SIGTERM/SIGINT.
    EMAIL_QUEUE,
    AUTH_EMAIL_QUEUE,
  ],
})
export class EmailModule {}
