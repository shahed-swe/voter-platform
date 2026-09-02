erDiagram
    %% ===== IDENTITY & ACCESS =====
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
        text_array allowed_wards "volunteer/sub-admin restriction"
        text_array allowed_voter_areas
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

    %% ===== FIELD DATA =====
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

    %% ===== PARTY OPERATIONS =====
    donations {
        bigint donation_id PK
        text party_id FK "donations are PARTY-anchored"
        bigint donor_user_id FK
        bigint volunteer_user_id FK
        bigint political_candidate_id FK "campaign context"
        text candidate_id FK
        numeric amount "CHECK amount greater than 0"
        text status "recorded to confirmed"
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

    %% ===== RELATIONSHIPS: Identity & Access =====
    users ||--o{ user_parties : "party-level grant"
    parties ||--o{ user_parties : ""
    users ||--o{ user_candidates : "constituency grant"
    candidates ||--o{ user_candidates : ""
    users ||--o{ user_candidates : "political_candidate_id (campaign)"
    parties ||--o{ user_candidates : "party tag on candidate grants"
    users ||--o{ user_sessions : ""

    %% ===== RELATIONSHIPS: Field Data =====
    users ||--o{ canvassing : "canvasser (user_id)"
    users ||--o{ canvassing : "campaign (political_candidate_id)"
    voters ||--o{ canvassing : "many visits per voter"
    canvassing ||--o{ media_files : ""
    voters ||--o{ media_files : ""

    %% ===== RELATIONSHIPS: Party Operations =====
    parties ||--o{ donations : ""
    users ||--o{ donations : "donor"
    users ||--o{ donations : "volunteer confirms"
    parties ||--o{ candidate_selections : "one final pick per (seat, party)"
    candidates ||--o{ candidate_selections : ""
    users ||--o{ candidate_selections : "selected candidate"
    users ||--o{ audit_logs : ""

    %% ===== RELATIONSHIPS: Geography & Map =====
    candidates ||--o{ voters : "roll import per constituency"
    candidates ||--o{ geo_layers : "map features (ward/village/... polygons)"
    candidates ||--o{ layer_definitions : "which layers exist + styling"
    candidates ||--o{ wards : ""
    candidates ||--o{ voter_areas : ""
    candidates ||--o{ villages : ""
    candidates ||--o{ buildings : ""
    candidates ||--o{ polling_stations : ""
    candidates ||--o{ voter_area_geo_map : "voter_area_name to map feature ids"
    wards ||--o{ voter_areas : ""
    wards ||--o{ polling_stations : ""
    voter_areas ||--o{ buildings : ""
    voters ||--o{ voter_village_mapping : ""
    villages ||--o{ voter_village_mapping : ""
    constituencies ||--o{ wards : "legacy hierarchy"