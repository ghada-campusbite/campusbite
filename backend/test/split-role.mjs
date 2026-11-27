// Verifies the owner/runtime credential split on a REAL local Postgres (not Neon).
// Usage: npm run build && node test/split-role.mjs
import EmbeddedPostgres from 'embedded-postgres';
import { spawn, execSync } from 'child_process';
import { readFileSync } from 'fs';
import pg from 'pg';
import * as argon2 from 'argon2';

const PORT = 5546, APP_PW = 'app-pass-local-test-0001';
const server = new EmbeddedPostgres({ databaseDir: '/tmp/pg-split/data', user: 'owner', password: 'ownerpass', port: PORT, persistent: false, onLog: () => {} });
await server.initialise(); await server.start();
await server.createDatabase('cbsplit');
const OWNER = `postgresql://owner:ownerpass@localhost:${PORT}/cbsplit`;
const APP = `postgresql://campusbite_app:${APP_PW}@localhost:${PORT}/cbsplit`;
let fails = 0; const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!ok) fails++; };
let child;
try {
  execSync('node scripts/bootstrap-db.cjs', { env: { ...process.env, MIGRATE_DATABASE_URL: OWNER, APP_DB_PASSWORD: APP_PW }, stdio: 'pipe' });
  execSync('node scripts/bootstrap-db.cjs', { env: { ...process.env, MIGRATE_DATABASE_URL: OWNER, APP_DB_PASSWORD: APP_PW }, stdio: 'pipe' });
  check('bootstrap-db.cjs (migrate + role), run twice (idempotent)', true);
  const owner = new pg.Client({ connectionString: OWNER }); await owner.connect();
  const app = new pg.Client({ connectionString: APP }); await app.connect();
  const denied = async (name, q) => { try { await app.query(q); check(name, false, '(was allowed)'); } catch (e) { check(name, /permission denied|must be owner/.test(e.message), e.message.slice(0, 60)); } };
  await denied('DDL: CREATE TABLE denied', 'CREATE TABLE evil(x int)');
  await denied('DDL: ALTER TABLE denied', 'ALTER TABLE "User" ADD COLUMN evil text');
  await denied('DDL: DROP TABLE denied', 'DROP TABLE "Order" CASCADE');
  await denied('TRUNCATE denied', 'TRUNCATE "Order" CASCADE');
  await denied('_prisma_migrations read denied', 'SELECT * FROM _prisma_migrations');
  await denied('_prisma_migrations write denied', 'DELETE FROM _prisma_migrations');
  await denied('CREATE ROLE denied', 'CREATE ROLE x LOGIN');
  const r = await app.query("SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname='campusbite_app'");
  check('app role has no super/createdb/createrole/bypassrls', Object.values(r.rows[0]).every((v) => v === false));
  // seed with the APP role itself (proves INSERT/sequence rights)
  const h = await argon2.hash('student-pass-123'), hs = await argon2.hash('staff-pass-12345');
  const uni = (await app.query(`INSERT INTO "University"(id,name) VALUES (gen_random_uuid(),'Split Uni') RETURNING id`)).rows[0].id;
  await app.query(`INSERT INTO "ClassBreak"(id,"universityId","startMin","endMin") VALUES (gen_random_uuid(),$1,0,1439)`, [uni]);
  const cant = (await app.query(`INSERT INTO "Canteen"(id,name,"universityId","prepMinutes") VALUES (gen_random_uuid(),'Split R',$1,5) RETURNING id`, [uni])).rows[0].id;
  const item = (await app.query(`INSERT INTO "MenuItem"(id,"canteenId",name,"priceCents") VALUES (gen_random_uuid(),$1,'Test',1500) RETURNING id`, [cant])).rows[0].id;
  await app.query(`INSERT INTO "User"(id,email,name,"passwordHash",role,"emailVerifiedAt") VALUES (gen_random_uuid(),'s@split.dev','S',$1,'STUDENT',now())`, [h]);
  await app.query(`INSERT INTO "User"(id,email,name,"passwordHash",role,"canteenId","emailVerifiedAt") VALUES (gen_random_uuid(),'t2@split.dev','T2',$1,'CANTEEN_STAFF',$2,now())`, [hs, cant]);
  await app.query(`INSERT INTO "User"(id,email,name,"passwordHash",role,"canteenId","emailVerifiedAt") VALUES (gen_random_uuid(),'t@split.dev','T',$1,'CANTEEN_STAFF',$2,now())`, [hs, cant]);
  check('app role CRUD seed (INSERT)', true);
  // run the real API with the APP url only
  child = spawn('node', ['dist/main.js'], { env: { ...process.env, DATABASE_URL: APP, PORT: '3991', JWT_ACCESS_SECRET: 'x'.repeat(40), JWT_REFRESH_SECRET: 'y'.repeat(40), CORS_ORIGINS: '' }, stdio: ['ignore','inherit','inherit'] });
  for (let i = 0; i < 40; i++) { try { if ((await fetch('http://127.0.0.1:3991/api/v1/health')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  const call = async (m, p, t, b) => { const x = await fetch(`http://127.0.0.1:3991/api/v1${p}`, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined }); return { s: x.status, b: await x.json().catch(() => null) }; };
  const ls = await call('POST', '/auth/login', null, { email: 's@split.dev', password: 'student-pass-123' });
  const lt = await call('POST', '/auth/login', null, { email: 't@split.dev', password: 'staff-pass-12345' });
  check('API login under app role', ls.s === 200 && lt.s === 200, `${ls.s}/${lt.s}`);
  const pick = new Date(Math.ceil((Date.now() + 40 * 60000) / 300000) * 300000).toISOString();
  const o = await call('POST', '/orders', ls.b.accessToken, { canteenId: cant, pickupAt: pick, items: [{ menuItemId: item, quantity: 2 }] });
  check('order create under app role', o.s === 201 && o.b.totalCents === 3000, `status ${o.s}`);
  const st = lt.b.accessToken;
  const a = await call('PATCH', `/orders/${o.b.id}/status`, st, { status: 'PREPARING' });
  const b = await call('PATCH', `/orders/${o.b.id}/status`, st, { status: 'READY' });
  const c = await call('PATCH', `/orders/${o.b.id}/status`, st, { status: 'COMPLETED', code: o.b.pickupCode });
  check('status flow with pickup code under app role', a.s === 200 && b.s === 200 && c.s === 200, `${a.s}/${b.s}/${c.s}`);
  const camp = await app.query(`INSERT INTO "Campus"(id,"universityId",name) VALUES (gen_random_uuid(),$1,'C1') RETURNING id`, [uni]);
  const pc = await call('PATCH', '/auth/me/campus', ls.b.accessToken, { campusId: camp.rows[0].id });
  const me = await call('GET', '/auth/me', ls.b.accessToken); check('campus persistence under app role', pc.s === 200 && me.b.campusId === camp.rows[0].id, JSON.stringify([pc.s, pc.b, me.b]));
  // rate limiting (guard ON): buckets are per verified user, IP fallback is not spoofable by headers
  const hit = async (tok, n, hdrs = {}) => { let lim = 0; for (let i = 0; i < n; i++) { const x = await fetch('http://127.0.0.1:3991/api/v1/orders/does-not-exist/status', { method: 'PATCH', headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...hdrs }, body: JSON.stringify({ status: 'READY' }) }); if (x.status === 429) lim++; } return lim; };
  const staffA = lt.b.accessToken;
  const limA = await hit(staffA, 110);
  check('staff A is rate limited at 100/min', limA > 0, `429s=${limA}`);
  const lt2 = await call('POST', '/auth/login', null, { email: 't2@split.dev', password: 'staff-pass-12345' });
  check('second staff login works', lt2.s === 200, String(lt2.s));
  check('staff B has a separate bucket (not limited while A is)', (await hit(lt2.b.accessToken, 20)) === 0);
  check('A stays limited', (await hit(staffA, 3)) === 3);
  const forged = staffA.split('.').slice(0, 2).join('.') + '.AAAA';
  const noneAlg = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: 'someone-else', exp: 4102444800 })).toString('base64url') + '.';
  const ipLim1 = await hit(forged, 105);
  check('forged token falls back to the IP bucket and gets limited', ipLim1 > 0, `429s=${ipLim1}`);
  check('alg=none token cannot claim another user bucket (shares the IP bucket, still limited)', (await hit(noneAlg, 3)) === 3);
  check('X-Forwarded-For / X-Real-IP spoofing does not escape the IP bucket', (await hit(null, 3, { 'x-forwarded-for': '203.0.113.77', 'x-real-ip': '203.0.113.78' })) === 3);
  await app.end(); await owner.end();
} catch (e) { console.log('ERROR', e.message.slice(0, 300)); fails++; }
child?.kill(); await server.stop();
console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
