/**
 * @fileoverview HealthController — REST endpoint for application liveness probes.
 *
 * Exposes a single `GET /api/health` route that returns process uptime,
 * memory usage, and a static `ok` status. Consumed by load balancers,
 * container orchestrators, and external uptime monitors.
 *
 * @module health
 */
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiSuccessResponse } from 'src/common/decorators/api-success-response.decorator';
import { HealthCheckSuccessDto } from './dto/success/health-success.dto';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Liveness check endpoint.
   *
   * Flow:
   *  1. Delegate to `HealthService.getHealth()`.
   *  2. Return process uptime, memory snapshot, and status string.
   *
   * @returns Health payload consumed by Swagger and uptime monitors.
   */
  @Get()
  @ApiOperation({
    summary: 'Liveness / health check',
    description:
      'Returns the application status, uptime (seconds), memory usage, and current timestamp. ' +
      'Used by load balancers and uptime monitors for liveness probes.',
  })
  @ApiSuccessResponse(HealthCheckSuccessDto, 200)
  check() {
    return this.healthService.getHealth();
  }
}
