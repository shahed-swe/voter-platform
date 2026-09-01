import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as mgmt from '../../api/management.js';
import * as canvassingApi from '../../api/canvassing.js';
import PageHeader from '../../components/PageHeader.jsx';
import { SkeletonCard, ErrorState, EmptyState } from '../../components/LoadingState.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { isPartyAdmin } from '../../auth/roleHome.js';

const bn = (n) => Number(n || 0).toLocaleString('bn-BD');

// Political Admin (tenant_admin) landing: his party at a glance. Every
// candidate row carries that candidate's own survey numbers and drills into
// the candidate page (team hierarchy + surveys). Everything here is
// party-isolated server-side.
export default function PartyHomePage() {
    const { user } = useAuth();
    const [users, setUsers] = useState(null);
    const [stats, setStats] = useState(null); // per-candidate survey aggregates
    const [error, setError] = useState(null);

    const parties = (user?.parties || []).filter((p) => p.role === 'tenant_admin');
    const party = parties[0] || null;

    useEffect(() => {
        if (!party) return;
        let cancelled = false;
        Promise.all([mgmt.listUsers(), canvassingApi.partyStats()])
            .then(([u, s]) => {
                if (cancelled) return;
                setUsers(u.users || []);
                setStats(s.stats || []);
            })
            .catch((e) => { if (!cancelled) setError(e); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [party?.id]);

    if (!user?.is_super_admin && !isPartyAdmin(user)) {
        return <ErrorState error={{ message: 'Political Admin only' }} />;
    }
    if (!party) return <EmptyState icon="fa-flag" label="আপনার অ্যাকাউন্টে এখনো কোনো দল যুক্ত নেই।" />;
    if (error) return <ErrorState error={error} />;

    const loading = users === null || stats === null;
    const candidates = (users || []).filter((u) => u.role === 'candidate');
    const teamCount = (users || []).filter((u) => u.role !== 'candidate').length;

    // Per-candidate lookups: survey aggregates + campaign team size.
    const statOf = {};
    for (const s of (stats || [])) statOf[s.candidate_user_id] = s;
    const teamOf = {};
    for (const u of (users || [])) {
        if (u.role !== 'candidate' && u.political_candidate_id) {
            teamOf[u.political_candidate_id] = (teamOf[u.political_candidate_id] || 0) + 1;
        }
    }

    const totalSurveys  = (stats || []).reduce((n, s) => n + (s.total || 0), 0);
    const totalFollowUp = (stats || []).reduce((n, s) => n + (s.follow_up || 0), 0);

    // Group candidates by constituency (one seat can hold several of ours).
    const byConstituency = {};
    for (const c of candidates) {
        const key = c.constituency_name || c.candidate_id || '—';
        (byConstituency[key] ||= []).push(c);
    }

    const summary = [
        { icon: 'fa-user-tie',       label: 'Candidates',        value: candidates.length },
        { icon: 'fa-users',          label: 'Team members',      value: teamCount },
        { icon: 'fa-clipboard-list', label: 'মোট জরিপ',           value: totalSurveys, to: '/party/surveys' },
        { icon: 'fa-flag',           label: 'Follow-up প্রয়োজন', value: totalFollowUp, tone: totalFollowUp > 0 ? 'text-amber-600' : '' },
    ];

    return (
        <>
            <PageHeader
                title={party.name}
                subtitle={`${user?.name || ''} — Political Admin`}
            />

            {/* Party-wide numbers */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {summary.map((s) => {
                    const body = (
                        <>
                            <div className="text-xs text-gray-500">
                                <i className={`fas ${s.icon} text-brand mr-1`} /> {s.label}
                            </div>
                            <div className={`text-xl font-bold mt-1 bn ${s.tone || 'text-gray-800'}`}>
                                {loading ? '…' : bn(s.value)}
                            </div>
                        </>
                    );
                    return s.to ? (
                        <Link key={s.label} to={s.to} className="card py-3 hover:border-brand/50 transition-colors" title="দলের সব জরিপ দেখুন">
                            {body}
                        </Link>
                    ) : (
                        <div key={s.label} className="card py-3">{body}</div>
                    );
                })}
            </div>

            <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                    আমাদের Candidates (আসন অনুযায়ী)
                </h2>
                <Link to="/management" className="text-sm text-brand hover:underline">
                    <i className="fas fa-user-plus mr-1" />নতুন candidate যোগ করুন
                </Link>
            </div>

            {loading ? (
                <div className="space-y-4">
                    {Array.from({ length: 2 }).map((_, i) => <SkeletonCard key={i} bodyClass="h-32" />)}
                </div>
            ) : candidates.length === 0 ? (
                <EmptyState
                    icon="fa-user-tie"
                    label="এখনো কোনো candidate নিবন্ধিত হয়নি — Team Management থেকে candidate তৈরি করুন।"
                />
            ) : (
                <div className="space-y-4">
                    {Object.entries(byConstituency).map(([constituency, list]) => (
                        <section key={constituency} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                                <h3 className="font-semibold text-gray-800 text-sm">
                                    <i className="fas fa-map-location-dot text-brand mr-2" />{constituency}
                                </h3>
                                <span className="text-[11px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full bn">
                                    {bn(list.length)} জন candidate
                                </span>
                            </div>
                            <ul className="divide-y divide-gray-100">
                                {list.map((c) => {
                                    const s = statOf[c.user_id] || {};
                                    const team = teamOf[c.user_id] || 0;
                                    return (
                                        <li key={`${c.user_id}-${c.candidate_id}`}>
                                            <Link
                                                to={`/party/candidates/${c.user_id}`}
                                                className="flex items-center gap-3 px-4 py-3 hover:bg-brand/5 transition-colors group"
                                            >
                                                <div className="h-10 w-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-semibold flex-shrink-0">
                                                    {(c.name || '?').charAt(0)}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="font-medium text-gray-900 truncate group-hover:text-brand transition-colors">
                                                        {c.name}
                                                    </div>
                                                    <div className="text-xs text-gray-400">@{c.username}</div>
                                                </div>
                                                {/* This candidate's own numbers — the survey data belongs to HIM */}
                                                <div className="hidden sm:flex items-center gap-4 text-xs text-gray-500 flex-shrink-0 bn">
                                                    <span title="ক্যাম্পেইন টিমের সদস্য">
                                                        <i className="fas fa-users text-gray-300 mr-1" />টিম {bn(team)}
                                                    </span>
                                                    <span title="এই candidate-এর জরিপ">
                                                        <i className="fas fa-clipboard-list text-gray-300 mr-1" />জরিপ {bn(s.total)}
                                                    </span>
                                                    {s.follow_up > 0 && (
                                                        <span className="text-amber-600" title="Follow-up প্রয়োজন">
                                                            <i className="fas fa-flag mr-1" />{bn(s.follow_up)}
                                                        </span>
                                                    )}
                                                </div>
                                                <i className="fas fa-chevron-right text-gray-300 group-hover:text-brand transition-colors flex-shrink-0" />
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    ))}
                </div>
            )}
        </>
    );
}
