const candidateModel = require('../models/candidateModel');
const userModel = require('../models/userModel');
const { ForbiddenError, ValidationError, NotFoundError } = require('../utils/errors');

/**
 * GET /api/candidates
 *   - super_admin: returns all active candidates
 *   - regular user: returns only the candidates they have access to
 */
async function list(req, res) {
    if (req.user?.is_super_admin) {
        res.json({ success: true, candidates: await candidateModel.listActive() });
    } else {
        const granted = await candidateModel.listForUser(req.user.user_id);
        // Hydrate each granted row with the full candidate record
        const ids = granted.map((g) => g.candidate_id);
        const fulls = await Promise.all(ids.map((id) => candidateModel.findById(id)));
        res.json({ success: true, candidates: fulls.filter(Boolean) });
    }
}

async function getOne(req, res) {
    const c = await candidateModel.findById(req.params.candidate_id);
    if (!c) throw new NotFoundError('Candidate not found');
    // super_admin sees any; others only their granted
    if (!req.user?.is_super_admin) {
        const role = await candidateModel.userHasAccess(req.user.user_id, c.candidate_id);
        if (!role) throw new ForbiddenError('You do not have access to this candidate');
    }
    res.json({ success: true, candidate: c });
}

/**
 * POST /api/candidates  (super_admin only)
 * Body: { candidate_id, name, constituency, title, subtitle, filter_config, map_config, logo_url, theme }
 */
async function create(req, res) {
    if (!req.user?.is_super_admin) throw new ForbiddenError('Super-admin only');

    const {
        candidate_id, name, constituency, title, subtitle, logo_url, theme,
        filter_config, map_config,
    } = req.body || {};

    if (!candidate_id || !name || !constituency || !title) {
        throw new ValidationError('candidate_id, name, constituency, title are required');
    }
    if (!/^[a-z][a-z0-9-]{1,40}$/i.test(candidate_id)) {
        throw new ValidationError('candidate_id must be a slug: letters / digits / hyphens, starting with a letter');
    }
    // filter_config / map_config are optional at create time. For wizard-onboarded
    // candidates they're populated later: map_config by the layer designer
    // (PUT /layer-definitions), filter_config once voter data is mapped.
    const exists = await candidateModel.findById(candidate_id);
    if (exists) throw new ValidationError(`Candidate '${candidate_id}' already exists`);

    const c = await candidateModel.create({
        candidateId: candidate_id,
        name, constituency, title, subtitle,
        logoUrl: logo_url,
        theme,
        filterConfig: Array.isArray(filter_config) ? filter_config : [],
        mapConfig: (map_config && typeof map_config === 'object') ? map_config : { layers: [] },
        createdBy: req.user.user_id,
    });

    res.status(201).json({ success: true, candidate: c });
}

/**
 * POST /api/candidates/:candidate_id/users
 *   Body: { user_id, role }
 *   Grants an existing user access to a candidate. Super-admin only.
 */
async function grantUser(req, res) {
    if (!req.user?.is_super_admin) throw new ForbiddenError('Super-admin only');

    const { candidate_id } = req.params;
    const { user_id, role } = req.body || {};
    if (!user_id || !role) throw new ValidationError('user_id and role are required');
    if (!['admin', 'sub_admin', 'volunteer'].includes(role)) {
        throw new ValidationError('Invalid role');
    }

    const candidate = await candidateModel.findById(candidate_id);
    if (!candidate) throw new NotFoundError('Candidate not found');

    const user = await userModel.findById(user_id);
    if (!user) throw new NotFoundError('User not found');

    await candidateModel.grantUserAccess({
        userId: user_id,
        candidateId: candidate_id,
        role,
        grantedBy: req.user.user_id,
    });
    res.json({ success: true });
}

async function revokeUser(req, res) {
    if (!req.user?.is_super_admin) throw new ForbiddenError('Super-admin only');
    const { candidate_id, user_id } = req.params;
    const ok = await candidateModel.revokeUserAccess(user_id, candidate_id);
    if (!ok) throw new NotFoundError('Grant not found');
    res.json({ success: true });
}

/**
 * DELETE /api/candidates/:candidate_id   (super-admin only)
 * Destructive: removes the candidate and ALL its data (cascade). The client
 * must echo the slug as ?confirm=<candidate_id> to guard against accidents.
 */
async function remove(req, res) {
    if (!req.user?.is_super_admin) throw new ForbiddenError('Super-admin only');
    const { candidate_id } = req.params;
    if (req.query.confirm !== candidate_id) {
        throw new ValidationError('Confirmation mismatch — pass ?confirm=<candidate_id> to delete');
    }
    const ok = await candidateModel.remove(candidate_id);
    if (!ok) throw new NotFoundError('Candidate not found');
    res.json({ success: true });
}

module.exports = { list, getOne, create, grantUser, revokeUser, remove };
