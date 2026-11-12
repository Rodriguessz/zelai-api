-- Usuários e ocorrências do ZelaAí.
-- Campos flexíveis (endereço, triagem, histórico) ficam em JSONB.

CREATE TABLE IF NOT EXISTS usuarios (
  id          UUID PRIMARY KEY,
  nome        TEXT        NOT NULL,
  email       TEXT        NOT NULL UNIQUE,          -- sempre salvo em minúsculas
  senha_hash  TEXT        NOT NULL,
  papel       TEXT        NOT NULL CHECK (papel IN ('cidadao', 'gestor', 'robo')),
  endereco    JSONB,                                -- só bairro, CEP e cidade (LGPD)
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ocorrencias (
  id             UUID PRIMARY KEY,
  cidadao_id     UUID        NOT NULL REFERENCES usuarios(id),
  descricao      TEXT        NOT NULL,
  categoria      TEXT        NOT NULL,
  endereco       JSONB       NOT NULL,
  localizacao    JSONB,
  status         TEXT        NOT NULL,
  urgencia       TEXT,
  triagem        JSONB,
  protocolo156   TEXT,
  historico      JSONB       NOT NULL DEFAULT '[]',
  apoiadores     UUID[]      NOT NULL DEFAULT '{}',
  criada_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizada_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para os filtros mais usados na listagem.
CREATE INDEX IF NOT EXISTS idx_ocorrencias_status     ON ocorrencias (status);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_categoria  ON ocorrencias (categoria);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_bairro     ON ocorrencias (lower(endereco->>'bairro'));
CREATE INDEX IF NOT EXISTS idx_ocorrencias_cidadao    ON ocorrencias (cidadao_id);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_criada_em  ON ocorrencias (criada_em DESC);
