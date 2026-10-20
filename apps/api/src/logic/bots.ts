export type ClickType = 'human' | 'preview_bot' | 'scanner' | 'suspicious';

// Email and security link scanners open links to check them before a person does.
const SCANNER_MARKERS = ['scanner', 'safelinks', 'urlscan', 'proofpoint', 'mimecast', 'barracuda', 'virustotal'];

// Link-preview bots (chat apps, social sites) and generic crawlers / tools.
const BOT_MARKERS = [
  'facebookexternalhit',
  'whatsapp',
  'telegrambot',
  'slackbot',
  'twitterbot',
  'discordbot',
  'linkedinbot',
  'googlebot',
  'bingbot',
  'bot',
  'crawler',
  'spider',
  'preview',
  'curl',
  'wget',
  'python-requests',
  'headless',
];

/** Classifies a visit from its user agent alone. */
export function classifyUserAgent(ua: string | undefined | null): ClickType {
  const s = (ua ?? '').trim().toLowerCase();
  if (!s) return 'suspicious';
  if (SCANNER_MARKERS.some((m) => s.includes(m))) return 'scanner';
  if (BOT_MARKERS.some((m) => s.includes(m))) return 'preview_bot';
  return 'human';
}

/** A short, friendly name for a known bot, shown as "Device and browser" in visit tables. */
export function botLabel(ua: string | undefined | null): string {
  const s = (ua ?? '').toLowerCase();
  if (!s.trim()) return 'No user agent';
  if (s.includes('whatsapp')) return 'WhatsApp preview';
  if (s.includes('telegram')) return 'Telegram preview';
  if (s.includes('slack')) return 'Slack preview';
  if (s.includes('discord')) return 'Discord preview';
  if (s.includes('facebookexternalhit')) return 'Facebook preview';
  if (s.includes('twitterbot')) return 'X preview';
  if (s.includes('linkedinbot')) return 'LinkedIn preview';
  if (s.includes('googlebot') || s.includes('bingbot')) return 'Search crawler';
  if (SCANNER_MARKERS.some((m) => s.includes(m))) return 'Link scanner';
  if (s.includes('curl') || s.includes('wget') || s.includes('python-requests')) return 'Script';
  return 'Bot';
}

/** More than 10 hits from one visitor on one link within 10 seconds is treated as suspicious. */
export const BURST_WINDOW_SECONDS = 10;
export const BURST_MAX_HITS = 10;

export function isBurst(hitsInWindow: number): boolean {
  return hitsInWindow > BURST_MAX_HITS;
}

/** Final type: user agent first, then the burst check can downgrade a "human" to "suspicious". */
export function finalClickType(uaType: ClickType, hitsInWindow: number): ClickType {
  if (uaType !== 'human') return uaType;
  return isBurst(hitsInWindow) ? 'suspicious' : 'human';
}
