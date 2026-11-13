#!/usr/bin/env bash
# =============================================================================
# ZelaAí API · Infraestrutura na Azure (infraestrutura como código)
#
# Cria, em um Resource Group:
#   - App Service (Linux B1, Node 22) com HTTPS Only, TLS 1.2, Health Check
#   - PostgreSQL Flexible Server (B1ms) + banco "zelai"
#   - Key Vault (RBAC) com os segredos; o App Service lê via Managed Identity
#   - Log Analytics + Application Insights
#   - Alertas (HTTP 5xx, Health Check, tempo de resposta) com aviso por e-mail
#   - Identidade OIDC para o GitHub Actions publicar sem senha (menor privilégio)
#
# Como usar (Azure Cloud Shell → Bash, no portal da Azure):
#   APP_NAME=zelai-api ALERT_EMAIL=equipe@exemplo.com bash infra/azure-setup.sh
#
# Pode ser executado de novo: recursos existentes são reaproveitados e os
# segredos já gravados no Key Vault NÃO são trocados.
# =============================================================================
set -euo pipefail

# ---------- Parâmetros --------------------------------------------------------
: "${APP_NAME:?Defina APP_NAME (vira https://APP_NAME.azurewebsites.net)}"
: "${ALERT_EMAIL:?Defina ALERT_EMAIL (quem recebe os alertas)}"
LOCATION="${LOCATION:-eastus}"
# Região só do PostgreSQL. Assinaturas de estudante às vezes bloqueiam o PostgreSQL
# em uma região ("The location is restricted from performing this operation").
PG_LOCATION="${PG_LOCATION:-$LOCATION}"
RG="${RG:-rg-citizentech-prod}"
GITHUB_REPO="${GITHUB_REPO:-Rodriguessz/zelai-api}"
CORS_ORIGINS="${CORS_ORIGINS:-}"

PLAN="plan-${APP_NAME}"
PG_SERVER="${APP_NAME}-pg"
PG_ADMIN="zelaiadmin"
PG_DB="zelai"
KV_NAME="${KV_NAME:-kv-${APP_NAME:0:21}}"   # Key Vault aceita no máximo 24 caracteres
LAW="log-${APP_NAME}"
APPI="appi-${APP_NAME}"
ACTION_GROUP="ag-${APP_NAME}"
OIDC_APP="gh-${APP_NAME}-deploy"
GESTOR_EMAIL="${GESTOR_EMAIL:-gestor@zelai.app}"
ROBO_EMAIL="${ROBO_EMAIL:-robo@zelai.app}"

passo() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
aviso() { printf '\033[1;33m[aviso] %s\033[0m\n' "$*"; }
gerar_senha() { echo "$(openssl rand -hex 16)Zz9_"; }   # maiúscula, minúscula, número e símbolo

