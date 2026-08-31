import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { isPartyAdmin, isDonor, roleHome } from '../auth/roleHome.js';
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
    { to: '/management',                 label: 'Team Management', icon: 'fa-sitemap' },
    { to: '/admin/candidates',           label: 'Constituencies',  icon: 'fa-map-location-dot' },
    { to: '/admin/political-candidates', label: 'Candidates',      icon: 'fa-user-tie' },
    { to: '/admin/import',               label: 'Import Data',     icon: 'fa-database' },
];

// Team management for the mid-hierarchy manager roles (candidate → admin → sub_admin).
const MANAGER_NAV = [
    { to: '/management', label: 'Team', icon: 'fa-sitemap' },
];

// Party-level roles hold no constituency grant — the constituency pages would
// only 403 at them, so they get a minimal nav until their full views land.
const PARTY_ADMIN_NAV = [
    { to: '/party',         label: 'Party',   icon: 'fa-flag' },
    { to: '/party/surveys', label: 'Surveys', icon: 'fa-clipboard-list' },
    { to: '/management',    label: 'Team',    icon: 'fa-sitemap' },
];
const DONOR_NAV = [
    { to: '/donor', label: 'My Profile', icon: 'fa-hand-holding-heart' },
];
// Volunteers only canvass — survey review/analytics belong to the levels above.
const VOLUNTEER_NAV = [
    { to: '/dashboard',  label: 'Dashboard',  icon: 'fa-map' },
    { to: '/canvassing', label: 'Canvassing', icon: 'fa-clipboard-check' },
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
    const { pathname } = useLocation();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [mobileTop, setMobileTop]   = useState(64);
    const headerRef = useRef(null);
    useEffect(() => { setMobileOpen(false); }, [pathname]);

    function toggleMobile() {
        if (!mobileOpen && headerRef.current) {
            setMobileTop(headerRef.current.getBoundingClientRect().bottom);
        }
        setMobileOpen((o) => !o);
    }

    const initials = (user?.name || 'A')
        .split(/\s+/)
        .map((s) => s[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase();

    const partyAdmin  = !user?.is_super_admin && isPartyAdmin(user);
    const donor       = !user?.is_super_admin && !partyAdmin && isDonor(user);
    const showAdmin   = !!user?.is_super_admin;
    // Candidate / campaign-admin / sub-admin get the Team management link (not super-admins,
    // who reach it via the Admin dropdown).
    const showManager = !user?.is_super_admin && ['candidate', 'admin', 'sub_admin'].includes(user?.role);

    const volunteer = !user?.is_super_admin && user?.role === 'volunteer';

    // Party-level roles see only their own pages; volunteers only the field
    // tools; everyone else the full nav.
    const mainNav = partyAdmin ? PARTY_ADMIN_NAV
        : donor ? DONOR_NAV
        : volunteer ? VOLUNTEER_NAV
        : MAIN_NAV;
    const roleLabel = user?.is_super_admin ? 'Super Admin'
        : partyAdmin ? 'Political Admin'
        : donor ? 'Donor'
        : (user?.role || '').replace('_', ' ');

    // Nav items shown in the mobile menu (main + role-specific).
    const mobileItems = [
        ...mainNav,
        ...(showAdmin ? ADMIN_DROPDOWN : []),
        ...(showManager ? MANAGER_NAV : []),
    ];

    return (
        <header ref={headerRef} className="relative bg-white border-b border-gray-200 px-3 md:px-6 py-3 flex items-center gap-3 md:gap-4 shadow-sm">
            {/* Brand — clicking the logos returns to the dashboard (#7) */}
            <NavLink to={roleHome(user)} className="flex items-center gap-2 md:gap-3 flex-shrink-0" title="Home">
                <img src="/assets/images/BSARL.png" alt="BSAR" className="h-8 w-8 md:h-9 md:w-9 object-contain" />
                <span className="text-sm text-gray-500 italic hidden lg:inline">an initiative of</span>
                <img src="/assets/images/centristnation.png" alt="Centrist Nation" className="h-8 w-8 md:h-9 md:w-9 object-contain" />
            </NavLink>

            {/* Desktop nav — hidden on small screens */}
            <nav className="hidden lg:flex flex-1 items-center justify-center gap-2">
                {mainNav.map((i) => (
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

                {showManager && MANAGER_NAV.map((i) => (
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

            {/* pushes the right cluster to the edge on mobile (where nav is hidden) */}
            <div className="flex-1 lg:hidden" />

            {/* Right */}
            <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
                <VolunteerCandidateSwitcher />
                <CandidateSwitcher />
                <div className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-full bg-brand text-white flex items-center justify-center font-semibold text-sm flex-shrink-0">
                        {initials}
                    </div>
                    <div className="leading-tight hidden sm:block">
                        <div className="text-sm font-medium text-gray-800 max-w-[120px] truncate">{user?.name || 'User'}</div>
                        <div className="text-xs text-gray-500 capitalize">{roleLabel}</div>
                    </div>
                </div>
                <button
                    onClick={() => { logout(); navigate('/login', { replace: true }); }}
                    className="inline-flex items-center gap-2 px-2.5 md:px-3 py-2 rounded-md text-sm font-medium bg-red-500 text-white hover:bg-red-600"
                    title="Logout"
                >
                    <i className="fas fa-arrow-right-from-bracket" />
                    <span className="hidden md:inline">Logout</span>
                </button>
                {/* Hamburger — mobile only */}
                <button
                    onClick={toggleMobile}
                    className="lg:hidden inline-flex items-center justify-center h-9 w-9 rounded-md border border-brand/30 text-brand"
                    aria-label="Menu"
                >
                    <i className={`fas fa-${mobileOpen ? 'xmark' : 'bars'}`} />
                </button>
            </div>

            {/* Mobile menu — portalled to <body> with fixed positioning so it sits
                above the Leaflet map's stacking context (which otherwise hides it). */}
            {mobileOpen && createPortal(
                <>
                    <div className="lg:hidden fixed inset-0 z-[9998]" onClick={() => setMobileOpen(false)} />
                    <div
                        className="lg:hidden fixed left-0 right-0 bg-white border-b border-gray-200 shadow-xl z-[9999] p-3 grid grid-cols-2 gap-2"
                        style={{ top: mobileTop }}
                    >
                        {mobileItems.map((i) => (
                            <NavLink
                                key={i.to}
                                to={i.to}
                                end={i.to === '/admin'}
                                onClick={() => setMobileOpen(false)}
                                className={({ isActive }) =>
                                    `flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium border ${
                                        isActive ? 'bg-brand text-white border-brand' : 'bg-white text-brand border-brand/40'
                                    }`
                                }
                            >
                                <i className={`fas ${i.icon} w-4 text-center`} />
                                {i.label}
                            </NavLink>
                        ))}
                    </div>
                </>,
                document.body
            )}
        </header>
    );
}
