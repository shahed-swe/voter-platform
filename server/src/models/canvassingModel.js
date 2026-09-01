const { query, one, many, withTransaction } = require('../db/pool');
const { pointInGeometry, geometryBboxCenter, metersBetween } = require('../utils/geometry');

// Every read below is scoped to (constituency, political candidate). When
// politicalCandidateId is null (super-admin or single-candidate constituency)
// the `$N IS NULL OR ...` guard makes the filter a no-op so all rows show.

async function findById(candidateId, canvassId, politicalCandidateId = null) {
    return one(
        `SELECT * FROM canvassing
          WHERE candidate_id = $1 AND canvass_id = $2
            AND ($3::bigint IS NULL OR political_candidate_id = $3)`,
        [candidateId, canvassId, politicalCandidateId]
    );
}

async function historyForVoter(candidateId, voterId, politicalCandidateId = null) {
    return many(
        `SELECT c.*, u.name AS canvasser_name, u.username
           FROM canvassing c
           JOIN users u ON u.user_id = c.user_id
          WHERE c.candidate_id = $1 AND c.voter_id = $2
            AND ($3::bigint IS NULL OR c.political_candidate_id = $3)
          ORDER BY c.canvass_date DESC`,
        [candidateId, voterId, politicalCandidateId]
    );
}

async function locationsByVillage(candidateId, villageId, politicalCandidateId = null) {
    return many(
        `SELECT c.canvass_id, c.voter_id, c.latitude, c.longitude, c.support_rating,
                c.support_level, c.canvass_date, v.name AS voter_name
           FROM canvassing c
           JOIN voters v ON v.voter_id = c.voter_id
          WHERE c.candidate_id = $1
            AND v.village_id = $2
            AND ($3::bigint IS NULL OR c.political_candidate_id = $3)
            AND c.latitude IS NOT NULL
            AND c.longitude IS NOT NULL`,
        [candidateId, villageId, politicalCandidateId]
    );
}

async function allLocations(candidateId, { limit = 5000, politicalCandidateId = null } = {}) {
    return many(
        `SELECT canvass_id, voter_id, latitude, longitude, support_rating, support_level, canvass_date
           FROM canvassing
          WHERE candidate_id = $1
            AND ($3::bigint IS NULL OR political_candidate_id = $3)
            AND latitude IS NOT NULL AND longitude IS NOT NULL
          ORDER BY canvass_date DESC
          LIMIT $2`,
        [candidateId, limit, politicalCandidateId]
    );
}

/**
 * Latest canvassed location per voter within a ward / voter-area scope — powers
 * the "all located voters as pins" map layer on the canvassing page. Null wards /
 * voterAreas mean "no restriction on that axis".
 */
async function voterLocationsByScope(candidateId, { wards = null, voterAreas = null, politicalCandidateId = null, limit = 5000 } = {}) {
    return many(
        `SELECT DISTINCT ON (c.voter_id)
                c.voter_id, c.follow_up_needed, c.support_level, c.canvass_date,
                c.latitude  AS canvass_latitude,
                c.longitude AS canvass_longitude,
                v.name, v.sos_vid, v.father_husband, v.age, v.gender,
                v.ward, v.voter_area_name, v.voter_area_code, v.address
           FROM canvassing c
           JOIN voters v ON v.voter_id = c.voter_id
          WHERE c.candidate_id = $1
            AND ($2::bigint IS NULL OR c.political_candidate_id = $2)
            AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL
            AND ($3::text[] IS NULL OR v.ward = ANY($3::text[]))
            AND ($4::text[] IS NULL OR v.voter_area_name = ANY($4::text[]))
          ORDER BY c.voter_id, c.canvass_date DESC
          LIMIT $5`,
        [candidateId, politicalCandidateId, wards, voterAreas, limit]
    );
}

