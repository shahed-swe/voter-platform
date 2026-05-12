const userModel = require('../models/userModel');
const { comparePassword } = require('../utils/password');
const { sign } = require('../utils/jwt');
const { AuthError, ValidationError } = require('../utils/errors');

async function login(req, res) {
    const { username, password } = req.body || {};
    if (!username || !password) throw new ValidationError('Username and password required');

    const user = await userModel.findByUsernameOrEmail(username);
    if (!user || !user.is_active) throw new AuthError('Invalid credentials');

    const ok = await comparePassword(password, user.password_hash);
    if (!ok) throw new AuthError('Invalid credentials');

    const payload = {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
    };
    const token = sign(payload);

    res.json({
        success: true,
        token,
        user: {
            ...payload,
            password_changed: user.password_changed,
        },
    });
}

async function logout(_req, res) {
    res.json({ success: true });
}

async function me(req, res) {
    const user = await userModel.findById(req.user.user_id);
    if (!user) throw new AuthError('User not found');
    res.json({ success: true, user });
}

async function verify(req, res) {
    res.json({ success: true, user: req.user });
}

module.exports = { login, logout, me, verify };
