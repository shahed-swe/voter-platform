# Database schema (generated)

> **Do not edit by hand.** Regenerate after every migration:
> `node server/scripts/generate-schema-docs.js`
>
> Semantics and relationships are documented in [tables.md](tables.md);
> the ER diagram lives in [er-diagram.md](er-diagram.md).

Generated: 2026-09-02 · 26 tables

## audit_logs

Rows at generation time: 0

| Column | Type | Null | Default |
|---|---|---|---|
| log_id | bigint |  | nextval(audit_logs_log_id_seq) |
| user_id | bigint | yes |  |
| action | text |  |  |
| entity_type | text | yes |  |
| entity_id | bigint | yes |  |
| changes | jsonb | yes |  |
| ip_address | text | yes |  |
| created_at | timestamptz |  | now() |
| candidate_id | text |  |  |

- **PK** (log_id)
- **FK** candidate_id → candidates.candidate_id (ON DELETE CASCADE)
- **FK** user_id → users.user_id (ON DELETE SET NULL)
- **INDEX** `USING btree (action)`
- **INDEX** `USING btree (created_at)`
- **INDEX** `USING btree (candidate_id)`
- **INDEX** `USING btree (user_id)`

## buildings

Rows at generation time: 0

| Column | Type | Null | Default |
|---|---|---|---|
| building_id | bigint |  | nextval(buildings_building_id_seq) |
| voter_area_id | text | yes |  |
| building_name | text | yes |  |
| address | text | yes |  |
| latitude | double precision | yes |  |
| longitude | double precision | yes |  |
| floors | integer | yes |  |
| metadata | jsonb | yes |  |
| created_at | timestamptz |  | now() |
| osm_id | bigint | yes |  |
| house | text | yes |  |
| street | text | yes |  |
| city | text | yes |  |
| office | text | yes |  |
| name_bn | text | yes |  |
| floor_number | text | yes |  |
| flat_number | text | yes |  |
| geometry | jsonb | yes |  |
| candidate_id | text |  |  |

- **PK** (building_id)
- **FK** candidate_id → candidates.candidate_id (ON DELETE CASCADE)
- **FK** voter_area_id → voter_areas.voter_area_id (ON DELETE SET NULL)
- **INDEX** `USING btree (candidate_id)`
- **INDEX** `USING btree (latitude, longitude)`
- **INDEX** `USING btree (osm_id)`
- **INDEX** `USING btree (voter_area_id)`

## candidate_selections

Rows at generation time: 0

| Column | Type | Null | Default |
|---|---|---|---|
| id | bigint |  | nextval(candidate_selections_id_seq) |
| candidate_id | text |  |  |
| party_id | text |  |  |
| selected_user_id | bigint |  |  |
| selected_by | bigint | yes |  |
| selected_at | timestamptz |  | now() |

- **UNIQUE** (candidate_id, party_id) — `candidate_selections_candidate_id_party_id_key`
- **PK** (id)
- **FK** candidate_id → candidates.candidate_id (ON DELETE CASCADE)
- **FK** party_id → parties.party_id (ON DELETE CASCADE)
- **FK** selected_by → users.user_id (ON DELETE SET NULL)
- **FK** selected_user_id → users.user_id (ON DELETE CASCADE)
- **INDEX** `USING btree (party_id)`

## candidates

Rows at generation time: 6

| Column | Type | Null | Default |
|---|---|---|---|
| candidate_id | text |  |  |
| name | text |  |  |
| constituency | text |  |  |
| title | text |  |  |
| subtitle | text | yes |  |
| logo_url | text | yes |  |
| theme | jsonb | yes |  |
| filter_config | jsonb |  |  |
| map_config | jsonb |  |  |
| status | text |  | 'active' |
| created_by | bigint | yes |  |
| created_at | timestamptz |  | now() |
| updated_at | timestamptz |  | now() |
| party_id | text |  |  |

- **PK** (candidate_id)
- **FK** created_by → users.user_id (ON DELETE SET NULL)
- **FK** party_id → parties.party_id (ON DELETE RESTRICT)
- **INDEX** `USING btree (party_id)`
- **INDEX** `USING btree (status)`

