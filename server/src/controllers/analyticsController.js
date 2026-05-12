const m = require('../models/analyticsModel');

async function overview(_req, res) {
    res.json({ success: true, overview: await m.overview() });
}
async function supportDistribution(_req, res) {
    res.json({ success: true, support_distribution: await m.supportDistribution() });
}
async function demographics(_req, res) {
    res.json({ success: true, demographics: await m.demographics() });
}
async function villagePerformance(req, res) {
    res.json({
        success: true,
        village_performance: await m.villagePerformance({ limit: parseInt(req.query.limit || 50, 10) }),
    });
}
async function canvasserPerformance(req, res) {
    res.json({
        success: true,
        canvasser_performance: await m.canvasserPerformance({ limit: parseInt(req.query.limit || 50, 10) }),
    });
}
async function dailyTrends(req, res) {
    res.json({
        success: true,
        daily_trends: await m.dailyTrends({ days: parseInt(req.query.days || 30, 10) }),
    });
}
async function issues(req, res) {
    res.json({ success: true, issues: await m.issues({ limit: parseInt(req.query.limit || 50, 10) }) });
}
async function canvassingRecords(req, res) {
    res.json({
        success: true,
        records: await m.canvassingRecords({
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