# Seu ID (object id) no Entra ID, lido do token da própria Azure (claim "oid").
# Evita depender do Microsoft Graph, cujo token às vezes expira no Cloud Shell
# ("Timeout waiting for token from portal. Audience: https://graph.microsoft.com/").
meu_object_id() {
  local payload
  payload="$(az account get-access-token --query accessToken -o tsv | cut -d. -f2 | tr '_-' '/+')"
  while [ $(( ${#payload} % 4 )) -ne 0 ]; do payload="${payload}="; done   # base64url sem padding
  base64 -d <<<"$payload" 2>/dev/null | jq -r '.oid // empty' 2>/dev/null || true
}

az config set extension.use_dynamic_install=yes_without_prompt --only-show-errors >/dev/null
SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
TENANT_ID="$(az account show --query tenantId -o tsv)"
echo "Assinatura: $(az account show --query name -o tsv) ($SUBSCRIPTION_ID)"
echo "Região: $LOCATION (PostgreSQL: $PG_LOCATION) · Resource Group: $RG · App: $APP_NAME"

# ---------- 0. Provedores de recursos ----------------------------------------
# Assinaturas novas (ex.: Azure for Students) vêm com poucos provedores ativos.
# Sem registrar, a CLI falha com "MissingSubscriptionRegistration".
passo "0/8 Registrando provedores de recursos (só demora na primeira vez)"
for ns in Microsoft.Web Microsoft.DBforPostgreSQL Microsoft.KeyVault \
          Microsoft.OperationalInsights Microsoft.Insights; do
  estado="$(az provider show --namespace "$ns" --query registrationState -o tsv 2>/dev/null || echo NotRegistered)"
  if [ "$estado" = "Registered" ]; then
    echo "  $ns: já registrado"
  else
    echo "  $ns: registrando..."
    az provider register --namespace "$ns" --wait -o none
  fi
done

# ---------- 1. Resource Group ------------------------------------------------
passo "1/8 Resource Group"
az group create -n "$RG" -l "$LOCATION" --tags projeto=zelai disciplina=devops -o none

# ---------- 2. Observabilidade ------------------------------------------------
passo "2/8 Log Analytics + Application Insights"
az monitor log-analytics workspace create -g "$RG" -n "$LAW" -l "$LOCATION" -o none
LAW_ID="$(az monitor log-analytics workspace show -g "$RG" -n "$LAW" --query id -o tsv)"
az monitor app-insights component create -g "$RG" -a "$APPI" -l "$LOCATION" \
  --workspace "$LAW_ID" --application-type web -o none
APPI_CONN="$(az monitor app-insights component show -g "$RG" -a "$APPI" --query connectionString -o tsv)"

# ---------- 3. Key Vault ------------------------------------------------------
passo "3/8 Key Vault (autorização por RBAC)"
if ! az keyvault show -n "$KV_NAME" -o none 2>/dev/null; then
  az keyvault create -n "$KV_NAME" -g "$RG" -l "$LOCATION" --enable-rbac-authorization true -o none
fi
KV_ID="$(az keyvault show -n "$KV_NAME" --query id -o tsv)"
ME="$(meu_object_id)"
if [ -z "$ME" ]; then
  ME="$(az ad signed-in-user show --query id -o tsv)"   # último recurso: consulta o Graph
fi
az role assignment create --assignee-object-id "$ME" --assignee-principal-type User \
  --role "Key Vault Secrets Officer" --scope "$KV_ID" -o none 2>/dev/null || true
echo "Aguardando a permissão no Key Vault propagar (30s)..."
sleep 30

segredo_existe() { az keyvault secret show --vault-name "$KV_NAME" -n "$1" -o none 2>/dev/null; }
gravar_se_novo() {
  if segredo_existe "$1"; then echo "  segredo '$1' já existe (mantido)"; else
    az keyvault secret set --vault-name "$KV_NAME" -n "$1" --value "$2" -o none
    echo "  segredo '$1' criado"
  fi
}

# ---------- 4. PostgreSQL -----------------------------------------------------
passo "4/8 PostgreSQL Flexible Server (B1ms)"
if ! az postgres flexible-server show -g "$RG" -n "$PG_SERVER" -o none 2>/dev/null; then
  PG_PASS="$(gerar_senha)"
  # 0.0.0.0 = só serviços da Azure acessam (o App Service). Ninguém da internet.
  if ! az postgres flexible-server create -g "$RG" -n "$PG_SERVER" -l "$PG_LOCATION" \
    --tier Burstable --sku-name Standard_B1ms --storage-size 32 --version 16 \
    --admin-user "$PG_ADMIN" --admin-password "$PG_PASS" \
    --public-access 0.0.0.0 --yes -o none; then
    aviso "Não foi possível criar o PostgreSQL em '$PG_LOCATION'."
    aviso "Se a mensagem foi 'The location is restricted', escolha outra região só para o banco:"
    aviso "  PG_LOCATION=eastus2 APP_NAME=$APP_NAME ALERT_EMAIL=$ALERT_EMAIL bash infra/azure-setup.sh"
    aviso "Regiões permitidas na sua assinatura: veja docs/DEPLOY.md, 'Problemas comuns'."
    exit 1
  fi
  gravar_se_novo database-url \
    "postgres://${PG_ADMIN}:${PG_PASS}@${PG_SERVER}.postgres.database.azure.com:5432/${PG_DB}"
elif segredo_existe database-url; then
  echo "  servidor já existe (a senha atual está no segredo database-url)"
else
  # Servidor existe, mas o segredo não (ex.: uma execução anterior falhou no meio).
  # A senha antiga não é recuperável: definimos uma nova e gravamos o segredo.
  aviso "Servidor já existe, mas o segredo database-url não. Redefinindo a senha do banco..."
  PG_PASS="$(gerar_senha)"
  az postgres flexible-server update -g "$RG" -n "$PG_SERVER" --admin-password "$PG_PASS" -o none
  gravar_se_novo database-url \
    "postgres://${PG_ADMIN}:${PG_PASS}@${PG_SERVER}.postgres.database.azure.com:5432/${PG_DB}"
fi
unset PG_PASS

# Em qualquer caso, garante que o banco da aplicação existe dentro do servidor.
# Sem esconder erros: se a criação falhar, a mensagem real aparece e o script para.
if az postgres flexible-server db show -g "$RG" -s "$PG_SERVER" -d "$PG_DB" -o none 2>/dev/null; then
  echo "  banco '$PG_DB' já existe"
else
  echo "  criando o banco '$PG_DB'..."
  az postgres flexible-server db create -g "$RG" -s "$PG_SERVER" -d "$PG_DB" -o none
fi
gravar_se_novo jwt-secret "$(openssl rand -hex 32)"
gravar_se_novo seed-gestor-senha "$(gerar_senha)"
gravar_se_novo seed-robo-senha "$(gerar_senha)"

# ---------- 5. App Service ----------------------------------------------------
passo "5/8 App Service (Linux B1, Node 22)"
az appservice plan create -g "$RG" -n "$PLAN" -l "$LOCATION" --is-linux --sku B1 -o none
if ! az webapp show -g "$RG" -n "$APP_NAME" -o none 2>/dev/null; then
  az webapp create -g "$RG" -p "$PLAN" -n "$APP_NAME" --runtime "NODE:22-lts" -o none
fi
WEBAPP_ID="$(az webapp show -g "$RG" -n "$APP_NAME" --query id -o tsv)"

az webapp update -g "$RG" -n "$APP_NAME" --https-only true -o none
az webapp config set -g "$RG" -n "$APP_NAME" \
  --always-on true --min-tls-version 1.2 --ftps-state Disabled --http20-enabled true \
  --startup-file "npm start" \
  --generic-configurations '{"healthCheckPath": "/health"}' -o none

# Managed Identity: o App Service lê o Key Vault sem guardar nenhuma senha.
PRINCIPAL_ID="$(az webapp identity assign -g "$RG" -n "$APP_NAME" --query principalId -o tsv)"
az role assignment create --assignee-object-id "$PRINCIPAL_ID" --assignee-principal-type ServicePrincipal \
  --role "Key Vault Secrets User" --scope "$KV_ID" -o none 2>/dev/null || true

kv() { echo "@Microsoft.KeyVault(VaultName=${KV_NAME};SecretName=$1)"; }
az webapp config appsettings set -g "$RG" -n "$APP_NAME" -o none --settings \
  NODE_ENV=production \
  SCM_DO_BUILD_DURING_DEPLOYMENT=false \
  DATABASE_URL="$(kv database-url)" \
  DATABASE_SSL=true \
  JWT_SECRET="$(kv jwt-secret)" \
  SEED_GESTOR_EMAIL="$GESTOR_EMAIL" \
  SEED_GESTOR_SENHA="$(kv seed-gestor-senha)" \
  SEED_ROBO_EMAIL="$ROBO_EMAIL" \
  SEED_ROBO_SENHA="$(kv seed-robo-senha)" \
  APPLICATIONINSIGHTS_CONNECTION_STRING="$APPI_CONN" \
  CORS_ORIGINS="$CORS_ORIGINS" \
  KEYVAULT_REFS_ATUALIZADAS_EM="$(date -u +%FT%TZ)"
# A variável acima muda a cada execução de propósito: o App Service guarda em cache o
# resultado das referências @Microsoft.KeyVault(...) (inclusive "SecretNotFound") e só
# consulta o Key Vault de novo quando alguma configuração muda. Reiniciar NÃO basta.

# ---------- 6. Alertas --------------------------------------------------------
passo "6/8 Alertas com aviso por e-mail"
az monitor action-group create -g "$RG" -n "$ACTION_GROUP" --short-name zelai \
  --action email equipe "$ALERT_EMAIL" -o none
AG_ID="$(az monitor action-group show -g "$RG" -n "$ACTION_GROUP" --query id -o tsv)"

alerta() { # nome, condição, severidade, descrição
  az monitor metrics alert create -g "$RG" -n "$1" --scopes "$WEBAPP_ID" \
    --condition "$2" --window-size 5m --evaluation-frequency 1m \
    --severity "$3" --description "$4" --action "$AG_ID" -o none
  echo "  alerta '$1' criado"
}
alerta alerta-health-check "avg HealthCheckStatus < 100" 1 \
  "API fora do ar ou banco indisponível (/health falhando)"
alerta alerta-erros-5xx "total Http5xx > 5" 2 \
  "Mais de 5 erros de servidor em 5 minutos"
alerta alerta-lentidao "avg HttpResponseTime > 3" 3 \
  "Tempo médio de resposta acima de 3 segundos"

# ---------- 7. Identidade do GitHub Actions (OIDC) ----------------------------
passo "7/8 Login do GitHub Actions por OIDC (sem senha)"
# Este passo usa o Microsoft Graph. Se ele falhar (permissão ou token expirado no
# Cloud Shell), o script NÃO para: segue com o plano B do deploy.
criar_credencial() { # nome, subject
  local arquivo
  arquivo="$(mktemp)"
  cat > "$arquivo" <<JSON
{
  "name": "$1",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "$2",
  "audiences": ["api://AzureADTokenExchange"]
}
JSON
  if az ad app federated-credential create --id "$CLIENT_ID" --parameters "@$arquivo" -o none 2>/dev/null; then
    echo "  credencial federada criada: $2"
  else
    echo "  credencial federada já existe: $2"
  fi
  rm -f "$arquivo"
}

configurar_oidc() {
  CLIENT_ID="$(az ad app list --display-name "$OIDC_APP" --query '[0].appId' -o tsv 2>/dev/null || true)"
  if [ -z "$CLIENT_ID" ]; then
    CLIENT_ID="$(az ad app create --display-name "$OIDC_APP" --query appId -o tsv 2>/dev/null)" || return 1
  fi
  [ -n "$CLIENT_ID" ] || return 1
  az ad sp show --id "$CLIENT_ID" -o none 2>/dev/null || az ad sp create --id "$CLIENT_ID" -o none || return 1
  SP_ID="$(az ad sp show --id "$CLIENT_ID" --query id -o tsv)" || return 1
  # O GitHub envia o "subject" do token OIDC em um de dois formatos:
  #   clássico:  repo:dono/repo:environment:production
  #   com IDs:   repo:dono@ID_DONO/repo@ID_REPO:environment:production
  # (o formato com IDs impede que um repositório recriado com o mesmo nome herde o acesso).
  # Registramos os dois; os IDs vêm da API pública do GitHub.
  criar_credencial github-environment-production "repo:${GITHUB_REPO}:environment:production"
  local info owner_id repo_id
  info="$(curl -fsS "https://api.github.com/repos/${GITHUB_REPO}" 2>/dev/null || true)"
  owner_id="$(jq -r '.owner.id // empty' <<<"$info" 2>/dev/null || true)"
  repo_id="$(jq -r '.id // empty' <<<"$info" 2>/dev/null || true)"
  if [ -n "$owner_id" ] && [ -n "$repo_id" ]; then
    criar_credencial github-environment-production-ids \
      "repo:${GITHUB_REPO%%/*}@${owner_id}/${GITHUB_REPO##*/}@${repo_id}:environment:production"
  else
    aviso "Não consegui ler os IDs do repositório no GitHub; registrei só o formato clássico."
  fi
  # Menor privilégio: só pode publicar NESTE App Service, nada além disso.
  az role assignment create --assignee-object-id "$SP_ID" --assignee-principal-type ServicePrincipal \
    --role "Website Contributor" --scope "$WEBAPP_ID" -o none 2>/dev/null || true
}

OIDC_OK=true
if ! configurar_oidc; then
  OIDC_OK=false
  aviso "Não foi possível criar a identidade OIDC no Entra ID (sem permissão ou token do Graph expirado)."
  aviso "Opções: rode 'az login --scope https://graph.microsoft.com//.default' e execute o script de novo,"
  aviso "ou use o plano B do deploy (publish profile). Veja docs/DEPLOY.md."
fi

# ---------- 8. Resumo ---------------------------------------------------------
passo "8/8 Pronto!"
cat <<RESUMO

URL da API:   https://${APP_NAME}.azurewebsites.net/health
Swagger:      https://${APP_NAME}.azurewebsites.net/docs

Configure no GitHub (Settings → Environments → production):
RESUMO
if $OIDC_OK; then
  cat <<OIDC
  Secrets do environment:
    AZURE_CLIENT_ID       = ${CLIENT_ID}
    AZURE_TENANT_ID       = ${TENANT_ID}
    AZURE_SUBSCRIPTION_ID = ${SUBSCRIPTION_ID}
OIDC
fi
cat <<RESUMO
  Variable do repositório (Settings → Secrets and variables → Actions → Variables):
    AZURE_WEBAPP_NAME     = ${APP_NAME}

Contas de demonstração (as senhas estão no Key Vault ${KV_NAME}):
  gestor: ${GESTOR_EMAIL}  → az keyvault secret show --vault-name ${KV_NAME} -n seed-gestor-senha --query value -o tsv
  robô:   ${ROBO_EMAIL}  → az keyvault secret show --vault-name ${KV_NAME} -n seed-robo-senha --query value -o tsv

Custo estimado: App Service B1 (~US\$ 13/mês) + PostgreSQL B1ms com 32 GB (~US\$ 16/mês).
Para pausar o banco fora dos testes: az postgres flexible-server stop -g ${RG} -n ${PG_SERVER}
RESUMO
