export default function PageHeader({ title, subtitle, actions }) {
    return (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
            <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-semibold text-gray-800">{title}</h1>
                {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
            </div>
            {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
        </div>
    );
}
