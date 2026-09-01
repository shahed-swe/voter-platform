import { useEffect, useState } from 'react';
import * as canvassingApi from '../../api/canvassing.js';
import { Spinner, ErrorState } from '../LoadingState.jsx';

const SUPPORT_TONE = {
    supporter: 'bg-green-100 text-green-700',
    undecided: 'bg-amber-100 text-amber-700',
    opposed:   'bg-red-100 text-red-600',
};
const DOT_TONE = {
    supporter: 'bg-green-500',
    undecided: 'bg-amber-400',
    opposed:   'bg-red-500',
};

/**
 * §10 — the voter's full visit timeline, oldest → newest, so the Political
 * Admin can SEE the answer change between visits. Opens over the survey /
 * persuadable tables. Main Admin gets the cross-party variant (rows carry
 * party_name).
 */
export default function VoterHistoryDrawer({ voterId, voterName, onClose }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setData(null);
        canvassingApi.voterHistory(voterId)
            .then((r) => { if (!cancelled) setData(r); })
            .catch((e) => { if (!cancelled) setError(e); });
        return () => { cancelled = true; };
    }, [voterId]);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const visits = data?.visits || [];
    const first = visits[0];
    const last = visits[visits.length - 1];
    const changed = visits.length > 1
        && (first?.support_level !== last?.support_level || first?.support_rating !== last?.support_rating);

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <aside className="relative bg-white w-full max-w-md h-full shadow-2xl flex flex-col">
                <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate">
                            <i className="fas fa-clock-rotate-left text-brand mr-2" />
                            {first?.voter_name || voterName || 'ভোটার'}
                        </h3>
                        <div className="text-xs text-gray-500 mt-0.5">
                            {first?.sos_vid}
                            {first?.ward ? <span className="bn"> · ওয়ার্ড {first.ward}</span> : null}
                            {first?.voter_area_name ? ` · ${first.voter_area_name}` : null}
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-0.5" title="বন্ধ করুন">
                        <i className="fas fa-times" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                    {error ? (
                        <ErrorState error={error} />
                    ) : data === null ? (
                        <div className="flex justify-center py-10"><Spinner /></div>
                    ) : visits.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-10">এই ভোটারের কোনো ভিজিট রেকর্ড নেই।</p>
                    ) : (
                        <>
                            {/* The verdict §10 cares about: did the answer move? */}
                            {visits.length > 1 && (
                                <div className={`text-sm rounded-md px-3 py-2 mb-5 border ${
                                    changed
                                        ? 'bg-purple-50 border-purple-200 text-purple-800'
                                        : 'bg-gray-50 border-gray-200 text-gray-600'
                                }`}>
                                    {changed
                                        ? <><i className="fas fa-arrows-turn-to-dots mr-1.5" /><span className="bn">{visits.length}টি ভিজিটে উত্তর বদলেছে — persuadable ভোটার</span></>
                                        : <><i className="fas fa-anchor mr-1.5" /><span className="bn">{visits.length}টি ভিজিটে উত্তর অপরিবর্তিত</span></>}
                                </div>
                            )}

                            <ol className="relative border-l-2 border-gray-100 ml-2 space-y-5">
                                {visits.map((v) => (
                                    <li key={v.canvass_id} className="ml-4">
                                        <span className={`absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full ring-4 ring-white ${DOT_TONE[v.support_level] || 'bg-gray-300'}`} />
                                        <div className="text-xs text-gray-400">
                                            {v.canvass_date ? new Date(v.canvass_date).toLocaleDateString('bn-BD', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap mt-1">
                                            {v.support_level ? (
                                                <span className={`text-[11px] px-2 py-0.5 rounded-full ${SUPPORT_TONE[v.support_level] || 'bg-gray-100 text-gray-600'}`}>
                                                    {v.support_level}
                                                </span>
                                            ) : <span className="text-xs text-gray-300">—</span>}
                                            {v.support_rating ? (
                                                <span className="text-amber-500 text-xs" title={`${v.support_rating}/5`}>{'★'.repeat(v.support_rating)}</span>
                                            ) : null}
                                            {v.follow_up_needed && (
                                                <span className="text-[11px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">follow-up</span>
                                            )}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1">
                                            {v.party_name && <span className="font-medium text-gray-600">{v.party_name} · </span>}
                                            {v.candidate_name
                                                ? <span><i className="fas fa-user-tie text-purple-400 mr-1" />{v.candidate_name}-এর ক্যাম্পেইন</span>
                                                : 'ক্যাম্পেইন ছাড়া'}
                                            {' · '}{v.canvasser_name}
                                        </div>
                                        {v.issues_concerns && (
                                            <p className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded px-2 py-1.5 mt-1.5">
                                                “{v.issues_concerns}”
                                            </p>
                                        )}
                                    </li>
                                ))}
                            </ol>
                        </>
                    )}
                </div>
            </aside>
        </div>
    );
}
