import client from './client';

export const villages    = ()        => client.get('/geo/villages').then((r) => r.data);
export const wards       = ()        => client.get('/geo/wards').then((r) => r.data);
export const voterAreas  = (params)  => client.get('/geo/voter-areas', { params }).then((r) => r.data);
export const buildings   = (vaId)    => client.get(`/geo/buildings/${vaId}`).then((r) => r.data);
