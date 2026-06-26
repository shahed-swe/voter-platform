const { one, many } = require('../db/pool');

// Every function takes `candidateId` as its first parameter and adds it to
// the WHERE clause. Forgetting to pass it would mean a row from the wrong
// candidate could be read — that's the boundary we're enforcing.

async function findById(candidateId, voterId) {
    return one(
        `SELECT * FROM voters WHERE candidate_id = $1 AND voter_id = $2`,
        [candidateId, voterId]
    );
}

async function findBySosVid(candidateId, sosVid) {
    return one(
        `SELECT * FROM voters WHERE candidate_id = $1 AND sos_vid = $2`,
        [candidateId, sosVid]
    );
}

async function search(candidateId, query, { limit = 50 } = {}) {
    return many(
        `SELECT voter_id, sos_vid, name, father_husband, age, gender, ward,
                voter_area_name, village_csv, village_id, status
           FROM voters
          WHERE candidate_id = $1
            AND (name ILIKE $2 OR sos_vid ILIKE $2 OR father_husband ILIKE $2)
          ORDER BY name
          LIMIT $3`,
        [candidateId, `%${query}%`, limit]
    );
}

async function byVillage(candidateId, villageId, { limit = 1000, offset = 0 } = {}) {
    return many(
        `SELECT voter_id, sos_vid, name, father_husband, mother, age, gender, ward,
                voter_area_name, status, address
           FROM voters
          WHERE candidate_id = $1 AND village_id = $2
          ORDER BY name
          LIMIT $3 OFFSET $4`,
        [candidateId, villageId, limit, offset]
    );
}

async function byVoterArea(candidateId, voterArea, { limit = 1000, offset = 0 } = {}) {
    return many(
        `SELECT voter_id, sos_vid, name, father_husband, age, gender, ward,
                voter_area_name, status, address
           FROM voters
          WHERE candidate_id = $1
            AND COALESCE(clean_voter_area, voter_area_name) = $2
          ORDER BY name
          LIMIT $3 OFFSET $4`,
        [candidateId, voterArea, limit, offset]
    );
}

