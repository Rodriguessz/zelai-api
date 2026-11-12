const request = require('supertest');
const jwt = require('jsonwebtoken');
const config = require('../src/config');
const { buildApp, registerAndLogin } = require('./helpers');

const cidadao = { nome: 'Ana Souza', email: 'ana@exemplo.com', senha: 'senha-segura' };

describe('POST /auth/register', () => {
  it('cria um cidadão e não devolve a senha', async () => {
    const { app } = buildApp();
    const res = await request(app).post('/auth/register').send(cidadao);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ nome: 'Ana Souza', email: 'ana@exemplo.com', papel: 'cidadao' });
    expect(res.body.id).toBeDefined();
    expect(res.body).not.toHaveProperty('senha');
    expect(res.body).not.toHaveProperty('senhaHash');
  });

  it('ignora tentativa de se cadastrar como gestor', async () => {
    const { app } = buildApp();
    const res = await request(app).post('/auth/register').send({ ...cidadao, papel: 'gestor' });

    expect(res.status).toBe(201);
    expect(res.body.papel).toBe('cidadao');
  });

  it('recusa e-mail duplicado com 409 (sem diferenciar maiúsculas)', async () => {
    const { app } = buildApp();
    await request(app).post('/auth/register').send(cidadao);
    const res = await request(app)
      .post('/auth/register')
      .send({ ...cidadao, email: 'ANA@exemplo.com' });

    expect(res.status).toBe(409);
    expect(res.body.message).toBe('E-mail já cadastrado');
  });

  it('valida os campos e devolve 400 com detalhes', async () => {
    const { app } = buildApp();
    const res = await request(app).post('/auth/register').send({ email: 'invalido', senha: '123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
    const campos = res.body.details.map((d) => d.campo);
    expect(campos).toEqual(expect.arrayContaining(['nome', 'email', 'senha']));
  });
});

describe('POST /auth/login', () => {
  it('devolve um JWT com o papel do usuário', async () => {
    const { app } = buildApp();
    await request(app).post('/auth/register').send(cidadao);
    const res = await request(app)
      .post('/auth/login')
      .send({ email: cidadao.email, senha: cidadao.senha });

    expect(res.status).toBe(200);
    expect(res.body.tipo).toBe('Bearer');
    expect(res.body.usuario.papel).toBe('cidadao');
    const payload = jwt.verify(res.body.token, config.jwt.secret);
    expect(payload.papel).toBe('cidadao');
    expect(payload.sub).toBe(res.body.usuario.id);
  });

  it.each([
    ['senha errada', { email: cidadao.email, senha: 'outra-senha' }],
    ['e-mail inexistente', { email: 'nao@existe.com', senha: cidadao.senha }],
  ])('recusa %s com a mesma mensagem genérica', async (_caso, credenciais) => {
    const { app } = buildApp();
    await request(app).post('/auth/register').send(cidadao);
    const res = await request(app).post('/auth/login').send(credenciais);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('E-mail ou senha inválidos');
  });
});

describe('GET /auth/me', () => {
  it('devolve o usuário do token', async () => {
    const { app } = buildApp();
    const token = await registerAndLogin(app);
    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('ana@exemplo.com');
  });

  it.each([
    ['sem header', undefined],
    ['esquema errado', 'Basic abc'],
    ['token inválido', 'Bearer token-falso'],
    ['token assinado com outro segredo', `Bearer ${jwt.sign({ papel: 'gestor' }, 'outro', { subject: 'x' })}`],
    ['token expirado', `Bearer ${jwt.sign({ papel: 'cidadao' }, config.jwt.secret, { subject: 'x', expiresIn: -10 })}`],
  ])('responde 401 com %s', async (_caso, header) => {
    const { app } = buildApp();
    const req = request(app).get('/auth/me');
    if (header) req.set('Authorization', header);
    const res = await req;

    expect(res.status).toBe(401);
  });

  it('responde 404 se o usuário do token não existe mais', async () => {
    const { app } = buildApp();
    const token = jwt.sign({ papel: 'cidadao' }, config.jwt.secret, { subject: 'apagado' });
    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
