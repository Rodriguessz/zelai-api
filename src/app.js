const express = require('express');
const { createContainer } = require('./container');
const { createHealthRouter } = require('./routes/health');
const { createAuthRouter } = require('./routes/auth');
const { createOcorrenciasRouter } = require('./routes/ocorrencias');
const { createDocsRouter } = require('./routes/docs');
const { createEnderecosRouter } = require('./routes/enderecos');
const { createIndicadoresRouter } = require('./routes/indicadores');
const notFound = require('./middlewares/notFound');
const errorHandler = require('./middlewares/errorHandler');

// Cria a aplicação sem abrir porta: assim os testes usam a mesma app
// que roda em produção, sem precisar de servidor de verdade.
function createApp(container = createContainer()) {
  const app = express();

  app.disable('x-powered-by'); // não expõe a tecnologia do servidor
  app.use(express.json({ limit: '100kb' }));

  app.use('/health', createHealthRouter(container));
  app.use(createDocsRouter()); // GET /docs (Swagger UI) e GET /openapi.json
  app.use('/auth', createAuthRouter(container));
  app.use('/ocorrencias', createOcorrenciasRouter(container));
  app.use('/enderecos', createEnderecosRouter(container));
  app.use('/indicadores', createIndicadoresRouter(container));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
