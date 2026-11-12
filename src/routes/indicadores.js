const { Router } = require('express');
const { authenticate, authorize } = require('../middlewares/auth');
const { ROLES } = require('../domain/roles');

function createIndicadoresRouter({ authService, indicadoresService }) {
  const router = Router();

  // GET /indicadores → painel de impacto (somente gestor)
  router.get('/', authenticate(authService), authorize(ROLES.GESTOR), async (_req, res) => {
    res.json(await indicadoresService.calcular());
  });

  return router;
}

module.exports = { createIndicadoresRouter };