## canvassing

Rows at generation time: 109

| Column | Type | Null | Default |
|---|---|---|---|
| canvass_id | bigint |  | nextval(canvassing_canvass_id_seq) |
| voter_id | bigint |  |  |
| user_id | bigint |  |  |
| support_level | text |  |  |
| contact_phone | text | yes |  |
| contact_email | text | yes |  |
| issues_concerns | text | yes |  |
| household_size | integer | yes |  |
| income_bracket | text | yes |  |
| follow_up_needed | boolean |  | false |
| follow_up_date | date | yes |  |
| canvass_date | timestamptz |  | now() |
| latitude | double precision | yes |  |
| longitude | double precision | yes |  |
| location_verified | boolean |  | false |
| support_rating | integer | yes |  |
| is_undecided | boolean |  | false |
| source | text |  | 'Primary' |
| voter_member_count | integer | yes |  |
| is_minority | boolean |  | false |
| floor_number | text | yes |  |
| flat_number | text | yes |  |
| building_name | text | yes |  |
| address | text | yes |  |
| building_id | bigint | yes |  |
| candidate_id | text |  |  |
| political_candidate_id | bigint | yes |  |
| building_feature_id | text | yes |  |

- **PK** (canvass_id)
- **FK** building_id → buildings.building_id (ON DELETE SET NULL)
- **FK** candidate_id → candidates.candidate_id (ON DELETE CASCADE)
- **FK** political_candidate_id → users.user_id (ON DELETE SET NULL)
- **FK** user_id → users.user_id (ON DELETE CASCADE)
- **FK** voter_id → voters.voter_id (ON DELETE CASCADE)
- **CHECK** `((source = ANY (ARRAY['Primary'::text, 'Secondary'::text])))`
- **CHECK** `(((support_rating >= 1) AND (support_rating <= 5)))`
- **INDEX** `USING btree (candidate_id, building_feature_id)`
- **INDEX** `USING btree (building_id)`
- **INDEX** `USING btree (candidate_id)`
- **INDEX** `USING btree (canvass_date)`
- **INDEX** `USING btree (is_minority)`
- **INDEX** `USING btree (is_undecided)`
- **INDEX** `USING btree (latitude, longitude)`
- **INDEX** `USING btree (candidate_id, political_candidate_id)`
- **INDEX** `USING btree (source)`
- **INDEX** `USING btree (support_rating)`
- **INDEX** `USING btree (user_id)`
- **INDEX** `USING btree (voter_id)`

## constituencies

Rows at generation time: 0

| Column | Type | Null | Default |
|---|---|---|---|
| constituency_id | text |  |  |
| name | text |  |  |
| district | text | yes |  |
| upazila | text | yes |  |
| created_at | timestamptz |  | now() |
| constituency_number | integer | yes |  |
| region | text | yes |  |
| candidate_id | text |  |  |

- **PK** (constituency_id)
- **FK** candidate_id → candidates.candidate_id (ON DELETE CASCADE)
- **INDEX** `USING btree (candidate_id)`

## donations

Rows at generation time: 10

| Column | Type | Null | Default |
|---|---|---|---|
| donation_id | bigint |  | nextval(donations_donation_id_seq) |
| party_id | text |  |  |
| donor_user_id | bigint |  |  |
| volunteer_user_id | bigint |  |  |
| political_candidate_id | bigint | yes |  |
| candidate_id | text | yes |  |
| amount | numeric |  |  |
| note | text | yes |  |
| status | text |  | 'recorded' |
| recorded_at | timestamptz |  | now() |
| confirmed_at | timestamptz | yes |  |

