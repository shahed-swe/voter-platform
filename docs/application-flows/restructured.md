# RBAC Restructure Plan — implementing flowApplication.md

**Status:** PLAN — nothing here is implemented yet (see "Current state" for what the
database already carries from an earlier attempt).
**Spec:** [flowApplication.md](flowApplication.md) (v0.4) · **Code audited:** 2026-08-31
against commit `14e793e`.

This document is the working reference for restructuring the platform to match the
application flow: party tenancy, the corrected role hierarchy, data encapsulation,
and role-specific client views. Update it as phases are implemented (mark phases
done, note deviations).

---

## 1. Current state — read this first

- **Code** is at commit `14e793e` (pre-restructure): the old hierarchy, duplicated
  role maps, per-controller ad-hoc scoping, no party layer, no role-specific views.
- **The database is AHEAD of the code.** An earlier implementation ran and its
  migrations were applied before the working tree was reset. `schema_migrations`
  records `022_parties.sql` and `023_rbac_restructure.sql`, and their effects are
  live right now:
  - `parties` and `user_parties` tables exist; `candidates.party_id` is NOT NULL and
    every constituency belongs to party `'default'`.
  - All admin/sub_admin grants already have `political_candidate_id = NULL`.
  - `users_role_check` already allows `tenant_admin` and `donor`; three tenant_admin
    users exist (`tadmin_test` — a test fixture, plus user-created `tarek101` and
    `nahid123`, currently non-functional because the code doesn't know the role).
  - **Consequence:** the migration FILES `022_parties.sql` / `023_rbac_restructure.sql`
    must be recreated exactly (Phases 2–3) so FRESH databases build correctly; on the
    current DB the runner skips them by filename. Until Phase 2 code lands,
    tenant_admin logins stay broken — Phases 1–4 should be implemented together.

---

## 2. Gap analysis (spec vs code)

### Already implemented
- Main Admin ≈ `users.is_super_admin`; Campaign Admin ≈ role `admin`
  (constituency-scoped); Sub Admin ≈ `sub_admin` (ward-scoped); Volunteer
  (voter-area-scoped, attached to a candidate via
  `user_candidates.political_candidate_id`).
- Campaign isolation on canvassing/analytics via
  `($n::bigint IS NULL OR political_candidate_id = $n)` — rival candidates' teams
  can't see each other's surveys.
- Create-down-only hierarchy enforced server-side
  (`server/src/controllers/managementController.js`).

### Missing or wrong
| # | Gap | Spec ref |
|---|-----|----------|
| 1 | No party tenant in code. Top tenant = constituency (`candidates` table). No Tenant Admin, no party isolation, no party dashboard. | §2, §3, §12 |
| 2 | Candidate role ranks ABOVE Campaign Admin (RANK 3, creates admins). Spec: created by Sub Admin, below them, sees only own volunteers' work. | §3 |
| 3 | Sub Admin locked to ONE campaign via `pcId(req)` (`canvassingController.js`); spec says they see ALL candidates in their area. Ward/area scoping missing from `voters/search`, `voters/:id`, `by-voter-area(s)`, all 12 `analytics/*` endpoints, and geo endpoints. | §7, §11 |
| 4 | Volunteers see teammates' survey records (`voter-records`/stats filter by campaign, not user). | §4, §7 |
| 5 | Voter support history readable by any campaign member via `/canvassing/history/:voter_id`; spec restricts the cross-candidate timeline to Tenant Admin + Main Admin. | §10 |
| 6 | Entirely absent: Donor role + donations (§9), candidate selection & data handover (§8), Main Admin multi-party-volunteers view (§5), role-specific landing views (§12 — everyone lands on `/dashboard`). | — |
| 7 | Two divergent hierarchy maps (`managementController.js` vs `adminUserController.js`); JWT accepted from the query string (`middleware/auth.js`); misleading `optionalAuth` on several routers; `POST /api/people/users/search` enumerates users platform-wide. | — |

### Confirmed decisions (from the earlier planning round)
- **Full party layer now** (parties table, Tenant Admin, party dashboard).
- **Donations** (§9) and **candidate selection / data handover** (§8): included, as
  later phases.
- **Volunteer visibility — pragmatic:** volunteers keep canvassed-STATUS, history
  prefill, same-building suggestions, and map pins within their own campaign + area
  (the field features depend on them), but survey LISTS and analytics show only
  their own records.

---

## 3. Architecture decisions

1. **Party = top tenant; each `candidates` row (constituency campaign) belongs to
   one party** via `candidates.party_id`. If two parties contest the same seat, the
   platform owner creates a second constituency row and imports the roll again (the
   voter list is owner-supplied, §6/§13). This preserves all 15 `candidate_id` FK
   chains, every model WHERE clause, `filter_config`/`map_config`, and the client
   query-key factory `['c', cid, …]`. Keep the table name `candidates` and role slug
   `candidate`; document the vocabulary in the authz module.
2. **Party membership is derived, not stored on `users`** (§5: one account can serve
   several parties). Campaign/Sub/Candidate/Volunteer → `user_candidates` grants +
   `candidates.party_id`. Tenant Admin & Donor → `user_parties`. Main Admin →
   `users.is_super_admin`.
3. **Single authz source of truth** — new `server/src/services/authz.js`:
   ```
   RANK      = { super_admin:6, tenant_admin:5, admin:4, sub_admin:3,
                 candidate:2, volunteer:1, donor:1 }
   CREATABLE = { super_admin:  [tenant_admin, admin, sub_admin, candidate, volunteer, donor],
                 tenant_admin: [admin, donor],
                 admin:        [sub_admin],
                 sub_admin:    [candidate, volunteer],
                 candidate: [], volunteer: [], donor: [] }
   REGION_OF = { tenant_admin:'party', admin:'constituency', sub_admin:'ward',
                 candidate:'constituency', volunteer:'voter_area', donor:'party' }
   dataScope(req) → { partyId, candidateId, wards, voterAreas,
                      politicalCandidateId, ownUserId }
   ```
   plus a `scopeWhere(scope, params, {voterAlias, canvassAlias})` SQL-fragment
   helper consumed by every model — replacing the per-controller
   `tenant()`/`pcId()`/ad-hoc ward checks. `politicalCandidateId` is **forced null
   for admin ranks** (a stale JWT claim can never re-lock a sub admin);
   `ownUserId` is set only for volunteers and applied only where a `canvassAlias`
   is passed (survey lists) — never on prefill/status/pins paths.
4. **JWT v2 + forced re-login:** payload adds `v:2`, `party_id`,
   `parties:[{id,name,role}]`, and per-grant `party_id`. `middleware/auth.js`
   rejects `v !== 2` (stale 7-day tokens carry old authorization semantics), and
   query-string token extraction is removed. `switch-candidate` lets a tenant admin
   open only own-party constituencies.
5. **Political candidates remain users** (`role='candidate'`,
   `political_candidate_id = own user_id`); registration moves from the super-admin
   `peopleRoutes` into the Sub Admin chain in `managementController`.

### Per-role data-scope matrix

| Role | party | constituencies | wards | areas | campaign (pc) | ownUserId (lists) |
|---|---|---|---|---|---|---|
| super_admin (Main) | all/picked | all/picked | – | – | – | – |
| tenant_admin | own | all in party | – | – | **null** | – |
| admin (Campaign) | derived | granted | – | – | **null** | – |
| sub_admin | derived | active | allowed_wards | – | **null** (all candidates in area) | – |
| candidate | derived | active | – | – | self | – |
| volunteer | derived | active | allowed_wards | allowed_areas | attached candidate (status/prefill/pins only) | **self** for record lists/analytics |
| donor | own | none — no canvassing access | – | – | – | – |

Special cases outside the matrix:
- Voter support history timeline → tenant_admin + main admin only (§10).
- Multi-party volunteers view → main admin only (§5).
- Donations → donor (own) + volunteer (confirm own) + chain above (§9).

---

## 4. Implementation phases

### Phase 1 — Centralize authz + close existing scoping holes
*No schema change; ships alone as a security fix.*

- **Create** `server/src/services/authz.js` (constants + `dataScope` + `scopeWhere`
  + `narrowWards`/`narrowAreas`/`voterInScope` helpers) and
  `server/src/middleware/authorize.js` (`attachScope`, `requireRoles`).
- **Modify:**
  - `server/src/routes/index.js` — `attachScope` after `scopeToCandidate`.
  - `managementController.js` + `adminUserController.js` — delete both local
    RANK/CREATABLE maps, import authz (this unifies the two divergent hierarchies;
    `actorRole` then returns `'super_admin'` for supers — adjust
    `ensureCanManageUsers`/`deleteUser` to accept it).
  - `voterController.js` + `voterModel.js` — enforce wards/areas on
    `search/:query`, `/:voter_id` (out-of-scope reads **404**, not 403, so voter
    existence isn't leaked), `by-voter-area(s)`, `area-options`,
    `statistics/aggregated`, area stats, `listVoterAreas`.
  - `analyticsController.js` + `analyticsModel.js` — extend
    `canvassFilter(filters, params, {hasVoters, alias, scope})` with
    `v.ward = ANY(...)` / `v.voter_area_name = ANY(...)` / `c.user_id = $own`,
    plus a `voterScopeFilter` for the voters-roll subqueries in
    `overview`/`villagePerformance`; `canvasserOptions` gains a voters JOIN.
  - `canvassingController.js` + `canvassingModel.js` — `scope` option on
    `historyForVoter`/`locationsByVillage`/`allLocations`/`listVoterRecords`/
    `stats` (add the voters JOIN where missing); `voterLocations` uses
    `narrowWards`/`narrowAreas` (requested ∩ allowed, 403 on empty).
  - `genericGeoController.js` — use scope pc; document the decision: base layer
    GEOMETRY stays constituency-scoped (map shapes are public within a campaign),
    canvass-derived attributes are campaign-isolated.
  - `peopleRoutes.js` `/users/search` — non-super callers search only users
    sharing their constituencies (new `userModel.searchInCandidates`).
  - `middleware/auth.js` — drop query-string token extraction.
  - Remove `optionalAuth` from `analyticsRoutes.js`, `canvassingRoutes.js`,
    `geoRoutes.js`, `villageRoutes.js` — the global `verifyToken` in
    `routes/index.js` already guards them.
- **Verify:** client `npm run build`; `node -e "require('./server/src/app')"`;
  curl with a volunteer JWT (wards ১৬/২২ on dhaka10) → `analytics/overview`
  total_voters = 109,709 (their two wards) not 368,933; out-of-scope
  `voters/:id` → 404; `?token=` → 401; admin endpoints unchanged.

### Phase 2 — Party layer code + JWT v2 (DB already migrated)
- **Recreate `server/migrations/022_parties.sql`** (idempotent, house style):
  `parties` table; `candidates.party_id REFERENCES parties ON DELETE RESTRICT`
  (backfill `'default'`, then NOT NULL); `user_parties(user_id, party_id,
  role CHECK IN ('tenant_admin','donor'), UNIQUE(user_id, party_id, role))`;
  widen `users_role_check`. *Skipped on this DB (filename already recorded);
  required for fresh databases.*
- **Create** `server/src/models/partyModel.js` (findById / listAll w/ constituency
  counts / create / update / listForUser / listUsersForParty / grantPartyRole /
  revokePartyRole / constituenciesOf / overview aggregates),
  `partyController.js` (main-admin CRUD; tenant-admin reads own party;
  create/remove tenant admin with one-time temp password via
  `generateTempPassword` + `notificationService`), `partyRoutes.js` mounted
  pre-scope in `routes/index.js` (`/api/parties`).
- **Modify:** `authController.js` — `TOKEN_VERSION = 2`; `buildTokenPayload` adds
  party claims (`partyModel.listForUser`); login allows users with only party
  grants; `me`/login responses include `parties`/`party_id`; `switchCandidate`
  lets tenant admins into own-party constituencies only.
  `middleware/auth.js` — reject `v !== 2` ("Session outdated — please log in
  again"). `candidateModel.js` — `party_id` in PUBLIC_FIELDS/listForUser/create.
  `candidateController.js` — accept `party_id` on create.
  `middleware/scope.js` — tenant admins pass without an active constituency
  (like supers; data endpoints still throw via their `tenant()` guard).
  authz `dataScope` stamps `partyId`.
- **Client:** `api/parties.js`; `pages/admin/PartiesPage.jsx` (party grid, create
  dialog, per-party tenant-admin management with one-time temp-password display);
  route `/admin/parties` (super only); Parties link in the Admin dropdown;
  `queryKeys.js` gains `parties()` / `party(pid)` / `partyOverview(pid)` keys.
- **Verify:** old token → 401 "Session outdated"; fresh login carries `v:2` +
  party claims; existing tenant admins (`tarek101`, `nahid123`) can log in, list
  ONLY their party, get 403 reading another party / switching into its
  constituencies / creating parties; dhaka10 unchanged under `'default'`.

### Phase 3 — Role restructure server-side (the visibility flip)
- **Recreate `server/migrations/023_rbac_restructure.sql`** — dedupe-safe NULLing
  of `political_candidate_id` on admin/sub_admin grants (the natural key is
  `UNIQUE NULLS NOT DISTINCT (user_id, candidate_id, political_candidate_id)`:
  null exactly one row per (user, constituency) where no NULL sibling exists, then
  delete remaining locked duplicates) + an operator note: any `role='candidate'`
  user who actually ran a campaign must be explicitly re-granted `admin` or
  `tenant_admin`. *Skipped on this DB; required for fresh databases.*
- **Modify:** authz → final RANK/CREATABLE/dataScope (matrix above).
  `managementController.js` — `callerParties(req)`; async
  `callerConstituencies(req)` (tenant admin spans every party constituency via
  `partyModel.constituenciesOf`); `listUsers` becomes region-based (roles below
  the caller within their constituencies; sub admins see ward-overlapping people
  and always the candidates on their ground); `createUser` per-role rules —
  **admin** by tenant/super (multi-constituency grants inside the party, pc NULL);
  **sub_admin** by admin/super (wards required); **candidate** by sub_admin/super
  (pc = the new user's own id); **volunteer** by sub_admin/super (**REQUIRED**
  `political_candidate_id`, validated against a candidate grant on the selected
  constituency; wards/areas within the creator's); **donor** by tenant/super
  (`user_parties` grant, no constituency); `updateRegion` mirrors these; NEW
  `GET /api/management/candidates?constituency_id=` — the volunteer-attachment
  picker.
- `canvassingController.js` — NEW `GET /api/canvassing/voter-history/:voter_id`
  (full cross-candidate timeline, pc = null) route-gated
  `requireRoles('super_admin','tenant_admin')`; `voterRecords`/`stats` pass scope
  with `canvassAlias` so volunteer lists narrow to own rows; `history/:voter_id`
  stays campaign-scoped (prefill preserved).
- `peopleController.js` — volunteer WRITE endpoints become super-only
  (`requireVolunteerWrite`; volunteers are managed by their Sub Admin via
  /management); candidates keep READ access to their own volunteers (§12).
- **Verify:** sub admin sees all campaigns' records within their wards (31 across
  2 campaigns on dhaka10); candidate A cannot see candidate B; volunteer
  voter-records = own rows only (a "ghost" volunteer JWT with no submissions gets
  0 of 31) while prefill still returns campaign history; voter-history 403 for
  volunteer / 200 cross-campaign for main admin; tenant context creatable =
  [admin, donor], sub context = [candidate, volunteer]; volunteer creation
  without attachment → 400; sub creating admin → 403.

### Phase 4 — Client role-specific views
- **Create** `client/src/auth/roleHome.js` — `isTenantAdmin(user)` +
  `roleHome(user)`: main→`/admin/parties`, tenant→`/party`,
  admin/sub/candidate→`/dashboard`, volunteer→`/canvassing`, donor→`/donor`.
- `App.jsx` — index route becomes `<RoleLanding/>` (Navigate to roleHome); data
  routes (`/dashboard`, `/canvassing`, `/analytics`, `/survey-data`,
  `/election-results`) gated to `DATA_ROLES = [tenant_admin, admin, sub_admin,
  candidate, volunteer]` (donor excluded — §9: donors see no canvassing data);
  `/party` (tenant_admin), `/donor` (donor), `/management` → [tenant_admin,
  admin, sub_admin]. `ProtectedRoute.jsx` — honors tenant_admin party grants and
  redirects failures to `roleHome(user)` instead of `/dashboard`.
- **Create** `pages/party/PartyDashboardPage.jsx` — party totals + one card per
  constituency (voters/visited/canvasses/canvassers/volunteers/candidates +
  completion bar), drill-in via the existing `switchCandidate` full-reload to
  `/dashboard` or `/analytics`. **Create** `pages/donor/DonorProfilePage.jsx` —
  profile shell (real donations arrive in Phase 6).
- `AppHeader.jsx` — single exported `navForRole(user)`: super = full nav + Admin
  dropdown; tenant = Party link + main nav + Team; admin/sub = main nav + Team;
  candidate = main nav + Volunteers link; volunteer = Dashboard/Canvassing/
  Survey-Data only; donor = profile only. Role label shows Main/Tenant/Campaign
  Admin. Delete the stale unused `components/Navbar.jsx`.
- `ManagementPage.jsx` — tenant_admin/donor labels + badges; volunteer creation
  gets the REQUIRED candidate-attachment picker (`mgmt.candidatesOf` — new fn in
  `api/management.js` hitting `/management/candidates`), with an empty-state hint
  when no candidate is registered yet; donor creation hides constituency and (for
  super) shows a party select; volunteer rows display their attached candidate.
- **Verify:** build; browser login walk-through per role (landing, nav, data
  narrowing) — done by the user.

### Phase 5 — Voter support history + multi-party volunteers (later)
- Tenant/Main: voter-history timeline UI (drawer/modal fed by
  `/canvassing/voter-history/:id`) + a "persuadable voters" list (voters with >1
  visit and changed support) in analyticsModel; Main-Admin cross-party variant
  matches voters across constituency rows by voter number/NID (best-effort —
  document the accuracy caveat).
- `GET /api/admin/multi-party-volunteers` (users whose grants span >1 `party_id`)
  + a main-admin page (§5).

### Phase 6 — Donations (later)
- Migration `024_donations.sql`: `donations(party_id, donor_user_id,
  volunteer_user_id, candidate_id NULL, amount, note,
  status CHECK('recorded','confirmed') DEFAULT 'recorded', recorded_at,
  confirmed_at)`.
- Server: donor creates + lists own; volunteer lists own + independently confirms
  (§9); tenant/main read the party ledger; the donor volunteer-finder returns
  name + area ONLY (§13 — no canvassing data).
- Client: DonorProfilePage becomes real (list + totals + give-donation flow);
  volunteer confirm card; ledger in PartyDashboard; candidate donation-record
  form (§12).

### Phase 7 — Candidate selection & data handover (later)
- Migration `025_candidate_selection.sql`: `candidate_selections(party_id,
  candidate_id, selected_political_candidate_id, decided_by, decided_at,
  UNIQUE(party_id, candidate_id))`.
- `POST /api/parties/:id/constituencies/:cid/selection` (tenant_admin, §8):
  transactionally reassign `canvassing.political_candidate_id` to the selected
  candidate, re-point volunteer grants, write `audit_logs` rows (first real use
  of that table) with per-source counts. Same path handles withdrawal.
- Client: candidate-comparison view (reuses canvasser/candidate performance
  analytics) + the selection action in PartyDashboard.

---

## 5. Migrations summary
`022_parties.sql` · `023_rbac_restructure.sql` (both already applied to the
current DB — the files must exist for fresh DBs) · `024_donations.sql` ·
`025_candidate_selection.sql`. House style: numbered, idempotent, each in its own
transaction via `server/src/db/migrate.js`.

## 6. Risks / open points
- **DB ahead of code**: tenant_admin users stay broken until Phase 2 lands —
  implement Phases 1–4 in one stretch.
- **JWT v2 logs out every user at deploy** (deliberate; schedule accordingly).
- Existing `role='candidate'` users (asifmahbub, asifnazrul) end up BELOW admins;
  if either actually runs the campaign, the operator re-grants them
  admin/tenant_admin via the Management page.
- Base map geometry stays constituency-public; only canvass-derived attributes
  get campaign/ward filtering (explicit decision).
- DB test fixtures: party `testparty` + user `tadmin_test` (safe to delete);
  `tarek101`/`nahid123` are user-created — leave them.

## 7. Verification approach
No test framework exists in the repo. Per phase:
`cd client && npm run build`; `node -e "require('./server/src/app')"`;
`npm run migrate` (skips 022/023 on this DB); a curl matrix against a throwaway
server (`PORT=3100 node server/server.js`) using per-role JWTs signed with the
server's own `server/src/utils/jwt.js` against the real dhaka10 data (allowed vs
denied per the scope matrix in §3); final browser walk-through per role.
