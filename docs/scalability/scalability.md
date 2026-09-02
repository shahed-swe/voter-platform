# Scalability & Maintainability Plan

> **Why this exists:** the platform works, but a new developer joining today has
> no map — no ER diagram, no table docs, no API reference, no architecture
> overview, and a README that predates the multi-party RBAC era. Every change
> currently requires reverse-engineering the code (or asking an AI). This plan
> fixes that, phase by phase. We execute the phases **one at a time, in order**;
> each has concrete deliverables and a definition of done.

**Current state (audited 2026-09-02):**

| Area | State |
|---|---|
| Database | 26 tables, 26 raw-SQL migrations, homegrown runner (`schema_migrations`) — **no ER diagram, no table docs** |
| Backend | Express, layered (routes → controllers → models → `pg` pool), 20 route files / 19 controllers / 16 models — **structure is good, documentation is zero** |
| Data access | Raw SQL via `pg` (`query/one/many/withTransaction`) — no ORM, no schema-as-code, no type safety |
| API | ~120 endpoints — **no reference, no OpenAPI spec**; auth/role requirements only discoverable by reading middleware |
| Frontend | React + Vite + Tailwind, per-domain `api/` modules, role-driven routing — **no architecture doc, no route/role map** |
| RBAC | 7 roles, two axes (party / campaign), subtle scoping rules (`pcId`, `partyScope`, `targetInScope`) — **the most complex part, documented nowhere** |
| Tests | **None.** Not one test file |
| Onboarding | README covers setup only, and is outdated (single-tenant era) |

