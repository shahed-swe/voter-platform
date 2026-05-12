const m = require('../models/filterOptionsModel');
const { ForbiddenError, ValidationError } = require('../utils/errors');

function tenant(req) {
    if (!req.candidateId) throw new ForbiddenError('No candidate selected');
    return req.candidateId;
}

async function list(req, res) {
    const { source, value_col, label_col, parent_col, parent_value, limit } = req.query;
    if (!source || !value_col) throw new ValidationError('source and value_col are required');

    try {
        const rows = await m.distinctOptions(tenant(req), {
            source,
            valueCol: value_col,
            labelCol: label_col || value_col,
            parentCol: parent_col || null,
            parentValue: parent_value || null,
            limit: limit ? Math.min(parseInt(limit, 10) || 5000, 50000) : 5000,
        });
        res.json({ success: true, options: rows });
    } catch (err) {
        throw new ValidationError(err.message);
    }
}

module.exports = { list };
