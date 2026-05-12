const { one, many } = require('../db/pool');

// All analytics are scoped to the active candidate. The `users` table is
// global (no candidate_id), so canvasser-performance joins through
// canvassing.candidate_id to keep the result candidate-scoped.

async function overview(candidateId) {
    return one(
        `SELECT
            (SELECT COUNT(*) FROM voters WHERE candidate_id = $1)                                            AS total_voters,
            (SELECT COUNT(*) FROM voters WHERE candidate_id = $1 AND status = 'Visited')                     AS visited_voters,
            (SELECT COUNT(*) FROM voters WHERE candidate_id = $1 AND status = 'Follow-up needed')            AS followup_voters,
            (SELECT COUNT(*) FROM canvassing WHERE candidate_id = $1)                                        AS total_canvasses,
            (SELECT COUNT(DISTINCT user_id) FROM canvassing WHERE candidate_id = $1)                         AS active_canvassers,
            (SELECT COUNT(*) FROM villages WHERE candidate_id = $1)                                          AS total_villages`,
        [candidateId]
    );
}

async function supportDistribution(candidateId) {
    return many(
        `SELECT COALESCE(support_level, 'Unknown') AS support_level,
                COUNT(*) AS count
           FROM canvassing
          WHERE candidate_id = $1
          GROUP BY support_level
          ORDER BY count DESC`,
        [candidateId]
    );
}

async function demographics(candidateId) {
    return many(
        `SELECT
            COALESCE(gender, 'Unknown') AS gender,
            CASE
                WHEN age IS NULL THEN 'Unknown'
                WHEN age < 25     THEN '18-24'
                WHEN age < 35     THEN '25-34'
                WHEN age < 45     THEN '35-44'
                WHEN age < 55     THEN '45-54'
                WHEN age < 65     THEN '55-64'
                ELSE '65+'
            END AS age_bucket,
            COUNT(*) AS count
           FROM voters
          WHERE candidate_id = $1
          GROUP BY gender, age_bucket
          ORDER BY gender, age_bucket`,
        [candidateId]
    );
}

async function villagePerformance(candidateId, { limit = 50 } = {}) {
    return many(
        `SELECT vil.village_id, vil.village_name, vil.total_population,
                COUNT(v.voter_id) AS total_voters,
                COUNT(*) FILTER (WHERE v.status = 'Visited') AS visited,
                ROUND(100.0 * COUNT(*) FILTER (WHERE v.status = 'Visited') /
                      NULLIF(COUNT(v.voter_id), 0), 2) AS completion_pct
           FROM villages vil
           LEFT JOIN voters v ON v.village_id = vil.village_id AND v.candidate_id = $1
          WHERE vil.candidate_id = $1
          GROUP BY vil.candidate_id, vil.village_id
          ORDER BY completion_pct DESC NULLS LAST
          LIMIT $2`,
        [candidateId, limit]
    );
}

async function canvasserPerformance(candidateId, { limit = 50 } = {}) {
    return many(
        `SELECT u.user_id, u.name, u.username, u.role,
                COUNT(c.canvass_id) AS canvasses,
                COUNT(DISTINCT c.voter_id) AS unique_voters,
                COUNT(*) FILTER (WHERE c.support_rating >= 4) AS strong_support
           FROM user_candidates uc
           JOIN users u ON u.user_id = uc.user_id
           LEFT JOIN canvassing c
             ON c.user_id = u.user_id AND c.candidate_id = $1
          WHERE uc.candidate_id = $1
            AND uc.role IN ('volunteer','sub_admin')
          GROUP BY u.user_id
          ORDER BY canvasses DESC
          LIMIT $2`,
        [candidateId, limit]
    );
}

async function dailyTrends(candidateId, { days = 30 } = {}) {
    return many(
        `SELECT DATE(canvass_date) AS day,
                COUNT(*) AS canvasses,
                COUNT(DISTINCT user_id) AS active_users
           FROM canvassing
          WHERE candidate_id = $1
            AND canvass_date >= NOW() - ($2::int || ' days')::interval
          GROUP BY day
          ORDER BY day`,
        [candidateId, days]
    );
}

async function issues(candidateId, { limit = 50 } = {}) {
    return many(
        `SELECT issues_concerns, COUNT(*) AS count
           FROM canvassing
          WHERE candidate_id = $1
            AND issues_concerns IS NOT NULL AND issues_concerns <> ''
          GROUP BY issues_concerns
          ORDER BY count DESC
          LIMIT $2`,
        [candidateId, limit]
    );
}

async function canvassingRecords(candidateId, { limit = 200, offset = 0 } = {}) {
    return many(
        `SELECT c.canvass_id, c.voter_id, c.support_level, c.support_rating,
                c.canvass_date, c.latitude, c.longitude,
                v.name AS voter_name, v.sos_vid,
                u.name AS canvasser_name
           FROM canvassing c
           JOIN voters v ON v.voter_id = c.voter_id
           JOIN users u  ON u.user_id  = c.user_id
          WHERE c.candidate_id = $1
          ORDER BY c.canvass_date DESC
          LIMIT $2 OFFSET $3`,
        [candidateId, limit, offset]
    );
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
