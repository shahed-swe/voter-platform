# Implementation Plan — closing the gap between flowApplication.md and the app

**What this is:** the execution-ordered work plan for making the application behave
as [flowApplication.md](flowApplication.md) describes. The background — full gap
analysis, architecture decisions, and the per-role data-scope matrix — lives in
[restructured.md](restructured.md); read that first. This file is the "what to
build, in what order" checklist. Tick steps off as they land.

**Progress so far (2026-08-31):** the Political Admin layer is LIVE (a
different chain than this plan originally assumed — the user redefined it:
Political Admin → Candidate → Campaign Admin → Sub-admin → Volunteer, i.e. the
Political Admin creates ONLY candidates + donors, and each CANDIDATE appoints
their own Campaign Admin):
- Roles `tenant_admin` ("Political Admin") + `donor` creatable from Team
  Management; party-level grants in `user_parties`; such users log in (party
  grants in token payload) and land on their own pages (`/party`, `/donor`).
- `024_user_candidates_party.sql`: `user_candidates.party_id` tags each
  CANDIDATE grant with the party that registered them — the party-isolation
  anchor. Political Admin creating a candidate auto-tags his party; required
  party-name input when super creates a Political Admin (find-or-create party).
- CREATABLE chain enforced: PA→[candidate,donor], candidate→[admin],
  admin→[sub_admin], sub_admin→[volunteer].
- Party-isolated hierarchy view: PA's /management lists ONLY his party's
  candidates + their campaign trees; candidates see only their own campaign.
- Party-isolated surveys: `GET /api/canvassing/party-records` + the PA's
  `/party/surveys` page (records whose campaign candidate belongs to his
  party); volunteers/others 403.
- PA home (`/party`) shows the party's candidates grouped by constituency.
- All verified live as tarek123 (BNP): 3 candidates on Dhaka-10, candidate→
  admin→sub→volunteer chain, cross-candidate + cross-party isolation, survey
  visibility.

**Progress update (2026-08-31, later):** per-candidate DATA ENCAPSULATION landed
(user's rule: a volunteer may serve MULTIPLE candidates, but each candidate sees
only the surveys collected FOR them):
- Multi-candidate volunteers: an existing volunteer can be attached to a second
  candidate's campaign — via the Team Management modal's new "Existing
  volunteer" toggle (`POST /api/management/users` with `user_id`) or
  `/api/people/volunteers` (now open to candidate/admin/sub_admin, campaign
  taken from the caller's grant, wards narrowed to a sub-admin's own). Each
  grant is its own (user, constituency, campaign) row; the header switcher
  picks the active campaign and canvasses are stamped with it.
- Hierarchy guards: `targetInScope` in managementController — edit / region /
  delete now require the target to be INSIDE the caller's campaign (or the
  PA's party); rank alone no longer suffices. Cross-campaign edits 403.
