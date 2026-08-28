# Client-Side State Management — Analysis & Recommendations

_Date: 2026-08-27 · Scope: `client/` (React 18.3, plain JSX, Vite 5, axios, react-router 6)_

> **Status (2026-08-27): IMPLEMENTED — Phases 0–4.** TanStack Query v5 is installed and
> wired (`src/main.jsx`, `src/api/queryKeys.js`, `src/hooks/queries/`); the quick wins,
> shared reference hooks, AnalyticsPage, map-layer caching, and refreshKey→invalidation
> conversions below are all live. **Phase 5 (in-app candidate switch) is deferred** —
> candidate switching still uses a full page reload by choice (stability first).
> One intentional deviation: `DynamicMap` still accepts a `refreshKey` prop, but it now
> only drops + refetches the drilled GeoJSON layer's cache entries after a canvass
> submit; pins, lists, stats, and analytics all refetch via `invalidateCanvassData()`.

## 1. Summary

The client has **no client-side state management beyond `AuthContext`**. All 24 pages hand-roll
data fetching with `useEffect` + `useState`, nothing is cached, and nothing survives a route
change (`AppLayout` renders a plain `<Outlet/>`, so every navigation unmounts the page and
throws its data away). The measurable symptoms:

- Static reference data (ward lists, geo options, GeoJSON layers, candidate lists) is
  refetched on **every mount and every navigation**, sometimes **2–3× simultaneously** by
  sibling components on the same screen.
- Cross-component invalidation is done by hand: `refreshKey` counters drilled through props,
  `window.location.reload()` as the error-retry strategy (5 files), and a **full page reload**
  as the candidate-switch mechanism.
- ~15 effects use `JSON.stringify(object)` as a dependency-array cache key; the same
  debounce + cancelled-flag boilerplate is duplicated across pages.

**Recommendation:** adopt **TanStack Query v5** (`@tanstack/react-query`) as a *server-cache*
layer, migrated incrementally (phases in §9). Keep `AuthContext` exactly as it is. Do **not**
add a UI store (Redux/Zustand) — see §4. A handful of quick wins (§10) need no library at all
and can ship first.

---

## 2. Current state of client data flow

| What exists | Where | Notes |
|---|---|---|
| `AuthContext` | `src/auth/AuthContext.jsx` | The only context: `{token, user, candidate}`, persisted to localStorage, 23 consumers. Healthy — keep. |
| `useApi` hook | `src/hooks/useApi.js` | Bare `useEffect` fetcher, **no cache/dedup**. Used by only 2 of 24 pages (`AdminPage`, `ElectionResultsPage`); everything else hand-rolls the same thing. |
| Query cache / store | — | **None.** No react-query/SWR/Redux/Zustand in `package.json`. |
| API layer | `src/api/*.js` (16 modules) | Thin axios one-liners. Zero caching, dedup, abort, or retry. |

Recurring hand-rolled patterns that a query cache replaces outright:

- **`JSON.stringify(obj)` dep keys** (~15 occurrences) — e.g. `DynamicDashboard.jsx`
  rebuilds `wardScope` as a new object every render and relies on stringify to avoid loops.
- **`refreshKey` invalidation bus** — `DynamicCanvassing.jsx:28` / `DynamicDashboard.jsx:27`
  own a counter, bump it after canvass submit, and drill it into `DynamicMap`,
  `FilteredVoterListPanel`, and their own effects. This is a hand-rolled
  `queryClient.invalidateQueries`.
- **Reload as retry** — `ErrorState onRetry={() => window.location.reload()}` in
  `DynamicMap.jsx`, `UrbanDashboard.jsx`, `UrbanCanvassingPage.jsx`, `RuralDashboard.jsx`,
  `RuralCanvassingPage.jsx`.
- **Reload as candidate switch** — `CandidateSwitcher.jsx:71` and
  `VolunteerCandidateSwitcher.jsx:61` call `window.location.assign('/dashboard')` because
  there is no way to invalidate per-candidate data; the whole JS heap is the cache and the
  only way to clear it is to throw it away.
- **Hand-built layer cache** — `DynamicMap.jsx` keeps GeoJSON in `dataByLayer` keyed
  `` `${layer.id}|${ancestors}` `` but wipes it on every root/candidate change; its own
  comments (lines 261, 276) say *"(no caching)"*. Drilling ward → area → building → back →
  down again refetches every level.
- **Three separate "reset my state on candidate change" implementations**
  (`DynamicDashboard.jsx:31-40`, `DynamicCanvassing.jsx:32-39`, `DynamicMap.jsx:231-237`)
  and a `useDebounce` duplicated in `FilteredVoterListPanel.jsx` and `VoterListPanel.jsx`.

