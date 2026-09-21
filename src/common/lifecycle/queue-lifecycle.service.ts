/**
 * @fileoverview QueueLifecycleService — graceful BullMQ teardown on SIGTERM/SIGINT.
 *
 * BullMQ `Queue` instances open Redis connections eagerly and DO NOT participate
 * in NestJS's per-module lifecycle when registered via plain `useFactory`
 * providers (the producers in this codebase are registered that way). On hot
 * reload during development that is harmless, but on production SIGTERM it
 * causes ECONNRESET storms in Redis and 1-2s delays before the process exits.
 *
 * This service collects every Queue producer by its DI token and calls
 * `queue.close()` on `onApplicationShutdown()`. Pair with
 * `app.enableShutdownHooks()` in main.ts so `OnApplicationShutdown` actually
 * fires.
 *
 * Adding a new BullMQ queue producer? Inject its token here too.
 *
 * @module common/lifecycle
 */
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  AUTH_EMAIL_QUEUE,
  EMAIL_QUEUE,
} from 'src/modules/email-service/constants/email.constants';

@Injectable()
export class QueueLifecycleService implements OnApplicationShutdown {
  private readonly logger = new Logger(QueueLifecycleService.name);

  /**
   * Register every BullMQ producer queue here. The constructor uses string
   * tokens, so the providers must already exist in their respective modules.
   */
  constructor(
    @Inject(EMAIL_QUEUE)
    private readonly emailQueue: Queue,
    @Inject(AUTH_EMAIL_QUEUE)
    private readonly authEmailQueue: Queue,
  ) {}

  async onApplicationShutdown(signal?: string): Promise<void> {
    const queues: Array<{ name: string; queue: Queue }> = [
      { name: EMAIL_QUEUE, queue: this.emailQueue },
      { name: AUTH_EMAIL_QUEUE, queue: this.authEmailQueue },
    ];

    this.logger.log(
      `Closing ${queues.length} BullMQ producer queue(s) on signal=${signal ?? 'unknown'}`,
    );

    await Promise.allSettled(
      queues.map(async ({ name, queue }) => {
        try {
          await queue.close();
          this.logger.debug(`Queue closed: ${name}`);
        } catch (err) {
          this.logger.warn(
            `Queue close failed for ${name}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }),
    );

    this.logger.log('All BullMQ producer queues closed.');
  }
}
