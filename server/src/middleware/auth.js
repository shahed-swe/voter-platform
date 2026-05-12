const { safeVerify } = require('../utils/jwt');
const { AuthError, ForbiddenError } = require('../utils/errors');

function extractToken(req) {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
    if (req.body && req.body.token) return req.body.token;
    if (req.query && req.query.token) return req.query.token;
    return null;
}

function verifyToken(req, _res, next) {
    const token = extractToken(req);
    if (!token) return next(new AuthError('No authentication token provided'));

    const decoded = safeVerify(token);
    if (!decoded) return next(new AuthError('Invalid or expired token'));

    req.user = decoded;
    req.token = token;
    next();
}

function optionalAuth(req, _res, next) {
    const token = extractToken(req);
    if (token) {
        const decoded = safeVerify(token);
        if (decoded) req.user = decoded;
    }
    next();
}

function requireRole(...roles) {
    return (req, _res, next) => {
        if (!req.user) return next(new AuthError());
        if (!roles.includes(req.user.role)) return next(new ForbiddenError());
        next();
    };
}

module.exports = { verifyToken, optionalAuth, requireRole };