---

## 3. Catalog of redundant fetches (verified call sites)

| Endpoint | Call sites | Trigger | Volatility |
|---|---|---|---|
| `votersApi.geoOptions([])` | `GeoNavigator.jsx:33` + `DynamicMap.jsx:194` (**siblings — 2 identical requests at once**) + `AnalyticsPage.jsx:151` | every mount, every candidate switch | static (changes on import only). Server cost: two unbounded `GROUP BY` aggregates over `voters` |
| `geoApi.wards()` | `UrbanDashboard.jsx:106` + `UrbanCanvassingPage.jsx:111` | every dashboard↔canvassing toggle | static; full ward GeoJSON |
| `geoApi.villages()` | `RuralDashboard.jsx:55` + `RuralCanvassingPage.jsx:69` | every page toggle | static; full polygon set |
| `geoApi.voterAreas` → `geoApi.buildings` cascade | copy-pasted in `UrbanDashboard.jsx:126,151` and `UrbanCanvassingPage.jsx:127,150` | every area selection & page switch; **N parallel building-GeoJSON requests** | static — **largest payload path in the app** |
| `adminApi.listUsers({is_active:true, limit:500})` | `UrbanDashboard.jsx:106` + `RuralDashboard.jsx:56` (byte-identical) | every mount | near-static |
| `candidatesApi.list()` | `CandidateSwitcher.jsx:38` (in `AppHeader` → **remounts on every route change**), `CandidatesListPage.jsx:16`, `PoliticalCandidatesPage.jsx:162` | every navigation / dropdown open | static |
| `layersApi.fetchSource(...)` | `DynamicMap.jsx:268` (root layer, every mount); `VolunteerManagementPage.jsx:357` + `ImportDataPage.jsx:155` download **full geometry just to derive label lists** | every mount | static |
| 8-endpoint analytics batch + issues + records | `AnalyticsPage.jsx:162-210` | **10 requests per filter change**; back-navigation refires all 10 | mixed |
| `filterOptions.list(...limit:5000)` | `DynamicFilterPanel.jsx:63-99` — changing **any** filter value refetches options for **all** filters, incl. parentless ones | every filter change | static per parent value |
| `canvassingApi.stats` + `voterRecords` | `SurveyDataPage.jsx:74-79` — both fire **twice on mount** (debounce effect also runs at mount); `stats` refetched per keystroke though it doesn't depend on `q` | mount + keystrokes | dynamic |
| `analyticsApi.overview()` | `ImportDataPage.jsx:31` — full aggregate fetched to display **one number** (`total_voters`) | every mount | dynamic but overkill |

Dead code found along the way: `components/VoterAreaPicker.jsx` is imported by nothing.

---

## 4. Recommendation: TanStack Query v5 — and no UI store

**Adopt `@tanstack/react-query` v5** (plus `@tanstack/react-query-devtools` in dev). Why:

- Every problem in §3 is a **server-cache** problem — dedup, staleness, invalidation,
  retry, cancellation. That is precisely this library's domain. It works in plain JSX
  (no TypeScript required), costs ~13 kB gzipped, and the devtools make the cache visible —
  valuable for a team adopting this pattern for the first time.
- It deletes code: the hand-rolled effects, cancelled flags, `JSON.stringify` keys,
  debounce+cancel triplication in `AnalyticsPage`, the `refreshKey` bus, the three
  reset-on-candidate blocks, and reload-as-retry all disappear into `useQuery`/`useMutation`.

**Alternatives considered and rejected:**

- **SWR** — would also work, but mutation → targeted invalidation is first-class in TanStack
  Query and bolted-on in SWR, and our biggest structural fix (§7) is exactly that flow.
  Devtools story is also weaker.
- **Hand-rolled TTL cache in `src/api/client.js`** — solves the static-data duplication only.
  We would then reimplement invalidation-on-mutation, per-candidate scoping, retry, and
  cancellation ourselves, without devtools. Not worth owning that code.
- **Redux / Zustand** — **not recommended, deliberately.** The exploration found no genuine
  shared *client* state: everything shared across pages is server data (cache problem), and
  everything else is either auth/session (already in `AuthContext`, which stays) or
  correctly page-local UI state (`navScope`, `filters`, `pinnedVoter`, `mobilePanel` — fine
  as `useState`). Adding a store would create a second source of truth with nothing to hold.

---

## 5. Query-key convention

Scope every candidate-owned query under the candidate id so tenant data can be invalidated
or cleared as one subtree. Centralize keys in a small factory (plain JSX has no type checker
to catch key typos):

