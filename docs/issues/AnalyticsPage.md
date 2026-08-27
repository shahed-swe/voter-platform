# Analytics Page — Full Implementation Spec

**Route:** `http://localhost:2000/panchagarh/analytics.html` (served by `server.js:1032` → `public/analytics.html`)
**Stack:** Express + better-sqlite3 (`election_data.db`, WAL) · vanilla multi-page HTML (no framework, no bundler) · Chart.js 3.9.1, Leaflet 1.9.4, jsPDF 2.5.1, html2canvas 1.4.1 (all CDN) · JWT auth in `localStorage`
**Purpose of this doc:** (1) full analysis of the current page, (2) complete API list — reuse vs. fix vs. create, (3) client-side architecture design, (4) an implementation prompt that can be executed without breaking existing functionality.

---

## PART 1 — Current State Analysis

### 1.1 Page shell & auth

- `<base href="/panchagarh/">` (`public/analytics.html:7`) — all relative URLs resolve under `/panchagarh/`; API calls are root-absolute (`/api/...`).
- Auth: `public/js/auth-guard.js?v=2` loaded first. Reads `localStorage.user` + `localStorage.token` (JWT, 7-day expiry, payload `{user_id, email, role, name}`), redirects to `/panchagarh/login.html` if missing. Roles: `admin`, `sub_admin`, `volunteer`. `authGuard.manageNavbarVisibility()` hides analytics/dashboard/admin links for volunteers.
- Navbar (`analytics.html:43–100`): BSAR + Centrist Nation branding, buttons **পিডিএফ রিপোর্ট** (`#exportPdfBtn`), **সিএসভি ডেটা** (`#exportCsvBtn`), nav links ড্যাশবোর্ড → `election-results.html`, ক্যানভাসিং → `canvassing.html`, বিশ্লেষণ → `analytics.html` (active), user block + `#logoutBtn`, hamburger + `#mobileMenu` (mobile export/logout duplicated there).
- CSS: `public/css/analytics_style.css` + `public/css/_navbarAnalysisStyle.css`. Green primary `#2E7D32`, cards 12px radius, tabs with green underline, breakpoints 1024/768/480px. **No CSS custom properties, no Bengali web font** (Bengali TTF embedded only inside the PDF exporter as a 609KB base64 line — 79% of the file).

### 1.2 Filter section (ফিল্টার) — `analytics.html:180–241`

| Control | Element | Sent as | Server param |
|---|---|---|---|
| শুরুর তারিখ | `#startDateInput` (date) | `startDate=YYYY-MM-DD` | `startDate` |
| শেষ তারিখ | `#endDateInput` (date) | `endDate=YYYY-MM-DD` | `endDate` |
| ভোটার এলাকা | `#villageSearchInput` + `#villageDropdown` (typeahead + multi-checkbox) | repeated `village_id=<id>` | `village_id` (array) |
| ক্যানভাসার | `#canvasserSearchInput` + `#canvasserDropdown` (same pattern) | repeated `canvasser_id=<id>` | `canvasser_id` (array) |
| আয়ের স্তর | `#incomeBracketFilter` (select) | `income_bracket=` | `income_bracket` — values `Low`, `Lower-Middle`, `Middle`, `Upper-Middle`, `High`, `Prefer not to say` |
| উৎস (Source) | `#sourceFilter` (select) | `source=` | `source` — `Primary` \| `Secondary` |
| রিসেট | `#resetFiltersBtn` | — | clears everything |

Behavior: **no Apply button — auto-apply** on every `change` (including every checkbox tick → full 8-endpoint reload, no debounce, no AbortController). Dropdown search is client-side substring filtering over pre-loaded options. Default date range = last 30 days (`setDefaultDates()` `:485`), but see bug F2 below.

Dropdown options come from the analytics endpoints themselves: `loadVillageOptions()` `:650` → `GET /api/analytics/village-performance?limit=500`; `loadCanvasserOptions()` `:672` → `GET /api/analytics/canvasser-performance?limit=500`. Consequence: villages/canvassers with zero canvassing can never be selected (self-referential dropdowns).

### 1.3 Tabs — `switchTab()` `:468`, badges `updateTabBadges()` `:1311`

**Tab 1 — সারসংক্ষেপ (Overview), badge = `overview.data.voters_visited` (1,447)**

Six metric cards (`renderMetrics()` `:774`, from `/api/analytics/overview`):

| Card | Field |
|---|---|
| TOTAL VOTERS | `data.total_voters` (respects only village filter by design) |
| CANVASSED | `data.voters_visited` |
| PENDING FOLLOW-UP | `data.follow_up_needed` |
| STRONG SUPPORT (5★) | sum of `support_breakdown` where `rating === 5` |
| UNDECIDED | sum where `is_undecided \|\| rating === 3` |
| ACTIVE CANVASSERS | `data.active_canvassers` |

