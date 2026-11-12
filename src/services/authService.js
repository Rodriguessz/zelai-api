const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const HttpError = require('../utils/httpError');
const { ROLES } = require('../domain/roles');

const BCRYPT_ROUNDS = 10;

// Nunca devolvemos o hash da senha para fora do serviço (LGPD / segurança).
function toPublicUser({ senhaHash: _senhaHash, ...user }) {
  return user;
}

function createAuthService({ userRepository, jwtConfig }) {
  async function createUser({ nome, email, senha, papel }) {
    if (await userRepository.findByEmail(email)) {
      throw HttpError.conflict('E-mail já cadastrado');
    }
    const senhaHash = await bcrypt.hash(senha, BCRYPT_ROUNDS);
    const user = await userRepository.create({ nome, email, senhaHash, papel });
    return toPublicUser(user);
  }

  return {
    // Cadastro público: sempre cria um cidadão. Ninguém se autopromove a gestor.
    register({ nome, email, senha }) {
      return createUser({ nome, email, senha, papel: ROLES.CIDADAO });
    },

    // Usado na inicialização para criar contas de gestor/robô a partir do ambiente.
    async ensureUser({ nome, email, senha, papel }) {
      const existing = await userRepository.findByEmail(email);
      return existing ? toPublicUser(existing) : createUser({ nome, email, senha, papel });
    },

    async login({ email, senha }) {
      const user = await userRepository.findByEmail(email);
      // Mesma mensagem para e-mail inexistente e senha errada:
      // não revela quais e-mails estão cadastrados.
      const ok = user && (await bcrypt.compare(senha, user.senhaHash));
      if (!ok) throw HttpError.unauthorized('E-mail ou senha inválidos');

      const token = jwt.sign({ papel: user.papel }, jwtConfig.secret, {
        subject: user.id,
        expiresIn: jwtConfig.expiresIn,
      });
      return { token, tipo: 'Bearer', expiraEm: jwtConfig.expiresIn, usuario: toPublicUser(user) };
    },

    verifyToken(token) {
      try {
        const payload = jwt.verify(token, jwtConfig.secret);
        return { id: payload.sub, papel: payload.papel };
      } catch {
        throw HttpError.unauthorized('Token inválido ou expirado');
      }
    },

    async getUser(id) {
      const user = await userRepository.findById(id);
      if (!user) throw HttpError.notFound('Usuário não encontrado');
      return toPublicUser(user);
    },
  };
}

module.exports = { createAuthService };
