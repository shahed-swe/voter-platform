/**
 * Single-select dropdown for ward. The collapsible card matches the legacy
 * left-panel design (label above, dropdown below).
 */
export default function WardSelect({ wards, value, onChange }) {
    return (
        <div className="bg-white border border-brand/30 rounded-lg shadow-sm p-4">
            <div className="text-sm font-bold text-brand uppercase tracking-wide flex items-center gap-2 mb-1">
                <i className="fas fa-map" /> Ward
            </div>
            <div className="border-b border-brand/40 mb-3" />

            <select
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none"
                value={value || ''}
                onChange={(e) => onChange(e.target.value || null)}
            >
                <option value="">Select Ward...</option>
                {wards.map((w) => (
                    <option key={w.ward_id} value={w.ward_id}>
                        {w.ward_number}
                    </option>
                ))}
            </select>
        </div>
    );
}
