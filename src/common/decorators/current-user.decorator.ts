/**
 * @fileoverview `@CurrentUser()` — authenticated-user parameter decorator.
 *
 * Injects the `AuthUser` object attached to the request by `JwtAuthGuard`
 * (or the Fastify Passport strategy). Every protected route handler uses this
 * instead of reading `req.user` directly.
 *
 * @module common/decorators
 */
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extracts `request.user` from the current execution context.
 *
 * Populated by the JWT strategy after a successful token validation.
 * Undefined on unauthenticated routes — only use on `@UseGuards(JwtAuthGuard)` handlers.
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
