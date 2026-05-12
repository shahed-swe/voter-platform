const path = require('path');
const fs = require('fs');
const express = require('express');
require('express-async-errors');
const helmet = require('helmet');
const compression = require('compression');

const config = require('./config');
const corsMiddleware = require('./middleware/cors');
const { notFound, errorHandler } = require('./middleware/error');
const apiRouter = require('./routes');

const app = express();

app.disable('x-powered-by');

app.use(helmet({ contentSecurityPolicy: false }));
app.use(corsMiddleware);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(
    compression({
        level: 6,
        threshold: 1024,
        filter: (req, res) => {
            const type = res.getHeader('content-type');
            if (type && (String(type).includes('image') || String(type).includes('application/octet-stream'))) {
                return false;
            }
            return compression.filter(req, res);
        },
    })
);

// Uploaded media (photos/audio)
app.use('/uploads', express.static(config.uploads.dir));

// Health
app.get('/healthz', (_req, res) =>
    res.json({
        ok: true,
        tenant: config.tenant.id,
        cacheVersion: `v${config.cache.serverStartTime}`,
    })
);

// API
app.use('/api', apiRouter);

// Optional: serve the built React client (client/dist) when deployed as a
// single-process setup. In dev, run `npm run dev` in the client folder instead.
const clientDist = path.resolve(config.rootDir, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
        res.sendFile(path.join(clientDist, 'index.html'));
    });
}

// 404 + error handler
app.use(notFound);
app.use(errorHandler);

module.exports = app;
