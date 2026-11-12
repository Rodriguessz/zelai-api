// Telemetria com Azure Application Insights.
//
// Coleta automática (SDK): requisições, tempo de resposta, falhas, exceções,
// chamadas ao PostgreSQL e aos serviços de IA, e logs do console.
// Eventos de negócio (manuais): ocorrência criada, mudança de status, uso do plano B.
//
// Sem APPLICATIONINSIGHTS_CONNECTION_STRING (desenvolvimento e testes) tudo vira no-op.
let client = null;

function initTelemetry(connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  if (!connectionString) return false;

  // Nome do serviço no mapa de aplicação do Application Insights.
  process.env.OTEL_SERVICE_NAME ||= 'zelai-api';

  // Precisa rodar ANTES de carregar express/pg: o SDK instrumenta esses módulos ao carregar.
  const appInsights = require('applicationinsights');
  appInsights
    .setup(connectionString)
    .setAutoCollectRequests(true)
    .setAutoCollectDependencies(true)
    .setAutoCollectExceptions(true)
    .setAutoCollectConsole(true, true)
    .setSendLiveMetrics(true)
    .start();

  client = appInsights.defaultClient;
  return true;
}

// Evento de negócio, ex.: trackEvent('OcorrenciaCriada', { categoria: 'semaforo' }).
function trackEvent(name, properties = {}) {
  client?.trackEvent({ name, properties });
}

// Erros tratados pelo errorHandler não chegam ao SDK sozinhos: registramos aqui.
function trackException(exception, properties = {}) {
  client?.trackException({ exception, properties });
}

module.exports = { initTelemetry, trackEvent, trackException };
