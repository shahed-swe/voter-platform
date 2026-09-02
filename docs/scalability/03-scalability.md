# Data modeling assessment — scalability & performance outlook

> Part 3 of the backend data-modeling assessment (2026-09-02).
> Companion files: [01-whats-done-right.md](01-whats-done-right.md) ·
> [02-shortfalls.md](02-shortfalls.md) · [04-n-plus-one.md](04-n-plus-one.md)

**Verdict: the current design scales comfortably to ~10× today's data.**
Today: ~2.26M voters, ~180K geo features, canvassing in the hundreds
(will grow into the hundreds of thousands during a real campaign).

## What holds up as-is

- **Voter reads** — every filter path hits a composite
  `(candidate_id, …)` index; the roll is read-mostly; the GIN index covers
  `attributes` queries. Adding constituencies scales linearly (each is its
  own partition by key).
- **Canvass writes** — single-row inserts on an indexed table; no contention
  points (no counters, no hot rows). Thousands of volunteers writing
  concurrently is a non-issue.
- **Imports** — chunked multi-row batches inside transactions; already the
  scalable shape.
- **Isolation reads** — campaign/party filtering rides
  `(candidate_id, political_candidate_id)` and the party-grant indexes; cost
  grows with *matching* rows, not total rows.

## The one real cliff: analytics aggregation

The persuadable-voters analysis, party stats, and cross-party history run
full `GROUP BY` / window scans over `canvassing`
(`canvassingModel.partyPersuadable`, `partyStats`,
`crossPartyVoterHistory`). Fine at 10⁴–10⁵ rows; painful at 10⁶–10⁷ with
many concurrent Political Admin dashboards.

**The fix when needed is incremental, not a redesign:**
1. First response: **materialized views** for per-campaign/per-party
   aggregates, refreshed on a schedule (dashboards tolerate minutes-old
   numbers).
2. If refresh cost grows: incremental aggregate tables maintained on canvass
   insert (one UPSERT per write).
3. Only at extreme scale: native Postgres **partitioning of `canvassing` by
   `candidate_id`** — the schema is already keyed for it, so this remains a
   mechanical change later. Adopting it now would be premature complexity.

## Known structural limits (data, not schema)

- **Cross-party voter matching** joins different constituencies' rolls on
  `sos_vid` — best-effort by design: rows without a voter number can't
  match, and there is no national-ID column in the source rolls. A stronger
  person-identity would need better source data, not a schema change.
- **Bengali-digit wards** (`'১৬'`) sort lexically, not numerically — cosmetic
  ordering quirk, harmless to performance.

## Other notes

- JWT payloads carry the user's full grant list; fine at realistic grant
  counts (≤ dozens), worth revisiting only if a user could hold hundreds of
  grants.
- `geo_layers` geometry lives as JSONB GeoJSON, not PostGIS — adequate for
  render-and-drill; if spatial *queries* (point-in-polygon at scale) become a
  feature, PostGIS is the upgrade path. Today's GPS→building snap uses a
  centroid index (021), which is sufficient.
- Connection pooling via `pg.Pool` defaults — set explicit pool sizing before
  putting real concurrent load on a single Postgres instance.
