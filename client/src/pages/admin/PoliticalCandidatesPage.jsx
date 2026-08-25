import { useEffect, useState } from 'react';
import * as peopleApi from '../../api/people.js';
import * as candidatesApi from '../../api/candidates.js';
import MultiSelect from '../../components/MultiSelect.jsx';
import { SkeletonList, Skeleton, ErrorState, EmptyState, Spinner } from '../../components/LoadingState.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';

const constituencyOpts = (list) => (list || []).map((c) => ({ value: c.candidate_id, label: `${c.name} — ${c.constituency}` }));

// ── helpers ───────────────────────────────────────────────────────────────────

function Field({ label, children }) {
    return (
        <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
            {children}
        </div>
    );
}

const INPUT = 'w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand';
const BTN_PRIMARY = 'inline-flex items-center gap-2 bg-brand text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-brand/90 disabled:opacity-50';
const BTN_SECONDARY = 'inline-flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-gray-50';

// ── Create candidate modal ────────────────────────────────────────────────────

function CreateCandidateModal({ constituencies, onClose, onCreated }) {
    const [form, setForm] = useState({ name: '', username: '', password: '', email: '', phone: '' });
    const [picked, setPicked] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    async function submit(e) {
        e.preventDefault();
        setBusy(true); setError(null);
        try {
            const res = await peopleApi.createCandidate({
                ...form,
                constituency_ids: picked.length ? picked : undefined,
            });
            onCreated(res);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally { setBusy(false); }
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[92vh] overflow-y-auto">
                <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white">
                    <h3 className="font-semibold text-gray-800">নতুন Candidate তৈরি করুন</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times" /></button>
                </div>
                <form className="p-5 space-y-3" onSubmit={submit}>
                    {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-2">{error}</div>}
                    <Field label="পূর্ণ নাম *">
                        <input className={INPUT} required value={form.name} onChange={set('name')} />
                    </Field>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Username *">
                            <input className={INPUT} required value={form.username} onChange={set('username')} />
                        </Field>
                        <Field label="Password *">
                            <input className={INPUT} required type="password" value={form.password} onChange={set('password')} />
                        </Field>
                    </div>
                    <Field label="Email (optional)">
                        <input className={INPUT} type="email" value={form.email} onChange={set('email')} />
                    </Field>
                    <Field label="Phone (optional)">
                        <input className={INPUT} value={form.phone} onChange={set('phone')} placeholder="+88017..." />
                    </Field>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                            Constituency (একাধিক — optional, পরেও assign করা যাবে)
                        </label>
                        <MultiSelect
                            options={constituencyOpts(constituencies)}
                            value={picked}
                            onChange={setPicked}
                            placeholder="— এখন assign না করলেও চলবে —"
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" className={BTN_SECONDARY} onClick={onClose}>বাতিল</button>
                        <button type="submit" className={BTN_PRIMARY} disabled={busy}>
                            {busy ? <Spinner size="sm" /> : <i className="fas fa-user-plus" />}
                            তৈরি করুন
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── Assign constituency modal ─────────────────────────────────────────────────

function AssignConstituencyModal({ candidate, constituencies, onClose, onSaved }) {
    const [picked, setPicked] = useState(candidate.constituency_id ? [candidate.constituency_id] : []);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    async function submit(e) {
        e.preventDefault();
        if (!picked.length) return;
        setBusy(true); setError(null);
        try {
            await peopleApi.assignConstituency(candidate.user_id, picked);
            onSaved();
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally { setBusy(false); }
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full">
                <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center gap-3">
                    <h3 className="font-semibold text-gray-800 truncate min-w-0">{candidate.name} — Constituency Assign</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0"><i className="fas fa-times" /></button>
                </div>
                <form className="p-5 space-y-3" onSubmit={submit}>
                    {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-2">{error}</div>}
                    <MultiSelect
                        options={constituencyOpts(constituencies)}
                        value={picked}
                        onChange={setPicked}
                        placeholder="Constituency নির্বাচন করুন"
                    />
                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" className={BTN_SECONDARY} onClick={onClose}>বাতিল</button>
                        <button type="submit" className={BTN_PRIMARY} disabled={busy || !picked.length}>
                            {busy ? <Spinner size="sm" /> : <i className="fas fa-check" />}
                            Assign করুন
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PoliticalCandidatesPage() {
    const { user } = useAuth();
    const [candidates, setCandidates]       = useState(null);
    const [constituencies, setConstituencies] = useState([]);
    const [error, setError]                 = useState(null);
    const [showCreate, setShowCreate]       = useState(false);
    const [assigning, setAssigning]         = useState(null);

    if (!user?.is_super_admin) {
        return <div className="p-8 text-red-600">Super-admin only.</div>;
    }

    function reload() {
        Promise.all([
            peopleApi.listCandidates(),
            candidatesApi.list(),
        ])
            .then(([cRes, constRes]) => {
                setCandidates(cRes.candidates || []);
                setConstituencies(constRes.candidates || constRes || []);
            })
            .catch(setError);
    }

    useEffect(() => { reload(); }, []);

    async function handleDelete(c) {
        if (!confirm(`"${c.name}" (@${c.username}) candidate-কে ডিলিট করবেন? এটি ফেরানো যাবে না।`)) return;
        try {
            await peopleApi.deleteCandidate(c.user_id);
            reload();
        } catch (err) {
            alert(err.response?.data?.error || err.message);
        }
    }

    if (error) return <ErrorState error={error} />;
    if (!candidates) {
        return (
            <div className="max-w-4xl mx-auto space-y-6">
                <Skeleton className="h-8 w-64" />
                <SkeletonList rows={5} lines={1} />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">
                        Political Candidates
                        {candidates.length > 0 && (
                            <span className="ml-2 text-sm font-normal text-gray-400">({candidates.length})</span>
                        )}
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Candidates যারা constituency তে নির্বাচনে অংশ নিচ্ছেন
                    </p>
                </div>
                <button className={`${BTN_PRIMARY} w-full sm:w-auto justify-center`} onClick={() => setShowCreate(true)}>
                    <i className="fas fa-user-plus" /> নতুন Candidate
                </button>
            </div>

            {/* Candidate list */}
            {candidates.length === 0 ? (
                <EmptyState icon="fa-user-tie" label="কোনো candidate নেই। উপরে 'নতুন Candidate' বাটনে ক্লিক করুন।" />
            ) : (
                <div className="space-y-3">
                    {candidates.map((c) => (
                        <CandidateRow
                            key={c.user_id}
                            candidate={c}
                            onAssign={() => setAssigning(c)}
                            onDelete={() => handleDelete(c)}
                        />
                    ))}
                </div>
            )}

            {/* Modals */}
            {showCreate && (
                <CreateCandidateModal
                    constituencies={constituencies}
                    onClose={() => setShowCreate(false)}
                    onCreated={() => { setShowCreate(false); reload(); }}
                />
            )}
            {assigning && (
                <AssignConstituencyModal
                    candidate={assigning}
                    constituencies={constituencies}
                    onClose={() => setAssigning(null)}
                    onSaved={() => { setAssigning(null); reload(); }}
                />
            )}
        </div>
    );
}

function CandidateRow({ candidate, onAssign, onDelete }) {
    const assigned = candidate.constituency_id;

    return (
        <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            {/* Identity + meta — full width on mobile so nothing wraps mid-word */}
            <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="h-10 w-10 rounded-full bg-brand/10 text-brand font-bold flex items-center justify-center flex-shrink-0 uppercase">
                    {(candidate.name || '?').trim().charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-gray-900 truncate">{candidate.name}</span>
                        <span className={`flex-shrink-0 text-[11px] px-2 py-0.5 rounded-full font-medium ${
                            candidate.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                            {candidate.is_active ? 'Active' : 'Inactive'}
                        </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 truncate">
                        @{candidate.username}
                        {candidate.email && <> · {candidate.email}</>}
                        {candidate.phone && <> · {candidate.phone}</>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {assigned ? (
                            <span className="inline-flex items-center gap-1 text-xs bg-brand/10 text-brand px-2 py-0.5 rounded-full font-medium max-w-full">
                                <i className="fas fa-map-marker-alt text-[10px] flex-shrink-0" />
                                <span className="truncate">
                                    {candidate.constituency_name || assigned}
                                    {candidate.constituency_area ? ` · ${candidate.constituency_area}` : ''}
                                </span>
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                                <i className="fas fa-triangle-exclamation text-[10px]" />
                                কোনো constituency assign করা হয়নি
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Actions — their own row on mobile, right column on desktop.
                Assign is emphasized (primary) until a constituency is set. */}
            <div className="flex items-center gap-2 flex-shrink-0">
                <button
                    className={`${assigned ? BTN_SECONDARY : BTN_PRIMARY} text-xs flex-1 sm:flex-none justify-center whitespace-nowrap`}
                    onClick={onAssign}
                >
                    <i className="fas fa-map-marker-alt" /> {assigned ? 'Constituency পরিবর্তন' : 'Constituency Assign'}
                </button>
                <button
                    className="text-xs border border-red-200 text-red-600 px-3 py-2 rounded-md hover:bg-red-50 flex-shrink-0"
                    onClick={onDelete}
                    title="Candidate ডিলিট করুন"
                    aria-label="Delete candidate"
                >
                    <i className="fas fa-trash" />
                </button>
            </div>
        </div>
    );
}
