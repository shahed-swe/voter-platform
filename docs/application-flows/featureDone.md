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
