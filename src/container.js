const config = require('./config');
const { createUserRepository } = require('./repositories/userRepository.memory');
const { createAuthService } = require('./services/authService');

// Monta as dependências da aplicação em um só lugar (composition root).
// Nos testes podemos criar um container novo, isolado, a cada suíte.
function createContainer(overrides = {}) {
  const userRepository = overrides.userRepository ?? createUserRepository();
  const authService =
    overrides.authService ?? createAuthService({ userRepository, jwtConfig: config.jwt });

  return { userRepository, authService };
}

module.exports = { createContainer };
