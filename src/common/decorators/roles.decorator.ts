/**
 * @fileoverview `@Roles()` — metadata decorator for role-based access control.
 *
 * Works in conjunction with `RolesGuard`, which reads the `ROLES_KEY` metadata
 * and compares it against the requesting user's role.
 *
 * @module common/decorators
 */
import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

/** Key used to store role metadata. */
export const ROLES_KEY = 'roles';

/**
 * Decorator that attaches an array of permitted roles to the route handler.
 *
 * @param roles - One or more UserRole values.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
