import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as canvassingApi from '../../api/canvassing.js';
import * as mgmt from '../../api/management.js';
import PageHeader from '../../components/PageHeader.jsx';
import { SkeletonCard, ErrorState } from '../../components/LoadingState.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';

const bn = (n) => Number(n || 0).toLocaleString('bn-BD');

const ROLE_TITLE = { candidate: 'Candidate', admin: 'Campaign Admin', sub_admin: 'Sub-admin' };
const ROLE_LABEL = { admin: 'Campaign Admin', sub_admin: 'Sub-admin', volunteer: 'Volunteer' };
const ROLE_BADGE = {
    admin:     'bg-blue-100 text-blue-700',
    sub_admin: 'bg-amber-100 text-amber-700',
    volunteer: 'bg-green-100 text-green-700',
};

/**
 * Campaign home for the chain below the Political Admin: candidate, campaign
 * admin, and sub-admin all land here. Everything shown is already scoped to
 * THEIR campaign server-side (stats by political_candidate_id, team by the
 * management hierarchy, wards for sub-admins).
 */
export default function CampaignHomePage() {
    const { user } = useAuth();
    const [stats, setStats] = useState(null);
    const [team, setTeam] = useState(null);
    const [error, setError] = useState(null);

    // The campaign this user serves: their own name for a candidate, the
    // grant's candidate for campaign staff.
    const grant = (user?.candidates || []).find((g) => String(g.id) === String(user?.active_candidate))
        || (user?.candidates || [])[0];
    const campaignName = user?.role === 'candidate'
        ? user?.name
        : grant?.political_candidate_name || null;

    useEffect(() => {
        let cancelled = false;
        Promise.all([
            canvassingApi.stats().catch(() => ({ stats: {} })),
            mgmt.listUsers().catch(() => ({ users: [] })),
        ]).then(([s, t]) => {
            if (cancelled) return;
            setStats(s.stats || {});
            setTeam(t.users || []);
        }).catch((e) => { if (!cancelled) setError(e); });
        return () => { cancelled = true; };
    }, []);

    if (error) return <ErrorState error={error} />;

    const loading = stats === null || team === null;
    const byRole = {};
    for (const u of (team || [])) byRole[u.role] = (byRole[u.role] || 0) + 1;

    const cards = [
        { icon: 'fa-clipboard-list', label: 'মোট জরিপ',        value: stats?.total_canvasses },
        { icon: 'fa-user-check',     label: 'ভোটার (unique)',   value: stats?.unique_voters },
        { icon: 'fa-thumbs-up',      label: 'শক্তিশালী সমর্থন',  value: stats?.strong_support },
        { icon: 'fa-scale-balanced', label: 'দ্বিধাগ্রস্ত',       value: stats?.undecided },
        { icon: 'fa-flag',           label: 'Follow-up',        value: stats?.follow_up, tone: Number(stats?.follow_up) > 0 ? 'text-amber-600' : '' },
        { icon: 'fa-users',          label: 'আমার টিম',          value: (team || []).length },
    ];

    const actions = [
        { to: '/canvassing',  icon: 'fa-clipboard-check', label: 'Canvassing',  desc: 'মাঠে জরিপ চালান' },
        { to: '/survey-data', icon: 'fa-clipboard-list',  label: 'Survey Data', desc: 'সংগৃহীত জরিপ দেখুন' },
        { to: '/analytics',   icon: 'fa-chart-line',      label: 'Analytics',   desc: 'ক্যাম্পেইনের বিশ্লেষণ' },
        { to: '/management',  icon: 'fa-sitemap',         label: 'Team',        desc: 'টিম তৈরি ও ব্যবস্থাপনা' },
    ];

    return (
        <>
            <PageHeader
                title={campaignName ? `${campaignName}-এর ক্যাম্পেইন` : 'আমার ক্যাম্পেইন'}
                subtitle={`${user?.name || ''} — ${ROLE_TITLE[user?.role] || user?.role}${grant?.constituency_name ? ` · ${grant.constituency_name}` : ''}${user?.allowed_wards?.length ? ` · ওয়ার্ড ${user.allowed_wards.join(', ')}` : ''}`}
            />

            {/* Campaign numbers — scoped to THIS campaign only */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                {loading
                    ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} bodyClass="h-14" />)
                    : cards.map((c) => (
                        <div key={c.label} className="card py-3">
                            <div className="text-xs text-gray-500"><i className={`fas ${c.icon} text-brand mr-1`} /> {c.label}</div>
                            <div className={`text-xl font-bold mt-1 bn ${c.tone || 'text-gray-800'}`}>{bn(c.value)}</div>
                        </div>
                    ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                {/* Quick actions */}
                <div className="lg:col-span-2">
                    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">কাজ শুরু করুন</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {actions.map((a) => (
                            <Link key={a.to} to={a.to} className="card hover:border-brand/50 transition-colors group">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-lg bg-brand/10 text-brand flex items-center justify-center flex-shrink-0">
                                        <i className={`fas ${a.icon}`} />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="font-medium text-gray-900 group-hover:text-brand transition-colors">{a.label}</div>
                                        <div className="text-xs text-gray-500">{a.desc}</div>
                                    </div>
                                    <i className="fas fa-chevron-right text-gray-300 group-hover:text-brand ml-auto transition-colors" />
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>

                {/* Team at a glance (already hierarchy-scoped server-side) */}
                <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-gray-800">
                            <i className="fas fa-users text-brand mr-2" />আমার টিম
                        </h2>
                        <Link to="/management" className="text-xs text-brand hover:underline">সব দেখুন →</Link>
                    </div>
                    {loading ? (
                        <div className="p-4"><SkeletonCard bodyClass="h-20" /></div>
                    ) : (team || []).length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-6 px-4">
                            এখনো কেউ নেই — Team থেকে সদস্য যোগ করুন।
                        </p>
                    ) : (
                        <>
                            <div className="px-4 py-2.5 flex gap-2 flex-wrap border-b border-gray-50">
                                {Object.entries(byRole).map(([r, n]) => (
                                    <span key={r} className={`text-[11px] px-2 py-0.5 rounded-full font-medium bn ${ROLE_BADGE[r] || 'bg-gray-100 text-gray-600'}`}>
                                        {ROLE_LABEL[r] || r}: {bn(n)}
                                    </span>
                                ))}
                            </div>
                            <ul className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                                {(team || []).slice(0, 8).map((u) => (
                                    <li key={`${u.user_id}-${u.role}-${u.political_candidate_id || ''}`} className="px-4 py-2 flex items-center gap-2.5">
                                        <div className="h-7 w-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                                            {(u.name || '?').charAt(0)}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm text-gray-800 truncate">{u.name}</div>
                                            <div className="text-[11px] text-gray-400">
                                                {ROLE_LABEL[u.role] || u.role}
                                                {u.allowed_wards?.length ? <span className="bn"> · ওয়ার্ড {u.allowed_wards.join(', ')}</span> : null}
                                            </div>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </section>
            </div>
        </>
    );
}