async function byVoterAreas(candidateId, { areas, status, search, limit = 500, offset = 0 } = {}) {
    if (!areas?.length) {
        return { voters: [], stats: { total: 0, visited: 0, not_visited: 0, follow_up: 0 } };
    }

    const where = [`v.candidate_id = $1`, `v.voter_area_name = ANY($2)`];
    const params = [candidateId, areas];
    let i = 3;

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
                    v.ward, v.voter_area_name, v.voter_area_code, v.address, v.status,
                    EXISTS (
                        SELECT 1 FROM canvassing c
                         WHERE c.voter_id = v.voter_id AND c.candidate_id = $1
                    ) AS has_canvass
               FROM voters v
               ${whereSql}
               ORDER BY (v.name = '(no name)')::int, v.name
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
               WHERE v.candidate_id = $1 AND v.voter_area_name = ANY($2)`,
            [candidateId, areas]
        ),
    ]);

    return { voters, stats };
}

/**
 * Distinct voter_area_names for a candidate, optionally scoped to a ward.
 * Used to populate the voter-area picker when the user has drilled to ward level.
 */
async function listVoterAreasByScope(candidateId, { ward } = {}) {
    const where  = ['candidate_id = $1', "voter_area_name IS NOT NULL", "voter_area_name <> ''"];
    const params = [candidateId];
    if (ward) {
        params.push(Array.isArray(ward) ? ward : [ward]);
        where.push(`ward = ANY($${params.length})`);
    }
    return many(
        `SELECT voter_area_name, COUNT(*)::int AS voter_count
           FROM voters
          WHERE ${where.join(' AND ')}
          GROUP BY voter_area_name
          ORDER BY voter_count DESC`,
        params
    );
}

async function listVoterAreas(candidateId) {
    return many(
        `SELECT DISTINCT clean_voter_area AS voter_area, COUNT(*) AS voter_count
           FROM voters
          WHERE candidate_id = $1 AND clean_voter_area IS NOT NULL
          GROUP BY clean_voter_area
          ORDER BY clean_voter_area`,
        [candidateId]
    );
}

async function voterAreaStats(candidateId, voterArea) {
    return one(
        `SELECT COUNT(*) AS total_voters,
                COUNT(*) FILTER (WHERE status = 'Visited') AS visited,
                COUNT(*) FILTER (WHERE gender = 'Male')    AS male,
                COUNT(*) FILTER (WHERE gender = 'Female')  AS female
           FROM voters
          WHERE candidate_id = $1
            AND COALESCE(clean_voter_area, voter_area_name) = $2`,
        [candidateId, voterArea]
    );
}

async function aggregatedStatistics(candidateId, { groupBy = 'union' } = {}) {
    const allowed = { upazila: 'upazila', union: '"union"', voter_area: 'clean_voter_area' };
    const expr = allowed[groupBy] || '"union"';
    return many(
        `SELECT ${expr} AS name,
                COUNT(*) AS total_voters,
                COUNT(*) FILTER (WHERE status = 'Visited') AS visited,
                COUNT(*) FILTER (WHERE gender = 'Male')   AS male,
                COUNT(*) FILTER (WHERE gender = 'Female') AS female
           FROM voters
          WHERE candidate_id = $1
          GROUP BY ${expr}
          ORDER BY name`,
        [candidateId]
    );
}

async function markVisited(candidateId, voterId) {
    await one(
        `UPDATE voters
            SET status = 'Visited', updated_at = NOW()
          WHERE candidate_id = $1 AND voter_id = $2
       RETURNING voter_id`,
        [candidateId, voterId]
    );
}

/**
 * Generic voter filter — accepts a `filters` map keyed by the candidate's
 * filter_config keys. Each key resolves to one of:
 *   • a column on voters (direct match)
 *   • a column on villages (we join via voters.village_id)
 * The villages-side fields are used as the canonical "English" source of
 * truth — voters.upazila / "union" in panchagar are sometimes stored in
 * Bengali and don't match the values returned by /api/filter-options.
 */
const FILTERS = {
    upazila:    { via: 'villages',  col: 'upazila' },
    union:      { via: 'villages',  col: 'union'   },
    mauza:      { via: 'villages',  col: 'mauza'   },
    village:    { via: 'voters',    col: 'village_id' },
    voter_area: { via: 'voters',    col: 'voter_area_name' },
    ward:       { via: 'voters',    col: 'ward' },          // dhaka13 voters store ward_number
};

async function findByFilters(candidateId, { filters = {}, specs = [], status, search, limit = 500, offset = 0, politicalCandidateId = null } = {}) {
    const where  = ['v.candidate_id = $1'];
    const params = [candidateId];
    let i = 2;

    // Index the candidate's filter_config by key so we can resolve dynamic
    // (attribute-backed) filters that aren't in the hardcoded FILTERS map.
    const specByKey = {};
    for (const s of specs || []) specByKey[s.key] = s;

    for (const [key, value] of Object.entries(filters || {})) {
        const empty = value == null || value === '' || (Array.isArray(value) && value.length === 0);
        if (empty) continue;
        const arr = Array.isArray(value) ? value : [value];

        const dyn = specByKey[key];
        if (dyn && dyn.source === 'voters_attr' && dyn.value_col) {
            // attributes->>'<key>' = ANY(values). Attribute name is bound, not interpolated.
            params.push(dyn.value_col);
            const keyIdx = params.length;
            params.push(arr);
            where.push(`v.attributes->>$${keyIdx} = ANY($${params.length})`);
            i = params.length + 1;
            continue;
        }

        const spec = FILTERS[key];
        if (!spec) continue;     // unknown key — controller should already have rejected
        if (spec.via === 'voters') {
            params.push(arr);
            const col = spec.col === 'union' ? `v."union"` : `v.${spec.col}`;
            where.push(`${col} = ANY($${params.length})`);
        } else {
            params.push(arr);
            const col = spec.col === 'union' ? `"union"` : spec.col;
            where.push(
                `v.village_id IN (SELECT village_id FROM villages
                                   WHERE candidate_id = $1 AND ${col} = ANY($${params.length}))`
            );
        }
        i = params.length + 1;
    }

    // When a political candidate is scoped, map status filter to canvassing-based logic.
    // Otherwise fall back to voters.status (single-candidate or super-admin contexts).
    let canvassJoin = '';
    if (politicalCandidateId) {
        params.push(politicalCandidateId);
        const pcIdx = params.length;
        canvassJoin = `LEFT JOIN canvassing pc
            ON pc.voter_id = v.voter_id
           AND pc.candidate_id = $1
           AND pc.political_candidate_id = $${pcIdx}`;

        if (status === 'Visited') {
            where.push(`pc.canvass_id IS NOT NULL AND pc.follow_up_needed = false`);
        } else if (status === 'Not visited') {
            where.push(`pc.canvass_id IS NULL`);
        } else if (status === 'Follow-up needed') {
            where.push(`pc.follow_up_needed = true`);
        }
        i = params.length + 1;
    } else {
        if (status) {
            params.push(status);
            where.push(`v.status = $${i++}`);
        }
    }

    if (search) {
        params.push(`%${search}%`);
        where.push(`(v.name ILIKE $${i} OR v.sos_vid ILIKE $${i} OR v.address ILIKE $${i})`);
        i++;
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;

    // Per-political-candidate has_canvass and stats come from the canvassing join.
    // Without isolation we use the legacy voters.status column.
    const hasCanvassSql = politicalCandidateId
        ? `pc.canvass_id IS NOT NULL`
        : `EXISTS (SELECT 1 FROM canvassing c WHERE c.voter_id = v.voter_id AND c.candidate_id = $1)`;

    const statsSql = politicalCandidateId
        ? `SELECT COUNT(*)::int                                                          AS total,
                  COUNT(*) FILTER (WHERE pc.canvass_id IS NOT NULL
                                     AND pc.follow_up_needed = false)::int              AS visited,
                  COUNT(*) FILTER (WHERE pc.canvass_id IS NULL)::int                   AS not_visited,
                  COUNT(*) FILTER (WHERE pc.follow_up_needed = true)::int              AS follow_up
             FROM voters v ${canvassJoin} ${whereSql}`
        : `SELECT COUNT(*)::int                                              AS total,
                  COUNT(*) FILTER (WHERE v.status = 'Visited')::int          AS visited,
                  COUNT(*) FILTER (WHERE v.status = 'Not visited')::int      AS not_visited,
                  COUNT(*) FILTER (WHERE v.status = 'Follow-up needed')::int AS follow_up
             FROM voters v ${whereSql}`;

    const [voters, stats] = await Promise.all([
        many(
            `SELECT v.voter_id, v.sos_vid, v.name, v.father_husband, v.age, v.gender,
                    v.ward, v.voter_area_name, v.voter_area_code, v.address, v.status,
                    (${hasCanvassSql}) AS has_canvass
               FROM voters v ${canvassJoin}
               ${whereSql}
               ORDER BY (v.name = '(no name)')::int, v.name
               LIMIT $${i} OFFSET $${i + 1}`,
            [...params, limit, offset]
        ),
        one(statsSql, params),
    ]);

    return { voters, stats };
}

/**
 * Distinct attribute keys present on this candidate's voters, with how many
 * distinct values each has + 3 sample values. Powers the filter designer so an
 * operator can turn any voter column into a left-panel filter without
 * re-uploading. Heavy text columns (names, addresses) are included but a high
 * distinct count signals they're poor filter candidates.
 */
async function attributeKeys(candidateId, { sampleLimit = 3 } = {}) {
    return many(
        `SELECT k AS key,
                COUNT(DISTINCT v.attributes->>k) AS distinct_values,
                (array_agg(DISTINCT v.attributes->>k))[1:$2] AS samples
           FROM voters v, jsonb_object_keys(v.attributes) k
          WHERE v.candidate_id = $1 AND v.attributes->>k IS NOT NULL AND v.attributes->>k <> ''
          GROUP BY k
          ORDER BY distinct_values ASC`,
        [candidateId, sampleLimit]
    );
}

module.exports = {
    findById,
    findBySosVid,
    search,
    byVillage,
    byVoterArea,
    byVoterAreas,
    findByFilters,
    listVoterAreas,
    voterAreaStats,
    aggregatedStatistics,
    attributeKeys,
    markVisited,
};
