# Voter Platform

A scalable rewrite of the `dhaka13` and `panchagar` apps as a single, multi-tenant codebase.

- **Backend:** Node.js + Express + PostgreSQL (no SQLite)
- **Frontend:** React + Vite + Tailwind CSS
- **Same feature set as the originals:** auth, user/role management, area assignments, voter search, canvassing (with GPS), media uploads (photo/audio), analytics, election results, urban data (wards / voter areas / buildings / polling stations).

A single deployment is configured per tenant (`dhaka13`, `panchagarh`, etc.) via env vars — the code is identical, only configuration changes.

---

## Layout

```
voter-platform/
├── server/                          # Express backend (API)
│   ├── server.js
│   ├── migrations/                  # PostgreSQL schema migrations
│   └── src/
│       ├── config/                  # env-driven config
│       ├── db/                      # pool + migration runner + seed
│       ├── middleware/              # auth, cors, error, upload, cache
│       ├── models/                  # data access (one module per domain)
│       ├── controllers/             # request handlers
│       ├── routes/                  # express routers (mounted by routes/index.js)
│       ├── services/                # email, sms, notifications, region, cache
│       └── utils/                   # helpers (jwt, password, errors, asyncHandler)
└── client/                          # React + Vite + Tailwind frontend
    └── src/
        ├── api/                     # axios client + per-domain API modules
        ├── auth/                    # AuthContext + ProtectedRoute
        ├── components/              # shared UI (Navbar, Layout, StatCard, ...)
        ├── hooks/                   # useApi
        ├── pages/                   # one component per route
        └── styles/                  # tailwind + brand component classes
```

---

## Prerequisites

- Node.js 18+
- PostgreSQL 13+ (or Docker, see below)
- (Optional) Gmail account for email and BulkSMSBD account for SMS

---

## Quick start — Docker (recommended)

This brings up PostgreSQL + the backend, with migrations applied automatically.

```bash
cd voter-platform
cp .env.example .env                      # edit JWT_SECRET, optionally tenant info
docker compose up -d --build              # starts postgres + migrate + server
docker compose exec server node src/db/seed.js   # seed an admin user
docker compose logs -f server             # tail server logs
```

Backend is now at `http://localhost:3000`. Then run the client locally:

```bash
cd client && npm install && npm run dev   # http://localhost:5173
```

To stop and clean up:

```bash
docker compose down            # stop containers, keep volumes
docker compose down -v         # also wipe pgdata + uploads volumes
```

The compose file defines three services:

| Service    | Purpose                                                                 |
|------------|-------------------------------------------------------------------------|
| `postgres` | PostgreSQL 16 with a persistent `pgdata` volume                          |
| `migrate`  | One-shot container that runs `node src/db/migrate.js up` and exits      |
| `server`   | The Express API, mounted with a `uploads` volume for photos/audio       |

Migrations are idempotent, so re-running `docker compose up` after pulling code applies any new migrations automatically.

---

## 1) Server setup (without Docker)

```bash
cd server
cp .env.example .env       # then edit DATABASE_URL, JWT_SECRET, etc.
npm install
npm run migrate            # apply all SQL migrations
npm run seed               # create the initial admin user
npm run dev                # http://localhost:3000
```

### Required env vars

| Variable           | Purpose                                              |
|--------------------|------------------------------------------------------|
| `PORT`             | Backend port (default 3000)                          |
| `TENANT_ID`        | `dhaka13`, `panchagarh`, ...                          |
| `TENANT_NAME`      | Display name (used in emails/SMS)                    |
| `TENANT_PUBLIC_URL`| Public URL for links inside notifications            |
| `DATABASE_URL`     | `postgres://user:pass@host:port/dbname`              |
| `JWT_SECRET`       | Token signing secret                                 |
| `ALLOWED_ORIGINS`  | Comma-separated CORS origins (leave blank in dev)    |
| `EMAIL_*`          | SMTP/Gmail config (set `EMAIL_ENABLED=true` to send) |
| `SMS_*`            | BulkSMSBD config (set `SMS_ENABLED=true` to send)    |

Migrations live in `server/migrations/*.sql` and are tracked in a `schema_migrations` table.
Re-running `npm run migrate` is idempotent.

---

## 2) Client setup

```bash
cd client
npm install
npm run dev                # http://localhost:5173
```

