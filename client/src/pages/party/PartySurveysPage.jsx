import { useEffect, useState } from 'react';
import * as canvassingApi from '../../api/canvassing.js';
import PageHeader from '../../components/PageHeader.jsx';
import { SkeletonTable, ErrorState, EmptyState } from '../../components/LoadingState.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { isPartyAdmin } from '../../auth/roleHome.js';

const PAGE_SIZE = 50;

// Political Admin's party-wide survey view: every canvass carried out for HIS
// party's candidates, across all constituencies. The server joins on the
// candidate grant's party_id, so no other party's data can appear here.
export default function PartySurveysPage() {
    const { user } = useAuth();
    const [rows, setRows]     = useState(null);
    const [total, setTotal]   = useState(0);
    const [page, setPage]     = useState(0);
    const [q, setQ]           = useState('');
    const [search, setSearch] = useState(''); // debounced
    const [error, setError]   = useState(null);

    useEffect(() => {
        const t = setTimeout(() => { setSearch(q.trim()); setPage(0); }, 400);
        return () => clearTimeout(t);
    }, [q]);

    useEffect(() => {
        let cancelled = false;
        setRows(null);
        canvassingApi.partyRecords({ limit: PAGE_SIZE, offset: page * PAGE_SIZE, q: search || undefined })
            .then((r) => { if (!cancelled) { setRows(r.records || []); setTotal(r.total || 0); setError(null); } })
            .catch((e) => { if (!cancelled) setError(e); });
        return () => { cancelled = true; };
    }, [page, search]);

    if (!user?.is_super_admin && !isPartyAdmin(user)) {
        return <ErrorState error={{ message: 'Political Admin only' }} />;
    }
    if (error) return <ErrorState error={error} />;

    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <>
            <PageHeader
                title="দলের জরিপসমূহ"
                subtitle="আপনার দলের সব candidate-এর ক্যাম্পেইনে সংগৃহীত জরিপ — সব আসন মিলিয়ে"
            />

            <div className="flex flex-wrap items-center gap-3 mb-4">
                <input
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm w-72 focus:outline-none focus:ring-1 focus:ring-brand"
                    placeholder="ভোটারের নাম / VID / canvasser খুঁজুন…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                />
                <span className="text-sm text-gray-500">মোট {total.toLocaleString()}টি জরিপ</span>
            </div>

            {rows === null ? (
                <SkeletonTable rows={8} cols={6} />
            ) : rows.length === 0 ? (
                <EmptyState icon="fa-clipboard-list" label="এখনো কোনো জরিপ নেই" />
            ) : (
                <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
                            <tr>
                                <th className="px-3 py-2 text-left">তারিখ</th>
                                <th className="px-3 py-2 text-left">ভোটার</th>
                                <th className="px-3 py-2 text-left">আসন</th>
                                <th className="px-3 py-2 text-left">Candidate</th>
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
                                        <div className="font-medium text-gray-800">{r.voter_name}</div>
                                        <div className="text-xs text-gray-400">
                                            {r.sos_vid}{r.ward ? <span className="bn"> · ওয়ার্ড {r.ward}</span> : null}
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap">{r.constituency_name}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">
                                        <i className="fas fa-user-tie text-purple-500 mr-1 text-xs" />{r.candidate_name}
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap">{r.canvasser_name}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">
                                        <span className="inline-flex items-center gap-1">
                                            {r.support_level || '—'}
                                            {r.support_rating ? (
                                                <span className="text-amber-500 text-xs">
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
                        className="border border-gray-300 rounded-md px-3 py-1.5 disabled:opacity-40"
                        disabled={page === 0}
                        onClick={() => setPage((p) => p - 1)}
                    >
                        <i className="fas fa-chevron-left mr-1" /> আগের
                    </button>
                    <span className="text-gray-500">পৃষ্ঠা {page + 1} / {pages}</span>
                    <button
                        className="border border-gray-300 rounded-md px-3 py-1.5 disabled:opacity-40"
                        disabled={page + 1 >= pages}
                        onClick={() => setPage((p) => p + 1)}
                    >
                        পরের <i className="fas fa-chevron-right ml-1" />
                    </button>
                </div>
            )}
        </>
    );
}
