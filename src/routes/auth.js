const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middlewares/validate');
const { authenticate } = require('../middlewares/auth');

// Mensagem padrão para campo ausente ou com tipo errado.
const texto = () => z.string({ error: 'Campo obrigatório' });

const registerSchema = z.object({
  nome: texto().trim().min(2, 'Mínimo de 2 caracteres').max(100),
  email: z.email({ error: 'E-mail inválido' }),
  // bcrypt só considera os primeiros 72 bytes, por isso o limite.
  senha: texto().min(8, 'Mínimo de 8 caracteres').max(72),
});

const loginSchema = z.object({
  email: z.email({ error: 'E-mail inválido' }),
  senha: texto().min(1, 'Informe a senha'),
});

function createAuthRouter({ authService }) {
  const router = Router();

  // POST /auth/register → cria conta de cidadão
  router.post('/register', validate(registerSchema), async (req, res) => {
    const usuario = await authService.register(req.body);
    res.status(201).json(usuario);
  });

  // POST /auth/login → devolve o token JWT
  router.post('/login', validate(loginSchema), async (req, res) => {
    res.json(await authService.login(req.body));
  });

  // GET /auth/me → dados do usuário do token
  router.get('/me', authenticate(authService), async (req, res) => {
    res.json(await authService.getUser(req.user.id));
  });

  return router;
}

module.exports = { createAuthRouter };
