import { useEffect, useState } from 'react';
import * as canvassingApi from '../../api/canvassing.js';
import VoterHistoryDrawer from './VoterHistoryDrawer.jsx';
import { SkeletonTable, ErrorState, EmptyState } from '../LoadingState.jsx';

const PAGE_SIZE = 50;
const bn = (n) => Number(n || 0).toLocaleString('bn-BD');

const SUPPORT_TONE = {
    supporter: 'bg-green-100 text-green-700',
    undecided: 'bg-amber-100 text-amber-700',
    opposed:   'bg-red-100 text-red-600',
};

// The visit-to-visit answer sequence, deduplicated to the CHANGES:
// supporter → undecided → supporter reads as three chips with arrows.
function Journey({ levels }) {
    const steps = [];
    for (const l of levels || []) {
        if (steps.length === 0 || steps[steps.length - 1] !== l) steps.push(l);
    }
    return (
        <span className="inline-flex items-center gap-1 flex-wrap">
            {steps.map((s, i) => (
                <span key={i} className="inline-flex items-center gap-1">
                    {i > 0 && <i className="fas fa-arrow-right text-gray-300 text-[9px]" />}
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${SUPPORT_TONE[s] || 'bg-gray-100 text-gray-600'}`}>
                        {s || '—'}
                    </span>
                </span>
            ))}
        </span>
    );
}

/**
 * §10 — voters visited more than once whose answer CHANGED between visits.
 * These are the persuadable voters the Political Admin should study; clicking
 * one opens the full timeline.
 */
export default function PersuadableTable() {
    const [rows, setRows]   = useState(null);
    const [total, setTotal] = useState(0);
    const [page, setPage]   = useState(0);
    const [error, setError] = useState(null);
    const [history, setHistory] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setRows(null);
        canvassingApi.partyPersuadable({ limit: PAGE_SIZE, offset: page * PAGE_SIZE })
            .then((r) => { if (!cancelled) { setRows(r.records || []); setTotal(r.total || 0); setError(null); } })
            .catch((e) => { if (!cancelled) setError(e); });
        return () => { cancelled = true; };
    }, [page]);

    if (error) return <ErrorState error={error} />;

    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <div>
            <p className="text-sm text-gray-500 mb-3 bn">
                একাধিকবার ভিজিট হয়েছে এবং উত্তর বদলেছে — এমন {bn(total)} জন ভোটার।
                যার মত বদলায় সে persuadable; যার কখনো বদলায় না, সে নয়।
            </p>

            {rows === null ? (
                <SkeletonTable rows={6} cols={5} />
            ) : rows.length === 0 ? (
                <EmptyState
                    icon="fa-arrows-turn-to-dots"
                    label="এখনো কোনো persuadable ভোটার নেই — একই ভোটারকে একাধিকবার ভিজিট করা হলে এবং উত্তর বদলালে এখানে দেখা যাবে।"
                />
            ) : (
                <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
                            <tr>
                                <th className="px-3 py-2 text-left">ভোটার</th>
                                <th className="px-3 py-2 text-left">আসন</th>
                                <th className="px-3 py-2 text-center">ভিজিট</th>
                                <th className="px-3 py-2 text-left">মতের পরিবর্তন</th>
                                <th className="px-3 py-2 text-left">শেষ ভিজিট</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {rows.map((r) => (
                                <tr key={`${r.voter_id}-${r.candidate_id}`} className="hover:bg-gray-50">
                                    <td className="px-3 py-2">
                                        <button
                                            type="button"
                                            className="text-left group"
                                            onClick={() => setHistory({ voter_id: r.voter_id, name: r.voter_name })}
                                            title="ভিজিট history দেখুন"
                                        >
                                            <div className="font-medium text-gray-800 group-hover:text-brand group-hover:underline transition-colors">
                                                {r.voter_name}
                                            </div>
                                            <div className="text-xs text-gray-400">
                                                {r.sos_vid}{r.ward ? <span className="bn"> · ওয়ার্ড {r.ward}</span> : null}
                                            </div>
                                        </button>
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap">{r.constituency_name}</td>
                                    <td className="px-3 py-2 text-center bn">{bn(r.visits)}</td>
                                    <td className="px-3 py-2"><Journey levels={r.support_journey} /></td>
                                    <td className="px-3 py-2 whitespace-nowrap text-gray-500">
                                        {r.last_visit ? new Date(r.last_visit).toLocaleDateString('bn-BD') : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {pages > 1 && (
                <div className="flex items-center justify-between mt-4 text-sm">
                    <button
                        className="border border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white"
                        disabled={page === 0}
                        onClick={() => setPage((p) => p - 1)}
                    >
                        <i className="fas fa-chevron-left mr-1" /> আগের
                    </button>
                    <span className="text-gray-500 bn">পৃষ্ঠা {page + 1} / {pages}</span>
                    <button
                        className="border border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white"
                        disabled={page + 1 >= pages}
                        onClick={() => setPage((p) => p + 1)}
                    >
                        পরের <i className="fas fa-chevron-right ml-1" />
                    </button>
                </div>
            )}

            {history && (
                <VoterHistoryDrawer
                    voterId={history.voter_id}
                    voterName={history.name}
                    onClose={() => setHistory(null)}
                />
            )}
        </div>
    );
}
