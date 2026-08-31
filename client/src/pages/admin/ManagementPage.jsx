import { useEffect, useState, useCallback } from 'react';
import * as mgmt from '../../api/management.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import SharedMultiSelect from '../../components/MultiSelect.jsx';
import { SkeletonList, Skeleton, ErrorState, EmptyState, Spinner } from '../../components/LoadingState.jsx';

const INPUT = 'w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand';
const BTN_PRIMARY = 'inline-flex items-center gap-2 bg-brand text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-brand/90 disabled:opacity-50';
const BTN_SECONDARY = 'inline-flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-gray-50';

const ROLE_LABEL = {
    tenant_admin: 'Political Admin', candidate: 'Candidate', admin: 'Campaign Admin',
    sub_admin: 'Sub-admin', volunteer: 'Volunteer', donor: 'Donor',
};
const ROLE_BADGE = {
    tenant_admin: 'bg-rose-100 text-rose-700',
    candidate:    'bg-purple-100 text-purple-700',
    admin:        'bg-blue-100 text-blue-700',
    sub_admin:    'bg-amber-100 text-amber-700',
    volunteer:    'bg-green-100 text-green-700',
    donor:        'bg-teal-100 text-teal-700',
};
// Party-level roles: no constituency / ward / campaign assignment.
const PARTY_ROLES = ['tenant_admin', 'donor'];

// Labeled wrapper around the shared MultiSelect. Accepts string options or
// { value, label } objects.
function MultiSelect({ label, options, value, onChange, loading, placeholder, disabled }) {
    const opts = (options || []).map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
    return (
        <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
            <SharedMultiSelect
                options={opts} value={value} onChange={onChange}
                loading={loading} placeholder={placeholder} disabled={disabled} bn
            />
        </div>
    );
}

