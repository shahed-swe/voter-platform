const canvassingModel = require('../models/canvassingModel');
const { ValidationError, ForbiddenError } = require('../utils/errors');

function tenant(req) {
    if (!req.candidateId) throw new ForbiddenError('No candidate selected');
    return req.candidateId;
}

// The political candidate whose survey data the caller may read. For a candidate
// user this is their own id; for a volunteer it's the candidate they're acting
// for; for a super-admin it's null (sees the whole constituency).
function pcId(req) {
    return req.user?.political_candidate_id || null;
}

// Volunteers only canvass — their survey LIST/stats show their own submissions
// (field features like prefill/status/pins stay campaign-wide so canvassing works).
function ownId(req) {
    return req.user?.role === 'volunteer' ? req.user.user_id : null;
}

async function submit(req, res) {
    const { voter_id, ...rest } = req.body || {};
    if (!voter_id) throw new ValidationError('voter_id is required');

    const canvass = await canvassingModel.submit(tenant(req), {
        voterId: voter_id,
        userId: req.user.user_id,
        politicalCandidateId: req.user.political_candidate_id || null,
        payload: rest,
    });
    res.status(201).json({ success: true, canvass });
}

async function history(req, res) {
    const rows = await canvassingModel.historyForVoter(tenant(req), req.params.voter_id, pcId(req));
    res.json({ success: true, history: rows });
}

async function locationsByVillage(req, res) {
    const rows = await canvassingModel.locationsByVillage(tenant(req), req.params.village_id, pcId(req));
    res.json({ success: true, locations: rows });
}

async function allLocations(req, res) {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 5000;
    const rows = await canvassingModel.allLocations(tenant(req), { limit, politicalCandidateId: pcId(req) });
    res.json({ success: true, locations: rows });
}

/**
 * POST /api/canvassing/voter-locations
 * Body: { scope: { ward: [..], voter_area: [..] } } (values may be a string or array)
 * Returns every voter in the scope whose latest canvass carries a geolocation —
 * the canvassing map shows them all as pins at once.
 */
async function voterLocations(req, res) {
    const { scope = {} } = req.body || {};
    const toArr = (v) => (v == null || v === '' ? null : (Array.isArray(v) ? v : [v]).filter(Boolean));
    let wards = toArr(scope.ward);
    let areas = toArr(scope.voter_area);

    // Same volunteer restrictions as the voter list (#12): only allowed wards /
    // voter areas may be requested; no scope defaults to everything they hold.
    const allowedWards = req.user?.allowed_wards;
    if (allowedWards?.length) {
        wards = wards ? wards.filter((w) => allowedWards.includes(w)) : allowedWards;
        if (!wards.length) throw new ForbiddenError('Ward not in your allowed wards');
    }
    const allowedAreas = req.user?.allowed_voter_areas;
    if (allowedAreas?.length) {
        areas = areas ? areas.filter((a) => allowedAreas.includes(a)) : allowedAreas;
        if (!areas.length) throw new ForbiddenError('Voter area not in your allowed areas');
    }

    const rows = await canvassingModel.voterLocationsByScope(tenant(req), {
        wards,
        voterAreas: areas,
        politicalCandidateId: pcId(req),
    });
    res.json({ success: true, voters: rows });
}

/**
 * GET /api/canvassing/party-records?limit=&offset=&q=
 * The Political Admin's party-wide survey view: every canvass whose campaign
 * belongs to a candidate of HIS party, across all constituencies. Nothing from
 * any other party is reachable here (join on user_candidates.party_id).
 * Super admins may inspect any party via ?party_id=.
 */
function partyScope(req) {
    const myParties = (req.user?.parties || [])
        .filter((p) => p.role === 'tenant_admin')
        .map((p) => p.id);
    if (req.user?.is_super_admin) {
        // With ?party_id= the super admin inspects one party; without it the
        // scope is NULL = every party (the Main Admin's platform-wide view).
        return req.query.party_id ? [req.query.party_id] : null;
    }
    if (!myParties.length) throw new ForbiddenError('Political Admin only');
    return myParties;
}

async function partyRecords(req, res) {
    const pc = req.query.political_candidate_id
        ? parseInt(req.query.political_candidate_id, 10)
        : null;
    const out = await canvassingModel.partyRecords(partyScope(req), {
        limit: Math.min(parseInt(req.query.limit || 50, 10) || 50, 500),
        offset: parseInt(req.query.offset || 0, 10) || 0,
        search: req.query.q || null,
        politicalCandidateId: Number.isNaN(pc) ? null : pc,
    });
    res.json({ success: true, ...out });
}

/**
 * GET /api/canvassing/party-stats
 * One aggregate row per candidate of the caller's party (survey totals,
 * unique voters, strong support, follow-ups, last canvass date).
 */
async function partyStats(req, res) {
    const rows = await canvassingModel.partyStats(partyScope(req));
    res.json({ success: true, stats: rows });
}

/**
 * GET /api/canvassing/voter-history/:voter_id
 * §10: the voter's FULL visit timeline. Political Admin — every visit by his
 * own party's campaigns. Main Admin — across all parties, with cross-roll
 * matching by voter number (each party imports its own roll, so the same
 * physical voter is a separate row per party; rows without a voter number
 * can't be matched — best-effort).
 */
async function voterHistory(req, res) {
    const voterId = req.params.voter_id;
    if (req.user?.is_super_admin) {
        const visits = await canvassingModel.crossPartyVoterHistory(voterId);
        return res.json({ success: true, visits, cross_party: true });
    }
    const myParties = (req.user?.parties || [])
        .filter((p) => p.role === 'tenant_admin')
        .map((p) => p.id);
    if (!myParties.length) throw new ForbiddenError('Political Admin only');
    const visits = await canvassingModel.partyVoterHistory(myParties, voterId);
    res.json({ success: true, visits, cross_party: false });
}

/**
 * GET /api/canvassing/party-persuadable
 * §10: voters visited more than once whose answer CHANGED between visits.
 * Political Admin: his own party only. Main Admin: cross-party by default
 * (all campaigns, parties named per voter), or one party via ?party_id.
 */
async function partyPersuadable(req, res) {
    const partyIds = (req.user?.is_super_admin && !req.query.party_id)
        ? null // cross-party
        : partyScope(req);
    const out = await canvassingModel.partyPersuadable(partyIds, {
        limit: Math.min(parseInt(req.query.limit || 50, 10) || 50, 500),
        offset: parseInt(req.query.offset || 0, 10) || 0,
    });
    res.json({ success: true, ...out });
}

async function voterRecords(req, res) {
    const rows = await canvassingModel.listVoterRecords(tenant(req), {
        limit: parseInt(req.query.limit || 200, 10),
        offset: parseInt(req.query.offset || 0, 10),
        search: req.query.q || null,
        politicalCandidateId: pcId(req),
        userId: ownId(req),
    });
    res.json({ success: true, records: rows });
}

async function stats(req, res) {
    res.json({ success: true, stats: await canvassingModel.stats(tenant(req), pcId(req), ownId(req)) });
}

module.exports = {
    submit,
    history,
    locationsByVillage,
    allLocations,
    voterLocations,
    voterRecords,
    partyRecords,
    partyStats,
    voterHistory,
    partyPersuadable,
    stats,
};
