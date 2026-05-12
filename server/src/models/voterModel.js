const { one, many } = require('../db/pool');

async function findById(voterId) {
    return one(`SELECT * FROM voters WHERE voter_id = $1`, [voterId]);
}

async function findBySosVid(sosVid) {
    return one(`SELECT * FROM voters WHERE sos_vid = $1`, [sosVid]);
}

async function search(query, { limit = 50 } = {}) {
    return many(
        `SELECT voter_id, sos_vid, name, father_husband, age, gender, ward,
                voter_area_name, village_csv, village_id, status
           FROM voters
          WHERE name ILIKE $1
             OR sos_vid ILIKE $1
             OR father_husband ILIKE $1
          ORDER BY name
          LIMIT $2`,
        [`%${query}%`, limit]
    );
}

async function byVillage(villageId, { limit = 1000, offset = 0 } = {}) {
    return many(
        `SELECT voter_id, sos_vid, name, father_husband, mother, age, gender, ward,
                voter_area_name, status, address
           FROM voters
          WHERE village_id = $1
          ORDER BY name
          LIMIT $2 OFFSET $3`,
        [villageId, limit, offset]
    );
}

async function byVoterArea(voterArea, { limit = 1000, offset = 0 } = {}) {
    return many(
        `SELECT voter_id, sos_vid, name, father_husband, age, gender, ward,
                voter_area_name, status, address
           FROM voters
          WHERE COALESCE(clean_voter_area, voter_area_name) = $1
          ORDER BY name
          LIMIT $2 OFFSET $3`,
        [voterArea, limit, offset]
    );
}

/**
 * Multi-area voter query for the canvassing voter list panel.
 * `areas` is an array of bangla_voter_area_name strings that match
 * voters.voter_area_name. Returns matching voters + status stats.
 */
async function byVoterAreas({ areas, status, search, limit = 500, offset = 0 } = {}) {
    if (!areas?.length) {
        return { voters: [], stats: { total: 0, visited: 0, not_visited: 0, follow_up: 0 } };
    }

    const where = [`v.voter_area_name = ANY($1)`];
    const params = [areas];
    let i = 2;

    if (status) {
        where.push(`v.status = $${i++}`);
        params.push(status);
    }
    if (search) {
        where.push(`(v.name ILIKE $${i} OR v.sos_vid ILIKE $${i} OR v.address ILIKE $${i})`);
        params.push(`%${search}%`);
        i++;
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;

    const [voters, stats] = await Promise.all([
        many(
            `SELECT v.voter_id, v.sos_vid, v.name, v.father_husband, v.age, v.gender,
                    v.ward, v.voter_area_name, v.address, v.status,
                    EXISTS (SELECT 1 FROM canvassing c WHERE c.voter_id = v.voter_id) AS has_canvass
               FROM voters v
               ${whereSql}
               ORDER BY v.name
               LIMIT $${i} OFFSET $${i + 1}`,
            [...params, limit, offset]
        ),
        one(
            `SELECT
                COUNT(*)::int                                              AS total,
                COUNT(*) FILTER (WHERE v.status = 'Visited')::int          AS visited,
                COUNT(*) FILTER (WHERE v.status = 'Not visited')::int      AS not_visited,
                COUNT(*) FILTER (WHERE v.status = 'Follow-up needed')::int AS follow_up
               FROM voters v
               WHERE v.voter_area_name = ANY($1)`,
            [areas]
        ),
    ]);

    return { voters, stats };
}

async function listVoterAreas() {
    return many(
        `SELECT DISTINCT clean_voter_area AS voter_area, COUNT(*) AS voter_count
           FROM voters
          WHERE clean_voter_area IS NOT NULL
          GROUP BY clean_voter_area
          ORDER BY clean_voter_area`
    );
}

async function voterAreaStats(voterArea) {
    return one(
        `SELECT COUNT(*) AS total_voters,
                COUNT(*) FILTER (WHERE status = 'Visited') AS visited,
                COUNT(*) FILTER (WHERE gender = 'Male')    AS male,
                COUNT(*) FILTER (WHERE gender = 'Female')  AS female
           FROM voters
          WHERE clean_voter_area = $1`,
        [voterArea]
    );
}

async function aggregatedStatistics({ groupBy = 'union' } = {}) {
    const allowed = { upazila: 'upazila', union: '"union"', mauza: 'NULL', voter_area: 'clean_voter_area' };
    const expr = allowed[groupBy] || '"union"';
    return many(`
        SELECT ${expr} AS name,
               COUNT(*) AS total_voters,
               COUNT(*) FILTER (WHERE status = 'Visited') AS visited,
               COUNT(*) FILTER (WHERE gender = 'Male')   AS male,
               COUNT(*) FILTER (WHERE gender = 'Female') AS female
          FROM voters
         GROUP BY ${expr}
         ORDER BY name
    `);
}

async function markVisited(voterId) {
    await one(`UPDATE voters SET status = 'Visited', updated_at = NOW() WHERE voter_id = $1 RETURNING voter_id`, [voterId]);
}

module.exports = {
    findById,
    findBySosVid,
    search,
    byVillage,
    byVoterArea,
    byVoterAreas,
    listVoterAreas,
    voterAreaStats,
    aggregatedStatistics,
    markVisited,
};
