import { useEffect, useState, useCallback } from 'react';
import * as mgmt from '../../api/management.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import SharedMultiSelect from '../../components/MultiSelect.jsx';
import PasswordInput from '../../components/PasswordInput.jsx';
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
    // "Existing volunteer" attach mode — the SAME person can canvass for
    // several candidates; attaching adds a grant under THIS campaign.
    const [attachExisting, setAttachExisting] = useState(false);
    const [userSearch, setUserSearch]         = useState('');
    const [userResults, setUserResults]       = useState([]);
    const [selectedUser, setSelectedUser]     = useState(null);
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const isPartyRole = PARTY_ROLES.includes(form.role);
    const needsWard = form.role === 'sub_admin' || form.role === 'volunteer';
    const needsArea = form.role === 'volunteer';
    const isVolunteer = form.role === 'volunteer';
    const useExisting = isVolunteer && attachExisting;
    const superPicksCampaign = ctx.role === 'super_admin' && form.role !== 'candidate' && !isPartyRole;

    // Debounced volunteer search for the attach picker.
    useEffect(() => {
        if (!useExisting || userSearch.trim().length < 2) { setUserResults([]); return; }
        const t = setTimeout(() => {
            import('../../api/people.js').then((people) =>
                people.searchUsers(userSearch.trim())
                    .then((r) => setUserResults((r.users || []).filter((u) => u.role === 'volunteer')))
                    .catch(() => setUserResults([])));
        }, 300);
        return () => clearTimeout(t);
    }, [userSearch, useExisting]);

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
        if (useExisting && !selectedUser) { setError('একজন volunteer নির্বাচন করুন'); return; }
        setBusy(true); setError(null);
        try {
            await mgmt.createUser({
                role: form.role,
                user_id: useExisting ? selectedUser.user_id : undefined,
                name: useExisting ? undefined : form.name,
                username: useExisting ? undefined : form.username,
                password: useExisting ? undefined : form.password,
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

                    {isVolunteer && (
                        <div className="flex rounded-md border border-gray-200 overflow-hidden text-sm">
                            <button type="button"
                                    className={`flex-1 px-3 py-2 ${!attachExisting ? 'bg-brand text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                    onClick={() => { setAttachExisting(false); setSelectedUser(null); }}>
                                <i className="fas fa-user-plus mr-1.5" />নতুন volunteer
                            </button>
                            <button type="button"
                                    className={`flex-1 px-3 py-2 ${attachExisting ? 'bg-brand text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                    onClick={() => setAttachExisting(true)}>
                                <i className="fas fa-user-check mr-1.5" />Existing volunteer
                            </button>
                        </div>
                    )}

                    {useExisting ? (
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Volunteer খুঁজুন (নাম / username) *</label>
                            {selectedUser ? (
                                <div className="flex items-center justify-between border border-brand/40 bg-brand/5 rounded-md px-3 py-2 text-sm">
                                    <span><span className="font-medium">{selectedUser.name}</span> <span className="text-gray-500">@{selectedUser.username}</span></span>
                                    <button type="button" className="text-gray-400 hover:text-red-500" onClick={() => setSelectedUser(null)}>
                                        <i className="fas fa-times" />
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <input className={INPUT} value={userSearch} onChange={(e) => setUserSearch(e.target.value)}
                                           placeholder="কমপক্ষে ২ অক্ষর লিখুন" />
                                    {userResults.length > 0 && (
                                        <div className="mt-1 border border-gray-200 rounded-md divide-y max-h-40 overflow-y-auto">
                                            {userResults.map((u) => (
                                                <button key={u.user_id} type="button"
                                                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                                        onClick={() => { setSelectedUser(u); setUserResults([]); }}>
                                                    <span className="font-medium">{u.name}</span>{' '}
                                                    <span className="text-gray-500">@{u.username}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                            <p className="text-[11px] text-gray-400 mt-1">
                                একই volunteer একাধিক candidate-এর হয়ে কাজ করতে পারেন — এখানে যুক্ত করলে
                                আপনার campaign-এর অধীনে নতুন assignment তৈরি হবে; অন্য candidate-এর data আলাদাই থাকবে।
                            </p>
                        </div>
                    ) : (
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
                                <PasswordInput className={INPUT} required value={form.password} onChange={set('password')} autoComplete="new-password" />
                            </div>
                        </div>
                    )}

                    {isPartyRole ? (
                        <>
                            {/* A Political Admin's own party is implied server-side —
                                only the super admin picks/creates the party by name. */}
                            {ctx.role === 'super_admin' && (
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
                            )}
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
                    {u.granted_by_name && (
                        <Row label="যোগ করেছেন" value={`${u.granted_by_name}${ROLE_LABEL[u.granted_by_role] ? ` (${ROLE_LABEL[u.granted_by_role]})` : ''}`} />
                    )}
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
                            <PasswordInput className={INPUT} value={form.password} onChange={set('password')} autoComplete="new-password" />
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

// ── Hierarchy grouping ────────────────────────────────────────────────────────
// The flat grant list becomes a PARTY → CAMPAIGN → team tree:
//   party section (its Political Admins / Donors, then its campaigns)
//     campaign card (headed by the candidate)
//       Campaign Admins → Sub-admins (each with the volunteers THEY assigned,
//       via granted_by) → remaining volunteers.
// Campaigns whose party is unknown to the caller (e.g. a campaign admin who
// can't see the candidate row) render as top-level cards; rows without any
// campaign get their own section. A volunteer serving two candidates appears
// once under EACH campaign.
function buildHierarchy(users) {
    const partyLevelRows = users.filter((u) => u.party_id && !u.candidate_id);
    const campaignRows   = users.filter((u) => !(u.party_id && !u.candidate_id));

    const groups = new Map(); // pcId → campaign tree
    const orphans = [];
    for (const u of campaignRows) {
        const pcId = u.political_candidate_id ? String(u.political_candidate_id) : null;
        if (!pcId) { orphans.push(u); continue; }
        if (!groups.has(pcId)) {
            groups.set(pcId, {
                pcId, candidate: null, admins: [], subs: [], vols: [],
                name: null, constituency: null, partyId: null, partyName: null,
            });
        }
        const g = groups.get(pcId);
        g.name ||= u.political_candidate_name;
        g.constituency ||= u.constituency_name;
        if (u.role === 'candidate' && String(u.user_id) === pcId) {
            g.candidate = u;
            g.name = u.name;
            g.partyId = u.party_id || null;
            g.partyName = u.party_name || null;
        } else if (u.role === 'admin') g.admins.push(u);
        else if (u.role === 'sub_admin') g.subs.push(u);
        else g.vols.push(u);
    }
    for (const g of groups.values()) {
        const subIds = new Set(g.subs.map((s) => String(s.user_id)));
        g.volsBySub = {};
        g.looseVols = [];
        for (const v of g.vols) {
            if (v.granted_by && subIds.has(String(v.granted_by))) {
                (g.volsBySub[String(v.granted_by)] ||= []).push(v);
            } else {
                g.looseVols.push(v);
            }
        }
        g.count = (g.candidate ? 1 : 0) + g.admins.length + g.subs.length + g.vols.length;
    }
    const allCampaigns = [...groups.values()].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    // Bucket by party.
    const parties = new Map();
    const ensureParty = (id, name) => {
        if (!parties.has(id)) parties.set(id, { id, name: name || id, partyRows: [], campaigns: [] });
        return parties.get(id);
    };
    for (const u of partyLevelRows) ensureParty(u.party_id, u.party_name).partyRows.push(u);
    const looseCampaigns = [];
    for (const g of allCampaigns) {
        if (g.partyId) ensureParty(g.partyId, g.partyName).campaigns.push(g);
        else looseCampaigns.push(g);
    }
    const partyList = [...parties.values()].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    for (const p of partyList) {
        p.count = p.partyRows.length + p.campaigns.reduce((n, g) => n + g.count, 0);
    }
    return { parties: partyList, looseCampaigns, orphans };
}

function UserRow({ u, depth = 0, note, onView, onEdit, onDelete }) {
    return (
        <div
            className={`flex items-center gap-3 px-4 py-2.5 ${depth === 2 ? 'bg-gray-50/60' : ''}`}
            style={depth ? { paddingLeft: `${1 + depth * 1.5}rem` } : undefined}
        >
            {depth === 2 && <i className="fas fa-arrow-turn-up fa-rotate-90 text-gray-300 text-xs flex-shrink-0" aria-hidden="true" />}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{u.name}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${ROLE_BADGE[u.role] || 'bg-gray-100 text-gray-600'}`}>
                        {ROLE_LABEL[u.role] || u.role}
                    </span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                    @{u.username}
                    {u.party_name && !u.candidate_id ? ` · ${u.party_name} (দল)` : ''}
                    {u.allowed_wards?.length ? <span className="bn"> · ওয়ার্ড {u.allowed_wards.join(', ')}</span> : null}
                    {u.allowed_voter_areas?.length ? <span className="bn"> · {u.allowed_voter_areas.length} area</span> : null}
                    {note ? <span className="text-gray-400"> · {note}</span> : null}
                </div>
            </div>
            <button
                className="text-xs border border-gray-200 text-gray-600 px-2 py-1.5 rounded-md hover:bg-gray-50 flex-shrink-0"
                onClick={() => onView(u)}
                title="View details"
            >
                <i className="fas fa-eye" />
            </button>
            {onEdit && (
                <button
                    className="text-xs border border-brand/30 text-brand px-2 py-1.5 rounded-md hover:bg-brand/5 flex-shrink-0"
                    onClick={() => onEdit(u)}
                    title="Edit"
                >
                    <i className="fas fa-pen" />
                </button>
            )}
            {onDelete && (
                <button
                    className="text-xs border border-red-200 text-red-600 px-2 py-1.5 rounded-md hover:bg-red-50 flex-shrink-0"
                    onClick={() => onDelete(u)}
                    title="Delete"
                >
                    <i className="fas fa-trash" />
                </button>
            )}
        </div>
    );
}

const ACTION_BTNS = [
    { icon: 'fa-eye',   cls: 'border-gray-200 text-gray-600 hover:bg-gray-50', title: 'View details', key: 'onView' },
    { icon: 'fa-pen',   cls: 'border-brand/30 text-brand hover:bg-brand/5',    title: 'Edit',         key: 'onEdit' },
    { icon: 'fa-trash', cls: 'border-red-200 text-red-600 hover:bg-red-50',    title: 'Delete',       key: 'onDelete' },
];

function RowActions({ u, actions }) {
    return ACTION_BTNS.map((b) => (
        <button
            key={b.icon}
            className={`text-xs border px-2 py-1.5 rounded-md flex-shrink-0 ${b.cls}`}
            onClick={() => actions[b.key](u)}
            title={b.title}
        >
            <i className={`fas ${b.icon}`} />
        </button>
    ));
}

/**
 * One candidate's campaign as a collapsible card. The HEADER is the candidate
 * (with their actions) — no duplicate row inside; the body is the team tree.
 */
function CampaignCard({ g, expanded, onToggle, actions }) {
    const key = (u) => `${u.user_id}-${u.candidate_id || u.party_id}-${u.political_candidate_id || ''}-${u.role}`;
    const bits = [
        g.admins.length && `${g.admins.length} admin`,
        g.subs.length && `${g.subs.length} sub-admin`,
        g.vols.length && `${g.vols.length} volunteer`,
    ].filter(Boolean).join(' · ');
    const teamCount = g.admins.length + g.subs.length + g.vols.length;

    return (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
            <div
                className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-purple-50/40 transition-colors ${expanded && teamCount ? 'border-b border-gray-100' : ''}`}
                onClick={onToggle}
                role="button"
                aria-expanded={expanded}
            >
                <i className={`fas fa-chevron-${expanded ? 'down' : 'right'} text-gray-300 text-xs w-3 flex-shrink-0`} />
                <div className="h-9 w-9 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-semibold flex-shrink-0">
                    {(g.name || '?').charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900">{g.name || 'Campaign'}</span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700">Candidate</span>
                        {g.constituency && <span className="text-xs text-gray-400">{g.constituency}</span>}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                        {g.candidate ? `@${g.candidate.username} · ` : ''}
                        {teamCount ? `টিম: ${bits}` : 'এখনো টিম নেই'}
                    </div>
                </div>
                {g.candidate && (
                    <div className="flex gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        <RowActions u={g.candidate} actions={actions} />
                    </div>
                )}
            </div>
            {expanded && teamCount > 0 && (
                <div className="divide-y divide-gray-100">
                    {g.admins.map((a) => <UserRow key={key(a)} u={a} depth={1} {...actions} />)}
                    {g.subs.map((s) => (
                        <div key={key(s)} className="divide-y divide-gray-50">
                            <UserRow u={s} depth={1} {...actions} />
                            {(g.volsBySub[String(s.user_id)] || []).map((v) => (
                                <UserRow key={key(v)} u={v} depth={2} note={`যোগ করেছেন ${s.name}`} {...actions} />
                            ))}
                        </div>
                    ))}
                    {g.looseVols.map((v) => (
                        <UserRow key={key(v)} u={v} depth={1}
                                 note={v.granted_by_name ? `যোগ করেছেন ${v.granted_by_name}` : null}
                                 {...actions} />
                    ))}
                </div>
            )}
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
    const [q, setQ] = useState('');                     // name/username filter
    const [openCampaigns, setOpenCampaigns] = useState(null); // Set of pcIds; null = defaults

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

    const canManage = user?.is_super_admin
        || ['tenant_admin', 'candidate', 'admin', 'sub_admin'].includes(user?.role)
        || (user?.parties || []).some((p) => p.role === 'tenant_admin');
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
            ) : (() => {
                // Search narrows the tree to matching people (groups shrink with it).
                const needle = q.trim().toLowerCase();
                const visible = needle
                    ? users.filter((u) =>
                        (u.name || '').toLowerCase().includes(needle)
                        || (u.username || '').toLowerCase().includes(needle))
                    : users;
                const { parties, looseCampaigns, orphans } = buildHierarchy(visible);
                const rowActions = { onView: setViewTarget, onEdit: setEditTarget, onDelete: handleDelete };
                const key = (u) => `${u.user_id}-${u.candidate_id || u.party_id}-${u.political_candidate_id || ''}-${u.role}`;

                const totalCampaigns = parties.reduce((n, p) => n + p.campaigns.length, 0) + looseCampaigns.length;
                // Few campaigns → all open; many → collapsed until clicked. A
                // search always opens everything it matched.
                const isOpen = (pcId) => !!needle
                    || (openCampaigns ? openCampaigns.has(pcId) : totalCampaigns <= 2);
                const toggle = (pcId) => setOpenCampaigns((prev) => {
                    const next = new Set(prev
                        ?? (totalCampaigns <= 2
                            ? [...parties.flatMap((p) => p.campaigns), ...looseCampaigns].map((g) => g.pcId)
                            : []));
                    if (next.has(pcId)) next.delete(pcId); else next.add(pcId);
                    return next;
                });
                const campaignCard = (g) => (
                    <CampaignCard key={g.pcId} g={g} expanded={isOpen(g.pcId)}
                                  onToggle={() => toggle(g.pcId)} actions={rowActions} />
                );

                return (
                    <div className="space-y-4">
                        {/* Find anyone fast — the tree filters as you type */}
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="relative flex-1 min-w-56 max-w-xs">
                                <i className="fas fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 text-xs" />
                                <input
                                    className="w-full border border-gray-300 rounded-md pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand"
                                    placeholder="নাম বা username খুঁজুন…"
                                    value={q}
                                    onChange={(e) => setQ(e.target.value)}
                                />
                            </div>
                            <span className="text-sm text-gray-500 bn">
                                {needle ? `${visible.length} জন পাওয়া গেছে` : `মোট ${users.length} জন`}
                            </span>
                        </div>

                        {needle && visible.length === 0 && (
                            <EmptyState icon="fa-magnifying-glass" label="এই খোঁজে কেউ পাওয়া যায়নি" />
                        )}

                        {parties.map((party) => (
                            <section key={party.id} className="border border-gray-200 rounded-xl overflow-hidden">
                                {/* Party header — the top of the whole tree */}
                                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-3">
                                    <h2 className="font-semibold text-gray-900 truncate">
                                        <i className="fas fa-flag text-rose-500 mr-2" />{party.name}
                                    </h2>
                                    <span className="text-[11px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full whitespace-nowrap bn">
                                        {party.count} জন
                                    </span>
                                </div>
                                <div className="p-3 space-y-3 bg-gray-50/50">
                                    {party.partyRows.length > 0 && (
                                        <div className="border border-gray-200 rounded-lg bg-white divide-y divide-gray-100">
                                            {party.partyRows.map((u) => {
                                                // A candidate sees ALL of his party's donors but manages
                                                // only the ones HE added — others are view-only here.
                                                const viewOnly = user?.role === 'candidate' && !user?.is_super_admin
                                                    && String(u.granted_by || '') !== String(user?.user_id || '');
                                                return (
                                                    <UserRow key={key(u)} u={u}
                                                             note={u.granted_by_name ? `যোগ করেছেন ${u.granted_by_name}` : null}
                                                             onView={rowActions.onView}
                                                             onEdit={viewOnly ? null : rowActions.onEdit}
                                                             onDelete={viewOnly ? null : rowActions.onDelete} />
                                                );
                                            })}
                                        </div>
                                    )}
                                    {party.campaigns.map(campaignCard)}
                                </div>
                            </section>
                        ))}

                        {looseCampaigns.length > 0 && (
                            <div className="space-y-3">
                                {looseCampaigns.map(campaignCard)}
                            </div>
                        )}

                        {orphans.length > 0 && (
                            <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                                    <h2 className="text-sm font-semibold text-gray-800">
                                        <i className="fas fa-users text-gray-400 mr-2" />কোনো campaign-এ যুক্ত নয়
                                    </h2>
                                </div>
                                <div className="divide-y divide-gray-100">
                                    {orphans.map((u) => <UserRow key={key(u)} u={u} {...rowActions} />)}
                                </div>
                            </section>
                        )}
                    </div>
                );
            })()}

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
