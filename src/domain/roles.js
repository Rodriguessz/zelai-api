// Papéis do sistema (RBAC).
// - cidadao: registra e acompanha as próprias ocorrências
// - gestor:  revisa a triagem e aprova ocorrências
// - robo:    conta de serviço do robô UiPath que protocola no Portal 156
const ROLES = Object.freeze({
  CIDADAO: 'cidadao',
  GESTOR: 'gestor',
  ROBO: 'robo',
});

module.exports = { ROLES, ALL_ROLES: Object.values(ROLES) };
