import { useCallback } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import { LoadingState, ErrorState, EmptyState } from '../components/LoadingState.jsx';
import useApi from '../hooks/useApi.js';
import * as votersApi from '../api/voters.js';
import * as analyticsApi from '../api/analytics.js';

export default function ElectionResultsPage() {
    const fetch = useCallback(
        () =>
            Promise.all([
                analyticsApi.supportDistribution(),
                votersApi.aggregatedStats({ group_by: 'union' }),
            ]),
        []
    );
    const { data, loading, error, refetch } = useApi(fetch, []);

    if (loading) return <LoadingState />;
    if (error) return <ErrorState error={error} onRetry={refetch} />;

    const [sup, agg] = data;
    const totals = (sup.support_distribution || []).reduce(
        (acc, r) => acc + Number(r.count || 0),
        0
    );

    return (
        <>
            <PageHeader
                title="Election results"
                subtitle="Aggregated support distribution and area-level breakdown"
            />

            <div className="card mb-6">
                <h3 className="card-title">Support breakdown</h3>
                {totals === 0 ? (
                    <EmptyState icon="fa-poll" label="No canvassing data yet" />
                ) : (
                    <ul className="space-y-2">
                        {(sup.support_distribution || []).map((row) => {
                            const pct = Math.round((Number(row.count) / totals) * 100) || 0;
                            return (
                                <li key={row.support_level}>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="font-medium">{row.support_level}</span>
                                        <span className="text-gray-500">
                                            {Number(row.count).toLocaleString()} ({pct}%)
                                        </span>
                                    </div>
                                    <div className="h-2 bg-gray-100 rounded">
                                        <div
                                            className="h-2 rounded bg-brand"
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <div className="card overflow-x-auto p-0">
                <h3 className="card-title px-5 pt-5">Area-level voter statistics</h3>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Area</th>
                            <th>Voters</th>
                            <th>Visited</th>
                            <th>Male</th>
                            <th>Female</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {(agg.stats || []).map((row, idx) => (
                            <tr key={idx}>
                                <td>{row.name || '—'}</td>
                                <td>{Number(row.total_voters || 0).toLocaleString()}</td>
                                <td>{Number(row.visited || 0).toLocaleString()}</td>
                                <td>{Number(row.male || 0).toLocaleString()}</td>
                                <td>{Number(row.female || 0).toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}
