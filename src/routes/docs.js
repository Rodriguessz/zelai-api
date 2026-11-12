const fs = require('node:fs');
const path = require('node:path');
const { Router } = require('express');
const YAML = require('yaml');
const swaggerUi = require('swagger-ui-express');
const config = require('../config');

// Contrato da API (OpenAPI 3.1). É a referência para o front-end e para o robô UiPath.
const spec = YAML.parse(fs.readFileSync(path.join(__dirname, '../docs/openapi.yaml'), 'utf8'));
spec.info.version = config.version;

function createDocsRouter() {
  const router = Router();
  router.get('/openapi.json', (_req, res) => res.json(spec));
  router.use('/docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'ZelaAí API · Docs' }));
  return router;
}

module.exports = { createDocsRouter, spec };
