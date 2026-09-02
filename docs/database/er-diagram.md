# ER diagrams

> Column-level truth: [schema.generated.md](schema.generated.md) (regenerate with
> `node server/scripts/generate-schema-docs.js`). Semantics: [tables.md](tables.md).

**Read this first:** the table named `candidates` holds **constituencies**
(Dhaka-10, Dhaka-8, …), *not* people — the name survives from the app's
single-tenant era when one deployment = one candidate. A person running for
office is a `users` row (`role='candidate'`), and a **campaign** is identified
by that person's `user_id` carried in `political_candidate_id` columns. Keep
this translation in mind for every diagram below.

## Overview — the four domains

```mermaid
flowchart LR
    subgraph identity [Identity & Access]
        users; parties; user_parties; user_candidates
    end
    subgraph field [Field Data]
        voters; canvassing; media_files
    end
    subgraph party_ops [Party Operations]
        donations; candidate_selections; audit_logs
    end
    subgraph geo [Geography & Map]
        candidates[candidates = constituencies]; wards; voter_areas; villages; geo_layers; buildings; polling_stations
    end
    identity -->|grants scope over| field
    field -->|stamped per campaign| party_ops
    geo -->|every row carries candidate_id| field
```

Nearly every table carries a `candidate_id → candidates.candidate_id` column
(**constituency partition key**, `ON DELETE CASCADE`): data is physically
partitioned per constituency, then *logically* partitioned per campaign by
`political_candidate_id` and per party by `party_id`.

## Identity & access (the RBAC core)

```mermaid
erDiagram
    users {
        bigint user_id PK
        text username UK
        text role "admin|sub_admin|volunteer|candidate|tenant_admin|donor"
        boolean is_super_admin "the Main Admin flag - lives BESIDE role"
        boolean is_active
        bigint referred_by FK
    }
    parties {
        text party_id PK "slug, e.g. bangladesh-national-party"
        text name
        text status
    }
    user_parties {
        bigint id PK
        bigint user_id FK
        text party_id FK
        text role "tenant_admin|donor"
        bigint granted_by FK
    }
    user_candidates {
        bigint id PK
        bigint user_id FK
        text candidate_id FK "constituency"
        bigint political_candidate_id FK "the CAMPAIGN (a users row)"
        text role "admin|sub_admin|volunteer|candidate"
        text party_id FK "set on candidate grants only"
        text-array allowed_wards "volunteer/sub-admin restriction"
        text-array allowed_voter_areas
        bigint granted_by FK
    }
    candidates {
        text candidate_id PK "constituency, e.g. dhaka10"
        text constituency "display, e.g. Dhaka-10"
        text party_id FK "LEGACY single-tenant column"
    }
    user_sessions {
        bigint session_id PK
        bigint user_id FK
        text token UK "UNUSED - JWTs are stateless"
    }

    users ||--o{ user_parties : "party-level grant"
    parties ||--o{ user_parties : ""
    users ||--o{ user_candidates : "constituency grant"
    candidates ||--o{ user_candidates : ""
    users ||--o{ user_candidates : "political_candidate_id (campaign)"
    parties ||--o{ user_candidates : "party tag on candidate grants"
    users ||--o{ user_sessions : ""
```

The natural key of `user_candidates` is
`UNIQUE NULLS NOT DISTINCT (user_id, candidate_id, political_candidate_id)` —
**one grant per (person, constituency, campaign)**. That is what lets one
volunteer serve several campaigns (even across parties) with separate
ward/area assignments per campaign.

## Field data (voters & canvassing)

