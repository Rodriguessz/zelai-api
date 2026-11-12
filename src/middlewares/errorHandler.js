const config = require('../config');
const telemetry = require('../telemetry');

// Tratamento central de erros: o cliente recebe uma mensagem padronizada
// e detalhes internos (stack trace) nunca vazam em produção.
module.exports = (err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  const isServerError = status >= 500;

  if (isServerError) {
    console.error(`[${req.id ?? '-'}]`, err);
    telemetry.trackException(err, { requestId: req.id, rota: `${req.method} ${req.originalUrl}` });
  }

  res.status(status).json({
    error: err.name && !isServerError ? err.name : 'InternalServerError',
    message: isServerError ? 'Erro interno no servidor' : err.message,
    ...(!isServerError && err.details && { details: err.details }),
    ...(isServerError && req.id && { requestId: req.id }), // para o usuário informar ao suporte
    ...(config.env !== 'production' && isServerError && { detail: err.message }),
  });
};
