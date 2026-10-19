import { Prisma, PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  // Unique-index clashes are expected (alias races) and handled, so tests stay quiet.
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : process.env.NODE_ENV === 'test' ? [] : ['error'],
  // Prisma's default 5 s is too tight when the database is far away (a laptop talking to Neon in Singapore):
  // a link create with tags is a few round trips, and a timed-out transaction became a 500.
  transactionOptions: { maxWait: 10_000, timeout: 15_000 },
});

/** True when Postgres rejected an insert because a unique index already has that value. */
export function isUniqueViolation(err: unknown, field?: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false;
  if (!field) return true;
  const target = (err.meta?.target ?? []) as string[] | string;
  return Array.isArray(target) ? target.includes(field) : String(target).includes(field);
}
