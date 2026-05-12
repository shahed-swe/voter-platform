const { one, many } = require('../db/pool');

async function overview() {
    return one(`
        SELECT
            (SELECT COUNT(*) FROM voters)                                            AS total_voters,
            (SELECT COUNT(*) FROM voters WHERE status = 'Visited')                   AS visited_voters,
            (SELECT COUNT(*) FROM voters WHERE status = 'Follow-up needed')          AS followup_voters,
            (SELECT COUNT(*) FROM canvassing)                                        AS total_canvasses,
            (SELECT COUNT(DISTINCT user_id) FROM canvassing)                         AS active_canvassers,
            (SELECT COUNT(*) FROM villages)                                          AS total_villages
    `);
}

async function supportDistribution() {
    return many(`
        SELECT COALESCE(support_level, 'Unknown') AS support_level,
               COUNT(*) AS count
          FROM canvassing
         GROUP BY support_level
         ORDER BY count DESC
    `);
}

async function demographics() {
    return many(`
        SELECT
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
         GROUP BY gender, age_bucket
         ORDER BY gender, age_bucket
    `);
}

async function villagePerformance({ limit = 50 } = {}) {
    return many(
        `SELECT vil.village_id, vil.village_name, vil.total_population,
                COUNT(v.voter_id) AS total_voters,
                COUNT(*) FILTER (WHERE v.status = 'Visited') AS visited,
                ROUND(100.0 * COUNT(*) FILTER (WHERE v.status = 'Visited') /
                      NULLIF(COUNT(v.voter_id), 0), 2) AS completion_pct
           FROM villages vil
           LEFT JOIN voters v ON v.village_id = vil.village_id
          GROUP BY vil.village_id
          ORDER BY completion_pct DESC NULLS LAST
          LIMIT $1`,
        [limit]
    );
}

async function canvasserPerformance({ limit = 50 } = {}) {
    return many(
        `SELECT u.user_id, u.name, u.username, u.role,
                COUNT(c.canvass_id) AS canvasses,
                COUNT(DISTINCT c.voter_id) AS unique_voters,
                COUNT(*) FILTER (WHERE c.support_rating >= 4) AS strong_support
           FROM users u
           LEFT JOIN canvassing c ON c.user_id = u.user_id
          WHERE u.role IN ('volunteer', 'sub_admin')
          GROUP BY u.user_id
          ORDER BY canvasses DESC
          LIMIT $1`,
        [limit]
    );
}

async function dailyTrends({ days = 30 } = {}) {
    return many(
        `SELECT DATE(canvass_date) AS day,
                COUNT(*) AS canvasses,
                COUNT(DISTINCT user_id) AS active_users
           FROM canvassing
          WHERE canvass_date >= NOW() - ($1::int || ' days')::interval
          GROUP BY day
          ORDER BY day`,
        [days]
    );
}

async function issues({ limit = 50 } = {}) {
    return many(
        `SELECT issues_concerns, COUNT(*) AS count
           FROM canvassing
          WHERE issues_concerns IS NOT NULL AND issues_concerns <> ''
          GROUP BY issues_concerns
          ORDER BY count DESC
          LIMIT $1`,
        [limit]
    );
}

async function canvassingRecords({ limit = 200, offset = 0 } = {}) {
    return many(
        `SELECT c.canvass_id, c.voter_id, c.support_level, c.support_rating,
                c.canvass_date, c.latitude, c.longitude,
                v.name AS voter_name, v.sos_vid,
                u.name AS canvasser_name
           FROM canvassing c
           JOIN voters v ON v.voter_id = c.voter_id
           JOIN users u  ON u.user_id  = c.user_id
          ORDER BY c.canvass_date DESC
          LIMIT $1 OFFSET $2`,
        [limit, offset]
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
