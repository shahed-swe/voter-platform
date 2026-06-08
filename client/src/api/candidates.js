import client from './client';

export const list    = ()              => client.get('/candidates').then((r) => r.data?.candidates || []);
export const getOne  = (id)            => client.get(`/candidates/${id}`).then((r) => r.data?.candidate || null);
export const create  = (body)          => client.post('/candidates', body).then((r) => r.data);
export const remove  = (id)            =>
    client.delete(`/candidates/${id}`, { params: { confirm: id } }).then((r) => r.data);
export const grantUser  = (id, body)   => client.post(`/candidates/${id}/users`, body).then((r) => r.data);
export const revokeUser = (id, userId) => client.delete(`/candidates/${id}/users/${userId}`).then((r) => r.data);

export const switchActive = (candidateId) =>
    client.post('/auth/switch-candidate', { candidate_id: candidateId }).then((r) => r.data);
