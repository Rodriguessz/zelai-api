const { seedUsers } = require('../src/bootstrap/seedUsers');
const { createContainer } = require('../src/container');

describe('seedUsers', () => {
  const env = {
    SEED_GESTOR_EMAIL: 'gestor@zelai.dev',
    SEED_GESTOR_SENHA: 'senha-gestor',
    SEED_ROBO_EMAIL: 'robo@zelai.dev',
    SEED_ROBO_SENHA: 'senha-robo',
  };

  it('cria gestor e robô a partir das variáveis de ambiente', async () => {
    const { authService, userRepository } = createContainer();
    expect(await seedUsers(authService, env)).toEqual(['gestor', 'robo']);
    expect((await userRepository.findByEmail('gestor@zelai.dev')).papel).toBe('gestor');
    expect((await userRepository.findByEmail('robo@zelai.dev')).papel).toBe('robo');
  });

  it('é idempotente: rodar de novo não duplica nem falha', async () => {
    const { authService } = createContainer();
    await seedUsers(authService, env);
    await expect(seedUsers(authService, env)).resolves.toEqual(['gestor', 'robo']);
  });

  it('ignora contas sem e-mail ou senha definidos', async () => {
    const { authService } = createContainer();
    expect(await seedUsers(authService, { SEED_GESTOR_EMAIL: 'g@zelai.dev' })).toEqual([]);
  });
});
