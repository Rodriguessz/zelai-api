const { z } = require('zod');
const { request } = require('./http');
const { CATEGORIAS, URGENCIAS } = require('../domain/ocorrencia');

// Contrato esperado do serviço de GenAI (disciplina Generative AI):
//   POST {GENAI_URL}/triagem   { descricao, categoria }
//   → { urgencia, categoriaSugerida, resumo, explicacao }
// A resposta é validada: se a IA devolver algo fora do formato, usamos o plano B.
const respostaSchema = z.object({
  urgencia: z.enum(URGENCIAS),
  categoriaSugerida: z.enum(CATEGORIAS),
  resumo: z.string().min(1).max(500),
  explicacao: z.string().min(1).max(1000),
});

function createGenaiClient({ url, apiKey, timeoutMs }) {
  return {
    enabled: Boolean(url),
    async triar({ descricao, categoria }) {
      const data = await request(`${url}/triagem`, {
        body: { descricao, categoria },
        headers: apiKey ? { 'x-api-key': apiKey } : {},
        timeoutMs,
      });
      return { fonte: 'ia', ...respostaSchema.parse(data) };
    },
  };
}

module.exports = { createGenaiClient };
