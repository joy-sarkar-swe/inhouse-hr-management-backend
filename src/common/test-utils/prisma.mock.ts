/**
 * @fileoverview Prisma mock factory for unit tests.
 *
 * Returns a deeply-mocked `PrismaService` where every model delegate method
 * (`findUnique`, `findMany`, `create`, `update`, `delete`, `count`, etc.) is a
 * jest spy that returns `null` / `[]` / `0` by default.
 *
 * Override individual methods per test:
 * ```ts
 * mockPrisma.user.findUnique.mockResolvedValueOnce(fakeUser);
 * ```
 *
 * @module common/test-utils
 */

/** Builds a generic model delegate mock covering the most common Prisma operations. */
function modelDelegate() {
  return {
    findUnique: jest.fn().mockResolvedValue(null),
    findUniqueOrThrow: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    findFirstOrThrow: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue(null),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    update: jest.fn().mockResolvedValue(null),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    upsert: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue(null),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    count: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue({}),
    groupBy: jest.fn().mockResolvedValue([]),
  };
}

/**
 * Creates a `PrismaService` mock.
 *
 * All model delegates are pre-built with jest spies; `$transaction` executes
 * the callback synchronously so tests can assert DB interactions without an
 * actual database connection.
 *
 * @returns Jest mock shaped like `PrismaService`.
 */
export function createMockPrismaService() {
  return {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $transaction: jest.fn().mockImplementation((cb: (tx: any) => any) =>
      cb({
        // Provide model delegates for the transaction proxy too
        user: modelDelegate(),
        media: modelDelegate(),
      }),
    ),
    // Model delegates
    user: modelDelegate(),
    media: modelDelegate(),
  };
}
