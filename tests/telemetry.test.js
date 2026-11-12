const request = require('supertest');
const telemetry = require('../src/telemetry');
const { createTriagemService } = require('../src/services/triagemService');
const { buildApp } = require('./helpers');

// Importante: os módulos acima são carregados uma vez só, no topo. O bloco
// 'initTelemetry' usa jest.resetModules(); se importássemos o triagemService
// depois disso, ele pegaria uma cópia nova da telemetria e o spy não veria a chamada.

describe('initTelemetry', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('applicationinsights');
    delete process.env.OTEL_SERVICE_NAME;
  });

  it('fica desligada sem connection string (no-op seguro)', () => {
    jest.isolateModules(() => {
      const t = require('../src/telemetry');
      expect(t.initTelemetry(undefined)).toBe(false);
      expect(() => t.trackEvent('X', { a: 1 })).not.toThrow();
      expect(() => t.trackException(new Error('x'))).not.toThrow();
    });
  });

  it('configura o SDK com coleta automática e encaminha eventos', () => {
    const client = { trackEvent: jest.fn(), trackException: jest.fn() };
    const chain = {};
    for (const m of [
      'setAutoCollectRequests',
      'setAutoCollectDependencies',
      'setAutoCollectExceptions',
      'setAutoCollectConsole',
      'setSendLiveMetrics',
    ]) {
      chain[m] = jest.fn(() => chain);
    }
    chain.start = jest.fn(() => chain);
    const fakeSdk = { setup: jest.fn(() => chain), defaultClient: client };
    jest.doMock('applicationinsights', () => fakeSdk);

    jest.isolateModules(() => {
      const t = require('../src/telemetry');
      expect(t.initTelemetry('InstrumentationKey=abc')).toBe(true);
      t.trackEvent('OcorrenciaCriada', { categoria: 'semaforo' });
      const erro = new Error('falha');
      t.trackException(erro, { requestId: 'r1' });

      expect(fakeSdk.setup).toHaveBeenCalledWith('InstrumentationKey=abc');
      expect(chain.setAutoCollectRequests).toHaveBeenCalledWith(true);
      expect(chain.start).toHaveBeenCalled();
      expect(process.env.OTEL_SERVICE_NAME).toBe('zelai-api');
      expect(client.trackEvent).toHaveBeenCalledWith({
        name: 'OcorrenciaCriada',
        properties: { categoria: 'semaforo' },
      });
      expect(client.trackException).toHaveBeenCalledWith({
        exception: erro,
        properties: { requestId: 'r1' },
      });
    });
  });
});

describe('Eventos de negócio', () => {
  let spy;
  beforeEach(() => {
    spy = jest.spyOn(telemetry, 'trackEvent').mockImplementation(() => {});
  });
  afterEach(() => spy.mockRestore());

  it('registra OcorrenciaCriada e OcorrenciaStatusAlterado', async () => {
    const { app, authAs } = buildApp();
    const cidadao = await authAs('cidadao');
    const gestor = await authAs('gestor');

    const { body } = await request(app)
      .post('/ocorrencias')
      .set(cidadao)
      .send({
        descricao: 'Poste apagado há dias na esquina',
        categoria: 'iluminacao',
        endereco: { logradouro: 'Rua A', bairro: 'Sé', cep: '01001-000' },
      });
    await request(app).patch(`/ocorrencias/${body.id}/status`).set(gestor).send({ status: 'aprovada' });

    expect(spy).toHaveBeenCalledWith('OcorrenciaCriada', {
      categoria: 'iluminacao',
      bairro: 'Sé',
      urgencia: 'media',
      fonteTriagem: 'regras',
    });
    expect(spy).toHaveBeenCalledWith('OcorrenciaStatusAlterado', {
      de: 'aguardando_aprovacao',
      para: 'aprovada',
      papel: 'gestor',
      categoria: 'iluminacao',
    });
  });

  it('registra PlanoBAtivado quando a GenAI falha', async () => {
    const genaiClient = { enabled: true, triar: jest.fn().mockRejectedValue(new Error('timeout')) };
    await createTriagemService({ genaiClient, logger: { warn: () => {} } }).triar({
      descricao: 'x',
      categoria: 'outros',
    });
    expect(spy).toHaveBeenCalledWith('PlanoBAtivado', { servico: 'genai', motivo: 'timeout' });
  });
});
