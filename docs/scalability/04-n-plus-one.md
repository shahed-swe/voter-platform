# Data modeling assessment — N+1 query inventory

> Part 4 of the backend data-modeling assessment (2026-09-02).
> Companion files: [01-whats-done-right.md](01-whats-done-right.md) ·
> [02-shortfalls.md](02-shortfalls.md) · [03-scalability.md](03-scalability.md)

Result of scanning every controller, model, and service for loops (or
`Promise.all(map)`) that issue one query per item:
**six N+1 patterns — five live, one dormant — none on a hot path.**
Every N is small and bounded (a user's constituencies ≤ ~6, a map's layers
≤ ~24), so these are 3-queries-instead-of-1 situations, not 1000-instead-of-1.

## Live patterns

| # | Location | Pattern | N | Fix |
|---|---|---|---|---|
| 1 | `server/src/controllers/candidateController.js` (`list`, non-super branch) | `listForUser` then `findById` per grant (parallelized) | user's constituencies | single JOIN in `listForUser` returning full candidate rows — **the only read-path one** |
| 2 | `server/src/controllers/peopleController.js` (`createCandidate`) | `grantUserAccess` insert per selected constituency | selected constituencies | multi-row `VALUES` upsert |
| 3 | `server/src/controllers/peopleController.js` (re-grant loop) | `findById` **+** `grantUserAccess` per constituency (2N — worst ratio) | selected constituencies | one `ANY($1)` existence check + multi-row upsert |
| 4 | `server/src/controllers/managementController.js` (`createUser`) | `grantUserAccess` insert per constituency | selected constituencies | multi-row `VALUES` upsert |
| 5 | `server/src/models/layerDefinitionModel.js` (`replaceAll`) | one INSERT per layer inside the transaction | layer count (≤ ~24) | multi-row insert; super-admin-only config op, lowest priority |

Items 2–4 share one fix: teach `candidateModel.grantUserAccess` to accept an
array and emit a single multi-row upsert.

## Dormant pattern

| # | Location | Pattern | Why dormant |
|---|---|---|---|
| 6 | `server/src/services/regionService.js` (assignment loop, voter_area branch) | `await one(…)` geo lookup per assignment row | serves the **legacy** `user_assignments` system — 0 rows, superseded by `allowed_wards` / `allowed_voter_areas`. Dies with the dead tables ([02-shortfalls.md](02-shortfalls.md) §5) |

## Where N+1 would hurt — and is already clean

- **Importers** (`voterIngest.js`, `geoLayerIngest.js`): chunked multi-row
  batches — millions of rows handled correctly.
- **List/analytics endpoints** (`listUsers`, party records, persuadable
  voters, stats, voter history): each is a single set-based query with JOINs
  and aggregates — no per-row hydration anywhere on the data-heavy paths.
- Fixed-count `Promise.all` pairs (stats + records, donations + totals) are
  parallel two-query calls, not N+1.

Out of scope: one-off scripts (`seed-demo.js`, `generate-schema-docs.js`)
loop by design and never run per-request.

**Priority:** fold into Phase 4 as a tidy-up. Nothing here is a measurable
performance problem today.
