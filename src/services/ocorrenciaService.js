const HttpError = require('../utils/httpError');
const { ROLES } = require('../domain/roles');
const { STATUS, validarTransicao } = require('../domain/ocorrencia');

// Formato devolvido pela API: a lista de quem apoiou vira só um número
// (não expomos quais cidadãos apoiaram — LGPD).
function toPublic({ apoiadores, ...ocorrencia }, user) {
  return {
    ...ocorrencia,
    apoios: apoiadores.length,
    apoiadaPorMim: apoiadores.includes(user.id),
  };
}

function createOcorrenciaService({ ocorrenciaRepository }) {
  // Cidadão só enxerga as próprias ocorrências; gestor e robô enxergam todas.
  // Para quem não pode ver, respondemos 404 (e não 403) para não revelar que o id existe.
  async function findVisible(user, id) {
    const ocorrencia = await ocorrenciaRepository.findById(id);
    const podeVer =
      ocorrencia && (user.papel !== ROLES.CIDADAO || ocorrencia.cidadaoId === user.id);
    if (!podeVer) throw HttpError.notFound('Ocorrência não encontrada');
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

    async list(user, { page, limit, ...filtros }) {
      const cidadaoId = user.papel === ROLES.CIDADAO ? user.id : undefined;
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
      return toPublic(await findVisible(user, id), user);
    },

    async changeStatus(user, id, { status, observacao, protocolo156 }) {
      const ocorrencia = await findVisible(user, id);

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
      const ocorrencia = await ocorrenciaRepository.findById(id);
      if (!ocorrencia) throw HttpError.notFound('Ocorrência não encontrada');
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
