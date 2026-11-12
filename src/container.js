const config = require('./config');
const memory = {
  users: require('./repositories/userRepository.memory'),
  ocorrencias: require('./repositories/ocorrenciaRepository.memory'),
};
const pg = {
  users: require('./repositories/userRepository.pg'),
  ocorrencias: require('./repositories/ocorrenciaRepository.pg'),
};
const {
  createIndicadoresRepositoryMemory,
  createIndicadoresRepositoryPg,
} = require('./repositories/indicadoresRepository');
const { createAuthService } = require('./services/authService');
const { createOcorrenciaService } = require('./services/ocorrenciaService');
const { createTriagemService } = require('./services/triagemService');
const { createEnderecoService } = require('./services/enderecoService');
const { createIndicadoresService } = require('./services/indicadoresService');
const { createGenaiClient } = require('./integrations/genaiClient');
const { createVisaoClient } = require('./integrations/visaoClient');

// Monta as dependências da aplicação em um só lugar (composition root).
// - Com `pool` (PostgreSQL): repositórios no banco.
// - Sem `pool`: repositórios em memória (desenvolvimento e testes).
function createContainer({ pool, ...overrides } = {}) {
  const userRepository =
    overrides.userRepository ??
    (pool ? pg.users.createUserRepository(pool) : memory.users.createUserRepository());
  const ocorrenciaRepository =
    overrides.ocorrenciaRepository ??
    (pool
      ? pg.ocorrencias.createOcorrenciaRepository(pool)
      : memory.ocorrencias.createOcorrenciaRepository());
  const indicadoresRepository =
    overrides.indicadoresRepository ??
    (pool ? createIndicadoresRepositoryPg(pool) : createIndicadoresRepositoryMemory());

  const authService =
    overrides.authService ?? createAuthService({ userRepository, jwtConfig: config.jwt });

  const genaiClient = overrides.genaiClient ?? createGenaiClient(config.genai);
  const triagemService = overrides.triagemService ?? createTriagemService({ genaiClient });
  const ocorrenciaService =
    overrides.ocorrenciaService ??
    createOcorrenciaService({ ocorrenciaRepository, triagemService });

  const visaoClient = overrides.visaoClient ?? createVisaoClient(config.visao);
  const enderecoService =
    overrides.enderecoService ?? createEnderecoService({ visaoClient, userRepository });

  const indicadoresService =
    overrides.indicadoresService ??
    createIndicadoresService({ ocorrenciaRepository, indicadoresRepository });

  // Usado pelo /health: 'ok', 'indisponivel' ou 'memoria' (sem banco configurado).
  const checkDatabase =
    overrides.checkDatabase ??
    (async () => {
      if (!pool) return 'memoria';
      try {
        await pool.query('SELECT 1');
        return 'ok';
      } catch {
        return 'indisponivel';
      }
    });

  return {
    userRepository,
    ocorrenciaRepository,
    indicadoresRepository,
    authService,
    genaiClient,
    triagemService,
    ocorrenciaService,
    visaoClient,
    enderecoService,
    indicadoresService,
    checkDatabase,
  };
}

module.exports = { createContainer };
