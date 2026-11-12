const config = require('./config');
const { createContainer } = require('./container');
const { createApp } = require('./app');
const { seedUsers } = require('./bootstrap/seedUsers');

async function main() {
  const container = createContainer();
  const seeded = await seedUsers(container.authService);
  if (seeded.length) console.log(`Contas de serviço criadas: ${seeded.join(', ')}`);

  const app = createApp(container);
  const server = app.listen(config.port, () => {
    console.log(`ZelaAí API v${config.version} ouvindo na porta ${config.port} (${config.env})`);
  });

  // Encerramento gracioso: o App Service envia SIGTERM ao reiniciar/trocar versão.
  process.on('SIGTERM', () => {
    server.close(() => process.exit(0));
  });
}

main().catch((err) => {
  console.error('Falha ao iniciar a API:', err);
  process.exit(1);
});
