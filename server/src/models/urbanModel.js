// Urban / constituency-style data (wards, voter_areas, buildings, polling stations).
// Used by dhaka13-style deployments but works for any tenant that loads this data.

const { one, many } = require('../db/pool');

async function listConstituencies() {
    return many(`SELECT * FROM constituencies ORDER BY name`);
}

async function listWards({ constituencyId } = {}) {
    if (constituencyId) {
        return many(
            `SELECT w.*, c.name AS constituency_name
               FROM wards w
               LEFT JOIN constituencies c ON c.constituency_id = w.constituency_id
              WHERE w.constituency_id = $1
              ORDER BY w.ward_number`,
            [constituencyId]
        );
    }
    return many(`SELECT * FROM wards ORDER BY ward_number`);
}

async function listVoterAreas({ wardId } = {}) {
    if (wardId) {
        return many(`SELECT * FROM voter_areas WHERE ward_id = $1 ORDER BY voter_area_name`, [wardId]);
    }
    return many(`SELECT * FROM voter_areas ORDER BY voter_area_name`);
}

async function buildingsForVoterArea(voterAreaName) {
    return many(
        `SELECT b.*
           FROM buildings b
           JOIN voter_areas va ON va.voter_area_id = b.voter_area_id
          WHERE va.voter_area_name = $1
             OR va.village_name    = $1
          ORDER BY b.building_id`,
        [voterAreaName]
    );
}

async function buildingsGeojson(voterAreaName) {
    const rows = await many(
        `SELECT b.building_id, b.building_name, b.address,
                b.latitude, b.longitude, b.metadata
           FROM buildings b
           JOIN voter_areas va ON va.voter_area_id = b.voter_area_id
          WHERE va.voter_area_name = $1 OR va.village_name = $1`,
        [voterAreaName]
    );
    return {
        type: 'FeatureCollection',
        features: rows
            .filter((r) => r.latitude && r.longitude)
            .map((r) => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [r.longitude, r.latitude] },
                properties: {
                    building_id: r.building_id,
                    building_name: r.building_name,
                    address: r.address,
                    ...(r.metadata || {}),
                },
            })),
    };
}

async function buildingVisitedCount(voterAreaId) {
    return one(
        `SELECT COUNT(DISTINCT c.building_id) AS visited
           FROM canvassing c
           JOIN buildings b ON b.building_id = c.building_id
          WHERE b.voter_area_id = $1`,
        [voterAreaId]
    );
}

async function canvassedVotersForBuilding(buildingId) {
    return many(
        `SELECT c.*,
                v.name      AS voter_name,
                v.sos_vid,
                u.name      AS canvasser_name,
                u.username  AS canvasser_username
           FROM canvassing c
           JOIN voters v ON v.voter_id = c.voter_id
           LEFT JOIN users u ON u.user_id = c.user_id
          WHERE c.building_id = $1
          ORDER BY c.canvass_date DESC`,
        [buildingId]
    );
}

async function pollingStations({ wardId } = {}) {
    if (wardId) {
        return many(`SELECT * FROM polling_stations WHERE ward_id = $1`, [wardId]);
    }
    return many(`SELECT * FROM polling_stations`);
}

async function hierarchy() {
    const constituencies = await listConstituencies();
    const wards = await many(`SELECT * FROM wards ORDER BY ward_number`);
    const voterAreas = await many(`SELECT voter_area_id, ward_id, voter_area_name FROM voter_areas`);

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
    buildingsGeojson,
    buildingVisitedCount,
    canvassedVotersForBuilding,
    pollingStations,
    hierarchy,
};
