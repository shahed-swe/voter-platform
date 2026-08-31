import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as mgmt from '../../api/management.js';
import PageHeader from '../../components/PageHeader.jsx';
import { SkeletonCard, ErrorState, EmptyState } from '../../components/LoadingState.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { isPartyAdmin } from '../../auth/roleHome.js';

// Political Admin (tenant_admin) landing: his party at a glance — the
// candidates his party has registered (grouped by constituency) and quick
// links to Team Management and the party-wide survey view. Everything on this
// page is party-isolated server-side.
export default function PartyHomePage() {
    const { user } = useAuth();
    const [users, setUsers] = useState(null);
    const [error, setError] = useState(null);

    const parties = (user?.parties || []).filter((p) => p.role === 'tenant_admin');
    const party = parties[0] || null;

    useEffect(() => {
        if (!party) return;
        let cancelled = false;
        mgmt.listUsers()
            .then((r) => { if (!cancelled) setUsers(r.users || []); })
            .catch((e) => { if (!cancelled) setError(e); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [party?.id]);

    if (!user?.is_super_admin && !isPartyAdmin(user)) {
        return <ErrorState error={{ message: 'Political Admin only' }} />;
    }
    if (!party) return <EmptyState icon="fa-flag" label="আপনার অ্যাকাউন্টে এখনো কোনো দল যুক্ত নেই।" />;
    if (error) return <ErrorState error={error} />;

    const candidates = (users || []).filter((u) => u.role === 'candidate');
    const teamCount = (users || []).filter((u) => u.role !== 'candidate').length;

    // Group candidates by constituency (one seat can hold several of ours).
    const byConstituency = {};
    for (const c of candidates) {
        const key = c.constituency_name || c.candidate_id || '—';
        (byConstituency[key] ||= []).push(c);
    }

    return (
        <>
            <PageHeader
                title={party.name}
                subtitle={`${user?.name || ''} — Political Admin`}
            />

            {/* Quick stats + actions */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div className="card py-3">
                    <div className="text-xs text-gray-500"><i className="fas fa-user-tie text-brand mr-1" /> Candidates</div>
                    <div className="text-xl font-bold text-gray-800 mt-1">{users === null ? '…' : candidates.length}</div>
                </div>
                <div className="card py-3">
                    <div className="text-xs text-gray-500"><i className="fas fa-users text-brand mr-1" /> Team members</div>
                    <div className="text-xl font-bold text-gray-800 mt-1">{users === null ? '…' : teamCount}</div>
                </div>
                <Link to="/management" className="card py-3 hover:border-brand/50 transition-colors">
                    <div className="text-xs text-gray-500"><i className="fas fa-sitemap text-brand mr-1" /> Team Management</div>
                    <div className="text-sm font-medium text-brand mt-1.5">Candidate তৈরি ও hierarchy দেখুন →</div>
                </Link>
                <Link to="/party/surveys" className="card py-3 hover:border-brand/50 transition-colors">
                    <div className="text-xs text-gray-500"><i className="fas fa-clipboard-list text-brand mr-1" /> জরিপ</div>
                    <div className="text-sm font-medium text-brand mt-1.5">দলের সব জরিপ দেখুন →</div>
                </Link>
            </div>

            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                আমাদের Candidates (আসন অনুযায়ী)
            </h2>

            {users === null ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} bodyClass="h-24" />)}
                </div>
            ) : candidates.length === 0 ? (
                <EmptyState
                    icon="fa-user-tie"
                    label="এখনো কোনো candidate নিবন্ধিত হয়নি — Team Management থেকে candidate তৈরি করুন।"
                />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(byConstituency).map(([constituency, list]) => (
                        <div key={constituency} className="card">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold text-gray-800">
                                    <i className="fas fa-map-location-dot text-brand mr-2" />{constituency}
                                </h3>
                                <span className="text-[11px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                                    {list.length} candidate
                                </span>
                            </div>
                            <ul className="mt-3 space-y-2">
                                {list.map((c) => (
                                    <li key={`${c.user_id}-${c.candidate_id}`} className="flex items-center gap-2 text-sm">
                                        <div className="h-7 w-7 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-semibold">
                                            {(c.name || '?').charAt(0)}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-gray-800 truncate">{c.name}</div>
                                            <div className="text-xs text-gray-400">@{c.username}</div>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            )}
        </>
    );
}
