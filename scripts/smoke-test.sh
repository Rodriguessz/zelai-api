#!/usr/bin/env bash
# =============================================================================
# Smoke test pós-deploy.
# Confirma que a versão NOVA está no ar (e não apenas "alguma versão"):
#   1. GET /health responde 200, status "ok" e o commit esperado
#   2. a documentação (/docs) e o contrato (/openapi.json) respondem
#
# Uso: scripts/smoke-test.sh <url-base> <commit-esperado>
# Ex.: scripts/smoke-test.sh https://zelai-api.azurewebsites.net 9dba4209...
# =============================================================================
set -euo pipefail

URL="${1:?Informe a URL base da API}"
COMMIT="${2:?Informe o commit esperado}"
TENTATIVAS="${TENTATIVAS:-30}"   # o App Service pode levar alguns minutos para reiniciar
INTERVALO="${INTERVALO:-10}"

echo "Smoke test em ${URL} (esperando o commit ${COMMIT:0:7})"

ultima=""
for i in $(seq 1 "$TENTATIVAS"); do
  ultima="$(curl -sS --max-time 10 "${URL}/health" 2>&1 || true)"
  status="$(jq -r '.status // empty' <<<"$ultima" 2>/dev/null || true)"
  commit="$(jq -r '.commit // empty' <<<"$ultima" 2>/dev/null || true)"

  if [ "$status" = "ok" ] && [ "$commit" = "$COMMIT" ]; then
    echo "✔ /health ok com o commit ${COMMIT:0:7} (tentativa ${i})"
    for rota in /docs/ /openapi.json; do
      codigo="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${URL}${rota}")"
      if [ "$codigo" != "200" ]; then
        echo "✘ ${rota} respondeu HTTP ${codigo}"
        exit 1
      fi
      echo "✔ ${rota} respondeu 200"
    done
    echo "Smoke test aprovado."
    exit 0
  fi

  echo "… tentativa ${i}/${TENTATIVAS}: status='${status:-sem resposta}' commit='${commit:0:7}'"
  sleep "$INTERVALO"
done

echo "✘ A versão nova não respondeu corretamente a tempo. Última resposta:"
echo "$ultima"
exit 1
