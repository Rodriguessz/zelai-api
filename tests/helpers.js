const request = require('supertest');
const { createApp } = require('../src/app');
const { createContainer } = require('../src/container');

// Cria uma app nova com banco em memória vazio (testes não interferem entre si).
function buildApp() {
  const container = createContainer();
  const app = createApp(container);

  // Cria (se preciso) um usuário do papel pedido e devolve o header de autorização.
  const authAs = async (papel, email = `${papel}@zelai.dev`) => {
    const senha = 'senha-segura';
    await container.authService.ensureUser({ nome: `Usuário ${papel}`, email, senha, papel });
    const { token } = await container.authService.login({ email, senha });
    return { Authorization: `Bearer ${token}` };
  };

  return { app, container, authAs };
}

async function registerAndLogin(app, { email = 'ana@exemplo.com', senha = 'senha-segura' } = {}) {
  await request(app).post('/auth/register').send({ nome: 'Ana', email, senha });
  const res = await request(app).post('/auth/login').send({ email, senha });
  return res.body.token;
}

module.exports = { buildApp, registerAndLogin };
