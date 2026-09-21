/**
 * @fileoverview Low-level SMTP client.
 *
 * Centralises the Nodemailer transporter and wraps every `sendMail` call in a
 * shared circuit breaker. Both email processors (auth, general) inject this
 * client instead of creating their own transporter — so a degraded SMTP
 * provider trips a single breaker that fast-fails subsequent jobs across
 * both queues instead of each worker retrying independently into a black hole.
 */
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter, SendMailOptions, SentMessageInfo } from 'nodemailer';
import {
  CircuitBreakerFactory,
  ManagedCircuitBreaker,
} from 'src/common/resilience';
import config from 'src/shared/config/app.config';

@Injectable()
export class SmtpClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SmtpClient.name);

  private readonly transporter: Transporter = nodemailer.createTransport({
    host: config.MAIL_HOST,
    port: config.MAIL_PORT,
    auth: { user: config.MAIL_USER, pass: config.MAIL_PASS },
  });

  /**
   * Circuit breaker over `transporter.sendMail`. Prevents queue workers from
   * piling up SMTP retries when the provider is degraded — the breaker opens
   * after sustained failure, fast-fails subsequent jobs, and probes for
   * recovery automatically (see CB_* env vars).
   */
  private breaker!: ManagedCircuitBreaker;

  constructor(private readonly breakerFactory: CircuitBreakerFactory) {}

  /** Register the `smtp` circuit breaker. */
  onModuleInit(): void {
    this.breaker = this.breakerFactory.create({ name: 'smtp' });
  }

  /** Close the Nodemailer transporter on module teardown. */
  async onModuleDestroy(): Promise<void> {
    // Nodemailer close is synchronous + idempotent.
    this.transporter.close();
  }

  /**
   * Send an email through the shared transporter, gated by the circuit breaker.
   * Throws on failure in production, logs & provides dev fallback in non-prod.
   *
   * @param options - Nodemailer send-mail options (to, subject, html, text, …).
   * @returns Nodemailer `SentMessageInfo` on success.
   */
  async sendMail(options: SendMailOptions): Promise<SentMessageInfo> {
    const isPlaceholderPass =
      !config.MAIL_PASS ||
      config.MAIL_PASS === 'your_email_app_password' ||
      config.MAIL_USER?.includes('example.com');

    const toStr = typeof options.to === 'string' ? options.to : JSON.stringify(options.to);
    const contentStr = typeof options.text === 'string' ? options.text : (typeof options.html === 'string' ? options.html : JSON.stringify(options.html));

    if (isPlaceholderPass) {
      this.logger.warn(
        `\n============================== [DEV EMAIL / OTP NOTICE] ==============================\n` +
          `TO      : ${toStr}\n` +
          `SUBJECT : ${String(options.subject ?? '')}\n` +
          `CONTENT : ${contentStr}\n` +
          `======================================================================================`,
      );
      return { messageId: `dev-mock-${Date.now()}` } as SentMessageInfo;
    }

    try {
      const info = (await this.breaker.fire(() =>
        this.transporter.sendMail({
          from: `"${config.MAIL_FROM_NAME}" <${config.MAIL_FROM_EMAIL}>`,
          ...options,
        }),
      )) as SentMessageInfo;
      this.logger.log(`Email successfully sent via SMTP to ${toStr}`);
      return info;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `\n============================== [SMTP FAILSAFE LOG] ==============================\n` +
          `TO      : ${toStr}\n` +
          `SUBJECT : ${String(options.subject ?? '')}\n` +
          `CONTENT : ${contentStr}\n` +
          `ERROR   : ${errMsg}\n` +
          `==================================================================================`,
      );
      if (process.env.NODE_ENV !== 'production') {
        return { messageId: `dev-failsafe-${Date.now()}` } as SentMessageInfo;
      }
      throw err;
    }
  }
}