Six charts (`renderCharts()` `:815`, Chart.js, registry `charts{}` destroyed/recreated per render):

| Canvas | Type | Data source → fields |
|---|---|---|
| `#supportChart` সমর্থন বিভাজন | doughnut | `support-distribution` → parallel arrays `labels[]/counts[]/ratings[]/total`; star colors `1:#d32f2f 2:#ff9800 3:#fbc02d 4:#8bc34a 5:#2e7d32 undecided:#9e9e9e` |
| `#genderChart` জেন্ডার বিতরণ | horizontal bar | `demographics.gender` map |
| `#ageChart` বয়স বিতরণ | bar | `demographics.age_brackets` map (18-24 … 65+) |
| `#incomeChart` আয়ের স্তর | doughnut | `demographics.income_brackets` map |
| `#trendsChart` ক্যানভাসিং প্রবণতা | line, dual Y | `daily-trends` → `dates[]`, `canvasses_per_day[]`, `unique_voters_per_day[]` |
| `#occupationChart` শীর্ষ পেশা | bar | `demographics.top_occupations[{occupation,count}]` (top 10) |

**Tab 2 — সমস্যা (Issues), badge = `issues.data.length` (262)**
`renderIssuesTable()` `:1136` → `#issuesTableContainer`. Columns: `Voter Name | SOS ID | Voter Area | Issue/Concern (50-char truncate) | Canvasser | Support Level | Date`. No pagination/sorting. Support Level currently always `-` (bug B5).

**Tab 3 — ক্যানভাসার কর্মক্ষমতা (Canvasser Performance), badge = `canvasserPerformance.data.length` (26)**
`renderCanvasserTable()` `:1269` → `#canvasserTableContainer`. Columns: `Canvasser Name | Total Canvasses | Unique Voters | Strong Support (green badge) | Follow-ups | Active Days`.

**Tab 4 — ক্যানভাসিং ডেটা (Canvassing Data), badge shows 20 — WRONG (bug F3)**
`renderVillageTable()` `:1185` (misnamed — renders per-voter canvassing records from `/api/analytics/canvassing-records`). 13 columns: `☑ select-all | Voter Name | Voter ID | Gender | Age | Support Level | Income Level | Issues/Concerns | Voter Area | Canvasser | Images | Audio Records | Date`. Media buttons open `showMediaModal()` `:3235` streaming from `/api/media/serve/:media_id`. Select-all drives nothing (dead bulk-download feature). No pagination — renders every record in one `innerHTML`.

### 1.4 Exports (both 100% client-side; **zero server export endpoints exist**)

- **PDF** — `exportPDF()` `:2228`: jsPDF + embedded Bengali TTF + html2canvas chart snapshots + offscreen Leaflet map snapshot (`generateMapSnapshot()` `:1786`: village polygons colored by population, voter dots colored by support level, hardcoded 2s sleep). Pages: header + 4 metrics + map → charts (2/row) → voter table (first 20 rows) → village table (15) + canvasser table (15) → footer.
- **CSV** — `exportCSV()` `:3042`: refetches `GET /api/canvassing/voter-records` and hand-builds a CSV with metadata preamble + summary tallies. **Currently dead** — the endpoint 500s (bug B4) and the function reads filter elements (`#villageFilter`/`#canvasserFilter`) that no longer exist (bug F1).

### 1.5 Known defects (verified against code)

**Frontend (`public/analytics.html`):**
- **F1** `exportCSV` reads non-existent legacy elements `#villageFilter`/`#canvasserFilter` (`:3049–3067`) → filters never apply to CSV; also uses plural param names `village_ids`/`canvasser_ids` unlike analytics endpoints.
- **F2** First-load race (`:425–431`): `loadAnalyticsData()` runs before `setDefaultDates()`, and defaults are written only to the DOM, never into `filters` → the initial request is **all-time** while inputs show a 30-day range.
- **F3** Tab-4 badge counts `villagePerformance.data.length` (server LIMIT default 20) instead of `canvassingRecords.count` → badge "20" is an artifact.
- **F4** Issues table Support Level always `-` (API omits `support_level`; see B5).
- **F5** `badge-danger` class used (`:1226`) but not defined in `analytics_style.css`.
- **F6** Duplicate DOM ids `exportPdfBtn`/`exportCsvBtn` (navbar vs. Tab 4 `:377/380`) — in-tab buttons inert.
- **F7** Mobile logout / mobile user info never wired (`auth-guard.js` only binds `#logoutBtn`/`#userNameDisplay`/`#userRoleDisplay`/`#userAvatar`).
- **F8** Every checkbox tick triggers a full 8-endpoint reload; no debounce, no request cancellation → out-of-order responses can clobber state.
- **F9** No `r.ok`/401 handling anywhere — auth expiry silently renders blank charts instead of redirecting to login.
- **F10** XSS: all tables/dropdowns interpolate raw API strings into `innerHTML` (voter names, `issues_concerns`, `title` attributes).
- **F11** Dead code: ~435-line commented-out old `exportPDF` (`:1334–1769`), duplicate `loadAnalyticsData` (`:580` shadowed by `:2454`), duplicate `addPDFHeader` (`:2522`/`:2704`, never called), unused `addFilterInfo`, unused `selectedMediaIds`/`#downloadSelectedMediaBtn`.
- **F12** UI chrome is Bengali but ALL data labels, stat-card labels, table headers, toasts are English; digits are Latin.
- **F13** `localStorage.username` read for PDF filename (`:2400`) but never written by login → always falls back to `'user'`.
- (`public/an.html` and root `analytics.html` are superseded legacy copies — do not build from them.)

