import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../auth/AuthContext.jsx';

/**
 * Header switcher for VOLUNTEERS who are assigned to more than one political
 * candidate (possibly within the same constituency). Picking a candidate scopes
 * the map to that grant's wards and tags new canvassing with that candidate.
 *
 * Hidden when the volunteer has a single grant — nothing to switch between.
 */
export default function VolunteerCandidateSwitcher() {
    const { user, candidate, switchCandidate } = useAuth();
    const [open, setOpen]   = useState(false);
    const [busy, setBusy]   = useState(false);
    const [error, setError] = useState(null);
    const [dropPos, setDropPos] = useState({ top: 0, right: 0 });
    const btnRef  = useRef(null);
    const menuRef = useRef(null);

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

    if (user?.role !== 'volunteer') return null;
    const grants = user?.candidates || [];
    if (grants.length <= 1) return null;

    const activeCandidateId = candidate?.candidate_id ?? user?.active_candidate;
    const activePcId = user?.political_candidate_id;
    const active = grants.find(
        (g) => String(g.id) === String(activeCandidateId)
            && String(g.political_candidate_id) === String(activePcId)
    ) || grants.find((g) => String(g.political_candidate_id) === String(activePcId));

    function toggle() {
        if (!open && btnRef.current) {
            const r = btnRef.current.getBoundingClientRect();
            setDropPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
        }
        setOpen((o) => !o);
    }

    async function pick(g) {
        if (String(g.political_candidate_id) === String(activePcId)
            && String(g.id) === String(activeCandidateId)) {
            setOpen(false);
            return;
        }
        setBusy(true); setError(null);
        try {
            await switchCandidate(g.id, g.political_candidate_id);
            window.location.assign('/dashboard');
        } catch (err) {
            setError(err.response?.data?.error || err.message);
            setBusy(false);
        }
    }

    const currentLabel = active?.political_candidate_name || 'Candidate নির্বাচন করুন';

    const menu = open ? createPortal(
        <div
            ref={menuRef}
            style={{ position: 'fixed', top: dropPos.top, right: dropPos.right, zIndex: 99999 }}
            className="w-72 bg-white rounded-md shadow-xl border border-gray-200 overflow-hidden"
        >
            <div className="px-4 py-2 text-xs uppercase tracking-wide font-semibold text-gray-500 border-b border-gray-100">
                Candidate নির্বাচন
            </div>
            {error && <div className="px-4 py-2 text-xs text-red-600 bg-red-50">{error}</div>}
            <ul className="max-h-80 overflow-y-auto">
                {grants.map((g) => {
                    const isActive = String(g.political_candidate_id) === String(activePcId)
                        && String(g.id) === String(activeCandidateId);
                    return (
                        <li
                            key={g.grant_id ?? `${g.id}-${g.political_candidate_id}`}
                            onClick={() => !busy && pick(g)}
                            className={`px-4 py-2 cursor-pointer flex items-start justify-between gap-2 ${
                                isActive ? 'bg-brand/10' : 'hover:bg-gray-50'
                            }`}
                        >
                            <div className="min-w-0">
                                <div className="text-sm font-medium text-gray-800 truncate">
                                    {g.political_candidate_name || 'Candidate'}
                                </div>
                                <div className="text-xs text-gray-500 truncate">
                                    {g.constituency_name || g.id}
                                    {g.allowed_wards?.length ? (
                                        <span className="bn"> · ওয়ার্ড {g.allowed_wards.join(', ')}</span>
                                    ) : null}
                                </div>
                            </div>
                            {isActive && <i className="fas fa-check text-brand text-sm mt-1" />}
                        </li>
                    );
                })}
            </ul>
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
                <span className="max-w-[160px] truncate">{currentLabel}</span>
                <i className={`fas fa-chevron-${open ? 'up' : 'down'} text-xs text-gray-400`} />
            </button>
            {menu}
        </div>
    );
}