async function listVoterRecords(candidateId, { limit = 200, offset = 0, search = null, politicalCandidateId = null, userId = null } = {}) {
    const params = [candidateId, politicalCandidateId];
    let searchClause = '';
    if (search) {
        params.push(`%${search}%`);
        searchClause = `AND (v.name ILIKE $${params.length} OR v.sos_vid ILIKE $${params.length})`;
    }
    // Volunteers only review their OWN submissions in the survey list.
    if (userId != null) {
        params.push(userId);
        searchClause += ` AND c.user_id = $${params.length}`;
    }
    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;
    return many(
        `SELECT c.*, v.name AS voter_name, v.sos_vid, v.voter_area_name, v.ward,
                u.name AS canvasser_name
           FROM canvassing c
           JOIN voters v ON v.voter_id = c.voter_id
           JOIN users u ON u.user_id = c.user_id
          WHERE c.candidate_id = $1
            AND ($2::bigint IS NULL OR c.political_candidate_id = $2)
            ${searchClause}
          ORDER BY c.canvass_date DESC
          LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        params
    );
}

/**
 * All survey records belonging to a PARTY — i.e. canvasses whose campaign
 * (political_candidate_id) is a candidate registered by that party — across
 * every constituency. Powers the Political Admin's party-wide survey view;
 * strict party isolation comes from the user_candidates.party_id join.
 */
async function partyRecords(partyIds, { limit = 50, offset = 0, search = null, politicalCandidateId = null } = {}) {
    const params = [partyIds];
    let searchClause = '';
    if (search) {
        params.push(`%${search}%`);
        searchClause = `AND (v.name ILIKE $${params.length} OR v.sos_vid ILIKE $${params.length} OR u.name ILIKE $${params.length})`;
    }
    // Drill-down to one candidate's campaign (the party join above still
    // guarantees that candidate belongs to the party).
    if (politicalCandidateId != null) {
        params.push(politicalCandidateId);
        searchClause += ` AND c.political_candidate_id = $${params.length}`;
    }
    const base = `
       FROM canvassing c
       JOIN voters v      ON v.voter_id = c.voter_id
       JOIN users u       ON u.user_id = c.user_id
       JOIN users pcu     ON pcu.user_id = c.political_candidate_id
       JOIN candidates cd ON cd.candidate_id = c.candidate_id
      WHERE EXISTS (
          SELECT 1 FROM user_candidates uc
           WHERE uc.user_id = c.political_candidate_id
             AND uc.role = 'candidate'
             AND uc.party_id = ANY($1)
      ) ${searchClause}`;

    const totalRow = await one(`SELECT COUNT(*)::int AS total ${base}`, params);
    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;
    const records = await many(
        `SELECT c.canvass_id, c.voter_id, c.support_level, c.support_rating,
                c.follow_up_needed, c.issues_concerns, c.canvass_date,
                v.name AS voter_name, v.sos_vid, v.ward, v.voter_area_name,
                u.name AS canvasser_name,
                pcu.name AS candidate_name, pcu.user_id AS candidate_user_id,
                cd.name AS constituency_name, cd.candidate_id
           ${base}
          ORDER BY c.canvass_date DESC
          LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        params
    );
    return { records, total: totalRow?.total || 0 };
}

/**
 * The full visit timeline of ONE voter within a party (§10): every canvass —
 * any volunteer, any of the party's candidates, any date. Only the Political
 * Admin reads this (the per-campaign /history endpoint stays campaign-scoped).
 */
async function partyVoterHistory(partyIds, voterId) {
    return many(
        `SELECT c.canvass_id, c.canvass_date, c.support_level, c.support_rating,
                c.is_undecided, c.follow_up_needed, c.issues_concerns,
                u.name AS canvasser_name,
                pcu.name AS candidate_name,
                cd.name AS constituency_name,
                v.name AS voter_name, v.sos_vid, v.ward, v.voter_area_name
           FROM canvassing c
           JOIN voters v  ON v.voter_id = c.voter_id
           JOIN users u   ON u.user_id = c.user_id
           LEFT JOIN users pcu ON pcu.user_id = c.political_candidate_id
           JOIN candidates cd ON cd.candidate_id = c.candidate_id
          WHERE c.voter_id = $2
            AND EXISTS (
                SELECT 1 FROM user_candidates uc
                 WHERE uc.user_id = c.political_candidate_id
                   AND uc.role = 'candidate' AND uc.party_id = ANY($1))
          ORDER BY c.canvass_date ASC`,
        [partyIds, voterId]
    );
}

