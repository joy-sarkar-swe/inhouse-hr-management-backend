/**
 * @fileoverview Shape of the authenticated user attached to the request.
 *
 * After successful JWT validation, JwtStrategy populates `request.user`
 * with this shape. Field names match the PostgreSQL User table columns
 * (via Prisma model) — `name` not `fullName`.
 *
 * @module shared/interfaces
 */
export interface AuthUser {
  /** PostgreSQL UUID primary key. */
  id?: string;
  /** User's display name (maps to `User.name` column). */
  name?: string;
  /** User's email address. */
  email?: string;
  /** User's role (CUSTOMER | SHOP_OWNER | ADMIN). */
  role?: string;
}
