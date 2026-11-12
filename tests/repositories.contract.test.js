// Testes de contrato: a MESMA suíte roda contra o repositório em memória
// e contra o PostgreSQL real. Assim garantimos que as duas implementações
// se comportam igual e podem ser trocadas sem mudar o resto da API.
//
// A parte PostgreSQL só roda quando TEST_DATABASE_URL está definida
// (na CI ela vem de um container de PostgreSQL; localmente é opcional).
const memUsers = require('../src/repositories/userRepository.memory');
const memOcorrencias = require('../src/repositories/ocorrenciaRepository.memory');
const pgUsers = require('../src/repositories/userRepository.pg');
const pgOcorrencias = require('../src/repositories/ocorrenciaRepository.pg');
const { createPool } = require('../src/db/pool');
const { migrate } = require('../src/db/migrate');

const TEST_DB = process.env.TEST_DATABASE_URL;

const implementacoes = [
  [
    'memória',
    {
      setup: async () => ({}),
      make: () => ({
        users: memUsers.createUserRepository(),
        ocorrencias: memOcorrencias.createOcorrenciaRepository(),
      }),
    },
  ],
];

if (TEST_DB) {
  let pool;
  implementacoes.push([
    'PostgreSQL',
    {
      setup: async () => {
        pool = createPool({ url: TEST_DB });
        await migrate(pool, { logger: { log: () => {} } });
        return { teardown: () => pool.end() };
      },
      make: async () => {
        await pool.query('TRUNCATE ocorrencias, usuarios, prioridade_por_bairro CASCADE');
        return {
          pool,
          users: pgUsers.createUserRepository(pool),
          ocorrencias: pgOcorrencias.createOcorrenciaRepository(pool),
        };
      },
    },
  ]);
} else {
  test.todo('contrato PostgreSQL (defina TEST_DATABASE_URL para rodar)');
}

const novaOcorrencia = (cidadaoId, extra = {}) => ({
  cidadaoId,
  descricao: 'Semáforo de pedestres apagado',
  categoria: 'semaforo',
  endereco: { logradouro: 'Av. Paulista', bairro: 'Bela Vista', cep: '01310-100', cidade: 'São Paulo' },
  localizacao: { lat: -23.56, lng: -46.65 },
  status: 'aguardando_aprovacao',
  urgencia: 'alta',
  triagem: { fonte: 'regras', urgencia: 'alta' },
  protocolo156: null,
  historico: [{ status: 'aguardando_aprovacao', porPapel: 'cidadao', em: '2026-11-12T10:00:00.000Z' }],
  ...extra,
});

describe.each(implementacoes)('Repositórios (%s)', (_nome, impl) => {
  let ctx;
  let repos;

  beforeAll(async () => {
    ctx = await impl.setup();
  });
  afterAll(async () => ctx?.teardown?.());
  beforeEach(async () => {
    repos = await impl.make();
  });

  const criarUsuario = (email = 'Ana@Exemplo.com', papel = 'cidadao') =>
    repos.users.create({ nome: 'Ana', email, senhaHash: 'hash', papel });

  describe('usuários', () => {
    it('cria e busca por e-mail sem diferenciar maiúsculas', async () => {
      const criado = await criarUsuario();

      expect(criado).toMatchObject({ nome: 'Ana', email: 'ana@exemplo.com', papel: 'cidadao', endereco: null });
      expect(new Date(criado.criadoEm).toISOString()).toBe(criado.criadoEm);
      expect(await repos.users.findByEmail('ANA@exemplo.com')).toEqual(criado);
      expect(await repos.users.findById(criado.id)).toEqual(criado);
    });

    it('devolve null para quem não existe (inclusive id malformado)', async () => {
      expect(await repos.users.findByEmail('nao@existe.com')).toBeNull();
      expect(await repos.users.findById('00000000-0000-0000-0000-000000000000')).toBeNull();
      expect(await repos.users.findById('nao-e-uuid')).toBeNull();
      expect(await repos.users.update('nao-e-uuid', { endereco: {} })).toBeNull();
    });

    it('atualiza o endereço', async () => {
      const { id } = await criarUsuario();
      const endereco = { bairro: 'Sé', cep: '01001-000', cidade: 'São Paulo' };
      expect((await repos.users.update(id, { endereco })).endereco).toEqual(endereco);
      expect((await repos.users.findById(id)).endereco).toEqual(endereco);
    });
  });

  describe('ocorrências', () => {
    it('cria e busca por id com todos os campos', async () => {
      const { id: cidadaoId } = await criarUsuario();
      const criada = await repos.ocorrencias.create(novaOcorrencia(cidadaoId));

      expect(criada).toMatchObject({ ...novaOcorrencia(cidadaoId), apoiadores: [] });
      expect(await repos.ocorrencias.findById(criada.id)).toEqual(criada);
      expect(await repos.ocorrencias.findById('nao-e-uuid')).toBeNull();
    });

    it('lista com filtros, mais recentes primeiro', async () => {
      const ana = await criarUsuario();
      const bruno = await criarUsuario('bruno@exemplo.com');
      const primeira = await repos.ocorrencias.create(novaOcorrencia(ana.id));
      await new Promise((r) => setTimeout(r, 5));
      const segunda = await repos.ocorrencias.create(
        novaOcorrencia(bruno.id, {
          categoria: 'iluminacao',
          endereco: { logradouro: 'Rua A', bairro: 'Sé', cep: '01001-000', cidade: 'São Paulo' },
        }),
      );

      const todas = await repos.ocorrencias.list();
      expect(todas.total).toBe(2);
      expect(todas.items.map((o) => o.id)).toEqual([segunda.id, primeira.id]);

      expect((await repos.ocorrencias.list({ cidadaoId: ana.id })).total).toBe(1);
      expect((await repos.ocorrencias.list({ categoria: 'iluminacao' })).total).toBe(1);
      expect((await repos.ocorrencias.list({ bairro: 'SÉ' })).total).toBe(1);
      expect((await repos.ocorrencias.list({ status: 'resolvida' })).total).toBe(0);
    });

    it('pagina e informa o total mesmo além da última página', async () => {
      const { id } = await criarUsuario();
      for (let i = 0; i < 3; i++) await repos.ocorrencias.create(novaOcorrencia(id));

      const p2 = await repos.ocorrencias.list({ page: 2, limit: 2 });
      expect(p2.items).toHaveLength(1);
      expect(p2.total).toBe(3);

      const p9 = await repos.ocorrencias.list({ page: 9, limit: 2 });
      expect(p9.items).toHaveLength(0);
      expect(p9.total).toBe(3);
    });

    it('atualiza status, histórico e apoiadores, e devolve todas com all()', async () => {
      const ana = await criarUsuario();
      const bruno = await criarUsuario('bruno@exemplo.com');
      const { id, historico } = await repos.ocorrencias.create(novaOcorrencia(ana.id));

      const atualizada = await repos.ocorrencias.update(id, {
        status: 'protocolada',
        protocolo156: '2026-001',
        historico: [...historico, { status: 'protocolada', porPapel: 'robo', em: '2026-11-12T11:00:00.000Z' }],
        apoiadores: [bruno.id],
      });

      expect(atualizada).toMatchObject({ status: 'protocolada', protocolo156: '2026-001', apoiadores: [bruno.id] });
      expect(atualizada.historico).toHaveLength(2);
      expect(await repos.ocorrencias.all()).toEqual([atualizada]);
      expect(await repos.ocorrencias.update('nao-e-uuid', { status: 'x' })).toBeNull();
    });
  });
});

