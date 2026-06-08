import { useCallback } from 'react';
import DynamicMap from '../components/DynamicMap.jsx';
import PopulationStats from '../components/dashboard/PopulationStats.jsx';
import AssignUserCard from '../components/dashboard/AssignUserCard.jsx';
import useApi from '../hooks/useApi.js';
import * as analyticsApi from '../api/analytics.js';
import * as adminApi from '../api/admin.js';
import { useAuth } from '../auth/AuthContext.jsx';

/**
 * Dashboard for wizard-onboarded candidates (those with map_config.layers).
 * The DynamicMap (click-to-drill) fills the pane; a floating right panel shows
 * population stats + assign-user, matching the legacy dashboards' right side.
 */
export default function DynamicDashboard() {
    const { candidate } = useAuth();
    const cfg = candidate?.map_config || {};

    const fetchSide = useCallback(
        () => Promise.all([
            analyticsApi.overview().catch(() => ({ overview: {} })),
            adminApi.listUsers({ is_active: true, limit: 500 }).catch(() => ({ users: [] })),
        ]),
        []
    );
    const { data } = useApi(fetchSide, [candidate?.candidate_id]);
    const overview = data?.[0]?.overview || {};
    const users = data?.[1]?.users || [];

    const stats = {
        total_population: Number(overview.total_voters || 0),
        male_count: Number(overview.male_voters || 0),
        female_count: Number(overview.female_voters || 0),
    };

    return (
        <div className="h-full w-full relative">
            <DynamicMap config={cfg} candidateId={candidate?.candidate_id} />

            <aside className="absolute right-4 top-4 bottom-4 w-[260px] z-[400] space-y-3 overflow-y-auto pl-1 pointer-events-none">
                <div className="pointer-events-auto space-y-3">
                    <PopulationStats
                        stats={stats}
                        scopeLabel={candidate?.constituency || candidate?.title}
                        scopeSubLabel="Total Voters"
                    />
                    <AssignUserCard users={users} target={null} />
                </div>
            </aside>
        </div>
    );
}
