# Features DONE ✅

Checklist of everything implemented **and live-verified** so far (as of 2026-08-31).
The target spec is [flowApplication.md](flowApplication.md); execution details live in
[plan.md](plan.md). What's still pending: [featureRemaining.md](featureRemaining.md).

## Roles & login

- [x] All 7 roles exist and can log in: Super Admin, Political Admin (`tenant_admin`),
      Candidate, Campaign Admin (`admin`), Sub-admin, Volunteer, Donor
- [x] Role-appropriate landing pages: Political Admin → `/party`, Donor → `/donor`,
      everyone else → `/dashboard`; role-specific navigation in the header
- [x] Party-level users (Political Admin / Donor) log in without any constituency grant

## Team Management (the hierarchy)

- [x] Creation chain enforced, down-only:
      **Political Admin → Candidate (+ Donor) → Campaign Admin → Sub-admin → Volunteer**
      (Super Admin can create any role)
- [x] Political Admin + Donor roles in the "নতুন User" modal; political-party-name
      input (required for a Political Admin; party is found or created by name)
- [x] Per-user **view** modal (all details incl. party / campaign / wards / areas)
- [x] Per-user **edit** modal (name, phone, email, password reset, active flag,
      ward/voter-area re-assignment)
- [x] Per-user **delete** with hierarchy semantics (see below)
- [x] Hierarchy guards: edit / region-change / delete only work on users INSIDE the
      caller's own campaign (or the Political Admin's own party) — anyone else gets
      "User is outside your hierarchy" (403), regardless of rank
- [x] Delete = **detach, not destroy**: removing a user only removes them from the
      caller's hierarchy; the account itself is deleted only when no grant anywhere
      references it (a volunteer shared with another candidate keeps that assignment
      and their login)

## Party layer & isolation (Political Admin)

- [x] Parties + party grants in the DB (`parties`, `user_parties`,
      `user_candidates.party_id` — migrations 022/024)
- [x] Political Admin registers candidates — **multiple candidates on the same
      constituency** allowed — each auto-tagged with his party
- [x] Political Admin sees ONLY his own party: hierarchy list, party home (`/party`
      with candidates grouped by constituency), party-wide surveys
      (`/party/surveys` + `GET /api/canvassing/party-records`)
- [x] Other parties' candidates, teams, and surveys are completely invisible to him
      (verified: BNP vs default party see nothing of each other)

## Candidate / campaign isolation

- [x] Each candidate sees only their OWN campaign team and survey data —
      Candidate 1 cannot see Candidate 2's work even on the same constituency;
      only the Political Admin sees all his candidates' work
- [x] Campaign Admin and Sub-admin inherit the same campaign scope (same access
      as their candidate, per the defined tasks)
- [x] Survey lists, stats, voter history, map pins, and all analytics endpoints are
      campaign-scoped via the canvass's stamped candidate

## Multi-candidate volunteers (data encapsulation)

- [x] The SAME volunteer can be assigned to several candidates:
      "Existing volunteer" toggle in the Team Management modal (search & attach),
      and `/api/people/volunteers` open to candidate / campaign admin / sub-admin
- [x] Each assignment is its own grant (constituency + campaign + wards/areas);
      header switcher picks which candidate the volunteer is currently canvassing for
- [x] Every canvass is stamped with the active campaign — **Candidate A sees only
      surveys collected for A, Candidate B only for B** (verified live end-to-end)
- [x] Sub-admins can only hand out wards within their own assignment

## Volunteer restrictions

- [x] Volunteers only canvass: nav = Dashboard + Canvassing; Survey Data /
      Analytics / Elections / Team pages blocked (client routes + server 403)
- [x] Volunteer survey lists, stats, and analytics show **their own submissions
      only** (canvasser filter is forced server-side, cannot be spoofed)
- [x] Ward + voter-area assignment enforced **in SQL on every voter endpoint**:
      filtered list, search, by-village, by-voter-area(s), voter detail (404 outside
      assignment), area options, geo options, area stats — array-safe scope handling
- [x] Client query cache cleared on login/logout, so one user's broader cached data
      can never leak into the next user's session in the same tab

## Donations / Donor module (§9) — added 2026-09-01

- [x] `donations` table (migration 025) — party-anchored, recorded → confirmed
- [x] Donor's volunteer finder: only volunteers of THEIR party, searchable by
      name / ward / area — returns name + working area + campaign only
      (no username, phone, or any canvassing data)
