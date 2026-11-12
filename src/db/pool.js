const { Pool } = require('pg');

// Pool de conexões com o PostgreSQL.
// Na Azure (Flexible Server) a conexão é sempre com TLS: DATABASE_SSL=true.
function createPool({ url, ssl }) {
  return new Pool({
    connectionString: url,
    ssl: ssl ? { rejectUnauthorized: true } : false,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

module.exports = { createPool };