```mermaid
erDiagram
    voters {
        bigint voter_id PK
        text sos_vid "roll voter number - UNIQUE per constituency"
        text candidate_id FK "constituency partition"
        text ward
        text voter_area_name
        text name
        jsonb attributes
    }
    canvassing {
        bigint canvass_id PK
        bigint voter_id FK
        bigint user_id FK "canvasser"
        text candidate_id FK "constituency"
        bigint political_candidate_id FK "CAMPAIGN STAMP - all isolation hangs on this"
        text support_level "Strong support..Strong oppose"
        int support_rating "1-5"
        boolean is_undecided
        boolean follow_up_needed
        text source "Primary|Secondary"
        timestamptz canvass_date
    }
    media_files {
        bigint media_id PK
        bigint canvass_id FK
        bigint voter_id FK
        text file_type "photo|audio"
    }
    users ||--o{ canvassing : "canvasser (user_id)"
    users ||--o{ canvassing : "campaign (political_candidate_id)"
    voters ||--o{ canvassing : "many visits per voter"
    canvassing ||--o{ media_files : ""
    voters ||--o{ media_files : ""
```

- A voter may be canvassed **many times** (visit history) and **by several
  campaigns** — cross-party voter matching joins rolls on `sos_vid`.
- `political_candidate_id` NULL = legacy pre-campaign canvass (still rendered,
  shown unattributed in cross-party views).

## Party operations

```mermaid
erDiagram
    donations {
        bigint donation_id PK
        text party_id FK "donations are PARTY-anchored"
        bigint donor_user_id FK
        bigint volunteer_user_id FK
        bigint political_candidate_id FK "campaign context"
        text candidate_id FK
        numeric amount "CHECK > 0"
        text status "recorded -> confirmed"
        timestamptz confirmed_at
    }
    candidate_selections {
        bigint id PK
        text candidate_id FK "constituency (seat)"
        text party_id FK
        bigint selected_user_id FK "the party's final pick"
        bigint selected_by FK
    }
    audit_logs {
        bigint log_id PK
        bigint user_id FK
        text action
        jsonb changes
        text candidate_id FK "NOT NULL - every log row needs a constituency"
    }
    parties ||--o{ donations : ""
    users ||--o{ donations : "donor"
    users ||--o{ donations : "volunteer confirms"
    parties ||--o{ candidate_selections : "one final pick per (seat, party)"
    candidates ||--o{ candidate_selections : ""
    users ||--o{ candidate_selections : "selected candidate"
    users ||--o{ audit_logs : ""
```

`candidate_selections` is `UNIQUE (candidate_id, party_id)` — re-selecting
replaces the pick; the §8 handover transaction re-points canvassing,
donations, and team grants from the losing campaigns to the winner.

## Geography & map stack

```mermaid
erDiagram
    candidates ||--o{ voters : "roll import per constituency"
    candidates ||--o{ geo_layers : "map features (ward/village/... polygons)"
    candidates ||--o{ layer_definitions : "which layers exist + styling"
    candidates ||--o{ wards : ""
    candidates ||--o{ voter_areas : ""
    candidates ||--o{ villages : ""
    candidates ||--o{ buildings : ""
    candidates ||--o{ polling_stations : ""
    candidates ||--o{ voter_area_geo_map : "voter_area_name -> map feature ids"
    wards ||--o{ voter_areas : ""
    wards ||--o{ polling_stations : ""
    voter_areas ||--o{ buildings : ""
    voters ||--o{ voter_village_mapping : ""
    villages ||--o{ voter_village_mapping : ""
    constituencies ||--o{ wards : "legacy hierarchy"
```

The **live** map stack is `layer_definitions` (which layers a constituency
has, their hierarchy and styling) + `geo_layers` (one row per map feature,
GeoJSON in `geometry`, drill-down via `parent_layer_key`/`parent_feature_id`)
+ `voter_area_geo_map` (joins a voter's `voter_area_name` string to feature
ids). The `wards` / `voter_areas` / `villages` / `constituencies` /
`buildings` / `polling_stations` tables are the older normalized geography
from the single-tenant apps — mostly empty in current deployments (see row
counts in schema.generated.md) but still referenced by some endpoints.
Voters' geography lives denormalized on the voter row itself
(`ward`, `voter_area_name`, `union`, …) matching the imported roll.
