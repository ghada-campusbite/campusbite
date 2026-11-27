// Starts a real (embedded) PostgreSQL, runs jest against it, then stops it.
// Usage: npm run test:e2e
import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'child_process';

const pg = new EmbeddedPostgres({ databaseDir: '/tmp/pg-embed/data', user: 'cb', password: 'cbpass', port: 5544, persistent: true, onLog: () => {} });
await pg.start();
try { await pg.createDatabase('campusbite'); } catch {}
const env = { ...process.env, DATABASE_URL: 'postgresql://cb:cbpass@localhost:5544/campusbite', THROTTLE_ORDER_PER_MIN: '10000' };
const code = await new Promise((res) => spawn('npx', ['jest', '-c', 'jest.e2e.json', '--runInBand'], { stdio: 'inherit', env }).on('exit', res));
await pg.stop();
process.exit(code);
