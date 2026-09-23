/**
 * @fileoverview Auth interfaces and types.
 * This file defines the shape of the auth resource as returned by the API.
 */

/** User info embedded in login / refresh responses. */
export type UserPayload = {
  /** User email. */
  email: string | null;
  /** User full name. */
  fullName: string;
  /** User role. */
  role: string;
  /**
   * Internal Employee UUID — only present for EMPLOYEE-role users with a
   * linked Employee record. Mirrored into the JWT so employee-scoped routes
   * (leave, payroll self-service) can resolve "my own records" without an
   * extra DB round trip.
   */
  employeeId?: string;
};

/**
 * Shape of the data returned by the login and refresh-token endpoints.
 */
export type LoginResponseDto = {
  /** Short-lived opaque access token (Redis key: `{userId}:{sessionId}`). */
  access_token: string;
  /**
   * Long-lived opaque refresh token (Redis key: `refresh:{userId}:{sessionId}`).
   * Store securely (HttpOnly cookie or secure storage). Never expose to JS on the page.
   */
  refresh_token: string;
  /** Token type — always "Bearer". */
  token_type: 'Bearer';
  /** Access token TTL in seconds. */
  expires_in: number;
  /** The authenticated user payload. */
  user: UserPayload;
};

/**
 * Shape of the data returned by the refresh-token endpoint only
 * (same as LoginResponseDto — typed alias for Swagger clarity).
 */
export type RefreshResponseDto = LoginResponseDto;
