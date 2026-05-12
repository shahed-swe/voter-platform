/**
 * Active-filter chip strip — rendered in the top bar of the canvassing page.
 * `filters` is an array of { label, onClear }.
 */
export default function ActiveFilterChips({ filters }) {
    if (!filters?.length) return null;
    return (
        <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-600">Active Filters:</span>
            {filters.map((f) => (
                <span
                    key={f.key || f.label}
                    className="inline-flex items-center gap-1.5 bg-brand/10 text-brand text-sm font-medium px-2.5 py-1 rounded-full border border-brand/30"
                >
                    <span className="bn truncate max-w-[200px]" title={f.label}>{f.label}</span>
                    <button
                        type="button"
                        onClick={f.onClear}
                        className="text-brand/70 hover:text-brand"
                        aria-label="Clear"
                    >
                        <i className="fas fa-times text-xs" />
                    </button>
                </span>
            ))}
        </div>
    );
}
