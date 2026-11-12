const express = require('express');
const request = require('supertest');
const config = require('../src/config');
const { createApp } = require('../src/app');
const errorHandler = require('../src/middlewares/errorHandler');
const { requestId } = require('../src/middlewares/security');

// Os middlewares leem a configuração quando a app é criada:
// ajustamos a config, criamos a app e restauramos depois de cada teste.
const original = structuredClone({ corsOrigins: config.corsOrigins, rateLimit: config.rateLimit });
afterEach(() => {
  config.corsOrigins = original.corsOrigins;
  config.rateLimit = structuredClone(original.rateLimit);
});

describe('Cabeçalhos de segurança (helmet)', () => {
  it('envia CSP, HSTS, nosniff e bloqueia iframe', async () => {
    const res = await request(createApp()).get('/health');

    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['strict-transport-security']).toContain('max-age=');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('X-Request-Id', () => {
  it('gera um id por requisição', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('reaproveita um id válido enviado pelo cliente', async () => {
    const res = await request(createApp()).get('/health').set('X-Request-Id', 'robo-uipath-123');
    expect(res.headers['x-request-id']).toBe('robo-uipath-123');
  });

  it('ignora um id malicioso e gera outro', async () => {
    const res = await request(createApp())
      .get('/health')
      .set('X-Request-Id', '<script>alert(1)</script>');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('aparece no corpo de erros 500 para o usuário informar ao suporte', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const app = express();
    app.use(requestId());
    app.get('/boom', () => {
      throw new Error('falha');
    });
    app.use(errorHandler);

    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
    console.error.mockRestore();
  });
});

describe('CORS', () => {
  const FRONT = 'https://front.zelai.dev';

  it('libera a origem configurada', async () => {
    config.corsOrigins = [FRONT];
    const res = await request(createApp()).get('/health').set('Origin', FRONT);
    expect(res.headers['access-control-allow-origin']).toBe(FRONT);
  });

  it('não libera origens desconhecidas', async () => {
    config.corsOrigins = [FRONT];
    const res = await request(createApp()).get('/health').set('Origin', 'https://site-malicioso.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('responde ao preflight com os métodos e headers permitidos', async () => {
    config.corsOrigins = [FRONT];
    const res = await request(createApp())
      .options('/ocorrencias')
      .set('Origin', FRONT)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Authorization, Content-Type');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-methods']).toContain('PATCH');
    expect(res.headers['access-control-allow-headers']).toContain('Authorization');
  });
});

describe('Rate limit', () => {
  const login = (app) =>
    request(app).post('/auth/login').send({ email: 'x@zelai.dev', senha: 'qualquer' });

  it('bloqueia tentativas excessivas de login com 429', async () => {
    config.rateLimit.authMax = 3;
    const app = createApp();
    for (let i = 0; i < 3; i++) expect((await login(app)).status).toBe(401);

    const bloqueado = await login(app);
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.body.error).toBe('TooManyRequests');
    expect(bloqueado.headers.ratelimit).toBeDefined();
  });

  it('aplica o limite geral nas demais rotas, mas nunca no /health', async () => {
    config.rateLimit.max = 2;
    const app = createApp();
    for (let i = 0; i < 5; i++) expect((await request(app).get('/health')).status).toBe(200);

    await request(app).get('/openapi.json');
    await request(app).get('/openapi.json');
    expect((await request(app).get('/openapi.json')).status).toBe(429);
  });
});

describe('Entradas malformadas', () => {
  it('JSON inválido responde 400 sem vazar detalhes internos', async () => {
    const res = await request(createApp())
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(res.status).toBe(400);
  });

  it('corpo maior que 100 KB responde 413', async () => {
    const res = await request(createApp())
      .post('/auth/register')
      .send({ nome: 'a'.repeat(200 * 1024), email: 'a@b.com', senha: '12345678' });
    expect(res.status).toBe(413);
  });
});
