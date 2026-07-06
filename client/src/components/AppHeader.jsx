import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import CandidateSwitcher from './CandidateSwitcher.jsx';
import VolunteerCandidateSwitcher from './VolunteerCandidateSwitcher.jsx';

const LINK_BASE = 'inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border transition-colors whitespace-nowrap';
const LINK_ACTIVE = 'bg-brand text-white border-brand';
const LINK_IDLE   = 'bg-white text-brand border-brand hover:bg-brand/5';

const MAIN_NAV = [
    { to: '/dashboard',        label: 'Dashboard',   icon: 'fa-map' },
    { to: '/canvassing',       label: 'Canvassing',  icon: 'fa-clipboard-check' },
    { to: '/survey-data',      label: 'Survey Data', icon: 'fa-clipboard-list' },
    { to: '/analytics',        label: 'Analytics',   icon: 'fa-chart-line' },
    { to: '/election-results', label: 'Elections',   icon: 'fa-poll' },
];

const ADMIN_DROPDOWN = [
    { to: '/admin',                      label: 'User Management', icon: 'fa-users-cog' },
    { to: '/admin/candidates',           label: 'Constituencies',  icon: 'fa-map-location-dot' },
    { to: '/admin/political-candidates', label: 'Candidates',      icon: 'fa-user-tie' },
    { to: '/volunteers',                 label: 'Volunteers',      icon: 'fa-users' },
    { to: '/admin/import',               label: 'Import Data',     icon: 'fa-database' },
];

const CANDIDATE_NAV = [
    { to: '/volunteers', label: 'Volunteers', icon: 'fa-users' },
];

function AdminDropdown() {
    const [open, setOpen]       = useState(false);
    const [dropPos, setDropPos] = useState({ top: 0, left: 0 });
    const btnRef  = useRef(null);
    const menuRef = useRef(null);
    const { pathname } = useLocation();
    const isAdminActive = ADMIN_DROPDOWN.some((i) => pathname.startsWith(i.to));

    // Close on outside click
    useEffect(() => {
        function onDoc(e) {
            if (
                btnRef.current && btnRef.current.contains(e.target) ||
                menuRef.current && menuRef.current.contains(e.target)
            ) return;
            setOpen(false);
        }
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, []);

    // Close on navigation
    useEffect(() => { setOpen(false); }, [pathname]);

    function toggle() {
        if (!open && btnRef.current) {
            const r = btnRef.current.getBoundingClientRect();
            setDropPos({ top: r.bottom + 6, left: r.left });
        }
        setOpen((o) => !o);
    }

    const menu = open
        ? createPortal(
            <div
                ref={menuRef}
                style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, zIndex: 99999 }}
                className="w-52 bg-white rounded-lg border border-gray-200 shadow-xl overflow-hidden"
            >
                {ADMIN_DROPDOWN.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === '/admin'}
                        className={({ isActive }) =>
                            [
                                'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                                isActive
                                    ? 'bg-brand/10 text-brand font-medium'
                                    : 'text-gray-700 hover:bg-gray-50',
                            ].join(' ')
                        }
                    >
                        <i className={`fas ${item.icon} w-4 text-center`} />
                        {item.label}
                    </NavLink>
                ))}
            </div>,
            document.body
        )
        : null;

    return (
        <>
            <button
                ref={btnRef}
                onClick={toggle}
                className={[LINK_BASE, isAdminActive ? LINK_ACTIVE : LINK_IDLE].join(' ')}
            >
                <i className="fas fa-shield-halved" />
                Admin
                <i className={`fas fa-chevron-${open ? 'up' : 'down'} text-[10px] ml-0.5`} />
            </button>
            {menu}
        </>
    );
}

export default function AppHeader() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const initials = (user?.name || 'A')
        .split(/\s+/)
        .map((s) => s[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase();

    const showAdmin      = !!user?.is_super_admin;
    const showVolunteers = user?.role === 'candidate';

    return (
        <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex items-center gap-4 shadow-sm">
            {/* Brand — clicking the logos returns to the dashboard (#7) */}
            <NavLink to="/dashboard" className="flex items-center gap-3 flex-shrink-0" title="Dashboard">
                <img src="/assets/images/BSARL.png" alt="BSAR" className="h-9 w-9 object-contain" />
                <span className="text-sm text-gray-500 italic hidden md:inline">an initiative of</span>
                <img src="/assets/images/centristnation.png" alt="Centrist Nation" className="h-9 w-9 object-contain" />
            </NavLink>

            {/* Nav */}
            <nav className="flex-1 flex items-center justify-center gap-2">
                {MAIN_NAV.map((i) => (
                    <NavLink
                        key={i.to}
                        to={i.to}
                        className={({ isActive }) => [LINK_BASE, isActive ? LINK_ACTIVE : LINK_IDLE].join(' ')}
                    >
                        <i className={`fas ${i.icon}`} />
                        {i.label}
                    </NavLink>
                ))}

                {showAdmin && <AdminDropdown />}

                {showVolunteers && CANDIDATE_NAV.map((i) => (
                    <NavLink
                        key={i.to}
                        to={i.to}
                        className={({ isActive }) => [LINK_BASE, isActive ? LINK_ACTIVE : LINK_IDLE].join(' ')}
                    >
                        <i className={`fas ${i.icon}`} />
                        {i.label}
                    </NavLink>
                ))}
            </nav>

            {/* Right */}
            <div className="flex items-center gap-3 flex-shrink-0">
                <VolunteerCandidateSwitcher />
                <CandidateSwitcher />
                <div className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-full bg-brand text-white flex items-center justify-center font-semibold text-sm">
                        {initials}
                    </div>
                    <div className="leading-tight hidden sm:block">
                        <div className="text-sm font-medium text-gray-800">{user?.name || 'User'}</div>
                        <div className="text-xs text-gray-500 capitalize">
                            {user?.is_super_admin ? 'Super Admin' : (user?.role || '').replace('_', ' ')}
                        </div>
                    </div>
                </div>
                <button
                    onClick={() => { logout(); navigate('/login', { replace: true }); }}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-red-500 text-white hover:bg-red-600"
                >
                    <i className="fas fa-arrow-right-from-bracket" />
                    Logout
                </button>
            </div>
        </header>
    );
}
