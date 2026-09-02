# Table documentation — semantics & gotchas

> Mechanical truth (all columns/types/keys/indexes):
> [schema.generated.md](schema.generated.md) — regenerate after every migration
> with `node server/scripts/generate-schema-docs.js`.
> Diagrams: [er-diagram.md](er-diagram.md) · Migrations: [migrations.md](migrations.md)

This file records what the schema **cannot say**: what each table means, the
naming traps, and the invariants the application enforces. Ordered by domain.

## Vocabulary (read before anything else)

| Term in code/schema | Actually means |
|---|---|
| `candidates` table / `candidate_id` | A **constituency** (seat): `dhaka10`, `dhaka8`… Historical name from the single-tenant era |
| `political_candidate_id` | A **campaign** — the `user_id` of the person running (`users.role='candidate'`). The campaign axis of all data isolation |
| `party_id` | A political party (slug string). The party axis of isolation |
| tenant_admin | The **Political Admin** — leads one party |
| super admin | `users.is_super_admin = true`. A **flag beside `role`** (the platform admin's `role` is plain `'admin'`) — every permission check must test the flag, never the role |

## Identity & access

### users
One row per login. `role` is the *global* role; the effective role in a
constituency comes from the grant row (`user_candidates.role`), which in
practice always matches. Key points:
- `is_super_admin` (added in 008) is independent of `role` — see Vocabulary.
  The API refuses to delete or edit a super-admin account (lock-out guard in
  `managementController`).
- `referred_by` records who created the account (informational; the
  authoritative "who added X to my team" is the grant's `granted_by`).
- Passwords: bcrypt in `password_hash`; `password_changed` marks whether the
  initial password was ever rotated.
- Deleting a user cascades to their grants, canvasses, donations (see FKs) —
  which is why the app **detaches grants instead of deleting accounts** until
  no grant remains.

### parties
One row per political party; `party_id` is a human-made slug
(`bangladesh-national-party`). Created by the super admin or auto-created by
name when a Political Admin is registered (`managementController.resolveParty`
slugifies; Bangla names that produce an empty slug get `party-<timestamp>`).

### user_parties
**Party-level grants** — the roles that hold no constituency:
`tenant_admin` (Political Admin) and `donor`. `granted_by` powers the rule
that a Candidate manages only donors *they* added. A user may hold several
rows (different parties/roles) — `UNIQUE (user_id, party_id, role)`.

### user_candidates
**The heart of RBAC.** One row = one grant: *person × constituency ×
campaign*.
- Natural key `UNIQUE NULLS NOT DISTINCT (user_id, candidate_id,
  political_candidate_id)` (017). NULLS NOT DISTINCT matters: legacy grants
  with NULL campaign still collide as intended.
- `role` here is the role **within that campaign** (`candidate`, `admin` =
  Campaign Admin, `sub_admin`, `volunteer`).
- For a `role='candidate'` row, `political_candidate_id = user_id` (the
  campaign is themselves) and `party_id` tags which party registered them —
  **this is where a candidate's party lives** (not `user_parties`).
- `allowed_wards` / `allowed_voter_areas` (015/019) restrict volunteers and
  sub-admins; NULL = whole constituency. Enforced in SQL on every voter
  endpoint.
- `granted_by` = who attached this person (renders as "যোগ করেছেন …" and
  builds the sub-admin → volunteer tree in Team Management).
- The §8 selection handover re-points these rows between campaigns; because
  of the natural key, colliding rows are deleted before the UPDATE.

### user_sessions
**Dead table** (0 rows, nothing writes it). Auth is stateless JWT
(`utils/jwt.js`, HS256, versioned `v` claim). Kept from the legacy app;
candidate for removal in Phase 4.

### candidates (constituencies)
One row per seat with its UI config: `filter_config` (which voter filters the
client shows), `map_config`, `theme`, `title`. `party_id` here is a **legacy
single-tenant column** (NOT NULL, points at `default`) — party ownership of
real campaigns lives on `user_candidates.party_id`. Do not use it for
isolation logic.

## Field data

### voters
The imported voter roll, ~2.26M rows, partitioned by `candidate_id`
(constituency). Denormalized geography exactly as imported: `ward`,
`voter_area_name`, `union`, `village_csv`… plus a `jsonb attributes` bag
(GIN-indexed) for import-specific extra columns.
- `UNIQUE (candidate_id, sos_vid)` — the roll voter number is unique **per
  constituency**. Cross-party voter-history matching joins different
  constituencies' rolls on `sos_vid` (best-effort: rows without one can't
  match).
- `status` ('Not visited' → 'Visited'…) is a convenience mirror; the source
  of truth for visits is `canvassing`.
- Ward values are Bengali digits (`'১৬'`) — always compare as text.
- `clean_voter_area` is mostly NULL in current imports; the app filters on
  `voter_area_name`.

### canvassing
One row per **visit** (survey response). The most important columns:
- `user_id` — the canvasser; `candidate_id` — the constituency;
  `political_candidate_id` — **the campaign stamp**. Every read path filters
  on it (`pcId(req)`): this single column implements
  "Candidate A never sees Candidate B's data". NULL = legacy canvass from
  before the campaign era; visible to super admin as unattributed.
- Multiple rows per voter = visit history; support changes across visits
  drive the persuadable-voters analysis.
- `support_level` free-text by convention: `Strong support`, `Leaning
  support`, `Undecided`, `Leaning opposed`, `Strong oppose` (list lives in
  `client/src/components/canvassing/CanvassFormModal.jsx`); `support_rating`
  1–5 (CHECK); `is_undecided` is a separate flag.
- `source` CHECK `Primary|Secondary`. The canvass form always writes
  `Primary`; the demo seeder writes `Secondary` and uses it as its wipe
  marker (`server/scripts/seed-demo.js`).
- GPS: `latitude/longitude` + `location_verified`; building linkage via
  `building_id` (legacy) or `building_feature_id` (geo_layers feature, 018).

### media_files
Photos/audio attached to a canvass (`file_type` CHECK). Files live on disk
(`file_path`); rows cascade with their canvass/voter. Empty in current
deployments but fully wired (upload middleware + media routes).

## Party operations

### donations
Party-anchored money trail (025): donor (a `user_parties` donor) →
volunteer, with optional campaign context (`political_candidate_id`,
`candidate_id`) captured from the volunteer's grant at record time.
- `status`: `recorded` (donor's claim) → `confirmed` (volunteer pressed
  "টাকা পেয়েছি"); `confirmed_at` set then. Only the addressed volunteer can
  confirm — the WHERE clause *is* the authorization.
- Party isolation: a donor can only donate to volunteers verifiably in their
  party; the Political Admin's ledger reads by `party_id`.

### candidate_selections
The party's **final pick** per seat (026): `UNIQUE (candidate_id, party_id)`,
upserted on re-selection (covers withdrawal). Written inside the §8 handover
transaction (`selectionController`) together with the audit row and the
re-pointing of canvasses/donations/grants.

### audit_logs
Generic audit trail (002 + 009). **Sparsely used**: today only the §8
selection writes rows. `candidate_id` is NOT NULL — any new audit write must
supply a constituency. Growing its coverage (user create/delete/edit) is a
known gap, noted in featureRemaining.

## Geography & map stack

### geo_layers + layer_definitions (the live map)
`layer_definitions` declares, per constituency, which map layers exist
(`layer_key`: ward / village / …), their drill hierarchy
(`parent_layer_key`), ordering, styling, and whether a layer is an overlay
(013). `geo_layers` holds every feature: GeoJSON `geometry`, centroid
lat/lng, population counts, `props` bag; PK `(candidate_id, layer_key,
feature_id)`, drill-down via parent feature. ~180K rows. Imported by the
super admin (Import Data page → `ingestController`).

### voter_area_geo_map
Small glue table (020): maps a voter's `voter_area_name` **string** to the
ward/village feature ids in `geo_layers`, so voter filters can highlight map
features. PK `(candidate_id, voter_area_name)`.

### wards, voter_areas, villages, constituencies, buildings, polling_stations
The **legacy normalized geography** of the single-tenant apps (001/004).
Mostly 0 rows in current deployments — current imports go to `geo_layers` —
but the tables remain referenced by `urbanController` / `villageController`
endpoints and old FKs (e.g. `voters.village_id`). Treat as read-mostly
legacy; consolidation is a Phase 4 candidate. Note `voters`/`villages` and
related FKs are **composite** `(candidate_id, village_id)` — the generated
doc lists composite FKs one column per line.

### voter_village_mapping, unmatched_villages, voter_statistics, user_assignments
Import-era helpers, all currently empty:
- `voter_village_mapping` — voter↔village joins for village analytics.
- `unmatched_villages` — import QA: CSV village names that matched nothing.
- `voter_statistics` — precomputed completion stats (superseded by live
  analytics queries).
- `user_assignments` — the OLD assignment system (upazila/union/village
  scoped), superseded by `user_candidates.allowed_wards/allowed_voter_areas`.
  Do not build on it.

## Infrastructure

### schema_migrations
The homegrown migration runner's ledger (filename-keyed). See
[migrations.md](migrations.md). Never edit rows by hand except when
reconciling drift (and document it if you do).
