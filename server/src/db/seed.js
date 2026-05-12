#!/usr/bin/env node
const { pool } = require('./pool');
const userModel = require('../models/userModel');
const { hashPassword } = require('../utils/password');

async function main() {
    const username = process.env.SEED_ADMIN_USERNAME || 'admin';
    const email = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
    const password = process.env.SEED_ADMIN_PASSWORD || 'admin123';
    const name = process.env.SEED_ADMIN_NAME || 'Administrator';

    const existing = await userModel.findByUsername(username);
    if (existing) {
        console.log(`[seed] admin user "${username}" already exists`);
    } else {
        const passwordHash = await hashPassword(password);
        const user = await userModel.create({
            username, email, name, passwordHash, role: 'admin',
        });
        console.log('[seed] admin created:', user);
        console.log(`[seed] password: ${password}  (change immediately!)`);
    }
    await pool.end();
}

main().catch(async (err) => {
    console.error('[seed] error:', err);
    await pool.end();
    process.exit(1);
});