**Backend (`server.js`):**
- **B1** `endDate` off-by-one: `overview`, `support-distribution`, `demographics`, `village-performance`, `canvasser-performance` compare `c.canvass_date <= 'YYYY-MM-DD'` as a raw string against `'YYYY-MM-DD HH:MM:SS'` → the entire end date is excluded. (`issues`/`canvassing-records`/`daily-trends` use `DATE()` and are correct → same range gives different totals across tabs.)
- **B2** `village-performance` (`:5726`): date/income/source/canvasser conditions in `WHERE` turn the `LEFT JOIN canvassing` into an inner join → `total_voters` collapses to canvassed-only and `canvass_percentage` ≈ 100% for every village whenever a date filter is set. Conditions belong in the `ON` clause.
- **B3** `overview.status_breakdown` + `follow_up_needed` (`:5351–5369`) count one row per canvass (voter canvassed 3× counts 3×); needs `COUNT(DISTINCT v.voter_id)`.
- **B4** `GET /api/canvassing/voter-records` (`:4602`) selects `v.income_bracket` — column lives on `canvassing`, not `voters` → **always 500**. This kills CSV export.
- **B5** `issues` query (`:5955`) doesn't select `c.support_level` (frontend reads it) and aliases villages as `vl` while `buildRegionFilter` emits `vil.mauza` → 500 for mauza-assigned users. `support-distribution` and `canvasser-performance` never join `villages` at all → same mauza crash.
- **B6** `daily-trends` (`:5853`) silently ignores `village_id`, `canvasser_id`, `income_bracket` (frontend sends them); drops the computed `active_canvassers` column; hardcodes `LIMIT 30` applied before reversing.
- **B7** `canvassing-records` (`:6018`): N+1 media query per record AND inlines full base64 photo/audio blobs into JSON that the UI discards (it re-fetches via `/api/media/serve/:id`). Unbounded, unpaginated.
- **B8** All 8 analytics endpoints use inline `jwt.verify(token, process.env.JWT_SECRET)` instead of the `verifyToken` middleware → expired/invalid token returns **500 instead of 401**, and they break entirely if `JWT_SECRET` env is unset (middleware routes have a fallback).
- **B9** `canvasser-performance` aggregates the legacy `support_level` string while everything else uses `support_rating`; ignores the `limit` param the client sends.
- **B10** `GET /api/canvassing/all-locations` (`:4518`) reads no `req.query` → PDF map always plots ALL voter dots regardless of filters. `/api/canvassing/stats`, `/api/villages/stats`, `/api/villages/geometry` have **no auth at all**.
- **B11** No cache headers on any analytics endpoint; `village-performance` logs full SQL per request; 500 bodies leak raw SQL error text.
- **B12** Data gaps to be aware of: 46,385 of 262,373 voters have `NULL village_id` (invisible to village-keyed analytics); `voter_area` is the real assignment unit (150/153 assignments) yet **no analytics endpoint accepts a voter_area filter**; the 2M-row `voter_village_mapping` table is unused by analytics.

### 1.6 Support-level data model (canonical — memorize this)

`canvassing.support_rating` INT 1–5 + `is_undecided` BOOL (rating NULL when undecided). Write path (`server.js:4125`) dual-writes text `support_level`:
`1 = Strong Against · 2 = Lean Against · 3 = Undecided · 4 = Lean Support · 5 = Strong Support` — **1 star is strongest opposition**. Analytics labels: `"5 Stars (Strong Support)"` etc., `"Undecided"` when `is_undecided=1`. Live distribution: 5★ 881, 4★ 444, 3★ 81, 2★ 46, 1★ 31, undecided 116.

---

## PART 2 — API Inventory for the Analytics Page

### 2.1 REUSE AS-IS (behavior correct, keep contract)