- Detach-not-delete: non-super DELETE removes only the caller's own campaign's
  (or party's) grants; a shared volunteer keeps the other candidate's grant
  and login. The account is removed only when no grant remains.
- Volunteer narrowing: survey list + stats show ONLY the volunteer's own
  submissions; analytics force `canvasser_id = self`; client nav for
  volunteers is Dashboard + Canvassing only; /survey-data, /analytics,
  /election-results routes gated to candidate/admin/sub_admin (+super).
- Verified live: shared volunteer canvassed once per campaign — cand1 saw only
  his record, cand2 only his, campaign-1 admin only campaign 1's, PA saw both;
  cross-hierarchy edit/delete 403; delete by campaign 1 left the campaign-2
  grant + login intact. Test canvasses removed afterwards.

**Progress update (2026-08-31, voter-area enforcement):** a volunteer assigned
specific voter areas could still browse the whole ward (reported with nuru123).
Two causes, both fixed:
- Server: `/voters/filtered` compared `allowed_wards.includes(scope.ward)`
  where scope.ward is an ARRAY from the multi-select nav — always false → 403
  for volunteers; and restrictions were applied pre-merge so filter keys could
  override them. Now: array-safe narrowing applied to the MERGED filters, and
  assignment (wards + voter areas) enforced in SQL across ALL direct voter
  endpoints — search, by-village, by-voter-area(s), voter detail (404 outside
  assignment), area-options, geo-options, areas list, area stats.
- Client: logout/login never cleared the TanStack Query cache, and keys are
  per-constituency, not per-user — logging in as a volunteer after a broader
  user in the same tab served the previous user's cached area options. The
  QueryClient now lives in `client/src/queryClient.js` and is `.clear()`ed on
  both login and logout.
  Verified live with nuru123's real grant: geo/area options return only the 2
  assigned areas, filtered/search/detail return only assigned-area voters,
  out-of-assignment requests 403/404, unrestricted users unaffected.

**Progress update (2026-09-01, Political Admin UX):** hierarchy-first redesign
of the PA views. `/party` shows real per-candidate survey numbers (new
`GET /api/canvassing/party-stats`, one aggregate row per party candidate) and
each candidate row drills into the new `/party/candidates/:userId` page —
campaign tree (Campaign Admin → Sub-admin → the volunteers that sub-admin
assigned, via the new `granted_by` fields on `/api/management/users`) plus
that candidate's surveys only (`party-records?political_candidate_id=`).
`/party/surveys` gained per-candidate filter chips (shared
`PartySurveyTable` component). Team Management now renders campaign-grouped
trees instead of a flat list: each section is one candidate's campaign, nested
volunteers show "যোগ করেছেন <sub-admin>", and a multi-campaign volunteer
appears once under EACH campaign (listUsers DISTINCT now includes the
campaign). All of it read-only additions on top of the existing isolation.

  Remaining from Steps 1–4: analytics-geo scoping sweep, JWT versioning,
  candidate/sub-admin dashboards.

**Ground rules for the implementer**
- The database is AHEAD of the code: migrations `022_parties.sql` and
  `023_rbac_restructure.sql` are already applied (parties/user_parties exist,
  admin grants unlocked, tenant_admin users exist). The migration FILES must still
  be created so fresh databases build; on this DB the runner skips them by filename.
- Steps 1–4 belong in one release: until Step 2 ships, the existing tenant_admin
  users (`tarek101`, `nahid123`) cannot log in usefully.
- Verification per step = client `npm run build`, server module load, and a curl
  matrix with per-role JWTs (sign them with `server/src/utils/jwt.js`) against a
  throwaway `PORT=3100` instance. No test framework exists in this repo.

---

## Step 1 — Authorization core + close today's data leaks
*Server only, no schema change. Deliverable: every read is region-scoped.*

**1.1 Create the authz module** — `server/src/services/authz.js`
- [ ] `RANK`, `CREATABLE`, `REGION_OF` constants (final flowApplication.md
      hierarchy — see restructured.md §3).
- [ ] `callerRole(req)` / `grantRole(req)` (super → `'super_admin'`; else the
      active-candidate grant role, falling back to the global role).
- [ ] `dataScope(req)` → `{ partyId, candidateId, wards, voterAreas,
      politicalCandidateId, ownUserId }`. Campaign id FORCED null for
      super/tenant/admin/sub_admin; `ownUserId = user_id` only for volunteers.
- [ ] `scopeWhere(scope, params, { voterAlias='v', canvassAlias=null })` —
      appends `ward = ANY`, `voter_area_name = ANY`, and (only when canvassAlias
      given) `user_id = $own`; returns an ` AND …` fragment.
- [ ] `narrowWards` / `narrowAreas` (requested ∩ allowed; empty ⇒ ForbiddenError;
      no request ⇒ full allowance) and `voterInScope(scope, voter)`.

**1.2 Create the middleware** — `server/src/middleware/authorize.js`
- [ ] `attachScope` (stamps `req.scope`), `requireRoles(...roles)`.
- [ ] Wire in `server/src/routes/index.js`:
      `router.use(verifyToken, scopeToCandidate, attachScope)`.

**1.3 Unify the two hierarchy definitions**
- [ ] `managementController.js`: delete local RANK/CREATABLE/REGION_OF/callerRole;
      import from authz.
- [ ] `adminUserController.js`: delete `CREATABLE_ROLES`; use authz `CREATABLE` +
      `grantRole` (returns `'super_admin'` — update `ensureCanManageUsers` and
      `deleteUser` to accept it).

**1.4 Scope every voter read** — `voterController.js` + `voterModel.js`
- [ ] `search/:query`, `by-village`, `by-voter-area(s)`, `area-options`,
      `listVoterAreas`, `voterAreaStats`, `statistics/aggregated`: model fns gain
      a `scope` option rendered via `scopeWhere`.
- [ ] `voters/:voter_id`: out-of-scope ⇒ **404** (`voterInScope`), so existence
      isn't leaked.
- [ ] `filtered` + `geoOptions`: switch their existing ad-hoc checks to
      `req.scope` (behavior preserved: force-first-ward default etc.).

**1.5 Scope every analytics read** — `analyticsController.js` + `analyticsModel.js`
- [ ] `canvassFilter(filters, params, { hasVoters, alias, scope })` — add
      ward/area/own-user clauses; all 12 endpoints pass `scope: req.scope`.
- [ ] `voterScopeFilter` for the voters-roll subqueries in `overview`
      (total/male/female) and `villagePerformance` totals CTE.
- [ ] `canvasserOptions` gains a voters JOIN so it honors the ward scope.

**1.6 Scope every canvassing read** — `canvassingController.js` + `canvassingModel.js`
- [ ] `historyForVoter`, `locationsByVillage`, `allLocations`, `listVoterRecords`,
      `stats` take `{ politicalCandidateId, scope }`; add the voters JOIN where
      missing (`allLocations`, `stats`). Only `listVoterRecords`/`stats` pass
      `canvassAlias` (own-user narrowing later); history/locations never do
      (prefill + pins stay campaign-wide — the pragmatic decision).
- [ ] `voterLocations` controller: replace manual allowed-ward checks with
      `narrowWards`/`narrowAreas`.

**1.7 Security fixes**
- [ ] `middleware/auth.js`: remove query-string token extraction.
- [ ] Remove `optionalAuth` from `analyticsRoutes.js`, `canvassingRoutes.js`,
      `geoRoutes.js`, `villageRoutes.js` (the global `verifyToken` guards them).
- [ ] `peopleRoutes.js` `/users/search`: non-super callers use new
      `userModel.searchInCandidates(candidateIds, …)` (JOIN user_candidates) —
      no platform-wide enumeration.
- [ ] `genericGeoController.js`: use `req.scope.politicalCandidateId`; add the
      documented decision comment (base geometry constituency-scoped,
      canvass-derived attributes campaign-isolated).

**Accept when:** volunteer JWT (wards ১৬/২২, dhaka10) gets analytics overview
`total_voters = 109,709` (their wards) vs admin's 368,933; search results only
from their wards; out-of-scope `voters/:id` → 404; out-of-scope ward request →
403; `?token=` → 401; admin behavior unchanged; client build clean.

---

## Step 2 — Party layer + JWT v2
*Deliverable: parties manageable by Main Admin; tenant admins can log in.*

**2.1 Recreate `server/migrations/022_parties.sql`** (skipped on this DB, needed
for fresh ones): `parties`; `candidates.party_id REFERENCES parties ON DELETE
RESTRICT` + backfill `'default'` + NOT NULL; `user_parties (user_id, party_id,
role CHECK IN ('tenant_admin','donor'), UNIQUE(user_id,party_id,role))`; widen
`users_role_check` with `tenant_admin`,`donor`. Idempotent, house style.

**2.2 Server party stack**
- [ ] `models/partyModel.js`: findById, listAll (+constituency counts), create,
      update, listForUser, listUsersForParty, grantPartyRole, revokePartyRole,
      constituenciesOf, overview (per-constituency voters/visited/canvasses/
      canvassers/volunteers/candidates aggregates).
- [ ] `controllers/partyController.js`: list (super=all, tenant=own), create/
      update (super), getOne/overview (super or own tenant admin),
      createTenantAdmin (new user w/ `generateTempPassword` + welcome
      notification, or grant existing by user_id), removeTenantAdmin.
- [ ] `routes/partyRoutes.js` mounted in `routes/index.js` BEFORE the scope
      middleware: `router.use('/parties', verifyToken, …)`.

**2.3 JWT v2** — `authController.js`, `middleware/auth.js`
- [ ] `TOKEN_VERSION = 2`; payload adds `v`, `party_id` (active grant's party,
      else first party grant), `parties:[{id,name,role}]`, per-grant `party_id`.
- [ ] Login no longer rejects users who hold ONLY party grants; login/me
      responses include `parties`/`party_id`.
- [ ] `verifyToken` (and `optionalAuth`) reject `v !== 2` with
      "Session outdated — please log in again".
- [ ] `switchCandidate`: tenant admins may switch into own-party constituencies
      without a per-constituency grant; never into another party's.
- [ ] `middleware/scope.js`: tenant admins pass without an active constituency
      (candidateId = null), like supers.
- [ ] `candidateModel.js`: `party_id` in PUBLIC_FIELDS + listForUser + create
      (default `'default'`); `candidateController.js` accepts `party_id`.
- [ ] authz `dataScope` stamps `partyId`.

**2.4 Client**
- [ ] `api/parties.js` (list/getOne/overview/create/update/
      createTenantAdmin/removeTenantAdmin).
- [ ] `pages/admin/PartiesPage.jsx`: party grid with constituency counts;
      create-party dialog (slug + name); expandable per-party panel listing
      tenant admins (add w/ one-time temp-password display, revoke) and
      constituencies.
- [ ] Route `/admin/parties` (requireSuperAdmin) in `App.jsx`; "Parties" link in
      the Admin dropdown (`AppHeader.jsx`); `queryKeys.js` += `parties()`,
      `party(pid)`, `partyOverview(pid)`.

**Accept when:** old token → 401 "Session outdated"; fresh login carries v2 +
party claims; `tarek101`/`nahid123` log in, list only their party, 403 on
foreign party read/switch/create; dhaka10 works unchanged under `'default'`.

---

## Step 3 — The visibility flip (role restructure server-side)
*Deliverable: data flows exactly per flowApplication.md §7/§10/§11.*

**3.1 Recreate `server/migrations/023_rbac_restructure.sql`** (skipped on this
DB): dedupe-safe NULLing of `political_candidate_id` on admin/sub_admin grants
(unique key is NULLS-NOT-DISTINCT — null one row per (user,constituency) where
no NULL sibling exists, then delete remaining locked duplicates) + operator note
about ex-campaign-owner candidate users.

**3.2 Finalize authz** — flip RANK/CREATABLE to the flowApplication.md chain
(already written that way in Step 1.1 if implementing 1–4 together) and final
`dataScope` (pc forced null for admin ranks; `ownUserId` for volunteers).

**3.3 Management chains** — `managementController.js`
- [ ] `callerParties(req)`; `callerConstituencies(req)` becomes async (tenant
      admin spans party constituencies via `partyModel.constituenciesOf`).
- [ ] `context`: constituencies per role (+`party_id`), `my_parties`.
- [ ] NEW `GET /api/management/candidates?constituency_id=` — candidates
      registered on a constituency (volunteer-attachment picker).
- [ ] `listUsers`: region-based — roles strictly below the caller within their
      constituencies; sub admins additionally filtered to ward-overlap, but
      candidates (no wards) always visible to their sub admin; include
      `political_candidate_name` per row.
- [ ] `createUser` per-role rules:
      * **admin** ← tenant_admin/super: 1+ constituencies of the caller's party, pc NULL
      * **sub_admin** ← admin/super: wards required, pc NULL
      * **candidate** ← sub_admin/super: pc = the NEW user's id
      * **volunteer** ← sub_admin/super: `political_candidate_id` REQUIRED and
        validated against a candidate grant on the constituency; wards/areas
        inside the creator's
      * **donor** ← tenant_admin/super: `user_parties` grant (party from caller
        or explicit for super), no constituency
- [ ] `updateRegion` mirrors the same campaign-axis rules; `removeUser` rank
      checks work with the new RANK.

**3.4 Survey visibility** — `canvassingController.js`
- [ ] `voterRecords`/`stats` pass scope WITH `canvassAlias` → volunteer lists
      and stats = own submissions only.
- [ ] NEW `GET /api/canvassing/voter-history/:voter_id` — pc=null full
      cross-candidate timeline, route-gated
      `requireRoles('super_admin','tenant_admin')` in `canvassingRoutes.js`.
- [ ] `history/:voter_id` unchanged semantics (campaign-scoped; prefill works).

**3.5 Legacy people endpoints** — `peopleController.js`
- [ ] Volunteer WRITE endpoints (`createOrAssignVolunteer`,
      `updateVolunteerWards`, `removeVolunteer`) super-only with a message
      pointing to /management; candidate keeps READ (`listVolunteers`, §12).

**Accept when:** sub admin sees all campaigns' records in their wards (31 across
2 campaigns on dhaka10); candidate A cannot read candidate B's data; volunteer
voter-records return only own rows (a ghost-volunteer JWT gets 0 of 31) while
history prefill still returns campaign rows; voter-history → 403 volunteer /
200 main admin with cross-campaign visits; tenant context creatable =
[admin, donor]; sub context = [candidate, volunteer]; volunteer creation without
attachment → 400; sub creating admin → 403.

