const crypto = require('node:crypto');

const toOcorrencia = (r) =>
  r && {
    id: r.id,
    cidadaoId: r.cidadao_id,
    descricao: r.descricao,
    categoria: r.categoria,
    endereco: r.endereco,
    localizacao: r.localizacao,
    status: r.status,
    urgencia: r.urgencia,
    triagem: r.triagem,
    protocolo156: r.protocolo156,
    historico: r.historico,
    apoiadores: r.apoiadores,
    criadaEm: r.criada_em.toISOString(),
    atualizadaEm: r.atualizada_em.toISOString(),
  };

// Campos que podem ser alterados via update() → coluna correspondente.
// Qualquer outro campo é ignorado (whitelist).
const COLUNAS_ATUALIZAVEIS = {
  status: 'status',
  protocolo156: 'protocolo156',
  historico: 'historico',
  apoiadores: 'apoiadores',
  urgencia: 'urgencia',
  triagem: 'triagem',
};
const JSONB = new Set(['historico', 'triagem']);

function montarWhere({ cidadaoId, status, categoria, bairro }) {
  const where = [];
  const params = [];
  const add = (sql, valor) => {
    params.push(valor);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (cidadaoId) add('cidadao_id::text = ?', cidadaoId);
  if (status) add('status = ?', status);
  if (categoria) add('categoria = ?', categoria);
  if (bairro) add("lower(endereco->>'bairro') = lower(?)", bairro);
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

// Repositório de ocorrências no PostgreSQL (mesma interface da versão em memória).
// Todas as consultas usam parâmetros ($1, $2…): sem risco de SQL injection.
function createOcorrenciaRepository(pool) {
  return {
    async create(d) {
      const { rows } = await pool.query(
        `INSERT INTO ocorrencias
           (id, cidadao_id, descricao, categoria, endereco, localizacao,
            status, urgencia, triagem, protocolo156, historico)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [
          crypto.randomUUID(),
          d.cidadaoId,
          d.descricao,
          d.categoria,
          d.endereco,
          d.localizacao,
          d.status,
          d.urgencia,
          d.triagem,
          d.protocolo156,
          JSON.stringify(d.historico),
        ],
      );
      return toOcorrencia(rows[0]);
    },

    async findById(id) {
      const { rows } = await pool.query('SELECT * FROM ocorrencias WHERE id::text = $1', [id]);
      return toOcorrencia(rows[0]) ?? null;
    },

    async list({ page = 1, limit = 20, ...filtros } = {}) {
      const where = montarWhere(filtros);
      const n = where.params.length;
      const [{ rows }, { rows: contagem }] = await Promise.all([
        pool.query(
          `SELECT * FROM ocorrencias ${where.sql}
           ORDER BY criada_em DESC LIMIT $${n + 1} OFFSET $${n + 2}`,
          [...where.params, limit, (page - 1) * limit],
        ),
        pool.query(`SELECT COUNT(*)::int AS total FROM ocorrencias ${where.sql}`, where.params),
      ]);
      return { items: rows.map(toOcorrencia), total: contagem[0].total };
    },

    async all() {
      const { rows } = await pool.query('SELECT * FROM ocorrencias');
      return rows.map(toOcorrencia);
    },

    async update(id, changes) {
      const sets = ['atualizada_em = now()'];
      const params = [id];
      for (const [campo, valor] of Object.entries(changes)) {
        const coluna = COLUNAS_ATUALIZAVEIS[campo];
        if (!coluna) continue;
        params.push(JSONB.has(campo) ? JSON.stringify(valor) : valor);
        sets.push(`${coluna} = $${params.length}`);
      }
      const { rows } = await pool.query(
        `UPDATE ocorrencias SET ${sets.join(', ')} WHERE id::text = $1 RETURNING *`,
        params,
      );
      return toOcorrencia(rows[0]) ?? null;
    },
  };
}

module.exports = { createOcorrenciaRepository };
