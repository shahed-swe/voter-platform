const m = require('../models/analyticsModel');
const { ForbiddenError } = require('../utils/errors');

function tenant(req) {
    if (!req.candidateId) throw new ForbiddenError('No candidate selected');
    return req.candidateId;
}

async function overview(req, res) {
    res.json({ success: true, overview: await m.overview(tenant(req)) });
}
async function supportDistribution(req, res) {
    res.json({ success: true, support_distribution: await m.supportDistribution(tenant(req)) });
}
async function demographics(req, res) {
    res.json({ success: true, demographics: await m.demographics(tenant(req)) });
}
async function villagePerformance(req, res) {
    res.json({
        success: true,
        village_performance: await m.villagePerformance(tenant(req), { limit: parseInt(req.query.limit || 50, 10) }),
    });
}
async function canvasserPerformance(req, res) {
    res.json({
        success: true,
        canvasser_performance: await m.canvasserPerformance(tenant(req), { limit: parseInt(req.query.limit || 50, 10) }),
    });
}
async function dailyTrends(req, res) {
    res.json({
        success: true,
        daily_trends: await m.dailyTrends(tenant(req), { days: parseInt(req.query.days || 30, 10) }),
    });
}
async function issues(req, res) {
    res.json({
        success: true,
        issues: await m.issues(tenant(req), { limit: parseInt(req.query.limit || 50, 10) }),
    });
}
async function canvassingRecords(req, res) {
    res.json({
        success: true,
        records: await m.canvassingRecords(tenant(req), {
            limit: parseInt(req.query.limit || 200, 10),
            offset: parseInt(req.query.offset || 0, 10),
        }),
    });
}

module.exports = {
    overview,
    supportDistribution,
    demographics,
    villagePerformance,
    canvasserPerformance,
    dailyTrends,
    issues,
    canvassingRecords,
};
