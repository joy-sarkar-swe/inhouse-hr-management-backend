/**
 * @fileoverview Prisma seed script (entrypoint).
 *
 * Bootstraps three dev-only accounts, one per role, so you can log in and
 * exercise the API immediately after `npm run setup`. All three share the
 * password `12345678` and are pre-verified (`acc_verified: true`) so you can
 * skip the OTP step during local development.
 *
 * DEV ONLY — this script no-ops entirely when `NODE_ENV=production` so it can
 * never accidentally create default credentials in a real environment.
 *
 * Execution:
 *   npm run prisma:seed
 *
 * Safety:
 *   - Idempotent: upsert-based, safe to re-run
 *   - No destructive operations (no deletes)
 */
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEV_USERS = [
  { name: 'System Admin', email: 'admin@example.com', role: UserRole.ADMIN },
  { name: 'Shop Owner', email: 'shopowner@example.com', role: UserRole.SHOP_OWNER },
  { name: 'Customer', email: 'customer@example.com', role: UserRole.CUSTOMER },
] as const;

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.log('⏭️  Skipping seed — NODE_ENV=production.');
    return;
  }

  const hashedPassword = await bcrypt.hash('12345678', 10);

  for (const user of DEV_USERS) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: {
        name: user.name,
        email: user.email,
        password: hashedPassword,
        role: user.role,
        acc_verified: true,
      },
    });
    console.log(`👤 Seeded ${user.role} → ${user.email} (password: 12345678)`);
  }

  console.log('✅ Database seed completed successfully.');
}

main()
  .catch((error: unknown) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
