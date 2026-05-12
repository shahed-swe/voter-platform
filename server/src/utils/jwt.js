const jwt = require('jsonwebtoken');
const config = require('../config');

function sign(payload) {
    return jwt.sign(payload, config.auth.jwtSecret, { expiresIn: config.auth.jwtExpiry });
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

module.exports = { sign, verify, safeVerify };
