# `map_config` spec

Lives on `candidates.map_config` (JSONB). Drives the dashboard + canvassing map
without hardcoding "urban" / "rural" cases.

## Top-level shape

```jsonc
{
  "layers": [
    { /* layer 1 (root)   */ },
    { /* layer 2 (deeper) */ },
    { /* layer 3 (deeper) */ }
  ],
  "center":      [23.78, 90.34],   // optional initial map center [lat, lng]
  "zoom":        12,               // optional initial zoom
  "right_panel": ["population_stats", "voter_density_legend", "assign_user"]
}
```

`layers` is **ordered, shallow → deep**.

- The first layer is the constituency-level view (always shown).
- Each subsequent layer is reached by clicking on a feature of the layer above.
- When a layer below is active, the parent layer remains visible underneath
  (parent polygons stay drawn as context — they just dim slightly).

## Layer shape

```jsonc
{
  "id":        "wards",                 // unique per config
  "source":    "wards",                 // table name from the geo whitelist
  "parent":    "constituency",          // id of the parent layer, or null/"constituency" for root
  "parent_fk": "ward_id",                // FK column on THIS source that points at parent (only for non-root)

  "label_from": "ward_number",          // property to use for tooltips
  "click":      "drill",                // "drill" (default), "modal:canvassed_voters", or "select"
  "color_by":   "uniform",              // "uniform" | "bucket" | "canvassed"
  "style": {
    "fill":      "#A5D6A7",             // fill colour (when color_by="uniform")
    "stroke":    "#1B5E20",
    "weight":    1.2,
    "opacity":   0.95,
    "fillOpacity": 0.55
  },

  // Only when color_by="bucket"
  "bucket_field": "total_population",
  "buckets":      [0, 2000, 5000, 10000, 15000],
  "bucket_palette": ["#E8F5E9", "#A5D6A7", "#66BB6A", "#2E7D32", "#1B5E20"]
}
```

## `source` whitelist

The backend exposes generic endpoints for these tables only:

| `source`           | Geometry column | Notes                                 |
|--------------------|-----------------|---------------------------------------|
| `wards`            | `geometry`      | TEXT PK (ward_id)                     |
| `voter_areas`      | `geometry`      | TEXT PK (voter_area_id), parent: ward |
| `villages`         | `geometry`      | (candidate_id, village_id) composite  |
| `buildings`        | `geometry`      | BIGSERIAL PK, parent: voter_area      |
| `polling_stations` | `geometry`      | (point, not polygon)                  |

`parent_fk` must be a real foreign-key-style column on the child table that points at the parent's primary key (e.g. `voter_areas.ward_id` → `wards.ward_id`).

## `click` actions

| Value                       | Behavior                                                          |
|-----------------------------|-------------------------------------------------------------------|
| `"drill"`                   | Click → render child layer's features for THIS parent (drill in)  |
| `"select"`                  | Click → highlight the feature but don't drill                     |
| `"modal:canvassed_voters"`  | Open the `<CanvassedVotersModal>` (Bengali table). Only meaningful when the feature has a `building_id` because the modal queries `canvassing.building_id`. |

## `color_by` modes

| Mode        | Source                                                                                 |
|-------------|----------------------------------------------------------------------------------------|
| `"uniform"` | All features use the `style.fill` color                                                |
| `"bucket"`  | Reads `bucket_field` from each feature's properties, finds bucket index in `buckets`, picks `bucket_palette[idx]`. Falls back to last color if value exceeds top bucket. |
| `"canvassed"` | Special-cased for buildings: green if `properties.canvassed`, blue otherwise           |

## `right_panel`

Array of panel keys, rendered top-to-bottom in the right sidebar.

| Key                     | Component                                |
|-------------------------|------------------------------------------|
| `population_stats`      | Total Voters / Male / Female (live)      |
| `voter_density_legend`  | Color-bucket legend reading `map_config` |
| `assign_user`           | The "Assign User" card                   |

## Examples

### Equivalent to the old `"urban"` (Dhaka-13)

```json
{
  "layers": [
    {
      "id": "wards", "source": "wards", "parent": null,
      "label_from": "ward_number", "click": "drill",
      "color_by": "uniform",
      "style": { "fill": "#A5D6A7", "stroke": "#1B5E20", "weight": 1, "fillOpacity": 0.55 }
    },
    {
      "id": "voter_areas", "source": "voter_areas", "parent": "wards", "parent_fk": "ward_id",
      "label_from": "bangla_voter_area_name", "click": "drill",
      "color_by": "bucket",
      "bucket_field": "total_population",
      "buckets":      [0, 5000, 15000, 30000],
      "bucket_palette": ["#C8E6C9", "#81C784", "#43A047", "#1B5E20"],
      "style": { "stroke": "#1B5E20", "weight": 1.2, "fillOpacity": 0.55 }
    },
    {
      "id": "buildings", "source": "buildings", "parent": "voter_areas", "parent_fk": "voter_area_id",
      "label_from": "house", "click": "modal:canvassed_voters",
      "color_by": "canvassed",
      "style": { "stroke": "#1565C0", "weight": 1, "fillOpacity": 0.7 }
    }
  ],
  "center": [23.78, 90.34], "zoom": 12,
  "right_panel": ["population_stats", "assign_user"]
}
```

### Equivalent to the old `"rural"` (Panchagarh)

```json
{
  "layers": [
    {
      "id": "villages", "source": "villages", "parent": null,
      "label_from": "village_name", "click": "select",
      "color_by": "bucket",
      "bucket_field": "total_population",
      "buckets":         [0, 2000, 5000, 10000, 15000],
      "bucket_palette":  ["#E8F5E9", "#A5D6A7", "#66BB6A", "#2E7D32", "#1B5E20"],
      "style": { "stroke": "#1B5E20", "weight": 0.6, "fillOpacity": 0.7 }
    }
  ],
  "center": [26.34, 88.55], "zoom": 10,
  "right_panel": ["population_stats", "voter_density_legend", "assign_user"]
}
```

## Backward compatibility

The dispatcher reads `map_config.layers` first. If it's missing or empty, it
falls back to the legacy `map_config.kind` field and renders either
`<UrbanDashboard>` or `<RuralDashboard>`. Both existing candidates keep
working unchanged.

To opt a candidate INTO the new system, just add a `layers` array to its
`map_config`. To opt out, remove it.
