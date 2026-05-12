require('dotenv').config();

const path = require('path');

const parseInt10 = (v, d) => (v ? parseInt(v, 10) : d);
const parseBool = (v, d = false) => (v == null ? d : v === 'true' || v === '1');
const parseList = (v) =>
    v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];

const config = {
    env: process.env.NODE_ENV || 'development',
    port: parseInt10(process.env.PORT, 3000),
    rootDir: path.resolve(__dirname, '..', '..'),

    tenant: {
        id: process.env.TENANT_ID || 'default',
        name: process.env.TENANT_NAME || 'Voter Survey Platform',
        publicUrl: process.env.TENANT_PUBLIC_URL || '',
    },

    db: {
        url: process.env.DATABASE_URL,
        ssl: parseBool(process.env.PGSSL, false) ? { rejectUnauthorized: false } : false,
        poolMax: parseInt10(process.env.PG_POOL_MAX, 20),
        idleTimeoutMs: parseInt10(process.env.PG_IDLE_TIMEOUT_MS, 30000),
    },

    auth: {
        jwtSecret: process.env.JWT_SECRET || 'change-me-in-development',
        jwtExpiry: process.env.JWT_EXPIRY || '7d',
        bcryptRounds: parseInt10(process.env.BCRYPT_ROUNDS, 10),
    },

    cors: {
        allowedOrigins: parseList(process.env.ALLOWED_ORIGINS),
    },

    email: {
        enabled: parseBool(process.env.EMAIL_ENABLED, false),
        service: process.env.EMAIL_SERVICE || 'gmail',
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    },

    sms: {
        enabled: parseBool(process.env.SMS_ENABLED, false),
        apiUrl: process.env.SMS_API_URL,
        apiKey: process.env.SMS_API_KEY,
        senderId: process.env.SMS_SENDER_ID,
    },

    uploads: {
        dir: path.resolve(
            __dirname,
            '..',
            '..',
            process.env.UPLOAD_DIR || 'uploads'
        ),
        maxBytes: parseInt10(process.env.MAX_UPLOAD_BYTES, 50 * 1024 * 1024),
    },

    cache: {
        filterTtlMs: parseInt10(process.env.FILTER_CACHE_TTL_MS, 3600000),
        serverStartTime: Date.now(),
    },
};

if (!config.db.url) {
    console.warn(
        '[config] DATABASE_URL is not set. The app will fail to query Postgres until it is configured.'
    );
}

module.exports = config;
