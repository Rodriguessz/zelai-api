const request = require('supertest');
const { createApp } = require('../src/app');
const { createContainer } = require('../src/container');

const PNG = Buffer.from('89504e470d0a1a0a', 'hex'); // assinatura de um PNG (conteúdo fictício)

async function setup(visaoClient) {
  const container = createContainer(visaoClient ? { visaoClient } : {});
  const app = createApp(container);
  const login = async (papel) => {
    const email = `${papel}@zelai.dev`;
    await container.authService.ensureUser({ nome: papel, email, senha: 'senha-segura', papel });
    const { token } = await container.authService.login({ email, senha: 'senha-segura' });
    return { Authorization: `Bearer ${token}` };
  };
  return { app, cidadao: await login('cidadao'), gestor: await login('gestor') };
}

const enviar = (app, headers, buffer = PNG, nome = 'conta.png', tipo = 'image/png') =>
  request(app)
    .post('/enderecos/extracao')
    .set(headers)
    .attach('comprovante', buffer, { filename: nome, contentType: tipo });

describe('POST /enderecos/extracao', () => {
  const visaoOk = {
    enabled: true,
    extrairEndereco: jest.fn().mockResolvedValue({
      empresa: 'Enel',
      confianca: 0.72,
      endereco: { logradouro: 'Rua A', numero: '10', bairro: 'Sé', cep: '01001000', cidade: 'São Paulo' },
    }),
  };

  it('devolve a sugestão da Visão, com CEP formatado e pedido de revisão', async () => {
    const { app, cidadao } = await setup(visaoOk);
    const res = await enviar(app, cidadao);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      fonte: 'visao',
      empresa: 'Enel',
      revisar: true,
      endereco: { bairro: 'Sé', cep: '01001-000' },
    });
    const arquivo = visaoOk.extrairEndereco.mock.calls[0][0];
    expect(arquivo.mimetype).toBe('image/png');
    expect(Buffer.isBuffer(arquivo.buffer)).toBe(true);
  });

  it('plano B: sem Visão configurada, orienta preenchimento manual', async () => {
    const { app, cidadao } = await setup();
    const res = await enviar(app, cidadao);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ fonte: 'manual', endereco: null });
  });

  it('plano B: se a Visão falhar, orienta preenchimento manual', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const visaoFalha = { enabled: true, extrairEndereco: jest.fn().mockRejectedValue(new Error('503')) };
    const { app, cidadao } = await setup(visaoFalha);
    const res = await enviar(app, cidadao);

    expect(res.body.fonte).toBe('manual');
    expect(res.body.mensagem).toContain('Não foi possível ler');
    console.warn.mockRestore();
  });

  it('recusa arquivo que não é imagem (400)', async () => {
    const { app, cidadao } = await setup();
    const res = await enviar(app, cidadao, Buffer.from('%PDF'), 'conta.pdf', 'application/pdf');
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('JPG, PNG ou WEBP');
  });

  it('recusa imagem maior que 5 MB (400)', async () => {
    const { app, cidadao } = await setup();
    const res = await enviar(app, cidadao, Buffer.alloc(5 * 1024 * 1024 + 1));
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('5 MB');
  });

  it('recusa campo de arquivo com nome errado (400)', async () => {
    const { app, cidadao } = await setup();
    const res = await request(app)
      .post('/enderecos/extracao')
      .set(cidadao)
      .attach('foto', PNG, { filename: 'x.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
  });

  it('recusa requisição sem arquivo (400)', async () => {
    const { app, cidadao } = await setup();
    const res = await request(app).post('/enderecos/extracao').set(cidadao);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('comprovante');
  });

  it('é exclusivo de cidadãos (403)', async () => {
    const { app, gestor } = await setup();
    const res = await enviar(app, gestor);
    expect(res.status).toBe(403);
  });
});

describe('PUT /enderecos/meu', () => {
  it('salva só bairro, CEP e cidade e não expõe a senha', async () => {
    const { app, cidadao } = await setup();
    const res = await request(app)
      .put('/enderecos/meu')
      .set(cidadao)
      .send({ logradouro: 'Rua Secreta', numero: '42', bairro: 'Sé', cep: '01001000' });

    expect(res.status).toBe(200);
    expect(res.body.endereco).toEqual({ bairro: 'Sé', cep: '01001-000', cidade: 'São Paulo' });
    expect(res.body).not.toHaveProperty('senhaHash');

    const me = await request(app).get('/auth/me').set(cidadao);
    expect(me.body.endereco.bairro).toBe('Sé');
    expect(JSON.stringify(me.body)).not.toContain('Rua Secreta');
  });

  it('valida o CEP (400)', async () => {
    const { app, cidadao } = await setup();
    const res = await request(app).put('/enderecos/meu').set(cidadao).send({ bairro: 'Sé', cep: 'abc' });
    expect(res.status).toBe(400);
  });
});
