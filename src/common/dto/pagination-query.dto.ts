/**
 * @fileoverview Shared pagination query DTO — extended by all list endpoints.
 *
 * ── Fixes applied ─────────────────────────────────────────────────────────────
 *
 *  1. page  → @Min(1) enforced (was accepting 0 or negative integers)
 *  2. limit → @Max(100) enforced (was unbounded — callers could request 9999 rows)
 *  3. limit → @Min(1) enforced (empty-page guard)
 *  4. Both fields use @Type(() => Number) so query-string strings are coerced
 *  5. Both fields default documented in Swagger
 *
 * All list-endpoint DTOs (products, shops, categories, notifications, admin)
 * extend this class so the fixes propagate automatically.
 *
 * @module common/dto
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Page number — 1-based. Defaults to 1.',
    minimum: 1,
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be an integer.' })
  @Min(1, { message: 'page must be at least 1.' })
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page. Min 1, max 100. Defaults to 20.',
    minimum: 1,
    maximum: 100,
    example: 20,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer.' })
  @Min(1, { message: 'limit must be at least 1.' })
  @Max(100, { message: 'limit cannot exceed 100.' })
  limit?: number = 20;
}
