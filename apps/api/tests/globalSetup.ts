import { execSync } from 'child_process';
import path from 'path';

/**
 * Brings the separate test database up to date with the migrations (non-destructive).
 * The database must exist: locally `docker compose exec postgres createdb -U linkpulse linkpulse_test`;
 * in CI the Postgres service creates it. Each test file then empties the tables itself.
 */
export default function globalSetup(): void {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://linkpulse:linkpulse_local_only@localhost:5433/linkpulse_test';
  if (!/_test\b|test/.test(new URL(url).pathname)) {
    throw new Error('Refusing to run tests against a database whose name does not contain "test".');
  }
  execSync('npx prisma migrate deploy', {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    stdio: 'pipe',
  });
}