**Data-modeling assessment (2026-09-02)** — a four-part honest review of the
current schema, feeding Phase 4:
[what's done right](01-whats-done-right.md) ·
[shortfalls](02-shortfalls.md) ·
[scalability outlook](03-scalability.md) ·
[N+1 inventory](04-n-plus-one.md)

---

## Phase 1 — Database documentation + ER diagram

The single highest-value artifact. Everything else references it.

**Deliverables**
- `docs/database/er-diagram.md` — Mermaid `erDiagram` of all 26 tables,
  grouped and colour-noted by domain:
  - *Identity & access*: `users`, `user_candidates`, `user_parties`,
    `user_sessions`, `user_assignments`, `parties`, `candidates` (constituencies)
  - *Field data*: `voters`, `canvassing`, `media_files`, `voter_statistics`
  - *Geography*: `wards`, `voter_areas`, `villages`, `voter_village_mapping`,
    `voter_area_geo_map`, `geo_layers`, `layer_definitions`, `buildings`,
    `polling_stations`, `constituencies`, `unmatched_villages`
  - *Party operations*: `donations`, `candidate_selections`, `audit_logs`
- `docs/database/tables.md` — one section per table: purpose, every column
  (type, nullability, meaning), keys, constraints, indexes, and the
  **non-obvious semantics** the schema can't express, e.g.:
  - `candidates` = *constituencies* (naming is historical — must be documented!)
  - `user_candidates` natural key `(user_id, candidate_id, political_candidate_id)`
    `NULLS NOT DISTINCT` — one grant per campaign, multi-campaign volunteers
  - `users.is_super_admin` is a flag **beside** `role` (role stays `admin`)
  - `canvassing.political_candidate_id` = the campaign stamp that powers all
    data encapsulation
- `docs/database/migrations.md` — how the migration runner works, how to add a
  migration, the numbered history with one line each (001 → 026).
- A small generator script `server/scripts/generate-schema-docs.js` that
  introspects `information_schema` and regenerates the column tables, so the
  docs can't silently rot.

**Done when:** a developer can answer "where does a canvass's party isolation
come from?" using only these docs.

> ✅ **Completed 2026-09-02.** All four deliverables shipped (the column tables
> live in the generated `schema.generated.md`; `tables.md` carries the curated
> semantics so hand-written docs never duplicate what the generator owns).
> The audit also surfaced real drift: migration `023_rbac_restructure.sql`
> existed only in the database's ledger, not in the repo — reconstructed from
> a live-schema diff, so a fresh clone now rebuilds the schema correctly.

## Phase 2 — Architecture & RBAC documentation (backend)

**Deliverables**
- `docs/architecture/backend.md`:
  - request lifecycle: `verifyToken` → `scopeToCandidate` → router → controller
    → model → pool; where errors flow (`asyncHandler` → error middleware)
  - the **two scoping axes** explained with diagrams: party axis
    (`user_parties`, `partyScope`) vs campaign axis
    (`user_candidates.political_candidate_id`, `pcId`, `campaignId`)
  - JWT payload anatomy (`candidates[]`, `parties[]`, `active_candidate`,
    `political_candidate_id`, `v` versioning), the switch-candidate flow
  - the hierarchy engine: `RANK`, `CREATABLE`, `targetInScope`,
    detach-not-destroy deletion
  - directory conventions (what belongs in a controller vs a model vs a service)
- `docs/architecture/rbac-matrix.md` — one table: **role × capability**
  (create who / see which surveys / which pages / which endpoints), the
  authoritative statement of the rules we enforce today, cross-linked to the
  code that enforces each cell.

**Done when:** the RBAC matrix alone can settle "should role X be able to do Y?"

## Phase 3 — API reference

**Deliverables**
- `docs/api/README.md` — conventions: auth header, error envelope
  (`{success:false, error, code}`), pagination style, Bengali/Unicode notes.
- `docs/api/endpoints.md` — every route grouped by router: method, path,
  required role(s)/scope, request body/params, response shape, and which
  frontend module calls it. Generated skeleton via a script that walks
  `server/src/routes/*` (`server/scripts/generate-api-docs.js`), then
  hand-annotated.
- **Optional stretch:** `docs/api/openapi.yaml` for the core domains
  (auth, management, canvassing, donations) — enables Swagger UI and client
  generation later. Only after the markdown reference exists.

**Done when:** a developer can integrate against the API without opening a
single controller.

## Phase 4 — Data-access hardening (the ORM question)

**Recommendation: do NOT big-bang rewrite to an ORM.** 120 endpoints of
battle-tested SQL (heavy `array_agg`, `FILTER`, CTEs, Bengali collation,
`NULLS NOT DISTINCT` upserts) would be risky to port wholesale, and ORMs are
weakest exactly where this app is strongest (analytics SQL). Instead, get the
ORM *benefits* incrementally:

1. **Schema as code:** adopt **Drizzle ORM in introspection mode**
   (`drizzle-kit introspect`) to generate a TypeScript schema from the live DB.
   This gives: a single authoritative schema file, generated migrations going
   forward (replacing hand-numbered SQL for *new* changes), and types — without
   touching existing queries. (Prisma is the alternative; Drizzle chosen
   because it coexists cleanly with raw SQL and stays close to Postgres.)
2. **New code uses Drizzle; old code migrates opportunistically.** Simple
   CRUD models (`partyModel`, `donationModel`, `userModel` basics) port first;
   analytics/canvassing SQL stays raw (Drizzle's `sql` template keeps it typed).
3. **Guardrails now, regardless of ORM:** every model keeps the *only* SQL for
   its tables (no SQL in controllers — a few strays exist in
   `managementController`/`selectionController`; move them into models).

**Deliverables:** `docs/architecture/data-access.md` (the decision record +
porting guide), Drizzle config + introspected schema, stray SQL moved into
models. **Done when:** a new table can be added schema-first with a generated
migration, and no controller contains SQL.

## Phase 5 — Frontend architecture documentation

**Deliverables**
- `docs/architecture/frontend.md`:
  - route map: every route in `App.jsx` × which roles reach it × which page
    component renders (mirror of the RBAC matrix, client side)
  - role-based navigation/landing logic (`roleHome`, `AppHeader` nav sets)
  - data layer conventions: `api/` modules ↔ endpoints, the shared
    `queryClient` (and why it's cleared on login/logout), `useApi` vs
    TanStack Query usage
  - component organization (`components/` shared vs `pages/` route-owned),
    styling conventions (Tailwind + brand classes, `bn()` number formatting)
  - state rules: what lives in AuthContext, what in query cache, what in URL

**Done when:** a frontend dev can add a role-gated page without reading
`AuthContext`/`ProtectedRoute` source.

## Phase 6 — Testing baseline

Documentation says what the system *should* do; tests keep it true.

**Deliverables**
- Supertest + node test-runner (or Jest) harness against a test database.
- **Priority 1 — RBAC/isolation integration tests** (the crown jewels):
  party isolation, campaign encapsulation, volunteer ward/area scoping,
  hierarchy guards, donor flows, Main-Admin cross-party access — the exact
  matrix we currently re-verify by hand with curl after every change.
- Priority 2 — auth (login/JWT version/switch), management CRUD, selection §8
  handover transaction.
- `npm test` wired at the root; smoke suite documented in the dev guide.

**Done when:** the curl matrix we run by hand after every change is a single
`npm test`.

## Phase 7 — Developer onboarding guide (ties it all together)

**Deliverables**
- Rewritten root `README.md` — honest 2026 description (multi-party RBAC
  platform), quick start, links into `docs/`.
- `docs/onboarding.md` — day-one path: setup → run migrations → `seed-demo` →
  log in with `docs/demo-credentials.md` accounts → guided tour of one full
  vertical slice (a canvass, from volunteer login to PA analytics) → where
  every kind of code lives → how to add (a) an endpoint, (b) a page, (c) a
  table, each as a checklist.
- `docs/conventions.md` — code style, naming (Bengali labels, `bn()`),
  error handling, commit/branch conventions.

**Done when:** a new developer reaches "first meaningful PR" without asking a
single "where is…?" question.

---

## Execution order & status

| # | Phase | Status |
|---|---|---|
| 1 | ER diagram + database docs | ✅ **done 2026-09-02** — [er-diagram.md](../database/er-diagram.md), [tables.md](../database/tables.md), [migrations.md](../database/migrations.md), generated [schema.generated.md](../database/schema.generated.md) + generator script. Bonus: found & reconstructed the lost `023_rbac_restructure.sql` migration (was applied to the DB but missing from the repo — fresh clones couldn't rebuild the schema) |
| 2 | Backend architecture + RBAC matrix | ☐ not started |
| 3 | API reference | ☐ not started |
| 4 | Data-access hardening (Drizzle, schema-as-code) | ☐ not started |
| 5 | Frontend architecture docs | ☐ not started |
| 6 | Testing baseline | ☐ not started |
| 7 | Onboarding guide + README rewrite | ☐ not started |

Rationale for the order: docs of what exists (1–3) before changing anything
(4), because the data-access work needs the schema/RBAC docs as its spec;
tests (6) before onboarding (7) so the guide can point at a green `npm test`.
Phases 1–3 and 5 are pure documentation — zero regression risk — and deliver
most of the "new developer can navigate alone" value immediately.
