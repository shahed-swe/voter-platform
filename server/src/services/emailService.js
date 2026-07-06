const nodemailer = require('nodemailer');
const config = require('../config');

let transporter = null;

function getTransporter() {
    if (!config.email.enabled) return null;
    if (transporter) return transporter;
    transporter = nodemailer.createTransport({
        service: config.email.service,
        auth: { user: config.email.user, pass: config.email.pass },
    });
    return transporter;
}

async function sendMail({ to, subject, html, text }) {
    const t = getTransporter();
    if (!t) {
        console.log('[email] disabled — would send:', { to, subject });
        return { sent: false, reason: 'disabled' };
    }
    await t.sendMail({ from: config.email.from, to, subject, html, text });
    return { sent: true };
}

// ---- Templates ----

const ROLE_DESCRIPTIONS = {
    admin: 'As an Administrator, you have full access to the platform: managing users, assigning voter areas, monitoring canvassing, and generating reports.',
    sub_admin: 'As a Sub-Administrator, you oversee volunteer teams and manage canvassing activities in your assigned region.',
    volunteer: 'As a Volunteer, your primary responsibility is conducting voter canvassing in your assigned area.',
};

function welcomeEmailHtml({ tenant, name, role, username, tempPassword, address, loginUrl }) {
    const roleDisplay = role.replace('_', ' ').toUpperCase();
    const roleDesc = ROLE_DESCRIPTIONS[role] || `You have been assigned the role of ${roleDisplay}.`;
    return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#2E7D32;color:#fff;padding:20px;border-radius:5px 5px 0 0;text-align:center;">
    <h2>Welcome to ${tenant}</h2>
  </div>
  <div style="background:#f9f9f9;padding:20px;border-radius:0 0 5px 5px;">
    <p>Dear ${name},</p>
    <p>Your account has been created with the role of <strong>${roleDisplay}</strong>.</p>
    <div style="background:#E8F5E9;padding:15px;border-left:4px solid #2E7D32;margin:20px 0;">${roleDesc}</div>
    <div style="background:#fff;padding:15px;border-left:4px solid #2E7D32;margin:20px 0;font-family:monospace;">
      <strong>Username:</strong> ${username}<br>
      <strong>Temporary Password:</strong> ${tempPassword}
    </div>
    <div style="background:#FFF3CD;padding:10px;border-left:4px solid #FFC107;margin:20px 0;">
      <strong>Important:</strong> change your password immediately after first login.
    </div>
    ${address ? `<div style="background:#fff;padding:15px;border-left:4px solid #FF9800;margin:20px 0;"><strong>Location:</strong> ${address}</div>` : ''}
    <p>Login: <code>${loginUrl}</code></p>
    <p>Best regards,<br><strong>${tenant} Team</strong></p>
  </div>
</div></body></html>`;
}

function assignmentEmailHtml({ tenant, userName, assignmentType, assignmentValue, areaDetails, supervisorInfo, loginUrl }) {
    const t = assignmentType.charAt(0).toUpperCase() + assignmentType.slice(1);
    return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#1565C0;color:#fff;padding:20px;border-radius:5px 5px 0 0;text-align:center;">
    <h2>New Area Assignment</h2>
  </div>
  <div style="background:#f9f9f9;padding:20px;border-radius:0 0 5px 5px;">
    <p>Dear ${userName},</p>
    <p>You have been assigned a new <strong>${t}</strong>: <strong>${assignmentValue}</strong>.</p>
    ${areaDetails?.total_population ? `<p>Total population: ${areaDetails.total_population}</p>` : ''}
    ${supervisorInfo ? `<p><strong>Supervisor:</strong> ${supervisorInfo.name} — ${supervisorInfo.phone || ''} — ${supervisorInfo.email || ''}</p>` : ''}
    <p>Login: <code>${loginUrl}</code></p>
    <p>Best regards,<br><strong>${tenant} Team</strong></p>
  </div>
</div></body></html>`;
}

async function sendWelcomeEmail({ to, name, role, username, tempPassword, address }) {
    return sendMail({
        to,
        subject: `Welcome to ${config.tenant.name} - Your Account Credentials`,
        html: welcomeEmailHtml({
            tenant: config.tenant.name,
            name,
            role,
            username,
            tempPassword,
            address,
            loginUrl: `${config.tenant.publicUrl}/login`,
        }),
    });
}

async function sendAssignmentEmail({ to, userName, assignmentType, assignmentValue, areaDetails, supervisorInfo }) {
    return sendMail({
        to,
        subject: `${config.tenant.name} - New Area Assignment`,
        html: assignmentEmailHtml({
            tenant: config.tenant.name,
            userName,
            assignmentType,
            assignmentValue,
            areaDetails,
            supervisorInfo,
            loginUrl: `${config.tenant.publicUrl}/login`,
        }),
    });
}

module.exports = { sendMail, sendWelcomeEmail, sendAssignmentEmail };
