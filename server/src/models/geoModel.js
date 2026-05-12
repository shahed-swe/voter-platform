// Returns GeoJSON FeatureCollections for the map layers.
// All queries are scoped to a single candidate.
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

async function villagesGeojson(candidateId) {
    const rows = await many(
        `
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
          LEFT JOIN voters v ON v.village_id = vil.village_id AND v.candidate_id = $1
         WHERE vil.candidate_id = $1
         GROUP BY vil.candidate_id, vil.village_id
         ORDER BY vil.village_name
        `,
        [candidateId]
    );
    return rowsToFeatureCollection(rows);
}

async function voterAreasGeojson(candidateId, { wardId, unionName, mauzaName } = {}) {
    const where = ['va.candidate_id = $1'];
    const params = [candidateId];
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
          LEFT JOIN buildings b ON b.voter_area_id = va.voter_area_id AND b.candidate_id = $1
         WHERE ${where.join(' AND ')}
         GROUP BY va.voter_area_id
         ORDER BY va.total_population DESC NULLS LAST
        `,
        params
    );
    return rowsToFeatureCollection(rows);
}

async function buildingsGeojson(candidateId, voterAreaId) {
    const rows = await many(
        `
        SELECT b.building_id, b.voter_area_id, b.osm_id, b.address,
               b.house, b.street, b.city, b.office, b.name_bn,
               b.building_name, b.floor_number, b.flat_number, b.geometry,
               va.bangla_voter_area_name AS voter_area_name,
               va.village_name           AS voter_area_village,
               EXISTS (
                 SELECT 1 FROM canvassing c
                  WHERE c.building_id = b.building_id AND c.candidate_id = $1
               ) AS canvassed
          FROM buildings b
          LEFT JOIN voter_areas va
            ON va.voter_area_id = b.voter_area_id AND va.candidate_id = $1
         WHERE b.candidate_id = $1
           AND b.voter_area_id = $2
        `,
        [candidateId, voterAreaId]
    );
    return rowsToFeatureCollection(rows);
}

async function wardsGeojson(candidateId) {
    const rows = await many(
        `
        SELECT w.ward_id, w.constituency_id, w.ward_number, w.union_name,
               w.total_population, w.male_count, w.female_count, w.geometry
          FROM wards w
         WHERE w.candidate_id = $1
         ORDER BY w.ward_number
        `,
        [candidateId]
    );
    return rowsToFeatureCollection(rows);
}

module.exports = { villagesGeojson, voterAreasGeojson, buildingsGeojson, wardsGeojson };
