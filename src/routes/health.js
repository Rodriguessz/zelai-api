const { Router } = require('express');
const config = require('../config');

// Usado pelo Health Check do App Service, pelo smoke test do pipeline
// e pelo teste de disponibilidade do Application Insights.
// Responde 503 se o banco estiver fora do ar: a Azure tira a instância do balanceamento
// e o alerta de indisponibilidade dispara.
function createHealthRouter({ checkDatabase }) {
  const router = Router();

  router.get('/', async (_req, res) => {
    const database = await checkDatabase();
    const ok = database !== 'indisponivel';
    res.status(ok ? 200 : 503).json({
      status: ok ? 'ok' : 'degradado',
      version: config.version,
      commit: config.build.commit, // o smoke test do CD confere se é o commit recém-publicado
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      checks: { database },
    });
  });

  return router;
}

module.exports = { createHealthRouter };