Vite proxies `/api` and `/uploads` to `http://localhost:3000`, so you can run the
server and client side-by-side during development.

For production:

```bash
npm run build              # builds to client/dist/
```

Serve `client/dist/` from your reverse proxy (nginx, Cloudflare, etc.) and point
`/api` and `/uploads` at the backend.

---

## 3) Convenience: run both from the repo root

The root `package.json` defines npm workspaces:

```bash
npm install                # installs both workspaces
npm run migrate
npm run seed
npm run dev:server         # in one terminal
npm run dev:client         # in another terminal
```

---

## Importing legacy data (e.g. dhaka_north production)

If you already have a PostgreSQL deployment with the legacy schema (the `dhaka_north` DB on the old VPS), you can copy its data into the new platform without touching production.

The workflow is **dump → staging → transform → target**:

```bash
# 1) Dump production into a local file (data + schema, no owner/acl)
pg_dump 'postgresql://USER:PASSWORD@HOST:5432/dhaka_north?sslmode=require' \
        --no-owner --no-acl --no-privileges \
        --format=plain \
  > voter-platform/imports/dhaka_north.sql

# 2) Bring up the staging Postgres (separate container, port 5433)
cd voter-platform
docker compose --profile import up -d staging

# 3) Restore the dump into staging
docker compose exec -T staging \
    psql -U staging -d legacy -f /imports/dhaka_north.sql

# 4) Run the importer with SOURCE pointed at staging
docker compose exec \
    -e SOURCE_DATABASE_URL=postgres://staging:staging@staging:5432/legacy \
    server npm run import:legacy

# 5) Tear staging down when finished
docker compose --profile import down
```

The importer ([server/scripts/import-legacy.js](server/scripts/import-legacy.js)):

- Auto-detects the **column intersection** between staging and target, so minor schema drift is OK
- Converts PostGIS `geometry` columns (in `villages`, `voter_areas`) to GeoJSON for our JSONB columns
- Imports tables in **foreign-key dependency order**
- Streams rows in batches of 1,000 (override with `IMPORT_BATCH_SIZE`)
- Truncates target tables first (override with `IMPORT_TRUNCATE=false` to append)
- **Resets all BIGSERIAL sequences** at the end so future inserts don't collide

The `staging` service uses the **postgis/postgis** image because the legacy dump references PostGIS geometry types. Your production DB stays read-only after the dump.

---

## Default admin login

After running `npm run seed`:

- **Username:** `admin`
- **Password:** `admin123`

> Change the password immediately. You can override the seeded credentials with
> `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_EMAIL`,
> `SEED_ADMIN_NAME` environment variables.

---

## Feature parity with `dhaka13` / `panchagar`

| Feature                              | Status | Notes                                         |
|--------------------------------------|--------|-----------------------------------------------|
| JWT auth, role-based access          | ✅      | admin / sub_admin / volunteer roles           |
| User CRUD + temp-password onboarding | ✅      | Email + SMS welcome notifications             |
| Area assignments                     | ✅      | upazila / union / mauza / village / voter_area |
| Voter search & lookup                | ✅      | by name, SOS VID, village, voter area        |
| Canvassing submission + GPS          | ✅      | photo/audio uploads via multer to disk        |
| Media management                     | ✅      | photo + audio per canvass record              |
| Analytics dashboard                  | ✅      | overview, support distribution, demographics |
| Election results                     | ✅      | aggregated by union / area                    |
| Urban data (wards/voter areas)       | ✅      | buildings, polling stations, hierarchy        |
| Multi-tenant deployment              | ✅      | one codebase, configured per tenant via env   |

---

## Why this replaces dhaka13/panchagar

Both legacy apps were 95%+ identical: same routes, same UI, same DB schema. They diverged only in:

- Port (`2020` vs `2000`)
- District-specific text and URLs (`/dhaka13/` vs `/panchagarh/`)
- Some scripts/migrations that one had but the other didn't

This rewrite collapses both into a single, properly layered codebase:

- One Express app, configured per tenant
- One PostgreSQL schema with all migrations
- One React app with tenant-agnostic branding
- Clear separation: `config / db / middleware / models / services / controllers / routes`

Deploy two instances — one with `TENANT_ID=dhaka13`, one with `TENANT_ID=panchagarh` — and the same code serves both.
