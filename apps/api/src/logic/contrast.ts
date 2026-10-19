// WCAG contrast ratio, used to warn when a QR colour is too light to scan on white paper.
function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error('Use a colour like #0B0B0F.');
  const n = parseInt(m[1], 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Phones scan reliably at about 4.5 : 1 or more against white. */
export const QR_MIN_CONTRAST = 4.5;

export function qrContrast(fg: string): { ratio: number; ok: boolean } {
  const ratio = Math.round(contrastRatio(fg, '#FFFFFF') * 10) / 10;
  return { ratio, ok: ratio >= QR_MIN_CONTRAST };
}
