import { useEffect, useState, useCallback } from 'react';
import * as donationsApi from '../../api/donations.js';
import PageHeader from '../../components/PageHeader.jsx';
import { SkeletonList, ErrorState, EmptyState, Spinner } from '../../components/LoadingState.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';

const INPUT = 'w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand';
const BTN_PRIMARY = 'inline-flex items-center gap-2 bg-brand text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-brand/90 disabled:opacity-50';
const BTN_SECONDARY = 'inline-flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-gray-50';

const bn = (n) => Number(n || 0).toLocaleString('bn-BD');
const taka = (n) => `৳${bn(n)}`;

function StatusBadge({ status }) {
    return status === 'confirmed'
        ? <span className="text-[11px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full whitespace-nowrap"><i className="fas fa-check mr-1" />নিশ্চিত হয়েছে</span>
        : <span className="text-[11px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full whitespace-nowrap"><i className="fas fa-clock mr-1" />নিশ্চিতকরণ বাকি</span>;
}

// ── New-donation modal: find a volunteer by name/area, then amount + note ─────
function NewDonationModal({ onClose, onCreated }) {
    const [q, setQ] = useState('');
    const [results, setResults] = useState(null);
    const [selected, setSelected] = useState(null);
    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    // Debounced party-scoped volunteer search (empty query lists them all).
    useEffect(() => {
        if (selected) return;
        let cancelled = false;
        const t = setTimeout(() => {
            donationsApi.findVolunteers(q.trim())
                .then((r) => { if (!cancelled) setResults(r.volunteers || []); })
                .catch(() => { if (!cancelled) setResults([]); });
        }, 300);
        return () => { cancelled = true; clearTimeout(t); };
    }, [q, selected]);

    async function submit(e) {
        e.preventDefault();
        if (!selected) { setError('আগে একজন volunteer নির্বাচন করুন'); return; }
        setBusy(true); setError(null);
        try {
            await donationsApi.create({
                volunteer_user_id: selected.user_id,
                political_candidate_id: selected.political_candidate_id || undefined,
                amount: Number(amount),
                note: note.trim() || undefined,
            });
            onCreated();
        } catch (err) {
            setError(err.response?.data?.error || err.message);
            setBusy(false);
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <form className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto" onSubmit={submit}>
                <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white">
                    <h3 className="font-semibold text-gray-800">
                        <i className="fas fa-hand-holding-heart mr-2 text-brand" />নতুন অনুদান
                    </h3>
                    <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times" /></button>
                </div>
                <div className="p-5 space-y-3">
                    {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-2">{error}</div>}

                    {selected ? (
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Volunteer</label>
                            <div className="flex items-start justify-between gap-3 border border-brand/40 bg-brand/5 rounded-md px-3 py-2.5">
                                <div className="text-sm">
                                    <div className="font-medium text-gray-900">{selected.name}</div>
                                    <div className="text-xs text-gray-500 mt-0.5">
                                        {selected.candidate_name && <span><i className="fas fa-user-tie text-purple-400 mr-1" />{selected.candidate_name} · </span>}
                                        {selected.constituency_name}
                                        {selected.allowed_wards?.length ? <span className="bn"> · ওয়ার্ড {selected.allowed_wards.join(', ')}</span> : null}
                                    </div>
                                </div>
                                <button type="button" className="text-gray-400 hover:text-red-500 mt-1" onClick={() => setSelected(null)} title="অন্য volunteer নিন">
                                    <i className="fas fa-times" />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                                যে এলাকায় সহায়তা করতে চান, সেখানকার volunteer খুঁজুন
                            </label>
                            <div className="relative">
                                <i className="fas fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 text-xs" />
                                <input
                                    className={`${INPUT} pl-8`}
                                    placeholder="নাম, এলাকা বা ওয়ার্ড লিখুন…"
                                    value={q}
                                    onChange={(e) => setQ(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            {results === null ? (
                                <div className="text-center text-gray-400 text-sm py-4"><Spinner size="sm" /></div>
                            ) : results.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-4">কোনো volunteer পাওয়া যায়নি</p>
                            ) : (
                                <div className="mt-2 border border-gray-200 rounded-md divide-y divide-gray-100 max-h-56 overflow-y-auto">
                                    {results.map((v) => (
                                        <button
                                            key={`${v.user_id}-${v.political_candidate_id}`}
                                            type="button"
                                            className="w-full text-left px-3 py-2.5 hover:bg-brand/5 transition-colors"
                                            onClick={() => setSelected(v)}
                                        >
                                            <div className="text-sm font-medium text-gray-900">{v.name}</div>
                                            <div className="text-xs text-gray-500 mt-0.5">
                                                {v.candidate_name && <span><i className="fas fa-user-tie text-purple-400 mr-1" />{v.candidate_name} · </span>}
                                                {v.constituency_name}
                                                {v.allowed_wards?.length ? <span className="bn"> · ওয়ার্ড {v.allowed_wards.join(', ')}</span> : null}
                                                {v.allowed_voter_areas?.length ? <span className="bn"> · {v.allowed_voter_areas.join(', ')}</span> : null}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">টাকার পরিমাণ (৳) *</label>
                            <input
                                className={INPUT} type="number" min="1" step="any" required
                                value={amount} onChange={(e) => setAmount(e.target.value)}
                                placeholder="যেমন: 5000"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">নোট (ঐচ্ছিক)</label>
                            <input className={INPUT} value={note} onChange={(e) => setNote(e.target.value)} placeholder="কী উদ্দেশ্যে…" />
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded p-2">
                        অনুদান রেকর্ড হওয়ার পর volunteer নিজে টাকা পাওয়ার বিষয়টি নিশ্চিত করবেন —
                        দুই পক্ষের রেকর্ড আলাদাভাবে রাখা হয়।
                    </p>
                </div>
                <div className="border-t border-gray-100 px-5 py-3 sticky bottom-0 bg-white flex justify-end gap-2">
                    <button type="button" className={BTN_SECONDARY} onClick={onClose}>বাতিল</button>
                    <button type="submit" className={BTN_PRIMARY} disabled={busy || !selected}>
                        {busy ? <Spinner size="sm" /> : <i className="fas fa-hand-holding-heart" />} অনুদান রেকর্ড করুন
                    </button>
                </div>
            </form>
        </div>
    );
}

// Donor landing: their own donation record ONLY — donors never see canvassing
// or survey data (flowApplication.md §9).
export default function DonorProfilePage() {
    const { user } = useAuth();
    const party = (user?.parties || []).find((p) => p.role === 'donor');
    const [data, setData] = useState(null); // { donations, totals }
    const [error, setError] = useState(null);
    const [showNew, setShowNew] = useState(false);

    const reload = useCallback(() => {
        donationsApi.mine()
            .then((r) => { setData(r); setError(null); })
            .catch(setError);
    }, []);
    useEffect(() => { if (party) reload(); }, [party?.id, reload]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!party) {
        return <EmptyState icon="fa-hand-holding-heart" label="আপনার অ্যাকাউন্টে এখনো কোনো দল যুক্ত নেই।" />;
    }
    if (error) return <ErrorState error={error} onRetry={reload} />;

    const totals = data?.totals || {};
    const donations = data?.donations;

    const cards = [
        { icon: 'fa-hand-holding-heart', label: 'মোট অনুদান',       value: bn(totals.count) },
        { icon: 'fa-coins',              label: 'মোট টাকা',          value: taka(totals.total_amount) },
        { icon: 'fa-circle-check',       label: 'নিশ্চিত হয়েছে',     value: taka(totals.confirmed_amount) },
        { icon: 'fa-clock',              label: 'নিশ্চিতকরণ বাকি',   value: bn(totals.pending_count), tone: totals.pending_count > 0 ? 'text-amber-600' : '' },
    ];

    return (
        <>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <PageHeader
                    title={user?.name || 'Donor'}
                    subtitle={`Donor — ${party.name}`}
                />
                <button className={BTN_PRIMARY} onClick={() => setShowNew(true)}>
                    <i className="fas fa-plus" /> নতুন অনুদান
                </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {cards.map((c) => (
                    <div key={c.label} className="card py-3">
                        <div className="text-xs text-gray-500"><i className={`fas ${c.icon} text-brand mr-1`} /> {c.label}</div>
                        <div className={`text-xl font-bold mt-1 bn ${c.tone || 'text-gray-800'}`}>
                            {donations === undefined || data === null ? '…' : c.value}
                        </div>
                    </div>
                ))}
            </div>

            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">আমার অনুদানসমূহ</h2>

            {data === null ? (
                <SkeletonList rows={4} lines={2} />
            ) : donations.length === 0 ? (
                <EmptyState
                    icon="fa-hand-holding-heart"
                    label="এখনো কোনো অনুদান রেকর্ড করেননি — উপরের বাটন থেকে আপনার দলের volunteer খুঁজে অনুদান দিন।"
                />
            ) : (
                <div className="space-y-2">
                    {donations.map((d) => (
                        <div key={d.donation_id} className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-gray-900">{d.volunteer_name}</span>
                                    <StatusBadge status={d.status} />
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5">
                                    {new Date(d.recorded_at).toLocaleDateString('bn-BD')}
                                    {d.candidate_name && <span> · <i className="fas fa-user-tie text-purple-400" /> {d.candidate_name}</span>}
                                    {d.constituency_name && ` · ${d.constituency_name}`}
                                    {d.note && <span className="text-gray-400"> · “{d.note}”</span>}
                                </div>
                            </div>
                            <div className="text-base font-bold text-gray-800 whitespace-nowrap bn">{taka(d.amount)}</div>
                        </div>
                    ))}
                </div>
            )}

            {showNew && (
                <NewDonationModal
                    onClose={() => setShowNew(false)}
                    onCreated={() => { setShowNew(false); reload(); }}
                />
            )}
        </>
    );
}
