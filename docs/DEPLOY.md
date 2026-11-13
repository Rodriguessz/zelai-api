# Deploy na Azure

Guia para colocar a ZelaAí API no ar no **Azure App Service**, com deploy automático pelo **GitHub Actions**.

| Etapa | Quem faz | Tempo |
|---|---|---|
| 1. Criar a infraestrutura | você, uma vez, no Azure Cloud Shell | ~15 min |
| 2. Configurar o GitHub | você, uma vez | ~5 min |
| 3. Deploy | automático a cada merge na `main` | ~4 min |

---

## 1. Criar a infraestrutura

1. Entre no [portal da Azure](https://portal.azure.com) com a conta que tem a assinatura (ex.: *Azure for Students*).
2. Abra o **Cloud Shell** (ícone `>_` no topo) e escolha **Bash**.
3. Rode:

```bash
git clone https://github.com/Rodriguessz/zelai-api.git && cd zelai-api
```

```bash
APP_NAME=zelai-api ALERT_EMAIL=seu-email@exemplo.com LOCATION=eastus bash infra/azure-setup.sh
```

| Variável | Obrigatória | Descrição |
|---|---|---|
| `APP_NAME` | sim | Nome único no mundo; vira `https://APP_NAME.azurewebsites.net` |
| `ALERT_EMAIL` | sim | Quem recebe os alertas |
| `LOCATION` | não | Região (padrão `eastus`, mais barata; `brazilsouth` tem menor latência) |
| `PG_LOCATION` | não | Região só do PostgreSQL (padrão: a mesma de `LOCATION`) |
| `CORS_ORIGINS` | não | URL do front-end, ex.: `https://zelai-front.azurewebsites.net` |

O script cria:

| Recurso | Configuração |
|---|---|
| Resource Group `rg-citizentech-prod` | agrupa tudo (fácil de medir custo e apagar) |
| App Service Linux **B1**, Node 22 | HTTPS Only, TLS 1.2, FTPS desligado, Always On, Health Check em `/health` |
| PostgreSQL Flexible Server **B1ms** | banco `zelai`, acesso só de serviços da Azure, conexão com TLS |
| **Key Vault** (RBAC) | `database-url`, `jwt-secret`, senhas do gestor e do robô |
| **Managed Identity** do App Service | lê o Key Vault sem nenhuma senha guardada |
| Log Analytics + **Application Insights** | telemetria da API |
| **Alertas** + Action Group (e-mail) | Health Check falhando, mais de 5 erros 5xx em 5 min, resposta média acima de 3 s |
| Identidade **OIDC** do GitHub | papel *Website Contributor* **só** neste App Service |

> O script pode ser rodado de novo sem problema: ele reaproveita o que já existe e **não troca** senhas já criadas.

No final ele imprime os valores para a próxima etapa.

## 2. Configurar o GitHub

No repositório, em **Settings**:

1. **Environments → New environment → `production`**
   - (opcional) *Required reviewers*: exige aprovação manual antes de cada deploy.
   - (opcional) *Deployment branches*: só `main`.
   - Em **Environment secrets**, crie os três valores impressos pelo script:
     - `AZURE_CLIENT_ID`
     - `AZURE_TENANT_ID`
     - `AZURE_SUBSCRIPTION_ID`

2. **Secrets and variables → Actions → Variables → New repository variable**
   - `AZURE_WEBAPP_NAME` = o `APP_NAME` que você usou.

Pronto. O próximo merge na `main` publica a API. Para publicar agora: **Actions → CD → Run workflow**.

> Enquanto `AZURE_WEBAPP_NAME` não existir, o CD só exibe um aviso e não fica vermelho.

## 3. Como o pipeline funciona

```
merge na main → CI (lint, contrato, testes c/ PostgreSQL, audit) → build do pacote → deploy → smoke test
```

| Etapa | Detalhe |
|---|---|
| CI | roda de novo sobre o commit exato que vai para produção |
| Build | `npm ci --omit=dev` + `build-info.json` com o commit; o mesmo pacote testado é o publicado |
| Deploy | login por **OIDC** (sem senha) e publicação com `azure/webapps-deploy` |
| Smoke test | `scripts/smoke-test.sh` confirma que `/health` responde `ok` **com o commit novo**, e que `/docs` e `/openapi.json` respondem |
| Concorrência | um deploy por vez, nunca cancelado no meio |

### Rollback

**Actions → CD → Run workflow → `ref` = commit anterior** (copie o hash do histórico da `main`). O pipeline testa e publica aquela versão.

### Ver logs da API

```bash
az webapp log tail -g rg-citizentech-prod -n zelai-api
```

## 4. Teste de disponibilidade (recomendado)

O alerta de Health Check já avisa quando a API cai. Para ter também um teste externo, de fora da Azure:

1. Abra o **Application Insights** (`appi-<APP_NAME>`) → **Availability** → **Add Standard test**.
2. URL: `https://<APP_NAME>.azurewebsites.net/health`, frequência 5 min, 3 regiões.
3. Em **Alerts**, use o Action Group `ag-<APP_NAME>`.

## Problemas comuns

**`MissingSubscriptionRegistration`: "The subscription is not registered to use namespace 'Microsoft.X'"**

Assinaturas novas vêm com poucos *resource providers* ativos. O script já registra os necessários no passo 0. Se precisar registrar manualmente:

```bash
az provider register --namespace Microsoft.KeyVault --wait
```

Depois, rode o script de novo: ele continua de onde parou.

**`Timeout waiting for token from portal. Audience: https://graph.microsoft.com/`**

O Cloud Shell não conseguiu o token do Microsoft Graph, usado só para criar a identidade OIDC. Não é problema da conta nem do script. Refaça o login e rode o script de novo:

```bash
az logout
```

```bash
az login --scope "https://graph.microsoft.com//.default"
```

Se continuar falhando, o script termina mesmo assim e avisa: use o **plano B** (seção 5).

**`AADSTS700213: No matching federated identity record found for presented assertion subject` (no login do CD)**

O GitHub pode enviar o *subject* do token OIDC no formato **com IDs** (`repo:dono@ID/repo@ID:environment:production`), e não no clássico (`repo:dono/repo:environment:production`). O script atual já registra os dois formatos. Se a infraestrutura foi criada antes dessa correção, registre o formato que aparece na mensagem de erro:

```bash
az ad app federated-credential create --id <AZURE_CLIENT_ID> --parameters '{"name":"github-environment-production-ids","issuer":"https://token.actions.githubusercontent.com","subject":"<SUBJECT DA MENSAGEM DE ERRO>","audiences":["api://AzureADTokenExchange"]}'
```

Depois, em **Actions**, abra a execução que falhou e clique em **Re-run failed jobs**.

**`The location is restricted from performing this operation` (ao criar o PostgreSQL)**

Assinaturas de estudante costumam bloquear o PostgreSQL em algumas regiões (por exemplo `eastus`). Mantenha o resto em `LOCATION` e escolha outra região **só para o banco** com `PG_LOCATION`:

```bash
PG_LOCATION=eastus2 APP_NAME=zelai-api ALERT_EMAIL=seu-email@exemplo.com bash infra/azure-setup.sh
```

Para descobrir quais regiões a sua assinatura permite (contas de estudante têm uma política com essa lista):

```bash
az policy assignment list --query "[].{politica:displayName, regioes:parameters.listOfAllowedLocations.value}" -o json
```

Banco e App Service em regiões diferentes funcionam normalmente; dentro dos EUA a latência extra é de poucos milissegundos.

**`... is not available in location` (App Service ou outro recurso)**

Rode de novo com outra região em `LOCATION`, de preferência uma da lista de regiões permitidas.

## 5. Plano B: sem permissão para OIDC

Contas institucionais às vezes não podem criar registros de aplicativo no Entra ID. O script avisa quando isso acontece. Nesse caso:

```bash
az resource update -g rg-citizentech-prod --namespace Microsoft.Web --resource-type basicPublishingCredentialsPolicies --parent sites/zelai-api --name scm --set properties.allow=true
```

```bash
az webapp deployment list-publishing-profiles -g rg-citizentech-prod -n zelai-api --xml
```

Copie a saída do segundo comando para o secret **`AZURE_WEBAPP_PUBLISH_PROFILE`** do environment `production`. O CD detecta a ausência de `AZURE_CLIENT_ID` e usa esse método.

> É menos seguro que o OIDC: é uma credencial de longa duração. Troque-a se ela vazar.

## 6. Custos estimados

| Recurso | SKU | US$/mês (aprox.) |
|---|---|---|
| App Service | B1 Linux | ~13 |
| PostgreSQL Flexible | B1ms + 32 GB | ~16 |
| Application Insights / Log Analytics | até 5 GB/mês grátis | ~0 |
| Key Vault | operações | < 1 |
| **Total** | | **~30** |

Valores aproximados para `eastus`. Confirme na [Calculadora de Preços da Azure](https://azure.microsoft.com/pricing/calculator/).

Para economizar crédito fora das apresentações:

```bash
az postgres flexible-server stop -g rg-citizentech-prod -n zelai-api-pg
```

```bash
az postgres flexible-server start -g rg-citizentech-prod -n zelai-api-pg
```

Para apagar tudo depois da avaliação:

```bash
az group delete -n rg-citizentech-prod
```

## 7. Evidências para o PDF da disciplina

| Critério | Print sugerido |
|---|---|
| Deploy | `https://<APP_NAME>.azurewebsites.net/health` e `/docs` abertos no navegador; tela do App Service com *HTTPS Only* |
| CI/CD | aba **Actions** com CI e CD verdes; resumo do deploy; ruleset da `main` exigindo os checks |
| Segurança | Key Vault com os segredos (sem mostrar valores); *Identity* do App Service; *App settings* com referências `@Microsoft.KeyVault(...)`; CORS/headers no DevTools |
| Monitoramento | Application Insights (*Live Metrics*, *Failures*, `customEvents`); regras de alerta; e-mail de alerta recebido |
| Custo | *Cost Management* do Resource Group ou a calculadora preenchida |

## Trade-offs conscientes (MVP)

- **PostgreSQL com acesso público restrito a serviços da Azure**, em vez de rede privada (VNet + Private Endpoint). É mais barato e simples para o MVP; a rede privada é o próximo passo para produção real.
- **Sem deployment slots** (exigem o plano Standard). O rollback é feito republicando um commit anterior.
- **Rate limit em memória**: vale por instância. Com várias instâncias, o próximo passo seria Redis.
