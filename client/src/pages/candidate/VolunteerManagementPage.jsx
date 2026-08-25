import { useEffect, useState, useCallback, useRef } from 'react';
import * as peopleApi from '../../api/people.js';
import * as layersApi from '../../api/layers.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { wardLabelToScope } from '../../utils/geoScope.js';
import { LoadingState, ErrorState, EmptyState, Spinner } from '../../components/LoadingState.jsx';

/**
 * Resolve the ward layer (source + label field) for the active constituency
 * from its map_config. Nav layers go constituency → ward → village → building;
 * the ward layer is index 1 of the non-overlay, non-leaf layers.
 */
function wardLayerOf(candidate) {
    const navLayers = (candidate?.map_config?.layers || []).filter(
        (l) => !l.overlay && l.click !== 'voters'
    );
    return navLayers.find((l) => l.id === 'ward') || navLayers[1] || null;
}

const INPUT = 'w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand';
const BTN_PRIMARY = 'inline-flex items-center gap-2 bg-brand text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-brand/90 disabled:opacity-50';
const BTN_SECONDARY = 'inline-flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-gray-50';

const BN = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
const toBn = (s) => String(s ?? '').replace(/[0-9]/g, (d) => BN[+d]);

// ── Ward picker ───────────────────────────────────────────────────────────────

/**
 * Multi-select dropdown of the constituency's actual wards.
 *   wardOptions — [{ value: '৫২', label: 'Ward No. 52 (88)' }] from the ward layer
 *   value       — selected ward values (Bengali digits, e.g. ['৫২'])
 *   loading     — ward options still being fetched
 */
