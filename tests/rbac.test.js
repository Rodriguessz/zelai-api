const express = require('express');
const request = require('supertest');
const { authenticate, authorize } = require('../src/middlewares/auth');
const errorHandler = require('../src/middlewares/errorHandler');
const { createContainer } = require('../src/container');

// App mínima com uma rota exclusiva de gestor, para testar o RBAC isolado.
async function setup() {
  const { authService } = createContainer();
  const app = express();
  app.get('/somente-gestor', authenticate(authService), authorize('gestor'), (_req, res) =>
    res.json({ ok: true }),
  );
  app.get('/sem-autenticacao', authorize('gestor'), (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);

  const tokenDe = async (papel) => {
    const email = `${papel}@zelai.dev`;
    await authService.ensureUser({ nome: papel, email, senha: 'senha-segura', papel });
    return (await authService.login({ email, senha: 'senha-segura' })).token;
  };
  return { app, tokenDe };
}

describe('RBAC: authorize()', () => {
  it('libera o papel permitido', async () => {
    const { app, tokenDe } = await setup();
    const res = await request(app)
      .get('/somente-gestor')
      .set('Authorization', `Bearer ${await tokenDe('gestor')}`);
    expect(res.status).toBe(200);
  });

  it.each(['cidadao', 'robo'])('bloqueia o papel %s com 403', async (papel) => {
    const { app, tokenDe } = await setup();
    const res = await request(app)
      .get('/somente-gestor')
      .set('Authorization', `Bearer ${await tokenDe(papel)}`);
    expect(res.status).toBe(403);
  });

  it('responde 401 se usado sem authenticate antes', async () => {
    const { app } = await setup();
    const res = await request(app).get('/sem-autenticacao');
    expect(res.status).toBe(401);
  });
});
