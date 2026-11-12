// Telemetria primeiro: o Application Insights precisa instrumentar express e pg ao carregar.
const { initTelemetry } = require('./telemetry');
const telemetriaAtiva = initTelemetry();

const config = require('./config');
const { createContainer } = require('./container');
const { createApp } = require('./app');
const { seedUsers } = require('./bootstrap/seedUsers');
const { createPool } = require('./db/pool');
const { migrate } = require('./db/migrate');

async function main() {
  let pool;
  if (config.database.url) {
    pool = createPool(config.database);
    await migrate(pool);
  } else if (config.env === 'production') {
    console.warn('ATENÇÃO: DATABASE_URL não definida. Os dados ficarão só em memória.');
  }

  const container = createContainer({ pool });
  const seeded = await seedUsers(container.authService);
  if (seeded.length) console.log(`Contas de serviço prontas: ${seeded.join(', ')}`);

  const app = createApp(container);
  const server = app.listen(config.port, () => {
    console.log(
      `ZelaAí API v${config.version} ouvindo na porta ${config.port} ` +
        `(${config.env}, banco: ${pool ? 'PostgreSQL' : 'memória'}, ` +
        `telemetria: ${telemetriaAtiva ? 'Application Insights' : 'desligada'})`,
    );
  });

  // Encerramento gracioso: o App Service envia SIGTERM ao reiniciar/trocar versão.
  process.on('SIGTERM', () => {
    server.close(async () => {
      await pool?.end();
      process.exit(0);
    });
  });
}

main().catch((err) => {
  console.error('Falha ao iniciar a API:', err);
  process.exit(1);
});
