// Single-select dropdown — used for filters like Union, Mauza, Village.
export default function SingleSelect({ label, labelBn, icon, options, value, onChange, disabled, placeholder }) {
    return (
        <div className="bg-white border border-brand/30 rounded-lg shadow-sm p-4">
            <div className="text-sm font-bold text-brand uppercase tracking-wide flex items-center gap-2 mb-1">
                {icon && <i className={`fas ${icon}`} />}
                <span className="bn">{labelBn || label}</span>
            </div>
            <div className="border-b border-brand/40 mb-3" />

            <select
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bn shadow-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                value={value || ''}
                onChange={(e) => onChange(e.target.value || null)}
                disabled={disabled}
            >
                <option value="">{placeholder || `Select ${label}...`}</option>
                {options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </select>
        </div>
    );
}
