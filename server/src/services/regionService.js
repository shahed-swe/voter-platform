const { many, one } = require('../db/pool');

/**
 * Returns aggregated geographic regions a user is authorized for, based on
 * user_assignments. Mirrors the legacy getUserAssignedRegions() logic but in
 * PostgreSQL with parameterized queries.
 */
async function getUserAssignedRegions(userId) {
    const rows = await many(
        `
        WITH base AS (
            SELECT ua.assignment_type, ua.assignment_value,
                   v.upazila, v."union" AS uni, v.mauza, v.district
              FROM user_assignments ua
              LEFT JOIN villages v ON v.village_id = ua.village_id
             WHERE ua.user_id = $1
               AND ua.assignment_type IN ('village','upazila','union','mauza')
            UNION
            SELECT ua.assignment_type, ua.assignment_value,
                   NULL, NULL, NULL, NULL
              FROM user_assignments ua
             WHERE ua.user_id = $1 AND ua.assignment_type = 'voter_area'
        )
        SELECT DISTINCT * FROM base ORDER BY assignment_type DESC
        `,
        [userId]
    );

    const out = {
        upazilas: new Set(),
        unions: new Set(),
        mauzas: new Set(),
        villages: new Set(),
        voter_areas: new Set(),
        allDistricts: new Set(),
        assignmentTypes: new Set(),
    };

    for (const r of rows) {
        out.assignmentTypes.add(r.assignment_type);
        if (r.assignment_type === 'upazila') {
            out.upazilas.add(r.assignment_value);
            if (r.district) out.allDistricts.add(r.district);
        } else if (r.assignment_type === 'union') {
            out.unions.add(r.assignment_value);
            if (r.upazila) out.upazilas.add(r.upazila);
        } else if (r.assignment_type === 'mauza') {
            out.mauzas.add(r.assignment_value);
            if (r.uni) out.unions.add(r.uni);
            if (r.upazila) out.upazilas.add(r.upazila);
        } else if (r.assignment_type === 'village') {
            out.villages.add(r.assignment_value);
        } else if (r.assignment_type === 'voter_area') {
            out.voter_areas.add(r.assignment_value);
            const geo = await one(
                `
                SELECT DISTINCT v.upazila, v."union" AS uni, v.mauza
                  FROM villages v
                  JOIN voter_village_mapping vvm ON vvm.village_id = v.village_id
                  JOIN voters vo ON vo.voter_id = vvm.voter_id
                 WHERE vo.clean_voter_area = $1
                 LIMIT 1
                `,
                [r.assignment_value]
            );
            if (geo) {
                if (geo.upazila) out.upazilas.add(geo.upazila);
                if (geo.uni) out.unions.add(geo.uni);
                if (geo.mauza) out.mauzas.add(geo.mauza);
            }
        }
    }

    return {
        upazilas: [...out.upazilas],
        unions: [...out.unions],
        mauzas: [...out.mauzas],
        villages: [...out.villages],
        voter_areas: [...out.voter_areas],
        allDistricts: [...out.allDistricts],
        assignmentTypes: [...out.assignmentTypes],
    };
}

/**
 * Builds a PostgreSQL WHERE-clause fragment that restricts a query
 * to the regions a user is authorized for.
 *
 *   const { sql, params, nextIdx } = await buildRegionFilter(userId, role, { startIdx: 1, voterAlias: 'v' });
 *   // sql is like:  (v.clean_voter_area = ANY($1) OR v.village_id = ANY($2))
 *
 * Returns sql === '' for admins (no restriction) and 'FALSE' for users with no assignments.
 */
async function buildRegionFilter(userId, userRole, { startIdx = 1, voterAlias = 'v' } = {}) {
    if (userRole === 'admin') return { sql: '', params: [], nextIdx: startIdx };

    const regions = await getUserAssignedRegions(userId);
    const hasAny =
        regions.upazilas.length ||
        regions.unions.length ||
        regions.mauzas.length ||
        regions.villages.length ||
        regions.voter_areas.length;
    if (!hasAny) return { sql: 'FALSE', params: [], nextIdx: startIdx };

    const v = voterAlias;
    const parts = [];
    const params = [];
    let i = startIdx;

    if (regions.voter_areas.length) {
        parts.push(`${v}.clean_voter_area = ANY($${i})`);
        params.push(regions.voter_areas);
        i++;
    }
    if (regions.villages.length) {
        parts.push(`${v}.village_id = ANY($${i})`);
        params.push(regions.villages);
        i++;
    }
    if (regions.upazilas.length) {
        parts.push(`${v}.upazila = ANY($${i})`);
        params.push(regions.upazilas);
        i++;
    }
    if (regions.unions.length) {
        parts.push(`${v}."union" = ANY($${i})`);
        params.push(regions.unions);
        i++;
    }

    return { sql: '(' + parts.join(' OR ') + ')', params, nextIdx: i };
}

module.exports = { getUserAssignedRegions, buildRegionFilter };
