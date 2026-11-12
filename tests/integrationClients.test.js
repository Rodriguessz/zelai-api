const { createGenaiClient } = require('../src/integrations/genaiClient');
const { createVisaoClient } = require('../src/integrations/visaoClient');

// Simula o fetch para testar os clientes sem depender dos serviços reais.
const mockFetch = (status, body) =>
  jest.spyOn(global, 'fetch').mockResolvedValue({ ok: status < 400, status, json: async () => body });

afterEach(() => jest.restoreAllMocks());

describe('genaiClient', () => {
  const client = createGenaiClient({ url: 'http://genai', apiKey: 'chave', timeoutMs: 1000 });
  const ok = {
    urgencia: 'media',
    categoriaSugerida: 'buraco',
    resumo: 'Buraco grande',
    explicacao: 'Afeta veículos',
  };

  it('fica desabilitado sem URL', () => {
    expect(createGenaiClient({ url: null }).enabled).toBe(false);
  });

  it('chama POST /triagem com a chave e valida a resposta', async () => {
    const fetch = mockFetch(200, ok);
    const r = await client.triar({ descricao: 'Buraco', categoria: 'buraco' });

    expect(r).toEqual({ fonte: 'ia', ...ok });
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe('http://genai/triagem');
    expect(opts.method).toBe('POST');
    expect(opts.headers['x-api-key']).toBe('chave');
    expect(JSON.parse(opts.body)).toEqual({ descricao: 'Buraco', categoria: 'buraco' });
  });

  it('não envia chave quando não configurada', async () => {
    const fetch = mockFetch(200, ok);
    await createGenaiClient({ url: 'http://genai' }).triar({ descricao: 'x', categoria: 'buraco' });
    expect(fetch.mock.calls[0][1].headers['x-api-key']).toBeUndefined();
  });

  it('rejeita resposta fora do contrato', async () => {
    mockFetch(200, { urgencia: 'urgentíssima' });
    await expect(client.triar({ descricao: 'x', categoria: 'buraco' })).rejects.toThrow();
  });

  it('rejeita erro HTTP do serviço', async () => {
    mockFetch(500, {});
    await expect(client.triar({ descricao: 'x', categoria: 'buraco' })).rejects.toThrow('HTTP 500');
  });
});

describe('visaoClient', () => {
  it('envia a imagem como multipart e valida a resposta', async () => {
    const resposta = {
      empresa: 'Sabesp',
      confianca: 0.93,
      endereco: { logradouro: 'Rua A', numero: '10', bairro: 'Sé', cep: '01001000', cidade: 'São Paulo' },
    };
    const fetch = mockFetch(200, resposta);
    const client = createVisaoClient({ url: 'http://visao', apiKey: 'k', timeoutMs: 1000 });

    const r = await client.extrairEndereco({ buffer: Buffer.from('img'), mimetype: 'image/png' });

    expect(r).toEqual(resposta);
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe('http://visao/extrair-endereco');
    expect(opts.body).toBeInstanceOf(FormData);
    expect(opts.body.get('imagem')).toBeInstanceOf(Blob);
    expect(opts.headers['x-api-key']).toBe('k');
    expect(opts.headers['content-type']).toBeUndefined(); // o fetch define o boundary do multipart
  });

  it('rejeita resposta sem confiança', async () => {
    mockFetch(200, { endereco: {} });
    const client = createVisaoClient({ url: 'http://visao' });
    await expect(client.extrairEndereco({ buffer: Buffer.from('x'), mimetype: 'image/png' })).rejects.toThrow();
  });
});