```js
// src/api/queryKeys.js
export const keys = {
    candidate:   (cid) => ['c', cid],                              // clear() target on switch
    geoOptions:  (cid, wards = []) => ['c', cid, 'geoOptions', wards],
    wards:       (cid) => ['c', cid, 'wards'],
    villages:    (cid) => ['c', cid, 'villages'],
    layerSource: (cid, layerId, ancestors) => ['c', cid, 'layer', layerId, ancestors],
    voterPins:   (cid, scope) => ['c', cid, 'pins', scope],
    analytics:   (cid, endpoint, filters) => ['c', cid, 'analytics', endpoint, filters],
    candidates:  () => ['candidates'],                             // global — not tenant-scoped
};
```

Objects/arrays go **directly into keys** (v5 hashes them deterministically) — this replaces
every `JSON.stringify(obj)` dependency hack in one move.

Tenant constraint worth knowing: `AuthContext.switchCandidate` swaps the **JWT** (a new token
per candidate) and the axios interceptor in `src/api/client.js` reads the token from
localStorage per request — so once a switch persists, new requests already carry the new
tenant. Candidate-scoped keys make it impossible for a query fired under the old candidate to
be served to the new one.

---

## 6. staleTime tiers

Export three named tiers next to the key factory and tag every query with one:

| Tier | `staleTime` / `gcTime` | Applies to |
|---|---|---|
| `STATIC` | `Infinity` / 24 h | `geoOptions`, `wards`, `villages`, layer/building GeoJSON, layer definitions. Changes only on data import — invalidate explicitly after `ImportDataPage` commits. |
| `REFERENCE` | 5 min / 30 min | `candidatesApi.list`, `adminApi.listUsers`, canvasser lists, filter option lists. |
| `LIVE` | 0–30 s | Voter pins, canvass records, survey stats, analytics aggregates. Correctness comes from **invalidation on mutation** (§7), not from staleTime. |

```js
export const TIER = {
    STATIC:    { staleTime: Infinity,   gcTime: 24 * 60 * 60 * 1000 },
    REFERENCE: { staleTime: 5 * 60000,  gcTime: 30 * 60000 },
    LIVE:      { staleTime: 0 },
};
```

---

## 7. Mutations → targeted invalidation (replaces `refreshKey`)

Canvass submit is the flow that motivated the `refreshKey` bus. With a query cache it becomes:

```js
// DynamicCanvassing.jsx — before: setListRefreshKey(k => k + 1), drilled into
// DynamicMap + FilteredVoterListPanel + this page's own pin/stat effects.
const qc = useQueryClient();
const submitCanvass = useMutation({
    mutationFn: canvassingApi.submit,
    onSuccess: () => {
        const cid = candidate.candidate_id;
        qc.invalidateQueries({ queryKey: ['c', cid, 'pins'] });
        qc.invalidateQueries({ queryKey: ['c', cid, 'voters'] });
        qc.invalidateQueries({ queryKey: ['c', cid, 'stats'] });
    },
});
```

Consequences:

- `refreshKey` / `listRefreshKey` props and the per-page reset blocks are deleted; only the
  components that own a query re-render.
- `ErrorState` retry becomes `refetch()` instead of `window.location.reload()` in the 5
  affected files.
- Data import (`ImportDataPage`) gets the same treatment: on successful commit, invalidate
  the `STATIC` subtree so geo layers/options refresh without a reload.

---

## 8. In-app candidate switching

Today: `switchCandidate()` persists the new token, then `window.location.assign('/dashboard')`
reloads the entire app — bundles, auth revalidation, and all initial fetches — because a
reload is the only available cache-clear. With candidate-scoped keys the switch becomes a
client-side transition:

```js
await switchCandidate(candidateId);   // swaps JWT + localStorage (unchanged)
queryClient.clear();                  // or removeQueries({ queryKey: ['c', oldId] })
refresh();                            // AuthContext revalidates /auth/me → setState
navigate('/dashboard');
```

The "half-rendered tree" race that motivated the reload (see the comment in
`AuthContext.jsx:101-104`) disappears: queries under the old candidate's key subtree are
gone, and new queries can only be created under the new id. This is the last phase of the
migration (§9) because it requires Phases 1–4 to have candidate-scoped all data first.

---

## 9. Migration phases (each independently shippable)

