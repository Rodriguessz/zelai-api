const crypto = require('node:crypto');

// Repositório de ocorrências em memória (mesma interface da futura versão PostgreSQL).
function createOcorrenciaRepository() {
  const ocorrencias = new Map();
  const clone = (o) => (o ? structuredClone(o) : null);

  return {
    async create(data) {
      const agora = new Date().toISOString();
      const ocorrencia = {
        id: crypto.randomUUID(),
        ...data,
        apoiadores: [],
        criadaEm: agora,
        atualizadaEm: agora,
      };
      ocorrencias.set(ocorrencia.id, ocorrencia);
      return clone(ocorrencia);
    },

    async findById(id) {
      return clone(ocorrencias.get(id));
    },

    // Filtros opcionais: cidadaoId, status, categoria, bairro. Mais recentes primeiro.
    async list({ cidadaoId, status, categoria, bairro, page = 1, limit = 20 } = {}) {
      const filtradas = [...ocorrencias.values()]
        .filter((o) => !cidadaoId || o.cidadaoId === cidadaoId)
        .filter((o) => !status || o.status === status)
        .filter((o) => !categoria || o.categoria === categoria)
        .filter((o) => !bairro || o.endereco.bairro.toLowerCase() === bairro.toLowerCase())
        .sort((a, b) => b.criadaEm.localeCompare(a.criadaEm));

      const inicio = (page - 1) * limit;
      return { items: filtradas.slice(inicio, inicio + limit).map(clone), total: filtradas.length };
    },

    async all() {
      return [...ocorrencias.values()].map(clone);
    },

    async update(id, changes) {
      const atual = ocorrencias.get(id);
      if (!atual) return null;
      const atualizada = { ...atual, ...changes, atualizadaEm: new Date().toISOString() };
      ocorrencias.set(id, atualizada);
      return clone(atualizada);
    },
  };
}

module.exports = { createOcorrenciaRepository };
