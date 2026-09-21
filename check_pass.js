const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');

async function main() {
  const users = await prisma.user.findMany();
  console.log('USERS IN DB:');
  for (const u of users) {
    console.log(`- ID: ${u.id}, Email: ${u.email}, Role: ${u.role}, acc_verified: ${u.acc_verified}`);
    if (u.email === 'info.zentura.agency@gmail.com') {
      const match = await bcrypt.compare('zentura1234', u.password);
      console.log(`  Password matches 'zentura1234': ${match}`);
    }
    if (u.email === 'ishratjahanrintu13@gmail.com') {
      const match = await bcrypt.compare('emp123456', u.password);
      console.log(`  Password matches 'emp123456': ${match}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