| Endpoint | Line | Purpose | Response shape |
|---|---|---|---|
| `GET /api/analytics/issues` | 5940 | Tab 2 table | `{success, data:[{canvass_id, sos_vid, voter_name, village_id, village_name, issues_concerns, canvass_date, canvasser_name, support_rating, is_undecided, source}], count}` — filters: dates (correct `DATE()`), village_id[], canvasser_id[], source |
| `GET /api/media/serve/:media_id` | 5158 | media modal streaming | binary stream |
| `GET /api/media/canvass/:canvass_id` | 4777 | media metadata | metadata JSON |
| `POST /api/villages/geometry` | 2806 | PDF map polygons | `{success, data:{village_id: geojson}}` (⚠ add auth — see 2.2) |
| `GET /api/villages/with-voters` | 2457 | PDF map fallback | villages + counts + geometry |
| `POST /api/auth/login` / `logout` / `GET /api/auth/me` | 1078/1124/1134 | auth | standard |
| `GET /api/cache/status` | 6162 | cache invalidation poll (if adopted) | `{serverStartTime, cacheVersion, needsInvalidation}` |

Common filter contract for all `/api/analytics/*`: `startDate`, `endDate` (YYYY-MM-DD), `village_id` (repeatable), `canvasser_id` (repeatable), `income_bracket`, `source`; `Authorization: Bearer <jwt>`; envelope `{success:true, data:…}`; role scoping via `buildRegionFilter` (`server.js:536`).

### 2.2 REUSE AFTER FIXES (keep URL + response shape, fix internals)

| Endpoint | Line | Fixes required |
|---|---|---|
| `GET /api/analytics/overview` | 5229 | B1 endDate (`DATE(c.canvass_date) <= ?`), B3 distinct counts in status/follow-up, B8 → `verifyToken` |
| `GET /api/analytics/support-distribution` | 5402 | B1; B5 add `villages vil` join for region filter; B8 |
| `GET /api/analytics/demographics` | 5516 | B1; B5 join; B8; fix age CASE so NULL/under-18 don't land in wrong bracket |
| `GET /api/analytics/village-performance` | 5652 | B1; **B2 move filter conditions into JOIN ON**; B8; remove SQL console spam |
| `GET /api/analytics/canvasser-performance` | 5767 | B1; B9 aggregate on `support_rating`/`is_undecided` (keep same response field names); honor `limit`; B5 join; B8 |
| `GET /api/analytics/daily-trends` | 5853 | B6 support `village_id[]`/`canvasser_id[]`/`income_bracket`; return `active_canvassers_per_day[]`; make day-window = requested range (cap ~90) instead of blind `LIMIT 30`; B8 |
| `GET /api/analytics/canvassing-records` | 6018 | B7 drop `base64_data` (metadata only: media counts + `{media_id, file_type, mime_type, duration_seconds}`), replace N+1 with one grouped media query, **add `page`/`limit` (default 50) + `total`**; B8 |
| `GET /api/canvassing/voter-records` | 4602 | B4 `v.income_bracket` → `c.income_bracket`; accept the standard singular `village_id`/`canvasser_id` names (keep plural as aliases); add `income_bracket` + `source` filters |
| `GET /api/canvassing/all-locations` | 4518 | B10 honor the standard filter params; use `verifyToken` |
| `POST /api/villages/geometry` | 2806 | add `verifyToken` (frontend already sends Bearer) |

### 2.3 CREATE NEW

1. **`GET /api/analytics/filter-options`** (verifyToken, role-scoped, cacheable `max-age=300`)
   Replaces the self-referential dropdown bootstrap. Returns ALL selectable entities regardless of canvassing activity:
   ```jsonc
   { "success": true, "data": {
       "villages":   [{ "village_id": "…", "village_name": "…", "upazila": "…" }],
       "voter_areas":[{ "name": "…", "voter_count": 0 }],
       "canvassers": [{ "user_id": 1, "name": "…", "role": "volunteer" }],
       "income_brackets": ["Low","Lower-Middle","Middle","Upper-Middle","High","Prefer not to say"],
       "sources": ["Primary","Secondary"]
   }}
   ```
   Sources: `villages` table (role-scoped), `voters.clean_voter_area` distinct, `users` where role IN (volunteer, sub_admin, admin) AND is_active=1.

2. **`GET /api/analytics/export/csv`** (verifyToken; streams `text/csv; charset=utf-8` with UTF-8 BOM for Bengali in Excel, `Content-Disposition: attachment`). Same filter params. Replaces the fragile client-side CSV builder; honor `ENABLE_CSV_EXPORT` env flag. Client-side fallback may remain but must read the real filter state.

3. *(Optional, phase 2)* `voter_area` (repeatable) as an additional filter param on all analytics endpoints — it is the real assignment unit and covers the 46k voters with no `village_id` (filter on `v.clean_voter_area`).

### 2.4 DO NOT USE (legacy/dead — exclude from the new page)

