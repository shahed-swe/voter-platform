export function Spinner({ size = 'md' }) {
    const dims = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-10 w-10' };
    return (
        <div
            className={`${dims[size] || dims.md} animate-spin rounded-full border-2 border-brand border-t-transparent`}
        />
    );
}

/**
 * Centered spinner.
 *  - default: centers within its parent (fills the parent's height when it has
 *    one, e.g. panels/modals; otherwise reserves a modest block)
 *  - full:    page-level variant — centers in the viewport area below the header
 */
export function LoadingState({ label = 'Loading...', full = false }) {
    return (
        <div
            className={`flex flex-col items-center justify-center gap-3 text-gray-500 ${
                full ? 'min-h-[60vh]' : 'h-full min-h-[140px] p-8'
            }`}
        >
            <Spinner size={full ? 'lg' : 'md'} />
            <span className="text-sm">{label}</span>
        </div>
    );
}

/* ── Skeletons ─────────────────────────────────────────────────────────────
   Layout-shaped placeholders for content-heavy areas (lists, tables, stats,
   chart cards). Match the card design system: white cards, gray-200/100 bars. */

/** Generic pulse block — compose ad-hoc shapes with utility classes. */
export function Skeleton({ className = '' }) {
    return <div className={`animate-pulse rounded bg-gray-200 ${className}`} />;
}

/** Card-row list placeholder (voter cards, user rows, record rows). */
export function SkeletonList({ rows = 5, lines = 2 }) {
    return (
        <div className="space-y-2 animate-pulse" aria-hidden="true">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-1/2" />
                    {Array.from({ length: lines }).map((_, j) => (
                        <div key={j} className="h-3 bg-gray-100 rounded" style={{ width: `${72 - j * 14}%` }} />
                    ))}
                </div>
            ))}
        </div>
    );
}

/** Table placeholder — header row + data rows. */
export function SkeletonTable({ rows = 6, cols = 4 }) {
    const grid = { display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '1rem' };
    return (
        <div className="animate-pulse p-4 space-y-3" aria-hidden="true">
            <div style={grid}>
                {Array.from({ length: cols }).map((_, i) => (
                    <div key={i} className="h-4 bg-gray-200 rounded w-3/4" />
                ))}
            </div>
            {Array.from({ length: rows }).map((_, r) => (
                <div key={r} style={grid}>
                    {Array.from({ length: cols }).map((_, c) => (
                        <div key={c} className="h-3 bg-gray-100 rounded" />
                    ))}
                </div>
            ))}
        </div>
    );
}

/** Stat-box grid placeholder. Pass the same grid classes the real stats use. */
export function SkeletonStats({ count = 4, className = 'grid grid-cols-2 lg:grid-cols-4 gap-3' }) {
    return (
        <div className={`${className} animate-pulse`} aria-hidden="true">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="bg-white border border-gray-200 rounded-lg px-4 py-3 space-y-2">
                    <div className="h-3 bg-gray-200 rounded w-2/3" />
                    <div className="h-7 bg-gray-100 rounded w-1/2" />
                </div>
            ))}
        </div>
    );
}

/** Chart/content card placeholder — title bar + body block of fixed height. */
export function SkeletonCard({ bodyClass = 'h-64' }) {
    return (
        <div className="bg-white border border-gray-200 rounded-lg p-5 animate-pulse" aria-hidden="true">
            <div className="h-5 bg-gray-200 rounded w-1/3 mb-4" />
            <div className={`bg-gray-100 rounded ${bodyClass}`} />
        </div>
    );
}

export function EmptyState({ icon = 'fa-inbox', label = 'No data yet' }) {
    return (
        <div className="text-center p-8 text-gray-400">
            <i className={`fas ${icon} text-4xl mb-2`} />
            <div>{label}</div>
        </div>
    );
}

export function ErrorState({ error, onRetry }) {
    return (
        <div className="card border-red-200 bg-red-50">
            <div className="text-red-700 font-medium">
                <i className="fas fa-exclamation-triangle mr-2" />
                {String(error?.message || error || 'Something went wrong')}
            </div>
            {onRetry && (
                <button className="btn-secondary mt-3" onClick={onRetry}>
                    Retry
                </button>
            )}
        </div>
    );
}
