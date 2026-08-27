// Central query-key factory + staleness tiers for TanStack Query.
//
// Convention: every candidate-scoped key starts ['c', candidateId, ...] so a
// candidate's entire cache subtree can be invalidated/removed in one call.
// Objects/arrays go directly into keys (v5 hashes them deterministically) —
// this replaces the JSON.stringify(...) dependency-array hacks.

export const TIER = {
    // Changes only on data import (geo layers, ward/area option lists).
    STATIC:    { staleTime: Infinity, gcTime: 24 * 60 * 60 * 1000 },
    // Lists that tolerate a few minutes of staleness (candidates, users, options).
    REFERENCE: { staleTime: 5 * 60_000, gcTime: 30 * 60_000 },
    // Live survey data — correctness comes from invalidation on mutation.
    LIVE:      { staleTime: 30_000 },
};

export const keys = {
    candidate:   (cid) => ['c', cid],

    // STATIC geo/reference data
    geoOptions:  (cid, wards = []) => ['c', cid, 'geoOptions', wards],
    wards:       (cid) => ['c', cid, 'wards'],
    villages:    (cid) => ['c', cid, 'villages'],
    voterAreas:  (cid, wardId) => ['c', cid, 'voterAreas', wardId],
    buildings:   (cid, voterAreaId) => ['c', cid, 'buildings', voterAreaId],
    layerSource: (cid, source, parent) => ['c', cid, 'layer', source, parent ?? null],

    // REFERENCE lists
    users:       (cid, params) => ['c', cid, 'users', params],
    canvassers:  (cid) => ['c', cid, 'canvassers'],
    candidates:  () => ['candidates'],           // global — not tenant-scoped
    peopleCandidates: (cid) => ['c', cid, 'peopleCandidates'],

    // LIVE survey data (invalidated after canvass submit — see invalidateCanvassData)
    voterPins:   (cid, scope) => ['c', cid, 'pins', scope],
    voterList:   (cid, params) => ['c', cid, 'voters', params],
    canvassStats:(cid) => ['c', cid, 'stats'],
    analytics:   (cid, endpoint, params) => ['c', cid, 'analytics', endpoint, params ?? null],
};

/** Everything a canvass submit can change — pins, voter lists/stats, analytics. */
export function invalidateCanvassData(queryClient, cid) {
    queryClient.invalidateQueries({ queryKey: ['c', cid, 'pins'] });
    queryClient.invalidateQueries({ queryKey: ['c', cid, 'voters'] });
    queryClient.invalidateQueries({ queryKey: ['c', cid, 'stats'] });
    queryClient.invalidateQueries({ queryKey: ['c', cid, 'analytics'] });
}
