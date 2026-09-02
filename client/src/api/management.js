import client from './client';

export const context = () =>
    client.get('/management/context').then((r) => r.data);

export const wards = (constituencyId) =>
    client.get('/management/wards', { params: { constituency_id: constituencyId } }).then((r) => r.data);

export const voterAreas = (constituencyId, wardList) =>
    client.get('/management/voter-areas', {
        params: { constituency_id: constituencyId, wards: (wardList || []).join(',') },
    }).then((r) => r.data);

export const listUsers = () =>
    client.get('/management/users').then((r) => r.data);

export const createUser = (body) =>
    client.post('/management/users', body).then((r) => r.data);

export const updateUser = (userId, body) =>
    client.put(`/management/users/${userId}`, body).then((r) => r.data);

export const updateRegion = (userId, body) =>
    client.put(`/management/users/${userId}/region`, body).then((r) => r.data);

export const removeUser = (userId) =>
    client.delete(`/management/users/${userId}`).then((r) => r.data);
