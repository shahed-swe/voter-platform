import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

// Order matches the legacy app
const NAV = [
    { to: '/dashboard',  label: 'Dashboard',  icon: 'fa-map' },
    { to: '/admin',      label: 'Management', icon: 'fa-clipboard-list', roles: ['admin', 'sub_admin'] },
    { to: '/canvassing', label: 'Canvassing', icon: 'fa-clipboard-check' },
    { to: '/analytics',  label: 'Analytics',  icon: 'fa-chart-line' },
];

export default function AppHeader({ tenantName = 'Dhaka-13', preparedFor = 'Bobby Hajjaj' }) {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const initials = (user?.name || 'A')
        .split(/\s+/)
        .map((s) => s[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase();

    return (
        <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex items-center gap-4 shadow-sm">
            {/* Left: brand block */}
            <div className="flex items-center gap-3 flex-shrink-0">
                <div className="border border-gray-300 rounded px-2 py-1 text-xs font-bold tracking-wider bg-white text-gray-800">
                    BSAR
                </div>
                <span className="text-sm text-gray-500 italic hidden md:inline">an initiative of</span>
                <img
                    src="/assets/images/centristnation.png"
                    alt="Centrist Nation"
                    className="h-9 w-9 object-contain"
                />

                <div className="ml-2 leading-tight">
                    <h1 className="text-xl font-bold text-gray-800">{tenantName}</h1>
                    {preparedFor && (
                        <p className="text-xs text-gray-500">Prepared for {preparedFor}</p>
                    )}
                </div>
            </div>

            {/* Center: nav buttons */}
            <nav className="flex-1 flex items-center justify-center gap-2 overflow-x-auto">
                {NAV.filter((i) => !i.roles || i.roles.includes(user?.role)).map((i) => (
                    <NavLink
                        key={i.to}
                        to={i.to}
                        className={({ isActive }) =>
                            [
                                'inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border transition-colors whitespace-nowrap',
                                isActive
                                    ? 'bg-brand text-white border-brand'
                                    : 'bg-white text-brand border-brand hover:bg-brand/5',
                            ].join(' ')
                        }
                    >
                        <i className={`fas ${i.icon}`} />
                        {i.label}
                    </NavLink>
                ))}
            </nav>

            {/* Right: user + logout */}
            <div className="flex items-center gap-3 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-full bg-brand text-white flex items-center justify-center font-semibold text-sm">
                        {initials}
                    </div>
                    <div className="leading-tight hidden sm:block">
                        <div className="text-sm font-medium text-gray-800">{user?.name || 'User'}</div>
                        <div className="text-xs text-gray-500 capitalize">
                            {(user?.role || '').replace('_', ' ')}
                        </div>
                    </div>
                </div>
                <button
                    onClick={() => {
                        logout();
                        navigate('/login', { replace: true });
                    }}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-red-500 text-white hover:bg-red-600"
                >
                    <i className="fas fa-arrow-right-from-bracket" />
                    Logout
                </button>
            </div>
        </header>
    );
}