`GET /api/canvassing/stats` (`:4707`, unauthenticated legacy), duplicate `POST /api/auth/login`/`logout` (`:3037`/`:3105`, shadowed dead code), `public/an.html` + root `analytics.html` (superseded copies).

---

## PART 3 — Client-Side Architecture Design

The app is vanilla multi-page HTML with global-scope scripts (no bundler/framework) — the new structure keeps that model but splits the 3,400-line inline script into focused modules under `public/js/analytics/`, loaded with plain `<script>` tags in order. "Types" are JSDoc typedefs (IDE checking without a build step); "hooks" are controller modules following the existing `authGuard`-style global-singleton pattern.

```
public/js/analytics/
  types.js              # JSDoc typedefs only (no runtime code)
  api.js                # fetch layer: fetchWithAuth + one function per endpoint
  store.js              # state container + pub/sub
  utils.js              # escapeHtml, debounce, formatDate, formatNumber(bn), toast
  components/
    multi-select.js     # reusable searchable checkbox dropdown (class, 2 instances)
    filter-panel.js     # reads/writes store.filters, wires all 6 controls
    tabs.js             # tab switching + badge updates
    metric-cards.js     # renderMetrics
    charts.js           # makeChart factory + 6 chart definitions + palette constants
    data-table.js       # generic escaped table renderer + pagination controls
    media-modal.js      # existing modal, extracted
  export/
    export-csv.js       # calls GET /api/analytics/export/csv (server-side)
    export-pdf.js       # existing jsPDF flow, extracted (incl. map snapshot)
  main.js               # bootstrap: init order, first load
assets/fonts/bengali-font.js   # the 609KB base64 TTF moved out of the HTML
```

`analytics.html` shrinks to markup + `<script src>` tags (auth-guard first, then types→utils→api→store→components→export→main).

### 3.1 `types.js` — data contracts (JSDoc)

```js
/** @typedef {Object} AnalyticsFilters
 * @property {string} startDate      // 'YYYY-MM-DD' | ''
 * @property {string} endDate
 * @property {string[]} village_ids
 * @property {string[]} canvasser_ids
 * @property {''|'Low'|'Lower-Middle'|'Middle'|'Upper-Middle'|'High'|'Prefer not to say'} income_bracket
 * @property {''|'Primary'|'Secondary'} source
 */
/** @typedef {Object} Overview
 * @property {number} total_voters @property {number} voters_visited
 * @property {number} visitors_percentage @property {number} follow_up_needed
 * @property {number} active_canvassers
 * @property {{rating:number|null,is_undecided:0|1,label:string,count:number}[]} support_breakdown
 * @property {{status:string,count:number}[]} status_breakdown
 */
/** @typedef {Object} SupportDistribution  // parallel arrays
 * @property {string[]} labels @property {(number|null)[]} ratings
 * @property {number[]} counts @property {number[]} percentages @property {number} total */
/** @typedef {Object} Demographics
 * @property {Object<string,number>} gender @property {Object<string,number>} age_brackets
 * @property {Object<string,number>} income_brackets
 * @property {{occupation:string,count:number}[]} top_occupations */
/** @typedef {Object} DailyTrends
 * @property {string[]} dates @property {number[]} canvasses_per_day
 * @property {number[]} unique_voters_per_day @property {number[]} active_canvassers_per_day */
/** @typedef {Object} CanvassingRecordsPage
 * @property {CanvassingRecord[]} records @property {number} total
 * @property {number} page @property {number} limit */
// …plus Issue, CanvasserPerformance, VillagePerformance, FilterOptions, MediaMeta
```

### 3.2 `api.js` — integration layer