- **PK** (donation_id)
- **FK** candidate_id → candidates.candidate_id (ON DELETE SET NULL)
- **FK** donor_user_id → users.user_id (ON DELETE CASCADE)
- **FK** party_id → parties.party_id (ON DELETE CASCADE)
- **FK** political_candidate_id → users.user_id (ON DELETE SET NULL)
- **FK** volunteer_user_id → users.user_id (ON DELETE CASCADE)
- **CHECK** `((amount > (0)::numeric))`
- **CHECK** `((status = ANY (ARRAY['recorded'::text, 'confirmed'::text])))`
- **INDEX** `USING btree (donor_user_id, recorded_at DESC)`
- **INDEX** `USING btree (party_id, recorded_at DESC)`
- **INDEX** `USING btree (volunteer_user_id, status, recorded_at DESC)`

## geo_layers

Rows at generation time: 180,507

| Column | Type | Null | Default |
|---|---|---|---|
| candidate_id | text |  |  |
| layer_key | text |  |  |
| feature_id | text |  |  |
| parent_layer_key | text | yes |  |
| parent_feature_id | text | yes |  |
| name | text | yes |  |
| code | text | yes |  |
| total_population | integer | yes |  |
| male_count | integer | yes |  |
| female_count | integer | yes |  |
| latitude | double precision | yes |  |
| longitude | double precision | yes |  |
| geometry | jsonb | yes |  |
| props | jsonb |  | '{}' |
| created_at | timestamptz |  | now() |

- **PK** (candidate_id, layer_key, feature_id)
- **FK** candidate_id → candidates.candidate_id (ON DELETE CASCADE)
- **INDEX** `USING btree (candidate_id, layer_key, latitude, longitude)`
- **INDEX** `USING btree (candidate_id, layer_key)`
- **INDEX** `USING btree (candidate_id, layer_key, parent_feature_id)`

## layer_definitions

Rows at generation time: 24

| Column | Type | Null | Default |
|---|---|---|---|
| candidate_id | text |  |  |
| layer_key | text |  |  |
| display_name | text |  |  |
| display_name_bn | text | yes |  |
| parent_layer_key | text | yes |  |
| ordinal | integer |  | 0 |
| geometry_type | text |  | 'polygon' |
| is_leaf | boolean |  | false |
| click_action | text |  | 'drill' |
| color_by | text |  | 'uniform' |
| style | jsonb |  | '{}' |
| row_count | integer |  | 0 |
| created_at | timestamptz |  | now() |
| updated_at | timestamptz |  | now() |
| is_overlay | boolean |  | false |

- **PK** (candidate_id, layer_key)
- **FK** candidate_id → candidates.candidate_id (ON DELETE CASCADE)
- **CHECK** `((geometry_type = ANY (ARRAY['polygon'::text, 'point'::text])))`
- **INDEX** `USING btree (candidate_id, ordinal)`

## media_files

Rows at generation time: 0

| Column | Type | Null | Default |
|---|---|---|---|
| media_id | bigint |  | nextval(media_files_media_id_seq) |
| canvass_id | bigint |  |  |
| voter_id | bigint |  |  |
| file_type | text |  |  |
| mime_type | text |  |  |
| file_name | text |  |  |
| file_path | text |  |  |
| original_size | bigint | yes |  |
| compressed_size | bigint | yes |  |
| duration_seconds | integer | yes |  |
| transcription | text | yes |  |
| created_at | timestamptz |  | now() |
| candidate_id | text |  |  |

- **PK** (media_id)
- **FK** candidate_id → candidates.candidate_id (ON DELETE CASCADE)
- **FK** canvass_id → canvassing.canvass_id (ON DELETE CASCADE)
- **FK** voter_id → voters.voter_id (ON DELETE CASCADE)
- **CHECK** `((file_type = ANY (ARRAY['photo'::text, 'audio'::text])))`
- **INDEX** `USING btree (candidate_id)`
- **INDEX** `USING btree (canvass_id)`
- **INDEX** `USING btree (created_at)`
- **INDEX** `USING btree (file_type)`
- **INDEX** `USING btree (voter_id)`

## parties

Rows at generation time: 6

| Column | Type | Null | Default |
|---|---|---|---|
| party_id | text |  |  |
| name | text |  |  |
| logo_url | text | yes |  |
| theme | jsonb | yes |  |
| status | text |  | 'active' |
| created_by | bigint | yes |  |
| created_at | timestamptz |  | now() |
| updated_at | timestamptz |  | now() |

