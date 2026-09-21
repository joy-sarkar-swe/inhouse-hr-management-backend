/**
 * @fileoverview Shape of the authenticated user attached to the request.
 *
 * After successful JWT validation, JwtStrategy populates `request.user`
 * with this shape.
 *
 * @module shared/interfaces
 */
export interface AuthUser {
  /** PostgreSQL UUID primary key (User.id). */
  id?: string;
  /** User's display name. */
  name?: string;
  /** User's email address. */
  email?: string;
  /** Role: 'hr' (admin) | 'employee' (staff). */
  role?: 'hr' | 'employee';
  /** Employee record UUID — set for role='employee', absent for role='hr'. */
  employeeId?: string;
}