/**
 * Main-admin cross-party timeline: every canvass of this voter's row PLUS
 * canvasses on OTHER voter rows carrying the same voter number (sos_vid) —
 * two parties import the same roll separately, so the same physical voter
 * exists once per party's constituency row. Best-effort: rolls without a
 * voter number can't be matched across parties.
 */
async function crossPartyVoterHistory(voterId) {
    return many(
        `WITH target AS (SELECT voter_id, sos_vid FROM voters WHERE voter_id = $1)
         SELECT c.canvass_id, c.canvass_date, c.support_level, c.support_rating,
                c.is_undecided, c.follow_up_needed, c.issues_concerns,
                u.name AS canvasser_name,
                pcu.name AS candidate_name,
                cd.name AS constituency_name,
                p.name AS party_name,
                v.name AS voter_name, v.sos_vid, v.ward, v.voter_area_name
           FROM canvassing c
           JOIN voters v ON v.voter_id = c.voter_id
           JOIN target t ON (v.voter_id = t.voter_id
                             OR (t.sos_vid IS NOT NULL AND t.sos_vid <> '' AND v.sos_vid = t.sos_vid))
           JOIN users u ON u.user_id = c.user_id
           LEFT JOIN users pcu ON pcu.user_id = c.political_candidate_id
           LEFT JOIN user_candidates uc
             ON uc.user_id = c.political_candidate_id AND uc.role = 'candidate'
            AND uc.candidate_id = c.candidate_id
           LEFT JOIN parties p ON p.party_id = uc.party_id
           JOIN candidates cd ON cd.candidate_id = c.candidate_id
          ORDER BY c.canvass_date ASC`,
        [voterId]
    );
}

/**
 * Persuadable voters (§10): visited MORE than once with a CHANGED answer
 * between visits. A voter whose stated preference shifts is persuadable; one
 * whose answer never changes is not.
 *
 * partyIds = the Political Admin's party scope; NULL = the Main Admin's
 * cross-party view (every campaign, with the parties involved per voter).
 */
async function partyPersuadable(partyIds, { limit = 50, offset = 0 } = {}) {
    const base = `
       FROM canvassing c
       JOIN voters v ON v.voter_id = c.voter_id
       LEFT JOIN user_candidates ucx
         ON ucx.user_id = c.political_candidate_id AND ucx.role = 'candidate'
        AND ucx.candidate_id = c.candidate_id
       LEFT JOIN parties p ON p.party_id = ucx.party_id
      WHERE ($1::text[] IS NULL OR EXISTS (
            SELECT 1 FROM user_candidates uc
             WHERE uc.user_id = c.political_candidate_id
               AND uc.role = 'candidate' AND uc.party_id = ANY($1)))
      GROUP BY c.voter_id, v.name, v.sos_vid, v.ward, v.voter_area_name, c.candidate_id
     HAVING COUNT(*) > 1
        AND (COUNT(DISTINCT c.support_level) > 1 OR COUNT(DISTINCT c.support_rating) > 1)`;

    const totalRow = await one(
        `SELECT COUNT(*)::int AS total FROM (SELECT c.voter_id ${base}) t`,
        [partyIds]
    );
    const records = await many(
        `SELECT c.voter_id, v.name AS voter_name, v.sos_vid, v.ward, v.voter_area_name,
                c.candidate_id,
                (SELECT cd.name FROM candidates cd WHERE cd.candidate_id = c.candidate_id) AS constituency_name,
                COUNT(*)::int AS visits,
                MIN(c.canvass_date) AS first_visit,
                MAX(c.canvass_date) AS last_visit,
                array_agg(c.support_level ORDER BY c.canvass_date) AS support_journey,
                array_agg(c.support_rating ORDER BY c.canvass_date) AS rating_journey,
                array_agg(DISTINCT p.name) FILTER (WHERE p.name IS NOT NULL) AS parties
           ${base}
          ORDER BY MAX(c.canvass_date) DESC
          LIMIT $2 OFFSET $3`,
        [partyIds, limit, offset]
    );
    return { records, total: totalRow?.total || 0 };
}

