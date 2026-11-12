const telemetry = require('../telemetry');

// Fluxo de endereço do cidadão:
// 1. extrair(): a Visão lê o comprovante e SUGERE um endereço (nada é salvo);
// 2. o front mostra a sugestão e o cidadão confirma ou corrige;
// 3. confirmar(): salva apenas bairro, CEP e cidade (minimização de dados — LGPD).
function createEnderecoService({ visaoClient, userRepository, logger = console }) {
  const formatarCep = (cep) => {
    const digitos = (cep || '').replace(/\D/g, '');
    return digitos.length === 8 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : null;
  };

  const planoB = (motivo) => ({
    fonte: 'manual',
    endereco: null,
    mensagem: `${motivo} Preencha o endereço manualmente.`,
  });

  return {
    async extrair(arquivo) {
      if (!visaoClient?.enabled) {
        return planoB('Leitura automática de comprovantes indisponível no momento.');
      }
      try {
        const { empresa, confianca, endereco } = await visaoClient.extrairEndereco(arquivo);
        return {
          fonte: 'visao',
          empresa: empresa ?? null,
          confianca,
          // Confiança baixa: o front deve destacar os campos para revisão.
          revisar: confianca < 0.8,
          endereco: { ...endereco, cep: formatarCep(endereco.cep) },
          mensagem: 'Confira os dados lidos do comprovante e corrija se necessário.',
        };
      } catch (err) {
        logger.warn(`Visão indisponível: ${err.message}`);
        telemetry.trackEvent('PlanoBAtivado', { servico: 'visao', motivo: err.message });
        return planoB('Não foi possível ler o comprovante.');
      }
    },

    async confirmar(userId, { bairro, cep, cidade }) {
      const user = await userRepository.update(userId, {
        endereco: { bairro, cep: formatarCep(cep), cidade },
      });
      const { senhaHash, ...publico } = user; // o hash nunca sai da API
      return publico;
    },
  };
}

module.exports = { createEnderecoService };
