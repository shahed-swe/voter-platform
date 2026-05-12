import { useCallback } from 'react';
import {
    Chart as ChartJS, ArcElement, BarElement, CategoryScale,
    LinearScale, PointElement, LineElement, Tooltip, Legend, Title,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';

import PageHeader from '../components/PageHeader.jsx';
import StatCard from '../components/StatCard.jsx';
import { LoadingState, ErrorState } from '../components/LoadingState.jsx';
import useApi from '../hooks/useApi.js';
import * as analyticsApi from '../api/analytics.js';

ChartJS.register(
    ArcElement, BarElement, CategoryScale, LinearScale,
    PointElement, LineElement, Tooltip, Legend, Title
);

const PALETTE = ['#2E7D32', '#1565C0', '#F9A825', '#C62828', '#6A1B9A', '#00838F', '#EF6C00', '#283593'];

export default function AnalyticsPage() {
    const fetch = useCallback(
        () =>
            Promise.all([
                analyticsApi.overview(),
                analyticsApi.supportDistribution(),
                analyticsApi.demographics(),
                analyticsApi.dailyTrends({ days: 30 }),
                analyticsApi.villagePerformance({ limit: 10 }),
                analyticsApi.canvasserPerformance({ limit: 10 }),
            ]),
        []
    );
    const { data, loading, error, refetch } = useApi(fetch, []);

    if (loading) return <LoadingState />;
    if (error) return <ErrorState error={error} onRetry={refetch} />;

    const [ovr, sup, demo, daily, villagePerf, canvasserPerf] = data;
    const overview = ovr.overview || {};

    const supportData = {
        labels: (sup.support_distribution || []).map((r) => r.support_level),
        datasets: [
            {
                data: (sup.support_distribution || []).map((r) => Number(r.count)),
                backgroundColor: PALETTE,
            },
        ],
    };

    const demoData = {
        labels: [...new Set((demo.demographics || []).map((d) => d.age_bucket))],
        datasets: ['Male', 'Female', 'Other', 'Unknown'].map((g, i) => ({
            label: g,
            data: [...new Set((demo.demographics || []).map((d) => d.age_bucket))].map(
                (bucket) =>
                    Number(
                        (demo.demographics || [])
                            .find((d) => d.age_bucket === bucket && d.gender === g)
                            ?.count || 0
                    )
            ),
            backgroundColor: PALETTE[i],
        })),
    };

    const trendData = {
        labels: (daily.daily_trends || []).map((d) =>
            new Date(d.day).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
        ),
        datasets: [
            {
                label: 'Canvasses',
                data: (daily.daily_trends || []).map((d) => Number(d.canvasses)),
                borderColor: '#2E7D32',
                backgroundColor: 'rgba(46, 125, 50, 0.15)',
                fill: true,
                tension: 0.3,
            },
        ],
    };

    return (
        <>
            <PageHeader
                title="Analytics overview"
                subtitle="Survey progress, support distribution, and performance"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatCard label="Total voters"      value={Number(overview.total_voters     || 0).toLocaleString()} icon="fa-users"            tone="brand"   />
                <StatCard label="Visited voters"    value={Number(overview.visited_voters   || 0).toLocaleString()} icon="fa-clipboard-check"  tone="accent"  />
                <StatCard label="Total canvasses"   value={Number(overview.total_canvasses  || 0).toLocaleString()} icon="fa-comments"         tone="warning" />
                <StatCard label="Active canvassers" value={Number(overview.active_canvassers|| 0).toLocaleString()} icon="fa-user-check"       tone="gray"    />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="card">
                    <h3 className="card-title">Support distribution</h3>
                    <Doughnut data={supportData} options={{ plugins: { legend: { position: 'bottom' } } }} />
                </div>
                <div className="card">
                    <h3 className="card-title">Demographics (gender × age)</h3>
                    <Bar data={demoData} options={{ responsive: true, plugins: { legend: { position: 'bottom' } } }} />
                </div>
            </div>

            <div className="card mb-6">
                <h3 className="card-title">Daily canvassing trend (last 30 days)</h3>
                <Line data={trendData} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="card overflow-x-auto p-0">
                    <h3 className="card-title px-5 pt-5">Top villages</h3>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Village</th>
                                <th>Voters</th>
                                <th>Visited</th>
                                <th>%</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {(villagePerf.village_performance || []).map((v) => (
                                <tr key={v.village_id}>
                                    <td>{v.village_name}</td>
                                    <td>{Number(v.total_voters || 0).toLocaleString()}</td>
                                    <td>{Number(v.visited || 0).toLocaleString()}</td>
                                    <td>{v.completion_pct || 0}%</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="card overflow-x-auto p-0">
                    <h3 className="card-title px-5 pt-5">Top canvassers</h3>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Role</th>
                                <th>Canvasses</th>
                                <th>Strong support</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {(canvasserPerf.canvasser_performance || []).map((c) => (
                                <tr key={c.user_id}>
                                    <td>{c.name}</td>
                                    <td><span className="badge-info">{c.role}</span></td>
                                    <td>{Number(c.canvasses || 0).toLocaleString()}</td>
                                    <td>{Number(c.strong_support || 0).toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}