/**
 * Per-candidate survey aggregates for a party — one row per candidate the
 * party has registered (zero-canvass candidates included), so the Political
 * Admin's overview can show real numbers next to every candidate.
 */
async function partyStats(partyIds) {
    return many(
        `SELECT pcu.user_id AS candidate_user_id,
                pcu.name    AS candidate_name,
                COUNT(cv.canvass_id)::int                                        AS total,
                COUNT(DISTINCT cv.voter_id)::int                                 AS unique_voters,
                COUNT(cv.canvass_id) FILTER (WHERE cv.support_rating >= 4)::int  AS strong_support,
                COUNT(cv.canvass_id) FILTER (WHERE cv.follow_up_needed)::int     AS follow_up,
                MAX(cv.canvass_date)                                             AS last_canvass
           FROM user_candidates uc
           JOIN users pcu ON pcu.user_id = uc.user_id
           LEFT JOIN canvassing cv ON cv.political_candidate_id = uc.user_id
          WHERE uc.role = 'candidate' AND uc.party_id = ANY($1)
          GROUP BY pcu.user_id, pcu.name
          ORDER BY total DESC, pcu.name`,
        [partyIds]
    );
}

async function stats(candidateId, politicalCandidateId = null, userId = null) {
    return one(
        `SELECT
            COUNT(*)                                                     AS total_canvasses,
            COUNT(DISTINCT voter_id)                                     AS unique_voters,
            COUNT(*) FILTER (WHERE support_rating >= 4)                  AS strong_support,
            COUNT(*) FILTER (WHERE support_rating <= 2)                  AS weak_support,
            COUNT(*) FILTER (WHERE is_undecided)                         AS undecided,
            COUNT(*) FILTER (WHERE follow_up_needed)                     AS follow_up
           FROM canvassing
          WHERE candidate_id = $1
            AND ($2::bigint IS NULL OR political_candidate_id = $2)
            AND ($3::bigint IS NULL OR user_id = $3)`,
        [candidateId, politicalCandidateId, userId]
    );
}

// ── GPS → building auto-snap ────────────────────────────────────────────────
// No PostGIS: candidate buildings come from a centroid bounding-box query and
// the exact match is decided in JS (point-in-polygon over the GeoJSON footprint,
// else nearest building within SNAP_MAX_METERS).

const SNAP_MAX_METERS = 50; // typical urban GPS error; beyond this, don't guess

async function matchBuildingByPoint(client, candidateId, lat, lng) {
    // ±0.0012° ≈ 130 m box around the fix — wide enough that a large footprint's
    // centroid still falls inside even when the fix is near the building's edge.
    const { rows } = await client.query(
        `SELECT feature_id, latitude, longitude, geometry
           FROM geo_layers
          WHERE candidate_id = $1 AND layer_key = 'building'
            AND latitude  BETWEEN $2 - 0.0012 AND $2 + 0.0012
            AND longitude BETWEEN $3 - 0.0012 AND $3 + 0.0012`,
        [candidateId, lat, lng]
    );
    let best = null;
    for (const row of rows) {
        const center = geometryBboxCenter(row.geometry) ||
            (Number.isFinite(row.latitude) ? [row.latitude, row.longitude] : null);
        if (!center) continue;
        const contains = pointInGeometry(lng, lat, row.geometry);
        const dist = metersBetween(lat, lng, center[0], center[1]);
        if (!contains && dist > SNAP_MAX_METERS) continue;
        // Containment always beats proximity; among equals, nearest center wins.
        if (!best || (contains && !best.contains) || (contains === best.contains && dist < best.dist)) {
            best = { feature_id: row.feature_id, center, contains, dist };
        }
    }
    return best;
}