---

## Step 4 — Role-specific client views
*Deliverable: each role lands on and sees only its own application (§12).*

- [ ] `client/src/auth/roleHome.js`: `isTenantAdmin(user)` (global role OR party
      grant) + `roleHome(user)` — main→`/admin/parties`, tenant→`/party`,
      admin/sub/candidate→`/dashboard`, volunteer→`/canvassing`, donor→`/donor`.
- [ ] `App.jsx`: index route = `<RoleLanding/>` (Navigate to roleHome); gate the
      five data routes to `DATA_ROLES = [tenant_admin, admin, sub_admin,
      candidate, volunteer]` (donor excluded, §9); add `/party` (tenant_admin)
      and `/donor` (donor); `/management` → [tenant_admin, admin, sub_admin].
- [ ] `auth/ProtectedRoute.jsx`: tenant_admin party grants satisfy a
      `'tenant_admin'` role requirement; failed checks redirect to
      `roleHome(user)` (never a donor→dashboard loop).
- [ ] NEW `pages/party/PartyDashboardPage.jsx`: party totals row + one card per
      constituency (voters/visited/canvasses/canvassers/volunteers/candidates,
      completion bar) from `GET /api/parties/:id/overview`; "Open dashboard" /
      "Analytics" buttons switchCandidate + full reload (existing pattern).