```js
const analyticsApi = (() => {
  /** Central fetch: Bearer header, r.ok check, 401 → authGuard.logout(),
   *  unwraps {success,data}, throws ApiError(message,status) otherwise. */
  async function fetchWithAuth(url, { signal, ...options } = {}) {
    const res = await fetch(url, {
      ...options, signal,
      headers: { 'Content-Type': 'application/json',
                 'Authorization': `Bearer ${authGuard.getToken()}`, ...options.headers },
    });
    if (res.status === 401) { authGuard.logout(); throw new ApiError('Session expired', 401); }
    if (!res.ok) throw new ApiError((await res.json().catch(()=>({}))).error || res.statusText, res.status);
    const body = await res.json();
    if (body.success === false) throw new ApiError(body.error, res.status);
    return body;             // callers use body.data / body.count / body.records
  }

  /** filters → URLSearchParams; arrays emitted as repeated singular keys. */
  function buildParams(filters, extra = {}) { /* startDate, endDate,
    village_ids→village_id (repeat), canvasser_ids→canvasser_id (repeat),
    income_bracket, source, ...extra (page/limit) — skip empties */ }

  return {
    getOverview:            (f, o) => fetchWithAuth(`/api/analytics/overview?${buildParams(f)}`, o),
    getSupportDistribution: (f, o) => fetchWithAuth(`/api/analytics/support-distribution?${buildParams(f)}`, o),
    getDemographics:        (f, o) => fetchWithAuth(`/api/analytics/demographics?${buildParams(f)}`, o),
    getVillagePerformance:  (f, o) => fetchWithAuth(`/api/analytics/village-performance?${buildParams(f,{limit:o?.limit??100})}`, o),
    getCanvasserPerformance:(f, o) => fetchWithAuth(`/api/analytics/canvasser-performance?${buildParams(f)}`, o),
    getDailyTrends:         (f, o) => fetchWithAuth(`/api/analytics/daily-trends?${buildParams(f)}`, o),
    getIssues:              (f, o) => fetchWithAuth(`/api/analytics/issues?${buildParams(f)}`, o),
    getCanvassingRecords:   (f, {page=1, limit=50, ...o}={}) =>
                              fetchWithAuth(`/api/analytics/canvassing-records?${buildParams(f,{page,limit})}`, o),
    getFilterOptions:       (o) => fetchWithAuth('/api/analytics/filter-options', o),
    getCsvExportUrl:        (f) => `/api/analytics/export/csv?${buildParams(f)}`,   // opened w/ fetch→blob
    // PDF-map helpers (reused endpoints)
    getVillageGeometry:     (ids) => fetchWithAuth('/api/villages/geometry',
                              { method:'POST', body: JSON.stringify({ village_ids: ids }) }),
    getAllLocations:        (f, o) => fetchWithAuth(`/api/canvassing/all-locations?${buildParams(f)}`, o),
    getMediaUrl:            (id) => `/api/media/serve/${id}`,
  };
})();
```

### 3.3 `store.js` — state management (pub/sub, hook-style)

```js
const analyticsStore = (() => {
  const state = {
    filters: /** @type {AnalyticsFilters} */ ({ startDate:'', endDate:'',
      village_ids:[], canvasser_ids:[], income_bracket:'', source:'' }),
    filterOptions: null,
    data: { overview:null, supportDistribution:null, demographics:null,
            villagePerformance:null, canvasserPerformance:null, dailyTrends:null,
            issues:null, canvassingRecords:null },
    ui: { activeTab:'overview', recordsPage:1, recordsLimit:50,
          loading:false, error:null },
  };
  const listeners = new Map();                       // topic -> Set<fn>
  const subscribe = (topic, fn) => { /* … */ };      // topics: 'filters','data','ui'
  const setState  = (topic, patch) => { Object.assign(state[topic], patch); emit(topic); };

  let inflight = null;                               // AbortController
  const debouncedLoad = utils.debounce(loadAll, 300);

  async function loadAll() {                         // the single data "hook"
    inflight?.abort();                               // cancel stale request storm (fixes F8)
    inflight = new AbortController();
    const o = { signal: inflight.signal }, f = state.filters;
    setState('ui', { loading:true, error:null });
    try {
      const [overview, supportDistribution, demographics, villagePerformance,
             canvasserPerformance, dailyTrends, issues, canvassingRecords] =
        await Promise.all([
          analyticsApi.getOverview(f,o), analyticsApi.getSupportDistribution(f,o),
          analyticsApi.getDemographics(f,o), analyticsApi.getVillagePerformance(f,o),
          analyticsApi.getCanvasserPerformance(f,o), analyticsApi.getDailyTrends(f,o),
          analyticsApi.getIssues(f,o),
          analyticsApi.getCanvassingRecords(f,{...o, page: state.ui.recordsPage, limit: state.ui.recordsLimit}),
        ]);
      setState('data', { overview, supportDistribution, /* … */ });
    } catch (e) {
      if (e.name !== 'AbortError') setState('ui', { error: e.message });
    } finally { setState('ui', { loading:false }); }
  }

  const setFilters = (patch) => { Object.assign(state.filters, patch);
                                  state.ui.recordsPage = 1; emit('filters'); debouncedLoad(); };
  const setRecordsPage = (page) => { state.ui.recordsPage = page; /* refetch records only */ };
  return { state, subscribe, setFilters, setRecordsPage, loadAll, resetFilters };
})();
```