- [x] Donor records a donation (amount + note) to a chosen volunteer; the
      volunteer must verifiably belong to the donor's party
- [x] Volunteer's independent confirmation ("টাকা পেয়েছি") — only the addressed
      volunteer can confirm, only once; both sides recorded separately
- [x] Donor profile (`/donor`): totals (count, ৳ given, ৳ confirmed, pending)
      + their own donation list — donors see nothing else
- [x] Volunteer donations page (`/donations`): received list, pending-first,
      one-click confirm
- [x] Political Admin party ledger (`/party/donations`): every donor →
      volunteer donation in HIS party with totals and status
- [x] Isolation verified live: cross-party donation attempts 404, wrong
      volunteer cannot confirm, donor cannot read the ledger, volunteer cannot
      donate

## Voter support history (§10) — added 2026-09-01

- [x] Full visit timeline endpoint (`GET /api/canvassing/voter-history/:id`) —
      Political Admin sees every visit by HIS party's campaigns; candidates,
      volunteers, and everyone else get 403 (spec: Tenant Admin only)
- [x] Main Admin cross-party timeline: visits matched across parties' separate
      voter rolls by voter number (sos_vid) — best-effort, rows without a
      voter number can't be matched
- [x] Main Admin cross-party history UI: Admin ▸ Voter History page —
      persuadable voters across ALL parties (parties named per row) — plus a
      "সম্পূর্ণ ভিজিট history" button on each Survey Data record; the drawer
      shows every party's visits and how many times the voter changed their
      mind. Political Admins keep their party-only view (verified: Tarek sees
      1 BNP voter / party-scoped timeline, Main Admin sees 4 voters across
      parties / cross-party timeline)
- [x] Timeline drawer UI: click any voter name in the party survey /
      persuadable tables → chronological visit list with support level,
      rating, follow-up flag, issues, candidate + canvasser per visit, and a
      "answer changed / unchanged" verdict banner
- [x] Persuadable voters (`GET /api/canvassing/party-persuadable` + the
      "Persuadable ভোটার" tab on /party/surveys): voters visited >1 time whose
      answer CHANGED, with the visit-to-visit journey (e.g. supporter →
      undecided) — found a real case in live data on first run
- [x] Main Admin multi-party volunteers view (§5):
      `GET /api/admin/multi-party-volunteers` + Admin ▸ Multi-party Volunteers
      page — only the Main Admin sees the overlap; Political Admins get 403

## Candidate selection & data handover (§8) — added 2026-09-01

- [x] `candidate_selections` table (migration 026): one final pick per
      (seat, party), re-selectable (covers withdrawals)
- [x] `POST /api/selection` — Political Admin picks the final candidate; ONE
      transaction re-points the other candidates' canvassing records, donation
      contexts, and team grants (campaign admin / sub-admin / volunteer) to
      the selected campaign; shared-volunteer key collisions handled; every
      run written to audit_logs with moved-counts
- [x] Party isolation: selecting another party's candidate is impossible (404)
- [x] UI on `/party`: "চূড়ান্ত candidate নির্বাচন" per constituency — modal
      compares the seat's candidates side-by-side (surveys, strong support,
      voters), warns about the handover, and the selected candidate wears a
      "দলের চূড়ান্ত" badge afterwards
- [x] Verified live in a sandbox party: canvass + volunteer moved from the
      losing candidate to the winner; the winner's survey view gained the
      record, the loser's emptied; audit row correct; sandbox removed

## Role dashboards — added 2026-09-01

- [x] Campaign home (`/campaign`) for Candidate / Campaign Admin / Sub-admin:
      campaign-scoped stat cards (surveys, unique voters, strong support,
      undecided, follow-ups, team size), quick actions, team-at-a-glance
      with role counts — all data already campaign-isolated server-side
- [x] These roles now land on `/campaign` after login ("My Campaign" nav item);
      sub-admins see their ward assignment in the header

## Data-scoping sweep & auth hardening — added 2026-09-01

- [x] Analytics narrowed to the caller's ward/voter-area assignment: canvass
      metrics AND roll denominators (a ward-১৬ sub-admin's overview counts
      48,944 voters, not the constituency's 368,933); requested filters can
      only narrow further, never escape
- [x] All `optionalAuth` routes replaced with mandatory `verifyToken`
      (analytics, geo, villages, canvassing stats)
- [x] JWT versioning (`v: 2`): tokens minted before the payload restructure
      are rejected with "Session outdated — please log in again"
- [x] Query-string / body tokens no longer accepted — Authorization header only
