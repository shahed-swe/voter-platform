// Returns GeoJSON FeatureCollections for the map layers.
const { many } = require('../db/pool');

function rowsToFeatureCollection(rows, geomKey = 'geometry') {
    return {
        type: 'FeatureCollection',
        features: rows
            .filter((r) => r[geomKey])
            .map((r) => {
                const { [geomKey]: geom, ...rest } = r;
                return { type: 'Feature', geometry: geom, properties: rest };
            }),
    };
}

/**
 * Villages with canvassing progress. Each feature is a polygon with stats in
 * properties (total_voters, visited, completion_pct). Used by the dashboard map.
 */
async function villagesGeojson() {
    const rows = await many(`
        SELECT vil.village_id, vil.village_name, vil.upazila,
               vil."union"                                                  AS union_name,
               vil.mauza, vil.total_population, vil.male_count, vil.female_count,
               vil.geometry,
               COUNT(v.voter_id)                                             AS total_voters,
               COUNT(*) FILTER (WHERE v.status = 'Visited')                  AS visited,
               ROUND(
                   100.0 * COUNT(*) FILTER (WHERE v.status = 'Visited') /
                   NULLIF(COUNT(v.voter_id), 0), 2
               )                                                             AS completion_pct
          FROM villages vil
          LEFT JOIN voters v ON v.village_id = vil.village_id
         GROUP BY vil.village_id
         ORDER BY vil.village_name
    `);
    return rowsToFeatureCollection(rows);
}

/** Voter areas filtered by ward / union / mauza. */
async function voterAreasGeojson({ wardId, unionName, mauzaName } = {}) {
    const where = [];
    const params = [];
    if (wardId)    { params.push(wardId);    where.push(`va.ward_id = $${params.length}`); }
    if (unionName) { params.push(unionName); where.push(`va.union_name = $${params.length}`); }
    if (mauzaName) { params.push(mauzaName); where.push(`va.mauza_name = $${params.length}`); }

    const rows = await many(
        `
        SELECT va.voter_area_id, va.ward_id, va.village_name, va.bangla_voter_area_name,
               va.union_name, va.mauza_name, va.total_population,
               va.male_count, va.female_count, va.geometry,
               COUNT(b.building_id) AS building_count
          FROM voter_areas va
          LEFT JOIN buildings b ON b.voter_area_id = va.voter_area_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         GROUP BY va.voter_area_id
         ORDER BY va.total_population DESC NULLS LAST
        `,
        params
    );
    return rowsToFeatureCollection(rows);
}

/** Buildings (polygons) inside a voter area. */
async function buildingsGeojson(voterAreaId) {
    const rows = await many(
        `
        SELECT b.building_id, b.voter_area_id, b.osm_id, b.address,
               b.house, b.street, b.city, b.office, b.name_bn,
               b.building_name, b.floor_number, b.flat_number, b.geometry,
               va.bangla_voter_area_name AS voter_area_name,
               va.village_name           AS voter_area_village,
               EXISTS (SELECT 1 FROM canvassing c WHERE c.building_id = b.building_id) AS canvassed
          FROM buildings b
          LEFT JOIN voter_areas va ON va.voter_area_id = b.voter_area_id
         WHERE b.voter_area_id = $1
        `,
        [voterAreaId]
    );
    return rowsToFeatureCollection(rows);
}

/** Wards (polygons) for a ward-overview view. */
async function wardsGeojson() {
    const rows = await many(`
        SELECT w.ward_id, w.constituency_id, w.ward_number, w.union_name,
               w.total_population, w.male_count, w.female_count, w.geometry
          FROM wards w
         ORDER BY w.ward_number
    `);
    return rowsToFeatureCollection(rows);
}

module.exports = { villagesGeojson, voterAreasGeojson, buildingsGeojson, wardsGeojson };
