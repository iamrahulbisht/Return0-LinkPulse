import type { Campaign, Link, LinkTag, RedirectRule, Tag, User } from '@prisma/client';
import { computeStatus } from '../logic/rules';
import { config } from './config';

export type LinkWithRelations = Link & {
  campaign?: Pick<Campaign, 'id' | 'name'> | null;
  tags?: (LinkTag & { tag: Pick<Tag, 'name'> })[];
  rules?: RedirectRule[];
  owner?: Pick<User, 'id' | 'name' | 'email'>;
  _count?: { qrCodes?: number };
};

export const linkInclude = {
  campaign: { select: { id: true, name: true } },
  tags: { include: { tag: { select: { name: true } } } },
  rules: { orderBy: { priority: 'asc' as const } },
  owner: { select: { id: true, name: true, email: true } },
  _count: { select: { qrCodes: true } },
};

export function shortUrl(code: string): string {
  return `${config.shortBase}/${code}`;
}

export function linkDto(l: LinkWithRelations, now = new Date()) {
  return {
    id: l.id,
    code: l.code,
    shortUrl: shortUrl(l.code),
    customAlias: l.customAlias,
    destination: l.destination,
    title: l.title,
    status: computeStatus(l, now),
    disabledReason: l.disabledReason,
    expiresAt: l.expiresAt?.toISOString() ?? null,
    fallbackUrl: l.fallbackUrl,
    clickLimit: l.clickLimit,
    clickCount: l.clickCount,
    hasPassword: !!l.passwordHash,
    campaign: l.campaign ? { id: l.campaign.id, name: l.campaign.name } : null,
    tags: (l.tags ?? []).map((t) => t.tag.name).sort(),
    rules: (l.rules ?? []).map((r) => ({ id: r.id, device: r.device, destination: r.destination, priority: r.priority })),
    owner: l.owner ? { id: l.owner.id, name: l.owner.name } : null,
    qrCount: l._count?.qrCodes ?? 0,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

export type LinkDto = ReturnType<typeof linkDto>;
