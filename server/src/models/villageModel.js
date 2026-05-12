const { one, many } = require('../db/pool');

async function findById(villageId) {
    return one(`SELECT * FROM villages WHERE village_id = $1`, [villageId]);
}

async function listFilters() {
    const [upazilas, unions, mauzas] = await Promise.all([
        many(`SELECT DISTINCT upazila FROM villages WHERE upazila IS NOT NULL ORDER BY upazila`),
        many(`SELECT DISTINCT "union" AS u FROM villages WHERE "union" IS NOT NULL ORDER BY "union"`),
        many(`SELECT DISTINCT mauza FROM villages WHERE mauza IS NOT NULL ORDER BY mauza`),
    ]);
    return {
        upazilas: upazilas.map((r) => r.upazila),
        unions: unions.map((r) => r.u),
        mauzas: mauzas.map((r) => r.mauza),
    };
}

async function listWithFilters({ upazila, union, mauza, limit = 1000, offset = 0 } = {}) {
    const where = [];
    const params = [];
    if (upazila) {
        params.push(upazila);
        where.push(`upazila = $${params.length}`);
    }
    if (union) {
        params.push(union);
        where.push(`"union" = $${params.length}`);
    }
    if (mauza) {
        params.push(mauza);
        where.push(`mauza = $${params.length}`);
    }
    params.push(limit, offset);
    return many(
        `SELECT village_id, district, upazila, "union" AS union_name, mauza,
                village_name, total_population, male_count, female_count, male_pct, female_pct
           FROM villages
           ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
           ORDER BY village_name
           LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
    );
}

async function geometryFor(villageIds) {
    if (!villageIds?.length) return [];
    return many(
        `SELECT village_id, village_name, geometry FROM villages WHERE village_id = ANY($1)`,
        [villageIds]
    );
}

async function statsOverview() {
    const row = await one(`
        SELECT
            COUNT(*)                            AS total_villages,
            COALESCE(SUM(total_population), 0)  AS total_population,
            COALESCE(SUM(male_count), 0)        AS total_males,
            COALESCE(SUM(female_count), 0)      AS total_females
          FROM villages
    `);
    return row;
}

async function withVoterCounts({ regionFilterSql, regionFilterParams = [] } = {}) {
    const sql = `
        SELECT vil.village_id, vil.village_name, vil.upazila, vil."union" AS union_name, vil.mauza,
               vil.total_population,
               COUNT(v.voter_id)                                             AS voter_count,
               COUNT(*) FILTER (WHERE v.status = 'Visited')                  AS visited_count
          FROM villages vil
          LEFT JOIN voters v ON v.village_id = vil.village_id
        ${regionFilterSql ? 'WHERE ' + regionFilterSql : ''}
         GROUP BY vil.village_id
         ORDER BY vil.village_name
    `;
    return many(sql, regionFilterParams);
}

module.exports = { findById, listFilters, listWithFilters, geometryFor, statsOverview, withVoterCounts };
