const app = require('./src/app');
const config = require('./src/config');
const { pool } = require('./src/db/pool');

const server = app.listen(config.port, () => {
    console.log(`[server] ${config.tenant.name} listening on :${config.port} (env=${config.env})`);
});

function shutdown(signal) {
    console.log(`[server] received ${signal}, shutting down`);
    server.close(async () => {
        await pool.end().catch(() => {});
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err);
    shutdown('uncaughtException');
});
