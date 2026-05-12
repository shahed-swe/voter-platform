// 2-column grid of checkboxes — used for filters like Upazila (small set).
export default function CheckboxGroup({ label, labelBn, icon, options, value, onChange, disabled }) {
    const valueSet = new Set(value);
    const toggle = (v) => {
        const next = new Set(value);
        next.has(v) ? next.delete(v) : next.add(v);
        onChange([...next]);
    };

    return (
        <div className="bg-white border border-brand/30 rounded-lg shadow-sm p-4">
            <div className="text-sm font-bold text-brand uppercase tracking-wide flex items-center gap-2 mb-1">
                {icon && <i className={`fas ${icon}`} />}
                <span className="bn">{labelBn || label}</span>
            </div>
            <div className="border-b border-brand/40 mb-3" />

            <div className="grid grid-cols-2 gap-2 text-sm">
                {options.length === 0 ? (
                    <div className="col-span-2 text-xs text-gray-400 py-1">No options available</div>
                ) : (
                    options.map((o) => (
                        <label
                            key={o.value}
                            className={`flex items-start gap-2 cursor-pointer ${
                                disabled ? 'opacity-50 pointer-events-none' : ''
                            }`}
                        >
                            <input
                                type="checkbox"
                                className="mt-0.5 accent-brand flex-shrink-0"
                                checked={valueSet.has(o.value)}
                                onChange={() => toggle(o.value)}
                            />
                            <span className="bn truncate" title={o.label}>{o.label}</span>
                        </label>
                    ))
                )}
            </div>
        </div>
    );
}
