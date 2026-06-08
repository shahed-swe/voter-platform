// Format parsers for uploaded constituency files.
// Each parser returns a normalized shape:
//   { columns: [string], rows: [{ ...cols }], geometryByRow?: (row) => GeoJSON|null }
//
// For geo formats, each row's properties become columns AND we keep the
// geometry alongside so the ingest step can store both.

const fs = require('fs');
const { parse: csvParse } = require('csv-parse/sync');

/**
 * GeoJSON FeatureCollection → rows are feature.properties, plus __geometry__.
 */
function parseGeoJSON(buf) {
    const gj = JSON.parse(buf.toString('utf8'));
    const features = gj.type === 'FeatureCollection' ? gj.features
                   : gj.type === 'Feature' ? [gj]
                   : [];
    const colSet = new Set();
    const rows = features.map((f) => {
        const props = f.properties || {};
        Object.keys(props).forEach((k) => colSet.add(k));
        return { ...props, __geometry__: f.geometry || null };
    });
    return { format: 'geojson', columns: [...colSet], rows, hasGeometry: true };
}

/**
 * CSV → rows are objects keyed by header. Quote-aware, UTF-8 (handles Bengali).
 * We DON'T type-coerce; everything is a string the mapper can interpret.
 */
function parseCSV(buf) {
    const records = csvParse(buf.toString('utf8'), {
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        trim: true,
        bom: true,
    });
    const columns = records.length ? Object.keys(records[0]) : [];
    return { format: 'csv', columns, rows: records, hasGeometry: false };
}

/**
 * Shapefile uploaded as a .zip bundle of .shp/.dbf/.prj/.shx (+ others).
 * We unzip in-memory, hand the .shp + .dbf buffers to the Node-native
 * `shapefile` reader, and iterate features. Returns the normalized shape.
 */
async function parseShapefile(buf) {
    const AdmZip = require('adm-zip');
    const shapefile = require('shapefile');

    const zip = new AdmZip(buf);
    const entries = zip.getEntries();
    const shpEntry = entries.find((e) => e.entryName.toLowerCase().endsWith('.shp'));
    const dbfEntry = entries.find((e) => e.entryName.toLowerCase().endsWith('.dbf'));
    if (!shpEntry) throw new Error('zip has no .shp file');

    const shpBuf = shpEntry.getData();
    const dbfBuf = dbfEntry ? dbfEntry.getData() : null;

    const colSet = new Set();
    const rows = [];
    const source = await shapefile.open(
        toArrayBuffer(shpBuf),
        dbfBuf ? toArrayBuffer(dbfBuf) : undefined
    );
    for (;;) {
        const result = await source.read();
        if (result.done) break;
        const f = result.value;
        const props = f.properties || {};
        Object.keys(props).forEach((k) => colSet.add(k));
        rows.push({ ...props, __geometry__: f.geometry || null });
    }
    return { format: 'shapefile', columns: [...colSet], rows, hasGeometry: true };
}

function toArrayBuffer(b) {
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

/**
 * Dispatch by filename/extension. `originalName` is the uploaded filename.
 */
async function parseFile(buf, originalName) {
    const lower = (originalName || '').toLowerCase();
    if (lower.endsWith('.geojson') || lower.endsWith('.json')) return parseGeoJSON(buf);
    if (lower.endsWith('.csv'))                                 return parseCSV(buf);
    if (lower.endsWith('.zip') || lower.endsWith('.shp'))       return parseShapefile(buf);
    // Fallback: sniff content
    const head = buf.slice(0, 200).toString('utf8').trimStart();
    if (head.startsWith('{') || head.startsWith('[')) return parseGeoJSON(buf);
    return parseCSV(buf);
}

/** Lightweight preview: parse + return columns and first `n` rows (no geometry). */
async function preview(buf, originalName, n = 5) {
    const parsed = await parseFile(buf, originalName);
    const sample = parsed.rows.slice(0, n).map((r) => {
        const { __geometry__, ...rest } = r;
        return rest;
    });
    return {
        format: parsed.format,
        hasGeometry: parsed.hasGeometry,
        columns: parsed.columns,
        sample,
        totalRows: parsed.rows.length,
    };
}

module.exports = { parseFile, preview, parseGeoJSON, parseCSV, parseShapefile };
