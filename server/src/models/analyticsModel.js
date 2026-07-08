const { one, many } = require('../db/pool');

// All analytics are scoped to the active candidate + (optionally) the political
// candidate. On top of that a `filters` object narrows the CANVASSING rows:
//   { startDate, endDate, voterAreas: [], canvasserId, incomeBracket, source }
// Voter roll + geography counts stay constituency-wide; canvassing-derived
// metrics honour both the political-candidate scope and the filters.

/**
 * Append canvassing filter clauses to `params` and return the SQL fragment.
 * References the canvassing alias `c`; voter-area filtering also needs `v`
 * (voters) in scope — pass hasVoters:true for those queries.
 */
function canvassFilter(filters = {}, params, { hasVoters = false, alias = 'c' } = {}) {
    const parts = [];
    if (filters.startDate) {
        params.push(filters.startDate);
        parts.push(`${alias}.canvass_date >= $${params.length}::date`);
    }
    if (filters.endDate) {
        params.push(filters.endDate);
        parts.push(`${alias}.canvass_date < ($${params.length}::date + 1)`);
    }
    if (filters.canvasserId) {
        params.push(filters.canvasserId);
        parts.push(`${alias}.user_id = $${params.length}`);
    }
    if (filters.incomeBracket) {
        params.push(filters.incomeBracket);
        parts.push(`${alias}.income_bracket = $${params.length}`);
    }
    if (filters.source) {
        params.push(filters.source);
        parts.push(`${alias}.source = $${params.length}`);
    }
    if (filters.voterAreas?.length && hasVoters) {
        params.push(filters.voterAreas);
        parts.push(`v.voter_area_name = ANY($${params.length})`);
    }
    return parts.length ? ' AND ' + parts.join(' AND ') : '';
}

// Common head: candidate + political-candidate scope. Returns { where, params }.
function scoped(candidateId, politicalCandidateId, alias = 'c') {
    const params = [candidateId, politicalCandidateId];
    const where = `${alias}.candidate_id = $1 AND ($2::bigint IS NULL OR ${alias}.political_candidate_id = $2)`;
    return { params, where };
}

async function overview(candidateId, { politicalCandidateId = null, filters = {} } = {}) {
    // Whole "canvassing subset" is computed once, filtered.
    const { params, where } = scoped(candidateId, politicalCandidateId);
    const jf = canvassFilter(filters, params, { hasVoters: true }); // may add v-based area filter
    // total_voters is constituency-wide; the rest are from the filtered canvassing.
    return one(
        `SELECT
            (SELECT COUNT(*) FROM voters WHERE candidate_id = $1)                          AS total_voters,
            (SELECT COUNT(DISTINCT c.voter_id) FROM canvassing c
               JOIN voters v ON v.voter_id = c.voter_id
              WHERE ${where} ${jf})                                                        AS visited_voters,
            (SELECT COUNT(DISTINCT c.voter_id) FROM canvassing c
               JOIN voters v ON v.voter_id = c.voter_id
              WHERE ${where} ${jf} AND c.follow_up_needed = true)                          AS followup_voters,
            (SELECT COUNT(*) FROM canvassing c
               JOIN voters v ON v.voter_id = c.voter_id
              WHERE ${where} ${jf})                                                        AS total_canvasses,
            (SELECT COUNT(DISTINCT c.user_id) FROM canvassing c
               JOIN voters v ON v.voter_id = c.voter_id
              WHERE ${where} ${jf})                                                        AS active_canvassers,
            (SELECT COUNT(*) FROM voters WHERE candidate_id = $1 AND gender = 'Male')       AS male_voters,
            (SELECT COUNT(*) FROM voters WHERE candidate_id = $1 AND gender = 'Female')     AS female_voters`,
        params
    );
}

async function supportDistribution(candidateId, { politicalCandidateId = null, filters = {} } = {}) {
    const { params, where } = scoped(candidateId, politicalCandidateId);
    const jf = canvassFilter(filters, params, { hasVoters: true });
    return many(
        `SELECT COALESCE(c.support_level, 'Unknown') AS support_level, COUNT(*) AS count
           FROM canvassing c JOIN voters v ON v.voter_id = c.voter_id
          WHERE ${where} ${jf}
          GROUP BY c.support_level
          ORDER BY count DESC`,
        params
    );
}

// Demographics: gender × age of voters that were CANVASSED (so filters apply).
async function demographics(candidateId, { politicalCandidateId = null, filters = {} } = {}) {
    const { params, where } = scoped(candidateId, politicalCandidateId);
    const jf = canvassFilter(filters, params, { hasVoters: true });
    return many(
        `SELECT COALESCE(v.gender, 'Unknown') AS gender,
                CASE WHEN v.age IS NULL THEN 'Unknown'
                     WHEN v.age < 25 THEN '18-24' WHEN v.age < 35 THEN '25-34'
                     WHEN v.age < 45 THEN '35-44' WHEN v.age < 55 THEN '45-54'
                     WHEN v.age < 65 THEN '55-64' ELSE '65+' END AS age_bucket,
                COUNT(DISTINCT c.voter_id) AS count
           FROM canvassing c JOIN voters v ON v.voter_id = c.voter_id
          WHERE ${where} ${jf}
          GROUP BY gender, age_bucket
          ORDER BY gender, age_bucket`,
        params
    );
}

// Income distribution of canvassed voters.
async function incomeDistribution(candidateId, { politicalCandidateId = null, filters = {} } = {}) {
    const { params, where } = scoped(candidateId, politicalCandidateId);
    const jf = canvassFilter(filters, params, { hasVoters: true });
    return many(
        `SELECT COALESCE(NULLIF(c.income_bracket, ''), 'Unknown') AS income_bracket, COUNT(*) AS count
           FROM canvassing c JOIN voters v ON v.voter_id = c.voter_id
          WHERE ${where} ${jf}
          GROUP BY income_bracket ORDER BY count DESC`,
        params
    );
}

