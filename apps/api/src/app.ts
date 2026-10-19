import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './lib/config';
import { errorHandler } from './middleware/errors';
import { requireAdmin, requireUser } from './middleware/auth';
import { authRouter } from './routes/auth';
import { linksRouter } from './routes/links';
import { campaignsRouter, tagsRouter } from './routes/campaigns';
import { linkQrRouter, qrRouter } from './routes/qr';
import { importRouter } from './routes/import';
import { analyticsRouter } from './routes/analytics';
import { adminRouter } from './routes/admin';
import { bioRouter, publicBioRouter } from './routes/bio';
import { profileRouter } from './routes/profile';
import { invitesRouter, workspacesRouter } from './routes/workspaces';
import { streamRouter, streamTokenRouter } from './sse/stream';
import { redirectRouter } from './redirect/engine';
import { redisReady } from './lib/redis';

export function createApp() {
  const app = express();
  // Render's load balancer sits in front of us: trust that hop so req.ip is the visitor's IP
  // (short links are opened directly on the Render domain). See lib/clientIp.ts for /api calls via Vercel.
  app.set('trust proxy', config.TRUST_PROXY_HOPS);
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // Visitor pages use inline styles and Google Fonts; they run no scripts.
          'script-src': ["'none'"],
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
          'img-src': ["'self'", 'data:'],
          'form-action': ["'self'"],
          'upgrade-insecure-requests': config.isProd ? [] : null,
        },
      },
      // QR images are loaded by the web app from another origin in local dev.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(express.json({ limit: '200kb' }));
  // Signed cookies (password unlock) use a key derived from JWT_SECRET.
  app.use(cookieParser(`${config.JWT_SECRET}:cookies`));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, redis: redisReady() ? 'up' : config.REDIS_URL ? 'down' : 'off', time: new Date().toISOString() });
  });
  // Keep-alive ping for an external cron (stops the free Render instance from sleeping).
  // No DB/Redis calls, so pings stay cheap. GET returns a tiny JSON body; HEAD returns the same
  // status and headers with no body. no-store keeps any proxy from answering a ping from cache.
  app
    .route('/api/v1/health')
    .head((_req, res) => {
      res.set('Cache-Control', 'no-store').status(200).end();
    })
    .get((_req, res) => {
      res.set('Cache-Control', 'no-store').json({ status: 'ok' });
    });
  app.get('/', (_req, res) => res.redirect(302, config.WEB_ORIGIN));
  app.get('/robots.txt', (_req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /\n'));

  // Public API
  app.use('/api/auth', authRouter);
  app.use('/api/public/bio', publicBioRouter);
  app.use('/api/stream-token', streamTokenRouter);
  app.use('/stream', streamRouter);

  // Signed-in API. requireUser runs on every request; ownership is checked inside each :id route.
  app.use('/api/links/:id/qr', requireUser, linkQrRouter);
  app.use('/api/links', requireUser, linksRouter);
  app.use('/api/campaigns', requireUser, campaignsRouter);
  app.use('/api/tags', requireUser, tagsRouter);
  app.use('/api/qr', requireUser, qrRouter);
  app.use('/api/import', requireUser, importRouter);
  app.use('/api/analytics', requireUser, analyticsRouter);
  app.use('/api/bio', requireUser, bioRouter);
  app.use('/api/admin', requireUser, requireAdmin, adminRouter);
  // The signed-in user's own account (profile, photo, email, password, sessions).
  app.use('/api/me', requireUser, profileRouter);
  // Workspaces: create, switch, members, invites (owner) and the invites sent to me.
  app.use('/api/workspaces', requireUser, workspacesRouter);
  app.use('/api/invites', requireUser, invitesRouter);
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'There is no API route here.' } });
  });

  // Everything else is a short link: GET /:code → redirect engine.
  app.use(redirectRouter());

  app.use(errorHandler);
  return app;
}
