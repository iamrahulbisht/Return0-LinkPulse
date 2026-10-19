import { CODE_ALPHABET, CODE_LENGTH, generateCode, insertWithFreshCode, looksLikeCode } from '../../src/logic/codes';
import { aliasCandidates, checkAliasFormat, normaliseAlias } from '../../src/logic/alias';
import { findBlockedDomain, validateDestination } from '../../src/logic/url';
import { classifyUserAgent, finalClickType, isBurst } from '../../src/logic/bots';
import { visitorHash } from '../../src/logic/hash';
import { channelOf, parseSource } from '../../src/logic/source';
import { parseAgent, pickDestination } from '../../src/logic/device';
import { computeStatus, decide, type LinkSnapshot, type VisitContext } from '../../src/logic/rules';
import { computeAlerts, type AlertInput } from '../../src/logic/alerts';
import { endOfIstDay, formatIst, istDateKey } from '../../src/logic/time';
import { qrContrast } from '../../src/logic/contrast';
import { splitPastedLinks } from '../../src/logic/paste';
import { TEMP_PASSWORD_LENGTH, accountStatus, generateTempPassword } from '../../src/logic/account';
import { HUMAN_UA, IPHONE_UA } from '../fixtures/agents';

describe('short codes', () => {
  it('makes 7-character codes from the safe alphabet only', () => {
    for (let i = 0; i < 500; i++) {
      const c = generateCode();
      expect(c).toHaveLength(CODE_LENGTH);
      for (const ch of c) expect(CODE_ALPHABET).toContain(ch);
      expect(c).not.toMatch(/[01lIO]/);
    }
  });
  it('retries on a unique-index clash, up to 5 times', async () => {
    const codes = ['aaaaaaa', 'aaaaaaa', 'bbbbbbb'];
    let calls = 0;
    const result = await insertWithFreshCode(
      async (code) => {
        calls++;
        if (code === 'aaaaaaa') throw new Error('unique');
        return code;
      },
      (e) => (e as Error).message === 'unique',
      () => codes.shift()!,
    );
    expect(result).toBe('bbbbbbb');
    expect(calls).toBe(3);
  });
  it('gives up after 5 clashes', async () => {
    await expect(
      insertWithFreshCode(async () => Promise.reject(new Error('unique')), () => true, () => 'same'),
    ).rejects.toThrow('unique');
  });
  it('accepts only code-shaped paths', () => {
    expect(looksLikeCode('innovista26')).toBe(true);
    expect(looksLikeCode('favicon.ico')).toBe(false);
    expect(looksLikeCode('a'.repeat(31))).toBe(false);
  });
});

describe('alias validation', () => {
  it('accepts 3–30 lowercase letters, numbers, dashes', () => {
    expect(checkAliasFormat('innovista26')).toBeNull();
    expect(checkAliasFormat('hack-rules')).toBeNull();
  });
  it.each([['ab'], ['a'.repeat(31)], ['has space'], ['UPPER'], ['emoji🙂'], ['-lead'], ['trail-']])('rejects %s', (a) => {
    expect(checkAliasFormat(a)?.code).toBe('ALIAS_FORMAT');
  });
  it.each([['admin'], ['api'], ['login'], ['stream'], ['b']])('blocks reserved word %s', (a) => {
    const r = checkAliasFormat(a);
    expect(r?.code).toBe(a.length < 3 ? 'ALIAS_FORMAT' : 'ALIAS_RESERVED');
  });
  it('normalises to lowercase', () => expect(normaliseAlias('  InnoVista ')).toBe('innovista'));
  it('suggests alias26, alias-2026, alias-reg first', () => {
    expect(aliasCandidates('innovista').slice(0, 3)).toEqual(['innovista26', 'innovista-2026', 'innovista-reg']);
  });
});

