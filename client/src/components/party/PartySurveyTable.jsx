import { useEffect, useState } from 'react';
import * as canvassingApi from '../../api/canvassing.js';
import VoterHistoryDrawer from './VoterHistoryDrawer.jsx';
import { SkeletonTable, ErrorState, EmptyState } from '../LoadingState.jsx';

const PAGE_SIZE = 50;

const SUPPORT_TONE = {
    supporter: 'bg-green-100 text-green-700',
    undecided: 'bg-amber-100 text-amber-700',
    opposed:   'bg-red-100 text-red-600',
};

/**
 * Party-isolated survey table with search + pagination, shared between the
 * party-wide surveys page and the per-candidate drill-down.
 *
 * Props:
 *   politicalCandidateId — limit to one candidate's campaign (optional)
 *   showCandidate        — show the Candidate column (party-wide view)
 *   partyId              — super-admin only: which party to inspect
 */
export default function PartySurveyTable({ politicalCandidateId = null, showCandidate = true, partyId = null }) {
    const [rows, setRows]     = useState(null);
    const [total, setTotal]   = useState(0);
    const [page, setPage]     = useState(0);
    const [q, setQ]           = useState('');
    const [search, setSearch] = useState(''); // debounced
    const [error, setError]   = useState(null);
    const [history, setHistory] = useState(null); // { voter_id, name } → timeline drawer (§10)

    useEffect(() => {
        const t = setTimeout(() => { setSearch(q.trim()); setPage(0); }, 400);
        return () => clearTimeout(t);
    }, [q]);

    // Reset to the first page when the candidate scope changes.
    useEffect(() => { setPage(0); }, [politicalCandidateId]);

    useEffect(() => {
        let cancelled = false;
        setRows(null);
        canvassingApi.partyRecords({
            limit: PAGE_SIZE,
            offset: page * PAGE_SIZE,
            q: search || undefined,
            political_candidate_id: politicalCandidateId || undefined,
            party_id: partyId || undefined,
        })
            .then((r) => { if (!cancelled) { setRows(r.records || []); setTotal(r.total || 0); setError(null); } })
            .catch((e) => { if (!cancelled) setError(e); });
        return () => { cancelled = true; };
    }, [page, search, politicalCandidateId, partyId]);

    if (error) return <ErrorState error={error} />;

    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <div>
            <div className="flex flex-wrap items-center gap-3 mb-3">
                <div className="relative">
                    <i className="fas fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 text-xs" />
                    <input
                        className="border border-gray-300 rounded-md pl-8 pr-3 py-2 text-sm w-72 focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand"
                        placeholder="ভোটারের নাম / VID / canvasser খুঁজুন…"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                    />
                </div>
                <span className="text-sm text-gray-500 bn">মোট {total.toLocaleString('bn-BD')}টি জরিপ</span>
            </div>

            {rows === null ? (
                <SkeletonTable rows={8} cols={showCandidate ? 7 : 6} />
            ) : rows.length === 0 ? (
                <EmptyState
                    icon="fa-clipboard-list"
                    label={search ? 'এই খোঁজে কোনো জরিপ পাওয়া যায়নি' : 'এখনো কোনো জরিপ সংগৃহীত হয়নি — volunteer রা canvassing শুরু করলে এখানে দেখা যাবে।'}
                />
            ) : (
                <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
                            <tr>
                                <th className="px-3 py-2 text-left">তারিখ</th>
                                <th className="px-3 py-2 text-left">ভোটার</th>
                                <th className="px-3 py-2 text-left">আসন</th>
                                {showCandidate && <th className="px-3 py-2 text-left">Candidate</th>}
                                <th className="px-3 py-2 text-left">Canvasser</th>
                                <th className="px-3 py-2 text-left">সমর্থন</th>
                                <th className="px-3 py-2 text-left">Follow-up</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {rows.map((r) => (
                                <tr key={r.canvass_id} className="hover:bg-gray-50">
                                    <td className="px-3 py-2 whitespace-nowrap text-gray-500">
                                        {r.canvass_date ? new Date(r.canvass_date).toLocaleDateString('bn-BD') : '—'}
                                    </td>
                                    <td className="px-3 py-2">
                                        {/* §10: opens the voter's full visit timeline */}
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
                                    {showCandidate && (
                                        <td className="px-3 py-2 whitespace-nowrap">
                                            <i className="fas fa-user-tie text-purple-500 mr-1 text-xs" />{r.candidate_name}
                                        </td>
                                    )}
                                    <td className="px-3 py-2 whitespace-nowrap">{r.canvasser_name}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">
                                        <span className="inline-flex items-center gap-1.5">
                                            {r.support_level ? (
                                                <span className={`text-[11px] px-2 py-0.5 rounded-full ${SUPPORT_TONE[r.support_level] || 'bg-gray-100 text-gray-600'}`}>
                                                    {r.support_level}
                                                </span>
                                            ) : <span className="text-gray-300">—</span>}
                                            {r.support_rating ? (
                                                <span className="text-amber-500 text-xs" title={`${r.support_rating}/5`}>
                                                    {'★'.repeat(r.support_rating)}
                                                </span>
                                            ) : null}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2">
                                        {r.follow_up_needed
                                            ? <span className="text-[11px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">প্রয়োজন</span>
                                            : <span className="text-gray-300">—</span>}
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
