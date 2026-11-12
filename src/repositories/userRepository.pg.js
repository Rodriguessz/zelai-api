const crypto = require('node:crypto');

const toUser = (r) =>
  r && {
    id: r.id,
    nome: r.nome,
    email: r.email,
    senhaHash: r.senha_hash,
    papel: r.papel,
    endereco: r.endereco,
    criadoEm: r.criado_em.toISOString(),
  };

// Repositório de usuários no PostgreSQL (mesma interface da versão em memória).
// Todas as consultas usam parâmetros ($1, $2…): sem risco de SQL injection.
function createUserRepository(pool) {
  return {
    async create({ nome, email, senhaHash, papel }) {
      const { rows } = await pool.query(
        `INSERT INTO usuarios (id, nome, email, senha_hash, papel)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [crypto.randomUUID(), nome, email.toLowerCase(), senhaHash, papel],
      );
      return toUser(rows[0]);
    },

    async findByEmail(email) {
      const { rows } = await pool.query('SELECT * FROM usuarios WHERE email = $1', [
        email.toLowerCase(),
      ]);
      return toUser(rows[0]) ?? null;
    },

    async findById(id) {
      const { rows } = await pool.query('SELECT * FROM usuarios WHERE id::text = $1', [id]);
      return toUser(rows[0]) ?? null;
    },

    async update(id, { endereco }) {
      const { rows } = await pool.query(
        'UPDATE usuarios SET endereco = $2 WHERE id::text = $1 RETURNING *',
        [id, endereco],
      );
      return toUser(rows[0]) ?? null;
    },
  };
}

module.exports = { createUserRepository };
