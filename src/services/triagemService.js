const { triarPorRegras } = require('../integrations/triagemRegras');
const telemetry = require('../telemetry');

// Decide quem faz a triagem: a GenAI quando disponível; senão, as regras.
// A decisão final é sempre humana: o gestor aprova ou rejeita (IA responsável).
function createTriagemService({ genaiClient, logger = console }) {
  return {
    async triar(ocorrencia) {
      let resultado;
      if (genaiClient?.enabled) {
        try {
          resultado = await genaiClient.triar(ocorrencia);
        } catch (err) {
          logger.warn(`GenAI indisponível, usando triagem por regras: ${err.message}`);
          telemetry.trackEvent('PlanoBAtivado', { servico: 'genai', motivo: err.message });
        }
      }
      resultado ??= triarPorRegras(ocorrencia);
      return { ...resultado, em: new Date().toISOString() };
    },
  };
}

module.exports = { createTriagemService };
