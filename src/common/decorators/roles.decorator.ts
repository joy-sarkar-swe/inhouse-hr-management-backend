/**
 * @fileoverview Roles decorator.
 *
 * Usage:
 *   @Roles('hr')               — HR only
 *   @Roles('employee')         — Employee only
 *   @Roles('hr', 'employee')   — Both roles allowed
 *
 * @module common/decorators
 */
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: ('hr' | 'employee')[]) =>
  SetMetadata(ROLES_KEY, roles);
