const { createApp } = require('./app');
const config = require('./config');

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`ZelaAí API v${config.version} ouvindo na porta ${config.port} (${config.env})`);
});

// Encerramento gracioso: o App Service envia SIGTERM ao reiniciar/trocar versão.
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
