// Small GeoJSON helpers — the platform stores geometry as plain GeoJSON jsonb
// (no PostGIS), so point-in-polygon tests and centroids are computed in JS.

/** Ray-casting point-in-ring test. Ring is [[lng,lat], ...]. */
function pointInRing(lng, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

/** True when the point lies inside a Polygon/MultiPolygon (holes respected). */
function pointInGeometry(lng, lat, geom) {
    const polyContains = (rings) =>
        rings?.length > 0 &&
        pointInRing(lng, lat, rings[0]) &&
        !rings.slice(1).some((hole) => pointInRing(lng, lat, hole));
    if (geom?.type === 'Polygon') return polyContains(geom.coordinates);
    if (geom?.type === 'MultiPolygon') return geom.coordinates.some(polyContains);
    return false;
}

/**
 * Bounding-box center of any GeoJSON geometry, as [lat, lng] — mirrors the
 * client's L.geoJSON(feature).getBounds().getCenter() so server-side snapping
 * produces the exact coordinates a building click on the map produces.
 */
function geometryBboxCenter(geom) {
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    const walk = (c) => {
        if (!Array.isArray(c)) return;
        if (typeof c[0] === 'number') {
            if (c[0] < minLng) minLng = c[0];
            if (c[0] > maxLng) maxLng = c[0];
            if (c[1] < minLat) minLat = c[1];
            if (c[1] > maxLat) maxLat = c[1];
        } else {
            c.forEach(walk);
        }
    };
    if (geom?.coordinates) walk(geom.coordinates);
    if (!Number.isFinite(minLat)) return null;
    return [(minLat + maxLat) / 2, (minLng + maxLng) / 2];
}

/** Equirectangular distance in meters — plenty accurate at building scale. */
function metersBetween(lat1, lng1, lat2, lng2) {
    const dy = (lat2 - lat1) * 111320;
    const dx = (lng2 - lng1) * 111320 * Math.cos((lat1 * Math.PI) / 180);
    return Math.hypot(dx, dy);
}

module.exports = { pointInRing, pointInGeometry, geometryBboxCenter, metersBetween };
