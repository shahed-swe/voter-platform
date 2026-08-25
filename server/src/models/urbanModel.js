// Urban / constituency-style data (wards, voter_areas, buildings, polling stations).
// All queries scoped to the active candidate.

const { one, many } = require('../db/pool');

async function listConstituencies(candidateId) {
    return many(
        `SELECT * FROM constituencies WHERE candidate_id = $1 ORDER BY name`,
        [candidateId]
    );
}

async function listWards(candidateId, { constituencyId } = {}) {
    if (constituencyId) {
        return many(
            `SELECT w.*, c.name AS constituency_name
               FROM wards w
               LEFT JOIN constituencies c
                 ON c.constituency_id = w.constituency_id AND c.candidate_id = $1
              WHERE w.candidate_id = $1 AND w.constituency_id = $2
              ORDER BY w.ward_number`,
            [candidateId, constituencyId]
        );
    }
    return many(
        `SELECT * FROM wards WHERE candidate_id = $1 ORDER BY ward_number`,
        [candidateId]
    );
}

async function listVoterAreas(candidateId, { wardId } = {}) {
    if (wardId) {
        return many(
            `SELECT * FROM voter_areas
              WHERE candidate_id = $1 AND ward_id = $2
              ORDER BY voter_area_name`,
            [candidateId, wardId]
        );
    }
    return many(
        `SELECT * FROM voter_areas WHERE candidate_id = $1 ORDER BY voter_area_name`,
        [candidateId]
    );
}

async function buildingsForVoterArea(candidateId, voterAreaName) {
    return many(
        `SELECT b.*
           FROM buildings b
           JOIN voter_areas va
             ON va.voter_area_id = b.voter_area_id AND va.candidate_id = $1
          WHERE b.candidate_id = $1
            AND (va.voter_area_name = $2 OR va.village_name = $2)
          ORDER BY b.building_id`,
        [candidateId, voterAreaName]
    );
}

async function buildingVisitedCount(candidateId, voterAreaId) {
    return one(
        `SELECT COUNT(DISTINCT c.building_id) AS visited
           FROM canvassing c
           JOIN buildings b
             ON b.building_id = c.building_id AND b.candidate_id = $1
          WHERE c.candidate_id = $1
            AND b.voter_area_id = $2`,
        [candidateId, voterAreaId]
    );
}

async function canvassedVotersForBuilding(candidateId, buildingId) {
    return many(
        `SELECT c.*,
                v.name      AS voter_name,
                v.sos_vid,
                u.name      AS canvasser_name,
                u.username  AS canvasser_username
           FROM canvassing c
           JOIN voters v ON v.voter_id = c.voter_id
           LEFT JOIN users u ON u.user_id = c.user_id
          WHERE c.candidate_id = $1
            -- geo buildings use TEXT feature ids ("way/…"); legacy rows a numeric id
            AND (c.building_feature_id = $2::text OR c.building_id::text = $2::text)
          ORDER BY c.canvass_date DESC`,
        [candidateId, buildingId]
    );
}

async function pollingStations(candidateId, { wardId } = {}) {
    if (wardId) {
        return many(
            `SELECT * FROM polling_stations
              WHERE candidate_id = $1 AND ward_id = $2`,
            [candidateId, wardId]
        );
    }
    return many(
        `SELECT * FROM polling_stations WHERE candidate_id = $1`,
        [candidateId]
    );
}

async function hierarchy(candidateId) {
    const constituencies = await listConstituencies(candidateId);
    const wards = await many(
        `SELECT * FROM wards WHERE candidate_id = $1 ORDER BY ward_number`,
        [candidateId]
    );
    const voterAreas = await many(
        `SELECT voter_area_id, ward_id, voter_area_name FROM voter_areas WHERE candidate_id = $1`,
        [candidateId]
    );

    const wardsByConstituency = {};
    for (const w of wards) {
        const k = w.constituency_id || 'unknown';
        (wardsByConstituency[k] ||= []).push(w);
    }
    const areasByWard = {};
    for (const a of voterAreas) {
        const k = a.ward_id || 'unknown';
        (areasByWard[k] ||= []).push(a);
    }

    return constituencies.map((c) => ({
        ...c,
        wards: (wardsByConstituency[c.constituency_id] || []).map((w) => ({
            ...w,
            voter_areas: areasByWard[w.ward_id] || [],
        })),
    }));
}

module.exports = {
    listConstituencies,
    listWards,
    listVoterAreas,
    buildingsForVoterArea,
    buildingVisitedCount,
    canvassedVotersForBuilding,
    pollingStations,
    hierarchy,
};
