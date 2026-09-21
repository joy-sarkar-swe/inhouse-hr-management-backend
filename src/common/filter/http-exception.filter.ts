/**
 * @fileoverview Global HTTP exception filter.
 *
 * Catches every exception thrown within the application context and formats it
 * into the standard error envelope:
 * ```json
 * {
 *   "success": false,
 *   "message": "...",
 *   "method": "POST",
 *   "endpoint": "/api/auth/register",
 *   "statusCode": 400,
 *   "timestamp": "...",
 *   "errors": [{ "field": "...", "message": "..." }]
 * }
 * ```
 *
 * Business exceptions (from AuthService, etc.) and validation errors (from
 * {@link ValidationPipe}) already carry a human-readable message — passed
 * through unchanged. Infrastructure messages (path not found, internal
 * server error) fall back to the constants below.
 */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

const PATH_NOT_FOUND = 'Path not found';
const INTERNAL_SERVER_ERROR = 'Internal server error';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string = INTERNAL_SERVER_ERROR;
    let errors: { field: string; message: string }[] | undefined;
    let error: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'string') {
        // Route-not-found produces "Cannot GET /path"
        message = body.startsWith('Cannot ') ? PATH_NOT_FOUND : body;
        error = message;
      } else if (body && typeof body === 'object') {
        const obj = body as Record<string, unknown>;

        const rawMsg = obj.message as string | undefined;
        const isRouteNotFound =
          typeof rawMsg === 'string' && rawMsg.startsWith('Cannot ');

        message = isRouteNotFound
          ? PATH_NOT_FOUND
          : (rawMsg ?? INTERNAL_SERVER_ERROR);

        error = obj.error as string | undefined;
        errors = obj.errors as { field: string; message: string }[] | undefined;
      }

      // Double-check for Nest's 404 on unknown routes
      if (status === HttpStatus.NOT_FOUND && !errors) {
        message = PATH_NOT_FOUND;
        error = PATH_NOT_FOUND;
      }
    }

    void response.code(status).send({
      success: false,
      message,
      method: request?.method,
      endpoint: request?.url ?? '',
      statusCode: status,
      timestamp: new Date().toISOString(),
      ...(errors && { errors }),
      ...(error && !errors && { error }),
    });
  }
}
