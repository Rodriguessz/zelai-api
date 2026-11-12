const { ROLES } = require('../domain/roles');

// Contas de gestor e robô não podem ser criadas pelo cadastro público.
// Elas são criadas na inicialização a partir de variáveis de ambiente
// (em produção, App Settings com referência ao Key Vault).
const SEEDS = [
  { prefix: 'SEED_GESTOR', nome: 'Gestor ZelaAí', papel: ROLES.GESTOR },
  { prefix: 'SEED_ROBO', nome: 'Robô UiPath', papel: ROLES.ROBO },
];

async function seedUsers(authService, env = process.env) {
  const created = [];
  for (const { prefix, nome, papel } of SEEDS) {
    const email = env[`${prefix}_EMAIL`];
    const senha = env[`${prefix}_SENHA`];
    if (email && senha) {
      await authService.ensureUser({ nome, email, senha, papel });
      created.push(papel);
    }
  }
  return created;
}

module.exports = { seedUsers };
