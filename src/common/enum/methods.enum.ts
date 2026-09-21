/**
 * @fileoverview Standard HTTP methods enum.
 * Centralises method names to prevent typos across the codebase.
 */
export enum Methods {
  /** HTTP GET method for retrieving resources. */
  GET = 'GET',
  /** HTTP POST method for creating resources. */
  POST = 'POST',
  /** HTTP PUT method for replacing resources. */
  PUT = 'PUT',
  /** HTTP DELETE method for removing resources. */
  DELETE = 'DELETE',
  /** HTTP PATCH method for partial updates to resources. */
  PATCH = 'PATCH',
}
