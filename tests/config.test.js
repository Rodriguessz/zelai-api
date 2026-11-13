describe('config.jwt', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
    jest.resetModules();
  });

  it('impede a API de subir em produção sem JWT_SECRET', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    expect(() => require('../src/config')).toThrow('JWT_SECRET é obrigatório em produção');
  });

  it('usa o JWT_SECRET do ambiente quando definido', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'segredo-de-teste';
    expect(require('../src/config').jwt.secret).toBe('segredo-de-teste');
  });

  it('gera um segredo aleatório fora de produção', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.JWT_SECRET;
    expect(require('../src/config').jwt.secret).toHaveLength(64);
  });

  it.each(['DATABASE_URL', 'JWT_SECRET', 'SEED_GESTOR_SENHA'])(
    'falha com mensagem clara se %s chegar como referência não resolvida do Key Vault',
    (nome) => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'segredo';
      process.env[nome] = '@Microsoft.KeyVault(VaultName=kv-zelai-api;SecretName=database-url)';
      expect(() => require('../src/config')).toThrow(`${nome} não foi resolvida pelo Key Vault`);
    },
  );
});
