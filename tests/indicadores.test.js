const request = require('supertest');
const { createApp } = require('../src/app');
const { createContainer } = require('../src/container');

async function setup(overrides = {}) {
  const container = createContainer(overrides);
  const app = createApp(container);
  const login = async (papel, email = `${papel}@zelai.dev`) => {
    await container.authService.ensureUser({ nome: papel, email, senha: 'senha-segura', papel });
    const { token } = await container.authService.login({ email, senha: 'senha-segura' });
    return { Authorization: `Bearer ${token}` };
  };
  return {
    app,
    cidadao: await login('cidadao'),
    outro: await login('cidadao', 'bruno@zelai.dev'),
    gestor: await login('gestor'),
    robo: await login('robo'),
  };
}

const ocorrencia = (bairro, descricao = 'Calçada quebrada há uma semana', categoria = 'calcada') => ({
  descricao,
  categoria,
  endereco: { logradouro: 'Rua A', bairro, cep: '01001-000' },
});

describe('GET /indicadores', () => {
  it('é exclusivo do gestor', async () => {
    const { app, cidadao, robo } = await setup();
    expect((await request(app).get('/indicadores').set(cidadao)).status).toBe(403);
    expect((await request(app).get('/indicadores').set(robo)).status).toBe(403);
    expect((await request(app).get('/indicadores')).status).toBe(401);
  });

  it('responde zerado quando não há ocorrências', async () => {
    const { app, gestor } = await setup();
    const res = await request(app).get('/indicadores').set(gestor);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total: 0,
      percentualResolvidas: 0,
      tempoMedioAteProtocoloHoras: null,
      bairrosMaisAfetados: [],
      prioridadeBairros: [],
    });
  });

  it('consolida status, categorias, urgência, bairros e tempo até o protocolo', async () => {
    const { app, cidadao, outro, gestor, robo } = await setup();
    const criar = async (dados) =>
      (await request(app).post('/ocorrencias').set(cidadao).send(dados)).body;

    const a = await criar(ocorrencia('Sé', 'Cadeirante não consegue passar na calçada'));
    await criar(ocorrencia('Sé'));
    await criar(ocorrencia('Bela Vista', 'Poste apagado', 'iluminacao'));
    await request(app).post(`/ocorrencias/${a.id}/apoios`).set(outro);

    await request(app).patch(`/ocorrencias/${a.id}/status`).set(gestor).send({ status: 'aprovada' });
    await request(app)
      .patch(`/ocorrencias/${a.id}/status`)
      .set(robo)
      .send({ status: 'protocolada', protocolo156: '1' });
    await request(app).patch(`/ocorrencias/${a.id}/status`).set(gestor).send({ status: 'resolvida' });

    const { body } = await request(app).get('/indicadores').set(gestor);

    expect(body.total).toBe(3);
    expect(body.porStatus).toMatchObject({ aguardando_aprovacao: 2, resolvida: 1 });
    expect(body.porCategoria).toMatchObject({ calcada: 2, iluminacao: 1, lixo: 0 });
    expect(body.porUrgencia.alta).toBe(1);
    expect(body.triagemPorFonte).toEqual({ ia: 0, regras: 3 });
    expect(body.percentualResolvidas).toBe(33.3);
    expect(body.tempoMedioAteProtocoloHoras).toBeGreaterThanOrEqual(0);
    expect(body.bairrosMaisAfetados[0]).toEqual({ bairro: 'Sé', ocorrencias: 2, apoios: 1 });
  });

  it('inclui a prioridade por bairro calculada pelo Airflow', async () => {
    const prioridade = [{ bairro: 'Sé', scorePrioridade: 87.5 }];
    const { app, gestor } = await setup({
      indicadoresRepository: { prioridadeBairros: async () => prioridade },
    });
    const { body } = await request(app).get('/indicadores').set(gestor);
    expect(body.prioridadeBairros).toEqual(prioridade);
  });
});
