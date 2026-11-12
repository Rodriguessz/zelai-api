const request = require('supertest');
const { createApp } = require('../src/app');
const { createContainer } = require('../src/container');

// Cria uma app nova com banco em memória vazio (testes não interferem entre si).
function buildApp() {
  const container = createContainer();
  return { app: createApp(container), container };
}

async function registerAndLogin(app, { email = 'ana@exemplo.com', senha = 'senha-segura' } = {}) {
  await request(app).post('/auth/register').send({ nome: 'Ana', email, senha });
  const res = await request(app).post('/auth/login').send({ email, senha });
  return res.body.token;
}

module.exports = { buildApp, registerAndLogin };
