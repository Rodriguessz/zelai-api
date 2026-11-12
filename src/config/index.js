// Centraliza a leitura de variáveis de ambiente.
// Nenhum segredo fica no código: tudo vem do ambiente (App Settings / Key Vault na Azure).
const crypto = require('node:crypto');
const { version } = require('../../package.json');

const env = process.env.NODE_ENV || 'development';

function jwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (env === 'production') {
    // Falha rápido: subir em produção sem segredo seria uma brecha de segurança.
    throw new Error('JWT_SECRET é obrigatório em produção');
  }
  // Em desenvolvimento/teste gera um segredo aleatório a cada execução.
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  env,
  port: Number(process.env.PORT) || 3000,
  version,
  // Sem DATABASE_URL a API usa armazenamento em memória (desenvolvimento e testes).
  database: {
    url: process.env.DATABASE_URL || null,
    ssl: process.env.DATABASE_SSL === 'true',
  },
  // Serviços das outras disciplinas. Sem URL configurada, a API usa o plano B.
  genai: {
    url: process.env.GENAI_URL || null,
    apiKey: process.env.GENAI_API_KEY || null,
    timeoutMs: Number(process.env.GENAI_TIMEOUT_MS) || 5000,
  },
  visao: {
    url: process.env.VISAO_URL || null,
    apiKey: process.env.VISAO_API_KEY || null,
    timeoutMs: Number(process.env.VISAO_TIMEOUT_MS) || 15000,
  },
  jwt: {
    secret: jwtSecret(),
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  },
};
