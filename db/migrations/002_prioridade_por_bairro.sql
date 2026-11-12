-- Tabela "gold" preenchida pelo pipeline do Airflow (disciplina Big Data).
-- O Airflow cruza as ocorrências com dados abertos (SP156, GeoSampa, IBGE)
-- e grava aqui a prioridade de cada bairro. A API apenas LÊ esta tabela.

CREATE TABLE IF NOT EXISTS prioridade_por_bairro (
  bairro            TEXT PRIMARY KEY,
  populacao_idosa   INTEGER,
  ocorrencias       INTEGER     NOT NULL DEFAULT 0,
  apoios            INTEGER     NOT NULL DEFAULT 0,
  score_prioridade  NUMERIC(6,2) NOT NULL,          -- quanto maior, mais prioritário
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);
