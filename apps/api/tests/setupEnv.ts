// Test environment. Uses a separate database and Redis DB 1, so tests never touch dev data.
// Override with TEST_DATABASE_URL / TEST_REDIS_URL (CI sets these).
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://linkpulse:linkpulse_local_only@localhost:5433/linkpulse_test';
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6380/1';
process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough';
process.env.HASH_SALT = 'test-hash-salt-that-is-long-enough';
process.env.SHORT_BASE_URL = 'https://lp.example.com';
process.env.WEB_ORIGIN = 'https://app.linkpulse.example';
process.env.RUN_WORKER = 'true';
