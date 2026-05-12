const { query, one, many, withTransaction } = require('../db/pool');

async function findById(canvassId) {
    return one(`SELECT * FROM canvassing WHERE canvass_id = $1`, [canvassId]);
}

async function historyForVoter(voterId) {
    return many(
        `SELECT c.*, u.name AS canvasser_name, u.username
           FROM canvassing c
           JOIN users u ON u.user_id = c.user_id
          WHERE c.voter_id = $1
          ORDER BY c.canvass_date DESC`,
        [voterId]
    );
}

async function locationsByVillage(villageId) {
    return many(
        `SELECT c.canvass_id, c.voter_id, c.latitude, c.longitude, c.support_rating,
                c.support_level, c.canvass_date, v.name AS voter_name
           FROM canvassing c
           JOIN voters v ON v.voter_id = c.voter_id
          WHERE v.village_id = $1
            AND c.latitude IS NOT NULL
            AND c.longitude IS NOT NULL`,
        [villageId]
    );
}

async function allLocations({ limit = 5000 } = {}) {
    return many(
        `SELECT canvass_id, voter_id, latitude, longitude, support_rating, support_level, canvass_date
           FROM canvassing
          WHERE latitude IS NOT NULL AND longitude IS NOT NULL
          ORDER BY canvass_date DESC
          LIMIT $1`,
        [limit]
    );
}

async function listVoterRecords({ limit = 200, offset = 0 } = {}) {
    return many(
        `SELECT c.*, v.name AS voter_name, v.sos_vid, v.voter_area_name, u.name AS canvasser_name
           FROM canvassing c
           JOIN voters v ON v.voter_id = c.voter_id
           JOIN users u ON u.user_id = c.user_id
          ORDER BY c.canvass_date DESC
          LIMIT $1 OFFSET $2`,
        [limit, offset]
    );
}

async function stats() {
    return one(`
        SELECT
            COUNT(*)                                                     AS total_canvasses,
            COUNT(DISTINCT voter_id)                                     AS unique_voters,
            COUNT(*) FILTER (WHERE support_rating >= 4)                  AS strong_support,
            COUNT(*) FILTER (WHERE support_rating <= 2)                  AS weak_support,
            COUNT(*) FILTER (WHERE is_undecided)                         AS undecided
          FROM canvassing
    `);
}

async function submit({ voterId, userId, payload }) {
    return withTransaction(async (client) => {
        const insert = await client.query(
            `INSERT INTO canvassing (
                voter_id, user_id, support_level, contact_phone, contact_email,
                issues_concerns, household_size, income_bracket,
                follow_up_needed, follow_up_date,
                latitude, longitude, location_verified,
                support_rating, is_undecided, source, voter_member_count, is_minority,
                floor_number, flat_number, building_name, address, building_id
            ) VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8,
                $9, $10,
                $11, $12, $13,
                $14, $15, $16, $17, $18,
                $19, $20, $21, $22, $23
            )
            RETURNING *`,
            [
                voterId, userId, payload.support_level || 'Unknown',
                payload.contact_phone || null, payload.contact_email || null,
                payload.issues_concerns || null,
                payload.household_size || null, payload.income_bracket || null,
                !!payload.follow_up_needed, payload.follow_up_date || null,
                payload.latitude || null, payload.longitude || null, !!payload.location_verified,
                payload.support_rating || null, !!payload.is_undecided,
                payload.source || 'Primary', payload.voter_member_count || null, !!payload.is_minority,
                payload.floor_number || null, payload.flat_number || null,
                payload.building_name || null, payload.address || null, payload.building_id || null,
            ]
        );

        // Mark the voter as visited
        await client.query(
            `UPDATE voters SET status = 'Visited', updated_at = NOW() WHERE voter_id = $1`,
            [voterId]
        );

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
