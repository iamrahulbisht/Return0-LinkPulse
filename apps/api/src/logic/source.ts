export type ClickSource = 'link' | 'qr' | 'bio';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `?src=qr&q=<qr_id>` → qr, `?src=bio` → bio, anything else → link. */
export function parseSource(query: Record<string, unknown>): { source: ClickSource; qrId: string | null } {
  const src = typeof query.src === 'string' ? query.src : '';
  if (src === 'qr') {
    const q = typeof query.q === 'string' && UUID_RE.test(query.q) ? query.q : null;
    return { source: 'qr', qrId: q };
  }
  if (src === 'bio') return { source: 'bio', qrId: null };
  return { source: 'link', qrId: null };
}

/** The "where clicks come from" bucket shown on the dashboard. Mirrors the SQL in routes/analytics. */
export function channelOf(source: ClickSource, referrer: string | null | undefined): string {
  if (source === 'qr') return 'QR scan';
  if (source === 'bio') return 'Bio page';
  const r = (referrer ?? '').toLowerCase();
  if (!r) return 'Direct link';
  if (r.includes('whatsapp')) return 'WhatsApp';
  return 'Other';
}
