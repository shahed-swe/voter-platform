import client from './client';

// ---- Layer catalog (designer) ----
export const getLayers = () =>
    client.get('/layer-definitions').then((r) => r.data?.layers || []);

export const saveLayers = (layers) =>
    client.put('/layer-definitions', { layers }).then((r) => r.data);

// ---- Data ingest (upload → preview → commit) ----
export const uploadPreview = (file) => {
    const form = new FormData();
    form.append('file', file);
    return client
        .post('/ingest/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
        .then((r) => r.data);
};

export const commitIngest = ({ uploadToken, originalName, layerKey, parentLayerKey, mapping }) =>
    client
        .post('/ingest/commit', {
            upload_token: uploadToken,
            original_name: originalName,
            layer_key: layerKey,
            parent_layer_key: parentLayerKey || null,
            mapping,
        })
        .then((r) => r.data);
