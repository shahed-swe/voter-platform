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