/**
 * @fileoverview Standard API response envelope.
 *
 * Every response emitted by the API Gateway is wrapped in this
 * shape by the global {@link ResponseInterceptor} so that clients
 * always receive a predictable JSON structure.
 *
 * @module shared/interfaces
 */

/**
 * Envelope returned by service methods to carry a custom message alongside the payload.
 * The global ResponseInterceptor unwraps this into the standard ServiceResponse shape.
 *
 * @template T - The type of the data payload.
 */
export interface ServicePayload<T = any> {
  /** Human-readable message describing the outcome. */
  message: string;
  /** The actual data returned by the service. */
  data: T;
}

/**
 * The final structure of every API response, whether success or failure.
 *
 * @template T - The type of the data payload on success.
 */
export interface ServiceResponse<T = any> {
  /** Whether the request completed without error. */
  success: boolean;

  /** Human-readable summary of the outcome. */
  message: string;

  /** HTTP method that triggered the response (e.g. `GET`). */
  method?: string;

  /** Request path (e.g. `/api/user/123`). */
  endpoint?: string;

  /** ISO-8601 timestamp of when the response was produced. */
  timestamp: string;

  /** HTTP status code. */
  statusCode: number;

  /** Payload returned on success. */
  data?: T;

  /** Single error string on failure. */
  error?: string;

  /** Field-level validation errors on failure. */
  errors?: Array<{
    field: string;
    message: string;
  }>;
}
