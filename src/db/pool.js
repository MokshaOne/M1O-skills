import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message);
});

/** @param {string} text @param {any[]} [params] */
export const query = (text, params) => pool.query(text, params);

/** Get a client for transactions */
export const getClient = () => pool.connect();

export default pool;
