import client from './client';

export const constituencies               = ()         => client.get('/urban/constituencies').then((r) => r.data);
export const wards                        = (params)   => client.get('/urban/wards', { params }).then((r) => r.data);
export const voterAreas                   = (params)   => client.get('/urban/voter-areas', { params }).then((r) => r.data);
export const hierarchy                    = ()         => client.get('/urban/hierarchy').then((r) => r.data);
export const buildingsForVoterArea        = (name)     => client.get(`/urban/voter-area-buildings/${encodeURIComponent(name)}`).then((r) => r.data);
export const buildingsGeojson             = (name)     => client.get(`/urban/buildings/geojson/${encodeURIComponent(name)}`).then((r) => r.data);
export const buildingsVisited             = (areaId)   => client.get(`/urban/buildings/visited/${areaId}`).then((r) => r.data);
export const canvassedVotersForBuilding   = (id)       => client.get(`/urban/buildings/${id}/canvassed-voters`).then((r) => r.data);
export const pollingStations              = (wardId)   =>
    client
        .get(wardId && wardId !== 'all' ? `/urban/polling-stations/${wardId}` : '/urban/polling-stations-filter')
        .then((r) => r.data);
