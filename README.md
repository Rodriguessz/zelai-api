# ZelaAí · API

[![CI](https://github.com/Rodriguessz/zelai-api/actions/workflows/ci.yml/badge.svg)](https://github.com/Rodriguessz/zelai-api/actions/workflows/ci.yml)

API Node.js do **ZelaAí**, plataforma de zeladoria urbana acessível desenvolvida para a Global Solution 2026.2 (CitizenTech · FIAP).

> A Ficha Técnica do MVP será adicionada ao final do projeto.

## Stack

- Node.js 22 (LTS) + Express 5
- Jest + Supertest (testes)
- ESLint 10 (padrão de código)

## Como rodar localmente

```bash
nvm use            # usa o Node 22 definido em .nvmrc
npm ci             # instala dependências exatamente como no package-lock
cp .env.example .env
npm run dev        # sobe a API com reload automático
```

Teste: <http://localhost:3000/health>

## Scripts

| Comando | O que faz |
|---|---|
| `npm start` | Sobe a API (usado em produção) |
| `npm run dev` | Sobe com reload automático e lê o `.env` |
| `npm run lint` | Verifica o padrão de código |
| `npm run lint:openapi` | Valida o contrato OpenAPI (`src/docs/openapi.yaml`) |
| `npm test` | Roda os testes |
| `npm run test:coverage` | Roda os testes com relatório de cobertura (mínimo 70%) |

## Integração contínua (CI)

Todo Pull Request para a `main` passa automaticamente por dois jobs no GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

| Job | O que verifica | Bloqueia o merge se… |
|---|---|---|
| **Lint e testes** | ESLint + contrato OpenAPI + Jest com cobertura | houver erro de lint, contrato inválido, teste falhando ou cobertura < 70% |
| **Auditoria de dependências** | `npm audit` | alguma dependência de produção tiver vulnerabilidade alta ou crítica |

O Dependabot ([`.github/dependabot.yml`](.github/dependabot.yml)) abre PRs semanais para atualizar dependências npm e versões das actions.

## Estrutura

```
src/
├── app.js            # cria a aplicação Express (sem abrir porta)
├── server.js         # sobe o servidor HTTP
├── config/           # leitura de variáveis de ambiente
├── routes/           # rotas da API (/health, /auth, /ocorrencias, /docs)
├── docs/             # contrato OpenAPI 3.1
├── middlewares/      # autenticação, RBAC, validação, 404 e erros
├── services/         # regras de negócio (ex.: authService)
├── repositories/     # acesso a dados (em memória por enquanto)
├── domain/           # regras do domínio (papéis, ciclo de vida da ocorrência)
├── bootstrap/        # rotinas de inicialização (contas de serviço)
├── utils/            # utilitários (HttpError)
└── container.js      # monta as dependências da aplicação
tests/                # testes automatizados
```

## Endpoints

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/health` | público | Status da API (usado pelo Health Check e pelo pipeline) |
| POST | `/auth/register` | público | Cria conta de **cidadão** (`nome`, `email`, `senha`) |
| POST | `/auth/login` | público | Devolve o token JWT (`email`, `senha`) |
| GET | `/auth/me` | autenticado | Dados do usuário logado |
| POST | `/ocorrencias` | cidadão | Registra um problema do espaço público |
| GET | `/ocorrencias` | autenticado | Lista com filtros (`status`, `categoria`, `bairro`, `minhas`) e paginação |
| GET | `/ocorrencias/:id` | autenticado | Detalha uma ocorrência |
| PATCH | `/ocorrencias/:id/status` | gestor, robô | Muda o status seguindo o ciclo de vida |
| POST | `/ocorrencias/:id/apoios` | cidadão | Apoia uma ocorrência ("isso também me afeta") |
| GET | `/docs` | público | Documentação interativa (Swagger UI) |
| GET | `/openapi.json` | público | Contrato OpenAPI 3.1 |

> 📘 A documentação completa e interativa fica em **`/docs`**: faça login, clique em **Authorize** e teste as rotas pelo navegador.

## Ciclo de vida de uma ocorrência

```
aguardando_aprovacao ──(gestor)──► aprovada ──(robô)──► protocolada ──(gestor)──► resolvida
        │
        └──(gestor)──► rejeitada
```

- O **gestor** revisa a triagem e aprova ou rejeita.
- O **robô UiPath** protocola no Portal 156 e informa o número do protocolo (`protocolo156`).
- Qualquer transição fora desse fluxo é recusada com `409`, e um papel sem permissão recebe `403`.
- Toda mudança fica registrada no `historico` da ocorrência.
- **Privacidade (LGPD):** um cidadão vê as ocorrências de todos, mas não vê quem as registrou; a lista de quem apoiou vira apenas um número.

## Autenticação e papéis (RBAC)

A API usa **JWT**: faça login e envie o token em toda chamada protegida:

```
Authorization: Bearer <token>
```

| Papel | Quem é | Como é criado |
|---|---|---|
| `cidadao` | quem registra ocorrências | cadastro público em `/auth/register` |
| `gestor` | revisa a triagem da IA e aprova ocorrências | variáveis `SEED_GESTOR_EMAIL` / `SEED_GESTOR_SENHA` |
| `robo` | conta de serviço do robô UiPath | variáveis `SEED_ROBO_EMAIL` / `SEED_ROBO_SENHA` |

Segurança aplicada: senhas com **bcrypt**, hash nunca devolvido pela API, token expira em 1h, `JWT_SECRET` obrigatório em produção e mensagem genérica de login inválido (não revela quais e-mails existem).