- **PK** (party_id)
- **FK** created_by → users.user_id (ON DELETE SET NULL)
- **INDEX** `USING btree (status)`

## polling_stations

Rows at generation time: 0

| Column | Type | Null | Default |
|---|---|---|---|
| polling_station_id | text |  |  |
| ward_id | text | yes |  |
| name | text | yes |  |
| address | text | yes |  |
| latitude | double precision | yes |  |
| longitude | double precision | yes |  |
| metadata | jsonb | yes |  |
| created_at | timestamptz |  | now() |
| polling_centre_name | text | yes |  |
| voter_area | text | yes |  |
| candidate_id | text |  |  |

- **PK** (polling_station_id)
- **FK** candidate_id → candidates.candidate_id (ON DELETE CASCADE)
- **FK** ward_id → wards.ward_id (ON DELETE SET NULL)
- **INDEX** `USING btree (voter_area)`
- **INDEX** `USING btree (candidate_id)`
- **INDEX** `USING btree (ward_id)`

## schema_migrations

Rows at generation time: 26

| Column | Type | Null | Default |
|---|---|---|---|
| id | integer |  | nextval(schema_migrations_id_seq) |
| filename | text |  |  |
| applied_at | timestamptz |  | now() |

- **UNIQUE** (filename) — `schema_migrations_filename_key`
- **PK** (id)

## unmatched_villages

Rows at generation time: 0

| Column | Type | Null | Default |
|---|---|---|---|
| id | integer |  | nextval(unmatched_villages_id_seq) |
| csv_village_name | text | yes |  |
| voter_count | integer |  | 0 |
| suggested_matches | text | yes |  |
| created_at | timestamptz |  | now() |
| candidate_id | text |  |  |

- **UNIQUE** (csv_village_name) — `unmatched_villages_csv_village_name_key`
- **PK** (id)
- **FK** candidate_id → candidates.candidate_id (ON DELETE CASCADE)
- **INDEX** `USING btree (candidate_id)`
- **INDEX** `USING btree (csv_village_name)`

## user_assignments

Rows at generation time: 0

| Column | Type | Null | Default |
|---|---|---|---|
| assignment_id | bigint |  | nextval(user_assignments_assignment_id_seq) |
| user_id | bigint |  |  |
| assigned_by_user_id | bigint | yes |  |
| assignment_type | text |  |  |
| assignment_value | text |  |  |
| village_id | text | yes |  |
| notes | text | yes |  |
| created_at | timestamptz |  | now() |
| updated_at | timestamptz |  | now() |
| candidate_id | text |  |  |

- **PK** (assignment_id)
- **FK** assigned_by_user_id → users.user_id (ON DELETE SET NULL)
- **FK** candidate_id → villages.village_id (ON DELETE SET NULL)
- **FK** candidate_id → candidates.candidate_id (ON DELETE CASCADE)
- **FK** candidate_id → villages.candidate_id (ON DELETE SET NULL)
- **FK** user_id → users.user_id (ON DELETE CASCADE)
- **FK** village_id → villages.candidate_id (ON DELETE SET NULL)
- **FK** village_id → villages.village_id (ON DELETE SET NULL)
- **CHECK** `((assignment_type = ANY (ARRAY['upazila'::text, 'union'::text, 'mauza'::text, 'village'::text, 'voter_area'::text])))`
- **INDEX** `USING btree (assignment_type)`
- **INDEX** `USING btree (user_id)`
- **INDEX** `USING btree (assignment_value)`
- **INDEX** `USING btree (village_id)`
- **INDEX** `USING btree (candidate_id)`

## user_candidates

Rows at generation time: 43

| Column | Type | Null | Default |
|---|---|---|---|
| user_id | bigint |  |  |
| candidate_id | text |  |  |
| role | text |  |  |
| granted_by | bigint | yes |  |
| granted_at | timestamptz |  | now() |
| allowed_wards | text[] | yes |  |
| political_candidate_id | bigint | yes |  |
| id | bigint |  | nextval(user_candidates_id_seq) |
| allowed_voter_areas | text[] | yes |  |
| party_id | text | yes |  |

