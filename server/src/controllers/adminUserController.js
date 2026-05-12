const userModel = require('../models/userModel');
const assignmentModel = require('../models/assignmentModel');
const villageModel = require('../models/villageModel');
const { hashPassword, generateTempPassword } = require('../utils/password');
const notificationService = require('../services/notificationService');
const { ValidationError, NotFoundError, ForbiddenError } = require('../utils/errors');

function ensureCanManageUsers(actor) {
    if (!actor) throw new ForbiddenError();
    if (actor.role !== 'admin' && actor.role !== 'sub_admin') {
        throw new ForbiddenError('Only admins/sub-admins can manage users');
    }
}

async function listUsers(req, res) {
    ensureCanManageUsers(req.user);
    const { role, is_active, search, limit, offset } = req.query;
    const users = await userModel.list({
        role,
        isActive: is_active == null ? undefined : is_active === 'true',
        search,
        limit: limit ? parseInt(limit, 10) : 100,
        offset: offset ? parseInt(offset, 10) : 0,
    });
    res.json({ success: true, users });
}

async function createUser(req, res) {
    ensureCanManageUsers(req.user);
    const { username, email, name, role, phone, address } = req.body || {};
    if (!username || !email || !name || !role) {
        throw new ValidationError('username, email, name, role are required');
    }
    if (!['admin', 'sub_admin', 'volunteer'].includes(role)) {
        throw new ValidationError('Invalid role');
    }
    if (req.user.role === 'sub_admin' && role === 'admin') {
        throw new ForbiddenError('Sub-admins cannot create admins');
    }

    const tempPassword = generateTempPassword(12);
    const passwordHash = await hashPassword(tempPassword);

    const user = await userModel.create({
        username,
        email,
        name,
        passwordHash,
        role,
        phone,
        address,
        referredBy: req.user.user_id,
    });

    // Fire-and-forget notifications; the response shouldn't block on email/SMS.
    notificationService
        .notifyWelcome({
            email,
            phone,
            name,
            username,
            tempPassword,
            role,
            address,
        })
        .catch((err) => console.error('[notify] welcome failed:', err.message));

    res.status(201).json({
        success: true,
        user,
        temp_password: tempPassword,
        message: 'User created. Welcome credentials have been queued.',
    });
}

async function updateUser(req, res) {
    ensureCanManageUsers(req.user);
    const userId = parseInt(req.params.user_id, 10);
    const user = await userModel.update(userId, req.body || {});
    if (!user) throw new NotFoundError('User not found');
    res.json({ success: true, user });
}

async function changePassword(req, res) {
    const { user_id } = req.params;
    const userId = parseInt(user_id, 10);
    const { new_password, current_password } = req.body || {};
    if (!new_password) throw new ValidationError('new_password is required');

    const isSelf = req.user.user_id === userId;
    if (!isSelf) ensureCanManageUsers(req.user);

    if (isSelf && current_password) {
        const full = await userModel.findByUsername(req.user.username);
        const { comparePassword } = require('../utils/password');
        const ok = await comparePassword(current_password, full.password_hash);
        if (!ok) throw new ValidationError('Current password is incorrect');
    }

    const hash = await hashPassword(new_password);
    const user = await userModel.updatePassword(userId, hash, true);
    if (!user) throw new NotFoundError('User not found');
    res.json({ success: true, user });
}

async function changeUsername(req, res) {
    ensureCanManageUsers(req.user);
    const userId = parseInt(req.params.user_id, 10);
    const { username } = req.body || {};
    if (!username) throw new ValidationError('username is required');
    const user = await userModel.updateUsername(userId, username);
    if (!user) throw new NotFoundError('User not found');
    res.json({ success: true, user });
}

async function deleteUser(req, res) {
    if (req.user.role !== 'admin') throw new ForbiddenError('Only admins can delete users');
    const userId = parseInt(req.params.user_id, 10);
    if (userId === req.user.user_id) throw new ForbiddenError('Cannot delete self');
    const removed = await userModel.remove(userId);
    if (!removed) throw new NotFoundError('User not found');
    res.json({ success: true });
}

// ---- Assignments ----

async function listAssignmentsForUser(req, res) {
    const userId = parseInt(req.params.user_id, 10);
    const assignments = await assignmentModel.listForUser(userId);
    res.json({ success: true, assignments });
}

async function createAssignment(req, res) {
    ensureCanManageUsers(req.user);
    const userId = parseInt(req.params.user_id, 10);
    const { assignment_type, assignment_value, village_id, notes } = req.body || {};
    if (!assignment_type || !assignment_value) {
        throw new ValidationError('assignment_type and assignment_value are required');
    }

    const assignment = await assignmentModel.create({
        userId,
        assignedBy: req.user.user_id,
        type: assignment_type,
        value: assignment_value,
        villageId: village_id,
        notes,
    });

    const user = await userModel.findById(userId);
    let areaDetails = null;
    if (village_id) areaDetails = await villageModel.findById(village_id);

    if (user) {
        notificationService
            .notifyAssignment({
                email: user.email,
                phone: user.phone,
                name: user.name,
                assignmentType: assignment_type,
                assignmentValue: assignment_value,
                areaDetails,
                supervisorInfo: { name: req.user.name, email: req.user.email },
            })
            .catch((err) => console.error('[notify] assignment failed:', err.message));
    }

    res.status(201).json({ success: true, assignment });
}

async function deleteAssignment(req, res) {
    ensureCanManageUsers(req.user);
    const userId = parseInt(req.params.user_id, 10);
    const assignmentId = parseInt(req.params.assignment_id, 10);
    const ok = await assignmentModel.removeOne(assignmentId, userId);
    if (!ok) throw new NotFoundError('Assignment not found');
    res.json({ success: true });
}

async function listAllAssignments(req, res) {
    ensureCanManageUsers(req.user);
    const assignments = await assignmentModel.listAll({ assignmentType: req.query.assignment_type });
    res.json({ success: true, assignments });
}

module.exports = {
    listUsers,
    createUser,
    updateUser,
    changePassword,
    changeUsername,
    deleteUser,
    listAssignmentsForUser,
    createAssignment,
    deleteAssignment,
    listAllAssignments,
};
