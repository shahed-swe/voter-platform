import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as candidatesApi from '../../api/candidates.js';
import PageHeader from '../../components/PageHeader.jsx';
import { LoadingState, ErrorState, EmptyState } from '../../components/LoadingState.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';

export default function CandidatesListPage() {
    const { user } = useAuth();
    const [list, setList]       = useState(null);
    const [error, setError]     = useState(null);

    useEffect(() => {
        candidatesApi.list().then(setList).catch(setError);
    }, []);

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
                        </div>
                    ))}
                </div>
            )}
        </>
    );
}
