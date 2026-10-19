import { UAParser } from 'ua-parser-js';

export type RuleDevice = 'ios' | 'android' | 'desktop';

export interface ParsedAgent {
  /** For device rules: ios / android / desktop. */
  ruleDevice: RuleDevice;
  /** For reports: android / ios / desktop / tablet. */
  device: string;
  os: string | null;
  browser: string | null;
}

export function parseAgent(ua: string): ParsedAgent {
  const r = new UAParser(ua).getResult();
  const osName = r.os.name ?? null;
  const type = r.device.type; // mobile | tablet | undefined (desktop) | ...
  const os = (osName ?? '').toLowerCase();
  let ruleDevice: RuleDevice = 'desktop';
  if (os === 'ios' || os === 'ipados' || /iphone|ipad|ipod/i.test(ua)) ruleDevice = 'ios';
  else if (os === 'android') ruleDevice = 'android';
  let device: string = ruleDevice;
  if (type === 'tablet' && ruleDevice === 'desktop') device = 'tablet';
  return { ruleDevice, device, os: osName, browser: r.browser.name ?? null };
}

export interface DeviceRule {
  device: RuleDevice;
  destination: string;
  priority: number;
}

/** First matching rule by priority wins; no match → the link's main destination. */
export function pickDestination(defaultDest: string, rules: DeviceRule[], device: RuleDevice): string {
  const match = [...rules].sort((a, b) => a.priority - b.priority).find((r) => r.device === device);
  return match ? match.destination : defaultDest;
}
