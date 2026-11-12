const crypto = require('node:crypto');
const helmet = require('helmet');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const config = require('../config');

// Cabeçalhos de segurança (HSTS, X-Content-Type-Options, frame-ancestors…).
// A CSP libera só o necessário para o Swagger UI em /docs funcionar.
const securityHeaders = () =>
  helmet({
    contentSecurityPolicy: {
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'frame-ancestors': ["'none'"],
      },
    },
  });

// CORS: só as origens configuradas em CORS_ORIGINS podem chamar a API pelo navegador.
// Chamadas sem origem (robô UiPath, curl, Postman, servidor) não são afetadas.
const corsPolicy = () =>
  cors({
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy'],
    maxAge: 600,
  });

// Limite de requisições por IP. Respostas 429 seguem o padrão de erro da API.
const limiter = (max) =>
  rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({
        error: 'TooManyRequests',
        message: 'Muitas requisições. Aguarde alguns minutos e tente novamente.',
      }),
  });

// Login e cadastro têm limite bem menor: dificulta ataques de força bruta em senhas.
const generalLimiter = () => limiter(config.rateLimit.max);
const authLimiter = () => limiter(config.rateLimit.authMax);

// Identificador único por requisição, devolvido no header X-Request-Id.
// Ajuda a achar a requisição nos logs/Application Insights quando alguém reporta um erro.
const requestId = () => (req, res, next) => {
  const recebido = req.get('x-request-id');
  req.id = recebido && /^[\w-]{1,64}$/.test(recebido) ? recebido : crypto.randomUUID();
  res.set('X-Request-Id', req.id);
  next();
};

module.exports = { securityHeaders, corsPolicy, generalLimiter, authLimiter, requestId };
