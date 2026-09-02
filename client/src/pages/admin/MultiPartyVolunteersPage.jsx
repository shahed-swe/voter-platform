import { useEffect, useState } from 'react';
import * as adminApi from '../../api/admin.js';
import PageHeader from '../../components/PageHeader.jsx';
import { SkeletonList, ErrorState, EmptyState } from '../../components/LoadingState.jsx';

const bn = (n) => Number(n || 0).toLocaleString('bn-BD');

/**
 * flowApplication.md §5 — ONLY the Main Admin can see that one volunteer works
 * for candidates of different parties. Each party's own view never reveals the
 * other; this page is where the overlap is visible.
 */
export default function MultiPartyVolunteersPage() {
    const [rows, setRows] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        adminApi.multiPartyVolunteers()
            .then((r) => { if (!cancelled) setRows(r.volunteers || []); })
            .catch((e) => { if (!cancelled) setError(e); });
        return () => { cancelled = true; };
    }, []);

    if (error) return <ErrorState error={error} />;

    return (
        <>
            <PageHeader
                title="Multi-party Volunteers"
                subtitle="একাধিক দলের candidate-এর হয়ে কাজ করছেন এমন volunteer — শুধু Main Admin-ই এই overlap দেখতে পান"
            />

            {rows === null ? (
                <SkeletonList rows={4} lines={2} />
            ) : rows.length === 0 ? (
                <EmptyState
                    icon="fa-people-arrows"
                    label="কোনো volunteer একাধিক দলের হয়ে কাজ করছেন না।"
                />
            ) : (
                <div className="space-y-2">
                    {rows.map((v) => (
                        <div key={v.user_id} className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-start gap-3">
                            <div className="h-10 w-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-semibold flex-shrink-0">
                                {(v.name || '?').charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-gray-900">{v.name}</span>
                                    <span className="text-xs text-gray-400">@{v.username}</span>
                                    <span className="text-[11px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full bn">
                                        {bn(v.party_count)}টি দল
                                    </span>
                                </div>
                                <div className="text-xs text-gray-500 mt-1.5 space-y-0.5">
                                    <div>
                                        <i className="fas fa-flag text-rose-400 mr-1.5 w-3.5 text-center" />
                                        {(v.parties || []).join(' · ')}
                                    </div>
                                    <div>
                                        <i className="fas fa-user-tie text-purple-400 mr-1.5 w-3.5 text-center" />
                                        {(v.candidates || []).join(' · ')}
                                    </div>
                                    <div>
                                        <i className="fas fa-map-location-dot text-gray-300 mr-1.5 w-3.5 text-center" />
                                        {(v.constituencies || []).join(' · ')}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </>
    );
}
