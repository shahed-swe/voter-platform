function StatBox({ label, value, tone }) {
    return (
        <div className="bg-white border border-brand/30 rounded-lg px-4 py-2.5 shadow-sm min-w-[160px]">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</div>
            <div className={`text-2xl font-bold ${tone || 'text-brand'}`}>
                {Number(value || 0).toLocaleString()}
            </div>
        </div>
    );
}

/**
 * Right-side stat panel. Shows scope label + totals.
 * Adapts to the current selection (constituency / ward / voter areas).
 */
export default function PopulationStats({ stats, scopeLabel, scopeSubLabel }) {
    return (
        <div className="space-y-3">
            {scopeLabel && (
                <div className="bg-white border border-brand/30 rounded-lg px-4 py-2 shadow-sm">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                        {scopeSubLabel || 'Scope'}
                    </div>
                    <div className="text-sm font-medium text-gray-800 truncate">{scopeLabel}</div>
                </div>
            )}
            <StatBox label="Total Population" value={stats.total_population} />
            <StatBox label="Male"             value={stats.male_count} />
            <StatBox label="Female"           value={stats.female_count} />
        </div>
    );
}
