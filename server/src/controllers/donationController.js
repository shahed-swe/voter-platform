'use strict';
/**
 * Donations (flowApplication.md §9):
 *   1. the Tenant Admin assigns donors to the party (Team Management);
 *   2. a donor finds volunteers working in the area they wish to support;
 *   3. the donor records a donation to a volunteer;
 *   4. the volunteer separately confirms the money was received;
 *   5. the Political Admin sees the whole party's ledger.
 *
 * Isolation: a donor only reaches volunteers of THEIR party; donors see only
 * their own donations (never canvassing work); volunteers only donations
 * addressed to them; the ledger only the caller's own party.
 */
const { many, one } = require('../db/pool');
const donationModel = require('../models/donationModel');
const { ValidationError, ForbiddenError, NotFoundError } = require('../utils/errors');

function partyIdsWithRole(req, role) {
    return (req.user?.parties || []).filter((p) => p.role === role).map((p) => p.id);
}

function requireDonor(req) {
    const ids = partyIdsWithRole(req, 'donor');
    if (!ids.length) throw new ForbiddenError('Donor only');
    return ids;
}

/**
 * GET /api/donations/volunteers?q=
 * The donor's volunteer finder. Party-scoped, and privacy-scoped (§13):
 * name + working area + campaign only — no username, phone, or survey data.
 */
async function findVolunteers(req, res) {
    const partyIds = requireDonor(req);
    const params = [partyIds];
    let searchClause = '';
    if (req.query.q?.trim()) {
        params.push(`%${req.query.q.trim()}%`);
        const s = params.length;
        searchClause = `AND (u.name ILIKE $${s}
            OR c.name ILIKE $${s}
            OR array_to_string(uc.allowed_wards, ' ') ILIKE $${s}
            OR array_to_string(uc.allowed_voter_areas, ' ') ILIKE $${s})`;
    }
    const rows = await many(
        `SELECT DISTINCT ON (u.user_id, uc.candidate_id, uc.political_candidate_id)
                u.user_id, u.name,
                uc.candidate_id, c.name AS constituency_name,
                uc.political_candidate_id, pc.name AS candidate_name,
                uc.allowed_wards, uc.allowed_voter_areas
           FROM user_candidates uc
           JOIN users u ON u.user_id = uc.user_id AND u.is_active = true
           JOIN candidates c ON c.candidate_id = uc.candidate_id
           LEFT JOIN users pc ON pc.user_id = uc.political_candidate_id
          WHERE uc.role = 'volunteer'
            AND uc.political_candidate_id IN (
                SELECT uc2.user_id FROM user_candidates uc2
                 WHERE uc2.role = 'candidate' AND uc2.party_id = ANY($1))
            ${searchClause}
          ORDER BY u.user_id, uc.candidate_id, uc.political_candidate_id
          LIMIT 50`,
        params
    );
    res.json({ success: true, volunteers: rows });
}

/**
 * POST /api/donations
 * Body: { volunteer_user_id, political_candidate_id?, amount, note? }
 * The volunteer must belong to the donor's own party; the campaign context
 * (candidate + constituency) is derived from that verified grant.
 */
async function create(req, res) {
    const partyIds = requireDonor(req);
    const { volunteer_user_id: volId, political_candidate_id: pcId, amount, note } = req.body || {};

    const parsedAmount = Number(amount);
    if (!volId) throw new ValidationError('volunteer_user_id is required');
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        throw new ValidationError('amount must be a positive number');
    }

    // The WHERE clause is the party check: no grant inside the donor's party →
    // the volunteer is unreachable, whatever ids the request carries.
    const grantParams = [parseInt(volId, 10), partyIds];
    let pcClause = '';
    if (pcId) {
        grantParams.push(parseInt(pcId, 10));
        pcClause = `AND uc.political_candidate_id = $${grantParams.length}`;
    }
    const grant = await one(
        `SELECT uc.candidate_id, uc.political_candidate_id, uc2.party_id
           FROM user_candidates uc
           JOIN user_candidates uc2
             ON uc2.user_id = uc.political_candidate_id AND uc2.role = 'candidate'
          WHERE uc.user_id = $1 AND uc.role = 'volunteer' AND uc2.party_id = ANY($2)
            ${pcClause}
          LIMIT 1`,
        grantParams
    );
    if (!grant) throw new NotFoundError('Volunteer not found in your party');

    const donation = await donationModel.create({
        partyId: grant.party_id,
        donorUserId: req.user.user_id,
        volunteerUserId: parseInt(volId, 10),
        politicalCandidateId: grant.political_candidate_id,
        candidateId: grant.candidate_id,
        amount: parsedAmount,
        note: (note || '').trim() || null,
    });
    res.status(201).json({ success: true, donation });
}

/** GET /api/donations/mine — the donor's own record + totals. */
async function mine(req, res) {
    requireDonor(req);
    const [donations, totals] = await Promise.all([
        donationModel.listForDonor(req.user.user_id),
        donationModel.donorTotals(req.user.user_id),
    ]);
    res.json({ success: true, donations, totals });
}

/** GET /api/donations/received — donations addressed to this volunteer. */
async function received(req, res) {
    if (req.user?.role !== 'volunteer') throw new ForbiddenError('Volunteer only');
    const donations = await donationModel.listForVolunteer(req.user.user_id);
    res.json({ success: true, donations });
}

/** POST /api/donations/:donation_id/confirm — the volunteer's independent confirmation. */
async function confirm(req, res) {
    if (req.user?.role !== 'volunteer') throw new ForbiddenError('Volunteer only');
    const donation = await donationModel.confirm(
        parseInt(req.params.donation_id, 10),
        req.user.user_id
    );
    if (!donation) throw new NotFoundError('No pending donation of yours with that id');
    res.json({ success: true, donation });
}

/** GET /api/donations/party — the Political Admin's ledger (super: ?party_id=). */
async function partyLedger(req, res) {
    let partyIds;
    if (req.user?.is_super_admin) {
        if (!req.query.party_id) throw new ValidationError('party_id required');
        partyIds = [req.query.party_id];
    } else {
        partyIds = partyIdsWithRole(req, 'tenant_admin');
        if (!partyIds.length) throw new ForbiddenError('Political Admin only');
    }
    const out = await donationModel.partyLedger(partyIds, {
        limit: Math.min(parseInt(req.query.limit || 100, 10) || 100, 500),
        offset: parseInt(req.query.offset || 0, 10) || 0,
    });
    res.json({ success: true, ...out });
}

module.exports = { findVolunteers, create, mine, received, confirm, partyLedger };
