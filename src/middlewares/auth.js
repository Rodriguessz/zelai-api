const HttpError = require('../utils/httpError');

// authenticate: exige o header "Authorization: Bearer <token>".
// Se válido, coloca { id, papel } em req.user.
function authenticate(authService) {
  return (req, _res, next) => {
    const [scheme, token] = (req.headers.authorization || '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      return next(HttpError.unauthorized());
    }
    try {
      req.user = authService.verifyToken(token);
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

// authorize: libera a rota apenas para os papéis informados (RBAC).
// Uso: router.patch('/x', authenticate(svc), authorize('gestor', 'robo'), handler)
function authorize(...papeis) {
  return (req, _res, next) => {
    if (!req.user) return next(HttpError.unauthorized());
    if (!papeis.includes(req.user.papel)) return next(HttpError.forbidden());
    return next();
  };
}

module.exports = { authenticate, authorize };
