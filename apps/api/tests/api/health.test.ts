import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/db';
import { closeRedis } from '../../src/lib/redis';

describe('keep-alive health check', () => {
  const app = createApp();
  afterAll(async () => {
    await closeRedis();
    await prisma.$disconnect();
  });

  it('answers GET with {status: "ok"}, never cached', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('answers HEAD with 200 and no body, never cached', async () => {
    const res = await request(app).head('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.text ?? '').toBe('');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('rejects other methods instead of treating them as a ping', async () => {
    const res = await request(app).post('/api/v1/health');
    expect(res.status).toBe(404);
  });
});
