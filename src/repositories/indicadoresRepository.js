// Leitura da tabela "gold" prioridade_por_bairro, preenchida pelo Airflow.
// Em memória não existe pipeline, então a lista é vazia.

function createIndicadoresRepositoryMemory() {
  return {
    async prioridadeBairros() {
      return [];
    },
  };
}

function createIndicadoresRepositoryPg(pool) {
  return {
    async prioridadeBairros(limite = 10) {
      const { rows } = await pool.query(
        `SELECT bairro, populacao_idosa, ocorrencias, apoios, score_prioridade, atualizado_em
         FROM prioridade_por_bairro
         ORDER BY score_prioridade DESC
         LIMIT $1`,
        [limite],
      );
      return rows.map((r) => ({
        bairro: r.bairro,
        populacaoIdosa: r.populacao_idosa,
        ocorrencias: r.ocorrencias,
        apoios: r.apoios,
        scorePrioridade: Number(r.score_prioridade),
        atualizadoEm: r.atualizado_em.toISOString(),
      }));
    },
  };
}

module.exports = { createIndicadoresRepositoryMemory, createIndicadoresRepositoryPg };