describe('URL validation', () => {
  const ctx = { ownHosts: ['lp.example.com', 'app.linkpulse.example'], blockedDomains: ['bit-scam.example', 'free-recharge-offer.example.net'] };
  const codes = (u: string) => validateDestination(u, ctx).map((i) => i.code);
  it('accepts normal https links', () => expect(codes('https://forms.gle/innovista')).toEqual([]));
  it('blocks javascript:, data:, file:', () => {
    expect(codes('javascript:alert(1)')).toEqual(['URL_SCHEME']);
    expect(codes('data:text/html,hi')).toEqual(['URL_SCHEME']);
    expect(codes('file:///etc/passwd')).toEqual(['URL_SCHEME']);
  });
  it('needs a host with a dot', () => {
    expect(codes('https://localhost/x')).toEqual(['URL_INVALID']);
    expect(codes('not a url')).toEqual(['URL_INVALID']);
    expect(codes('')).toEqual(['URL_REQUIRED']);
  });
  it('rejects very long URLs', () => expect(codes('https://a.com/' + 'x'.repeat(2100))).toEqual(['URL_TOO_LONG']));
  it('stops redirect loops to our own domain', () => {
    expect(codes('https://lp.example.com/abc')).toEqual(['URL_LOOP']);
    expect(codes('https://APP.linkpulse.example/x')).toEqual(['URL_LOOP']);
  });
  it('blocks blocklisted domains and their sub-domains, not look-alikes', () => {
    expect(codes('https://bit-scam.example/a')).toEqual(['URL_BLOCKED']);
    expect(codes('https://www.bit-scam.example/a')).toEqual(['URL_BLOCKED']);
    expect(codes('https://notbit-scam.example/a')).toEqual([]);
    expect(findBlockedDomain('x.free-recharge-offer.example.net', ctx.blockedDomains)).toBe('free-recharge-offer.example.net');
  });
});

describe('bot detection', () => {
  it.each([
    ['WhatsApp/2.23.20.0 A', 'preview_bot'],
    ['facebookexternalhit/1.1', 'preview_bot'],
    ['TelegramBot (like TwitterBot)', 'preview_bot'],
    ['Slackbot-LinkExpanding 1.0', 'preview_bot'],
    ['curl/8.4.0', 'preview_bot'],
    ['python-requests/2.31', 'preview_bot'],
    ['Mozilla/5.0 HeadlessChrome/120', 'preview_bot'],
    ['Microsoft Office SafeLinks scanner', 'scanner'],
    ['', 'suspicious'],
    [HUMAN_UA, 'human'],
    [IPHONE_UA, 'human'],
  ])('%s → %s', (ua, type) => expect(classifyUserAgent(ua)).toBe(type));
  it('more than 10 hits in 10 s is suspicious', () => {
    expect(isBurst(10)).toBe(false);
    expect(isBurst(11)).toBe(true);
    expect(finalClickType('human', 11)).toBe('suspicious');
    expect(finalClickType('human', 3)).toBe('human');
    expect(finalClickType('preview_bot', 1)).toBe('preview_bot');
  });
});

describe('visitor hash', () => {
  const at = new Date('2026-10-18T10:00:00Z');
  it('is a sha256 hex and never contains the IP', () => {
    const h = visitorHash('203.0.113.9', HUMAN_UA, at, 'salt');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain('203.0.113.9');
  });
  it('is stable within one IST day and changes the next day', () => {
    const a = visitorHash('203.0.113.9', HUMAN_UA, at, 'salt');
    expect(visitorHash('203.0.113.9', HUMAN_UA, new Date('2026-10-18T15:00:00Z'), 'salt')).toBe(a);
    // 18:31 UTC on the 18th is already 19 Oct in IST.
    expect(visitorHash('203.0.113.9', HUMAN_UA, new Date('2026-10-18T18:31:00Z'), 'salt')).not.toBe(a);
  });
  it('changes with the salt', () => {
    expect(visitorHash('1.1.1.1', 'ua', at, 'a')).not.toBe(visitorHash('1.1.1.1', 'ua', at, 'b'));
  });
});

