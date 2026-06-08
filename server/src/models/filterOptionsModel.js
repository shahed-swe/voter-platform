// Generic distinct-value lookup for dynamic filter panels.
// SECURITY: every source + column is checked against a whitelist; nothing
// from the request body becomes raw SQL.

const { many } = require('../db/pool');

// Whitelist: which columns can be used as value/label/parent for each source.
const ALLOWED = {
    villages:    new Set(['village_id', 'village_name', 'district', 'upazila', 'union', 'mauza',
                          'total_population']),
    voters:      new Set(['voter_id', 'voter_area_name', 'voter_area_code', 'clean_voter_area',
                          'ward', 'union', 'upazila']),
    voter_areas: new Set(['voter_area_id', 'voter_area_name', 'bangla_voter_area_name',
                          'village_name', 'ward_id', 'union_name', 'mauza_name', 'mauza_code']),
    wards:       new Set(['ward_id', 'ward_number', 'union_name', 'constituency_id']),
    buildings:   new Set(['building_id', 'voter_area_id', 'street', 'house']),
};

function quote(col) {
    // Allow only [a-z_] identifiers from the whitelist. Wrap in double quotes
    // for safety with reserved words like "union".
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) throw new Error(`bad column: ${col}`);
    return `"${col}"`;
}

/**
 * Special source for wizard-onboarded candidates: distinct values of a JSONB
 * attribute on the voters table (e.g. attributes->>'Sector'). The attribute
 * KEY is passed as a bound parameter (never interpolated) so arbitrary /
 * Bengali column names are safe.
 */
async function distinctVoterAttr(candidateId, { valueCol, parentCol, parentValue, limit = 5000 }) {
    const where = ['candidate_id = $1', `attributes->>$2 IS NOT NULL`, `attributes->>$2 <> ''`];
    const params = [candidateId, valueCol];
    if (parentCol && parentValue != null && parentValue !== '') {
        params.push(parentCol, parentValue);
        where.push(`attributes->>$${params.length - 1} = $${params.length}`);
    }
    const sql = `
        SELECT attributes->>$2 AS value, attributes->>$2 AS label, COUNT(*) AS count
          FROM voters
         WHERE ${where.join(' AND ')}
         GROUP BY attributes->>$2
         ORDER BY value
         LIMIT ${limit}
    `;
    return many(sql, params);
}

/**
 * Returns distinct (value, label) pairs from `source.value_col` for the
 * current candidate. Optionally filters by parent_col=parent_value.
 */
async function distinctOptions(candidateId, { source, valueCol, labelCol, parentCol, parentValue, limit = 5000 }) {
    // Dynamic attribute source — value_col is the JSONB key, not a real column.
    if (source === 'voters_attr') {
        return distinctVoterAttr(candidateId, { valueCol, parentCol, parentValue, limit });
    }

    if (!ALLOWED[source]) throw new Error(`unknown source: ${source}`);
    const cols = ALLOWED[source];

    if (!cols.has(valueCol)) throw new Error(`column ${valueCol} not allowed on ${source}`);
    if (labelCol && !cols.has(labelCol)) throw new Error(`column ${labelCol} not allowed on ${source}`);
    if (parentCol && !cols.has(parentCol)) throw new Error(`column ${parentCol} not allowed on ${source}`);

    const v = quote(valueCol);
    const l = labelCol ? quote(labelCol) : v;
    const where = ['candidate_id = $1', `${v} IS NOT NULL`];
    const params = [candidateId];

    if (parentCol && parentValue != null && parentValue !== '') {
        params.push(parentValue);
        where.push(`${quote(parentCol)} = $${params.length}`);
    }

    const sql = `
        SELECT ${v} AS value, MIN(${l}::text) AS label, COUNT(*) AS count
          FROM ${quote(source)}
         WHERE ${where.join(' AND ')}
         GROUP BY ${v}
         ORDER BY label
         LIMIT ${limit}
    `;
    return many(sql, params);
}

module.exports = { distinctOptions };
