import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import * as mgmt from '../../api/management.js';
import * as canvassingApi from '../../api/canvassing.js';
import * as selectionApi from '../../api/selection.js';
import PageHeader from '../../components/PageHeader.jsx';
import { SkeletonCard, ErrorState, EmptyState, Spinner } from '../../components/LoadingState.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { isPartyAdmin } from '../../auth/roleHome.js';

const bn = (n) => Number(n || 0).toLocaleString('bn-BD');

/**
 * §8 — the Tenant Admin's FINAL pick for a seat. Confirming re-points every
 * other candidate's canvassing data + team to the selected campaign, so all
 * field intelligence ends up behind one campaign.
 */
function SelectFinalModal({ constituencyId, constituencyName, candidates, statOf, currentId, onClose, onDone }) {
    const [choice, setChoice] = useState(currentId || null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    async function submit() {
        if (!choice) return;
        setBusy(true); setError(null);
        try {
            const r = await selectionApi.select({ constituency_id: constituencyId, candidate_user_id: choice });
            onDone(r);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
            setBusy(false);
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto">
                <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="font-semibold text-gray-800">
                        <i className="fas fa-flag-checkered mr-2 text-brand" />{constituencyName} — চূড়ান্ত candidate
                    </h3>
                    <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times" /></button>
                </div>
                <div className="p-5 space-y-3">
                    {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-2">{error}</div>}
                    <div className="space-y-2">
                        {candidates.map((c) => {
                            const s = statOf[c.user_id] || {};
                            const active = String(choice) === String(c.user_id);
                            return (
                                <button
                                    key={c.user_id}
                                    type="button"
                                    onClick={() => setChoice(c.user_id)}
                                    className={`w-full text-left border rounded-lg px-4 py-3 flex items-center gap-3 transition-colors ${
                                        active ? 'border-brand bg-brand/5' : 'border-gray-200 hover:border-brand/40'
                                    }`}
                                >
                                    <i className={`fas ${active ? 'fa-circle-check text-brand' : 'fa-circle text-gray-200'}`} />
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-gray-900">
                                            {c.name}
                                            {String(currentId) === String(c.user_id) && (
                                                <span className="text-[10px] bg-brand/10 text-brand px-1.5 py-0.5 rounded-full ml-2">বর্তমান পছন্দ</span>
                                            )}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-0.5 bn">
                                            জরিপ {bn(s.total)} · শক্তিশালী সমর্থন {bn(s.strong_support)} · ভোটার {bn(s.unique_voters)}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2.5">
                        <i className="fas fa-triangle-exclamation mr-1.5" />
                        নিশ্চিত করলে এই আসনের অন্য candidate-দের সব জরিপ ও টিম (campaign admin,
                        sub-admin, volunteer) নির্বাচিত candidate-এর ক্যাম্পেইনে চলে যাবে —
                        পুরো আসনের field intelligence এক ক্যাম্পেইনের পেছনে জমা হবে।
                    </p>
                </div>
                <div className="border-t border-gray-100 px-5 py-3 flex justify-end gap-2">
                    <button type="button" className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-gray-50" onClick={onClose}>বাতিল</button>
                    <button
                        type="button"
                        className="inline-flex items-center gap-2 bg-brand text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-brand/90 disabled:opacity-50"
                        disabled={busy || !choice || String(choice) === String(currentId)}
                        onClick={submit}
                    >
                        {busy ? <Spinner size="sm" /> : <i className="fas fa-flag-checkered" />} চূড়ান্ত করুন
                    </button>
                </div>
            </div>
        </div>
    );
}

// Political Admin (tenant_admin) landing: his party at a glance. Every
// candidate row carries that candidate's own survey numbers and drills into
// the candidate page (team hierarchy + surveys). Everything here is
// party-isolated server-side.
export default function PartyHomePage() {
    const { user } = useAuth();
    const [users, setUsers] = useState(null);
    const [stats, setStats] = useState(null); // per-candidate survey aggregates
    const [selections, setSelections] = useState([]); // §8 final picks per seat
    const [selecting, setSelecting] = useState(null); // constituency being decided
    const [error, setError] = useState(null);

    const parties = (user?.parties || []).filter((p) => p.role === 'tenant_admin');
    const party = parties[0] || null;

    const reload = useCallback(() => {
        Promise.all([
            mgmt.listUsers(),
            canvassingApi.partyStats(),
            selectionApi.list().catch(() => ({ selections: [] })),
        ])
            .then(([u, s, sel]) => {
                setUsers(u.users || []);
                setStats(s.stats || []);
                setSelections(sel.selections || []);
                setError(null);
            })
            .catch(setError);
    }, []);

    useEffect(() => {
        if (party) reload();
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
        const key = c.candidate_id || '—';
        (byConstituency[key] ||= { name: c.constituency_name || key, list: [] }).list.push(c);
    }
    // §8: the final pick per seat, if made.
    const selectedOf = {};
    for (const s of selections) selectedOf[s.candidate_id] = s;

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
                    {Object.entries(byConstituency).map(([cid, group]) => {
                        const sel = selectedOf[cid];
                        return (
                        <section key={cid} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap">
                                <h3 className="font-semibold text-gray-800 text-sm">
                                    <i className="fas fa-map-location-dot text-brand mr-2" />{group.name}
                                </h3>
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full bn">
                                        {bn(group.list.length)} জন candidate
                                    </span>
                                    {/* §8: pick / change the party's final candidate for this seat */}
                                    {group.list.length > 1 || sel ? (
                                        <button
                                            className="text-[11px] border border-brand/40 text-brand px-2 py-0.5 rounded-full hover:bg-brand/5"
                                            onClick={() => setSelecting({ id: cid, name: group.name })}
                                        >
                                            <i className="fas fa-flag-checkered mr-1" />
                                            {sel ? 'চূড়ান্ত পছন্দ পরিবর্তন' : 'চূড়ান্ত candidate নির্বাচন'}
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                            <ul className="divide-y divide-gray-100">
                                {group.list.map((c) => {
                                    const s = statOf[c.user_id] || {};
                                    const team = teamOf[c.user_id] || 0;
                                    const isFinal = sel && String(sel.selected_user_id) === String(c.user_id);
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
                                                        {isFinal && (
                                                            <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full ml-2 whitespace-nowrap">
                                                                <i className="fas fa-flag-checkered mr-1" />দলের চূড়ান্ত
                                                            </span>
                                                        )}
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
                        );
                    })}
                </div>
            )}

            {selecting && (
                <SelectFinalModal
                    constituencyId={selecting.id}
                    constituencyName={selecting.name}
                    candidates={(byConstituency[selecting.id] || { list: [] }).list}
                    statOf={statOf}
                    currentId={selectedOf[selecting.id]?.selected_user_id || null}
                    onClose={() => setSelecting(null)}
                    onDone={(r) => {
                        setSelecting(null);
                        reload();
                        const m = r?.moved || {};
                        alert(`চূড়ান্ত নির্বাচন সম্পন্ন — ${m.canvasses || 0}টি জরিপ, ${m.team_members || 0} জন টিম সদস্য নির্বাচিত ক্যাম্পেইনে স্থানান্তরিত হয়েছে।`);
                    }}
                />
            )}
        </>
    );
}
