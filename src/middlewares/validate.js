const HttpError = require('../utils/httpError');

// Valida req.body com um schema Zod. Se passar, substitui o body pelos dados
// já limpos (campos desconhecidos são descartados). Se falhar, responde 400.
module.exports = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      campo: i.path.join('.'),
      mensagem: i.message,
    }));
    return next(HttpError.badRequest('Dados inválidos', details));
  }
  req.body = result.data;
  return next();
};
