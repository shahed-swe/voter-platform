const BN = '০১২৩৪৫৬৭৮৯';

/** Convert ASCII digit string to Bengali digits */
function toBn(s) {
    return String(s).replace(/[0-9]/g, (d) => BN[+d]);
}

/**
 * Extract ward number from a geo_layers ward label like "Ward No. 52 (88)"
 * and return it in Bengali digits to match voters.ward column.
 * Returns null if no number can be extracted.
 */
export function wardLabelToScope(wardLabel) {
    if (!wardLabel) return null;
    const m = wardLabel.match(/Ward No\.\s*(\d+)/i);
    if (!m) return null;
    return { ward: toBn(m[1]) };   // e.g. { ward: '৫২' }
}

/**
 * Derive a voter scope object from geoNavStack (the GeoNavigator drill state).
 * Returns the narrowest scope available:
 *   - village selected (depth 2): fall back to ward
 *   - ward selected (depth 1): use ward number
 *   - constituency only (depth 0): no scope
 *
 * The village → voter_area_name mapping can't be done reliably (English vs Bengali
 * naming mismatch between geo_layers and voters CSV), so we always fall back to ward.
 */
export function geoStackToScope(geoNavStack) {
    const wardEntry = geoNavStack[1]; // index 0 = constituency (auto-selected, hidden)
    if (!wardEntry) return {};
    return wardLabelToScope(wardEntry.label) || {};
}
