import { describe, expect, it } from 'vitest';
import { bucketLabel, daysUntil, fmtDateTime, fmtNum, fmtStamp, istDateKey } from './format';

// Edge case 15 (UI side): the API stores UTC, the UI shows IST.
describe('IST formatting', () => {
  it('shows 18:29 UTC as 11:59 PM IST', () => {
    expect(fmtDateTime('2026-10-30T18:29:00.000Z')).toMatch(/30 Oct.*11:59\s?PM/);
  });
  it('rolls the IST date at 18:30 UTC', () => {
    expect(istDateKey('2026-10-18T18:29:59Z')).toBe('2026-10-18');
    expect(istDateKey('2026-10-18T18:30:00Z')).toBe('2026-10-19');
  });
  it('visit stamps use 24-hour IST time', () => {
    expect(fmtStamp('2026-10-18T14:12:08Z')).toBe('18 Oct 19:42:08');
  });
  it('bucket labels', () => {
    expect(bucketLabel('2026-10-18T00:00', 'day')).toBe('18 Oct');
    expect(bucketLabel('2026-10-18T19:00', 'hour')).toBe('19:00');
  });
  it('numbers use Indian grouping', () => {
    expect(fmtNum(1234567)).toBe('12,34,567');
  });
  it('days until', () => {
    expect(daysUntil('2026-10-20T00:00:00Z', new Date('2026-10-18T00:00:00Z'))).toBe(2);
  });
});
