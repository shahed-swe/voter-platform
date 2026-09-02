# Migrations — how they work + history

> Schema truth: [schema.generated.md](schema.generated.md) ·
> Semantics: [tables.md](tables.md) · Diagrams: [er-diagram.md](er-diagram.md)

## The runner

Homegrown, ~90 lines: [server/src/db/migrate.js](../../server/src/db/migrate.js).

- `npm run migrate` (root or `server/`) applies every
  `server/migrations/*.sql` (sorted by filename, `.down.sql` excluded) that is
  not yet recorded in the `schema_migrations` table. Each file runs inside a
  transaction together with its ledger insert — a failing migration leaves
  nothing half-applied.
- `npm run migrate --workspace server -- down` rolls back the **latest**
  applied file *if* a matching `NNN_name.down.sql` exists (only 016 has one);
  otherwise it just removes the ledger row and warns.
- Files are matched **by filename**, so never rename an applied migration.

## Adding a migration

1. Create `server/migrations/0NN_short_name.sql` — next number, snake-case
   name. Write idempotent SQL where cheap (`IF NOT EXISTS`,
   `DROP CONSTRAINT IF EXISTS` before re-adding) — it makes drift recovery
   painless.
2. Start the file with a comment: what + why + a pointer to the spec/feature
   doc that motivated it.
3. Run `npm run migrate`, then regenerate the schema reference:
   `node server/scripts/generate-schema-docs.js` — commit both.
4. Update [tables.md](tables.md) if the change carries semantics the schema
   can't express.

## History

| # | File | What it did |
|---|---|---|
| 001 | core_schema | Original single-tenant schema: voters, villages, constituencies, wards, voter_areas, statistics |
| 002 | users_and_auth | users, user_assignments (old scoping), user_sessions, audit_logs |
| 003 | canvassing_and_media | canvassing (visits) + media_files (photo/audio) |
| 004 | urban_extensions | buildings, polling_stations, urban columns |
| 005 | geo_columns | Align buildings/voter_areas/wards with production data columns |
| 006 | wards_geometry | Polygon geometry column on wards |
| 007 | polling_stations_columns | Align polling stations with production names |
| 008 | candidates | **The multi-tenant boundary**: candidates (= constituencies) table, `users.is_super_admin`, user_candidates grants |
| 009 | candidate_id_columns | `candidate_id` partition column on every data table |
| 010 | mt_unique_constraints | Per-constituency uniqueness (e.g. `voters (candidate_id, sos_vid)`) |
| 011 | geo_layers | Generic map-feature store + layer_definitions (replaces normalized geo for imports) |
| 012 | voter_attributes | `voters.attributes jsonb` — accept any constituency's CSV shape |
| 013 | layer_overlay | `layer_definitions.is_overlay` (non-drill overlay layers) |
| 014 | voter_filter_indexes | Composite indexes for common voter filter paths |
| 015 | candidate_volunteer_wards | `user_candidates.allowed_wards` — ward-scoped volunteers |
| 016 | users_email_nullable | Email optional; 'candidate' allowed in `users.role` (has a `.down.sql`) |
| 017 | volunteer_multi_candidate | `political_candidate_id` on grants + natural key `UNIQUE NULLS NOT DISTINCT (user, constituency, campaign)` — multi-campaign volunteers |
| 018 | canvassing_building_feature | Canvass ↔ geo_layers building feature link |
| 019 | user_candidates_voter_areas | `allowed_voter_areas` — area-scoped volunteers |
| 020 | voter_area_geo_map | voter_area_name → map feature ids glue table |
| 021 | geo_layers_centroid_index | Index for GPS→building snap |
| 022 | parties | **The party layer**: parties, user_parties (tenant_admin/donor), role vocabulary widened |
| 023 | rbac_restructure | 'candidate' joins the grant-role check. ⚠️ **Reconstructed file** — the original was applied 2026-08-31 but lost from the repo; recreated 2026-09-02 by diffing the live schema (see the file's header) |
| 024 | user_candidates_party | `party_id` tag on candidate grants — party isolation anchor |
| 025 | donations | donations table (flowApplication.md §9) |
| 026 | candidate_selection | candidate_selections — final pick per (seat, party) (§8) |

## Known drift & debt

- **023 was reconstructed** (see above). If a fresh-clone rebuild ever
  disagrees with production, diff against `schema.generated.md` first.
- The live DB predates some idempotent re-runs; a few objects exist that no
  migration creates cleanly on the *first* pass of an empty DB (composite FK
  variants on the legacy village tables). A fresh-DB rebuild test is part of
  the Phase 6 testing baseline.
- Legacy/dead tables kept for now: `user_sessions`, `user_assignments`,
  `voter_statistics` (all empty, superseded) — consolidation is a Phase 4
  decision, not a quick cleanup.
