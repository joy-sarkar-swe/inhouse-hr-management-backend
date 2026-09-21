/**
 * @fileoverview HealthService — provides runtime health metrics for liveness probes.
 *
 * Returns process uptime, heap usage, and a static status string so load
 * balancers and uptime monitors can verify the Node process is alive.
 *
 * @module health
 */
import { Injectable } from '@nestjs/common';

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class HealthService {
  /**
   * Return a snapshot of the application's runtime health.
   *
   * Flow:
   *  1. Read `process.uptime()` for how long the server has been running.
   *  2. Read `process.memoryUsage()` for heap and RSS metrics.
   *  3. Return a structured payload consumed by the health controller.
   *
   * @returns Object containing `status`, `uptime` (seconds), and `memory` usage.
   */
  getHealth() {
    return {
      message: 'Application is healthy',
      data: {
        status: 'ok',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      },
    };
  }
}
