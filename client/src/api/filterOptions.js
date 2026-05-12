import client from './client';

/**
 * Fetch distinct value/label pairs for a column.
 *   source       — table (villages, voters, voter_areas, wards, buildings)
 *   valueCol     — column used as the option's value
 *   labelCol     — column used as the option's display label
 *   parentCol    — optional, for cascading filters
 *   parentValue  — optional, value of parent to filter by
 */
export function list({ source, valueCol, labelCol, parentCol, parentValue, limit }) {
    return client
        .get('/filter-options', {
            params: {
                source,
                value_col: valueCol,
                label_col: labelCol,
                parent_col: parentCol,
                parent_value: parentValue,
                limit,
            },
        })
        .then((r) => r.data?.options || []);
}
