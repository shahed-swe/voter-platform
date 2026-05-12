const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool({
    connectionString: config.db.url,
    ssl: config.db.ssl,
    max: config.db.poolMax,
    idleTimeoutMillis: config.db.idleTimeoutMs,
});

pool.on('error', (err) => {
    console.error('[pg] unexpected pool error:', err);
});

async function query(text, params) {
    const start = Date.now();
    const res = await pool.query(text, params);
    if (process.env.LOG_QUERIES === 'true') {
        console.log('[sql]', { text, ms: Date.now() - start, rows: res.rowCount });
    }
    return res;
}

async function one(text, params) {
    const { rows } = await query(text, params);
    return rows[0] || null;
}

async function many(text, params) {
    const { rows } = await query(text, params);
    return rows;
}

async function withTransaction(fn) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

module.exports = { pool, query, one, many, withTransaction };
