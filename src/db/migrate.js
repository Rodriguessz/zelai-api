const fs = require('node:fs');
const path = require('node:path');

const MIGRATIONS_DIR = path.join(__dirname, '../../db/migrations');
const LOCK_ID = 42_2026; // trava para duas instâncias não migrarem ao mesmo tempo

// Executa, em ordem, os arquivos .sql de db/migrations que ainda não rodaram.
// Cada migração roda numa transação: ou aplica inteira, ou não aplica nada.
async function migrate(pool, { logger = console, dir = MIGRATIONS_DIR } = {}) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        nome TEXT PRIMARY KEY,
        aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);

    const { rows } = await client.query('SELECT nome FROM schema_migrations');
    const aplicadas = new Set(rows.map((r) => r.nome));
    const pendentes = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.sql') && !aplicadas.has(f))
      .sort();

    for (const arquivo of pendentes) {
      const sql = fs.readFileSync(path.join(dir, arquivo), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (nome) VALUES ($1)', [arquivo]);
        await client.query('COMMIT');
        logger.log(`Migração aplicada: ${arquivo}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Falha na migração ${arquivo}: ${err.message}`, { cause: err });
      }
    }
    return pendentes;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    client.release();
  }
}

module.exports = { migrate };
