// Fictional demo data for local testing only — clearly named, never for production.
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const { readFileSync, existsSync } = require('fs');
const { join } = require('path');
const prisma = new PrismaClient();
async function main() {
  const uni = await prisma.university.create({ data: { name: 'مجمع كليات دمنهور (تجريبي)', breaks: { create: [{ startMin: 0, endMin: 1439 }] } } });
  const canteen = await prisma.canteen.create({ data: { name: 'مطعم تجريبي', universityId: uni.id, prepMinutes: 5, maxOrdersPerSlot: 10, openMin: 480, closeMin: 1020 } });
  const items = [
    ['كشري', 'وجبات', 3500, 'koshari.jpg'],
    ['فراخ بروستد', 'وجبات', 8500, 'broast.jpg'],
    ['سندوتش فلافل', 'سندوتشات', 1500, 'falafel.jpg'],
    ['سندوتش فراخ', 'سندوتشات', 4000, 'chicken-sandwich.jpg'],
    ['عصير برتقال', 'مشروبات', 1200, 'juice.jpg'],
    ['أرز بلبن', 'حلويات', 2000, 'rice-pudding.jpg', 1500],
  ];
  for (const [name, category, priceCents, file, offerPriceCents] of items) {
    const item = await prisma.menuItem.create({ data: { canteenId: canteen.id, name, category, priceCents, offerPriceCents: offerPriceCents ?? null, description: 'صنف تجريبي للاختبار' } });
    // demo photos are stored in the database (same as real uploads) so they survive ephemeral hosting
    const path = join(__dirname, '..', 'uploads', file);
    if (existsSync(path)) {
      await prisma.menuItemImage.create({ data: { itemId: item.id, data: readFileSync(path), mime: 'image/jpeg' } });
      await prisma.menuItem.update({ where: { id: item.id }, data: { imageUrl: `/menu/${item.id}/image` } });
    }
  }
  const h = (p) => argon2.hash(p);
  await prisma.user.create({ data: { email: 'admin@demo.dev', name: 'أدمن تجريبي', role: 'ADMIN', emailVerifiedAt: new Date(), passwordHash: await h('demo-admin-1234') } });
  await prisma.user.create({ data: { email: 'staff@demo.dev', name: 'موظف تجريبي', role: 'CANTEEN_STAFF', emailVerifiedAt: new Date(), canteenId: canteen.id, passwordHash: await h('demo-staff-1234') } });
  await prisma.user.create({ data: { email: 'student@demo.dev', name: 'طالبة تجريبية', role: 'STUDENT', emailVerifiedAt: new Date(), passwordHash: await h('demo-student-12') } });
  console.log(JSON.stringify({ canteenId: canteen.id }));
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
