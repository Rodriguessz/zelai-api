const { CATEGORIAS, URGENCIAS, ALL_STATUS, STATUS } = require('../domain/ocorrencia');

const contarPor = (lista, chave, valores) =>
  Object.fromEntries(valores.map((v) => [v, lista.filter((o) => chave(o) === v).length]));

const horasEntre = (inicio, fim) => (new Date(fim) - new Date(inicio)) / 3_600_000;
const arredondar = (n) => Math.round(n * 10) / 10;

// Indicadores de impacto do MVP (usados pelo gestor, pelo pitch e pelo Power BI).
// Para o volume de um MVP, calcular em memória a partir de todas as ocorrências é suficiente.
function createIndicadoresService({ ocorrenciaRepository, indicadoresRepository }) {
  return {
    async calcular() {
      const ocorrencias = await ocorrenciaRepository.all();
      const total = ocorrencias.length;

      // Tempo entre o registro e o protocolo no 156: mostra o ganho de agilidade.
      const temposAteProtocolo = ocorrencias
        .map((o) => {
          const protocolo = o.historico.find((h) => h.status === STATUS.PROTOCOLADA);
          return protocolo && horasEntre(o.criadaEm, protocolo.em);
        })
        .filter((h) => h !== undefined);

      const resolvidas = ocorrencias.filter((o) => o.status === STATUS.RESOLVIDA).length;

      const porBairro = new Map();
      for (const o of ocorrencias) {
        const bairro = o.endereco.bairro;
        const atual = porBairro.get(bairro) ?? { bairro, ocorrencias: 0, apoios: 0 };
        atual.ocorrencias += 1;
        atual.apoios += o.apoiadores.length;
        porBairro.set(bairro, atual);
      }

      return {
        geradoEm: new Date().toISOString(),
        total,
        porStatus: contarPor(ocorrencias, (o) => o.status, ALL_STATUS),
        porCategoria: contarPor(ocorrencias, (o) => o.categoria, CATEGORIAS),
        porUrgencia: contarPor(ocorrencias, (o) => o.urgencia, URGENCIAS),
        triagemPorFonte: contarPor(ocorrencias, (o) => o.triagem?.fonte, ['ia', 'regras']),
        percentualResolvidas: total ? arredondar((resolvidas / total) * 100) : 0,
        tempoMedioAteProtocoloHoras: temposAteProtocolo.length
          ? arredondar(temposAteProtocolo.reduce((a, b) => a + b, 0) / temposAteProtocolo.length)
          : null,
        bairrosMaisAfetados: [...porBairro.values()]
          .sort((a, b) => b.ocorrencias + b.apoios - (a.ocorrencias + a.apoios))
          .slice(0, 5),
        // Prioridade calculada pelo pipeline do Airflow (dados abertos + ocorrências).
        prioridadeBairros: await indicadoresRepository.prioridadeBairros(),
      };
    },
  };
}

module.exports = { createIndicadoresService };
