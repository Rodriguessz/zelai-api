const HttpError = require('../utils/httpError');
const { ROLES } = require('../domain/roles');
const { STATUS, validarTransicao } = require('../domain/ocorrencia');

// Formato devolvido pela API (LGPD / minimização de dados):
// - a lista de quem apoiou vira só um número;
// - um cidadão não vê quem registrou a ocorrência de outra pessoa.
function toPublic({ apoiadores, cidadaoId, ...ocorrencia }, user) {
  const podeVerAutor = user.papel !== ROLES.CIDADAO || cidadaoId === user.id;
  return {
    ...ocorrencia,
    ...(podeVerAutor && { cidadaoId }),
    minha: cidadaoId === user.id,
    apoios: apoiadores.length,
    apoiadaPorMim: apoiadores.includes(user.id),
  };
}

function createOcorrenciaService({ ocorrenciaRepository }) {
  // Problemas do espaço público são visíveis a todos os usuários autenticados
  // (é o que permite apoiar a ocorrência de outra pessoa).
  async function findOrFail(id) {
    const ocorrencia = await ocorrenciaRepository.findById(id);
    if (!ocorrencia) throw HttpError.notFound('Ocorrência não encontrada');
    return ocorrencia;
  }

  return {
    async create(user, { descricao, categoria, endereco, localizacao }) {
      const ocorrencia = await ocorrenciaRepository.create({
        cidadaoId: user.id,
        descricao,
        categoria,
        endereco,
        localizacao: localizacao ?? null,
        status: STATUS.AGUARDANDO_APROVACAO,
        urgencia: null, //   preenchida pela triagem de IA (próximo PR)
        triagem: null, //    idem
        protocolo156: null,
        historico: [{ status: STATUS.AGUARDANDO_APROVACAO, porPapel: user.papel, em: new Date().toISOString() }],
      });
      return toPublic(ocorrencia, user);
    },

    // ?minhas=true filtra só as ocorrências do usuário logado.
    async list(user, { page, limit, minhas, ...filtros }) {
      const cidadaoId = minhas ? user.id : undefined;
      const { items, total } = await ocorrenciaRepository.list({ ...filtros, cidadaoId, page, limit });
      return {
        items: items.map((o) => toPublic(o, user)),
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      };
    },

    async get(user, id) {
      return toPublic(await findOrFail(id), user);
    },

    async changeStatus(user, id, { status, observacao, protocolo156 }) {
      const ocorrencia = await findOrFail(id);

      const erro = validarTransicao(ocorrencia.status, status, user.papel);
      if (erro?.status === 403) throw HttpError.forbidden(erro.motivo);
      if (erro) throw HttpError.conflict(erro.motivo);

      if (status === STATUS.PROTOCOLADA && !protocolo156) {
        throw HttpError.badRequest('Informe o número do protocolo do Portal 156', [
          { campo: 'protocolo156', mensagem: 'Obrigatório ao protocolar' },
        ]);
      }

      const atualizada = await ocorrenciaRepository.update(id, {
        status,
        ...(protocolo156 && { protocolo156 }),
        historico: [
          ...ocorrencia.historico,
          { status, porPapel: user.papel, em: new Date().toISOString(), ...(observacao && { observacao }) },
        ],
      });
      return toPublic(atualizada, user);
    },

    // "Apoiar" = dizer "isso também me afeta". Ajuda a priorizar. Um apoio por pessoa.
    async apoiar(user, id) {
      const ocorrencia = await findOrFail(id);
      if (ocorrencia.apoiadores.includes(user.id)) {
        throw HttpError.conflict('Você já apoiou esta ocorrência');
      }
      const atualizada = await ocorrenciaRepository.update(id, {
        apoiadores: [...ocorrencia.apoiadores, user.id],
      });
      return toPublic(atualizada, user);
    },
  };
}

module.exports = { createOcorrenciaService };
