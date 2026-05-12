import client from './client';

export const filters     = ()       => client.get('/villages/filters').then((r) => r.data);
export const filtered    = (body)   => client.post('/villages/filtered', body).then((r) => r.data);
export const data        = ()       => client.get('/villages/data').then((r) => r.data);
export const withVoters  = ()       => client.get('/villages/with-voters').then((r) => r.data);
export const stats       = ()       => client.get('/villages/stats').then((r) => r.data);
export const geometry    = (ids)    => client.post('/villages/geometry', { village_ids: ids }).then((r) => r.data);
export const getById     = (id)     => client.get(`/villages/${id}`).then((r) => r.data);
