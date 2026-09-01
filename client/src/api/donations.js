import client from './client';

// Donations (§9): donor ↔ volunteer money records + the party ledger.

export const findVolunteers = (q) =>
    client.get('/donations/volunteers', { params: { q: q || undefined } }).then((r) => r.data);

export const create = (data) =>
    client.post('/donations', data).then((r) => r.data);

export const mine = () =>
    client.get('/donations/mine').then((r) => r.data);

export const received = () =>
    client.get('/donations/received').then((r) => r.data);

export const confirm = (donationId) =>
    client.post(`/donations/${donationId}/confirm`).then((r) => r.data);

export const partyLedger = (params) =>
    client.get('/donations/party', { params }).then((r) => r.data);
