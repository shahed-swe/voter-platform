const { query, one, many, withTransaction } = require('../db/pool');

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

async function listVoterRecords(candidateId, { limit = 200, offset = 0, search = null, politicalCandidateId = null } = {}) {
    const params = [candidateId, politicalCandidateId];
    let searchClause = '';
    if (search) {
        params.push(`%${search}%`);
        searchClause = `AND (v.name ILIKE $${params.length} OR v.sos_vid ILIKE $${params.length})`;
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

async function stats(candidateId, politicalCandidateId = null) {
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
            AND ($2::bigint IS NULL OR political_candidate_id = $2)`,
        [candidateId, politicalCandidateId]
    );
}

async function submit(candidateId, { voterId, userId, politicalCandidateId, payload }) {
    return withTransaction(async (client) => {
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
    listVoterRecords,
    stats,
    submit,
};