describe('source and device', () => {
  it('reads ?src=qr&q=<uuid>, ?src=bio, otherwise link', () => {
    const q = '0b7f2c66-3f0e-4c38-9a8f-3c3a4c7d0e11';
    expect(parseSource({ src: 'qr', q })).toEqual({ source: 'qr', qrId: q });
    expect(parseSource({ src: 'qr', q: 'not-a-uuid' })).toEqual({ source: 'qr', qrId: null });
    expect(parseSource({ src: 'bio' })).toEqual({ source: 'bio', qrId: null });
    expect(parseSource({})).toEqual({ source: 'link', qrId: null });
  });
  it('groups referrers into channels', () => {
    expect(channelOf('link', null)).toBe('Direct link');
    expect(channelOf('link', 'android-app://com.whatsapp/')).toBe('WhatsApp');
    expect(channelOf('link', 'https://t.co/')).toBe('Other');
    expect(channelOf('qr', null)).toBe('QR scan');
  });
  it('detects iPhone, Android and desktop', () => {
    expect(parseAgent(IPHONE_UA).ruleDevice).toBe('ios');
    expect(parseAgent(HUMAN_UA).ruleDevice).toBe('android');
    expect(parseAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/126.0').ruleDevice).toBe('desktop');
  });
  it('first matching device rule by priority wins', () => {
    const rules = [
      { device: 'ios' as const, destination: 'https://apps.apple.com/x', priority: 2 },
      { device: 'ios' as const, destination: 'https://first.example/x', priority: 1 },
    ];
    expect(pickDestination('https://default.example', rules, 'ios')).toBe('https://first.example/x');
    expect(pickDestination('https://default.example', rules, 'android')).toBe('https://default.example');
  });
});

describe('rule order (redirect engine)', () => {
  const base: LinkSnapshot = {
    id: 'l1', code: 'x', ownerId: 'u1', workspaceId: 'w1', destination: 'https://dest.example', status: 'active', expiresAt: null,
    fallbackUrl: null, clickLimit: null, passwordHash: null, title: null,
    rules: [{ device: 'ios', destination: 'https://ios.example', priority: 1 }],
  };
  const ctx: VisitContext = { now: new Date('2026-10-18T10:00:00Z'), destinationBlocked: false, unlocked: false, passwordLocked: false, clickType: 'human', device: 'android' };
  const past = '2026-10-01T00:00:00Z';

  it('disabled wins over everything (admin takedown first)', () => {
    expect(decide({ ...base, status: 'disabled', expiresAt: past, passwordHash: 'h' }, { ...ctx, clickType: 'preview_bot' }).kind).toBe('disabled');
  });
  it('a destination that is now blocked counts as disabled', () => {
    expect(decide(base, { ...ctx, destinationBlocked: true }).kind).toBe('disabled');
  });
  it('expired comes before the password', () => {
    const d = decide({ ...base, expiresAt: past, passwordHash: 'h', fallbackUrl: 'https://fallback.example' }, ctx);
    expect(d).toEqual({ step: 3, kind: 'expired', fallbackUrl: 'https://fallback.example' });
  });
  it('password before bot check and limit', () => {
    expect(decide({ ...base, passwordHash: 'h' }, { ...ctx, clickType: 'preview_bot' }).kind).toBe('password_required');
    expect(decide({ ...base, passwordHash: 'h' }, { ...ctx, passwordLocked: true }).kind).toBe('password_locked');
    expect(decide({ ...base, passwordHash: 'h' }, { ...ctx, unlocked: true }).kind).toBe('count_then_redirect');
  });
  it('bots redirect without counting', () => {
    expect(decide({ ...base, clickLimit: 1 }, { ...ctx, clickType: 'preview_bot' })).toEqual({
      step: 5, kind: 'bot_redirect', destination: 'https://dest.example', clickType: 'preview_bot',
    });
  });
  it('humans go to the limit step, with the device rule applied', () => {
    expect(decide(base, { ...ctx, device: 'ios' })).toEqual({ step: 6, kind: 'count_then_redirect', destination: 'https://ios.example' });
  });
  it('computes the UI status in the same order', () => {
    const now = new Date('2026-10-18T10:00:00Z');
    expect(computeStatus({ status: 'disabled', expiresAt: past, clickLimit: 1, clickCount: 5 }, now)).toBe('disabled');
    expect(computeStatus({ status: 'active', expiresAt: past, clickLimit: 1, clickCount: 5 }, now)).toBe('expired');
    expect(computeStatus({ status: 'active', expiresAt: null, clickLimit: 5, clickCount: 5 }, now)).toBe('limit_reached');
    expect(computeStatus({ status: 'active', expiresAt: null, clickLimit: 5, clickCount: 4 }, now)).toBe('active');
  });
});

describe('alerts', () => {
  const now = new Date('2026-10-18T10:00:00Z');
  const base: AlertInput = { status: 'active', expiresAt: null, clickLimit: null, clickCount: 0, lastHourHuman: 0, last7dHuman: 0, last24hBots: 0 };
  const types = (a: Partial<AlertInput>) => computeAlerts({ ...base, ...a }, now).map((x) => x.type);
  it('expiring within 48 hours', () => {
    expect(types({ expiresAt: new Date('2026-10-19T10:00:00Z') })).toEqual(['expiring']);
    expect(types({ expiresAt: new Date('2026-10-25T10:00:00Z') })).toEqual([]);
  });
  it('near limit at 80%', () => {
    expect(types({ clickLimit: 500, clickCount: 413 })).toEqual(['near_limit']);
    expect(types({ clickLimit: 500, clickCount: 300 })).toEqual([]);
    expect(types({ clickLimit: 500, clickCount: 500 })).toEqual([]); // already at limit, not "near"
  });
  it('spike: ≥5× hourly average and ≥20 clicks', () => {
    expect(types({ lastHourHuman: 40, last7dHuman: 168 })).toEqual(['spike']); // avg 1/h
    expect(types({ lastHourHuman: 19, last7dHuman: 0 })).toEqual([]);
    expect(types({ lastHourHuman: 40, last7dHuman: 168 * 10 })).toEqual([]); // avg 10/h
  });
  it('bot surge above 50 in 24 hours', () => {
    expect(types({ last24hBots: 64 })).toEqual(['bots']);
    expect(types({ last24hBots: 50 })).toEqual([]);
  });
  it('no alerts for disabled links', () => expect(types({ status: 'disabled', last24hBots: 99 })).toEqual([]));
});

describe('time zones (edge case 15): stored in UTC, shown in IST', () => {
  it('end of an IST day is 18:29 UTC', () => {
    expect(endOfIstDay('2026-10-30').toISOString()).toBe('2026-10-30T18:29:00.000Z');
  });
  it('IST date key rolls over at 18:30 UTC', () => {
    expect(istDateKey(new Date('2026-10-18T18:29:59Z'))).toBe('2026-10-18');
    expect(istDateKey(new Date('2026-10-18T18:30:00Z'))).toBe('2026-10-19');
  });
  it('formats in IST', () => {
    expect(formatIst(new Date('2026-10-30T18:29:00Z'))).toMatch(/30 Oct.*11:59\s?PM/);
  });
});

describe('QR colour contrast', () => {
  it('ink black and deep violet pass, light lavender fails', () => {
    expect(qrContrast('#0B0B0F').ok).toBe(true);
    expect(qrContrast('#5B3FD6').ok).toBe(true);
    expect(qrContrast('#166534').ok).toBe(true);
    expect(qrContrast('#C4B8FF').ok).toBe(false);
  });
});

describe('pasted links (bulk import)', () => {
  it('splits on new lines, spaces and tabs, ignoring blank lines', () => {
    const text = 'https://a.example.com\r\n\n  https://b.example.com https://c.example.com\thttps://d.example.com\n\n';
    expect(splitPastedLinks(text)).toEqual(['https://a.example.com', 'https://b.example.com', 'https://c.example.com', 'https://d.example.com']);
  });
  it('keeps commas inside a URL but drops a trailing , or ; from pasting', () => {
    expect(splitPastedLinks('https://a.example.com/?ids=1,2, https://b.example.com;')).toEqual(['https://a.example.com/?ids=1,2', 'https://b.example.com']);
  });
  it('returns nothing for empty or whitespace-only text', () => {
    expect(splitPastedLinks('')).toEqual([]);
    expect(splitPastedLinks(' \n\t ,')).toEqual([]);
  });
});

describe('account status (admin user management)', () => {
  const now = new Date('2026-10-19T10:00:00Z');
  const base = { suspendedAt: null, lockedUntil: null, mustChangePassword: false };
  it('is active with nothing set, or when an old lock has run out', () => {
    expect(accountStatus(base, now)).toBe('active');
    expect(accountStatus({ ...base, lockedUntil: new Date('2026-10-19T09:59:00Z') }, now)).toBe('active');
  });
  it('locked only while the lock is in the future', () => {
    expect(accountStatus({ ...base, lockedUntil: new Date('2026-10-19T10:04:00Z') }, now)).toBe('locked');
  });
  it('suspended beats locked, and locked beats a pending password reset', () => {
    const lock = new Date('2026-10-19T10:04:00Z');
    expect(accountStatus({ suspendedAt: now, lockedUntil: lock, mustChangePassword: true }, now)).toBe('suspended');
    expect(accountStatus({ ...base, lockedUntil: lock, mustChangePassword: true }, now)).toBe('locked');
    expect(accountStatus({ ...base, mustChangePassword: true }, now)).toBe('password_reset');
  });
});

describe('temporary password (admin reset)', () => {
  it('is 14 characters with no look-alike characters (0/O, 1/l/I)', () => {
    for (let i = 0; i < 200; i++) {
      const p = generateTempPassword();
      expect(p).toHaveLength(TEMP_PASSWORD_LENGTH);
      expect(p).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/);
    }
  });
  it('uses the random source it is given (crypto by default), so it is not guessable', () => {
    expect(generateTempPassword(() => 0)).toBe('A'.repeat(TEMP_PASSWORD_LENGTH));
    expect(new Set(Array.from({ length: 500 }, () => generateTempPassword())).size).toBe(500);
  });
});