async function villagePerformance(candidateId, { limit = 50, politicalCandidateId = null, filters = {} } = {}) {
    const { params, where } = scoped(candidateId, politicalCandidateId);
    const jf = canvassFilter(filters, params, { hasVoters: true });
    params.push(limit);
    const limitIdx = params.length;
    return many(
        `WITH totals AS (
             SELECT voter_area_name, COUNT(*)::int AS total_voters
               FROM voters
              WHERE candidate_id = $1 AND voter_area_name IS NOT NULL AND voter_area_name <> ''
              GROUP BY voter_area_name
         ),
         visited AS (
             SELECT v.voter_area_name, COUNT(DISTINCT c.voter_id)::int AS visited
               FROM canvassing c JOIN voters v ON v.voter_id = c.voter_id
              WHERE ${where} ${jf}
              GROUP BY v.voter_area_name
         )
         SELECT t.voter_area_name AS village_id, t.voter_area_name AS village_name,
                t.total_voters, COALESCE(vi.visited, 0) AS visited,
                ROUND(100.0 * COALESCE(vi.visited, 0) / NULLIF(t.total_voters, 0), 2) AS completion_pct
           FROM totals t LEFT JOIN visited vi ON vi.voter_area_name = t.voter_area_name
          ORDER BY visited DESC, total_voters DESC
          LIMIT $${limitIdx}`,
        params
    );
}

async function canvasserPerformance(candidateId, { limit = 50, politicalCandidateId = null, filters = {} } = {}) {
    const { params, where } = scoped(candidateId, politicalCandidateId);
    const jf = canvassFilter(filters, params, { hasVoters: true });
    params.push(limit);
    const limitIdx = params.length;
    return many(
        `SELECT u.user_id, u.name, u.username, u.role,
                COUNT(c.canvass_id) AS canvasses,
                COUNT(DISTINCT c.voter_id) AS unique_voters,
                COUNT(*) FILTER (WHERE c.support_rating >= 4) AS strong_support
           FROM canvassing c
           JOIN voters v ON v.voter_id = c.voter_id
           JOIN users u  ON u.user_id  = c.user_id
          WHERE ${where} ${jf}
          GROUP BY u.user_id
          ORDER BY canvasses DESC
          LIMIT $${limitIdx}`,
        params
    );
}

async function dailyTrends(candidateId, { days = 30, politicalCandidateId = null, filters = {} } = {}) {
    const { params, where } = scoped(candidateId, politicalCandidateId);
    const jf = canvassFilter(filters, params, { hasVoters: true });
    // If an explicit date range is set, honour it; else last `days`.
    let rangeClause = '';
    if (!filters.startDate && !filters.endDate) {
        params.push(days);
        rangeClause = `AND c.canvass_date >= NOW() - ($${params.length}::int || ' days')::interval`;
    }
    return many(
        `SELECT DATE(c.canvass_date) AS day, COUNT(*) AS canvasses, COUNT(DISTINCT c.user_id) AS active_users
           FROM canvassing c JOIN voters v ON v.voter_id = c.voter_id
          WHERE ${where} ${jf} ${rangeClause}
          GROUP BY day ORDER BY day`,
        params
    );
}

async function issues(candidateId, { limit = 50, politicalCandidateId = null, filters = {} } = {}) {
    const { params, where } = scoped(candidateId, politicalCandidateId);
    const jf = canvassFilter(filters, params, { hasVoters: true });
    params.push(limit);
    const limitIdx = params.length;
    return many(
        `SELECT c.issues_concerns, COUNT(*) AS count
           FROM canvassing c JOIN voters v ON v.voter_id = c.voter_id
          WHERE ${where} ${jf} AND c.issues_concerns IS NOT NULL AND c.issues_concerns <> ''
          GROUP BY c.issues_concerns ORDER BY count DESC
          LIMIT $${limitIdx}`,
        params
    );
}

async function canvassingRecords(candidateId, { limit = 200, offset = 0, politicalCandidateId = null, filters = {} } = {}) {
    const { params, where } = scoped(candidateId, politicalCandidateId);
    const jf = canvassFilter(filters, params, { hasVoters: true });
    params.push(limit); const limitIdx = params.length;
    params.push(offset); const offsetIdx = params.length;
    return many(
        `SELECT c.canvass_id, c.voter_id, c.support_level, c.support_rating, c.income_bracket,
                c.canvass_date, c.latitude, c.longitude,
                v.name AS voter_name, v.sos_vid, v.gender, v.age, v.voter_area_name,
                u.name AS canvasser_name
           FROM canvassing c
           JOIN voters v ON v.voter_id = c.voter_id
           JOIN users u  ON u.user_id  = c.user_id
          WHERE ${where} ${jf}
          ORDER BY c.canvass_date DESC
          LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        params
    );
}

// Distinct canvassers (for the filter dropdown), scoped to the political candidate.
async function canvasserOptions(candidateId, politicalCandidateId = null) {
    return many(
        `SELECT DISTINCT u.user_id, u.name, u.username
           FROM canvassing c JOIN users u ON u.user_id = c.user_id
          WHERE c.candidate_id = $1 AND ($2::bigint IS NULL OR c.political_candidate_id = $2)
          ORDER BY u.name`,
        [candidateId, politicalCandidateId]
    );
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
    canvassingRecords,
    canvasserOptions,
};
