export default function StatCard({ label, value, icon, tone = 'brand' }) {
    const tones = {
        brand:   'bg-brand/10 text-brand',
        accent:  'bg-accent/10 text-accent',
        warning: 'bg-yellow-100 text-yellow-700',
        danger:  'bg-red-100 text-red-700',
        gray:    'bg-gray-100 text-gray-700',
    };
    return (
        <div className="card flex items-center gap-4">
            {icon && (
                <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${tones[tone] || tones.brand}`}>
                    <i className={`fas ${icon} text-xl`} />
                </div>
            )}
            <div>
                <div className="text-2xl font-semibold text-gray-800">{value ?? '—'}</div>
                <div className="text-sm text-gray-500">{label}</div>
            </div>
        </div>
    );
}