- **UNIQUE** (user_id, candidate_id, political_candidate_id) — `user_candidates_natural_key`
- **PK** (id)
- **FK** candidate_id → candidates.candidate_id (ON DELETE CASCADE)
- **FK** granted_by → users.user_id (ON DELETE SET NULL)
- **FK** party_id → parties.party_id (ON DELETE SET NULL)
- **FK** political_candidate_id → users.user_id (ON DELETE SET NULL)
- **FK** user_id → users.user_id (ON DELETE CASCADE)
- **CHECK** `((role = ANY (ARRAY['admin'::text, 'sub_admin'::text, 'volunteer'::text, 'candidate'::text])))`
- **INDEX** `USING btree (candidate_id)`
- **INDEX** `USING btree (party_id)`
- **INDEX** `USING btree (candidate_id, political_candidate_id)`
- **INDEX** `USING btree (user_id)`

## user_parties

Rows at generation time: 9

| Column | Type | Null | Default |
|---|---|---|---|
| id | bigint |  | nextval(user_parties_id_seq) |
| user_id | bigint |  |  |
| party_id | text |  |  |
| role | text |  |  |
| granted_by | bigint | yes |  |
| granted_at | timestamptz |  | now() |

- **PK** (id)
- **UNIQUE** (user_id, party_id, role) — `user_parties_user_id_party_id_role_key`
- **FK** granted_by → users.user_id (ON DELETE SET NULL)
- **FK** party_id → parties.party_id (ON DELETE CASCADE)
- **FK** user_id → users.user_id (ON DELETE CASCADE)
- **CHECK** `((role = ANY (ARRAY['tenant_admin'::text, 'donor'::text])))`
- **INDEX** `USING btree (party_id)`
- **INDEX** `USING btree (user_id)`

## user_sessions

Rows at generation time: 0

| Column | Type | Null | Default |
|---|---|---|---|
| session_id | bigint |  | nextval(user_sessions_session_id_seq) |
| user_id | bigint |  |  |
| token | text |  |  |
| expires_at | timestamptz |  |  |
| ip_address | text | yes |  |
| user_agent | text | yes |  |
| created_at | timestamptz |  | now() |
| candidate_id | text |  |  |

- **PK** (session_id)
- **UNIQUE** (token) — `user_sessions_token_key`
- **FK** candidate_id → candidates.candidate_id (ON DELETE CASCADE)
- **FK** user_id → users.user_id (ON DELETE CASCADE)
- **INDEX** `USING btree (expires_at)`
- **INDEX** `USING btree (token)`
- **INDEX** `USING btree (user_id)`
- **INDEX** `USING btree (candidate_id)`

## users

Rows at generation time: 51

| Column | Type | Null | Default |
|---|---|---|---|
| user_id | bigint |  | nextval(users_user_id_seq) |
| username | text |  |  |
| email | text | yes |  |
| name | text |  |  |
| password_hash | text |  |  |
| role | text |  |  |
| is_active | boolean |  | true |
| password_changed | boolean |  | false |
| phone | varchar(20) | yes |  |
| address | text | yes |  |
| referred_by | bigint | yes |  |
| created_at | timestamptz |  | now() |
| updated_at | timestamptz |  | now() |
| is_super_admin | boolean |  | false |

- **PK** (user_id)
- **UNIQUE** (username) — `users_username_key`
- **FK** referred_by → users.user_id (ON DELETE SET NULL)
- **CHECK** `((role = ANY (ARRAY['admin'::text, 'sub_admin'::text, 'volunteer'::text, 'candidate'::text, 'tenant_admin'::text, 'donor'::text])))`
- **INDEX** `USING btree (email)`
- **INDEX** `USING btree (is_active)`
- **INDEX** `USING btree (phone)`
- **INDEX** `USING btree (referred_by)`
- **INDEX** `USING btree (role)`
- **INDEX** `USING btree (username)`

## villages

Rows at generation time: 0

