const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const config = require('../config');

async function hashPassword(plain) {
    return bcrypt.hash(plain, config.auth.bcryptRounds);
}

async function comparePassword(plain, hash) {
    return bcrypt.compare(plain, hash);
}

function generateTempPassword(length = 10) {
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let out = '';
    const bytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) out += charset[bytes[i] % charset.length];
    return out;
}

module.exports = { hashPassword, comparePassword, generateTempPassword };
