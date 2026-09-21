/**
 * @fileoverview DockerLifecycleService — manages dev docker container lifecycle automatically.
 *
 * In local development (NODE_ENV !== 'production'):
 * - On startup (OnModuleInit): Starts dev containers (PostgreSQL, Redis) if they are stopped.
 * - On shutdown (OnApplicationShutdown): Stops dev containers on SIGINT / SIGTERM / Ctrl+C.
 *
 * @module common/lifecycle
 */
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnApplicationShutdown,
} from '@nestjs/common';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import config from 'src/shared/config/app.config';

const execAsync = promisify(exec);

@Injectable()
export class DockerLifecycleService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(DockerLifecycleService.name);

  async onModuleInit(): Promise<void> {
    if (config.NODE_ENV === 'production') {
      return;
    }

    try {
      this.logger.log(
        'Checking dev docker infrastructure (PostgreSQL & Redis)...',
      );
      await execAsync(
        'docker compose -f dev.docker-compose.yml up -d postgres redis',
      );
      this.logger.log('✅ Dev docker infrastructure is active and running.');
    } catch (err) {
      this.logger.warn(
        `Failed to start dev docker containers automatically: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    if (config.NODE_ENV === 'production') {
      return;
    }

    // Wait 500ms to allow active Redis and PostgreSQL connections to close cleanly
    await new Promise((resolve) => setTimeout(resolve, 500));

    try {
      this.logger.log(
        `Stopping dev docker containers on signal=${signal ?? 'unknown'}...`,
      );
      await execAsync('docker compose -f dev.docker-compose.yml stop');
      this.logger.log('Dev docker containers stopped successfully.');
    } catch (err) {
      this.logger.debug(
        `Docker compose stop skipped or failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
