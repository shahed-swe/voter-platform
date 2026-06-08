/**
 * Maps a parsed file's source columns to geo_layers target fields.
 * `columns` = string[] from the upload preview.
 * `sample`  = array of example rows (objects) for the preview table.
 * `value`   = { targetField: sourceColumn }  (controlled)
 *
 * Unmapped source columns are kept in `props` automatically by the backend,
 * so the operator only has to map the handful of meaningful targets.
 */

const TARGETS = [
    { key: 'feature_id',        label: 'Feature ID',        hint: 'unique id within this layer (auto-numbered if blank)' },
    { key: 'name',              label: 'Name / label',      hint: 'shown on the map tooltip' },
    { key: 'code',              label: 'Code',              hint: 'optional external code' },
    { key: 'parent_feature_id', label: 'Parent link',       hint: "value matching the parent layer's Feature ID" },
    { key: 'total_population',  label: 'Total population',  hint: 'enables population shading' },
    { key: 'male_count',       label: 'Male count',        hint: '' },
    { key: 'female_count',     label: 'Female count',      hint: '' },
    { key: 'latitude',          label: 'Latitude',          hint: 'point layers only' },
    { key: 'longitude',         label: 'Longitude',         hint: 'point layers only' },
];

export default function ColumnMapper({ columns, sample, value, onChange, hasGeometry }) {
    const mapping = value || {};
    const set = (target, col) => onChange({ ...mapping, [target]: col || undefined });

    // columns already consumed by a mapping → shown as "→ props" otherwise
    const used = new Set(Object.values(mapping).filter(Boolean));

    return (
        <div className="space-y-4">
            <div>
                <h4 className="font-semibold text-gray-800 mb-2">Map columns</h4>
                <p className="text-xs text-gray-500 mb-3">
                    Match your file's columns to the fields below. Anything you don't map is
                    still kept (searchable in properties).
                    {hasGeometry
                        ? ' Geometry is read automatically from the file.'
                        : ' This file has no geometry — set Latitude/Longitude for a point layer.'}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {TARGETS.map((t) => (
                        <label key={t.key} className="flex items-center gap-2 text-sm">
                            <span className="w-32 flex-shrink-0 text-gray-700">{t.label}</span>
                            <select
                                className="input-field flex-1"
                                value={mapping[t.key] || ''}
                                onChange={(e) => set(t.key, e.target.value)}
                            >
                                <option value="">—</option>
                                {columns.map((c) => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </label>
                    ))}
                </div>
            </div>

            {/* Preview table */}
            {sample?.length > 0 && (
                <div>
                    <h4 className="font-semibold text-gray-800 mb-2">Preview (first {sample.length} rows)</h4>
                    <div className="overflow-x-auto border border-gray-200 rounded-md">
                        <table className="data-table text-xs">
                            <thead>
                                <tr>
                                    {columns.map((c) => (
                                        <th key={c} className={used.has(c) ? 'text-brand' : ''}>
                                            {c}{used.has(c) && ' ✓'}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {sample.map((row, i) => (
                                    <tr key={i}>
                                        {columns.map((c) => (
                                            <td key={c} className="bn whitespace-nowrap max-w-[180px] truncate" title={String(row[c] ?? '')}>
                                                {String(row[c] ?? '')}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
