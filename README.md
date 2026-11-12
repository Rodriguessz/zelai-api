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
| `npm test` | Roda os testes |
| `npm run test:coverage` | Roda os testes com relatório de cobertura (mínimo 70%) |

## Integração contínua (CI)

Todo Pull Request para a `main` passa automaticamente por dois jobs no GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

| Job | O que verifica | Bloqueia o merge se… |
|---|---|---|
| **Lint e testes** | ESLint + Jest com cobertura | houver erro de lint, teste falhando ou cobertura < 70% |
| **Auditoria de dependências** | `npm audit` | alguma dependência de produção tiver vulnerabilidade alta ou crítica |

O Dependabot ([`.github/dependabot.yml`](.github/dependabot.yml)) abre PRs semanais para atualizar dependências npm e versões das actions.

## Estrutura

```
src/
├── app.js            # cria a aplicação Express (sem abrir porta)
├── server.js         # sobe o servidor HTTP
├── config/           # leitura de variáveis de ambiente
├── routes/           # rotas da API
└── middlewares/      # 404 e tratamento de erros
tests/                # testes automatizados
```

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/health` | Status da API (usado pelo Health Check e pelo pipeline) |
