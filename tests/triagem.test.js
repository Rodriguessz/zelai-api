const { triarPorRegras } = require('../src/integrations/triagemRegras');
const { createTriagemService } = require('../src/services/triagemService');

describe('triarPorRegras (plano B)', () => {
  it.each([
    ['Calçada quebrada, cadeirante não consegue passar', 'calcada', 'alta'],
    ['Fio elétrico exposto perto da escola', 'outros', 'alta'],
    ['Poste apagado há vários dias', 'iluminacao', 'media'],
    ['Buraco na rua', 'outros', 'media'],
    ['Lixo acumulado na esquina', 'lixo', 'baixa'],
  ])('"%s" (%s) → urgência %s', (descricao, categoria, esperada) => {
    expect(triarPorRegras({ descricao, categoria }).urgencia).toBe(esperada);
  });

  it('explica o motivo e identifica a fonte', () => {
    const r = triarPorRegras({ descricao: 'Idoso caiu na calçada', categoria: 'calcada' });
    expect(r.fonte).toBe('regras');
    expect(r.explicacao).toMatch(/idos/);
  });

  it('explica pela categoria quando não acha palavra-chave', () => {
    const r = triarPorRegras({ descricao: 'Problema no local', categoria: 'semaforo' });
    expect(r.explicacao).toContain('semaforo');
  });

  it('resume descrições longas em até 140 caracteres', () => {
    const r = triarPorRegras({ descricao: 'a'.repeat(300), categoria: 'outros' });
    expect(r.resumo).toHaveLength(140);
  });
});

describe('triagemService', () => {
  const ocorrencia = { descricao: 'Semáforo apagado', categoria: 'semaforo' };
  const respostaIa = {
    fonte: 'ia',
    urgencia: 'alta',
    categoriaSugerida: 'semaforo',
    resumo: 'Semáforo sem funcionar',
    explicacao: 'Risco a pedestres',
  };

  it('usa as regras quando a GenAI não está configurada', async () => {
    const svc = createTriagemService({ genaiClient: { enabled: false } });
    const r = await svc.triar(ocorrencia);
    expect(r.fonte).toBe('regras');
    expect(r.em).toBeDefined();
  });

  it('usa a GenAI quando disponível', async () => {
    const genaiClient = { enabled: true, triar: jest.fn().mockResolvedValue(respostaIa) };
    const r = await createTriagemService({ genaiClient }).triar(ocorrencia);
    expect(r).toMatchObject(respostaIa);
    expect(genaiClient.triar).toHaveBeenCalledWith(ocorrencia);
  });

  it('cai para as regras e registra aviso quando a GenAI falha', async () => {
    const logger = { warn: jest.fn() };
    const genaiClient = { enabled: true, triar: jest.fn().mockRejectedValue(new Error('timeout')) };
    const r = await createTriagemService({ genaiClient, logger }).triar(ocorrencia);
    expect(r.fonte).toBe('regras');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('timeout'));
  });
});