function WardSelect({ value, onChange, label, wardOptions, loading }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, []);

    function toggle(w) {
        onChange(value.includes(w) ? value.filter((x) => x !== w) : [...value, w]);
    }
    const remove = (w) => onChange(value.filter((x) => x !== w));

    const labelFor = (w) => wardOptions.find((o) => o.value === w)?.label || `ওয়ার্ড ${w}`;

    return (
        <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
            <div className="relative" ref={ref}>
                <button
                    type="button"
                    className={INPUT + ' flex items-center justify-between text-left'}
                    onClick={() => setOpen((o) => !o)}
                    disabled={loading}
                >
                    <span className={value.length ? 'text-gray-800' : 'text-gray-400'}>
                        {loading
                            ? 'Ward লোড হচ্ছে...'
                            : value.length
                                ? `${toBn(value.length)} টি ward নির্বাচিত`
                                : 'Ward নির্বাচন করুন'}
                    </span>
                    <i className={`fas fa-chevron-${open ? 'up' : 'down'} text-xs text-gray-400`} />
                </button>

                {open && !loading && (
                    <div className="absolute z-30 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                        {wardOptions.length === 0 ? (
                            <div className="px-3 py-2 text-xs text-gray-400">এই constituency-তে কোনো ward পাওয়া যায়নি।</div>
                        ) : (
                            wardOptions.map((o) => {
                                const checked = value.includes(o.value);
                                return (
                                    <button
                                        key={o.value}
                                        type="button"
                                        className="w-full text-left px-3 py-2 hover:bg-brand/5 flex items-center gap-2 text-sm"
                                        onClick={() => toggle(o.value)}
                                    >
                                        <i className={`fas ${checked ? 'fa-check-square text-brand' : 'fa-square text-gray-300'}`} />
                                        <span className="bn">{o.label}</span>
                                    </button>
                                );
                            })
                        )}
                    </div>
                )}
            </div>

            {value.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                    {value.map((w) => (
                        <span key={w} className="flex items-center gap-1 bg-brand/10 text-brand text-xs px-2 py-1 rounded-full bn">
                            {labelFor(w)}
                            <button type="button" onClick={() => remove(w)} className="ml-0.5 hover:text-red-500">
                                <i className="fas fa-times text-[10px]" />
                            </button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── User search for existing volunteer ────────────────────────────────────────

function UserSearchPicker({ onPick }) {
    const [q, setQ]           = useState('');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        if (q.length < 2) { setResults([]); return; }
        const id = setTimeout(() => {
            setSearching(true);
            peopleApi.searchUsers(q)
                .then((r) => setResults(r.users || []))
                .catch(() => setResults([]))
                .finally(() => setSearching(false));
        }, 300);
        return () => clearTimeout(id);
    }, [q]);

    return (
        <div className="relative">
            <input
                className={INPUT}
                placeholder="নাম বা username দিয়ে খুঁজুন..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
            />
            {(results.length > 0 || searching) && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {searching && <div className="px-3 py-2 text-xs text-gray-400">খুঁজছি...</div>}
                    {results.map((u) => (
                        <button
                            key={u.user_id}
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-brand/5 flex items-center gap-2 text-sm"
                            onClick={() => { onPick(u); setQ(''); setResults([]); }}
                        >
                            <i className="fas fa-user text-gray-400" />
                            <span className="font-medium">{u.name}</span>
                            <span className="text-gray-400">@{u.username}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Add volunteer modal ───────────────────────────────────────────────────────

function AddVolunteerModal({ constituencyId, onClose, onAdded, wardOptions, wardsLoading }) {
    const [mode, setMode] = useState('new'); // 'new' | 'existing'
    const [pickedUser, setPickedUser] = useState(null);
    const [form, setForm] = useState({ name: '', username: '', password: '', email: '', phone: '' });
    const [wards, setWards] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    async function submit(e) {
        e.preventDefault();
        if (!wards.length) { setError('কমপক্ষে একটি ward দিন'); return; }
        setBusy(true); setError(null);
        try {
            const body = { constituency_id: constituencyId, wards };
            if (mode === 'existing' && pickedUser) {
                body.user_id = pickedUser.user_id;
            } else {
                Object.assign(body, form);
            }
            await peopleApi.createOrAssignVolunteer(body);
            onAdded();
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally { setBusy(false); }
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white">
                    <h3 className="font-semibold text-gray-800">Volunteer যোগ করুন</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times" /></button>
                </div>

                <form className="p-5 space-y-4" onSubmit={submit}>
                    {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-2">{error}</div>}

                    {/* Mode toggle */}
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
                        <button
                            type="button"
                            onClick={() => setMode('new')}
                            className={`flex-1 py-2 font-medium transition-colors ${mode === 'new' ? 'bg-brand text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                        >
                            <i className="fas fa-user-plus mr-1" /> নতুন User তৈরি
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode('existing')}
                            className={`flex-1 py-2 font-medium transition-colors ${mode === 'existing' ? 'bg-brand text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                        >
                            <i className="fas fa-search mr-1" /> Existing User বেছে নিন
                        </button>
                    </div>

                    {mode === 'new' ? (
                        <>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">পূর্ণ নাম *</label>
                                <input className={INPUT} required value={form.name} onChange={set('name')} />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Username *</label>
                                    <input className={INPUT} required value={form.username} onChange={set('username')} />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Password *</label>
                                    <input className={INPUT} required type="password" value={form.password} onChange={set('password')} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Phone (optional)</label>
                                <input className={INPUT} value={form.phone} onChange={set('phone')} placeholder="+88017..." />
                            </div>
                        </>
                    ) : (
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">User খুঁজুন</label>
                            {pickedUser ? (
                                <div className="flex items-center gap-2 bg-brand/5 border border-brand/20 rounded-md px-3 py-2">
                                    <i className="fas fa-user text-brand" />
                                    <span className="font-medium text-sm">{pickedUser.name}</span>
                                    <span className="text-xs text-gray-500">@{pickedUser.username}</span>
                                    <button type="button" onClick={() => setPickedUser(null)} className="ml-auto text-gray-400 hover:text-red-500">
                                        <i className="fas fa-times" />
                                    </button>
                                </div>
                            ) : (
                                <UserSearchPicker onPick={setPickedUser} />
                            )}
                        </div>
                    )}

                    {/* Ward picker */}
                    <WardSelect
                        label="Ward assign করুন (কমপক্ষে একটি) *"
                        value={wards}
                        onChange={setWards}
                        wardOptions={wardOptions}
                        loading={wardsLoading}
                    />

                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" className={BTN_SECONDARY} onClick={onClose}>বাতিল</button>
                        <button
                            type="submit"
                            className={BTN_PRIMARY}
                            disabled={busy || (mode === 'existing' && !pickedUser) || wards.length === 0}
                        >
                            {busy ? <Spinner size="sm" /> : <i className="fas fa-user-plus" />}
                            যোগ করুন
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── Edit wards modal ──────────────────────────────────────────────────────────

function EditWardsModal({ volunteer, constituencyId, onClose, onSaved, wardOptions, wardsLoading }) {
    const [wards, setWards] = useState(volunteer.allowed_wards || []);
    const [busy, setBusy]   = useState(false);
    const [error, setError] = useState(null);

    async function submit(e) {
        e.preventDefault();
        if (!wards.length) { setError('কমপক্ষে একটি ward দিন'); return; }
        setBusy(true); setError(null);
        try {
            await peopleApi.updateVolunteerWards(volunteer.user_id, { constituency_id: constituencyId, wards });
            onSaved();
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally { setBusy(false); }
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full">
                <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="font-semibold text-gray-800">{volunteer.name} — Ward সম্পাদনা</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times" /></button>
                </div>
                <form className="p-5 space-y-4" onSubmit={submit}>
                    {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-2">{error}</div>}
                    <WardSelect label="Assigned Wards" value={wards} onChange={setWards} wardOptions={wardOptions} loading={wardsLoading} />
                    <div className="flex justify-end gap-2">
                        <button type="button" className={BTN_SECONDARY} onClick={onClose}>বাতিল</button>
                        <button type="submit" className={BTN_PRIMARY} disabled={busy || !wards.length}>
                            {busy ? <Spinner size="sm" /> : <i className="fas fa-save" />} সংরক্ষণ
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function VolunteerManagementPage() {
    const { user, candidate } = useAuth();
    const [volunteers, setVolunteers] = useState(null);
    const [error, setError]           = useState(null);
    const [showAdd, setShowAdd]       = useState(false);
    const [editing, setEditing]       = useState(null);

    const [wardOptions, setWardOptions]   = useState([]);
    const [wardsLoading, setWardsLoading] = useState(false);

    const constituencyId = candidate?.candidate_id;

    const allowed = user?.is_super_admin || user?.role === 'candidate';
    if (!allowed) return <div className="p-8 text-red-600">শুধু Candidate বা Super-admin access করতে পারবেন।</div>;
    if (!constituencyId) return <div className="p-8 text-amber-600">কোনো Constituency selected নেই।</div>;

    const reload = useCallback(() => {
        setError(null);
        peopleApi.listVolunteers(constituencyId)
            .then((r) => setVolunteers(r.volunteers || []))
            .catch(setError);
    }, [constituencyId]);

    useEffect(() => { reload(); }, [reload]);

    // Load the constituency's wards for the assignment dropdown.
    useEffect(() => {
        const wardLayer = wardLayerOf(candidate);
        if (!wardLayer) { setWardOptions([]); return; }
        let cancelled = false;
        setWardsLoading(true);
        layersApi.fetchSource(wardLayer.source)
            .then((fc) => {
                if (cancelled) return;
                const seen = new Set();
                const opts = (fc.features || [])
                    .map((f) => {
                        const lbl = String(f.properties?.[wardLayer.label_from || 'name'] ?? '');
                        const ward = wardLabelToScope(lbl)?.ward;
                        return ward ? { value: ward, label: lbl } : null;
                    })
                    .filter((o) => o && !seen.has(o.value) && seen.add(o.value))
                    .sort((a, b) => a.label.localeCompare(b.label, 'bn', { numeric: true }));
                setWardOptions(opts);
            })
            .catch(() => { if (!cancelled) setWardOptions([]); })
            .finally(() => { if (!cancelled) setWardsLoading(false); });
        return () => { cancelled = true; };
    }, [constituencyId]); // eslint-disable-line react-hooks/exhaustive-deps

    async function handleRemove(v) {
        if (!confirm(`${v.name} কে remove করবেন?`)) return;
        try {
            await peopleApi.removeVolunteer(v.user_id, constituencyId);
            reload();
        } catch (err) {
            alert(err.response?.data?.error || err.message);
        }
    }

    if (error) return <ErrorState error={error} />;
    if (!volunteers) return <LoadingState />;

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">Volunteers</h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        {candidate?.name} — {candidate?.constituency}
                    </p>
                </div>
                <button className={BTN_PRIMARY} onClick={() => setShowAdd(true)}>
                    <i className="fas fa-user-plus" /> Volunteer যোগ করুন
                </button>
            </div>

            {volunteers.length === 0 ? (
                <EmptyState icon="fa-users" label="কোনো volunteer নেই। উপরের বাটন থেকে যোগ করুন।" />
            ) : (
                <div className="space-y-2">
                    {volunteers.map((v) => (
                        <div key={v.user_id} className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center gap-4">
                            <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center flex-shrink-0">
                                <i className="fas fa-user text-brand text-sm" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="font-medium text-gray-900">{v.name}</div>
                                <div className="text-xs text-gray-500">@{v.username}</div>
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {(v.allowed_wards || []).map((w) => (
                                        <span key={w} className="text-xs bg-brand/10 text-brand px-2 py-0.5 rounded-full bn">
                                            ওয়ার্ড {w}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div className="flex gap-2 flex-shrink-0">
                                <button
                                    className={BTN_SECONDARY + ' text-xs'}
                                    onClick={() => setEditing(v)}
                                >
                                    <i className="fas fa-map-marker-alt" /> Ward
                                </button>
                                <button
                                    className="text-xs border border-red-200 text-red-600 px-2 py-1.5 rounded-md hover:bg-red-50"
                                    onClick={() => handleRemove(v)}
                                >
                                    <i className="fas fa-times" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {showAdd && (
                <AddVolunteerModal
                    constituencyId={constituencyId}
                    onClose={() => setShowAdd(false)}
                    onAdded={() => { setShowAdd(false); reload(); }}
                    wardOptions={wardOptions}
                    wardsLoading={wardsLoading}
                />
            )}
            {editing && (
                <EditWardsModal
                    volunteer={editing}
                    constituencyId={constituencyId}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); reload(); }}
                    wardOptions={wardOptions}
                    wardsLoading={wardsLoading}
                />
            )}
        </div>
    );
}
