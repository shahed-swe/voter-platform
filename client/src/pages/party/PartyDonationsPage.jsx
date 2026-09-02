import { useEffect, useState } from 'react';
import * as donationsApi from '../../api/donations.js';
import PageHeader from '../../components/PageHeader.jsx';
import { SkeletonTable, ErrorState, EmptyState } from '../../components/LoadingState.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { isPartyAdmin } from '../../auth/roleHome.js';

const PAGE_SIZE = 50;
const bn = (n) => Number(n || 0).toLocaleString('bn-BD');
const taka = (n) => `৳${bn(n)}`;

// The Political Admin's donation ledger: every donor → volunteer donation
// inside HIS party, both sides' records (recorded vs confirmed) visible.
export default function PartyDonationsPage() {
    const { user } = useAuth();
    const [data, setData]   = useState(null); // { records, count, total_amount, confirmed_amount }
    const [page, setPage]   = useState(0);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setData(null);
        donationsApi.partyLedger({ limit: PAGE_SIZE, offset: page * PAGE_SIZE })
            .then((r) => { if (!cancelled) { setData(r); setError(null); } })
            .catch((e) => { if (!cancelled) setError(e); });
        return () => { cancelled = true; };
    }, [page]);

    if (!user?.is_super_admin && !isPartyAdmin(user)) {
        return <ErrorState error={{ message: 'Political Admin only' }} />;
    }
    if (error) return <ErrorState error={error} />;

    const records = data?.records;
    const pages = Math.max(1, Math.ceil((data?.count || 0) / PAGE_SIZE));

    const cards = [
        { icon: 'fa-hand-holding-heart', label: 'মোট অনুদান',    value: bn(data?.count) },
        { icon: 'fa-coins',              label: 'মোট টাকা',       value: taka(data?.total_amount) },
        { icon: 'fa-circle-check',       label: 'নিশ্চিত হয়েছে',  value: taka(data?.confirmed_amount) },
    ];

    return (
        <>
            <PageHeader
                title="দলের অনুদান খাতা"
                subtitle="দলের donor-রা volunteer-দের যে অনুদান দিয়েছেন — দুই পক্ষের রেকর্ডসহ"
            />

            <div className="grid grid-cols-3 gap-3 mb-6">
                {cards.map((c) => (
                    <div key={c.label} className="card py-3">
                        <div className="text-xs text-gray-500"><i className={`fas ${c.icon} text-brand mr-1`} /> {c.label}</div>
                        <div className="text-xl font-bold text-gray-800 mt-1 bn">{data === null ? '…' : c.value}</div>
                    </div>
                ))}
            </div>

            {records === undefined || data === null ? (
                <SkeletonTable rows={6} cols={6} />
            ) : records.length === 0 ? (
                <EmptyState
                    icon="fa-hand-holding-heart"
                    label="এখনো কোনো অনুদান রেকর্ড হয়নি — Team Management থেকে donor যোগ করুন, তারা volunteer-দের অনুদান দেবেন।"
                />
            ) : (
                <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
                            <tr>
                                <th className="px-3 py-2 text-left">তারিখ</th>
                                <th className="px-3 py-2 text-left">Donor</th>
                                <th className="px-3 py-2 text-left">Volunteer</th>
                                <th className="px-3 py-2 text-left">Campaign</th>
                                <th className="px-3 py-2 text-right">টাকা</th>
                                <th className="px-3 py-2 text-left">অবস্থা</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {records.map((d) => (
                                <tr key={d.donation_id} className="hover:bg-gray-50">
                                    <td className="px-3 py-2 whitespace-nowrap text-gray-500">
                                        {new Date(d.recorded_at).toLocaleDateString('bn-BD')}
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-800">{d.donor_name}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">
                                        <div>{d.volunteer_name}</div>
                                        {d.note && <div className="text-xs text-gray-400">“{d.note}”</div>}
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                                        {d.candidate_name
                                            ? <span><i className="fas fa-user-tie text-purple-400 mr-1 text-xs" />{d.candidate_name}</span>
                                            : <span className="text-gray-300">—</span>}
                                        {d.constituency_name && <span className="text-gray-400 text-xs"> · {d.constituency_name}</span>}
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap text-right font-semibold text-gray-800 bn">{taka(d.amount)}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">
                                        {d.status === 'confirmed'
                                            ? <span className="text-[11px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full"><i className="fas fa-check mr-1" />নিশ্চিত</span>
                                            : <span className="text-[11px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full"><i className="fas fa-clock mr-1" />বাকি</span>}
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
        </>
    );
}