| Phase | Work | Files | Impact |
|---|---|---|---|
| **0 — Quick wins (no library)** | Fix the §10 items | `SurveyDataPage.jsx`, `DynamicFilterPanel.jsx`, `ImportDataPage.jsx`, delete `VoterAreaPicker.jsx`, add `src/hooks/useDebounce.js` | Removes the worst per-page waste today; zero risk; no dependency |
| **1 — Provider + shared reference hooks** | Install react-query; `QueryClientProvider` in `src/main.jsx`; add `src/api/queryKeys.js` + `src/hooks/queries/` (`useGeoOptions`, `useWards`, `useVillages`, `useCandidates`, `useActiveUsers`); convert their call sites | `GeoNavigator.jsx`, `DynamicMap.jsx:194`, `AnalyticsPage.jsx:151`, `UrbanDashboard.jsx`, `UrbanCanvassingPage.jsx`, `RuralDashboard.jsx`, `RuralCanvassingPage.jsx`, `CandidateSwitcher.jsx`, `CandidatesListPage.jsx`, `PoliticalCandidatesPage.jsx` | Kills every simultaneous-duplicate fetch of static data (incl. the double unbounded `GROUP BY` per dashboard load); candidates list stops refetching on every route change |
| **2 — AnalyticsPage** | Convert the 10 requests (`AnalyticsPage.jsx:162-210`) to `useQuery` with filter-parameterized keys; delete the 3 duplicated debounce+cancel blocks | `AnalyticsPage.jsx` | Back-navigation renders instantly from cache; filter changes refetch only what changed; biggest single-page complexity reduction |
| **3 — Map layer cache** | Replace `dataByLayer` with `useQuery(keys.layerSource(...))` at `STATIC` tier; same for the Urban wards→areas→buildings cascade | `DynamicMap.jsx`, `UrbanDashboard.jsx`, `UrbanCanvassingPage.jsx` | Drill down/up/down and dashboard↔canvassing toggles become cache hits on the **largest payloads**; deletes the map's reset-on-candidate block |
| **4 — refreshKey → invalidateQueries** | Convert pins/stats/list queries; canvass submit becomes `useMutation` (§7) | `DynamicCanvassing.jsx`, `DynamicDashboard.jsx`, `DynamicMap.jsx`, `FilteredVoterListPanel.jsx` | Precise invalidation; deletes the counter props, reset blocks, and reload-retries |
| **5 — In-app candidate switch** | §8 flow in both switchers | `CandidateSwitcher.jsx`, `VolunteerCandidateSwitcher.jsx`, `AuthContext.jsx` | Candidate switch drops from full app reload to a client-side transition |

---

## 10. Quick wins that need no library (fix regardless)

1. **`SurveyDataPage.jsx:74-79`** — the debounce effect also runs at mount, so
   `stats` + `voterRecords` each fire **twice** on every load; and `stats` is refetched on
   every keystroke though it doesn't depend on the search term. Split the effects and skip
   the debounce's first run.
2. **`DynamicFilterPanel.jsx:63-99`** — refetch only the filters whose `depends_on` parent
   actually changed; parentless filters' options can never change and are currently
   refetched (at `limit: 5000`) on every value change.
3. **`ImportDataPage.jsx:31`** — don't fetch the full `/analytics/overview` aggregate to
   display `total_voters`; use a lighter existing endpoint or accept the candidate row's
   stats.
4. **Delete `components/VoterAreaPicker.jsx`** — dead code, imported by nothing.
5. **Hoist `useDebounce`** (duplicated in `FilteredVoterListPanel.jsx:18-24` and
   `VoterListPanel.jsx:31-37`) into `src/hooks/useDebounce.js`.

---

## 11. What will NOT change

- **`AuthContext` stays** the owner of `{token, user, candidate}` — identity is client
  state, not server cache. Its localStorage persistence and the axios interceptor are
  untouched (the switch flow only changes in Phase 5).
- **Presentational components untouched** — `WardMultiSelect`, `VoterAreaMultiSelect`,
  `ActiveFilterChips`, chart components, list rows, etc. are props-only today and remain so;
  only data-fetching containers migrate.
- **No server changes.** (Out of scope but worth a future ticket: a labels-only variant of
  `layersApi.fetchSource` so `VolunteerManagementPage.jsx:357` and `ImportDataPage.jsx:155`
  stop downloading full geometry to derive dropdown labels.)
- **`useApi.js`** is deprecated by attrition (2 consumers), not rewritten.

---

## Appendix: shared-hook sketch

```js
// src/hooks/queries/useGeoOptions.js
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthContext.jsx';
import * as votersApi from '../../api/voters.js';
import { keys, TIER } from '../../api/queryKeys.js';

export function useGeoOptions(wards = []) {
    const { candidate } = useAuth();
    return useQuery({
        queryKey: keys.geoOptions(candidate?.candidate_id, wards),
        queryFn: () => votersApi.geoOptions(wards),
        enabled: !!candidate,
        ...TIER.STATIC,
    });
}
```

`GeoNavigator`, `DynamicMap`, and `AnalyticsPage` all call this hook; the three simultaneous
requests they fire today collapse into one shared cache entry, and a candidate switch (or a
post-import invalidation) refreshes it for all three at once.
