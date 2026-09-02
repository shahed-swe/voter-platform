import client from './client';

export const submit              = (body)          => client.post('/canvassing/submit', body).then((r) => r.data);
export const history             = (voterId)       => client.get(`/canvassing/history/${voterId}`).then((r) => r.data);
export const locationsByVillage  = (villageId)     => client.get(`/canvassing/locations/${villageId}`).then((r) => r.data);
export const allLocations        = (params)        => client.get('/canvassing/all-locations', { params }).then((r) => r.data);
export const voterLocations      = (body)          => client.post('/canvassing/voter-locations', body).then((r) => r.data);
export const voterRecords        = (params)        => client.get('/canvassing/voter-records', { params }).then((r) => r.data);
export const partyRecords        = (params)        => client.get('/canvassing/party-records', { params }).then((r) => r.data);
export const partyStats          = (params)        => client.get('/canvassing/party-stats',   { params }).then((r) => r.data);
export const partyPersuadable    = (params)        => client.get('/canvassing/party-persuadable', { params }).then((r) => r.data);
export const voterHistory        = (voterId)       => client.get(`/canvassing/voter-history/${voterId}`).then((r) => r.data);
export const stats               = ()              => client.get('/canvassing/stats').then((r) => r.data);
