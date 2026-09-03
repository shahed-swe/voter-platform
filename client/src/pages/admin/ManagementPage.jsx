import { useEffect, useMemo, useState, useCallback } from 'react';
import * as mgmt from '../../api/management.js';
import * as selectionApi from '../../api/selection.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import SharedMultiSelect from '../../components/MultiSelect.jsx';
import PasswordInput from '../../components/PasswordInput.jsx';
import { Skeleton, SkeletonList, ErrorState, EmptyState, Spinner } from '../../components/LoadingState.jsx';

const INPUT = 'w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand';
const BTN_PRIMARY = 'inline-flex items-center gap-2 bg-brand text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-brand/90 disabled:opacity-50';
const BTN_SECONDARY = 'inline-flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-gray-50';

const bn = (n) => Number(n || 0).toLocaleString('bn-BD');

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
// Hierarchy order — used for the default sort and the role filter's option order.
const ROLE_ORDER = { tenant_admin: 0, candidate: 1, admin: 2, sub_admin: 3, volunteer: 4, donor: 5 };
// Party-level roles: no constituency / ward / campaign assignment.
const PARTY_ROLES = ['tenant_admin', 'donor'];

function RoleBadge({ role }) {
    return (
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${ROLE_BADGE[role] || 'bg-gray-100 text-gray-600'}`}>
            {ROLE_LABEL[role] || role}
        </span>
    );
}

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

// ── Party-name combobox ───────────────────────────────────────────────────────
// Free-text input with suggestions from the existing parties: picking one
// avoids a typo silently creating a duplicate party; typing a fresh name still
// creates a brand-new party (find-or-create happens server-side by name).
function PartyNameCombobox({ value, onChange, parties, required }) {
    const [open, setOpen] = useState(false);
    const needle = value.trim().toLowerCase();
    const matches = (parties || []).filter((p) => !needle || p.name.toLowerCase().includes(needle));
    const exact = (parties || []).some((p) => p.name.toLowerCase() === needle);

    return (
        <div className="relative">
            <input
                className={INPUT}
                required={required}
                value={value}
                onChange={(e) => { onChange(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                placeholder="দলের নাম লিখুন বা তালিকা থেকে বাছুন"
                role="combobox"
                aria-expanded={open && matches.length > 0}
                autoComplete="off"
            />
            {open && matches.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-44 overflow-y-auto divide-y divide-gray-50">
                    {matches.map((p) => (
                        <button
                            key={p.id}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-brand/5 flex items-center gap-2"
                            onMouseDown={(e) => { e.preventDefault(); onChange(p.name); setOpen(false); }}
                        >
                            <i className="fas fa-flag text-rose-400 text-xs" />
                            {p.name}
                        </button>
                    ))}
                </div>
            )}
            <p className="text-[11px] mt-1 text-gray-400">
                {needle === '' ? 'দল আগে থেকে থাকলে সেটিতেই যুক্ত হবে, না থাকলে নতুন দল তৈরি হবে।'
                    : exact ? <span className="text-green-600"><i className="fas fa-check mr-1" />বিদ্যমান দল — এটিতেই যুক্ত হবে।</span>
                    : <span className="text-amber-600"><i className="fas fa-circle-plus mr-1" />"{value.trim()}" নামে নতুন দল তৈরি হবে।</span>}
            </p>
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
                                    <PartyNameCombobox
                                        value={form.party_name}
                                        onChange={(v) => setForm((f) => ({ ...f, party_name: v }))}
                                        parties={ctx.parties || []}
                                        required={form.role === 'tenant_admin'}
                                    />
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
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

// ── User detail drawer ────────────────────────────────────────────────────────
// One grant = one row = one drawer. Shows the full picture (identity, team,
// assignment) with the actions the caller is allowed to take.
function UserDrawer({ row: u, canManage, finalPick, canSelectFinal, onSelectFinal, onEdit, onDelete, onClose }) {
    // §8 candidate selection: two-step confirm (the handover moves the other
    // candidates' surveys, donations and teams — never one accidental click).
    const [confirming, setConfirming] = useState(false);
    const [selBusy, setSelBusy] = useState(false);
    const [selError, setSelError] = useState(null);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const isCandidateRow = u.role === 'candidate' && !!u.candidate_id;
    const isFinal = isCandidateRow && finalPick
        && String(finalPick.selected_user_id) === String(u.user_id);

    async function confirmSelect() {
        setSelBusy(true); setSelError(null);
        try { await onSelectFinal(u); }
        catch (err) {
            setSelError(err.response?.data?.error || err.message);
            setSelBusy(false);
        }
    }

    const Section = ({ title, children }) => (
        <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">{title}</h4>
            <div className="space-y-1.5">{children}</div>
        </div>
    );
    const Row = ({ label, value }) => (
        value == null || value === '' ? null : (
            <div className="flex gap-3 text-sm">
                <span className="text-gray-500 min-w-[110px] flex-shrink-0">{label}</span>
                <span className="text-gray-800 break-words min-w-0">{value}</span>
            </div>
        )
    );

    const initials = (u.name || '?').split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

    return (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className="absolute inset-y-0 right-0 w-full sm:max-w-md bg-white shadow-2xl flex flex-col">
                {/* Identity header */}
                <div className="px-5 py-4 border-b border-gray-100 flex items-start gap-3">
                    <div className="h-11 w-11 rounded-full bg-brand/10 text-brand flex items-center justify-center font-semibold flex-shrink-0">
                        {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-900">{u.name}</span>
                            <RoleBadge role={u.role} />
                            {isFinal && (
                                <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                    <i className="fas fa-check mr-1" />দলের চূড়ান্ত
                                </span>
                            )}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                            @{u.username}
                            <span className={`inline-flex items-center gap-1 ${u.is_active === false ? 'text-red-600' : 'text-green-600'}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${u.is_active === false ? 'bg-red-500' : 'bg-green-500'}`} />
                                {u.is_active === false ? 'Inactive' : 'Active'}
                            </span>
                        </div>
                    </div>
                    <button
                        className="h-8 w-8 -mr-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex-shrink-0"
                        onClick={onClose}
                        aria-label="বন্ধ করুন"
                    >
                        <i className="fas fa-xmark" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                    <Section title="যোগাযোগ">
                        <Row label="Phone" value={u.phone || '—'} />
                        <Row label="Email" value={u.email || '—'} />
                    </Section>

                    <Section title="Team">
                        {u.party_name && <Row label="রাজনৈতিক দল" value={u.party_name} />}
                        {u.constituency_name && <Row label="Constituency" value={u.constituency_name} />}
                        {u.political_candidate_name && u.role !== 'candidate' && (
                            <Row label="Campaign" value={u.political_candidate_name} />
                        )}
                        {u.granted_by_name && (
                            <Row label="যোগ করেছেন"
                                 value={`${u.granted_by_name}${ROLE_LABEL[u.granted_by_role] ? ` (${ROLE_LABEL[u.granted_by_role]})` : ''}`} />
                        )}
                        {!u.party_name && !u.constituency_name && <Row label="Team" value="—" />}
                    </Section>

                    {(u.allowed_wards?.length || u.allowed_voter_areas?.length) ? (
                        <Section title="এলাকা assignment">
                            {u.allowed_wards?.length ? (
                                <div className="flex items-start gap-3 text-sm">
                                    <span className="text-gray-500 min-w-[110px] flex-shrink-0">Ward</span>
                                    <span className="flex flex-wrap gap-1">
                                        {u.allowed_wards.map((w) => (
                                            <span key={w} className="bn text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">ওয়ার্ড {w}</span>
                                        ))}
                                    </span>
                                </div>
                            ) : null}
                            {u.allowed_voter_areas?.length ? (
                                <div className="flex items-start gap-3 text-sm">
                                    <span className="text-gray-500 min-w-[110px] flex-shrink-0">Voter area</span>
                                    <span className="text-gray-800 min-w-0">
                                        {u.allowed_voter_areas.join(' · ')}
                                    </span>
                                </div>
                            ) : null}
                        </Section>
                    ) : null}

                    {/* §8: the party's FINAL candidate for this seat */}
                    {isCandidateRow && (
                        <Section title="চূড়ান্ত candidate (এই আসনে)">
                            {isFinal ? (
                                <div className="text-sm bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md p-2.5">
                                    <i className="fas fa-check-circle mr-1.5" />
                                    এই আসনে দলের <b>চূড়ান্ত candidate</b>
                                    {finalPick?.selected_at && (
                                        <span className="text-emerald-600"> — {new Date(finalPick.selected_at).toLocaleDateString('bn-BD')}</span>
                                    )}
                                </div>
                            ) : finalPick ? (
                                <p className="text-sm text-gray-600">
                                    এই আসনের চূড়ান্ত candidate: <b>{finalPick.selected_name}</b>
                                </p>
                            ) : (
                                <p className="text-sm text-gray-500">এখনো চূড়ান্ত candidate নির্বাচন হয়নি।</p>
                            )}

                            {canSelectFinal && !isFinal && (
                                confirming ? (
                                    <div className="border border-amber-200 bg-amber-50 rounded-md p-3 space-y-2">
                                        {selError && <p className="text-sm text-red-600">{selError}</p>}
                                        <p className="text-xs text-amber-800">
                                            <i className="fas fa-triangle-exclamation mr-1" />
                                            {u.name}-কে চূড়ান্ত করলে এই আসনে দলের <b>অন্য candidate-দের সব জরিপ,
                                            অনুদান ও টিম</b> (admin / sub-admin / volunteer) এই campaign-এ স্থানান্তরিত
                                            হবে। সিদ্ধান্তটি পরে বদলানো যাবে, তখন data আবার নতুন candidate-এ যাবে।
                                        </p>
                                        <div className="flex gap-2">
                                            <button
                                                className={`${BTN_PRIMARY} flex-1 justify-center`}
                                                disabled={selBusy}
                                                onClick={confirmSelect}
                                            >
                                                {selBusy ? <Spinner size="sm" /> : <i className="fas fa-check" />} নিশ্চিত করুন
                                            </button>
                                            <button className={BTN_SECONDARY} disabled={selBusy}
                                                    onClick={() => { setConfirming(false); setSelError(null); }}>
                                                বাতিল
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        className="inline-flex items-center gap-2 text-sm text-brand border border-brand/30 rounded-md px-3 py-1.5 hover:bg-brand/5"
                                        onClick={() => setConfirming(true)}
                                    >
                                        <i className="fas fa-flag-checkered" />
                                        {finalPick ? 'পরিবর্তন করে এঁকে চূড়ান্ত করুন' : 'এই আসনের চূড়ান্ত candidate করুন'}
                                    </button>
                                )
                            )}
                        </Section>
                    )}
                </div>

                {canManage && (
                    <div className="px-5 py-3 border-t border-gray-100 flex gap-2">
                        <button className={`${BTN_PRIMARY} flex-1 justify-center`} onClick={() => onEdit(u)}>
                            <i className="fas fa-pen" /> সম্পাদনা
                        </button>
                        <button
                            className="inline-flex items-center justify-center gap-2 border border-red-200 text-red-600 text-sm font-medium px-4 py-2 rounded-md hover:bg-red-50"
                            onClick={() => onDelete(u)}
                        >
                            <i className="fas fa-trash" /> ডিলিট
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────
// Structure: party tabs → toolbar (search / role filter / campaign filter) →
// sortable member table → detail drawer. One table row = one GRANT, so a
// volunteer serving two campaigns appears once per campaign — that's the truth.
export default function ManagementPage() {
    const { user } = useAuth();
    const [ctx, setCtx]         = useState(null);
    const [users, setUsers]     = useState(null);
    const [error, setError]     = useState(null);
    const [showCreate, setShowCreate] = useState(false);
    const [editTarget, setEditTarget] = useState(null);   // user row for the edit modal
    const [drawerRow, setDrawerRow]   = useState(null);   // grant row shown in the drawer
    const [q, setQ] = useState('');
    const [tab, setTab] = useState('all');                // 'all' | party_id | 'none'
    const [roleFilter, setRoleFilter] = useState('all');
    const [campaignFilter, setCampaignFilter] = useState('all'); // pcId
    const [sort, setSort] = useState({ key: 'role', dir: 'asc' });
    const [selections, setSelections] = useState([]); // §8 final picks (per seat, per party)

    const reload = useCallback(() => {
        Promise.all([mgmt.context(), mgmt.listUsers()])
            .then(([c, u]) => { setCtx(c); setUsers(u.users || []); setError(null); })
            .catch(setError);
    }, []);

    useEffect(() => { reload(); }, [reload]);

    // §8 selections: a Political Admin loads his party's picks; the Main Admin
    // loads every visible party's (the endpoint is one-party-per-call).
    const viewerIsPA = (user?.parties || []).some((p) => p.role === 'tenant_admin');
    const superPartyKey = user?.is_super_admin && users
        ? [...new Set(users.map((u) => u.party_id).filter(Boolean))].sort().join(',')
        : '';
    useEffect(() => {
        let cancelled = false;
        const load = viewerIsPA
            ? selectionApi.list().then((r) => r.selections || [])
            : superPartyKey
                ? Promise.all(superPartyKey.split(',').map((pid) =>
                    selectionApi.list({ party_id: pid }).then((r) => r.selections || []).catch(() => [])))
                    .then((lists) => lists.flat())
                : Promise.resolve([]);
        load.then((s) => { if (!cancelled) setSelections(s); }).catch(() => {});
        return () => { cancelled = true; };
    }, [viewerIsPA, superPartyKey, users]);

    const selectionOf = useMemo(() => {
        const map = {};
        for (const s of selections) map[`${s.candidate_id}|${s.party_id}`] = s;
        return map;
    }, [selections]);
    const pickFor = (u) => (u.role === 'candidate' && u.candidate_id && u.party_id)
        ? selectionOf[`${u.candidate_id}|${u.party_id}`] || null
        : null;
    const isFinalPick = (u) => {
        const s = pickFor(u);
        return !!s && String(s.selected_user_id) === String(u.user_id);
    };
    // Who may (re)select: the seat-party's own Political Admin, or the Main Admin.
    const canSelectFinal = (u) => u.role === 'candidate' && !!u.candidate_id && !!u.party_id
        && (user?.is_super_admin || (user?.parties || []).some((p) => p.role === 'tenant_admin' && p.id === u.party_id));

    async function handleSelectFinal(u) {
        await selectionApi.select({
            constituency_id: u.candidate_id,
            candidate_user_id: u.user_id,
            ...(user?.is_super_admin ? { party_id: u.party_id } : {}),
        });
        setDrawerRow(null);
        reload(); // the handover re-points teams — the whole list changes
    }

    // Party of each row: party-level rows carry it; campaign staff inherit it
    // from their campaign's candidate row.
    const enriched = useMemo(() => {
        if (!users) return null;
        const partyByPc = new Map(); // pcId → { id, name }
        for (const u of users) {
            if (u.role === 'candidate' && u.party_id && String(u.user_id) === String(u.political_candidate_id)) {
                partyByPc.set(String(u.political_candidate_id), { id: u.party_id, name: u.party_name });
            }
        }
        return users.map((u) => {
            const own = u.party_id ? { id: u.party_id, name: u.party_name } : null;
            const viaCampaign = u.political_candidate_id ? partyByPc.get(String(u.political_candidate_id)) : null;
            const party = own || viaCampaign || null;
            return { ...u, _partyId: party?.id || null, _partyName: party?.name || null };
        });
    }, [users]);

    // Party tabs, from the data the caller can actually see.
    const partyTabs = useMemo(() => {
        if (!enriched) return [];
        const map = new Map();
        let none = 0;
        for (const u of enriched) {
            if (u._partyId) {
                const t = map.get(u._partyId) || { id: u._partyId, name: u._partyName, count: 0 };
                t.count++;
                map.set(u._partyId, t);
            } else none++;
        }
        const tabs = [...map.values()].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        if (none > 0) tabs.push({ id: 'none', name: 'অন্যান্য', count: none });
        return tabs;
    }, [enriched]);

    // Campaigns inside the current tab (for the campaign filter).
    const campaignOptions = useMemo(() => {
        if (!enriched) return [];
        const map = new Map();
        for (const u of enriched) {
            if (tab !== 'all' && (tab === 'none' ? u._partyId : u._partyId !== tab)) continue;
            if (u.political_candidate_id && u.political_candidate_name) {
                map.set(String(u.political_candidate_id), u.political_candidate_name);
            }
        }
        return [...map.entries()].map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [enriched, tab]);

    // Roles present (options in hierarchy order).
    const roleOptions = useMemo(() => {
        const present = new Set((enriched || []).map((u) => u.role));
        return Object.keys(ROLE_ORDER).filter((r) => present.has(r));
    }, [enriched]);

    const visible = useMemo(() => {
        if (!enriched) return [];
        const needle = q.trim().toLowerCase();
        let rows = enriched.filter((u) => {
            if (tab === 'none' && u._partyId) return false;
            if (tab !== 'all' && tab !== 'none' && u._partyId !== tab) return false;
            if (roleFilter !== 'all' && u.role !== roleFilter) return false;
            if (campaignFilter !== 'all' && String(u.political_candidate_id || '') !== campaignFilter) return false;
            if (needle && !(u.name || '').toLowerCase().includes(needle)
                && !(u.username || '').toLowerCase().includes(needle)) return false;
            return true;
        });
        const dir = sort.dir === 'asc' ? 1 : -1;
        const teamOf = (u) => `${u._partyName || 'ঢ'}·${u.political_candidate_name || ''}·${u.constituency_name || ''}`;
        rows = [...rows].sort((a, b) => {
            let cmp = 0;
            if (sort.key === 'name') cmp = (a.name || '').localeCompare(b.name || '');
            else if (sort.key === 'role') cmp = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9);
            else if (sort.key === 'team') cmp = teamOf(a).localeCompare(teamOf(b));
            // stable tiebreak: hierarchy order, then name
            if (cmp === 0) cmp = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9);
            if (cmp === 0) cmp = (a.name || '').localeCompare(b.name || '');
            return cmp * dir;
        });
        return rows;
    }, [enriched, q, tab, roleFilter, campaignFilter, sort]);

    // Changing tab invalidates the campaign filter (it belongs to that tab).
    const pickTab = (id) => { setTab(id); setCampaignFilter('all'); };

    async function handleDelete(u) {
        if (!confirm(`"${u.name}" (@${u.username}) কে ডিলিট করবেন?`)) return;
        try {
            await mgmt.removeUser(u.user_id);
            setDrawerRow(null);
            reload();
        } catch (err) { alert(err.response?.data?.error || err.message); }
    }

    // A candidate sees ALL of his party's donors but manages only the ones HE
    // added (server enforces this too — we just hide the dead buttons).
    const canManageRow = (u) => {
        if (!u) return false;
        if (user?.role === 'candidate' && !user?.is_super_admin && u.role === 'donor') {
            return String(u.granted_by || '') === String(user?.user_id || '');
        }
        return true;
    };

    const canManage = user?.is_super_admin
        || ['tenant_admin', 'candidate', 'admin', 'sub_admin'].includes(user?.role)
        || (user?.parties || []).some((p) => p.role === 'tenant_admin');
    if (!canManage) return <div className="p-8 text-red-600">আপনার user manage করার অনুমতি নেই।</div>;
    if (error) return <ErrorState error={error} onRetry={reload} />;
    if (!ctx || !enriched) {
        return (
            <div className="max-w-5xl mx-auto space-y-5">
                <Skeleton className="h-8 w-56" />
                <Skeleton className="h-10 w-full" />
                <SkeletonList rows={8} lines={1} />
            </div>
        );
    }

    const SortHeader = ({ id, children, className = '' }) => (
        <th className={`px-4 py-2.5 text-left ${className}`}>
            <button
                type="button"
                className="inline-flex items-center gap-1.5 uppercase tracking-wider text-xs font-semibold text-gray-600 hover:text-gray-900"
                onClick={() => setSort((s) => ({ key: id, dir: s.key === id && s.dir === 'asc' ? 'desc' : 'asc' }))}
            >
                {children}
                <i className={`fas text-[10px] ${
                    sort.key === id ? (sort.dir === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down') : 'fa-arrows-up-down text-gray-300'
                }`} />
            </button>
        </th>
    );

    return (
        <div className="max-w-6xl mx-auto space-y-4">
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

            {enriched.length === 0 ? (
                <EmptyState icon="fa-users" label="এখনো কোনো user নেই। উপরের বাটন থেকে যোগ করুন।" />
            ) : (
                <>
                    {/* Party tabs — quick switching between political teams.
                        Campaign-chain viewers live inside ONE campaign; for them
                        the tabs would only split their donors from their staff,
                        so the campaign/role filters carry that job instead. */}
                    {partyTabs.length > 1
                        && (user?.is_super_admin
                            || user?.role === 'tenant_admin'
                            || (user?.parties || []).some((p) => p.role === 'tenant_admin')) && (
                        <div className="flex gap-2 overflow-x-auto pb-1 -mb-1" role="tablist" aria-label="রাজনৈতিক দল">
                            <button
                                role="tab"
                                aria-selected={tab === 'all'}
                                onClick={() => pickTab('all')}
                                className={`px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap border transition-colors ${
                                    tab === 'all' ? 'bg-brand text-white border-brand' : 'bg-white text-gray-700 border-gray-200 hover:border-brand/50'
                                }`}
                            >
                                সব দল <span className={`bn ml-1 ${tab === 'all' ? 'text-white/80' : 'text-gray-400'}`}>{bn(enriched.length)}</span>
                            </button>
                            {partyTabs.map((p) => (
                                <button
                                    key={p.id}
                                    role="tab"
                                    aria-selected={tab === p.id}
                                    onClick={() => pickTab(p.id)}
                                    className={`px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap border transition-colors ${
                                        tab === p.id ? 'bg-brand text-white border-brand' : 'bg-white text-gray-700 border-gray-200 hover:border-brand/50'
                                    }`}
                                >
                                    {p.id !== 'none' && <i className={`fas fa-flag mr-1.5 ${tab === p.id ? 'text-white/80' : 'text-rose-400'}`} />}
                                    {p.name} <span className={`bn ml-1 ${tab === p.id ? 'text-white/80' : 'text-gray-400'}`}>{bn(p.count)}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Toolbar: search + role + campaign filters */}
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative flex-1 min-w-52">
                            <i className="fas fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 text-xs" />
                            <input
                                className="w-full border border-gray-300 rounded-md pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand"
                                placeholder="নাম বা username খুঁজুন…"
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                            />
                        </div>
                        <select
                            className="border border-gray-300 rounded-md px-2.5 py-2 text-sm bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand"
                            value={roleFilter}
                            onChange={(e) => setRoleFilter(e.target.value)}
                            aria-label="Role filter"
                        >
                            <option value="all">সব role</option>
                            {roleOptions.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                        </select>
                        {campaignOptions.length > 1 && (
                            <select
                                className="border border-gray-300 rounded-md px-2.5 py-2 text-sm bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand max-w-56"
                                value={campaignFilter}
                                onChange={(e) => setCampaignFilter(e.target.value)}
                                aria-label="Campaign filter"
                            >
                                <option value="all">সব campaign</option>
                                {campaignOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        )}
                        <span className="text-sm text-gray-500 bn whitespace-nowrap">
                            {bn(visible.length)} জন
                        </span>
                    </div>

                    {/* The member table — one row per grant */}
                    {visible.length === 0 ? (
                        <EmptyState icon="fa-magnifying-glass" label="এই খোঁজ/filter-এ কেউ পাওয়া যায়নি" />
                    ) : (
                        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <SortHeader id="name">User</SortHeader>
                                        <SortHeader id="role">Role</SortHeader>
                                        <SortHeader id="team">Team</SortHeader>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 hidden lg:table-cell">এলাকা</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 hidden md:table-cell">যোগ করেছেন</th>
                                        <th className="px-4 py-2.5" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {visible.map((u) => (
                                        <tr
                                            key={`${u.user_id}-${u.candidate_id || u.party_id}-${u.political_candidate_id || ''}-${u.role}`}
                                            className="hover:bg-gray-50 cursor-pointer"
                                            onClick={() => setDrawerRow(u)}
                                            tabIndex={0}
                                            onKeyDown={(e) => { if (e.key === 'Enter') setDrawerRow(u); }}
                                        >
                                            <td className="px-4 py-2.5">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="h-8 w-8 rounded-full bg-brand/10 text-brand flex items-center justify-center text-xs font-semibold flex-shrink-0">
                                                        {(u.name || '?').charAt(0)}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="font-medium text-gray-900 flex items-center gap-1.5 flex-wrap">
                                                            {u.name}
                                                            {u.is_active === false && (
                                                                <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full">Inactive</span>
                                                            )}
                                                            {isFinalPick(u) && (
                                                                <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                                                    <i className="fas fa-check mr-0.5" />দলের চূড়ান্ত
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-gray-400">@{u.username}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2.5"><RoleBadge role={u.role} /></td>
                                            <td className="px-4 py-2.5">
                                                <div className="text-gray-800">
                                                    {u._partyName || <span className="text-gray-400">—</span>}
                                                </div>
                                                <div className="text-xs text-gray-500">
                                                    {u.role !== 'candidate' && u.political_candidate_name
                                                        ? `${u.political_candidate_name}${u.constituency_name ? ` · ${u.constituency_name}` : ''}`
                                                        : u.constituency_name || (u.party_id ? 'দল-পর্যায়ের' : '')}
                                                </div>
                                            </td>
                                            <td className="px-4 py-2.5 hidden lg:table-cell text-gray-600">
                                                {u.allowed_wards?.length
                                                    ? <span className="bn">ওয়ার্ড {u.allowed_wards.join(', ')}</span>
                                                    : null}
                                                {u.allowed_voter_areas?.length
                                                    ? <span className="bn text-xs text-gray-400"> · {bn(u.allowed_voter_areas.length)} area</span>
                                                    : null}
                                                {!u.allowed_wards?.length && !u.allowed_voter_areas?.length && <span className="text-gray-300">—</span>}
                                            </td>
                                            <td className="px-4 py-2.5 hidden md:table-cell text-gray-500">
                                                {u.granted_by_name || <span className="text-gray-300">—</span>}
                                            </td>
                                            <td className="px-4 py-2.5 text-right">
                                                <i className="fas fa-chevron-right text-gray-300 text-xs" />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}

            {showCreate && (
                <CreateUserModal ctx={ctx} onClose={() => setShowCreate(false)}
                                 onCreated={() => { setShowCreate(false); reload(); }} />
            )}
            {drawerRow && (
                <UserDrawer
                    row={drawerRow}
                    canManage={canManageRow(drawerRow)}
                    finalPick={pickFor(drawerRow)}
                    canSelectFinal={canSelectFinal(drawerRow)}
                    onSelectFinal={handleSelectFinal}
                    onEdit={(u) => setEditTarget(u)}
                    onDelete={handleDelete}
                    onClose={() => setDrawerRow(null)}
                />
            )}
            {editTarget && (
                <EditUserModal user={editTarget} onClose={() => setEditTarget(null)}
                               onSaved={() => { setEditTarget(null); setDrawerRow(null); reload(); }} />
            )}
        </div>
    );
}