Rules: components never fetch — they subscribe to `data`/`ui` and re-render; filter widgets only call `setFilters`. `resetFilters()` restores the 30-day default **into state AND DOM** (fixes F2's cousin). `main.js` bootstrap order: `setDefaultDates → store.state.filters seeded → getFilterOptions → loadAll` (fixes F2).

### 3.4 `utils.js`

- `escapeHtml(s)` — used for EVERY interpolated API value (fixes F10).
- `debounce(fn, ms)` — filter changes (300ms) and dropdown search input.
- `formatNumber(n)` / `formatDate(d)` — `toLocaleString('bn-BD')` for Bengali numerals; null-safe date (`'-'` instead of `Invalid Date`).
- `showToast(message, type)` — extracted from `:3155` unchanged.
- `SUPPORT_COLORS` = the star map `{1:'#d32f2f',2:'#ff9800',3:'#fbc02d',4:'#8bc34a',5:'#2e7d32',undecided:'#9e9e9e'}` + `SUPPORT_LABELS_BN` — single source of truth for charts, badges, PDF map legend (today duplicated in 3 places).
- `LABELS_BN` — Bengali strings for stat cards / table headers / toasts (fixes F12).

### 3.5 Components

- **`multi-select.js`** — `class MultiSelect(container, {options, onChange, placeholder})`: searchable checkbox dropdown extracted from `setupVillageDropdown`/`setupCanvasserDropdown` (`:694–772`); adds debounced search, "select all / clear", selected-count chip, keyboard nav, outside-click close. Two instances (villages, canvassers) fed from `filter-options`.
- **`filter-panel.js`** — binds the 6 controls ↔ `store.filters`; reset button; renders active-filter chips.
- **`tabs.js`** — `switchTab` + `updateTabBadges` with correct sources: overview→`voters_visited`, issues→`issues.count`, canvasser→`canvasserPerformance.data.length`, canvassing→`canvassingRecords.total` (fixes F3). Lazy-render heavy tables on first tab activation.
- **`charts.js`** — `makeChart(key, canvasId, config)` factory owning the `charts{}` registry + destroy-before-create; 6 chart configs as data; shared palette from utils. Fix the duplicated `#512DA8` in the income palette.
- **`data-table.js`** — `renderTable(container, {columns, rows, renderCell, emptyText})`, all cells escaped; `renderPagination(container, {page, limit, total, onPage})` for Tab 4 (server-side) and optional client-side slicing for issues.
- **`media-modal.js`** — existing modal extracted; keeps `/api/media/serve/:id` blob flow.
- **`export/export-csv.js`** — `fetch(getCsvExportUrl(store.state.filters))` → blob → download (fixes F1). **`export/export-pdf.js`** — existing flow extracted; font loaded from `assets/fonts/bengali-font.js`; map snapshot now passes filters to the fixed `all-locations`.

### 3.6 Page skeleton after refactor

`analytics.html` keeps: `<base href="/panchagarh/">`, auth-guard first, same CSS files, same navbar/mobile-menu markup (add the mobile logout/user wiring in `main.js` — fixes F7), same filter/tab/card/chart/table containers and element IDs (so CSS and muscle memory survive), Tab-4 duplicate-ID buttons removed (F6), `badge-danger` CSS added (F5).

---

## PART 4 — Implementation Prompt

> Copy everything below into the implementing session. It assumes the repo at `/home/limon/Desktop/k53/panchagar`, app running via `node server.js` (or PM2 `panchagarh-app`) on port 2000, login at `/panchagarh/login.html`.

---

**TASK: Fully implement the Analytics page (`/panchagarh/analytics.html`) — backend fixes + new endpoints + frontend modular refactor — without breaking any existing page (`canvassing.html`, `election-results.html`, `admin.html`, `login.html`).**

Read `analyticsPage.md` (this file) first; Part 1 is the ground truth of current behavior, Part 2 the API contract, Part 3 the target client architecture. Follow the bug IDs (B1–B12, F1–F13) referenced there.

### Ground rules
1. Do NOT change any endpoint's URL or success-response field names unless this spec says so — `election-results.html` and `canvassing.html` share some of them. Additive changes only (`page`/`limit`/`total` are additions; `base64_data` removal from `canvassing-records` is approved since the UI provably discards it).
2. Keep the multi-page vanilla-JS architecture: global-singleton modules loaded via `<script>` tags with `<base href="/panchagarh/">`, no bundler, no framework, no npm frontend deps.
3. Keep `verifyToken` semantics: 401 `{success:false, error}` for auth failures; 500 must no longer leak raw SQL messages on analytics routes (log server-side, return a generic message).
4. Preserve role scoping via `buildRegionFilter(userId, userRole)` on every analytics query — after your changes it must work for `voter_area`, `mauza`, `upazila`, `union`, and `village` assignment types (this requires the `villages vil` join everywhere the filter is applied).
5. All new/changed SQL must use parameterized queries (better-sqlite3 `prepare(...).all(...)`), matching existing style.
6. Do not touch `election_data.db` data. Do not modify `an.html` or root `analytics.html` (legacy, unused).

### Phase A — Backend fixes (server.js)
1. Create one shared helper `buildAnalyticsFilter(query, {aliases})` used by all 8 `/api/analytics/*` handlers, implementing the common params (`startDate`, `endDate`, `village_id[]`, `canvasser_id[]`, `income_bracket`, `source`) with `DATE(c.canvass_date) >= ? / <= ?` (fixes B1) and reusing `buildMultiValueFilter` (`server.js:5214`).
2. Switch all 8 analytics handlers + `/api/canvassing/all-locations` + `POST /api/villages/geometry` to the `verifyToken` middleware (B8, B10-auth). Keep inline role scoping logic, now reading `req.user`.
3. Fix per-endpoint bugs exactly as listed in Part 2.2: B2 (village-performance JOIN ON), B3 (overview distinct counts), B5 (support_level in issues select + `villages vil` joins in support-distribution/canvasser-performance/issues), B6 (daily-trends full filter support + `active_canvassers_per_day` + range-driven window capped at 90 days), B7 (canvassing-records: metadata-only media via ONE grouped query, `page`/`limit` defaults 1/50, `total` in response), B9 (canvasser-performance on `support_rating`, honor `limit`), B4 (voter-records `c.income_bracket` + singular param aliases + income/source filters).
4. New `GET /api/analytics/filter-options` per Part 2.3 (verifyToken, role-scoped, `setCacheHeaders(res, 300)`).
5. New `GET /api/analytics/export/csv` per Part 2.3 (UTF-8 BOM, attachment header, same filters, respects `ENABLE_CSV_EXPORT`).
6. Remove the per-request SQL `console.log` spam in village-performance/voter-records (B11).

### Phase B — Frontend refactor (public/)
1. Create `public/js/analytics/` + `public/assets/fonts/bengali-font.js` exactly per Part 3's module layout; move the base64 font out of the HTML.
2. Rewrite `public/analytics.html` as markup-only (keep all existing element IDs, navbar, mobile menu, filter/tab/card/chart/table containers; remove Tab-4 duplicate export buttons F6; keep CSS links; add `badge-danger` style F5).
3. Implement `api.js`, `store.js` (AbortController + 300ms debounce, F8), `utils.js` (escapeHtml everywhere F10, Bengali labels/digits F12, null-safe dates), and the components per Part 3.5 — porting, not reinventing, the existing render logic (metric cards `:774`, six charts `:824–1129`, three tables `:1136–1310`, media modal `:3235`, PDF export `:2228` incl. map snapshot `:1786`).
4. Bootstrap order in `main.js`: seed default 30-day dates INTO store state → fetch filter-options → single `loadAll()` (fixes F2). Wire mobile user-info/logout (F7) and 401→login redirect (F9). Correct all four tab badges (F3), issues Support Level column now renders from the fixed API (F4), CSV button uses the server endpoint with real filter state (F1). Drop all dead code listed in F11/F13.
5. Filter behavior: auto-apply stays, but debounced + cancellable; multi-select dropdowns get select-all/clear + count chip; reset restores 30-day defaults in both state and DOM.
6. Tab 4 gets pagination controls (server-side, 50/page, showing `total`).

### Phase C — Verification (must all pass before done)
1. `node server.js` boots clean; login as admin (existing seeded user) at `http://localhost:2000/panchagarh/login.html`.
2. API checks with curl + Bearer token: each of the 8 analytics endpoints returns 200 with the documented shape; expired/garbage token → **401** (not 500); `endDate=<date with data>` now includes that day (compare overview `voters_visited` before/after a known boundary date, e.g. `endDate=2026-02-06` must include the Feb 6 records); `village-performance` with a date filter shows sane `canvass_percentage` (not ~100% everywhere); `canvassing-records?page=2&limit=50` paginates with correct `total` and contains NO `base64_data`; `filter-options` lists villages/canvassers with zero canvasses; `export/csv` downloads a BOM-prefixed CSV whose row count matches `canvassing-records` `total` under identical filters.
3. Browser (`/panchagarh/analytics.html`): first load shows 30-day-filtered data matching the date inputs; all 6 cards, 6 charts, 4 tabs with correct badges (Tab 4 badge = records total, not 20); rapid checkbox toggling fires ONE final request batch (network tab); Tab 2 Support Level column populated; media modal plays/streams; PDF downloads with Bengali text + filtered map dots; CSV respects every active filter; logout works from both desktop and mobile menu; volunteer-role login sees role-scoped data only.
4. Regression: `canvassing.html` submit flow, `election-results.html` map, and `admin.html` user management still work (they share `/api/villages/*`, `/api/canvassing/*`, auth).
5. Verify no XSS: create nothing in the DB — instead confirm every table cell path routes through `escapeHtml` (grep for `innerHTML` in `public/js/analytics/` and check each interpolation).

---

*Generated 2026-08-27 from full-codebase analysis (server.js:6242 lines, public/analytics.html:3467 lines, migrations 001–015, live DB stats).*
