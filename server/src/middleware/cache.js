function setCacheHeaders(res, maxAge = 3600) {
    res.header('Cache-Control', `public, max-age=${maxAge}`);
    res.header('Vary', 'Accept-Encoding');
}

function staticCache(maxAge = 3600) {
    return (_req, res, next) => {
        setCacheHeaders(res, maxAge);
        next();
    };
}

function noCache(_req, res, next) {
    res.header('Cache-Control', 'no-store');
    next();
}

module.exports = { setCacheHeaders, staticCache, noCache };
