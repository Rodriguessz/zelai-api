const { z } = require('zod');
const { request } = require('./http');

// Contrato esperado do serviço de Visão Computacional (disciplina Applied Computer Vision):
//   POST {VISAO_URL}/extrair-endereco   multipart/form-data, campo "imagem"
//   → { empresa, confianca, endereco: { logradouro, numero, bairro, cep, cidade } }
const respostaSchema = z.object({
  empresa: z.string().nullish(),
  confianca: z.number().min(0).max(1),
  endereco: z.object({
    logradouro: z.string().nullish(),
    numero: z.string().nullish(),
    bairro: z.string().nullish(),
    cep: z.string().nullish(),
    cidade: z.string().nullish(),
  }),
});

function createVisaoClient({ url, apiKey, timeoutMs }) {
  return {
    enabled: Boolean(url),
    async extrairEndereco({ buffer, mimetype, originalname }) {
      const form = new FormData();
      form.append('imagem', new Blob([buffer], { type: mimetype }), originalname || 'comprovante');
      const data = await request(`${url}/extrair-endereco`, {
        body: form,
        headers: apiKey ? { 'x-api-key': apiKey } : {},
        timeoutMs,
      });
      return respostaSchema.parse(data);
    },
  };
}

module.exports = { createVisaoClient };
