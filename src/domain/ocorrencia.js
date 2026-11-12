const { ROLES } = require('./roles');

// Tipos de problema que o cidadão pode reportar no espaço público.
const CATEGORIAS = Object.freeze([
  'calcada',
  'iluminacao',
  'semaforo',
  'ponto_onibus',
  'acessibilidade',
  'buraco',
  'lixo',
  'outros',
]);

const URGENCIAS = Object.freeze(['baixa', 'media', 'alta']);

const STATUS = Object.freeze({
  AGUARDANDO_APROVACAO: 'aguardando_aprovacao', // criada; aguarda o gestor revisar a triagem
  APROVADA: 'aprovada', //                         gestor aprovou; aguarda o robô protocolar
  REJEITADA: 'rejeitada', //                       gestor recusou (duplicada, fora do escopo…)
  PROTOCOLADA: 'protocolada', //                   robô registrou no Portal 156
  RESOLVIDA: 'resolvida', //                       prefeitura resolveu; gestor encerra
});

// Máquina de estados: de qual status para qual, e quem pode fazer a transição.
// Qualquer transição fora desta tabela é recusada pela API.
const TRANSICOES = Object.freeze({
  [STATUS.AGUARDANDO_APROVACAO]: {
    [STATUS.APROVADA]: [ROLES.GESTOR],
    [STATUS.REJEITADA]: [ROLES.GESTOR],
  },
  [STATUS.APROVADA]: {
    [STATUS.PROTOCOLADA]: [ROLES.ROBO],
  },
  [STATUS.PROTOCOLADA]: {
    [STATUS.RESOLVIDA]: [ROLES.GESTOR],
  },
  [STATUS.REJEITADA]: {},
  [STATUS.RESOLVIDA]: {},
});

// Devolve null se a transição é permitida, ou o motivo da recusa.
function validarTransicao(atual, novo, papel) {
  const destinos = TRANSICOES[atual] ?? {};
  if (!(novo in destinos)) {
    return { status: 409, motivo: `Não é possível mudar de "${atual}" para "${novo}"` };
  }
  if (!destinos[novo].includes(papel)) {
    return { status: 403, motivo: `O papel "${papel}" não pode mudar para "${novo}"` };
  }
  return null;
}

module.exports = {
  CATEGORIAS,
  URGENCIAS,
  STATUS,
  ALL_STATUS: Object.values(STATUS),
  TRANSICOES,
  validarTransicao,
};
