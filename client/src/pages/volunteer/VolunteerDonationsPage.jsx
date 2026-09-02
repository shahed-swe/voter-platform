import { useEffect, useState, useCallback } from 'react';
import * as donationsApi from '../../api/donations.js';
import PageHeader from '../../components/PageHeader.jsx';
import { SkeletonList, ErrorState, EmptyState, Spinner } from '../../components/LoadingState.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';

const bn = (n) => Number(n || 0).toLocaleString('bn-BD');
const taka = (n) => `৳${bn(n)}`;

// The volunteer's side of §9: donations addressed to them, with the
// INDEPENDENT confirmation step — the volunteer, not the donor, records that
// the money actually arrived.
export default function VolunteerDonationsPage() {
    const { user } = useAuth();
    const [donations, setDonations] = useState(null);
    const [error, setError] = useState(null);
    const [confirming, setConfirming] = useState(null); // donation_id in flight

    const reload = useCallback(() => {
        donationsApi.received()
            .then((r) => { setDonations(r.donations || []); setError(null); })
            .catch(setError);
    }, []);
    useEffect(() => { reload(); }, [reload]);

    async function confirm(d) {
        if (!window.confirm(`${d.donor_name}-এর কাছ থেকে ${taka(d.amount)} পেয়েছেন — নিশ্চিত করবেন?`)) return;
        setConfirming(d.donation_id);
        try {
            await donationsApi.confirm(d.donation_id);
            reload();
        } catch (err) {
            alert(err.response?.data?.error || err.message);
        } finally {
            setConfirming(null);
        }
    }

    if (user?.role !== 'volunteer') return <ErrorState error={{ message: 'Volunteer only' }} />;
    if (error) return <ErrorState error={error} onRetry={reload} />;

    const pending = (donations || []).filter((d) => d.status === 'recorded');

    return (
        <>
            <PageHeader
                title="আমার অনুদান"
                subtitle="Donor-দের কাছ থেকে পাওয়া অনুদান — টাকা হাতে পেলে নিজে নিশ্চিত করুন"
            />

            {donations === null ? (
                <SkeletonList rows={4} lines={2} />
            ) : donations.length === 0 ? (
                <EmptyState icon="fa-hand-holding-heart" label="এখনো কোনো অনুদান আসেনি।" />
            ) : (
                <>
                    {pending.length > 0 && (
                        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4 bn">
                            <i className="fas fa-clock mr-1.5" />
                            {bn(pending.length)}টি অনুদান আপনার নিশ্চিতকরণের অপেক্ষায়
                        </p>
                    )}
                    <div className="space-y-2">
                        {donations.map((d) => (
                            <div key={d.donation_id} className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-gray-900">{d.donor_name}</div>
                                    <div className="text-xs text-gray-500 mt-0.5">
                                        {new Date(d.recorded_at).toLocaleDateString('bn-BD')}
                                        {d.note && <span className="text-gray-400"> · “{d.note}”</span>}
                                        {d.status === 'confirmed' && d.confirmed_at && (
                                            <span className="text-green-600"> · <i className="fas fa-check" /> নিশ্চিত {new Date(d.confirmed_at).toLocaleDateString('bn-BD')}</span>
                                        )}
                                    </div>
                                </div>
                                <div className="text-base font-bold text-gray-800 whitespace-nowrap bn">{taka(d.amount)}</div>
                                {d.status === 'recorded' ? (
                                    <button
                                        className="inline-flex items-center gap-1.5 bg-green-600 text-white text-xs font-medium px-3 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 whitespace-nowrap"
                                        disabled={confirming === d.donation_id}
                                        onClick={() => confirm(d)}
                                    >
                                        {confirming === d.donation_id ? <Spinner size="sm" /> : <i className="fas fa-check" />}
                                        টাকা পেয়েছি
                                    </button>
                                ) : (
                                    <span className="text-[11px] bg-green-100 text-green-700 px-2 py-1 rounded-full whitespace-nowrap">
                                        <i className="fas fa-check mr-1" />নিশ্চিত
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </>
    );
}
