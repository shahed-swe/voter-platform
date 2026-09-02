import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as mgmt from '../../api/management.js';
import * as canvassingApi from '../../api/canvassing.js';
import PartySurveyTable from '../../components/party/PartySurveyTable.jsx';
import { SkeletonCard, ErrorState, EmptyState } from '../../components/LoadingState.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { isPartyAdmin } from '../../auth/roleHome.js';

const bn = (n) => Number(n || 0).toLocaleString('bn-BD');

const ROLE_LABEL = { admin: 'Campaign Admin', sub_admin: 'Sub-admin', volunteer: 'Volunteer' };
const ROLE_BADGE = {
    admin:     'bg-blue-100 text-blue-700',
    sub_admin: 'bg-amber-100 text-amber-700',
    volunteer: 'bg-green-100 text-green-700',
};

function PersonRow({ u, note }) {
    return (
        <div className="flex items-start gap-2.5 py-2">
            <div className="h-8 w-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-semibold flex-shrink-0 mt-0.5">
                {(u.name || '?').charAt(0)}
            </div>
            <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">{u.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ROLE_BADGE[u.role] || 'bg-gray-100 text-gray-600'}`}>
                        {ROLE_LABEL[u.role] || u.role}
                    </span>
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                    @{u.username}
                    {u.allowed_wards?.length ? <span className="bn"> · ওয়ার্ড {u.allowed_wards.join(', ')}</span> : null}
                    {u.allowed_voter_areas?.length ? <span className="bn"> · {bn(u.allowed_voter_areas.length)} area</span> : null}
                </div>
                {note && <div className="text-[11px] text-gray-400 mt-0.5"><i className="fas fa-user-plus mr-1 text-gray-300" />{note}</div>}
            </div>
        </div>
    );
}

/**
 * Political Admin's drill-down into ONE candidate: who runs the campaign
 * (Campaign Admin → Sub-admin → the volunteers each Sub-admin assigned) and
 * every survey collected for this candidate. Party isolation is server-side;
 * a candidate outside the caller's party simply has no data here.
 */
