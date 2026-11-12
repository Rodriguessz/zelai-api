const request = require('supertest');
const { buildApp } = require('./helpers');

const novaOcorrencia = (sobrescrever = {}) => ({
  descricao: 'Botão do semáforo para pedestres não funciona há uma semana',
  categoria: 'semaforo',
  endereco: { logradouro: 'Av. Paulista', numero: '1000', bairro: 'Bela Vista', cep: '01310-100' },
  localizacao: { lat: -23.5631, lng: -46.6544 },
  ...sobrescrever,
});

async function setup() {
  const ctx = buildApp();
  ctx.cidadao = await ctx.authAs('cidadao');
  ctx.outroCidadao = await ctx.authAs('cidadao', 'bruno@exemplo.com');
  ctx.gestor = await ctx.authAs('gestor');
  ctx.robo = await ctx.authAs('robo');
  ctx.criar = async (dados = novaOcorrencia(), headers = ctx.cidadao) =>
    request(ctx.app).post('/ocorrencias').set(headers).send(dados);
  ctx.mudarStatus = (id, headers, body) =>
    request(ctx.app).patch(`/ocorrencias/${id}/status`).set(headers).send(body);
  return ctx;
}

describe('POST /ocorrencias', () => {
  it('cidadão registra uma ocorrência aguardando aprovação', async () => {
    const { criar } = await setup();
    const res = await criar();

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      categoria: 'semaforo',
      status: 'aguardando_aprovacao',
      minha: true,
      apoios: 0,
      apoiadaPorMim: false,
      protocolo156: null,
      endereco: { bairro: 'Bela Vista', cidade: 'São Paulo' },
    });
    expect(res.body.historico).toHaveLength(1);
    expect(res.body).not.toHaveProperty('apoiadores');
  });

  it('nasce com triagem automática (plano B por regras, sem GenAI configurada)', async () => {
    const { criar } = await setup();
    const res = await criar(
      novaOcorrencia({ descricao: 'Semáforo quebrado, idosos não conseguem atravessar' }),
    );

    expect(res.body.urgencia).toBe('alta');
    expect(res.body.triagem).toMatchObject({ fonte: 'regras', urgencia: 'alta' });
    expect(res.body.triagem.explicacao).toBeDefined();
  });

  it('exige login (401)', async () => {
    const { app } = await setup();
    const res = await request(app).post('/ocorrencias').send(novaOcorrencia());
    expect(res.status).toBe(401);
  });

  it.each(['gestor', 'robo'])('não permite que %s registre ocorrência (403)', async (papel) => {
    const ctx = await setup();
    const res = await ctx.criar(novaOcorrencia(), ctx[papel]);
    expect(res.status).toBe(403);
  });

  it('valida CEP, categoria e descrição (400)', async () => {
    const { criar } = await setup();
    const res = await criar(
      novaOcorrencia({
        descricao: 'curta',
        categoria: 'dragao',
        endereco: { logradouro: 'Rua X', bairro: 'Centro', cep: '123' },
      }),
    );

    expect(res.status).toBe(400);
    const campos = res.body.details.map((d) => d.campo);
    expect(campos).toEqual(expect.arrayContaining(['descricao', 'categoria', 'endereco.cep']));
  });
});

describe('GET /ocorrencias', () => {
  it('lista ocorrências de todos, sem revelar o autor a outros cidadãos', async () => {
    const ctx = await setup();
    await ctx.criar(novaOcorrencia(), ctx.outroCidadao);

    const res = await request(ctx.app).get('/ocorrencias').set(ctx.cidadao);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].minha).toBe(false);
    expect(res.body.items[0]).not.toHaveProperty('cidadaoId');
  });

  it('gestor vê quem registrou', async () => {
    const ctx = await setup();
    await ctx.criar();
    const res = await request(ctx.app).get('/ocorrencias').set(ctx.gestor);
    expect(res.body.items[0].cidadaoId).toBeDefined();
  });

  it('filtra por minhas, status, categoria e bairro', async () => {
    const ctx = await setup();
    await ctx.criar();
    await ctx.criar(novaOcorrencia({ categoria: 'iluminacao' }), ctx.outroCidadao);
    await ctx.criar(
      novaOcorrencia({ endereco: { logradouro: 'Rua A', bairro: 'Sé', cep: '01001-000' } }),
    );

    const get = (q) => request(ctx.app).get(`/ocorrencias${q}`).set(ctx.cidadao);

    expect((await get('?minhas=true')).body.total).toBe(2);
    expect((await get('?categoria=iluminacao')).body.total).toBe(1);
    expect((await get('?bairro=sé')).body.total).toBe(1);
    expect((await get('?status=aprovada')).body.total).toBe(0);
  });

  it('pagina os resultados', async () => {
    const ctx = await setup();
    for (let i = 0; i < 3; i++) await ctx.criar();

    const res = await request(ctx.app).get('/ocorrencias?page=2&limit=2').set(ctx.cidadao);

    expect(res.body).toMatchObject({ page: 2, limit: 2, total: 3, totalPages: 2 });
    expect(res.body.items).toHaveLength(1);
  });

  it('recusa filtros inválidos (400)', async () => {
    const ctx = await setup();
    const res = await request(ctx.app).get('/ocorrencias?status=perdida&limit=500').set(ctx.cidadao);
    expect(res.status).toBe(400);
  });
});

