import client from './client';

export const listUsers          = (params)          => client.get('/admin/users', { params }).then((r) => r.data);
export const multiPartyVolunteers = ()              => client.get('/admin/multi-party-volunteers').then((r) => r.data);
export const createUser         = (body)            => client.post('/admin/users', body).then((r) => r.data);
export const updateUser         = (id, body)        => client.put(`/admin/users/${id}`, body).then((r) => r.data);
export const deleteUser         = (id)              => client.delete(`/admin/users/${id}`).then((r) => r.data);
export const changePassword    = (id, body)        => client.put(`/admin/users/${id}/password`, body).then((r) => r.data);
export const changeUsername    = (id, body)        => client.put(`/admin/users/${id}/username`, body).then((r) => r.data);
export const listAssignments   = (userId)          => client.get(`/admin/users/${userId}/assignments`).then((r) => r.data);
export const createAssignment  = (userId, body)    => client.post(`/admin/users/${userId}/assignments`, body).then((r) => r.data);
export const deleteAssignment  = (userId, aid)     => client.delete(`/admin/users/${userId}/assignments/${aid}`).then((r) => r.data);
export const listAllAssignments = (params)          => client.get('/admin/assignments', { params }).then((r) => r.data);
