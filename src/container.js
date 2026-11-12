const config = require('./config');
const { createUserRepository } = require('./repositories/userRepository.memory');
const { createOcorrenciaRepository } = require('./repositories/ocorrenciaRepository.memory');
const { createAuthService } = require('./services/authService');
const { createOcorrenciaService } = require('./services/ocorrenciaService');
const { createTriagemService } = require('./services/triagemService');
const { createGenaiClient } = require('./integrations/genaiClient');

// Monta as dependências da aplicação em um só lugar (composition root).
// Nos testes podemos criar um container novo, isolado, a cada suíte.
function createContainer(overrides = {}) {
  const userRepository = overrides.userRepository ?? createUserRepository();
  const ocorrenciaRepository = overrides.ocorrenciaRepository ?? createOcorrenciaRepository();

  const authService =
    overrides.authService ?? createAuthService({ userRepository, jwtConfig: config.jwt });
  const genaiClient = overrides.genaiClient ?? createGenaiClient(config.genai);
  const triagemService = overrides.triagemService ?? createTriagemService({ genaiClient });
  const ocorrenciaService =
    overrides.ocorrenciaService ??
    createOcorrenciaService({ ocorrenciaRepository, triagemService });

  return {
    userRepository,
    ocorrenciaRepository,
    authService,
    genaiClient,
    triagemService,
    ocorrenciaService,
  };
}

module.exports = { createContainer };
