import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import * as candidatesApi from '../api/candidates.js';

/**
 * Header switcher for users with access to multiple candidates (and super_admins,
 * who can switch to any candidate). Hidden when the user has exactly one access
 * grant — they have nothing to switch between.
 */
export default function CandidateSwitcher() {
    const { user, candidate, switchCandidate } = useAuth();
    const [open, setOpen]     = useState(false);
    const [opts, setOpts]     = useState(null);
    const [busy, setBusy]     = useState(false);
    const [error, setError]   = useState(null);
    const ref = useRef(null);

    useEffect(() => {
        function onDoc(e) {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        }
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, []);

    // Lazy-load the candidate list the first time the user opens the switcher.
    useEffect(() => {
        if (!open || opts !== null) return;
        candidatesApi
            .list()
            .then((cs) => setOpts(cs))
            .catch((err) => setError(err.message));
    }, [open, opts]);

    const isSuper = !!user?.is_super_admin;
    const grants = user?.candidates || [];
    // Only show the switcher when the user has options; super_admins always do.
    const showSwitcher = isSuper || grants.length > 1;
    if (!showSwitcher) return null;

    async function pick(id) {
        if (id === candidate?.candidate_id) {
            setOpen(false);
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await switchCandidate(id);
            // Force a fresh navigation (NOT reload()) so the browser fetches
            // index.html fresh from vite and gets current chunk URLs. reload()
            // can revive cached HTML pointing at stale chunk hashes after a
            // vite cache rebuild, leading to "useState is null" errors.
            window.location.assign('/dashboard');
        } catch (err) {
            setError(err.response?.data?.error || err.message);
            setBusy(false);
        }
    }

    const currentTitle = candidate?.title || 'No candidate';

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-brand/30 bg-white hover:bg-brand/5 text-sm font-medium text-gray-700"
                disabled={busy}
            >
                <i className="fas fa-user-tie text-brand" />
                <span className="max-w-[160px] truncate">{currentTitle}</span>
                <i className={`fas fa-chevron-${open ? 'up' : 'down'} text-xs text-gray-400`} />
            </button>

            {open && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-md shadow-xl border border-gray-200 z-[1500] overflow-hidden">
                    <div className="px-4 py-2 text-xs uppercase tracking-wide font-semibold text-gray-500 border-b border-gray-100">
                        Switch candidate
                    </div>
                    {error && (
                        <div className="px-4 py-2 text-xs text-red-600 bg-red-50">{error}</div>
                    )}
                    {opts === null ? (
                        <div className="px-4 py-3 text-sm text-gray-500">
                            <i className="fas fa-spinner fa-spin mr-2" /> Loading...
                        </div>
                    ) : opts.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-gray-500">No candidates available.</div>
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
                </div>
            )}
        </div>
    );
}
