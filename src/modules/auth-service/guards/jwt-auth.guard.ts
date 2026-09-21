/**
 * @fileoverview JWT Authentication Guard.
 *
 * Intercepts every request on a JWT-protected route and performs a two-step
 * token resolution before delegating to Passport:
 *
 *  1. Extracts the Redis key (`userId:deviceId`) from `Authorization: Bearer`.
 *  2. Fetches the real signed JWT from Redis (validates the session is active).
 *  3. Swaps the header value so the upstream `passport-jwt` strategy receives
 *     the actual JWT for signature / expiry verification.
 *
 * @module auth-service/guards
 */
import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RedisTokenService } from 'src/common/redis/redis-service/auth/redis-token.service';

const AUTH_HEADER_MISSING = 'Authorization header is missing or malformed';
const INVALID_TOKEN = 'Invalid or expired token';
const SESSION_EXPIRED = 'Session expired. Please log in again.';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly redisTokenService: RedisTokenService) {
    super();
  }

  /**
   * Resolves the Redis-backed token, swaps the Authorization header for the
   * real JWT, and delegates to the Passport `jwt` strategy.
   *
   * Throws an {@link UnauthorizedException} when:
   *  - The `Authorization` header is missing or malformed.
   *  - The Redis key does not resolve to a stored token (session expired or
   *    explicitly logged out).
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const authHeader: string = request.headers.authorization ?? '';

    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(AUTH_HEADER_MISSING);
    }

    const redisKey = authHeader.split(' ')[1];

    // Reject refresh tokens presented as access tokens to prevent token-type confusion.
    if (redisKey.startsWith('refresh:')) {
      throw new UnauthorizedException(INVALID_TOKEN);
    }

    const realJwt = await this.redisTokenService.getToken(redisKey);

    if (!realJwt) {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }

    // Swap out the Redis key for the real JWT so Passport can verify it
    request.headers.authorization = `Bearer ${realJwt}`;
    // Preserve original key so AuthController.logout can delete it
    request['redisKey'] = redisKey;

    return super.canActivate(context) as Promise<boolean>;
  }

  /**
   * Override Passport's default error handling so strategy validation
   * failures (e.g. JWT signature mismatch) also throw a consistent 401.
   */
  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser,
    _info: unknown,
    _context: ExecutionContext,
  ): TUser {
    if (err || !user) {
      throw new UnauthorizedException(INVALID_TOKEN);
    }
    return user;
  }
}
