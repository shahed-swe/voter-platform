// Generic GeoJSON source for the new dynamic <DynamicMap>.
// SECURITY: every (source, columns) is checked against a whitelist; nothing
// from the request URL or body becomes raw SQL.

const { many } = require('../db/pool');

/**
 * Whitelist of geo sources usable in `map_config.layers`. Each entry says:
 *   - what columns this source has in `properties`
 *   - which column is the geometry
 *   - which column is the PK (id)
 *   - which FK columns may be used as `parent_fk` (to constrain by parent)
 */
const SOURCES = {
    wards: {
        id_col:    'ward_id',
        geom_col:  'geometry',
        property_cols: ['ward_id', 'ward_number', 'constituency_id', 'union_name',
                        'total_population', 'male_count', 'female_count'],
        parent_fks: ['constituency_id'],
    },
    voter_areas: {
        id_col:    'voter_area_id',
        geom_col:  'geometry',
        property_cols: ['voter_area_id', 'ward_id', 'voter_area_name',
                        'bangla_voter_area_name', 'village_name', 'union_name',
                        'mauza_name', 'mauza_code', 'total_population',
                        'male_count', 'female_count'],
        parent_fks: ['ward_id'],
    },
    villages: {
        id_col:    'village_id',
        geom_col:  'geometry',
        property_cols: ['village_id', 'district', 'upazila', 'union', 'mauza',
                        'village_name', 'total_population', 'male_count',
                        'female_count', 'male_pct', 'female_pct'],
        parent_fks: ['district', 'upazila', 'union', 'mauza'],
    },
    buildings: {
        id_col:    'building_id',
        geom_col:  'geometry',
        property_cols: ['building_id', 'voter_area_id', 'osm_id', 'address',
                        'house', 'street', 'city', 'office', 'name_bn',
                        'building_name', 'floor_number', 'flat_number'],
        parent_fks: ['voter_area_id'],
    },
    polling_stations: {
        id_col:    'polling_station_id',
        geom_col:  null,         // stored as lat/lon — synthesized below
        property_cols: ['polling_station_id', 'ward_id', 'polling_centre_name',
                        'voter_area', 'latitude', 'longitude', 'address'],
        parent_fks: ['ward_id'],
        synthesize_point_geom: true,    // build geometry from lat/lng on the fly
    },
};

function quoteId(col) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) throw new Error(`bad column: ${col}`);
    return `"${col}"`;
}

function rowsToFeatureCollection(rows, geomKey) {
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
 * Returns a FeatureCollection for `source`, scoped to candidateId, optionally
 * filtered by `parent_fk = parent_value`.
 */
async function fetch(candidateId, source, { parent_fk, parent_value } = {}) {
    const meta = SOURCES[source];
    if (!meta) throw new Error(`unknown source: ${source}`);

    const propertyExprs = meta.property_cols.map((c) => quoteId(c));
    let geomExpr;
    let geomKey;
    if (meta.geom_col) {
        geomExpr = `${quoteId(meta.geom_col)} AS geometry`;
        geomKey = meta.geom_col === 'geometry' ? 'geometry' : 'geometry';
    } else if (meta.synthesize_point_geom) {
        geomExpr = `
            CASE
              WHEN latitude IS NULL OR longitude IS NULL THEN NULL
              ELSE jsonb_build_object('type','Point','coordinates',
                                      jsonb_build_array(longitude, latitude))
            END AS geometry`;
        geomKey = 'geometry';
    } else {
        throw new Error(`source ${source} has no geometry config`);
    }

    const where  = ['candidate_id = $1'];
    const params = [candidateId];

    if (parent_fk) {
        if (!meta.parent_fks.includes(parent_fk)) {
            throw new Error(`${source}: ${parent_fk} is not an allowed parent FK`);
        }
        if (parent_value == null || parent_value === '') {
            throw new Error(`${source}: parent_value required when parent_fk is set`);
        }
        params.push(parent_value);
        where.push(`${quoteId(parent_fk)} = $${params.length}`);
    }

    const sql = `
        SELECT ${propertyExprs.join(', ')}, ${geomExpr}
          FROM ${quoteId(source)}
         WHERE ${where.join(' AND ')}
    `;
    const rows = await many(sql, params);
    return rowsToFeatureCollection(rows, geomKey);
}

module.exports = { fetch, SOURCES };
