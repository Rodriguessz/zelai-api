const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');
const { ROLES } = require('../domain/roles');
const { CATEGORIAS, ALL_STATUS } = require('../domain/ocorrencia');

const texto = () => z.string({ error: 'Campo obrigatório' }).trim();

const enderecoSchema = z.object({
  logradouro: texto().min(3).max(200),
  numero: z.string().trim().max(20).optional(),
  bairro: texto().min(2).max(100),
  cep: texto().regex(/^\d{5}-?\d{3}$/, 'CEP inválido (use 00000-000)'),
  cidade: z.string().trim().max(100).default('São Paulo'),
});

const criarSchema = z.object({
  descricao: texto().min(10, 'Descreva o problema com pelo menos 10 caracteres').max(1000),
  categoria: z.enum(CATEGORIAS, { error: `Use uma de: ${CATEGORIAS.join(', ')}` }),
  endereco: enderecoSchema,
  localizacao: z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
    .optional(),
});

const listarSchema = z.object({
  status: z.enum(ALL_STATUS).optional(),
  categoria: z.enum(CATEGORIAS).optional(),
  bairro: z.string().trim().min(1).optional(),
  minhas: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const statusSchema = z.object({
  status: z.enum(ALL_STATUS, { error: `Use um de: ${ALL_STATUS.join(', ')}` }),
  observacao: z.string().trim().max(500).optional(),
  protocolo156: z.string().trim().min(1).max(50).optional(),
});

function createOcorrenciasRouter({ authService, ocorrenciaService }) {
  const router = Router();

  // Todas as rotas de ocorrências exigem login.
  router.use(authenticate(authService));

  // POST /ocorrencias → cidadão registra um problema
  router.post('/', authorize(ROLES.CIDADAO), validate(criarSchema), async (req, res) => {
    res.status(201).json(await ocorrenciaService.create(req.user, req.body));
  });

  // GET /ocorrencias?status=&categoria=&bairro=&minhas=true&page=1&limit=20
  router.get('/', validate(listarSchema, 'query'), async (req, res) => {
    res.json(await ocorrenciaService.list(req.user, req.valid.query));
  });

  // GET /ocorrencias/:id
  router.get('/:id', async (req, res) => {
    res.json(await ocorrenciaService.get(req.user, req.params.id));
  });

  // PATCH /ocorrencias/:id/status → gestor aprova/rejeita/resolve; robô protocola
  router.patch(
    '/:id/status',
    authorize(ROLES.GESTOR, ROLES.ROBO),
    validate(statusSchema),
    async (req, res) => {
      res.json(await ocorrenciaService.changeStatus(req.user, req.params.id, req.body));
    },
  );

  // POST /ocorrencias/:id/apoios → cidadão diz "isso também me afeta"
  router.post('/:id/apoios', authorize(ROLES.CIDADAO), async (req, res) => {
    res.status(201).json(await ocorrenciaService.apoiar(req.user, req.params.id));
  });

  return router;
}

module.exports = { createOcorrenciasRouter };
