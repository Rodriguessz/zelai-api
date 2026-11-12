const express = require('express');
const healthRouter = require('./routes/health');
const notFound = require('./middlewares/notFound');
const errorHandler = require('./middlewares/errorHandler');

// Cria a aplicação sem abrir porta: assim os testes usam a mesma app
// que roda em produção, sem precisar de servidor de verdade.
function createApp() {
  const app = express();

  app.disable('x-powered-by'); // não expõe a tecnologia do servidor
  app.use(express.json({ limit: '100kb' }));

  app.use('/health', healthRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
