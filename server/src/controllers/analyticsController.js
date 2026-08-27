const m = require('../models/analyticsModel');
const { ForbiddenError } = require('../utils/errors');

function tenant(req) {
    if (!req.candidateId) throw new ForbiddenError('No candidate selected');
    return req.candidateId;
}
function pcId(req) {
    return req.user?.political_candidate_id || null;
}

// Parse the shared analytics filters from the query string.
function filtersOf(req) {
    const q = req.query || {};
    const areas = q.voter_areas
        ? String(q.voter_areas).split(',').map((s) => s.trim()).filter(Boolean)
        : [];
    const canvasserIds = q.canvasser_ids
        ? String(q.canvasser_ids).split(',').map((s) => parseInt(s, 10)).filter((n) => !isNaN(n))
        : [];
    return {
        startDate:     q.start_date || null,
        endDate:       q.end_date || null,
        voterAreas:    areas,
        canvasserId:   q.canvasser_id ? parseInt(q.canvasser_id, 10) : null,
        canvasserIds,
        incomeBracket: q.income_bracket || null,
        source:        q.source || null,
    };
}
function opts(req, extra = {}) {
    return { politicalCandidateId: pcId(req), filters: filtersOf(req), ...extra };
}

async function overview(req, res) {
    res.json({ success: true, overview: await m.overview(tenant(req), opts(req)) });
}
async function supportDistribution(req, res) {
    res.json({ success: true, support_distribution: await m.supportDistribution(tenant(req), opts(req)) });
}
async function demographics(req, res) {
    res.json({ success: true, demographics: await m.demographics(tenant(req), opts(req)) });
}
async function incomeDistribution(req, res) {
    res.json({ success: true, income_distribution: await m.incomeDistribution(tenant(req), opts(req)) });
}
async function villagePerformance(req, res) {
    res.json({ success: true, village_performance: await m.villagePerformance(tenant(req), opts(req, { limit: parseInt(req.query.limit || 50, 10) })) });
}
async function canvasserPerformance(req, res) {
    res.json({ success: true, canvasser_performance: await m.canvasserPerformance(tenant(req), opts(req, { limit: parseInt(req.query.limit || 50, 10) })) });
}
async function dailyTrends(req, res) {
    res.json({ success: true, daily_trends: await m.dailyTrends(tenant(req), opts(req, { days: parseInt(req.query.days || 30, 10) })) });
}
async function issues(req, res) {
    res.json({ success: true, issues: await m.issues(tenant(req), opts(req, { limit: parseInt(req.query.limit || 50, 10) })) });
}
async function canvassingRecords(req, res) {
    const o = opts(req, {
        limit: parseInt(req.query.limit || 5000, 10),
        offset: parseInt(req.query.offset || 0, 10),
    });
    const [records, total] = await Promise.all([
        m.canvassingRecords(tenant(req), o),
        m.canvassingRecordsTotal(tenant(req), o),
    ]);
    res.json({ success: true, records, total });
}
async function issuesRecords(req, res) {
    const out = await m.issuesRecords(tenant(req), opts(req, {
        limit: parseInt(req.query.limit || 100, 10),
        offset: parseInt(req.query.offset || 0, 10),
    }));
    res.json({ success: true, records: out.records, total: out.total });
}
async function occupations(req, res) {
    res.json({ success: true, occupations: await m.occupations(tenant(req), opts(req, { limit: parseInt(req.query.limit || 10, 10) })) });
}
async function canvasserOptions(req, res) {
    res.json({ success: true, canvassers: await m.canvasserOptions(tenant(req), pcId(req)) });
}

module.exports = {
    overview,
    supportDistribution,
    demographics,
    incomeDistribution,
    villagePerformance,
    canvasserPerformance,
    dailyTrends,
    issues,
    issuesRecords,
    occupations,
    canvassingRecords,
    canvasserOptions,
};
