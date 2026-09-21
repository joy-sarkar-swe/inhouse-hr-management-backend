import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

async function test() {
  console.log('Testing DATABASE_URL:', process.env.DATABASE_URL);
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

  try {
    await prisma.$connect();
    console.log('✅ Connected successfully to PostgreSQL!');
    const usersCount = await prisma.user.count();
    console.log('User count:', usersCount);
  } catch (err) {
    console.error('❌ Connection error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
