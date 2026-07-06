import client from './client';

// ── Political candidates ──────────────────────────────────────────────────────

export const listCandidates = () =>
    client.get('/people/candidates').then((r) => r.data);

export const createCandidate = (data) =>
    client.post('/people/candidates', data).then((r) => r.data);

export const assignConstituency = (userId, constituencyIds) =>
    client.put(`/people/candidates/${userId}/constituency`, {
        constituency_ids: Array.isArray(constituencyIds) ? constituencyIds : [constituencyIds],
    }).then((r) => r.data);

export const deleteCandidate = (userId) =>
    client.delete(`/people/candidates/${userId}`).then((r) => r.data);

// ── Volunteers ────────────────────────────────────────────────────────────────

export const listVolunteers = (constituencyId, politicalCandidateId) =>
    client.get('/people/volunteers', {
        params: { constituency_id: constituencyId, political_candidate_id: politicalCandidateId },
    }).then((r) => r.data);

export const createOrAssignVolunteer = (data) =>
    client.post('/people/volunteers', data).then((r) => r.data);

export const updateVolunteerWards = (userId, data) =>
    client.put(`/people/volunteers/${userId}/wards`, data).then((r) => r.data);

export const removeVolunteer = (userId, constituencyId) =>
    client.delete(`/people/volunteers/${userId}`, { params: { constituency_id: constituencyId } }).then((r) => r.data);

// ── User search ───────────────────────────────────────────────────────────────

export const searchUsers = (q) =>
    client.get('/people/users/search', { params: { q } }).then((r) => r.data);
