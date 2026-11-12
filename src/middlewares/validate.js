const HttpError = require('../utils/httpError');

// Valida uma parte da requisição (body, query ou params) com um schema Zod.
// Se passar, os dados já limpos/convertidos ficam em req.valid[source]
// (e, no caso do body, também substituem req.body). Se falhar, responde 400.
// Obs.: no Express 5 req.query é somente leitura, por isso usamos req.valid.
module.exports =
  (schema, source = 'body') =>
  (req, _res, next) => {
    const result = schema.safeParse(req[source] ?? {});
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        campo: i.path.join('.'),
        mensagem: i.message,
      }));
      return next(HttpError.badRequest('Dados inválidos', details));
    }
    req.valid = { ...req.valid, [source]: result.data };
    if (source === 'body') req.body = result.data;
    return next();
  };
