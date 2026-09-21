/**
 * @fileoverview RBAC (Role-Based Access Control) Guard.
 *
 * Verifies that the authenticated user possesses at least one of the roles
 * required by the target route handler. Roles are declared via the
 * {@link Roles} decorator using the {@link ROLES_KEY} metadata key.
 *
 * Apply after {@link JwtAuthGuard} so that `request.user` is already
 * populated before role evaluation.
 *
 * @module auth-service/guards
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from 'src/common/decorators/roles.decorator';

const ROLE_NOT_FOUND = 'User role could not be determined';
const INSUFFICIENT_PERMISSIONS =
  'You do not have permission to perform this action';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  /**
   * Evaluates whether the current user's role satisfies the route's
   * required roles.
   *
   * - No `@Roles()` decorator → access granted (route is role-agnostic).
   * - User has no role attached → {@link ForbiddenException}.
   * - User's role not in required set → {@link ForbiddenException} that
   *   lists the required roles.
   */
  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const { user } = request;

    if (!user || !user.role) {
      throw new ForbiddenException(ROLE_NOT_FOUND);
    }

    const hasRole = requiredRoles.some((role) => user.role === role);

    if (!hasRole) {
      // Append required roles to the base message for developer clarity
      throw new ForbiddenException(
        `${INSUFFICIENT_PERMISSIONS}. Required: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}
