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
                voter_area_name, status
           FROM voters
          WHERE clean_voter_area = $1
          ORDER BY name
          LIMIT $2 OFFSET $3`,
        [voterArea, limit, offset]
    );
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
    listVoterAreas,
    voterAreaStats,
    aggregatedStatistics,
    markVisited,
};
