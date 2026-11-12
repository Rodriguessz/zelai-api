// Erro com status HTTP. O errorHandler usa `status` e `name` para montar a resposta.
class HttpError extends Error {
  constructor(status, name, message) {
    super(message);
    this.status = status;
    this.name = name;
  }

  static badRequest(message, details) {
    return Object.assign(new HttpError(400, 'ValidationError', message), { details });
  }

  static unauthorized(message = 'Autenticação necessária') {
    return new HttpError(401, 'Unauthorized', message);
  }

  static forbidden(message = 'Você não tem permissão para esta ação') {
    return new HttpError(403, 'Forbidden', message);
  }

  static notFound(message = 'Recurso não encontrado') {
    return new HttpError(404, 'NotFound', message);
  }

  static conflict(message) {
    return new HttpError(409, 'Conflict', message);
  }
}

module.exports = HttpError;
