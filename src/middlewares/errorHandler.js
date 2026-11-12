const config = require('../config');

// Tratamento central de erros: o cliente recebe uma mensagem padronizada
// e detalhes internos (stack trace) nunca vazam em produção.
module.exports = (err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  const isServerError = status >= 500;

  if (isServerError) console.error(err);

  res.status(status).json({
    error: err.name && !isServerError ? err.name : 'InternalServerError',
    message: isServerError ? 'Erro interno no servidor' : err.message,
    ...(!isServerError && err.details && { details: err.details }),
    ...(config.env !== 'production' && isServerError && { detail: err.message }),
  });
};
