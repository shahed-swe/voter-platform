const emailService = require('./emailService');
const smsService = require('./smsService');

/** Fire-and-forget welcome notifications across email + SMS. */
async function notifyWelcome({ email, phone, name, username, tempPassword, role, address }) {
    const tasks = [];

    if (email) {
        tasks.push(
            emailService.sendWelcomeEmail({ to: email, name, role, username, tempPassword, address })
                .catch((err) => ({ sent: false, error: err.message }))
        );
    }
    if (phone) {
        tasks.push(
            smsService.sendWelcomeSMS({ phone, name, username, tempPassword, role })
                .catch((err) => ({ success: false, error: err.message }))
        );
    }

    return Promise.all(tasks);
}

async function notifyAssignment({ email, phone, name, assignmentType, assignmentValue, areaDetails, supervisorInfo }) {
    const tasks = [];

    if (email) {
        tasks.push(
            emailService.sendAssignmentEmail({
                to: email,
                userName: name,
                assignmentType,
                assignmentValue,
                areaDetails,
                supervisorInfo,
            }).catch((err) => ({ sent: false, error: err.message }))
        );
    }
    if (phone) {
        tasks.push(
            smsService.sendAssignmentSMS({ phone, name, assignmentType, assignmentValue })
                .catch((err) => ({ success: false, error: err.message }))
        );
    }

    return Promise.all(tasks);
}

module.exports = { notifyWelcome, notifyAssignment };
