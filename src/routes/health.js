const { Router } = require('express');
const config = require('../config');

const router = Router();

// Usado pelo Health Check do App Service, pelo smoke test do pipeline
// e pelo teste de disponibilidade do Application Insights.
router.get('/', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    version: config.version,
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
