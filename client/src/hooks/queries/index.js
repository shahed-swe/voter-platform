// Shared server-state hooks (TanStack Query).
//
// One hook per piece of reference data that multiple components need — callers
// that used to fire their own identical requests now share a single cache
// entry. All hooks are candidate-scoped (see src/api/queryKeys.js) and disabled
// until a candidate is selected.

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthContext.jsx';
import * as votersApi from '../../api/voters.js';
import * as geoApi from '../../api/geo.js';
import * as candidatesApi from '../../api/candidates.js';
import * as adminApi from '../../api/admin.js';
import { keys, TIER } from '../../api/queryKeys.js';

/** Ward + voter-area option lists ({ wards:[], voter_areas:[] }). STATIC. */
export function useGeoOptions(wards = [], { enabled = true } = {}) {
    const { candidate } = useAuth();
    const cid = candidate?.candidate_id;
    return useQuery({
        queryKey: keys.geoOptions(cid, wards),
        queryFn: () => votersApi.geoOptions(wards),
        enabled: !!cid && enabled,
        ...TIER.STATIC,
    });
}

/** Full ward GeoJSON FeatureCollection. STATIC. */
export function useWardsGeo() {
    const { candidate } = useAuth();
    const cid = candidate?.candidate_id;
    return useQuery({
        queryKey: keys.wards(cid),
        queryFn: () => geoApi.wards(),
        enabled: !!cid,
        ...TIER.STATIC,
    });
}

/** Full village GeoJSON FeatureCollection. STATIC. */
export function useVillagesGeo() {
    const { candidate } = useAuth();
    const cid = candidate?.candidate_id;
    return useQuery({
        queryKey: keys.villages(cid),
        queryFn: () => geoApi.villages(),
        enabled: !!cid,
        ...TIER.STATIC,
    });
}

/** Constituency (candidate) list — global, not tenant-scoped. REFERENCE. */
export function useCandidates({ enabled = true } = {}) {
    return useQuery({
        queryKey: keys.candidates(),
        queryFn: () => candidatesApi.list(),
        enabled,
        ...TIER.REFERENCE,
    });
}

/** Admin user list for the given params. REFERENCE. */
export function useUsers(params, { enabled = true } = {}) {
    const { candidate } = useAuth();
    const cid = candidate?.candidate_id;
    return useQuery({
        queryKey: keys.users(cid, params),
        queryFn: () => adminApi.listUsers(params),
        enabled: !!cid && enabled,
        ...TIER.REFERENCE,
    });
}

// ── Imperative cached fetchers ──────────────────────────────────────────────
// For pages whose fetching lives inside multi-step effects (the urban/rural geo
// cascades): same promise shape as the raw api call, but served from the query
// cache — repeat selections and page toggles stop refetching identical GeoJSON.

export function fetchWardsGeo(queryClient, cid) {
    return queryClient.fetchQuery({
        queryKey: keys.wards(cid),
        queryFn: () => geoApi.wards(),
        ...TIER.STATIC,
    });
}

export function fetchVillagesGeo(queryClient, cid) {
    return queryClient.fetchQuery({
        queryKey: keys.villages(cid),
        queryFn: () => geoApi.villages(),
        ...TIER.STATIC,
    });
}

export function fetchVoterAreasGeo(queryClient, cid, wardId) {
    return queryClient.fetchQuery({
        queryKey: keys.voterAreas(cid, wardId),
        queryFn: () => geoApi.voterAreas({ ward_id: wardId }),
        ...TIER.STATIC,
    });
}

export function fetchBuildingsGeo(queryClient, cid, voterAreaId) {
    return queryClient.fetchQuery({
        queryKey: keys.buildings(cid, voterAreaId),
        queryFn: () => geoApi.buildings(voterAreaId),
        ...TIER.STATIC,
    });
}

export function fetchUsers(queryClient, cid, params) {
    return queryClient.fetchQuery({
        queryKey: keys.users(cid, params),
        queryFn: () => adminApi.listUsers(params),
        ...TIER.REFERENCE,
    });
}
