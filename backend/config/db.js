const { Pool } = require('pg');

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      }
    : {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'akubisa_user',
        password: process.env.DB_PASSWORD || 'akubisa123',
        database: process.env.DB_NAME || 'akubisa_db',
        port: process.env.DB_PORT || 5432,
      }
);

module.exports = pool;