| Column | Type | Null | Default |
|---|---|---|---|
| village_id | text |  |  |
| district | text | yes |  |
| upazila | text | yes |  |
| union | text | yes |  |
| mauza | text | yes |  |
| village_name | text | yes |  |
| total_population | integer | yes |  |
| male_count | integer | yes |  |
| female_count | integer | yes |  |
| male_pct | double precision | yes |  |
| female_pct | double precision | yes |  |
| geometry | jsonb | yes |  |
| created_at | timestamptz |  | now() |
| updated_at | timestamptz |  | now() |
| candidate_id | text |  |  |

- **PK** (candidate_id, village_id)
- **FK** candidate_id → candidates.candidate_id (ON DELETE CASCADE)
- **INDEX** `USING btree (mauza)`
- **INDEX** `USING btree (total_population)`
- **INDEX** `USING btree ("union")`
- **INDEX** `USING btree (upazila)`
- **INDEX** `USING btree (candidate_id)`

## voter_area_geo_map

Rows at generation time: 81

| Column | Type | Null | Default |
|---|---|---|---|
| candidate_id | text |  |  |
| voter_area_name | text |  |  |
| ward_feature_id | text |  |  |
| village_feature_id | text |  |  |

- **PK** (candidate_id, voter_area_name)

## voter_areas

Rows at generation time: 0

| Column | Type | Null | Default |
|---|---|---|---|
| voter_area_id | text |  |  |
| ward_id | text | yes |  |
| village_name | text | yes |  |
| voter_area_name | text | yes |  |
| geometry | jsonb | yes |  |
| created_at | timestamptz |  | now() |
| union_name | text | yes |  |
| mauza_code | text | yes |  |
| mauza_name | text | yes |  |
| village_code | text | yes |  |
| rmo | text | yes |  |
| bangla_voter_area_name | text | yes |  |
| total_population | integer | yes | 0 |
| male_count | integer | yes | 0 |
| female_count | integer | yes | 0 |
| sex_ratio | double precision | yes |  |
| household_size | double precision | yes |  |
| total_nrb | integer | yes |  |
| candidate_id | text |  |  |

- **PK** (voter_area_id)
- **FK** candidate_id → candidates.candidate_id (ON DELETE CASCADE)
- **FK** ward_id → wards.ward_id (ON DELETE SET NULL)
- **INDEX** `USING btree (candidate_id)`
- **INDEX** `USING btree (mauza_name)`
- **INDEX** `USING btree (total_population)`
- **INDEX** `USING btree (union_name)`
- **INDEX** `USING btree (village_name)`
- **INDEX** `USING btree (ward_id)`

## voter_statistics

Rows at generation time: 0

| Column | Type | Null | Default |
|---|---|---|---|
| stat_id | text |  |  |
| stat_type | text | yes |  |
| geographic_level | text | yes |  |
| name | text | yes |  |
| total_voters | integer | yes |  |
| visited_voters | integer | yes |  |
| remaining_voters | integer | yes |  |
| completion_percentage | double precision | yes |  |
| created_at | timestamptz |  | now() |
| updated_at | timestamptz |  | now() |
| candidate_id | text |  |  |

- **PK** (stat_id)
- **FK** candidate_id → candidates.candidate_id (ON DELETE CASCADE)
- **INDEX** `USING btree (geographic_level)`
- **INDEX** `USING btree (stat_type)`
- **INDEX** `USING btree (candidate_id)`

## voter_village_mapping

Rows at generation time: 0

| Column | Type | Null | Default |
|---|---|---|---|
| mapping_id | bigint |  | nextval(voter_village_mapping_mapping_id_seq) |
| voter_id | bigint |  |  |
| village_id | text |  |  |
| is_primary | boolean |  | false |
| created_at | timestamptz |  | now() |
| candidate_id | text |  |  |

