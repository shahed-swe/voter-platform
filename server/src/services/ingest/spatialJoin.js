// Spatial parent assignment — match each child feature to the parent polygon
// that geometrically contains it. This is the self-serve equivalent of the
// data-prep spatial join that linked dhaka13's buildings to their voter areas.
//
// Geometry lives as GeoJSON (no PostGIS in the app DB), so we do it in JS:
// reduce each child to a representative point, then ray-cast it against parent
// polygons (with a bbox pre-filter so it stays fast at 10k+ features).

/** Bounding box [minX, minY, maxX, maxY] of any GeoJSON geometry. */
function bbox(geom) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const walk = (c) => {
        if (typeof c[0] === 'number') {
            if (c[0] < minX) minX = c[0];
            if (c[1] < minY) minY = c[1];
            if (c[0] > maxX) maxX = c[0];
            if (c[1] > maxY) maxY = c[1];
        } else {
            for (const x of c) walk(x);
        }
    };
    if (geom?.coordinates) walk(geom.coordinates);
    return [minX, minY, maxX, maxY];
}

/** A representative point [x, y] for a geometry (point as-is; polygon centroid). */
function representativePoint(geom) {
    if (!geom) return null;
    if (geom.type === 'Point') return geom.coordinates;
    // average the outer-ring vertices — good enough for buildings / compact shapes
    let ring;
    if (geom.type === 'Polygon') ring = geom.coordinates[0];
    else if (geom.type === 'MultiPolygon') ring = geom.coordinates[0]?.[0];
    else if (geom.type === 'LineString') ring = geom.coordinates;
    else { const [a, b, c, d] = bbox(geom); return [(a + c) / 2, (b + d) / 2]; }
    if (!ring?.length) return null;
    let sx = 0, sy = 0;
    for (const [x, y] of ring) { sx += x; sy += y; }
    return [sx / ring.length, sy / ring.length];
}

/** Ray-casting: is point [x,y] inside a single ring (array of [x,y])? */
function pointInRing(pt, ring) {
    const [x, y] = pt;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        const intersect = ((yi > y) !== (yj > y)) &&
            (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

/** Point in a Polygon (outer ring minus holes) or MultiPolygon. */
function pointInGeometry(pt, geom) {
    if (!geom) return false;
    const inPoly = (poly) => {
        if (!poly.length || !pointInRing(pt, poly[0])) return false;
        for (let h = 1; h < poly.length; h++) if (pointInRing(pt, poly[h])) return false; // hole
        return true;
    };
    if (geom.type === 'Polygon') return inPoly(geom.coordinates);
    if (geom.type === 'MultiPolygon') return geom.coordinates.some(inPoly);
    return false;
}

/**
 * Build a lookup that, given a child geometry, returns the feature_id of the
 * containing parent (or null). `parentFeatures` is a GeoJSON FeatureCollection
 * whose features carry properties.feature_id + a polygon geometry.
 */
function buildParentMatcher(parentFeatures) {
    const parents = (parentFeatures?.features || [])
        .filter((f) => f.geometry && f.properties?.feature_id != null)
        .map((f) => ({ id: String(f.properties.feature_id), geom: f.geometry, box: bbox(f.geometry) }));

    return function matchParent(childGeom) {
        const pt = representativePoint(childGeom);
        if (!pt) return null;
        const [x, y] = pt;
        for (const p of parents) {
            // bbox pre-filter, then exact ray-cast
            if (x < p.box[0] || x > p.box[2] || y < p.box[1] || y > p.box[3]) continue;
            if (pointInGeometry(pt, p.geom)) return p.id;
        }
        return null;
    };
}

module.exports = { buildParentMatcher, representativePoint, pointInGeometry, bbox };
