# Data modeling assessment — what's already done right

> Part 1 of the backend data-modeling assessment (2026-09-02).
> Companion files: [02-shortfalls.md](02-shortfalls.md) ·
> [03-scalability.md](03-scalability.md) · [04-n-plus-one.md](04-n-plus-one.md)
> Schema reference: [../database/tables.md](../database/tables.md)

Overall grade: **solid B+** — better than most projects this size. These are
the strengths worth preserving as the system grows.

## 1. Disciplined multi-tenant partitioning

Every data table carries a `candidate_id` (constituency) partition column with
composite indexes shaped for the queries the app actually runs:

- `voters (candidate_id, ward)`, `(candidate_id, status)`,
  `(candidate_id, voter_area_name)`
- `canvassing (candidate_id, political_candidate_id)` — the campaign-isolation
  read path
- per-tenant uniqueness such as `voters UNIQUE (candidate_id, sos_vid)`

This is why 2.26M voter rows query comfortably, and why one constituency's
data can be dropped cleanly (`ON DELETE CASCADE` from `candidates`).

## 2. A precise grant model (the strongest part of the schema)

`user_candidates` has the natural key:

```
UNIQUE NULLS NOT DISTINCT (user_id, candidate_id, political_candidate_id)
```

One row = one grant = *person × constituency × campaign*. This single
constraint is what makes "one volunteer serving several campaigns — even
across parties — with separate ward/area assignments per campaign" work
without duplicate-row hacks. `NULLS NOT DISTINCT` keeps legacy
(campaign-less) grants colliding as intended. Most teams get this wrong.

## 3. Deliberate referential integrity

- Foreign keys choose their delete rules intentionally: `CASCADE` where a
  tenant's data should die with it, `SET NULL` where history must survive the
  actor (e.g. `granted_by`, `political_candidate_id` on canvasses).
- Enums are CHECK-constrained in most places (`users.role`,
  `user_candidates.role`, `user_parties.role`, `donations.status`,
  `canvassing.source`, `support_rating 1–5`).
- Money is `numeric` with `CHECK (amount > 0)` — no float currency.

## 4. Right denormalization where it matters

The voter roll is stored exactly as imported (denormalized `ward`,
`voter_area_name`, `union` + a GIN-indexed `jsonb attributes` bag). For
import-shaped, read-heavy data this is the correct call — normalizing it
would add joins to every filter with zero integrity benefit, and the
`attributes` bag lets any constituency's CSV shape land without migrations
(012).

## 5. Batched bulk writes on the heavy paths

The importers (`server/src/services/ingest/voterIngest.js`,
`geoLayerIngest.js`) insert in chunked multi-row `VALUES` batches inside
transactions — millions of rows are handled the right way, not row-by-row.

## 6. Operational discipline

- Numbered, transactional migrations with a ledger (`schema_migrations`) —
  a failing migration leaves nothing half-applied.
- Multi-step business operations run in explicit transactions
  (`withTransaction`), e.g. the §8 candidate-selection handover moves
  canvasses + donations + grants atomically.
- All SQL is parameterized throughout — no string-built queries.
