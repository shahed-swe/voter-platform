import client from './client';

export const search          = (q, params)        => client.get(`/voters/search/${encodeURIComponent(q)}`, { params }).then((r) => r.data);
export const getById         = (id)               => client.get(`/voters/${id}`).then((r) => r.data);
export const byVillage       = (vid, params)      => client.get(`/voters/by-village/${vid}`, { params }).then((r) => r.data);
export const byVoterArea     = (area, params)     => client.get(`/voters/by-voter-area/${encodeURIComponent(area)}`, { params }).then((r) => r.data);
export const byVoterAreas    = (body)             => client.post('/voters/by-voter-areas', body).then((r) => r.data);
export const filtered        = (body)             => client.post('/voters/filtered',       body).then((r) => r.data);
export const areaOptions     = (scope)            => client.post('/voters/area-options',   { scope }).then((r) => r.data);
export const listVoterAreas  = ()                 => client.get('/voters/areas').then((r) => r.data);
export const voterAreaStats  = (area)             => client.get(`/voters/areas/${encodeURIComponent(area)}/stats`).then((r) => r.data);
export const aggregatedStats = (body)             => client.post('/voters/statistics/aggregated', body).then((r) => r.data);
