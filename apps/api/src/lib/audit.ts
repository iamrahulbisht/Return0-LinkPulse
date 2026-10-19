import { Prisma } from '@prisma/client';
import { prisma } from './db';

export interface AuditEntry {
  actorId: string | null;
  linkId?: string | null;
  /** The account an admin action was about (account history on the admin user page). */
  subjectUserId?: string | null;
  action: string;
  target: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
}

type Tx = Prisma.TransactionClient | typeof prisma;

const json = (v: unknown) => (v === undefined || v === null ? Prisma.JsonNull : (v as Prisma.InputJsonValue));

/** Every admin action and every link edit is written here (old value → new value). */
export async function writeAudit(entry: AuditEntry, tx: Tx = prisma): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId,
      linkId: entry.linkId ?? null,
      subjectUserId: entry.subjectUserId ?? null,
      action: entry.action,
      target: entry.target,
      oldValue: json(entry.oldValue),
      newValue: json(entry.newValue),
      reason: entry.reason ?? null,
    },
  });
}
