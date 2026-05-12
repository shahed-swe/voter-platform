import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

const ITEMS = [
    { to: '/dashboard',        label: 'Dashboard'        },
    { to: '/canvassing',       label: 'Canvassing'       },
    { to: '/analytics',        label: 'Analytics'        },
    { to: '/election-results', label: 'Election Results' },
    { to: '/admin',            label: 'Admin', roles: ['admin', 'sub_admin'] },
];

export default function Navbar() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    return (
        <header className="navbar-brand">
            <div className="flex items-center gap-3">
                <img src="/assets/images/BSARL.png" alt="BSAR" className="h-9 w-9 object-contain" />
                <img src="/assets/images/centristnation.png" alt="Centristnation" className="h-9 w-9 object-contain" />
                <span className="ml-2 font-semibold text-gray-800 hidden sm:inline">
                    Voter Survey Platform
                </span>
            </div>

            <nav className="ml-6 flex items-center gap-1 flex-1 overflow-x-auto">
                {ITEMS.filter((i) => !i.roles || i.roles.includes(user?.role)).map((i) => (
                    <NavLink
                        key={i.to}
                        to={i.to}
                        className={({ isActive }) =>
                            isActive ? 'navbar-link navbar-link-active' : 'navbar-link'
                        }
                    >
                        {i.label}
                    </NavLink>
                ))}
            </nav>

            <div className="flex items-center gap-3 text-sm">
                {user && (
                    <span className="text-gray-600">
                        {user.name} <span className="text-gray-400">({user.role})</span>
                    </span>
                )}
                <button
                    className="btn-secondary"
                    onClick={() => {
                        logout();
                        navigate('/login', { replace: true });
                    }}
                >
                    <i className="fas fa-sign-out-alt" /> Logout
                </button>
            </div>
        </header>
    );
}
