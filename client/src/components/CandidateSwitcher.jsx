import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useCandidates } from '../hooks/queries/index.js';

/**
 * Header switcher for users with access to multiple candidates (and super_admins,
 * who can switch to any candidate). Hidden when the user has exactly one access
 * grant — they have nothing to switch between.
 */
export default function CandidateSwitcher() {
    const { user, candidate, switchCandidate } = useAuth();
    const [open, setOpen]     = useState(false);
    const [busy, setBusy]     = useState(false);
    const [pickError, setPickError] = useState(null);
    const [dropPos, setDropPos] = useState({ top: 0, right: 0 });
    const btnRef  = useRef(null);
    const menuRef = useRef(null);

    // Lazy-loaded on first open; cached, so reopening (or remounting on the next
    // route — this lives in the header) doesn't refetch.
    const candidatesQuery = useCandidates({ enabled: open });
    const opts  = candidatesQuery.data ?? null;
    const error = pickError || (candidatesQuery.error ? candidatesQuery.error.message : null);

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

    const isSuper = !!user?.is_super_admin;
    const grants = user?.candidates || [];
    // Volunteers navigate via the dedicated candidate switcher (which already
    // conveys the constituency per candidate). Showing a constituency switcher
    // for them would list the same constituency once per candidate grant —
    // duplicate + ambiguous. So hide it for volunteers.
    const isVolunteer = user?.role === 'volunteer';
    // Only show the switcher when the user has options; super_admins always do.
    const showSwitcher = !isVolunteer && (isSuper || grants.length > 1);
    if (!showSwitcher) return null;

    function toggle() {
        if (!open && btnRef.current) {
            const r = btnRef.current.getBoundingClientRect();
            setDropPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
        }
        setOpen((o) => !o);
    }

    async function pick(id) {
        if (id === candidate?.candidate_id) {
            setOpen(false);
            return;
        }
        setBusy(true);
        setPickError(null);
        try {
            await switchCandidate(id);
            window.location.assign('/dashboard');
        } catch (err) {
            setPickError(err.response?.data?.error || err.message);
            setBusy(false);
        }
    }

    const currentTitle = candidate?.title || 'No constituency';

    const menu = open ? createPortal(
        <div
            ref={menuRef}
            style={{ position: 'fixed', top: dropPos.top, right: dropPos.right, zIndex: 99999 }}
            className="w-72 bg-white rounded-md shadow-xl border border-gray-200 overflow-hidden"
        >
            <div className="px-4 py-2 text-xs uppercase tracking-wide font-semibold text-gray-500 border-b border-gray-100">
                Switch Constituency
            </div>
            {error && (
                <div className="px-4 py-2 text-xs text-red-600 bg-red-50">{error}</div>
            )}
            {opts === null ? (
                <div className="px-4 py-3 text-sm text-gray-500">
                    <i className="fas fa-spinner fa-spin mr-2" /> Loading...
                </div>
            ) : opts.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-500">No constituencies available.</div>
            ) : (
                <ul className="max-h-80 overflow-y-auto">
                    {opts.map((c) => {
                        const active = c.candidate_id === candidate?.candidate_id;
                        return (
                            <li
                                key={c.candidate_id}
                                onClick={() => !busy && pick(c.candidate_id)}
                                className={`px-4 py-2 cursor-pointer flex items-start justify-between gap-2 ${
                                    active ? 'bg-brand/10' : 'hover:bg-gray-50'
                                }`}
                            >
                                <div className="min-w-0">
                                    <div className="text-sm font-medium text-gray-800 truncate">{c.title}</div>
                                    <div className="text-xs text-gray-500 truncate">{c.name}</div>
                                </div>
                                {active && <i className="fas fa-check text-brand text-sm mt-1" />}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>,
        document.body
    ) : null;

    return (
        <div ref={btnRef}>
            <button
                type="button"
                onClick={toggle}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-brand/30 bg-white hover:bg-brand/5 text-sm font-medium text-gray-700"
                disabled={busy}
            >
                <i className="fas fa-user-tie text-brand" />
                <span className="max-w-[160px] truncate">{currentTitle}</span>
                <i className={`fas fa-chevron-${open ? 'up' : 'down'} text-xs text-gray-400`} />
            </button>
            {menu}
        </div>
    );
}
