import bcrypt from 'bcryptjs';
import type { Device, Prisma } from '@prisma/client';
import { prisma, isUniqueViolation } from '../lib/db';
import { config, ownHosts } from '../lib/config';
import { getBlockedDomains } from '../lib/blocklist';
import { ApiError, type FieldIssue } from '../lib/errors';
import { writeAudit } from '../lib/audit';
import { aliasCandidates, checkAliasFormat, normaliseAlias, takenIssue } from '../logic/alias';
import { generateCode, MAX_CODE_ATTEMPTS } from '../logic/codes';
import { validateDestination, type UrlIssue } from '../logic/url';
import { linkInclude } from '../lib/serialize';

export async function checkUrl(url: string, field = 'destination'): Promise<UrlIssue[]> {
  return validateDestination(url, { ownHosts: ownHosts(), blockedDomains: await getBlockedDomains() }, field);
}

/** Suggestions that are actually free right now. */
export async function freeAliasSuggestions(alias: string, max = 3): Promise<string[]> {
  const cands = aliasCandidates(alias);
  const used = await prisma.link.findMany({ where: { code: { in: cands } }, select: { code: true } });
  const usedSet = new Set(used.map((u) => u.code));
  return cands.filter((c) => !usedSet.has(c)).slice(0, max);
}

export interface AliasCheck {
  value: string;
  state: 'ok' | 'bad' | 'empty';
  issue: FieldIssue | null;
  suggestions: string[];
  /** The taken alias is a link in the same workspace (CSV import says "Already a link of yours"). */
  ownedByYou: boolean;
}

export async function checkAlias(raw: string | undefined | null, workspaceId: string): Promise<AliasCheck> {
  const value = normaliseAlias(raw ?? '');
  if (!value) return { value, state: 'empty', issue: null, suggestions: [], ownedByYou: false };
  const fmt = checkAliasFormat(value);
  if (fmt) {
    const suggestions = fmt.code === 'ALIAS_RESERVED' ? await freeAliasSuggestions(value) : [];
    return { value, state: 'bad', issue: fmt, suggestions, ownedByYou: false };
  }
  const existing = await prisma.link.findUnique({ where: { code: value }, select: { workspaceId: true } });
  if (existing) {
    return {
      value,
      state: 'bad',
      issue: takenIssue(value, config.shortHost),
      suggestions: await freeAliasSuggestions(value),
      ownedByYou: existing.workspaceId === workspaceId,
    };
  }
  return { value, state: 'ok', issue: null, suggestions: [], ownedByYou: false };
}

export interface CreateLinkInput {
  destination: string;
  alias?: string | null;
  title?: string | null;
  campaignId?: string | null;
  folderId?: string | null;
  tags?: string[];
  expiresAt?: Date | null;
  fallbackUrl?: string | null;
  clickLimit?: number | null;
  password?: string | null;
  rules?: { device: Device; destination: string }[];
}

export interface Actor {
  id: string;
  workspaceId: string;
}

/** Runs every check the wizard shows. Throws one 400/409 listing all problems. */
export async function validateCreate(input: CreateLinkInput, actor: Actor, now = new Date()): Promise<void> {
  const issues: FieldIssue[] = [...(await checkUrl(input.destination))];
  if (input.alias) {
    const a = await checkAlias(input.alias, actor.workspaceId);
    if (a.issue) {
      if (a.issue.code === 'ALIAS_TAKEN') {
        throw new ApiError(409, 'ALIAS_TAKEN', a.issue.message, [{ ...a.issue, suggestions: a.suggestions }]);
      }
      issues.push(a.issue);
    }
  }
  if (input.expiresAt && input.expiresAt.getTime() <= now.getTime()) {
    issues.push({ field: 'expiresAt', code: 'EXPIRY_PAST', message: 'The expiry date is in the past. Pick a later date.' });
  }
  if (input.fallbackUrl) issues.push(...(await checkUrl(input.fallbackUrl, 'fallbackUrl')));
  for (const [i, r] of (input.rules ?? []).entries()) issues.push(...(await checkUrl(r.destination, `rules.${i}.destination`)));
  if (input.campaignId) {
    const c = await prisma.campaign.findFirst({ where: { id: input.campaignId, workspaceId: actor.workspaceId } });
    if (!c) issues.push({ field: 'campaignId', code: 'CAMPAIGN_NOT_FOUND', message: 'Pick one of your campaigns.' });
  }
  if (issues.length) throw new ApiError(400, issues[0].code, issues[0].message, issues);
}

/** Tags belong to the workspace; `ownerId` records who made a new one. */
export async function tagIdsFor(
  workspaceId: string,
  ownerId: string,
  names: string[],
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const clean = [...new Set(names.map((n) => n.trim().toLowerCase().replace(/^#/, '')).filter(Boolean))].slice(0, 10);
  if (!clean.length) return [];
  // Two queries however many tags (one upsert per tag was slow enough on a remote DB to time out the transaction).
  await tx.tag.createMany({ data: clean.map((name) => ({ workspaceId, ownerId, name })), skipDuplicates: true });
  const tags = await tx.tag.findMany({ where: { workspaceId, name: { in: clean } }, select: { id: true } });
  return tags.map((t) => t.id);
}

/**
 * Creates a link. Custom alias: the unique index is the final guard (two people, same second → one 409).
 * Random code: retry up to 5 times on the (very rare) clash.
 */
export async function createLink(input: CreateLinkInput, actor: Actor, via: 'wizard' | 'import' = 'wizard') {
  const passwordHash = input.password ? await bcrypt.hash(input.password, 10) : null;
  const custom = input.alias ? normaliseAlias(input.alias) : null;
  const attempts = custom ? 1 : MAX_CODE_ATTEMPTS;
  for (let i = 0; i < attempts; i++) {
    const code = custom ?? generateCode();
    try {
      return await prisma.$transaction(async (tx) => {
        const tagIds = await tagIdsFor(actor.workspaceId, actor.id, input.tags ?? [], tx);
        const link = await tx.link.create({
          data: {
            code,
            customAlias: !!custom,
            destination: input.destination.trim(),
            ownerId: actor.id,
            workspaceId: actor.workspaceId,
            folderId: input.folderId ?? null,
            campaignId: input.campaignId ?? null,
            title: input.title?.trim() || null,
            expiresAt: input.expiresAt ?? null,
            fallbackUrl: input.fallbackUrl?.trim() || null,
            clickLimit: input.clickLimit ?? null,
            passwordHash,
            tags: { create: tagIds.map((tagId) => ({ tagId })) },
            rules: {
              create: (input.rules ?? []).map((r, idx) => ({ device: r.device, destination: r.destination.trim(), priority: idx + 1 })),
            },
          },
          include: linkInclude,
        });
        await writeAudit(
          { actorId: actor.id, linkId: link.id, action: 'link_created', target: code, newValue: { via, destination: link.destination } },
          tx,
        );
        return link;
      });
    } catch (err) {
      if (!isUniqueViolation(err, 'code')) throw err;
      if (custom) {
        throw new ApiError(409, 'ALIAS_TAKEN', 'That alias was just taken. Pick another one.', [
          { field: 'alias', code: 'ALIAS_TAKEN', message: 'That alias was just taken.', suggestions: await freeAliasSuggestions(custom) },
        ]);
      }
    }
  }
  throw new ApiError(500, 'CODE_CLASH', 'Could not make a free short code. Please try again.');
}