// Testes que só fazem sentido no PostgreSQL real.
(TEST_DB ? describe : describe.skip)('PostgreSQL: migrações, /health e Airflow', () => {
  const { createIndicadoresRepositoryPg } = require('../src/repositories/indicadoresRepository');
  const { createContainer } = require('../src/container');
  let pool;

  beforeAll(async () => {
    pool = createPool({ url: TEST_DB });
    await migrate(pool, { logger: { log: () => {} } });
  });
  afterAll(() => pool.end());

  it('migrações são idempotentes (rodar de novo não aplica nada)', async () => {
    expect(await migrate(pool, { logger: { log: () => {} } })).toEqual([]);
  });

  it('aplica migrações novas e desfaz por inteiro a que falhar', async () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migracoes-'));
    fs.writeFileSync(path.join(dir, '900_ok.sql'), 'CREATE TABLE teste_mig_ok (x int);');
    fs.writeFileSync(
      path.join(dir, '901_falha.sql'),
      'CREATE TABLE teste_mig_falha (x int); SELECT 1/0;',
    );
    const silencioso = { logger: { log: () => {} }, dir };

    try {
      await expect(migrate(pool, silencioso)).rejects.toThrow('Falha na migração 901_falha.sql');

      const existe = async (t) =>
        (await pool.query('SELECT to_regclass($1) AS t', [t])).rows[0].t !== null;
      expect(await existe('teste_mig_ok')).toBe(true); //    a boa foi aplicada
      expect(await existe('teste_mig_falha')).toBe(false); // a ruim foi desfeita inteira
      const { rows } = await pool.query("SELECT nome FROM schema_migrations WHERE nome LIKE '90%'");
      expect(rows.map((r) => r.nome)).toEqual(['900_ok.sql']);
    } finally {
      await pool.query("DROP TABLE IF EXISTS teste_mig_ok; DELETE FROM schema_migrations WHERE nome LIKE '90%'");
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('checkDatabase responde ok com o banco no ar', async () => {
    expect(await createContainer({ pool }).checkDatabase()).toBe('ok');
  });

  it('checkDatabase responde indisponivel sem conexão', async () => {
    const quebrado = createPool({ url: 'postgres://x:y@127.0.0.1:1/nada' });
    expect(await createContainer({ pool: quebrado }).checkDatabase()).toBe('indisponivel');
    await quebrado.end();
  });

  it('lê a prioridade por bairro gravada pelo Airflow, da maior para a menor', async () => {
    await pool.query('TRUNCATE prioridade_por_bairro');
    await pool.query(`INSERT INTO prioridade_por_bairro (bairro, populacao_idosa, ocorrencias, apoios, score_prioridade)
                      VALUES ('Sé', 5200, 12, 30, 61.5), ('Bela Vista', 8100, 20, 41, 87.25)`);
    const [primeiro, segundo] = await createIndicadoresRepositoryPg(pool).prioridadeBairros();

    expect(primeiro).toMatchObject({ bairro: 'Bela Vista', scorePrioridade: 87.25, populacaoIdosa: 8100 });
    expect(segundo.bairro).toBe('Sé');
  });
});
