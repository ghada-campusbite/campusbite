// Verifies TRUST_PROXY_HOPS=1 behind a REAL forwarding proxy hop (like Caddy in compose).
// Two local proxies play two internet clients: each strips client-sent forwarding headers
// and sets X-Forwarded-For to its own fixed "client IP", then forwards to the API.
// Usage: npm run build && node test/proxy-hops.mjs
import EmbeddedPostgres from 'embedded-postgres';
import { spawn, execSync } from 'child_process';
import http from 'http';
import * as argon2 from 'argon2';
import pg from 'pg';

const DBPORT = 5549, APP_PW = 'app-pass-local-test-0002', API = 3993;
const server = new EmbeddedPostgres({ databaseDir: '/tmp/pg-proxy/data', user: 'owner', password: 'ownerpass', port: DBPORT, persistent: false, onLog: () => {} });
await server.initialise(); await server.start();
await server.createDatabase('cbproxy');
const OWNER = `postgresql://owner:ownerpass@localhost:${DBPORT}/cbproxy`;
let fails = 0; const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!ok) fails++; };
let child; const proxies = [];
try {
  execSync('node scripts/bootstrap-db.cjs', { env: { ...process.env, MIGRATE_DATABASE_URL: OWNER, APP_DB_PASSWORD: APP_PW }, stdio: 'pipe' });
  const owner = new pg.Client({ connectionString: OWNER }); await owner.connect();
  const h = await argon2.hash('student-pass-123');
  await owner.query(`INSERT INTO "User"(id,email,name,"passwordHash",role,"emailVerifiedAt") VALUES (gen_random_uuid(),'s@proxy.dev','S',$1,'STUDENT',now())`, [h]);
  await owner.end();

  child = spawn('node', ['dist/main.js'], { env: { ...process.env, DATABASE_URL: `postgresql://campusbite_app:${APP_PW}@localhost:${DBPORT}/cbproxy`, PORT: String(API), TRUST_PROXY_HOPS: '1', JWT_ACCESS_SECRET: 'x'.repeat(40), JWT_REFRESH_SECRET: 'y'.repeat(40), CORS_ORIGINS: '' }, stdio: ['ignore', 'inherit', 'inherit'] });
  for (let i = 0; i < 40; i++) { try { if ((await fetch(`http://127.0.0.1:${API}/api/v1/health`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }

  // a forwarding proxy that (like Caddy) overwrites client-sent forwarding headers with the real client IP
  const makeProxy = (port, clientIp) => new Promise((res) => {
    const srv = http.createServer((req, out) => {
      const headers = { ...req.headers, 'x-forwarded-for': clientIp };
      delete headers['x-real-ip'];
      const p = http.request({ host: '127.0.0.1', port: API, path: req.url, method: req.method, headers }, (pr) => { out.writeHead(pr.statusCode, pr.headers); pr.pipe(out); });
      p.on('error', () => { out.writeHead(502); out.end(); });
      req.pipe(p);
    });
    srv.listen(port, () => res(srv)); proxies.push(srv);
  });
  await makeProxy(4101, '10.0.0.1'); // "client A" as seen through the proxy
  await makeProxy(4102, '10.0.0.2'); // "client B" as seen through the proxy

  const hit = async (port, n, hdrs = {}) => {
    let lim = 0;
    for (let i = 0; i < n; i++) {
      const x = await fetch(`http://127.0.0.1:${port}/api/v1/orders/does-not-exist/status`, { method: 'PATCH', headers: { 'content-type': 'application/json', ...hdrs }, body: JSON.stringify({ status: 'READY' }) });
      if (x.status === 429) lim++;
    }
    return lim;
  };

  const limA = await hit(4101, 105);
  check('client A (proxied IP 10.0.0.1) is rate limited at 100/min', limA > 0, `429s=${limA}`);
  check('client B (proxied IP 10.0.0.2) has its own bucket', (await hit(4102, 20)) === 0);
  check('client-sent X-Forwarded-For through the proxy is overwritten (A stays limited)', (await hit(4101, 3, { 'x-forwarded-for': '203.0.113.99', 'x-real-ip': '203.0.113.98' })) === 3);
  // documents the deployment rule: with hops=1 the API must not be reachable directly, or XFF spoofing works
  check('DIRECT access trusts XFF (hops=1) - direct access must be firewalled in deploy', (await hit(API, 3, { 'x-forwarded-for': '203.0.113.5' })) === 0);
} catch (e) { console.log('ERROR', e.message.slice(0, 300)); fails++; }
child?.kill(); for (const p of proxies) p.close(); await server.stop();
console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