export default function PartyCandidatePage() {
    const { userId } = useParams();
    const { user } = useAuth();
    const [users, setUsers] = useState(null);
    const [stat, setStat]   = useState(null);
    const [error, setError] = useState(null);

    const uid = parseInt(userId, 10);

    useEffect(() => {
        let cancelled = false;
        Promise.all([
            mgmt.listUsers(),
            canvassingApi.partyStats().catch(() => ({ stats: [] })),
        ])
            .then(([u, s]) => {
                if (cancelled) return;
                setUsers(u.users || []);
                setStat((s.stats || []).find((r) => String(r.candidate_user_id) === String(uid)) || {});
            })
            .catch((e) => { if (!cancelled) setError(e); });
        return () => { cancelled = true; };
    }, [uid]);

    // The campaign tree: sub-admins own the volunteers THEY assigned
    // (granted_by), everyone else hangs off the campaign directly.
    const tree = useMemo(() => {
        if (!users) return null;
        const members = users.filter((u) => String(u.political_candidate_id) === String(uid));
        const candidate = users.find((u) => u.role === 'candidate' && String(u.user_id) === String(uid)) || null;
        const admins    = members.filter((u) => u.role === 'admin');
        const subs      = members.filter((u) => u.role === 'sub_admin');
        const vols      = members.filter((u) => u.role === 'volunteer');
        const subIds    = new Set(subs.map((s) => String(s.user_id)));
        const volsBySub = {};
        const looseVols = [];
        for (const v of vols) {
            if (v.granted_by && subIds.has(String(v.granted_by))) {
                (volsBySub[String(v.granted_by)] ||= []).push(v);
            } else {
                looseVols.push(v);
            }
        }
        return { candidate, admins, subs, vols, volsBySub, looseVols };
    }, [users, uid]);

    if (!user?.is_super_admin && !isPartyAdmin(user)) {
        return <ErrorState error={{ message: 'Political Admin only' }} />;
    }
    if (error) return <ErrorState error={error} />;

    if (!tree) {
        return (
            <div className="space-y-4">
                <SkeletonCard bodyClass="h-16" />
                <SkeletonCard bodyClass="h-64" />
            </div>
        );
    }

    const c = tree.candidate;
    if (!c) {
        return (
            <>
                <Link to="/party" className="text-sm text-brand hover:underline">
                    <i className="fas fa-arrow-left mr-1" />দলের overview
                </Link>
                <div className="mt-6">
                    <EmptyState icon="fa-user-tie" label="এই candidate আপনার দলে পাওয়া যায়নি।" />
                </div>
            </>
        );
    }

    const cards = [
        { label: 'মোট জরিপ',        value: stat?.total,         icon: 'fa-clipboard-list' },
        { label: 'ভোটার (unique)',  value: stat?.unique_voters, icon: 'fa-user-check' },
        { label: 'শক্তিশালী সমর্থন', value: stat?.strong_support, icon: 'fa-thumbs-up' },
        { label: 'Follow-up',       value: stat?.follow_up,     icon: 'fa-flag', tone: stat?.follow_up > 0 ? 'text-amber-600' : '' },
    ];

    return (
        <>
            <Link to="/party" className="text-sm text-brand hover:underline">
                <i className="fas fa-arrow-left mr-1" />দলের overview
            </Link>

            {/* Candidate identity */}
            <div className="flex items-center gap-4 mt-3 mb-5">
                <div className="h-14 w-14 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xl font-bold flex-shrink-0">
                    {(c.name || '?').charAt(0)}
                </div>
                <div className="min-w-0">
                    <h1 className="text-xl font-bold text-gray-900 truncate">{c.name}</h1>
                    <div className="text-sm text-gray-500 flex items-center gap-3 flex-wrap mt-0.5">
                        <span>@{c.username}</span>
                        <span><i className="fas fa-map-location-dot text-brand mr-1" />{c.constituency_name}</span>
                        {c.phone && <span><i className="fas fa-phone text-gray-300 mr-1" />{c.phone}</span>}
                    </div>
                </div>
            </div>

            {/* This candidate's survey numbers */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {cards.map((s) => (
                    <div key={s.label} className="card py-3">
                        <div className="text-xs text-gray-500"><i className={`fas ${s.icon} text-brand mr-1`} /> {s.label}</div>
                        <div className={`text-xl font-bold mt-1 bn ${s.tone || 'text-gray-800'}`}>{bn(s.value)}</div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                {/* Campaign hierarchy */}
                <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                        <h2 className="text-sm font-semibold text-gray-800">
                            <i className="fas fa-sitemap text-brand mr-2" />ক্যাম্পেইন টিম
                            <span className="text-gray-400 font-normal bn"> — {bn(tree.admins.length + tree.subs.length + tree.vols.length)} জন</span>
                        </h2>
                    </div>
                    <div className="px-4 py-2 divide-y divide-gray-50">
                        {tree.admins.length + tree.subs.length + tree.vols.length === 0 ? (
                            <p className="text-sm text-gray-400 py-4 text-center">
                                এখনো কেউ নেই — candidate নিজে login করে Campaign Admin যোগ করবেন।
                            </p>
                        ) : (
                            <>
                                {tree.admins.map((a) => (
                                    <PersonRow key={`a-${a.user_id}`} u={a} />
                                ))}
                                {tree.subs.map((s) => (
                                    <div key={`s-${s.user_id}`}>
                                        <PersonRow u={s} />
                                        {(tree.volsBySub[String(s.user_id)] || []).length > 0 && (
                                            <div className="ml-4 pl-4 border-l-2 border-gray-100 mb-1">
                                                <div className="text-[10px] uppercase tracking-wider text-gray-400 pt-1">
                                                    এই sub-admin-এর volunteers
                                                </div>
                                                {tree.volsBySub[String(s.user_id)].map((v) => (
                                                    <PersonRow key={`v-${v.user_id}`} u={v} />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {tree.looseVols.map((v) => (
                                    <PersonRow
                                        key={`lv-${v.user_id}`}
                                        u={v}
                                        note={v.granted_by_name ? `যোগ করেছেন: ${v.granted_by_name}` : null}
                                    />
                                ))}
                            </>
                        )}
                    </div>
                </section>

                {/* This candidate's surveys only */}
                <section className="lg:col-span-2">
                    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                        {c.name}-এর জরিপসমূহ
                    </h2>
                    <PartySurveyTable politicalCandidateId={uid} showCandidate={false} />
                </section>
            </div>
        </>
    );
}