// ── Create-user modal ───────────────────────────────────────────────────────────
function CreateUserModal({ ctx, onClose, onCreated }) {
    const [form, setForm] = useState({
        role: ctx.creatable_roles[0] || 'volunteer',
        name: '', username: '', password: '', email: '', phone: '',
        political_candidate_id: '', party_name: '',
    });
    const [constituencies, setConstituencies] = useState(
        ctx.constituencies[0]?.candidate_id ? [ctx.constituencies[0].candidate_id] : []
    );
    const [wardOpts, setWardOpts]   = useState([]);
    const [areaOpts, setAreaOpts]   = useState([]);
    const [wards, setWards]         = useState([]);
    const [areas, setAreas]         = useState([]);
    const [candidates, setCandidates] = useState([]); // political candidates (for super-admin picking the campaign)
    const [loadingW, setLoadingW]   = useState(false);
    const [loadingA, setLoadingA]   = useState(false);
    const [busy, setBusy]           = useState(false);
    const [error, setError]         = useState(null);
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const isPartyRole = PARTY_ROLES.includes(form.role);
    const needsWard = form.role === 'sub_admin' || form.role === 'volunteer';
    const needsArea = form.role === 'volunteer';
    const superPicksCampaign = ctx.role === 'super_admin' && form.role !== 'candidate' && !isPartyRole;

    const constituencyOpts = ctx.constituencies.map((c) => ({ value: c.candidate_id, label: `${c.name} — ${c.constituency}` }));

    // Load wards across ALL selected constituencies (union) for sub_admin/volunteer.
    useEffect(() => {
        if (!needsWard || constituencies.length === 0) { setWardOpts([]); return; }
        let cancelled = false;
        setLoadingW(true);
        Promise.all(constituencies.map((cid) => mgmt.wards(cid).then((r) => r.wards || []).catch(() => [])))
            .then((lists) => { if (!cancelled) setWardOpts([...new Set(lists.flat())]); })
            .finally(() => { if (!cancelled) setLoadingW(false); });
        return () => { cancelled = true; };
    }, [JSON.stringify(constituencies), needsWard]);

    // Load voter areas across the selected constituencies + wards (for volunteer).
    useEffect(() => {
        if (!needsArea || constituencies.length === 0 || wards.length === 0) { setAreaOpts([]); return; }
        let cancelled = false;
        setLoadingA(true);
        Promise.all(constituencies.map((cid) => mgmt.voterAreas(cid, wards).then((r) => r.voter_areas || []).catch(() => [])))
            .then((lists) => { if (!cancelled) setAreaOpts([...new Set(lists.flat())]); })
            .finally(() => { if (!cancelled) setLoadingA(false); });
        return () => { cancelled = true; };
    }, [JSON.stringify(constituencies), JSON.stringify(wards), needsArea]);

    // Super-admin needs to pick which campaign (political candidate) a non-candidate belongs to.
    useEffect(() => {
        if (!superPicksCampaign) return;
        import('../../api/people.js').then((people) =>
            people.listCandidates().then((r) => setCandidates(r.candidates || [])).catch(() => {}));
    }, [superPicksCampaign]);

    async function submit(e) {
        e.preventDefault();
        setBusy(true); setError(null);
        try {
            await mgmt.createUser({
                role: form.role,
                name: form.name, username: form.username, password: form.password,
                email: form.email || undefined, phone: form.phone || undefined,
                constituency_ids: isPartyRole ? undefined : constituencies,
                party_name: isPartyRole ? (form.party_name.trim() || undefined) : undefined,
                political_candidate_id: superPicksCampaign ? (form.political_candidate_id || undefined) : undefined,
                wards: needsWard ? wards : undefined,
                voter_areas: needsArea ? areas : undefined,
            });
            onCreated();
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally { setBusy(false); }
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <form className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto" onSubmit={submit}>
                <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white">
                    <h3 className="font-semibold text-gray-800">নতুন User তৈরি করুন</h3>
                    <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times" /></button>
                </div>
                <div className="p-5 space-y-3">
                    {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-2">{error}</div>}

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Role *</label>
                        <select className={INPUT} value={form.role} onChange={set('role')}>
                            {ctx.creatable_roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>)}
                        </select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">পূর্ণ নাম *</label>
                            <input className={INPUT} required value={form.name} onChange={set('name')} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                            <input className={INPUT} value={form.phone} onChange={set('phone')} placeholder="+88017..." />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Username *</label>
                            <input className={INPUT} required value={form.username} onChange={set('username')} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Password *</label>
                            <input className={INPUT} required type="password" value={form.password} onChange={set('password')} />
                        </div>
                    </div>

                    {isPartyRole ? (
                        <>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                    রাজনৈতিক দলের নাম (Political party name){form.role === 'tenant_admin' ? ' *' : ''}
                                </label>
                                <input
                                    className={INPUT}
                                    required={form.role === 'tenant_admin'}
                                    value={form.party_name}
                                    onChange={set('party_name')}
                                    placeholder="যেমন: Centrist Nation"
                                />
                                <p className="text-[11px] text-gray-400 mt-1">
                                    দল আগে থেকে থাকলে সেটিতেই যুক্ত হবে, না থাকলে নতুন দল তৈরি হবে।
                                </p>
                            </div>
                            <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded p-2">
                                {form.role === 'tenant_admin'
                                    ? 'Political Admin দল-পর্যায়ের role — কোনো constituency/ward assign লাগে না; পুরো দলের দায়িত্বে থাকবেন।'
                                    : 'Donor দল-পর্যায়ের role — কোনো constituency/ward assign লাগে না।'}
                            </p>
                        </>
                    ) : (
                        <MultiSelect
                            label="Constituency * (একাধিক নির্বাচন করা যাবে)"
                            options={constituencyOpts}
                            value={constituencies}
                            onChange={setConstituencies}
                            placeholder="Constituency নির্বাচন করুন"
                        />
                    )}

                    {superPicksCampaign && (
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Campaign (কোন candidate-এর অধীনে) *</label>
                            <select className={INPUT} value={form.political_candidate_id} onChange={set('political_candidate_id')} required>
                                <option value="">Candidate নির্বাচন করুন</option>
                                {candidates.map((c) => <option key={c.user_id} value={c.user_id}>{c.name} (@{c.username})</option>)}
                            </select>
                        </div>
                    )}

                    {needsWard && (
                        <MultiSelect label={`Ward assign করুন${form.role === 'sub_admin' ? ' *' : ''}`}
                                     options={wardOpts} value={wards} onChange={setWards} loading={loadingW} />
                    )}
                    {needsArea && (
                        <MultiSelect label="Voter area assign করুন *" options={areaOpts} value={areas}
                                     onChange={setAreas} loading={loadingA} placeholder="আগে ward নির্বাচন করুন" />
                    )}
                </div>
                <div className="border-t border-gray-100 px-5 py-3 sticky bottom-0 bg-white flex justify-end gap-2">
                    <button type="button" className={BTN_SECONDARY} onClick={onClose}>বাতিল</button>
                    <button type="submit" className={BTN_PRIMARY} disabled={busy}>
                        {busy ? <Spinner size="sm" /> : <i className="fas fa-user-plus" />} তৈরি করুন
                    </button>
                </div>
            </form>
        </div>
    );
}

// ── View-user modal (read-only details) ───────────────────────────────────────
function ViewUserModal({ user: u, onClose }) {
    const Row = ({ label, value }) => (
        <div className="flex justify-between gap-4 py-1.5 border-b border-gray-50 text-sm">
            <span className="text-gray-500">{label}</span>
            <span className="text-gray-800 text-right break-all">{value ?? '—'}</span>
        </div>
    );
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[92vh] overflow-y-auto">
                <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="font-semibold text-gray-800">
                        <i className="fas fa-user mr-2 text-brand" />{u.name}
                    </h3>
                    <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times" /></button>
                </div>
                <div className="p-5">
                    <Row label="Username" value={`@${u.username}`} />
                    <Row label="Role" value={ROLE_LABEL[u.role] || u.role} />
                    <Row label="Email" value={u.email} />
                    <Row label="Phone" value={u.phone} />
                    {u.party_name
                        ? <Row label="রাজনৈতিক দল" value={u.party_name} />
                        : <Row label="Constituency" value={u.constituency_name} />}
                    {u.role === 'volunteer' && (
                        <Row label="Campaign (candidate)" value={u.political_candidate_name} />
                    )}
                    {u.allowed_wards?.length ? <Row label="Wards" value={u.allowed_wards.join(', ')} /> : null}
                    {u.allowed_voter_areas?.length ? <Row label="Voter areas" value={`${u.allowed_voter_areas.length}টি — ${u.allowed_voter_areas.join(', ')}`} /> : null}
                    <Row label="Status" value={u.is_active === false ? 'Inactive' : 'Active'} />
                </div>
                <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
                    <button type="button" className={BTN_SECONDARY} onClick={onClose}>বন্ধ করুন</button>
                </div>
            </div>
        </div>
    );
}

