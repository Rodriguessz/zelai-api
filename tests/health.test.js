const request = require('supertest');
const { createApp } = require('../src/app');
const { createContainer } = require('../src/container');

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

  it('informa que está usando memória quando não há banco configurado', async () => {
    const res = await request(app).get('/health');
    expect(res.body.checks).toEqual({ database: 'memoria' });
  });

  it('responde 503 "degradado" quando o banco está fora do ar', async () => {
    const appSemBanco = createApp(createContainer({ checkDatabase: async () => 'indisponivel' }));
    const res = await request(appSemBanco).get('/health');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'degradado', checks: { database: 'indisponivel' } });
  });

  it('não expõe o header X-Powered-By', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
