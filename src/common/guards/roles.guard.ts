/**
 * @fileoverview Roles guard.
 *
 * Works together with @Roles() decorator and JwtAuthGuard.
 * Must be applied AFTER JwtAuthGuard so request.user is populated.
 *
 * Behavior:
 *  - If no @Roles() metadata → allows all authenticated users.
 *  - If @Roles() metadata present → checks request.user.role.
 *  - Throws 403 Forbidden if role doesn't match.
 *
 * @module common/guards
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from 'src/common/decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<('hr' | 'employee')[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @Roles() decorator → allow any authenticated user
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.role) {
      throw new ForbiddenException('Access denied.');
    }

    const hasRole = requiredRoles.includes(user.role as 'hr' | 'employee');
    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied. Required role: ${requiredRoles.join(' or ')}.`,
      );
    }

    return true;
  }
}
