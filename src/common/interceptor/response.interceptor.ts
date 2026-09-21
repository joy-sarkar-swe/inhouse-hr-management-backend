/**
 * @fileoverview Global response interceptor for the NestJS application.
 * Intercepts all outgoing responses to ensure they conform to a standardized
 * ServiceResponse envelope format, providing consistency across all API endpoints.
 */
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ServiceResponse } from 'src/shared/interfaces/response.interface';

/**
 * Global interceptor to wrap all API responses in a consistent ServiceResponse format.
 *
 * This interceptor checks if the response is already a ServiceResponse. If it is, it returns it as-is.
 * If not, it wraps the response data in a new ServiceResponse object, extracting message and payload intelligently.
 * It also ensures that the HTTP status code is correctly set based on the response data or defaults to 200.
 * The interceptor adds metadata such as the HTTP method, endpoint, and timestamp to the response envelope.
 * The root API path (/api) is excluded from wrapping to allow for a simple health check or welcome message.
 * This interceptor promotes a consistent API response structure, making it easier for clients to handle responses uniformly.
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<ServiceResponse> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const res = context.switchToHttp().getResponse<FastifyReply>();

    const method = req.method;
    const url = req.url || '';

    // Skip wrapping for root API path
    if (url === '/api' || url === '/api/') {
      return next.handle() as Observable<ServiceResponse>;
    }

    return next.handle().pipe(
      map((data: unknown): ServiceResponse => {
        // Already full ServiceResponse → return as-is (including success: false cases)
        if (this.isServiceResponse(data)) {
          const typed = data;

          if (typeof typed.statusCode !== 'number') {
            typed.statusCode = res.statusCode ?? 200;
          }

          return typed;
        }

        //  Determine status code
        let statusCode = res.statusCode ?? 200;

        if (
          data &&
          typeof data === 'object' &&
          data !== null &&
          'statusCode' in data &&
          typeof (data as any).statusCode === 'number'
        ) {
          statusCode = (data as { statusCode: number }).statusCode;
        }

        if (res.statusCode !== statusCode) {
          void res.code(statusCode);
        }

        //  Extract message & payload intelligently
        let message = 'Request successful';
        let payload: unknown = data;

        if (data && typeof data === 'object' && data !== null) {
          const obj = data as Record<string, unknown>;

          // Case: { message: "...", data: {...} } → business response
          if ('message' in obj && typeof obj.message === 'string') {
            message = obj.message;

            if ('data' in obj) {
              payload = obj.data;
            } else {
              // Case: only { message: "..." } → no real payload
              payload = null;
            }
          }
          // Case: plain object without message → use it as payload
          else if (Object.keys(obj).length > 0) {
            payload = obj;
          }
        }

        // Build final standardized response
        return {
          success: statusCode >= 200 && statusCode < 300,
          message,
          method,
          endpoint: url,
          statusCode,
          timestamp: new Date().toISOString(),
          data: payload,
        };
      }),
    );
  }

  private isServiceResponse(value: unknown): value is ServiceResponse {
    return (
      value != null &&
      typeof value === 'object' &&
      'success' in value &&
      'timestamp' in value &&
      'statusCode' in value
    );
  }
}