- [ ] NEW `pages/donor/DonorProfilePage.jsx`: profile shell (name, party,
      zeroed donation counters) until the donations step.
- [ ] `AppHeader.jsx`: single exported `navForRole(user)` — super: full nav +
      Admin dropdown; tenant: Party link + nav + Team; admin/sub: nav + Team;
      candidate: nav + Volunteers; volunteer: Dashboard/Canvassing/Survey-Data
      only; donor: profile only. Role label = Main/Tenant/Campaign Admin/….
      Delete the unused `components/Navbar.jsx`.
- [ ] `pages/admin/ManagementPage.jsx`: tenant_admin/donor labels + badges;
      volunteer form gets the REQUIRED candidate picker (new
      `mgmt.candidatesOf(cid)` in `api/management.js` → `/management/candidates`)
      with an empty-state hint; donor form hides constituency and (super only)
      shows a party select; volunteer rows show their attached candidate.

**Accept when:** build clean + browser walk-through per role: correct landing,
correct nav, correctly narrowed data (this last check is the user's).

---

## Step 5 — Voter support history & multi-party volunteers (after 1–4 ship)
- [ ] Tenant/Main voter-history timeline UI (drawer fed by
      `/canvassing/voter-history/:id`) reachable from survey/records views.
- [ ] "Persuadable voters" list (voters with >1 visit and changed support) in
      `analyticsModel` + page/section for tenant admin (§10).
- [ ] Main-admin cross-party history: match voters across constituency rows by
      voter number/NID (best-effort; document the caveat).
- [ ] `GET /api/admin/multi-party-volunteers` (grants spanning >1 party_id) +
      main-admin page (§5).

## Step 6 — Donations (§9)
- [ ] `024_donations.sql`: `donations(party_id, donor_user_id,
      volunteer_user_id, candidate_id NULL, amount, note,
      status CHECK('recorded','confirmed') DEFAULT 'recorded',
      recorded_at, confirmed_at)`.
- [ ] Server: donor create + list own; volunteer list own + confirm
      (independent confirmation); tenant/main party ledger; donor
      volunteer-finder returning name + area ONLY (§13).
- [ ] Client: real DonorProfilePage (totals, list, give-donation flow via the
      volunteer finder); volunteer confirm card; ledger in PartyDashboard;
      candidate donation-record form (§12).

## Step 7 — Candidate selection & data handover (§8)
- [ ] `025_candidate_selection.sql`: `candidate_selections(party_id,
      candidate_id, selected_political_candidate_id, decided_by, decided_at,
      UNIQUE(party_id, candidate_id))`.
- [ ] `POST /api/parties/:id/constituencies/:cid/selection` (tenant_admin):
      transactionally reassign `canvassing.political_candidate_id` to the
      selected candidate, re-point volunteer grants, write `audit_logs` rows
      with per-source counts; same path handles withdrawal.
- [ ] Client: candidate comparison view (reuse canvasser/candidate performance
      analytics) + the selection action in PartyDashboard.

---

## Cross-cutting risks (watch during every step)
- JWT v2 logs out every user the moment Step 2 deploys — plan the timing.
- Ex-top-rank candidate users (asifmahbub/asifnazrul) lose management powers at
  Step 3; the operator must re-grant whoever really runs the campaign.
- DB fixtures: `testparty`/`tadmin_test` are disposable test data;
  `tarek101`/`nahid123` are real user-created accounts — keep them.
- After finishing, write the session log (`docs/sessions/<date>.md`) and mark the
  step done here and in restructured.md.
