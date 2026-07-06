const userModel = require('../models/userModel');
const assignmentModel = require('../models/assignmentModel');
const villageModel = require('../models/villageModel');
const candidateModel = require('../models/candidateModel');
const { hashPassword, generateTempPassword } = require('../utils/password');
const notificationService = require('../services/notificationService');
const { ValidationError, NotFoundError, ForbiddenError } = require('../utils/errors');

function tenant(req) {
    if (!req.candidateId) throw new ForbiddenError('No candidate selected');
    return req.candidateId;
}

// The actor's role within the current candidate (from JWT.candidates array).
function actorRole(req) {
    const t = req.candidateId;
    const grant = (req.user?.candidates || []).find((c) => c.id === t);
    if (req.user?.is_super_admin) return 'admin';
    return grant?.role || null;
}

function ensureCanManageUsers(req) {
    const role = actorRole(req);
    if (role !== 'admin' && role !== 'sub_admin') {
        throw new ForbiddenError('Only admins/sub-admins can manage users');
    }
}

// Role hierarchy — each actor may create only roles BELOW itself (#14).
// super-admin resolves to 'admin' via actorRole(). 'candidate' (campaign owner)
// may create the campaign admin + everything under it.
const CREATABLE_ROLES = {
    candidate: ['admin', 'sub_admin', 'volunteer'],
    admin:     ['admin', 'sub_admin', 'volunteer'],
    sub_admin: ['volunteer'],
};
function ensureCanCreateRole(req, targetRole) {
    const actor = actorRole(req);
    const allowed = CREATABLE_ROLES[actor] || [];
    if (!allowed.includes(targetRole)) {
        throw new ForbiddenError(
            `A ${actor || 'user'} cannot create a ${targetRole}.`
        );
    }
}

async function listUsers(req, res) {
    ensureCanManageUsers(req);
    const { role, is_active, search, limit, offset } = req.query;
    const users = await userModel.list(tenant(req), {
        role,
        isActive: is_active == null ? undefined : is_active === 'true',
        search,
        limit: limit ? parseInt(limit, 10) : 100,
        offset: offset ? parseInt(offset, 10) : 0,
    });
    res.json({ success: true, users });
}

async function createUser(req, res) {
    ensureCanManageUsers(req);
    const { username, email, name, role, phone, address } = req.body || {};
    if (!username || !email || !name || !role) {
        throw new ValidationError('username, email, name, role are required');
    }
    if (!['admin', 'sub_admin', 'volunteer'].includes(role)) {
        throw new ValidationError('Invalid role');
    }
    // Enforce the creation hierarchy — down only (#14).
    ensureCanCreateRole(req, role);

    const tempPassword = generateTempPassword(12);
    const passwordHash = await hashPassword(tempPassword);

    const user = await userModel.create({
        username,
        email,
        name,
        passwordHash,
        role,        // legacy global "role" — kept for compatibility
        phone,
        address,
        referredBy: req.user.user_id,
    });

    // Grant the user access to the current candidate with the requested role
    await candidateModel.grantUserAccess({
        userId: user.user_id,
        candidateId: tenant(req),
        role,
        grantedBy: req.user.user_id,
    });

    notificationService
        .notifyWelcome({ email, phone, name, username, tempPassword, role, address })
        .catch((err) => console.error('[notify] welcome failed:', err.message));

    res.status(201).json({
        success: true,
        user,
        temp_password: tempPassword,
        message: 'User created and granted access to current candidate.',
    });
}

async function updateUser(req, res) {
    ensureCanManageUsers(req);
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
    if (!isSelf) ensureCanManageUsers(req);

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
    ensureCanManageUsers(req);
    const userId = parseInt(req.params.user_id, 10);
    const { username } = req.body || {};
    if (!username) throw new ValidationError('username is required');
    const user = await userModel.updateUsername(userId, username);
    if (!user) throw new NotFoundError('User not found');
    res.json({ success: true, user });
}

async function deleteUser(req, res) {
    if (actorRole(req) !== 'admin') throw new ForbiddenError('Only admins can delete users');
    const userId = parseInt(req.params.user_id, 10);
    if (userId === req.user.user_id) throw new ForbiddenError('Cannot delete self');
    // Within MT: revoke access to current candidate. We don't actually delete
    // the user row (they may have access to other candidates).
    const ok = await candidateModel.revokeUserAccess(userId, tenant(req));
    if (!ok) throw new NotFoundError('User not found in this candidate');
    res.json({ success: true });
}

// ---- Assignments ----

async function listAssignmentsForUser(req, res) {
    const userId = parseInt(req.params.user_id, 10);
    const assignments = await assignmentModel.listForUser(tenant(req), userId);
    res.json({ success: true, assignments });
}

async function createAssignment(req, res) {
    ensureCanManageUsers(req);
    const userId = parseInt(req.params.user_id, 10);
    const { assignment_type, assignment_value, village_id, notes } = req.body || {};
    if (!assignment_type || !assignment_value) {
        throw new ValidationError('assignment_type and assignment_value are required');
    }

    const assignment = await assignmentModel.create(tenant(req), {
        userId,
        assignedBy: req.user.user_id,
        type: assignment_type,
        value: assignment_value,
        villageId: village_id,
        notes,
    });

    const user = await userModel.findById(userId);
    let areaDetails = null;
    if (village_id) areaDetails = await villageModel.findById(tenant(req), village_id);

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
    ensureCanManageUsers(req);
    const userId = parseInt(req.params.user_id, 10);
    const assignmentId = parseInt(req.params.assignment_id, 10);
    const ok = await assignmentModel.removeOne(tenant(req), assignmentId, userId);
    if (!ok) throw new NotFoundError('Assignment not found');
    res.json({ success: true });
}

async function listAllAssignments(req, res) {
    ensureCanManageUsers(req);
    const assignments = await assignmentModel.listAll(tenant(req), {
        assignmentType: req.query.assignment_type,
    });
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
