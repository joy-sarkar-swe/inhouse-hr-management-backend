const { Client } = require('@prisma/client/runtime/library');
const dotenv = require('dotenv');
dotenv.config();

console.log('DATABASE_URL:', process.env.DATABASE_URL);

async function test() {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    console.log('SUCCESS CONNECTING TO DB!');
    const res = await prisma.$queryRaw`SELECT 1 + 1 as result`;
    console.log('Query result:', res);
  } catch (err) {
    console.error('ERROR CONNECTING:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

test();
