// Ingest a parsed voter file (usually CSV) into the voters table for one
// candidate. Well-known columns map to real columns; everything else is kept
// in the `attributes` JSONB so it stays filterable/searchable.

const { pool } = require('../../db/pool');

// Fixed target columns the mapper can target. Everything NOT mapped here is
// preserved in attributes (so a constituency's "Sector", "Road", etc. survive).
const FIXED_TARGETS = [
    'sos_vid', 'name', 'father_husband', 'mother', 'occupation', 'birthdate',
    'age', 'gender', 'address', 'ward', 'voter_area_name', 'voter_area_code',
    'upazila', 'union', 'post_office', 'post_code', 'clean_voter_area',
];

function intOrNull(v) {
    if (v == null || v === '') return null;
    // Bengali numerals → ASCII so age parses
    const ascii = String(v).replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d));
    const n = parseInt(ascii.replace(/[^\d-]/g, ''), 10);
    return Number.isNaN(n) ? null : n;
}

function normalizeGender(v) {
    if (!v) return null;
    const s = String(v).trim().toLowerCase();
    if (s.startsWith('m') || s === 'পুরুষ') return 'Male';
    if (s.startsWith('f') || s === 'মহিলা' || s === 'নারী') return 'Female';
    if (s === '') return null;
    return 'Other';
}

/**
 * mapping: { <fixedTarget>: <sourceColumn> }
 * rows: parsed objects keyed by source column.
 * Replaces all voters for this candidate (idempotent re-import).
 */
async function ingestVoters({ candidateId, rows, mapping, batchSize = 1000 }) {
    const get = (row, target) => (mapping[target] ? row[mapping[target]] : null);

    const client = await pool.connect();
    let inserted = 0;
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM voters WHERE candidate_id = $1', [candidateId]);

        const COLS = [
            'candidate_id', 'sos_vid', 'name', 'father_husband', 'mother', 'occupation',
            'birthdate', 'age', 'gender', 'address', 'ward', 'voter_area_name',
            'voter_area_code', 'upazila', 'union', 'post_office', 'post_code',
            'clean_voter_area', 'status', 'attributes',
        ];
        const COLCOUNT = COLS.length;

        for (let start = 0; start < rows.length; start += batchSize) {
            const batch = rows.slice(start, start + batchSize);
            const values = [];
            const tuples = [];

            batch.forEach((row, idx) => {
                // attributes = EVERY source column (incl. ones also mapped to a
                // fixed display column). This makes any column filterable via
                // voters_attr with no special-casing in the filter designer.
                const attrs = {};
                for (const [k, v] of Object.entries(row)) {
                    if (k === '__geometry__') continue;
                    attrs[k] = v;
                }

                const sos = get(row, 'sos_vid');
                const tuple = [
                    candidateId,
                    sos != null && sos !== '' ? String(sos) : `auto_${start + idx + 1}`,
                    String(get(row, 'name') ?? '').trim() || '(no name)',
                    nullable(get(row, 'father_husband')),
                    nullable(get(row, 'mother')),
                    nullable(get(row, 'occupation')),
                    nullable(get(row, 'birthdate')),
                    intOrNull(get(row, 'age')),
                    normalizeGender(get(row, 'gender')),
                    nullable(get(row, 'address')),
                    nullable(get(row, 'ward')),
                    nullable(get(row, 'voter_area_name')),
                    nullable(get(row, 'voter_area_code')),
                    nullable(get(row, 'upazila')),
                    nullable(get(row, 'union')),
                    nullable(get(row, 'post_office')),
                    nullable(get(row, 'post_code')),
                    nullable(get(row, 'clean_voter_area')),
                    'Not visited',
                    JSON.stringify(attrs),
                ];
                const base = values.length;
                tuples.push('(' + COLS.map((_, j) => `$${base + j + 1}${COLS[j] === 'attributes' ? '::jsonb' : ''}`).join(',') + ')');
                values.push(...tuple);
            });

            await client.query(
                `INSERT INTO voters (${COLS.map((c) => (c === 'union' ? '"union"' : c)).join(',')})
                 VALUES ${tuples.join(',')}
                 ON CONFLICT (candidate_id, sos_vid) DO NOTHING`,
                values
            );
            inserted += batch.length;
        }

        await client.query('COMMIT');
        return { inserted };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

function nullable(v) {
    if (v == null) return null;
    const s = String(v).trim();
    return s === '' || s.toLowerCase() === 'nan' ? null : s;
}

module.exports = { ingestVoters, FIXED_TARGETS };
