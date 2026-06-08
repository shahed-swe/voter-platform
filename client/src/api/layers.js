import client from './client';

export const sources = () =>
    client.get('/layers/sources').then((r) => r.data?.sources || {});

/**
 * Fetch a whole layer (root render).
 * `source` is either a dedicated-table name ("wards") or a generic
 * geo_layers layer with a "geo:" prefix ("geo:sector").
 */
export const fetchSource = (source) => {
    if (source.startsWith('geo:')) {
        const layerKey = source.slice(4);
        return client.get(`/layers/geo/${encodeURIComponent(layerKey)}`).then((r) => r.data);
    }
    return client.get(`/layers/${source}`).then((r) => r.data);
};

/**
 * Fetch a layer scoped to a parent feature (drill-down).
 *  - table source: /layers/:source/by/:parent_fk/:parent_value
 *  - geo source:   /layers/geo/:layer_key/by/:parent_feature_id
 */
export const fetchByParent = (source, parent_fk, parent_value) => {
    if (source.startsWith('geo:')) {
        const layerKey = source.slice(4);
        return client
            .get(`/layers/geo/${encodeURIComponent(layerKey)}/by/${encodeURIComponent(parent_value)}`)
            .then((r) => r.data);
    }
    return client
        .get(`/layers/${source}/by/${parent_fk}/${encodeURIComponent(parent_value)}`)
        .then((r) => r.data);
};
