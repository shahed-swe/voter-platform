const axios = require('axios');
const config = require('../config');

function formatBdPhone(phone) {
    if (!phone) return null;
    const s = phone.toString().trim();
    if (!/^(88|\+88|0)/.test(s)) return null;
    if (s.startsWith('+88')) return s.substring(1);
    if (s.startsWith('0')) return '88' + s;
    if (!s.startsWith('88')) return '88' + s;
    return s;
}

async function sendSMS(phone, message) {
    if (!config.sms.enabled) {
        console.log('[sms] disabled — would send to', phone);
        return { success: false, reason: 'disabled' };
    }

    const formatted = formatBdPhone(phone);
    if (!formatted) return { success: false, error: 'Invalid phone format' };

    try {
        const params = new URLSearchParams({
            api_key: config.sms.apiKey,
            senderid: config.sms.senderId,
            number: '+' + formatted,
            message,
        });

        const { data, status } = await axios.post(config.sms.apiUrl, params, {
            timeout: 10000,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        if (status >= 200 && status < 300 && String(data).includes('success')) {
            return { success: true };
        }
        return { success: false, error: 'API error', details: data };
    } catch (err) {
        console.error('[sms] error:', err.message);
        return { success: false, error: err.message };
    }
}

async function sendWelcomeSMS({ phone, name, username, tempPassword, role }) {
    const roleDisplay = role.replace('_', ' ').toUpperCase();
    const tenant = config.tenant.name;
    const url = `${config.tenant.publicUrl}/login.html`;
    const message = `${tenant} - Welcome!

Name: ${name}
Role: ${roleDisplay}
Username: ${username}
Temp Password: ${tempPassword}

Please change your password after first login.
Login: ${url}`;
    return sendSMS(phone, message);
}

async function sendAssignmentSMS({ phone, name, assignmentType, assignmentValue }) {
    const tenant = config.tenant.name;
    const url = `${config.tenant.publicUrl}/login.html`;
    const message = `${tenant} - New Assignment

Name: ${name}
Type: ${assignmentType.toUpperCase()}
Area: ${assignmentValue}

Please log in to begin canvassing.
Login: ${url}`;
    return sendSMS(phone, message);
}

module.exports = { sendSMS, sendWelcomeSMS, sendAssignmentSMS };
