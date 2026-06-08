import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as candidatesApi from '../../api/candidates.js';
import PageHeader from '../../components/PageHeader.jsx';
import { LoadingState, ErrorState, EmptyState, Spinner } from '../../components/LoadingState.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';

export default function CandidatesListPage() {
    const { user, switchCandidate, candidate } = useAuth();
    const [list, setList]       = useState(null);
    const [error, setError]     = useState(null);
    const [busy, setBusy]       = useState(null);
    const [delTarget, setDelTarget] = useState(null); // candidate object pending delete

    function reload() {
        candidatesApi.list().then(setList).catch(setError);
    }
    useEffect(() => { reload(); }, []);

    // Switch into a candidate, then go to its data-import page.
    async function manageData(candidateId) {
        setBusy(candidateId);
        try {
            await switchCandidate(candidateId);
            window.location.assign('/admin/import');
        } catch (e) {
            setError(e); setBusy(null);
        }
    }

    if (!user?.is_super_admin) {
        return <ErrorState error={{ message: 'Super-admin only' }} />;
    }

    if (error) return <ErrorState error={error} />;
    if (list === null) return <LoadingState />;

    return (
        <>
            <PageHeader
                title="Candidates"
                subtitle="Each row is a separate campaign with its own data, branding and filter hierarchy."
                actions={
                    <Link to="/admin/candidates/new" className="btn-primary">
                        <i className="fas fa-plus" /> New candidate
                    </Link>
                }
            />

            {list.length === 0 ? (
                <EmptyState icon="fa-user-tie" label="No candidates yet" />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {list.map((c) => (
                        <div key={c.candidate_id} className="card">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <h3 className="text-lg font-semibold text-gray-800 truncate">{c.title}</h3>
                                    <p className="text-sm text-gray-500 truncate">{c.subtitle || c.name}</p>
                                </div>
                                <span
                                    className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${
                                        c.status === 'active'
                                            ? 'bg-green-100 text-green-700'
                                            : 'bg-gray-100 text-gray-600'
                                    }`}
                                >
                                    {c.status}
                                </span>
                            </div>

                            <dl className="text-xs text-gray-600 mt-3 space-y-1">
                                <div className="flex justify-between">
                                    <dt className="text-gray-400">ID</dt>
                                    <dd className="font-mono">{c.candidate_id}</dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-gray-400">Constituency</dt>
                                    <dd>{c.constituency}</dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-gray-400">Kind</dt>
                                    <dd className="capitalize">{c.map_config?.kind || '—'}</dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-gray-400">Filters</dt>
                                    <dd>{(c.filter_config || []).length} configured</dd>
                                </div>
                            </dl>

                            <div className="flex gap-2 mt-3">
                                <button
                                    className="btn-secondary flex-1 text-sm"
                                    onClick={() => manageData(c.candidate_id)}
                                    disabled={busy === c.candidate_id}
                                >
                                    <i className="fas fa-database" />
                                    {busy === c.candidate_id ? 'Opening…' : 'Manage data'}
                                </button>
                                <button
                                    className="btn-danger text-sm px-3"
                                    title="Delete candidate"
                                    onClick={() => setDelTarget(c)}
                                >
                                    <i className="fas fa-trash" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {delTarget && (
                <DeleteDialog
                    candidate={delTarget}
                    isActive={candidate?.candidate_id === delTarget.candidate_id}
                    onClose={() => setDelTarget(null)}
                    onDeleted={() => { setDelTarget(null); reload(); }}
                />
            )}
        </>
    );
}

function DeleteDialog({ candidate, isActive, onClose, onDeleted }) {
    const [confirm, setConfirm] = useState('');
    const [busy, setBusy]       = useState(false);
    const [err, setErr]         = useState(null);
    const match = confirm.trim() === candidate.candidate_id;

    async function doDelete() {
        setBusy(true); setErr(null);
        try {
            await candidatesApi.remove(candidate.candidate_id);
            onDeleted();
        } catch (e) {
            setErr(e.response?.data?.error || e.message);
            setBusy(false);
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[2000]">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
                <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
                    <h3 className="font-semibold text-red-700"><i className="fas fa-triangle-exclamation mr-2" />Delete candidate</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times" /></button>
                </div>
                <div className="p-5 space-y-3 text-sm">
                    <p>
                        This permanently deletes <strong>{candidate.title}</strong> ({candidate.candidate_id})
                        and <strong>all of its data</strong> — voters, villages, wards, voter areas,
                        buildings, polling stations, canvassing records and layers. This cannot be undone.
                    </p>
                    {isActive && (
                        <p className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded p-2 text-xs">
                            This is your currently active candidate. After deleting, switch to another one.
                        </p>
                    )}
                    <div>
                        <label className="input-label">Type <code className="bg-gray-100 px-1 rounded">{candidate.candidate_id}</code> to confirm</label>
                        <input className="input-field font-mono" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoFocus />
                    </div>
                    {err && <div className="text-red-600 text-xs">{err}</div>}
                </div>
                <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
                    <button className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
                    <button className="btn-danger" onClick={doDelete} disabled={!match || busy}>
                        {busy ? <Spinner size="sm" /> : <i className="fas fa-trash" />} Delete permanently
                    </button>
                </div>
            </div>
        </div>
    );
}
