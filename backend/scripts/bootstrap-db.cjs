// One-time owner bootstrap: migrate + create/refresh the restricted runtime role.
// Inputs (env): MIGRATE_DATABASE_URL (owner, direct host), APP_DB_PASSWORD (new password for role campusbite_app).
// Prints the host/db name only, never a password. Safe to re-run (idempotent).
const { execSync } = require('child_process');
const { Client } = require('pg');
const url = process.env.MIGRATE_DATABASE_URL, pw = process.env.APP_DB_PASSWORD;
if (!url || !pw) { console.error('need MIGRATE_DATABASE_URL and APP_DB_PASSWORD'); process.exit(1); }
if (!/^[A-Za-z0-9_\-]{16,}$/.test(pw)) { console.error('APP_DB_PASSWORD must be 16+ letters/digits/_/-'); process.exit(1); }
(async () => {
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'inherit' });
  const c = new Client({ connectionString: url }); await c.connect();
  const db = (await c.query('select current_database() d')).rows[0].d;
  const q = (s) => c.query(s);
  const has = (await q("select 1 from pg_roles where rolname='campusbite_app'")).rowCount;
  await q(`${has ? 'ALTER' : 'CREATE'} ROLE campusbite_app LOGIN PASSWORD '${pw}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
  await q(`GRANT CONNECT ON DATABASE "${db}" TO campusbite_app`);
  await q('GRANT USAGE ON SCHEMA public TO campusbite_app');
  await q('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO campusbite_app');
  await q('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO campusbite_app');
  await q('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO campusbite_app');
  await q('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO campusbite_app');
  await q('REVOKE ALL ON TABLE _prisma_migrations FROM campusbite_app');
  await c.end();
  console.log(`bootstrap ok: database "${db}", role campusbite_app ready`);
})().catch((e) => { console.error('bootstrap failed:', String(e.message).replace(pw, '***').slice(0, 300)); process.exit(1); });
