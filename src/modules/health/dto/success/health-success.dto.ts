/**
 * @fileoverview Swagger success-response DTO for the health-check endpoint.
 * @module health/dto/success
 */
import { ApiProperty } from '@nestjs/swagger';
import { SuccessResponseDto } from 'src/common/dto/success-response.dto';
import { Methods } from 'src/common/enum/methods.enum';

export class HealthMemoryDataDto {
  @ApiProperty({ example: 12345678 }) rss!: number;
  @ApiProperty({ example: 9876543 }) heapTotal!: number;
  @ApiProperty({ example: 6543210 }) heapUsed!: number;
  @ApiProperty({ example: 1234567 }) external!: number;
  @ApiProperty({ example: 12345 }) arrayBuffers!: number;
}

export class HealthDataDto {
  @ApiProperty({ example: 'ok' }) status!: string;
  @ApiProperty({ example: 12345.67, description: 'Process uptime in seconds' })
  uptime!: number;
  @ApiProperty({ type: HealthMemoryDataDto }) memory!: HealthMemoryDataDto;
  @ApiProperty({ example: '2026-05-21T10:00:00.000Z' }) timestamp!: string;
}

export class HealthCheckSuccessDto extends SuccessResponseDto<HealthDataDto> {
  @ApiProperty({ example: 'Service is healthy.' }) declare message: string;
  @ApiProperty({ example: Methods.GET, enum: Methods })
  declare method: Methods.GET;
  @ApiProperty({ example: '/api/health' }) declare endpoint: string;
  @ApiProperty({ example: 200 }) declare statusCode: number;
  @ApiProperty({
    type: HealthDataDto,
    example: {
      status: 'ok',
      uptime: 12345.67,
      memory: {
        rss: 12345678,
        heapTotal: 9876543,
        heapUsed: 6543210,
        external: 1234567,
        arrayBuffers: 12345,
      },
      timestamp: '2026-05-21T10:00:00.000Z',
    },
  })
  declare data: HealthDataDto;
}