describe('GET /ocorrencias/:id', () => {
  it('devolve a ocorrência', async () => {
    const ctx = await setup();
    const { body } = await ctx.criar();
    const res = await request(ctx.app).get(`/ocorrencias/${body.id}`).set(ctx.cidadao);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(body.id);
  });

  it('responde 404 para id inexistente', async () => {
    const ctx = await setup();
    const res = await request(ctx.app).get('/ocorrencias/nao-existe').set(ctx.cidadao);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /ocorrencias/:id/status (ciclo de vida)', () => {
  it('percorre o fluxo completo: aprovada → protocolada → resolvida', async () => {
    const ctx = await setup();
    const { body: criada } = await ctx.criar();

    const aprovada = await ctx.mudarStatus(criada.id, ctx.gestor, {
      status: 'aprovada',
      observacao: 'Triagem conferida',
    });
    expect(aprovada.status).toBe(200);

    const protocolada = await ctx.mudarStatus(criada.id, ctx.robo, {
      status: 'protocolada',
      protocolo156: '2026-0012345',
    });
    expect(protocolada.body).toMatchObject({ status: 'protocolada', protocolo156: '2026-0012345' });

    const resolvida = await ctx.mudarStatus(criada.id, ctx.gestor, { status: 'resolvida' });
    expect(resolvida.body.status).toBe('resolvida');
    expect(resolvida.body.historico.map((h) => h.status)).toEqual([
      'aguardando_aprovacao',
      'aprovada',
      'protocolada',
      'resolvida',
    ]);
    expect(resolvida.body.historico[1].observacao).toBe('Triagem conferida');
  });

  it('exige o número do protocolo ao protocolar (400)', async () => {
    const ctx = await setup();
    const { body } = await ctx.criar();
    await ctx.mudarStatus(body.id, ctx.gestor, { status: 'aprovada' });

    const res = await ctx.mudarStatus(body.id, ctx.robo, { status: 'protocolada' });

    expect(res.status).toBe(400);
    expect(res.body.details[0].campo).toBe('protocolo156');
  });

  it('robô não pode aprovar (403)', async () => {
    const ctx = await setup();
    const { body } = await ctx.criar();
    const res = await ctx.mudarStatus(body.id, ctx.robo, { status: 'aprovada' });
    expect(res.status).toBe(403);
  });

  it('gestor não pode protocolar no lugar do robô (403)', async () => {
    const ctx = await setup();
    const { body } = await ctx.criar();
    await ctx.mudarStatus(body.id, ctx.gestor, { status: 'aprovada' });
    const res = await ctx.mudarStatus(body.id, ctx.gestor, {
      status: 'protocolada',
      protocolo156: '1',
    });
    expect(res.status).toBe(403);
  });

  it('cidadão não pode mudar status (403)', async () => {
    const ctx = await setup();
    const { body } = await ctx.criar();
    const res = await ctx.mudarStatus(body.id, ctx.cidadao, { status: 'aprovada' });
    expect(res.status).toBe(403);
  });

  it('recusa pular etapas (409)', async () => {
    const ctx = await setup();
    const { body } = await ctx.criar();
    const res = await ctx.mudarStatus(body.id, ctx.gestor, { status: 'resolvida' });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('aguardando_aprovacao');
  });

  it('ocorrência rejeitada não muda mais de status (409)', async () => {
    const ctx = await setup();
    const { body } = await ctx.criar();
    await ctx.mudarStatus(body.id, ctx.gestor, { status: 'rejeitada', observacao: 'Duplicada' });
    const res = await ctx.mudarStatus(body.id, ctx.gestor, { status: 'aprovada' });
    expect(res.status).toBe(409);
  });

  it('valida o status enviado (400) e o id (404)', async () => {
    const ctx = await setup();
    const { body } = await ctx.criar();
    expect((await ctx.mudarStatus(body.id, ctx.gestor, { status: 'xyz' })).status).toBe(400);
    expect((await ctx.mudarStatus('nao-existe', ctx.gestor, { status: 'aprovada' })).status).toBe(404);
  });
});

describe('POST /ocorrencias/:id/apoios', () => {
  it('outro cidadão apoia a ocorrência', async () => {
    const ctx = await setup();
    const { body } = await ctx.criar();
    const res = await request(ctx.app).post(`/ocorrencias/${body.id}/apoios`).set(ctx.outroCidadao);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ apoios: 1, apoiadaPorMim: true, minha: false });
  });

  it('não permite apoiar duas vezes (409)', async () => {
    const ctx = await setup();
    const { body } = await ctx.criar();
    await request(ctx.app).post(`/ocorrencias/${body.id}/apoios`).set(ctx.outroCidadao);
    const res = await request(ctx.app).post(`/ocorrencias/${body.id}/apoios`).set(ctx.outroCidadao);
    expect(res.status).toBe(409);
  });

  it('apenas cidadãos apoiam (403) e o id precisa existir (404)', async () => {
    const ctx = await setup();
    const { body } = await ctx.criar();
    expect((await request(ctx.app).post(`/ocorrencias/${body.id}/apoios`).set(ctx.gestor)).status).toBe(403);
    expect((await request(ctx.app).post('/ocorrencias/x/apoios').set(ctx.cidadao)).status).toBe(404);
  });
});