async function submit(candidateId, { voterId, userId, politicalCandidateId, payload }) {
    return withTransaction(async (client) => {
        // Volunteer surveyed without picking a building on the map: attach the
        // canvass to the building at their GPS fix, and snap the coordinates to
        // that building's center so the voter's pin lands on it like a
        // click-selected building would.
        const lat = Number(payload.latitude);
        const lng = Number(payload.longitude);
        if (!payload.building_feature_id && Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
            const hit = await matchBuildingByPoint(client, candidateId, lat, lng);
            if (hit) {
                payload = {
                    ...payload,
                    building_feature_id: hit.feature_id,
                    latitude: hit.center[0],
                    longitude: hit.center[1],
                };
            }
        }
        const insert = await client.query(
            `INSERT INTO canvassing (
                candidate_id, political_candidate_id,
                voter_id, user_id, support_level, contact_phone, contact_email,
                issues_concerns, household_size, income_bracket,
                follow_up_needed, follow_up_date,
                latitude, longitude, location_verified,
                support_rating, is_undecided, source, voter_member_count, is_minority,
                floor_number, flat_number, building_name, address, building_id,
                building_feature_id
            ) VALUES (
                $1, $2,
                $3, $4, $5, $6, $7,
                $8, $9, $10,
                $11, $12,
                $13, $14, $15,
                $16, $17, $18, $19, $20,
                $21, $22, $23, $24, $25,
                $26
            )
            RETURNING *`,
            [
                candidateId, politicalCandidateId || null,
                voterId, userId, payload.support_level || 'Unknown',
                payload.contact_phone || null, payload.contact_email || null,
                payload.issues_concerns || null,
                payload.household_size || null, payload.income_bracket || null,
                !!payload.follow_up_needed, payload.follow_up_date || null,
                payload.latitude || null, payload.longitude || null, !!payload.location_verified,
                payload.support_rating || null, !!payload.is_undecided,
                payload.source || 'Primary', payload.voter_member_count || null, !!payload.is_minority,
                payload.floor_number || null, payload.flat_number || null,
                payload.building_name || null, payload.address || null,
                // Legacy numeric building_id only if it's actually numeric; the geo
                // building link goes in building_feature_id (TEXT).
                (payload.building_id != null && /^\d+$/.test(String(payload.building_id))) ? payload.building_id : null,
                payload.building_feature_id || null,
            ]
        );

        // Crowd-source building names: OSM only names ~2% of building footprints.
        // When the canvasser typed a name for a geo-tagged building, save it onto
        // the geo feature (never overwriting an existing curated name) so the map
        // and future canvasses show the real name instead of "way/…".
        const typedName = (payload.building_name || '').trim();
        if (payload.building_feature_id && typedName) {
            await client.query(
                `UPDATE geo_layers
                    SET props = jsonb_set(COALESCE(props, '{}'::jsonb), '{building_name}', to_jsonb($3::text))
                  WHERE candidate_id = $1 AND layer_key = 'building' AND feature_id = $2
                    AND (props->>'building_name' IS NULL OR props->>'building_name' = '')`,
                [candidateId, payload.building_feature_id, typedName]
            );
        }

        // Only update shared voters.status when there is no political-candidate
        // isolation (single-candidate constituency or super-admin context).
        if (!politicalCandidateId) {
            const newStatus = payload.follow_up_needed ? 'Follow-up needed' : 'Visited';
            await client.query(
                `UPDATE voters SET status = $3, updated_at = NOW()
                  WHERE candidate_id = $1 AND voter_id = $2`,
                [candidateId, voterId, newStatus]
            );
        }

        return insert.rows[0];
    });
}

module.exports = {
    findById,
    historyForVoter,
    locationsByVillage,
    allLocations,
    voterLocationsByScope,
    listVoterRecords,
    partyRecords,
    partyStats,
    partyVoterHistory,
    crossPartyVoterHistory,
    partyPersuadable,
    stats,
    submit,
};
