const jwt = require('jsonwebtoken');
const config = require('../config');

// Bump whenever the payload STRUCTURE changes (new claims the middleware or
// scoping relies on). verifyToken rejects older versions, forcing a re-login
// instead of running with stale claims.
const TOKEN_VERSION = 2;

function sign(payload) {
    return jwt.sign({ ...payload, v: TOKEN_VERSION }, config.auth.jwtSecret, { expiresIn: config.auth.jwtExpiry });
}

function verify(token) {
    return jwt.verify(token, config.auth.jwtSecret);
}

function safeVerify(token) {
    try {
        return verify(token);
    } catch {
        return null;
    }
}

module.exports = { sign, verify, safeVerify, TOKEN_VERSION };
