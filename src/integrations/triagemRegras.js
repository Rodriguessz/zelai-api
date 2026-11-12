// Triagem por regras (plano B da GenAI).
// Usada quando o serviço de IA não está configurado, demora ou falha:
// a ocorrência nunca fica sem urgência por causa de um serviço externo.

// Sinais de risco à integridade física ou que afetam quem tem mobilidade reduzida.
const PALAVRAS_ALTA = [
  'acidente', 'risco', 'perigo', 'caiu', 'queda', 'ferid', 'fio', 'eletric', 'choque',
  'cadeirante', 'cadeira de rodas', 'idos', 'cego', 'deficien', 'muleta', 'bengala',
  'crianca', 'escola', 'hospital', 'alag', 'enchente', 'desaba',
];
const PALAVRAS_MEDIA = ['quebrad', 'buraco', 'escuro', 'apagad', 'semana', 'dias', 'sujeira', 'entulho'];

// Categorias que, por natureza, já começam com urgência maior.
const URGENCIA_BASE = {
  semaforo: 'media',
  acessibilidade: 'media',
  iluminacao: 'media',
  buraco: 'media',
};

const normalizar = (texto) =>
  texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function triarPorRegras({ descricao, categoria }) {
  const texto = normalizar(descricao);
  const achadasAlta = PALAVRAS_ALTA.filter((p) => texto.includes(p));
  const achadasMedia = PALAVRAS_MEDIA.filter((p) => texto.includes(p));

  let urgencia = URGENCIA_BASE[categoria] ?? 'baixa';
  if (achadasMedia.length && urgencia === 'baixa') urgencia = 'media';
  if (achadasAlta.length) urgencia = 'alta';

  const motivos = [...achadasAlta, ...achadasMedia];
  return {
    fonte: 'regras',
    urgencia,
    categoriaSugerida: categoria,
    resumo: descricao.length > 140 ? `${descricao.slice(0, 137)}...` : descricao,
    explicacao: motivos.length
      ? `Classificação automática por palavras-chave: ${motivos.join(', ')}.`
      : `Classificação automática pela categoria "${categoria}".`,
  };
}

module.exports = { triarPorRegras };
