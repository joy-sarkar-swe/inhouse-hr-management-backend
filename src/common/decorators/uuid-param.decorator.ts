/**
 * @fileoverview `@UuidParam()` — composite route-parameter decorator.
 *
 * Combines `@Param(paramName)` + `ParseUUIDPipe({ version: '4' })` into a
 * single, zero-boilerplate decorator so every controller route that accepts a
 * UUID path segment is validated consistently.
 *
 * ── Before (old pattern — repeated 15+ times across controllers) ─────────────
 *
 *   import { Param, ParseUUIDPipe } from '@nestjs/common';
 *
 *   async myRoute(@Param('id', ParseUUIDPipe) id: string) { … }
 *
 * ── After (new pattern) ───────────────────────────────────────────────────────
 *
 *   import { UuidParam } from 'src/common/decorators/uuid-param.decorator';
 *
 *   async myRoute(@UuidParam('id') id: string) { … }
 *
 * ── Behaviour ─────────────────────────────────────────────────────────────────
 *
 *  - Validates that the path segment is a valid RFC 4122 UUID **version 4**.
 *  - Returns HTTP 400 with a standard NestJS error body if validation fails.
 *  - The pipe is applied at the framework level — the handler never receives
 *    an invalid value.
 *  - `paramName` defaults to `'id'` (the most common case).
 *
 * ── Usage examples ────────────────────────────────────────────────────────────
 *
 *   // Default param name 'id':
 *   @Get(':id')
 *   findOne(@UuidParam() id: string) { … }
 *
 *   // Custom param name:
 *   @Get('shops/:shopId/products')
 *   findByShop(@UuidParam('shopId') shopId: string) { … }
 *
 * @module common/decorators
 */
import { Param, ParseUUIDPipe } from '@nestjs/common';

/**
 * Extracts and validates a UUID v4 route parameter.
 *
 * @param paramName - The path segment name as declared in the `@Get/@Post/…`
 *                    route string. Defaults to `'id'`.
 */
export function UuidParam(paramName = 'id'): ParameterDecorator {
  return Param(paramName, new ParseUUIDPipe({ version: '4' }));
}
