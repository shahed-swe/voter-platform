import client from './client';

// Candidate selection & data handover (§8).

export const list = (params) =>
    client.get('/selection', { params }).then((r) => r.data);

export const select = (data) =>
    client.post('/selection', data).then((r) => r.data);
