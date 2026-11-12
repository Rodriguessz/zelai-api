// Centraliza a leitura de variáveis de ambiente.
// Nenhum segredo fica no código: tudo vem do ambiente (App Settings na Azure).
const { version } = require('../../package.json');

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  version,
};
