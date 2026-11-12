const request = require('supertest');
const { createApp } = require('../src/app');

describe('GET /health', () => {
  const app = createApp();

  it('responde 200 com status ok', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(typeof res.body.uptime).toBe('number');
    expect(new Date(res.body.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('não expõe o header X-Powered-By', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
