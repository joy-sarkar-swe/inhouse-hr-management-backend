/**
 * @fileoverview JWT Passport strategy.
 *
 * Validates the Bearer token from the Authorization header.
 *
 * Token flow:
 *  1. Client sends `Authorization: Bearer <userId:sessionId>` (Redis key).
 *  2. JwtAuthGuard intercepts and calls this strategy.
 *  3. Strategy resolves the Redis key → actual JWT → validates signature.
 *  4. Decoded payload is attached to request.user as AuthUser.
 *
 * Note: The `sub` field maps to User.id (UUID) from PostgreSQL.
 *       `name` maps to User.name (was `fullName` in the Mongoose schema).
 *
 * @module auth-service/strategies
 */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { RedisTokenService } from 'src/common/redis/redis-service/auth/redis-token.service';
import config from 'src/shared/config/app.config';
import type { AuthUser } from 'src/shared/interfaces/auth-user.interface';

const SESSION_EXPIRED = 'Session expired. Please log in again.';

/**
 * Custom extractor: reads the Redis key from the Bearer header,
 * fetches the actual JWT from Redis, then returns it for passport-jwt
 * to validate against the secret.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly redisTokenService: RedisTokenService) {
    super({
      // Extract the raw Bearer value (which is the Redis key userId:deviceId)
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.JWT_SECRET,
      passReqToCallback: true,
    });
  }

  /**
   * Called after passport-jwt validates the JWT signature.
   * The `payload` is the decoded JWT claims.
   *
   * We additionally verify the token still exists in Redis to support
   * server-side logout (token invalidation without JWT expiry).
   *
   * @param req  - Raw Fastify request (for extracting the Redis key).
   * @param payload - Decoded JWT payload.
   */
  async validate(req: any, payload: any): Promise<AuthUser> {
    // The original Redis key (userId:sessionId) was attached to the request
    // by JwtAuthGuard before it swapped the header for the real JWT.
    const tokenKey = req['redisKey'];

    // Verify the session still exists in Redis (guards against logout bypass)
    const storedToken = await this.redisTokenService.getToken(tokenKey);
    if (!storedToken) {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }

    return {
      id: payload.sub,
      name: payload.name,
      email: payload.email,
      role: payload.role,
    };
  }
}
