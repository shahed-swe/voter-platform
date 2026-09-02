# Data modeling assessment — where it falls short of best practice

> Part 2 of the backend data-modeling assessment (2026-09-02).
> Companion files: [01-whats-done-right.md](01-whats-done-right.md) ·
> [03-scalability.md](03-scalability.md) · [04-n-plus-one.md](04-n-plus-one.md)

Five known debts. None is urgent; all are Phase 4 candidates
([scalability.md](scalability.md)). Ordered by how much they cost day-to-day.

## 1. The naming debt (biggest tax on new developers)

`candidates` = **constituencies**; `political_candidate_id` = **campaign**
(a `users.user_id`). The names survive from the single-tenant era and now
mislead everyone who reads the schema cold. Documented in
[../database/tables.md](../database/tables.md) (vocabulary table), but
documentation is a workaround — clean practice would be renaming
tables/columns (expensive: touches every query) or exposing correctly-named
SQL views for new code. **Decision needed in Phase 4.**

## 2. Duplicated state (two sources of truth)

- `voters.status` ('Not visited' / 'Visited'…) mirrors what `canvassing`
  rows already prove. The app must keep them in sync; any missed path leaves
  a stale status. Better: drop the mirror, or maintain it with a trigger /
  generated view.
- `canvassing.is_undecided` partially duplicates
  `support_level = 'Undecided'` — the two can disagree, and analytics must
  decide which to trust (today: both are counted separately).

## 3. Convention-only enums

`canvassing.support_level` is free text kept consistent only by the client
form (`CanvassFormModal.jsx`). A CHECK constraint like the ones `source` and
`donations.status` already have costs nothing and prevents silent garbage
from any future client or import. Same applies to `income_bracket`.

## 4. A missing integrity edge

Nothing stops `canvassing.candidate_id` from disagreeing with the voter's own
`candidate_id` — the application maintains the invariant. A composite FK
`(voter_id, candidate_id) REFERENCES voters (voter_id, candidate_id)` would
let the database enforce it (requires a matching unique index on voters,
which the PK + partition column can provide).

## 5. Dead weight that misleads readers

Empty, superseded tables still sit in the schema and some endpoints still
reference them:

| Table | Superseded by |
|---|---|
| `user_sessions` | stateless JWTs (`utils/jwt.js`) |
| `user_assignments` | `user_candidates.allowed_wards` / `allowed_voter_areas` |
| `voter_statistics` | live analytics queries |
| legacy geo (`wards`, `voter_areas`, `villages`, `constituencies`, `buildings`, `polling_stations`) | `geo_layers` + `layer_definitions` (still partially referenced by urban/village endpoints) |

They actively suggest wrong mental models ("sessions are in the DB",
"assignments live in user_assignments"). Also in this bucket:
`audit_logs.candidate_id NOT NULL` forces party-level events to invent a
constituency, and `candidates.party_id` is a legacy single-tenant column that
must never be used for isolation logic.

## Suggested Phase 4 packaging

- One **hardening migration** for items 2–4 (drop/trigger the mirrors, add
  CHECKs, add the composite FK).
- One **deliberate decision** each for item 1 (rename vs views) and item 5
  (drop vs archive the dead tables, migrate the straggler endpoints off
  legacy geo).
