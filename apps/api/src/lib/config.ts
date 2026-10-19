import 'dotenv/config';
import { z } from 'zod';

const url = z.string().url();

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  // Empty = run without Redis. Otherwise a full redis:// or rediss:// URL with a host, checked here so a bad value
  // fails with a clear message instead of ioredis crashing and printing the URL (with its password) to the logs.
  REDIS_URL: z
    .string()
    .optional()
    .default('')
    .refine((v) => {
      if (!v) return true;
      try {
        const u = new URL(v);
        return (u.protocol === 'redis:' || u.protocol === 'rediss:') && u.hostname !== '';
      } catch {
        return false;
      }
    }, 'must be redis://user:password@host:port or rediss://… (host and port missing?)'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  HASH_SALT: z.string().min(16, 'HASH_SALT must be at least 16 characters'),
  SHORT_BASE_URL: url.default('http://localhost:4000'),
  // One or more web app origins, comma-separated. The first is the main one (links in visitor pages);
  // the others are allowed too (for example Vercel preview URLs).
  WEB_ORIGIN: z
    .string()
    .default('http://localhost:5173')
    .transform((v) => v.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean))
    .pipe(z.array(url).min(1, 'WEB_ORIGIN needs at least one URL')),
  // How many proxies sit in front of the API. Render = 1.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
  RUN_WORKER: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  TZ_DISPLAY: z.string().default('Asia/Kolkata'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Print which variables are wrong, never their values.
  const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
  throw new Error(`Invalid environment:\n  ${problems}`);
}

const d = parsed.data;

// Catch the most common deploy mistake: production still pointing at localhost.
if (d.NODE_ENV === 'production') {
  const local = [d.SHORT_BASE_URL, ...d.WEB_ORIGIN].filter((u) => /\/\/(localhost|127\.0\.0\.1)/.test(u));
  if (local.length) throw new Error('In production, SHORT_BASE_URL and WEB_ORIGIN must be public https URLs, not localhost.');
}

export const config = {
  ...d,
  /** The main web app origin. */
  WEB_ORIGIN: d.WEB_ORIGIN[0],
  webOrigins: d.WEB_ORIGIN,
  isProd: d.NODE_ENV === 'production',
  isTest: d.NODE_ENV === 'test',
  shortBase: d.SHORT_BASE_URL.replace(/\/$/, ''),
  shortHost: new URL(d.SHORT_BASE_URL).host,
  webHost: new URL(d.WEB_ORIGIN[0]).hostname,
};

/** Hosts that count as "LinkPulse itself" for the redirect-loop check. */
export function ownHosts(): string[] {
  return [new URL(config.SHORT_BASE_URL).hostname, ...config.webOrigins.map((o) => new URL(o).hostname), 'lp.in'];
}
