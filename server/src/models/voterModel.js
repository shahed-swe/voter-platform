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

async function findByFilters(candidateId, { filters = {}, specs = [], status, search, searchBn = null, limit = 500, offset = 0, politicalCandidateId = null, statsOnly = false, buildingFeatureId = null } = {}) {
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

    // Search is a scope filter (applies to both list + stats). `searchBn` is the
    // Avro-phonetic transliteration of a Latin query — matched against the Bangla
    // name so a canvasser can type English and find Bangla voters (#11).
    if (search || searchBn) {
        const parts = [];
        if (search) {
            params.push(`%${search}%`);
            const s = params.length;
            parts.push(`v.name ILIKE $${s} OR v.sos_vid ILIKE $${s} OR v.address ILIKE $${s}`);
        }
        if (searchBn) {
            params.push(`%${searchBn}%`);
            parts.push(`v.name ILIKE $${params.length}`);
        }
        where.push(`(${parts.join(' OR ')})`);
    }

    // Canvass status is ALWAYS derived from the canvassing table (never the shared
    // voters.status column, which isn't maintained once a constituency has multiple
    // political candidates), scoped to the active political candidate — or, when
    // none is set (super-admin), any canvass in the constituency.
    params.push(politicalCandidateId);      // may be null → "any political candidate"
    const pcIdx = params.length;

    // Building filter — only voters with a canvass at this geo building (the
    // "show only this building's voters" toggle after a building is selected).
    if (buildingFeatureId) {
        params.push(String(buildingFeatureId));
        where.push(`EXISTS (
            SELECT 1 FROM canvassing cb
             WHERE cb.voter_id = v.voter_id
               AND cb.candidate_id = $1
               AND ($${pcIdx}::bigint IS NULL OR cb.political_candidate_id = $${pcIdx})
               AND cb.building_feature_id = $${params.length})`);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    i = params.length + 1;

    // Fast stats: a plain voter COUNT for the total, plus a small DISTINCT-ON over
    // the (tiny) canvassing table for visited/follow-up — instead of a LATERAL over
    // every voter. The status TAB does NOT affect stats (they show the full breakdown).
    const statsSql = `
        WITH latest AS (
            SELECT DISTINCT ON (c.voter_id) c.voter_id, c.follow_up_needed
              FROM canvassing c
              JOIN voters v ON v.voter_id = c.voter_id
              ${whereSql}
               AND c.candidate_id = $1
               AND ($${pcIdx}::bigint IS NULL OR c.political_candidate_id = $${pcIdx})
             ORDER BY c.voter_id, c.canvass_date DESC
        )
        SELECT (SELECT COUNT(*) FROM voters v ${whereSql})::int          AS total,
               (SELECT COUNT(*) FROM latest WHERE NOT follow_up_needed)::int AS visited,
               (SELECT COUNT(*) FROM latest WHERE follow_up_needed)::int     AS follow_up`;

    const statsP = one(statsSql, params).then((r) => ({
        total:       r?.total || 0,
        visited:     r?.visited || 0,
        follow_up:   r?.follow_up || 0,
        not_visited: Math.max(0, (r?.total || 0) - (r?.visited || 0) - (r?.follow_up || 0)),
    }));

    if (statsOnly) {
        return { voters: [], stats: await statsP };
    }

    // The list DOES honour the status tab. A LATERAL gives each row its latest
    // canvass; the tab filters on it. The list is always scope-limited (a ward/area),
    // so the LATERAL runs over a small set.
    const canvassJoin = `LEFT JOIN LATERAL (
        SELECT c.canvass_id, c.follow_up_needed, c.latitude, c.longitude
          FROM canvassing c
         WHERE c.voter_id = v.voter_id
           AND c.candidate_id = $1
           AND ($${pcIdx}::bigint IS NULL OR c.political_candidate_id = $${pcIdx})
         ORDER BY c.canvass_date DESC
         LIMIT 1
    ) pc ON true`;

    let listWhere = whereSql;
    if (status === 'Visited')            listWhere += ` AND pc.canvass_id IS NOT NULL AND pc.follow_up_needed = false`;
    else if (status === 'Not visited')   listWhere += ` AND pc.canvass_id IS NULL`;
    else if (status === 'Follow-up needed') listWhere += ` AND pc.follow_up_needed = true`;

    const [voters, stats] = await Promise.all([
        many(
            `SELECT v.voter_id, v.sos_vid, v.name, v.father_husband, v.age, v.gender,
                    v.ward, v.voter_area_name, v.voter_area_code, v.address, v.status,
                    (pc.canvass_id IS NOT NULL) AS has_canvass,
                    pc.follow_up_needed AS canvass_follow_up,
                    pc.latitude  AS canvass_latitude,
                    pc.longitude AS canvass_longitude
               FROM voters v ${canvassJoin}
               ${listWhere}
               ORDER BY (v.name = '(no name)')::int, v.name
               LIMIT $${i} OFFSET $${i + 1}`,
            [...params, limit, offset]
        ),
        statsP,
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

/** Distinct ward values (Bengali) for a candidate, with voter counts. For multi-select nav. */
async function geoWardOptions(candidateId) {
    return many(
        `SELECT ward AS value, COUNT(*)::int AS count
           FROM voters
          WHERE candidate_id = $1 AND ward IS NOT NULL AND ward <> ''
          GROUP BY ward
          ORDER BY (regexp_replace(ward, '[^0-9০-৯]', '', 'g'))::text, ward`,
        [candidateId]
    );
}

/**
 * Distinct voter_area_name values for a candidate, optionally within given wards.
 * Each area also carries the geo village + ward feature_id it maps to (from the
 * curated voter_area_geo_map), so the map can drill straight to that area's
 * buildings. village_feature_id is null for areas with no distinct polygon.
 */
async function geoAreaOptions(candidateId, wards) {
    const params = [candidateId];
    let wardClause = '';
    if (wards?.length) { params.push(wards); wardClause = `AND v.ward = ANY($2)`; }
    return many(
        `SELECT v.voter_area_name AS value,
                COUNT(*)::int AS count,
                m.village_feature_id,
                m.ward_feature_id
           FROM voters v
           LEFT JOIN voter_area_geo_map m
                  ON m.candidate_id = v.candidate_id
                 AND m.voter_area_name = v.voter_area_name
          WHERE v.candidate_id = $1 AND v.voter_area_name IS NOT NULL AND v.voter_area_name <> '' ${wardClause}
          GROUP BY v.voter_area_name, m.village_feature_id, m.ward_feature_id
          ORDER BY v.voter_area_name`,
        params
    );
}

module.exports = {
    findById,
    findBySosVid,
    search,
    geoWardOptions,
    geoAreaOptions,
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
