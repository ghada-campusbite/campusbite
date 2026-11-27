/**
 * End-to-end tests against a REAL PostgreSQL and a real HTTP server.
 * `npm run test:e2e` (test/run-e2e.mjs) starts an embedded Postgres first and
 * passes DATABASE_URL; CI keeps running only the mocked unit specs (`npm test`).
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { execSync } from 'child_process';
import * as argon2 from 'argon2';

process.env.JWT_ACCESS_SECRET = 'e2e-access-secret-e2e-access-secret-123456';
process.env.JWT_REFRESH_SECRET = 'e2e-refresh-secret-e2e-refresh-secret-1234';
process.env.CORS_ORIGINS = '';
if (!process.env.DATABASE_URL) throw new Error('run via npm run test:e2e (it starts Postgres)');

import { JwtService } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.module';

jest.setTimeout(180_000);

let app: INestApplication;
let prisma: PrismaService;
let jwt: JwtService;
let base: string;
let ids: { uni: string; canteen: string; item1: string; item2: string };
let otherCanteen: string;

function slot(minutesAhead: number) {
  const STEP = 5 * 60_000;
  return new Date(Math.ceil((Date.now() + minutesAhead * 60_000) / STEP) * STEP).toISOString();
}

async function call(method: string, path: string, opts: { token?: string; body?: any } = {}) {
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// real logins are rate-limited (5/min), so only the tests that verify login itself use
// the endpoint; everything else mints the same JWT shape AuthService.issue signs
async function tokenFor(email: string) {
  const u = await prisma.user.findUnique({ where: { email } });
  if (!u) throw new Error(`seed user ${email} missing`);
  return jwt.signAsync({ sub: u.id, role: u.role, canteenId: u.canteenId }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m', algorithm: 'HS256' });
}

beforeAll(async () => {
  execSync('npx prisma db push --force-reset --skip-generate', { env: { ...process.env }, stdio: 'pipe' });

  // rate limits belong to the edge, not to the workflow assertions; tested config stays default in prod
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(APP_GUARD).useValue({ canActivate: () => true })
    .compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.setGlobalPrefix('api/v1');
  await app.listen(0);
  base = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  prisma = app.get(PrismaService);
  jwt = app.get(JwtService);

  const uni = await prisma.university.create({ data: { name: 'E2E University', breaks: { create: [{ startMin: 0, endMin: 1439 }] } } });
  const canteen = await prisma.canteen.create({ data: { name: 'E2E Canteen', universityId: uni.id, prepMinutes: 5, maxOrdersPerSlot: 2 } });
  const item1 = await prisma.menuItem.create({ data: { canteenId: canteen.id, name: 'كشري', priceCents: 1500 } });
  const item2 = await prisma.menuItem.create({ data: { canteenId: canteen.id, name: 'شاي', priceCents: 2500, available: true } });
  ids = { uni: uni.id, canteen: canteen.id, item1: item1.id, item2: item2.id };

  const hash = (p: string) => argon2.hash(p);
  await prisma.user.create({ data: { email: 'admin@e2e.dev', name: 'Admin', role: 'ADMIN', emailVerifiedAt: new Date(), passwordHash: await hash('admin-pass-12345') } });
  await prisma.user.create({ data: { email: 'staff@e2e.dev', name: 'Staff', role: 'CANTEEN_STAFF', emailVerifiedAt: new Date(), canteenId: canteen.id, passwordHash: await hash('staff-pass-12345') } });
  await prisma.user.create({ data: { email: 'student@e2e.dev', name: 'Student', role: 'STUDENT', emailVerifiedAt: new Date(), passwordHash: await hash('student-pass-123') } });

  const canteen2 = await prisma.canteen.create({ data: { name: 'Other Canteen', universityId: uni.id, prepMinutes: 5 } });
  otherCanteen = canteen2.id;
  await prisma.menuItem.create({ data: { canteenId: canteen2.id, name: 'بيتزا', priceCents: 3000 } });
  await prisma.user.create({ data: { email: 'staff2@e2e.dev', name: 'Staff2', role: 'CANTEEN_STAFF', emailVerifiedAt: new Date(), canteenId: canteen2.id, passwordHash: await hash('staff2-pass-1234') } });
});

afterAll(async () => {
  await app?.close();
});

describe('orders against a real database', () => {
  it('computes totals from DB prices, not the client', async () => {
    const token = await tokenFor('student@e2e.dev');
    const r = await call('POST', '/orders', { token, body: { canteenId: ids.canteen, pickupAt: slot(30), items: [{ menuItemId: ids.item1, quantity: 2 }, { menuItemId: ids.item2, quantity: 1 }] } });
    expect(r.status).toBe(201);
    expect(r.body.totalCents).toBe(2 * 1500 + 2500);
  });

  it('enforces slot capacity under 5 concurrent orders (max 2)', async () => {
    const token = await tokenFor('student@e2e.dev');
    const when = slot(120);
    // separate students so the 3-open-orders rule doesn't interfere
    const mk = async (i: number) => {
      const email = `cap${i}@e2e.dev`;
      await prisma.user.create({ data: { email, name: `C${i}`, emailVerifiedAt: new Date(), passwordHash: await argon2.hash('cap-pass-12345') } });
      const t = await tokenFor(email);
      return call('POST', '/orders', { token: t, body: { canteenId: ids.canteen, pickupAt: when, items: [{ menuItemId: ids.item1, quantity: 1 }] } });
    };
    const results = await Promise.all([0, 1, 2, 3, 4].map(mk));
    expect(results.filter((r) => r.status === 201).length).toBe(2);
    expect(results.filter((r) => r.status === 409).length).toBe(3);
    expect(token).toBeTruthy();
  });

  it('drops full slots from the slot list', async () => {
    const list = await call('GET', `/canteens/${ids.canteen}/slots`);
    expect(list.status).toBe(200);
    expect(list.body).not.toContain(slot(120)); // filled by the previous test
  });

  it('enforces RBAC on every role boundary', async () => {
    const student = await tokenFor('student@e2e.dev');
    const staff = await tokenFor('staff@e2e.dev');
    expect((await call('GET', '/orders/canteen', { token: student })).status).toBe(403); // student -> staff queue
    expect((await call('POST', '/orders', { token: staff, body: {} })).status).toBe(403); // staff -> ordering
    expect((await call('GET', '/admin/analytics', { token: student })).status).toBe(403); // student -> admin
    expect((await call('GET', '/orders/mine')).status).toBe(401); // anonymous
    expect((await call('GET', '/admin/analytics', { token: staff })).status).toBe(403); // staff -> admin
    expect((await call('GET', '/admin/analytics', { token: await tokenFor('admin@e2e.dev') })).status).toBe(200);
  });

  it('applies cancellation rules by status and owner', async () => {
    const student = await tokenFor('student@e2e.dev');
    const staff = await tokenFor('staff@e2e.dev');
    const mk = async () => (await call('POST', '/orders', { token: student, body: { canteenId: ids.canteen, pickupAt: slot(180), items: [{ menuItemId: ids.item1, quantity: 1 }] } })).body.id;

    const a = await mk();
    expect((await call('PATCH', `/orders/${a}/cancel`, { token: student })).status).toBe(200);
    expect((await call('PATCH', `/orders/${a}/cancel`, { token: student })).status).toBe(404); // already cancelled

    const b = await mk();
    expect((await call('PATCH', `/orders/${b}/status`, { token: staff, body: { status: 'READY' } })).status).toBe(409); // PENDING->READY invalid
    expect((await call('PATCH', `/orders/${b}/status`, { token: staff, body: { status: 'PREPARING' } })).status).toBe(200);
    expect((await call('PATCH', `/orders/${b}/cancel`, { token: student })).status).toBe(404); // not PENDING anymore
    const mine = await call('GET', '/orders/mine', { token: student });
    expect(mine.body.find((o: any) => o.id === a).cancelledBy).toBe('STUDENT');
  });

  it('suspending a student blocks ordering and login immediately', async () => {
    const admin = await tokenFor('admin@e2e.dev');
    await prisma.user.create({ data: { email: 'bad@e2e.dev', name: 'Bad', emailVerifiedAt: new Date(), passwordHash: await argon2.hash('bad-pass-12345') } });
    // real login once (also proves the endpoint works before suspension)
    const badLogin = await call('POST', '/auth/login', { body: { email: 'bad@e2e.dev', password: 'bad-pass-12345' } });
    expect(badLogin.status).toBe(200);
    const bad = badLogin.body.accessToken as string;
    const students = await call('GET', '/admin/students?q=bad@', { token: admin });
    const target = students.body.find((s: any) => s.email === 'bad@e2e.dev');
    expect((await call('PATCH', `/admin/users/${target.id}/suspend`, { token: admin })).status).toBe(200);
    expect((await call('GET', '/orders/mine', { token: bad })).status).toBe(403); // existing token dies
    expect((await call('POST', '/orders', { token: bad, body: { canteenId: ids.canteen, pickupAt: slot(240), items: [{ menuItemId: ids.item1, quantity: 1 }] } })).status).toBe(403);
    expect((await call('POST', '/auth/login', { body: { email: 'bad@e2e.dev', password: 'bad-pass-12345' } })).status).toBe(403);
    expect((await call('PATCH', `/admin/users/${target.id}/unsuspend`, { token: admin })).status).toBe(200);
    expect((await call('POST', '/auth/login', { body: { email: 'bad@e2e.dev', password: 'bad-pass-12345' } })).status).toBe(200);
  });

  it('hides archived menu items from students', async () => {
    const staff = await tokenFor('staff@e2e.dev');
    expect((await call('DELETE', `/menu/${ids.item2}`, { token: staff })).status).toBe(200);
    const menu = await call('GET', `/canteens/${ids.canteen}/menu`);
    expect(menu.body.map((i: any) => i.id)).not.toContain(ids.item2);
  });

  it('keeps canteens isolated: staff cannot see or touch another canteen', async () => {
    const staff1 = await tokenFor('staff@e2e.dev');
    const staff2 = await tokenFor('staff2@e2e.dev');
    // menu mutation of canteen 1's item by canteen 2's staff changes nothing
    expect((await call('PATCH', `/menu/${ids.item1}`, { token: staff2, body: { available: false } })).body.updated).toBe(0);
    expect((await call('DELETE', `/menu/${ids.item1}`, { token: staff2 })).body.archived).toBe(0);
    // order queue is scoped: place an order at canteen 1, staff 2 must not see or move it
    const student = await tokenFor('student@e2e.dev');
    const o = await call('POST', '/orders', { token: student, body: { canteenId: ids.canteen, pickupAt: slot(360), items: [{ menuItemId: ids.item1, quantity: 1 }] } });
    expect(o.status).toBe(201);
    const queue2 = await call('GET', '/orders/canteen', { token: staff2 });
    expect(queue2.body.map((x: any) => x.id)).not.toContain(o.body.id);
    expect((await call('PATCH', `/orders/${o.body.id}/status`, { token: staff2, body: { status: 'PREPARING' } })).status).toBe(404);
    expect((await call('PATCH', `/orders/${o.body.id}/status`, { token: staff1, body: { status: 'PREPARING' } })).status).toBe(200);
    // settings are scoped too
    const mine2 = await call('GET', '/canteen/mine', { token: staff2 });
    expect(mine2.body.id).toBe(otherCanteen);
  });

  it('releasing a slot by cancellation lets a new order take it', async () => {
    const when = slot(420);
    const mk = async (i: number) => {
      const email = `rel${i}@e2e.dev`;
      await prisma.user.create({ data: { email, name: `R${i}`, emailVerifiedAt: new Date(), passwordHash: await argon2.hash('rel-pass-12345') } });
      return tokenFor(email);
    };
    const [t1, t2, t3] = [await mk(1), await mk(2), await mk(3)];
    const body = { canteenId: ids.canteen, pickupAt: when, items: [{ menuItemId: ids.item1, quantity: 1 }] };
    const r1 = await call('POST', '/orders', { token: t1, body });
    const r2 = await call('POST', '/orders', { token: t2, body });
    expect([r1.status, r2.status]).toEqual([201, 201]);
    expect((await call('POST', '/orders', { token: t3, body })).status).toBe(409); // slot full
    expect((await call('PATCH', `/orders/${r1.body.id}/cancel`, { token: t1 })).status).toBe(200);
    expect((await call('POST', '/orders', { token: t3, body })).status).toBe(201); // freed seat
  });

  it('rejects forged image uploads (wrong owner, wrong type)', async () => {
    const staff2 = await tokenFor('staff2@e2e.dev');
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'); // real PNG magic bytes
    const form = new FormData();
    form.append('image', new Blob([png], { type: 'image/png' }), 'x.png');
    // canteen 2's staff tries to attach an image to canteen 1's item
    const res = await fetch(`${base}/api/v1/menu/${ids.item1}/image`, { method: 'POST', headers: { authorization: `Bearer ${staff2}` }, body: form });
    expect(res.status).toBe(400);
    const item = await prisma.menuItem.findUnique({ where: { id: ids.item1 } });
    expect(item!.imageUrl).toBeNull();
  });

  it('stores uploaded images in the database and serves them back', async () => {
    const staff1 = await tokenFor('staff@e2e.dev');
    const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d49444154789c626001000000ffff030000060005' + '57bfabd40000000049454e44ae426082', 'hex');
    const form = new FormData();
    form.append('image', new Blob([png], { type: 'image/png' }), 'photo.png');
    const up = await fetch(`${base}/api/v1/menu/${ids.item1}/image`, { method: 'POST', headers: { authorization: `Bearer ${staff1}` }, body: form });
    expect(up.status).toBe(201);
    const { imageUrl } = await up.json();
    expect(imageUrl).toBe(`/menu/${ids.item1}/image`);
    // bytes are in the database, not the filesystem
    const row = await prisma.menuItemImage.findUnique({ where: { itemId: ids.item1 } });
    expect(row!.mime).toBe('image/png');
    expect(Buffer.from(row!.data).equals(png)).toBe(true);
    // public read endpoint returns the same bytes with the right content type
    const got = await fetch(`${base}/api/v1${imageUrl}`);
    expect(got.status).toBe(200);
    expect(got.headers.get('content-type')).toContain('image/png');
    expect(Buffer.from(await got.arrayBuffer()).equals(png)).toBe(true);
    // missing image is a clean 404
    expect((await fetch(`${base}/api/v1/menu/${ids.item2}/image`)).status).toBe(404);
    // forged content (extension lies about the bytes) is rejected
    const bad = new FormData();
    bad.append('image', new Blob([Buffer.from('not an image at all')], { type: 'image/png' }), 'fake.png');
    expect((await fetch(`${base}/api/v1/menu/${ids.item1}/image`, { method: 'POST', headers: { authorization: `Bearer ${staff1}` }, body: bad })).status).toBe(400);
  });

  it('blocks unverified students from ordering', async () => {
    await prisma.user.create({ data: { email: 'unv@e2e.dev', name: 'Unv', passwordHash: await argon2.hash('unv-pass-12345') } });
    const token = await tokenFor('unv@e2e.dev');
    expect((await call('POST', '/orders', { token, body: { canteenId: ids.canteen, pickupAt: slot(300), items: [{ menuItemId: ids.item1, quantity: 1 }] } })).status).toBe(403);
  });
  it('charges the offer price, rejects offers not below the price, and clears them', async () => {
    const staff = await tokenFor('staff@e2e.dev');
    expect((await call('PATCH', `/menu/${ids.item1}`, { token: staff, body: { offerPriceCents: 1500 } })).status).toBe(400);
    expect((await call('PATCH', `/menu/${ids.item1}`, { token: staff, body: { offerPriceCents: 1000 } })).status).toBe(200);
    const pub = await call('GET', `/canteens/${ids.canteen}/menu`);
    expect(pub.body.find((i: any) => i.id === ids.item1).offerPriceCents).toBe(1000);
    const student = await tokenFor('student@e2e.dev');
    await prisma.order.updateMany({ where: { status: { in: ['PENDING', 'PREPARING', 'READY'] } }, data: { status: 'COMPLETED' } }); // free the per-student active-order cap
    const r = await call('POST', '/orders', { token: student, body: { canteenId: ids.canteen, pickupAt: slot(310), items: [{ menuItemId: ids.item1, quantity: 2 }] } });
    expect(r.status).toBe(201);
    expect(r.body.totalCents).toBe(2000);
    expect((await call('PATCH', `/menu/${ids.item1}`, { token: staff, body: { offerPriceCents: null } })).status).toBe(200);
    expect((await prisma.menuItem.findUnique({ where: { id: ids.item1 } }))!.offerPriceCents).toBeNull();
  });

  it('marks popular items only after real sales, ignoring cancelled orders', async () => {
    const menu0 = await call('GET', `/canteens/${ids.canteen}/menu`);
    const before = menu0.body.filter((i: any) => i.popular).length;
    const stu = await prisma.user.findUnique({ where: { email: 'student@e2e.dev' } });
    const mk = (status: any, qty: number) => prisma.order.create({ data: { userId: stu!.id, canteenId: ids.canteen, status, totalCents: 0, pickupAt: new Date(), items: { create: [{ menuItemId: ids.item1, quantity: qty, unitPriceCents: 1500 }] } } });
    await mk('CANCELLED', 50);
    expect((await call('GET', `/canteens/${ids.canteen}/menu`)).body.filter((i: any) => i.popular).length).toBe(before);
    await mk('COMPLETED', 5);
    const after = await call('GET', `/canteens/${ids.canteen}/menu`);
    expect(after.body.find((i: any) => i.id === ids.item1).popular).toBe(true);
  });

  it('platform settings: commission defaults to 0, admin only, bounded', async () => {
    const admin = await tokenFor('admin@e2e.dev');
    expect((await call('GET', '/admin/settings', { token: admin })).body.commissionPercent).toBe(0);
    expect((await call('GET', '/admin/settings', { token: await tokenFor('staff@e2e.dev') })).status).toBe(403);
    expect((await call('PATCH', '/admin/settings', { token: admin, body: { commissionPercent: 99 } })).status).toBe(400);
    expect((await call('PATCH', '/admin/settings', { token: admin, body: { commissionPercent: 5 } })).status).toBe(200);
    expect((await call('GET', '/admin/settings', { token: admin })).body.commissionPercent).toBe(5);
  });
  it('campuses: admin creates them, canteens must match their university, students can filter by campus', async () => {
    const admin = await tokenFor('admin@e2e.dev');
    const uni = await prisma.university.findFirst({ where: { name: 'E2E University' } });
    const other = await prisma.university.create({ data: { name: 'Other Uni' } });
    const c1 = await call('POST', '/admin/campuses', { token: admin, body: { universityId: uni!.id, name: 'Main Campus' } });
    expect(c1.status).toBe(201);
    const c2 = await call('POST', '/admin/campuses', { token: admin, body: { universityId: other.id, name: 'Foreign Campus' } });
    // a canteen cannot be attached to a campus of another university
    expect((await call('POST', '/admin/canteens', { token: admin, body: { name: 'Bad', universityId: uni!.id, campusId: c2.body.id, prepMinutes: 5 } })).status).toBe(400);
    expect((await call('POST', '/admin/canteens', { token: admin, body: { name: 'Campus Canteen', universityId: uni!.id, campusId: c1.body.id, prepMinutes: 5 } })).status).toBe(201);
    expect((await call('POST', '/admin/campuses', { token: await tokenFor('staff@e2e.dev'), body: { universityId: uni!.id, name: 'x1' } })).status).toBe(403);
    const list = await call('GET', `/universities/${uni!.id}/campuses`);
    expect(list.body.map((c: any) => c.name)).toEqual(['Main Campus']);
    const byCampus = await call('GET', `/canteens?campusId=${c1.body.id}`);
    expect(byCampus.body.map((c: any) => c.name)).toEqual(['Campus Canteen']);
  });
  it('pickup code: student sees it, staff queue hides it, completing needs the right code', async () => {
    const student = await tokenFor('student@e2e.dev'); const staff = await tokenFor('staff@e2e.dev');
    await prisma.order.updateMany({ where: { status: { in: ['PENDING', 'PREPARING', 'READY'] } }, data: { status: 'COMPLETED' } });
    const o = await call('POST', '/orders', { token: student, body: { canteenId: ids.canteen, pickupAt: slot(500), items: [{ menuItemId: ids.item1, quantity: 1 }] } });
    expect(o.status).toBe(201);
    expect(o.body.pickupCode).toMatch(/^\d{4}$/);
    // at rest the code is encrypted: the DB row holds no plaintext, no plaintext column
    const stored = await prisma.order.findUnique({ where: { id: o.body.id } });
    expect(stored!.pickupCodeEnc).toBeTruthy();
    expect(stored!.pickupCodeEnc).not.toContain(o.body.pickupCode);
    expect((stored as any).pickupCode).toBeUndefined();
    // the student can still read their code back from their own order list
    const mineList = await call('GET', '/orders/mine', { token: student });
    expect(mineList.body.find((x: any) => x.id === o.body.id).pickupCode).toBe(o.body.pickupCode);
    const queue = await call('GET', '/orders/canteen', { token: staff });
    const row = queue.body.find((x: any) => x.id === o.body.id);
    expect(row).toBeTruthy();
    expect(row.pickupCode).toBeUndefined();
    expect((await call('PATCH', `/orders/${o.body.id}/status`, { token: staff, body: { status: 'PREPARING' } })).status).toBe(200);
    expect((await call('PATCH', `/orders/${o.body.id}/status`, { token: staff, body: { status: 'READY' } })).status).toBe(200);
    expect((await call('PATCH', `/orders/${o.body.id}/status`, { token: staff, body: { status: 'COMPLETED' } })).status).toBe(400);
    const wrong = o.body.pickupCode === '1234' ? '4321' : '1234';
    expect((await call('PATCH', `/orders/${o.body.id}/status`, { token: staff, body: { status: 'COMPLETED', code: wrong } })).status).toBe(400);
    expect((await call('PATCH', `/orders/${o.body.id}/status`, { token: staff, body: { status: 'COMPLETED', code: o.body.pickupCode } })).status).toBe(200);
    const mine = await call('GET', '/orders/mine', { token: student });
    expect(mine.body.find((x: any) => x.id === o.body.id).status).toBe('COMPLETED');
  });
  it('pickup code lockout: 5 wrong tries lock it, even the right code is refused for 10 minutes; admin report hides the code', async () => {
    const student = await tokenFor('student@e2e.dev'); const staff = await tokenFor('staff@e2e.dev'); const admin = await tokenFor('admin@e2e.dev');
    await prisma.order.updateMany({ where: { status: { in: ['PENDING', 'PREPARING', 'READY'] } }, data: { status: 'COMPLETED' } });
    const o = await call('POST', '/orders', { token: student, body: { canteenId: ids.canteen, pickupAt: slot(520), items: [{ menuItemId: ids.item1, quantity: 1 }] } });
    expect(o.status).toBe(201);
    await prisma.order.update({ where: { id: o.body.id }, data: { status: 'READY' } });
    const wrong = o.body.pickupCode === '0000' ? '1111' : '0000';
    for (let k = 0; k < 5; k++) expect((await call('PATCH', `/orders/${o.body.id}/status`, { token: staff, body: { status: 'COMPLETED', code: wrong } })).status).toBe(400);
    expect((await call('PATCH', `/orders/${o.body.id}/status`, { token: staff, body: { status: 'COMPLETED', code: o.body.pickupCode } })).status).toBe(429);
    const rep = await call('GET', '/admin/orders', { token: admin });
    expect(JSON.stringify(rep.body)).not.toContain('pickupCode');
    // another canteen's staff cannot touch this order at all
    const other = await tokenFor('staff2@e2e.dev');
    expect((await call('PATCH', `/orders/${o.body.id}/status`, { token: other, body: { status: 'COMPLETED', code: o.body.pickupCode } })).status).toBe(404);
  });

  it('campus persistence: GET /auth/me needs a token, saves a valid campus, rejects invalid ones', async () => {
    const t = await tokenFor('student@e2e.dev');
    expect((await call('GET', '/auth/me')).status).toBe(401);
    expect((await call('PATCH', '/auth/me/campus', { body: { campusId: 'x' } })).status).toBe(401);
    expect((await call('PATCH', '/auth/me/campus', { token: t, body: { campusId: 'does-not-exist' } })).status).toBe(404);
    expect((await call('PATCH', '/auth/me/campus', { token: t, body: {} })).status).toBe(400);
    const campus = await prisma.campus.findFirst();
    expect((await call('PATCH', '/auth/me/campus', { token: t, body: { campusId: campus!.id } })).status).toBe(200);
    expect((await call('GET', '/auth/me', { token: t })).body.campusId).toBe(campus!.id);
  });

  it('account deletion: isolated fictional student; wrong password refused; only that user is touched', async () => {
    const hash = await argon2.hash('delete-me-pass-123');
    const del = await prisma.user.create({ data: { email: 'del@e2e.dev', name: 'Del', role: 'STUDENT', emailVerifiedAt: new Date(), passwordHash: hash } });
    const camp = await prisma.campus.findFirst();
    await prisma.user.update({ where: { id: del.id }, data: { campusId: camp!.id } });
    await prisma.emailToken.create({ data: { userId: del.id, type: 'RESET', codeHash: 'x', expiresAt: new Date(Date.now() + 60000) } });
    const dt = await tokenFor('del@e2e.dev');
    const o = await call('POST', '/orders', { token: dt, body: { canteenId: ids.canteen, pickupAt: slot(900), items: [{ menuItemId: ids.item1, quantity: 1 }] } });
    expect(o.status).toBe(201);
    const other = await prisma.user.findUnique({ where: { email: 'student@e2e.dev' } });
    const snap = async () => ({ users: await prisma.user.count(), orders: await prisma.order.count(), items: await prisma.menuItem.count(), canteens: await prisma.canteen.count(), otherOrders: await prisma.order.count({ where: { userId: other!.id } }), other: JSON.stringify(await prisma.user.findUnique({ where: { id: other!.id } })) });
    const before = await snap();
    expect((await call('DELETE', '/auth/me', { token: dt, body: { password: 'wrong-password-123' } })).status).toBe(401);
    expect((await prisma.user.findUnique({ where: { id: del.id } }))!.email).toBe('del@e2e.dev');
    expect((await call('DELETE', '/auth/me', { token: dt, body: { password: 'delete-me-pass-123' } })).status).toBe(200);
    const after = await snap();
    expect(after).toEqual(before); // nothing deleted or changed for anyone else; rows kept
    const gone = await prisma.user.findUnique({ where: { id: del.id } });
    expect(gone!.email).toBe(`deleted-${del.id}@deleted.invalid`);
    expect(gone!.name).toBe('حساب محذوف');
    expect(gone!.campusId).toBeNull();
    expect(await prisma.emailToken.count({ where: { userId: del.id } })).toBe(0);
    expect((await prisma.order.findUnique({ where: { id: o.body.id } }))!.status).toBe('CANCELLED');
    expect((await call('POST', '/auth/login', { body: { email: 'del@e2e.dev', password: 'delete-me-pass-123' } })).status).toBe(401);
  });
});
