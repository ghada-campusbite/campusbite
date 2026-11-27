const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const pw = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !pw || pw.length < 12) throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (12+ chars)');
  if (await prisma.user.findFirst({ where: { role: 'ADMIN' } })) { console.log('Admin already exists, nothing to do'); return; }
  await prisma.user.create({ data: { email: email.toLowerCase(), name: 'Admin', role: 'ADMIN', emailVerifiedAt: new Date(), passwordHash: await argon2.hash(pw) } });
  if (process.env.SEED_DEMO === '1') {
    const uni = await prisma.university.create({
      data: { name: 'Demo University', breaks: { create: [{ startMin: 600, endMin: 630 }, { startMin: 750, endMin: 780 }] } },
    });
    await prisma.canteen.create({ data: { name: 'Demo Canteen', universityId: uni.id } });
  }
  console.log('Seeded');
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
