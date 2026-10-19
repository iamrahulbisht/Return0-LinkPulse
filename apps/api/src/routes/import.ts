import { Router } from 'express';
import multer from 'multer';
import Papa from 'papaparse';
import { z } from 'zod';
import { prisma } from '../lib/db';
import { ApiError } from '../lib/errors';
import { h, parse } from '../middleware/errors';
import { checkAliasFormat, normaliseAlias } from '../logic/alias';
import { splitPastedLinks } from '../logic/paste';
import { checkUrl, createLink, freeAliasSuggestions } from '../services/links';
import { config } from '../lib/config';

export const importRouter = Router();

const MAX_ROWS = 500;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.csv$/i.test(file.originalname) || ['text/csv', 'application/vnd.ms-excel', 'text/plain'].includes(file.mimetype);
    if (ok) cb(null, true);
    else cb(new ApiError(400, 'NOT_CSV', 'Upload a .csv file.'));
  },
});

export type RowResult = 'valid' | 'alias_taken' | 'duplicate_in_file' | 'invalid_url' | 'blocked_domain' | 'invalid_alias';

export interface InputRow {
  row: number;
  alias: string;
  destination: string;
  tags: string[];
}

export interface CheckedRow extends InputRow {
  result: RowResult;
  fix: string | null;
  suggestions: string[];
}

const splitTags = (s: string) =>
  s
    .split(/[\s,;|]+/)
    .map((t) => t.trim().replace(/^#/, '').toLowerCase())
    .filter(Boolean)
    .slice(0, 10);

/** Checks each row on its own, plus duplicates inside the file. Same URL rules as the wizard. */
export async function checkRows(rows: InputRow[], workspaceId: string): Promise<CheckedRow[]> {
  const aliases = rows.map((r) => normaliseAlias(r.alias)).filter(Boolean);
  const existing = await prisma.link.findMany({ where: { code: { in: aliases } }, select: { code: true, workspaceId: true } });
  const taken = new Map(existing.map((e) => [e.code, e.workspaceId]));
  const seen = new Map<string, number>();
  const out: CheckedRow[] = [];
  for (const r of rows) {
    const alias = normaliseAlias(r.alias);
    const base = { ...r, alias, suggestions: [] as string[] };
    const urlIssues = await checkUrl(r.destination);
    const blocked = urlIssues.find((i) => i.code === 'URL_BLOCKED');
    const bad = urlIssues.find((i) => i.code !== 'URL_BLOCKED');
    if (blocked) {
      out.push({ ...base, result: 'blocked_domain', fix: 'This site is blocked for spam. It cannot be imported.' });
      continue;
    }
    if (bad) {
      const fix = /^htp|^htps|^http:\/[^/]|^https:\/[^/]/i.test(r.destination)
        ? 'Check the spelling: it should start with https://'
        : bad.code === 'URL_LOOP'
          ? 'This points back to LinkPulse. Use the real destination.'
          : `${bad.message} Check the address.`;
      out.push({ ...base, result: 'invalid_url', fix });
      continue;
    }
    if (alias) {
      const fmt = checkAliasFormat(alias);
      if (fmt) {
        out.push({ ...base, result: 'invalid_alias', fix: fmt.message });
        continue;
      }
      if (seen.has(alias)) {
        out.push({ ...base, result: 'duplicate_in_file', fix: `Same alias as row ${seen.get(alias)}. Rename one of them.` });
        continue;
      }
      seen.set(alias, r.row);
      if (taken.has(alias)) {
        const sugg = await freeAliasSuggestions(alias, 2);
        const yours = taken.get(alias) === workspaceId;
        out.push({
          ...base,
          result: 'alias_taken',
          suggestions: sugg,
          fix: yours
            ? `Already a link of yours. Use ${sugg[0] ?? alias + '-2'} or skip it.`
            : `Someone already uses ${config.shortHost}/${alias}. Rename it, for example ${sugg[0] ?? alias + '-2'}.`,
        });
        continue;
      }
    }
    out.push({ ...base, result: 'valid', fix: null });
  }
  return out;
}

function summary(rows: CheckedRow[]) {
  const s = { total: rows.length, valid: 0, alias_taken: 0, duplicate_in_file: 0, invalid_url: 0, blocked_domain: 0, invalid_alias: 0 };
  for (const r of rows) s[r.result]++;
  return s;
}

/** Upload → row-by-row report. Nothing is saved yet. */
importRouter.post(
  '/preview',
  upload.single('file'),
  h(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'NO_FILE', 'Choose a CSV file to upload.');
    const raw = req.file.buffer.toString('utf8');
    // Excel adds a byte-order mark at the start of CSV files; drop it.
    const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (hdr) => hdr.trim().toLowerCase(),
    });
    const fields = parsed.meta.fields ?? [];
    if (!fields.includes('destination')) {
      throw new ApiError(400, 'BAD_COLUMNS', 'The file needs a "destination" column. Columns: alias, destination, tags.');
    }
    if (parsed.data.length > MAX_ROWS) throw new ApiError(400, 'TOO_MANY_ROWS', `Up to ${MAX_ROWS} rows per file.`);
    const rows: InputRow[] = parsed.data.map((r, i) => ({
      row: i + 1,
      alias: String(r.alias ?? '').slice(0, 60),
      destination: String(r.destination ?? '').trim().slice(0, 2048),
      tags: splitTags(String(r.tags ?? '')),
    }));
    const checked = await checkRows(rows, req.user!.workspaceId);
    res.json({ fileName: req.file.originalname, columns: fields, rows: checked, summary: summary(checked) });
  }),
);

