const crypto = require('node:crypto');

// Repositório de usuários em memória.
// Mesma interface que a versão PostgreSQL terá (PR de banco de dados),
// então o resto da aplicação não muda quando trocarmos o armazenamento.
function createUserRepository() {
  const users = new Map();

  return {
    async create({ nome, email, senhaHash, papel }) {
      const user = {
        id: crypto.randomUUID(),
        nome,
        email: email.toLowerCase(),
        senhaHash,
        papel,
        criadoEm: new Date().toISOString(),
      };
      users.set(user.id, user);
      return user;
    },

    async findByEmail(email) {
      const target = email.toLowerCase();
      return [...users.values()].find((u) => u.email === target) ?? null;
    },

    async findById(id) {
      return users.get(id) ?? null;
    },
  };
}

module.exports = { createUserRepository };
