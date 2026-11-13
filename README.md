# ZelaAí · API

[![CI](https://github.com/Rodriguessz/zelai-api/actions/workflows/ci.yml/badge.svg)](https://github.com/Rodriguessz/zelai-api/actions/workflows/ci.yml)
[![CD](https://github.com/Rodriguessz/zelai-api/actions/workflows/cd.yml/badge.svg)](https://github.com/Rodriguessz/zelai-api/actions/workflows/cd.yml)

API Node.js do **ZelaAí**, plataforma de zeladoria urbana acessível desenvolvida para a Global Solution 2026.2 (CitizenTech · FIAP).

**🌐 API em produção:** https://zelai-api.azurewebsites.net/health · **📘 Documentação interativa:** https://zelai-api.azurewebsites.net/docs

## Ficha Técnica do MVP

| Campo | Conteúdo |
|---|---|
| **Nome do produto** | ZelaAí |
| **Cidadão e território** | Idosos e pessoas com deficiência em bairros de São Paulo, os primeiros a sofrer com calçadas quebradas, semáforos sem funcionar e pontos de ônibus sem acessibilidade |
| **Problema, em uma frase** | Falhas no espaço público que afetam quem mais depende dele não chegam à prefeitura de forma simples e não são acompanhadas até a solução |
| **Proposta de valor** | *"Reporte em 1 minuto, acompanhe até resolver"*: o cidadão registra o problema, a IA prioriza, o gestor aprova e um robô protocola no Portal 156 |
| **Arquitetura: componentes** | API Node.js 22 (Azure App Service) · PostgreSQL 16 (Azure) · Key Vault · Application Insights · Visão Computacional (OCR do comprovante) · GenAI (triagem) · Apache Airflow (dados) · robô UiPath (RPA) · Power BI · front-end web acessível |
| **Fontes de dados** | Ocorrências registradas na plataforma · dados abertos SP156 e GeoSampa · IBGE (população idosa por distrito), integrados pelo Airflow na tabela `prioridade_por_bairro` |
| **Modelos de IA utilizados** | OCR de comprovantes de residência (Visão Computacional) · LLM para classificar urgência e resumir a ocorrência (GenAI), com **plano B por regras** e **decisão final humana** (gestor) |
| **URL do MVP e repositório** | API: https://zelai-api.azurewebsites.net · Swagger: https://zelai-api.azurewebsites.net/docs · Repositório: https://github.com/Rodriguessz/zelai-api |
| **Indicadores de impacto** | Tempo médio entre o registro e o protocolo no 156 · % de ocorrências resolvidas · ocorrências e apoios por bairro · prioridade por bairro, todos em `GET /indicadores` |
| **ODS conectados** | **ODS 9** (infraestrutura resiliente) · **ODS 10** (redução das desigualdades: acessibilidade para idosos e PcD) · **ODS 11** (cidades e comunidades sustentáveis) |

### Entrega de DevOps (Secure DevOps & Cloud Computing)

| Critério | Onde ver |
|---|---|
| **Deploy** | App Service Linux B1 com HTTPS Only e Health Check: [`/health`](https://zelai-api.azurewebsites.net/health) |
| **CI/CD** | [CI](.github/workflows/ci.yml) em todo PR (lint, contrato OpenAPI, shellcheck, testes com PostgreSQL, audit) · [CD](.github/workflows/cd.yml) a cada merge (OIDC, deploy, smoke test, rollback) |
| **Segurança** | Segredos no Key Vault via Managed Identity · login OIDC sem senha · JWT + RBAC · helmet, CORS, rate limit · `main` protegida · Dependabot e secret scanning ([detalhes](#segurança)) |
| **Monitoramento** | Application Insights com eventos de negócio · alertas por e-mail (Health Check, 5xx, lentidão) ([detalhes](#observabilidade-application-insights)) |
| **Custo e documentação** | ~US$ 30/mês, detalhado em [docs/DEPLOY.md](docs/DEPLOY.md#6-custos-estimados) · infraestrutura como código em [infra/azure-setup.sh](infra/azure-setup.sh) |

## Arquitetura

![Arquitetura de produção do ZelaAí na Azure](docs/arquitetura.drawio.svg)


## Stack

- Node.js 22 (LTS) + Express 5
- Jest + Supertest (testes)
- ESLint 10 (padrão de código)

## Como rodar localmente

```bash
nvm use            # usa o Node 22 definido em .nvmrc
npm ci             # instala dependências exatamente como no package-lock
cp .env.example .env
npm run dev        # sobe a API com reload automático (dados em memória)
```

Para usar **PostgreSQL** localmente (precisa do Docker):

```bash
docker compose up -d   # sobe o PostgreSQL 16 em localhost:5432
# no .env: DATABASE_URL=postgres://zelai:zelai@localhost:5432/zelai
npm run dev            # as migrações rodam sozinhas na inicialização
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
| **Lint e testes** | ESLint + contrato OpenAPI + shellcheck + Jest (com PostgreSQL 16) | houver erro de lint, contrato ou script inválido, teste falhando ou cobertura < 70% |
| **Auditoria de dependências** | `npm audit` | alguma dependência de produção tiver vulnerabilidade alta ou crítica |

O Dependabot ([`.github/dependabot.yml`](.github/dependabot.yml)) abre PRs semanais para atualizar dependências npm e versões das actions.

## Entrega contínua (CD) na Azure

A cada merge na `main`, o workflow [`.github/workflows/cd.yml`](.github/workflows/cd.yml) publica a API no **Azure App Service**:

```
CI de novo → build do pacote → login OIDC (sem senha) → deploy → smoke test (/health com o commit novo)
```

- **Infraestrutura como código:** [`infra/azure-setup.sh`](infra/azure-setup.sh) cria App Service, PostgreSQL, Key Vault, Application Insights e alertas.
- **Rollback:** Actions → CD → *Run workflow* → informe o commit anterior.
- 📘 Passo a passo, custos e evidências: **[docs/DEPLOY.md](docs/DEPLOY.md)**.

## Segurança

| Camada | O que a API faz |
|---|---|
| **Transporte** | HTTPS Only no App Service + HSTS |
| **Cabeçalhos** | `helmet`: CSP, `X-Content-Type-Options`, `frame-ancestors 'none'` |
| **Navegador** | CORS liberado só para as origens de `CORS_ORIGINS` (o front-end) |
| **Força bruta** | 10 tentativas / 15 min por IP em login e cadastro; 300 / 15 min no geral |
| **Autenticação** | JWT (1h) + bcrypt + papéis (RBAC) |
| **Entradas** | validação com Zod, corpo JSON até 100 KB, imagens até 5 MB |
| **Dados (LGPD)** | hash de senha nunca sai da API; endereço só com bairro, CEP e cidade; imagem do comprovante não é salva |
| **Segredos** | só em variáveis de ambiente / Key Vault; `JWT_SECRET` obrigatório em produção |
| **Dependências** | `npm audit` na CI + Dependabot + secret scanning |

## Observabilidade (Application Insights)

Com `APPLICATIONINSIGHTS_CONNECTION_STRING` definida, a API envia telemetria para o **Azure Application Insights**:

- **Automático:** requisições, tempo de resposta, falhas, exceções, chamadas ao PostgreSQL e aos serviços de IA, logs.
- **Eventos de negócio:**

| Evento | Quando | Propriedades |
|---|---|---|
| `OcorrenciaCriada` | cidadão registra um problema | categoria, bairro, urgência, fonte da triagem |
| `OcorrenciaStatusAlterado` | gestor/robô muda o status | de, para, papel, categoria |
| `PlanoBAtivado` | GenAI ou Visão falham | serviço, motivo |

- **Rastreio:** toda resposta tem o header `X-Request-Id`, e erros 500 trazem o `requestId` no corpo. O usuário informa o código e a equipe encontra a requisição no Application Insights.
- **Disponibilidade:** `/health` responde `503` se o banco cair, o que alimenta o Health Check do App Service e o alerta.

Exemplo de consulta (KQL) para o painel:

```kusto
customEvents
| where name == "OcorrenciaCriada"
| summarize ocorrencias = count() by tostring(customDimensions.bairro), bin(timestamp, 1d)
```

## Banco de dados

| Sem `DATABASE_URL` | Com `DATABASE_URL` |
|---|---|
| dados em memória (somem ao reiniciar) | PostgreSQL (Azure Database for PostgreSQL em produção) |
| usado em desenvolvimento rápido e testes | migrações de `db/migrations/` rodam sozinhas na inicialização |

- **Migrações versionadas**: cada arquivo `.sql` roda uma única vez, em ordem e dentro de uma transação. Se falhar, nada é aplicado.
- **Mesma interface** para os repositórios em memória e PostgreSQL. Os **testes de contrato** rodam a mesma suíte contra os dois; na CI, contra um PostgreSQL 16 real.
- **`/health`** verifica o banco: responde `503` se ele cair, o que dispara o alerta de indisponibilidade.
- Na Azure use `DATABASE_SSL=true` (conexão com TLS).

### Tabela do Airflow (disciplina Big Data)

O pipeline do Airflow grava a prioridade de cada bairro na tabela `prioridade_por_bairro`, criada pela migração `002`. A API só lê essa tabela e a expõe em `GET /indicadores` (`prioridadeBairros`).

| Coluna | Tipo | Descrição |
|---|---|---|
| `bairro` | `TEXT` (PK) | Nome do bairro |
| `populacao_idosa` | `INTEGER` | Dado do IBGE |
| `ocorrencias` | `INTEGER` | Ocorrências no bairro |
| `apoios` | `INTEGER` | Apoios recebidos |
| `score_prioridade` | `NUMERIC(6,2)` | Quanto maior, mais prioritário |
| `atualizado_em` | `TIMESTAMPTZ` | Última execução do pipeline |

## Integrações com as outras disciplinas

A API conversa com os serviços de **Visão Computacional** e **GenAI** por HTTP, com timeout. Se um serviço não estiver configurado, demorar ou falhar, a API **continua funcionando** com um plano B.

| Serviço | Variáveis | Quando é chamado | Plano B |
|---|---|---|---|
| **GenAI** (triagem) | `GENAI_URL`, `GENAI_API_KEY`, `GENAI_TIMEOUT_MS` | ao criar uma ocorrência | triagem por regras (palavras-chave + categoria) |
| **Visão** (OCR) | `VISAO_URL`, `VISAO_API_KEY`, `VISAO_TIMEOUT_MS` | `POST /enderecos/extracao` | orienta o cidadão a preencher manualmente |

Toda ocorrência guarda em `triagem.fonte` se a classificação veio da IA (`ia`) ou das regras (`regras`), com a explicação do motivo. A decisão final é sempre do **gestor** (pessoa no circuito).

### Contratos que os serviços devem implementar

**GenAI**: `POST {GENAI_URL}/triagem` (header `x-api-key`, se configurado)

```json
// requisição
{ "descricao": "Semáforo quebrado, idosos não conseguem atravessar", "categoria": "semaforo" }
// resposta
{ "urgencia": "alta", "categoriaSugerida": "semaforo",
  "resumo": "Semáforo de pedestres sem funcionar",
  "explicacao": "Risco de atropelamento para pessoas com mobilidade reduzida" }
```

**Visão**: `POST {VISAO_URL}/extrair-endereco` (multipart, campo `imagem`)

```json
// resposta
{ "empresa": "Sabesp", "confianca": 0.93,
  "endereco": { "logradouro": "Rua A", "numero": "10", "bairro": "Sé", "cep": "01001-000", "cidade": "São Paulo" } }
```

Respostas fora desse formato são descartadas e a API usa o plano B.

## Estrutura

```
src/
├── app.js            # cria a aplicação Express (sem abrir porta)
├── server.js         # sobe o servidor HTTP
├── config/           # leitura de variáveis de ambiente
├── routes/           # rotas da API (/health, /auth, /ocorrencias, /enderecos, /indicadores, /docs)
├── docs/             # contrato OpenAPI 3.1
├── middlewares/      # segurança (helmet, CORS, rate limit), autenticação, RBAC, validação e erros
├── services/         # regras de negócio (ex.: authService)
├── repositories/     # acesso a dados (memória e PostgreSQL, mesma interface)
├── domain/           # regras do domínio (papéis, ciclo de vida da ocorrência)
├── bootstrap/        # rotinas de inicialização (contas de serviço)
├── integrations/     # clientes de GenAI e Visão + triagem por regras (plano B)
├── db/               # pool de conexões e migrador
├── telemetry.js      # Application Insights (no-op sem connection string)
├── utils/            # utilitários (HttpError)
└── container.js      # monta as dependências da aplicação
tests/                # testes automatizados
infra/                # infraestrutura na Azure (az CLI)
scripts/              # smoke test pós-deploy
docs/                 # guia de deploy
db/migrations/        # migrações SQL versionadas
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
| POST | `/enderecos/extracao` | cidadão | Lê a foto do comprovante (Visão) e **sugere** o endereço |
| PUT | `/enderecos/meu` | cidadão | Confirma/corrige o endereço (salva só bairro, CEP e cidade) |
| GET | `/indicadores` | gestor | Indicadores de impacto (status, categorias, tempo até o protocolo, bairros) |
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

Na autenticação: senhas com **bcrypt**, hash nunca devolvido pela API, token expira em 1h, `JWT_SECRET` obrigatório em produção e mensagem genérica de login inválido (não revela quais e-mails existem).
