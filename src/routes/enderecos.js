const { Router } = require('express');
const multer = require('multer');
const { z } = require('zod');
const validate = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');
const { ROLES } = require('../domain/roles');
const HttpError = require('../utils/httpError');

const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'];
const TAMANHO_MAXIMO = 5 * 1024 * 1024; // 5 MB

// memoryStorage: a imagem fica só na memória durante a requisição e nunca vai para disco.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANHO_MAXIMO, files: 1 },
  fileFilter: (_req, file, cb) =>
    TIPOS_ACEITOS.includes(file.mimetype)
      ? cb(null, true)
      : cb(HttpError.badRequest('Envie uma imagem JPG, PNG ou WEBP')),
}).single('comprovante');

// Converte os erros do multer (arquivo grande, campo errado…) em respostas 400 claras.
const receberComprovante = (req, res, next) =>
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const msg =
        err.code === 'LIMIT_FILE_SIZE' ? 'A imagem deve ter no máximo 5 MB' : 'Envio de arquivo inválido';
      return next(HttpError.badRequest(msg));
    }
    if (err) return next(err);
    if (!req.file) return next(HttpError.badRequest('Envie a foto no campo "comprovante"'));
    return next();
  });

const confirmarSchema = z.object({
  bairro: z.string({ error: 'Campo obrigatório' }).trim().min(2).max(100),
  cep: z.string({ error: 'Campo obrigatório' }).trim().regex(/^\d{5}-?\d{3}$/, 'CEP inválido (use 00000-000)'),
  cidade: z.string().trim().min(2).max(100).default('São Paulo'),
});

function createEnderecosRouter({ authService, enderecoService }) {
  const router = Router();
  router.use(authenticate(authService), authorize(ROLES.CIDADAO));

  // POST /enderecos/extracao → lê o comprovante e devolve uma SUGESTÃO (nada é salvo)
  router.post('/extracao', receberComprovante, async (req, res) => {
    res.json(await enderecoService.extrair(req.file));
  });

  // PUT /enderecos/meu → cidadão confirma/corrige; salva só bairro, CEP e cidade
  router.put('/meu', validate(confirmarSchema), async (req, res) => {
    res.json(await enderecoService.confirmar(req.user.id, req.body));
  });

  return router;
}

module.exports = { createEnderecosRouter };