- **PK** (mapping_id)
- **UNIQUE** (voter_id, village_id) — `voter_village_mapping_voter_id_village_id_key`
- **FK** candidate_id → villages.candidate_id (ON DELETE CASCADE)
- **FK** candidate_id → villages.village_id (ON DELETE CASCADE)
- **FK** candidate_id → candidates.candidate_id (ON DELETE CASCADE)
- **FK** village_id → villages.candidate_id (ON DELETE CASCADE)
- **FK** village_id → villages.village_id (ON DELETE CASCADE)
- **FK** voter_id → voters.voter_id (ON DELETE CASCADE)
- **INDEX** `USING btree (candidate_id)`
- **INDEX** `USING btree (is_primary)`
- **INDEX** `USING btree (village_id)`
- **INDEX** `USING btree (village_id, voter_id)`
- **INDEX** `USING btree (voter_id)`

## voters

Rows at generation time: 2,262,071

| Column | Type | Null | Default |
|---|---|---|---|
| voter_id | bigint |  | nextval(voters_voter_id_seq) |
| sos_vid | text |  |  |
| name | text |  |  |
| father_husband | text | yes |  |
| mother | text | yes |  |
| occupation | text | yes |  |
| birthdate | text | yes |  |
| age | integer | yes |  |
| address | text | yes |  |
| upazila | text | yes |  |
| union | text | yes |  |
| ward | text | yes |  |
| post_office | text | yes |  |
| post_code | text | yes |  |
| voter_area_name | text | yes |  |
| voter_area_code | text | yes |  |
| gender | text | yes |  |
| village_csv | text | yes |  |
| village_id | text | yes |  |
| status | text |  | 'Not visited' |
| clean_voter_area | text | yes |  |
| usl | text | yes |  |
| created_at | timestamptz |  | now() |
| updated_at | timestamptz |  | now() |
| candidate_id | text |  |  |
| attributes | jsonb |  | '{}' |

- **UNIQUE** (candidate_id, sos_vid) — `voters_candidate_sos_vid_key`
- **PK** (voter_id)
- **FK** candidate_id → candidates.candidate_id (ON DELETE CASCADE)
- **FK** candidate_id → villages.candidate_id (ON DELETE SET NULL)
- **FK** candidate_id → villages.village_id (ON DELETE SET NULL)
- **FK** village_id → villages.village_id (ON DELETE SET NULL)
- **FK** village_id → villages.candidate_id (ON DELETE SET NULL)
- **CHECK** `((gender = ANY (ARRAY['Male'::text, 'Female'::text, 'Other'::text])))`
- **CHECK** `((status = ANY (ARRAY['Not visited'::text, 'Visited'::text, 'Follow-up needed'::text, 'Declined to participate'::text])))`
- **INDEX** `USING btree (age)`
- **INDEX** `USING gin (attributes)`
- **INDEX** `USING btree (candidate_id)`
- **INDEX** `USING btree (candidate_id, status)`
- **INDEX** `USING btree (candidate_id, voter_area_name)`
- **INDEX** `USING btree (candidate_id, ward)`
- **INDEX** `USING btree (clean_voter_area)`
- **INDEX** `USING btree (gender)`
- **INDEX** `USING btree (name)`
- **INDEX** `USING btree (sos_vid)`
- **INDEX** `USING btree (status)`
- **INDEX** `USING btree ("union")`
- **INDEX** `USING btree (upazila)`
- **INDEX** `USING btree (usl)`
- **INDEX** `USING btree (village_id)`

## wards

Rows at generation time: 0

| Column | Type | Null | Default |
|---|---|---|---|
| ward_id | text |  |  |
| constituency_id | text | yes |  |
| ward_number | text | yes |  |
| name | text | yes |  |
| created_at | timestamptz |  | now() |
| union_name | text | yes |  |
| total_population | integer | yes | 0 |
| male_count | integer | yes | 0 |
| female_count | integer | yes | 0 |
| geometry | jsonb | yes |  |
| candidate_id | text |  |  |

- **PK** (ward_id)
- **FK** candidate_id → candidates.candidate_id (ON DELETE CASCADE)
- **FK** constituency_id → constituencies.constituency_id (ON DELETE SET NULL)
- **INDEX** `USING btree (candidate_id)`
- **INDEX** `USING btree (constituency_id)`
- **INDEX** `USING btree (ward_number)`
- **INDEX** `USING btree (union_name)`

