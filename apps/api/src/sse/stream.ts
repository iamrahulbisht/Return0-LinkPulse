import { Router } from 'express';
import { config } from '../lib/config';
import { h } from '../middleware/errors';
import { requireUser, signStreamToken, verifyStreamToken } from '../middleware/auth';
import { subscribe } from './hub';

/** GET /api/stream-token (needs login) → short-lived token for the stream. */
export const streamTokenRouter = Router();
streamTokenRouter.get(
  '/',
  requireUser,
  h(async (req, res) => {
    const token = signStreamToken(req.user!.id, req.user!.role, req.user!.workspaceId);
    res.json({ token, url: `${config.shortBase}/stream?token=${encodeURIComponent(token)}`, expiresIn: 60 });
  }),
);

/**
 * GET /stream?token=… on the API domain (a long-lived stream through the Vercel rewrite can be cut
 * by proxy timeouts). The token is checked once when the stream opens.
 */
export const streamRouter = Router();
streamRouter.get('/', (req, res) => {
  // The dashboard opens this stream from the web app's origin; allow only our own origins.
  const origin = req.get('origin');
  if (origin && config.webOrigins.includes(origin)) res.set({ 'Access-Control-Allow-Origin': origin, Vary: 'Origin' });
  const auth = verifyStreamToken(String(req.query.token ?? ''));
  if (!auth) {
    res.status(401).json({ error: { code: 'BAD_STREAM_TOKEN', message: 'Stream token is missing or expired.' } });
    return;
  }
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(`retry: 3000\nevent: ready\ndata: {"ok":true}\n\n`);

  const unsubscribe = subscribe(auth.workspaceId, (click) => {
    res.write(`event: click\ndata: ${JSON.stringify(click)}\n\n`);
  });
  // Heartbeat so proxies keep the connection open.
  const beat = setInterval(() => res.write(`: ping ${Date.now()}\n\n`), 25_000);
  req.on('close', () => {
    clearInterval(beat);
    unsubscribe();
  });
});
