export function Spinner({ size = 'md' }) {
    const dims = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-10 w-10' };
    return (
        <div
            className={`${dims[size] || dims.md} animate-spin rounded-full border-2 border-brand border-t-transparent`}
        />
    );
}

export function LoadingState({ label = 'Loading...' }) {
    return (
        <div className="flex items-center justify-center gap-3 p-8 text-gray-500">
            <Spinner /> <span>{label}</span>
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
