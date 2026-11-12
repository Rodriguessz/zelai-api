const request = require('supertest');
const { createApp } = require('../src/app');
const { version } = require('../package.json');

describe('Documentação OpenAPI', () => {
  const app = createApp();

  it('GET /openapi.json devolve o contrato com todas as rotas', async () => {
    const res = await request(app).get('/openapi.json');

    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(res.body.info.version).toBe(version);
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining([
        '/health',
        '/auth/register',
        '/auth/login',
        '/auth/me',
        '/ocorrencias',
        '/ocorrencias/{id}',
        '/ocorrencias/{id}/status',
        '/ocorrencias/{id}/apoios',
        '/enderecos/extracao',
        '/enderecos/meu',
      ]),
    );
  });

  it('GET /docs/ serve a interface do Swagger UI', async () => {
    const res = await request(app).get('/docs/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui');
  });
});
