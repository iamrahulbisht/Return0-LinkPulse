import type { Request } from 'express';
import { clientIp } from '../../src/lib/clientIp';

const req = (headers: Record<string, string>, ip = '76.76.21.9') =>
  ({ ip, get: (h: string) => headers[h.toLowerCase()] }) as unknown as Request;

describe('clientIp (API calls through the Vercel rewrite)', () => {
  it('uses the client IP Vercel forwards, not the Vercel edge IP', () => {
    expect(clientIp(req({ 'x-vercel-forwarded-for': '49.36.128.10' }))).toBe('49.36.128.10');
    expect(clientIp(req({ 'x-vercel-forwarded-for': '49.36.128.10, 76.76.21.9' }))).toBe('49.36.128.10');
  });
  it('falls back to req.ip for direct calls or junk headers', () => {
    expect(clientIp(req({}))).toBe('76.76.21.9');
    expect(clientIp(req({ 'x-vercel-forwarded-for': '<script>' }))).toBe('76.76.21.9');
  });
});