// Stays under the 200 kb JSON body limit in app.ts.
export const MAX_PASTE_CHARS = 150_000;
const pasteSchema = z.object({
  text: z.string().max(MAX_PASTE_CHARS, 'That is too much text. Paste up to 500 links at a time.'),
});

/**
 * Pasted links → the same row-by-row report as a CSV (destination only, random codes, no tags).
 * Nothing is saved yet; the browser commits the valid rows with POST /commit like a CSV import.
 */
importRouter.post(
  '/preview-text',
  h(async (req, res) => {
    const { text } = parse(pasteSchema, req.body);
    const links = splitPastedLinks(text);
    if (!links.length) throw new ApiError(400, 'NO_LINKS', 'Paste at least one link.');
    if (links.length > MAX_ROWS) throw new ApiError(400, 'TOO_MANY_ROWS', `Up to ${MAX_ROWS} links at a time.`);
    const rows: InputRow[] = links.map((destination, i) => ({ row: i + 1, alias: '', destination: destination.slice(0, 2048), tags: [] }));
    const checked = await checkRows(rows, req.user!.workspaceId);
    res.json({ fileName: 'Pasted links', columns: ['destination'], rows: checked, summary: summary(checked) });
  }),
);

const commitSchema = z.object({
  campaignId: z.string().uuid().nullable().optional(),
  rows: z
    .array(
      z.object({
        row: z.number().int().min(1),
        alias: z.string().max(60).default(''),
        destination: z.string().max(2048),
        tags: z.array(z.string().max(30)).max(10).default([]),
      }),
    )
    .min(1, 'Pick at least one row to import.')
    .max(MAX_ROWS),
});

/**
 * Imports only rows that are still valid. The browser sends back the rows it wants;
 * the server checks them all again (an alias may have been taken since the preview).
 */
importRouter.post(
  '/commit',
  h(async (req, res) => {
    const body = parse(commitSchema, req.body);
    if (body.campaignId) {
      const c = await prisma.campaign.findFirst({ where: { id: body.campaignId, workspaceId: req.user!.workspaceId } });
      if (!c) throw new ApiError(400, 'CAMPAIGN_NOT_FOUND', 'Pick one of your campaigns.');
    }
    const checked = await checkRows(body.rows, req.user!.workspaceId);
    const actor = { id: req.user!.id, workspaceId: req.user!.workspaceId };
    const results: (CheckedRow & { linkId?: string; code?: string })[] = [];
    for (const r of checked) {
      if (r.result !== 'valid') {
        results.push(r);
        continue;
      }
      try {
        const link = await createLink(
          { destination: r.destination, alias: r.alias || null, tags: r.tags, campaignId: body.campaignId ?? null },
          actor,
          'import',
        );
        results.push({ ...r, linkId: link.id, code: link.code });
      } catch (err) {
        if (err instanceof ApiError && err.code === 'ALIAS_TAKEN') {
          results.push({ ...r, result: 'alias_taken', fix: 'That alias was just taken. Rename it and upload again.' });
        } else throw err;
      }
    }
    const imported = results.filter((r) => r.linkId).length;
    res.json({ imported, skipped: results.length - imported, rows: results });
  }),
);
