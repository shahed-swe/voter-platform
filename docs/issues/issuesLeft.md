# Dhaka South — Issue Status (verified against code)

Verified on 2026-08-24 by reading the actual implementation — not just the tracker.
Checklist source: [dhakasouthapplication.pdf](dhakasouthapplication.pdf) · Tracker: [../../ISSUES.md](../../ISSUES.md) · Fix plan: [PLAN.md](PLAN.md)

**Score: 13 fully completed · 3 partially completed · 0 untouched.**

---

## ✅ Completed (verified in code)

| # | Issue | Evidence |
|---|-------|----------|
| 1 | Voter table → open canvassing form directly | `VoterCard` click → `setActiveVoter` → `CanvassFormModal` opens straight away (`client/src/pages/DynamicCanvassing.jsx:123`, same in `DynamicDashboard.jsx`) |
| 3 | Row status updates instantly after submit | `onSubmitted` bumps `setListRefreshKey` → list + counts refetch, no manual refresh (`DynamicCanvassing.jsx:173-179`, `DynamicDashboard.jsx:204-209`) |
| 4 | Per-voter building geolocation on canvass | Canvass stores `latitude/longitude/building_id` (`server/src/models/canvassingModel.js:106-135`); voter reads back `canvass_latitude` (`voterModel.js:301,321`); map pins the voter at the canvassed building (`DynamicMap.jsx:366`) |
| 5 | Analytics daily trend + top villages | `dailyTrends()` and top-villages aggregation by `voter_area_name` in `server/src/models/analyticsModel.js:128-183` |
| 6 | Colorize canvassed buildings + per-building stats | Backend adds `canvassed` / `canvass_count` per building (`geoLayerModel.js:28,55`); map colors green/blue + count in popup (`DynamicMap.jsx:69,92-96,508`); `CanvassedVotersModal` shows the voters |
| 7 | Logo links (BSAR / CN) | Both logos link back to the dashboard (`AppHeader.jsx:148-152`). Note: they link to `/dashboard`, not external BSAR/CN sites — external URLs were never provided |
| 8 | Canvasser live geolocation marker | `navigator.geolocation.watchPosition` + pulsing blue dot (`DynamicMap.jsx:42,185-197`); requires HTTPS — see note below |
| 9 | "poridorshito" count + status head-filter | Status is always derived per-candidate from the `canvassing` table, never stale `voters.status` (`voterModel.js:261`); Visited / Not visited / Follow-up tabs actually filter (`voterModel.js:311-312`; tabs in `FilteredVoterListPanel.jsx`) |
| 10 | Multi-voter (family) add in canvass form | Family search-and-add section in `CanvassFormModal.jsx:50-280`; submit saves one canvass per selected member sharing location/answers (`:117-124`) |
| 11 | Avro phonetic English→Bangla search | `client/src/utils/avroPhonetic.js` used by the voter search (`FilteredVoterListPanel.jsx:4,170`); server matches the transliterated Bangla too (`voterModel.js:243`) |
| 14 | User-creation role hierarchy (backend-enforced) | `CREATABLE_ROLES` guard enforced server-side in both `adminUserController.js:29-69` and `managementController.js:19,180` — down-hierarchy only |
| 15 | Dashboard stats zero on initial view | Stats always load, including the whole-constituency view via `stats_only` (`DynamicDashboard.jsx:52-62`) |
| 16 | Hard delete + duplicate-username error | Real `DELETE FROM users` (`userModel.js:110`); Postgres `23505` mapped to a friendly Bangla "username already used" message (`server/src/middleware/error.js:21-27`) |

---

## 🟡 Partially completed

### #2 — Mobile responsiveness
**Done:** header collapses to a mobile menu (portal above the map), map pages have
bottom toggle bars for the nav/list panels (`DynamicCanvassing.jsx:127-131`,
`lg:hidden`), canvass modal and analytics have breakpoints.
**Remaining:**
- `ManagementPage.jsx`, `AdminPage.jsx`, `ElectionResultsPage.jsx`, `FilteredVoterListPanel.jsx`
  have **zero** responsive breakpoints. They are *fluid* (`w-full`, `max-w-*`,
  `overflow-x-auto` tables) so they don't break, but they are not optimized for
  phones (2-column form grids stay 2-column, wide tables just scroll).
- Recommend a phone pass over the management/admin/results pages.

### #12 — Role-based region assignment hierarchy
**Done:** full 5-level hierarchy (super admin → candidate → campaign admin →
sub_admin → volunteer) with the unified `/management` page (`ManagementPage.jsx`);
`user_candidates` carries `allowed_wards` + `allowed_voter_areas`; the JWT carries
both (`authController.js:33-61`); **voter data queries are enforced server-side**
for both wards and voter areas (`voterController.js:24-25,121-134`) — so the
"voter-area separation in the data layer" the client asked about exists.
**Remaining gap:**
- **Geo/map layer endpoints are scoped only by candidate, not by assignment**
  (`genericGeoController.js:29`). The ward-map restriction is applied client-side
  via the `allowedWards` prop (`DynamicMap.jsx:145`). A volunteer calling the geo
  API directly could fetch other wards' shapes (voter data itself stays protected).
  Low-risk, but server-side geo scoping would close it.
- `DynamicMap` restricts by ward only — there is no `allowedVoterAreas` narrowing of
  the visible map for voter-area-scoped volunteers (their voter *list* is correctly
  narrowed).

### #13 — Email sending (SMTP)
**Done (code):** nodemailer transport (`server/src/services/emailService.js`),
`EMAIL_ENABLED` config flag (`config/index.js:39`), admin `/test-email` endpoint
(`adminRoutes.js:28`).
**Remaining (blocking):** every `EMAIL_*` value in `.env` is **empty**
(`EMAIL_ENABLED=`, `EMAIL_USER=`, `EMAIL_PASS=`, …) → email cannot send until the
Gmail address + app password are set and `EMAIL_ENABLED=true`. This is a
credentials/ops task, not a code task.

---

## ❌ Not completed

Nothing is fully untouched — every one of the 16 items has at least a working code path.
The only thing that is *functionally* not working today is **email sending (#13)**, purely
because credentials are not configured.

---

## Operational note — HTTPS (prerequisite for #4, #6, #8)

The geolocation cluster needs a secure origin. The repo ships a **Caddy reverse
proxy** (`Caddyfile`, `docker-compose.yml:108-122`, port 443) supporting a domain
with auto-TLS or a self-signed cert for a bare IP. Verify the deployed server is
actually being accessed via `https://…` — if the field team still uses
`http://IP:3000`, browsers will keep blocking geolocation regardless of the code.