// ── Edit-user modal (basic info + wards/areas for field roles) ────────────────
function EditUserModal({ user: u, onClose, onSaved }) {
    const [form, setForm] = useState({
        name: u.name || '', email: u.email || '', phone: u.phone || '', password: '',
    });
    const [wards, setWards] = useState(u.allowed_wards || []);
    const [areas, setAreas] = useState(u.allowed_voter_areas || []);
    const [wardOpts, setWardOpts] = useState([]);
    const [areaOpts, setAreaOpts] = useState([]);
    const [loadingW, setLoadingW] = useState(false);
    const [loadingA, setLoadingA] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    // Region editing only applies to constituency-bound field roles.
    const editsWards = !!u.candidate_id && (u.role === 'sub_admin' || u.role === 'volunteer');
    const editsAreas = !!u.candidate_id && u.role === 'volunteer';

    useEffect(() => {
        if (!editsWards) return;
        setLoadingW(true);
        mgmt.wards(u.candidate_id).then((r) => setWardOpts(r.wards || [])).catch(() => {})
            .finally(() => setLoadingW(false));
    }, [editsWards, u.candidate_id]);

    useEffect(() => {
        if (!editsAreas || wards.length === 0) { setAreaOpts([]); return; }
        let cancelled = false;
        setLoadingA(true);
        mgmt.voterAreas(u.candidate_id, wards)
            .then((r) => { if (!cancelled) setAreaOpts(r.voter_areas || []); })
            .catch(() => {})
            .finally(() => { if (!cancelled) setLoadingA(false); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editsAreas, u.candidate_id, JSON.stringify(wards)]);

    async function submit(e) {
        e.preventDefault();
        setBusy(true); setError(null);
        try {
            await mgmt.updateUser(u.user_id, {
                name: form.name,
                email: form.email || null,
                phone: form.phone || null,
                password: form.password || undefined,
            });
            if (editsWards) {
                await mgmt.updateRegion(u.user_id, {
                    constituency_id: u.candidate_id,
                    role: u.role,
                    wards,
                    voter_areas: editsAreas ? areas : undefined,
                    political_candidate_id: u.political_candidate_id || undefined,
                });
            }
            onSaved();
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
                        <i className="fas fa-user-pen mr-2 text-brand" />@{u.username} সম্পাদনা
                    </h3>
                    <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times" /></button>
                </div>
                <div className="p-5 space-y-3">
                    {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-2">{error}</div>}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">পূর্ণ নাম *</label>
                            <input className={INPUT} required value={form.name} onChange={set('name')} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                            <input className={INPUT} value={form.phone} onChange={set('phone')} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                            <input className={INPUT} type="email" value={form.email} onChange={set('email')} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">নতুন Password (ফাঁকা = অপরিবর্তিত)</label>
                            <input className={INPUT} type="password" value={form.password} onChange={set('password')} autoComplete="new-password" />
                        </div>
                    </div>

                    {editsWards && (
                        <MultiSelect label="Ward assign" options={wardOpts} value={wards}
                                     onChange={setWards} loading={loadingW} />
                    )}
                    {editsAreas && (
                        <MultiSelect label="Voter area assign" options={areaOpts} value={areas}
                                     onChange={setAreas} loading={loadingA} placeholder="আগে ward নির্বাচন করুন" />
                    )}
                </div>
                <div className="border-t border-gray-100 px-5 py-3 sticky bottom-0 bg-white flex justify-end gap-2">
                    <button type="button" className={BTN_SECONDARY} onClick={onClose}>বাতিল</button>
                    <button type="submit" className={BTN_PRIMARY} disabled={busy}>
                        {busy ? <Spinner size="sm" /> : <i className="fas fa-floppy-disk" />} সংরক্ষণ করুন
                    </button>
                </div>
            </form>
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ManagementPage() {
    const { user } = useAuth();
    const [ctx, setCtx]         = useState(null);
    const [users, setUsers]     = useState(null);
    const [error, setError]     = useState(null);
    const [showCreate, setShowCreate] = useState(false);
    const [viewTarget, setViewTarget] = useState(null); // user row for the view modal
    const [editTarget, setEditTarget] = useState(null); // user row for the edit modal

    const reload = useCallback(() => {
        Promise.all([mgmt.context(), mgmt.listUsers()])
            .then(([c, u]) => { setCtx(c); setUsers(u.users || []); setError(null); })
            .catch(setError);
    }, []);

    useEffect(() => { reload(); }, [reload]);

    async function handleDelete(u) {
        if (!confirm(`"${u.name}" (@${u.username}) কে ডিলিট করবেন?`)) return;
        try { await mgmt.removeUser(u.user_id); reload(); }
        catch (err) { alert(err.response?.data?.error || err.message); }
    }

    const canManage = user?.is_super_admin || ['candidate', 'admin', 'sub_admin'].includes(user?.role);
    if (!canManage) return <div className="p-8 text-red-600">আপনার user manage করার অনুমতি নেই।</div>;
    if (error) return <ErrorState error={error} onRetry={reload} />;
    if (!ctx || !users) {
        return (
            <div className="max-w-4xl mx-auto space-y-5">
                <Skeleton className="h-8 w-56" />
                <SkeletonList rows={6} lines={1} />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">Team Management</h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        আপনার অধীনস্থ user তৈরি ও এলাকা assign করুন
                    </p>
                </div>
                {ctx.creatable_roles.length > 0 && (
                    <button className={BTN_PRIMARY} onClick={() => setShowCreate(true)}>
                        <i className="fas fa-user-plus" /> নতুন User
                    </button>
                )}
            </div>

            {users.length === 0 ? (
                <EmptyState icon="fa-users" label="এখনো কোনো user নেই। উপরের বাটন থেকে যোগ করুন।" />
            ) : (
                <div className="space-y-2">
                    {users.map((u) => (
                        <div key={`${u.user_id}-${u.candidate_id || u.party_id}-${u.role}`} className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-gray-900">{u.name}</span>
                                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${ROLE_BADGE[u.role] || 'bg-gray-100 text-gray-600'}`}>
                                        {ROLE_LABEL[u.role] || u.role}
                                    </span>
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5">
                                    @{u.username} · {u.constituency_name || (u.party_name ? `${u.party_name} (দল)` : '')}
                                    {u.allowed_wards?.length ? <span className="bn"> · ওয়ার্ড {u.allowed_wards.join(', ')}</span> : null}
                                    {u.allowed_voter_areas?.length ? <span className="bn"> · {u.allowed_voter_areas.length} area</span> : null}
                                </div>
                            </div>
                            <button
                                className="text-xs border border-gray-200 text-gray-600 px-2 py-1.5 rounded-md hover:bg-gray-50"
                                onClick={() => setViewTarget(u)}
                                title="View details"
                            >
                                <i className="fas fa-eye" />
                            </button>
                            <button
                                className="text-xs border border-brand/30 text-brand px-2 py-1.5 rounded-md hover:bg-brand/5"
                                onClick={() => setEditTarget(u)}
                                title="Edit"
                            >
                                <i className="fas fa-pen" />
                            </button>
                            <button
                                className="text-xs border border-red-200 text-red-600 px-2 py-1.5 rounded-md hover:bg-red-50"
                                onClick={() => handleDelete(u)}
                                title="Delete"
                            >
                                <i className="fas fa-trash" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {showCreate && (
                <CreateUserModal ctx={ctx} onClose={() => setShowCreate(false)}
                                 onCreated={() => { setShowCreate(false); reload(); }} />
            )}
            {viewTarget && (
                <ViewUserModal user={viewTarget} onClose={() => setViewTarget(null)} />
            )}
            {editTarget && (
                <EditUserModal user={editTarget} onClose={() => setEditTarget(null)}
                               onSaved={() => { setEditTarget(null); reload(); }} />
            )}
        </div>
    );
}
