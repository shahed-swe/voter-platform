import { useEffect, useState } from 'react';
import WardSelectMap from '../components/WardSelectMap.jsx';
import DynamicFilterPanel from '../components/filters/DynamicFilterPanel.jsx';
import GeoNavigator from '../components/GeoNavigator.jsx';
import * as votersApi from '../api/voters.js';
import { useAuth } from '../auth/AuthContext.jsx';

const EMPTY_SCOPE = { ward: [], voter_area: [] };

export default function DynamicDashboard() {
    const { candidate, user } = useAuth();
    const allowedWards = user?.allowed_wards || null;
    const cfg          = candidate?.map_config || {};
    const filterConfig = candidate?.filter_config || [];
    const mapLayers    = (cfg.layers || []).filter((l) => !l.overlay);

    const [navScope, setNavScope]           = useState(EMPTY_SCOPE); // multi-select ward + area
    const [filters, setFilters]             = useState({});
    const [stats, setStats]                 = useState(null);
    const [mobileNav, setMobileNav]         = useState(false); // mobile-only left panel toggle

    // Synchronous reset when candidate switches
    const [lastCandidateId, setLastCandidateId] = useState(candidate?.candidate_id);
    if (candidate?.candidate_id !== lastCandidateId) {
        setLastCandidateId(candidate?.candidate_id);
        setNavScope(EMPTY_SCOPE);
        setFilters({});
        setStats(null);
    }

    const wardScope = {
        ...(navScope.ward?.length ? { ward: navScope.ward } : {}),
        ...(navScope.voter_area?.length ? { voter_area: navScope.voter_area } : {}),
    };

    // Always load stats — including the initial whole-constituency view (no ward /
    // no filter). `stats_only` skips the voter list so the constituency-wide count
    // is fast. (#15: dashboard used to show 0 until an area was picked.)
    useEffect(() => {
        let cancelled = false;
        votersApi
            .filtered({ filters, scope: wardScope, stats_only: true })
            .then((d) => !cancelled && setStats(d.stats || null))
            .catch(() => !cancelled && setStats(null));
        return () => { cancelled = true; };
    }, [JSON.stringify(filters), JSON.stringify(wardScope), candidate?.candidate_id]);

    // Map ↔ dropdown: clicking a ward toggles the same selection the dropdown edits.
    function toggleWard(w) {
        setNavScope((s) => {
            const cur = s.ward || [];
            const ward = cur.includes(w) ? cur.filter((x) => x !== w) : [...cur, w];
            return { ...s, ward };
        });
    }

    const scopeLabel =
        Object.entries(filters)
            .filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0))
            .map(([, v]) => (Array.isArray(v) ? v.join(', ') : v))
            .join(' › ') ||
        (navScope.ward?.length
            ? `${navScope.ward.length} ওয়ার্ড${navScope.voter_area?.length ? `, ${navScope.voter_area.length} এলাকা` : ''} নির্বাচিত`
            : navScope.voter_area?.length ? `${navScope.voter_area.length} এলাকা নির্বাচিত` : null) ||
        candidate?.constituency ||
        candidate?.title;

    const hasLeftPanel = mapLayers.length > 0 || filterConfig.length > 0;

    return (
        <div className="h-full w-full relative">
            <WardSelectMap
                config={cfg}
                candidateId={candidate?.candidate_id}
                selectedWards={navScope.ward}
                focusAreas={navScope.voter_area}
                onToggleWard={toggleWard}
                allowedWards={allowedWards}
            />

            {/* Left: geo navigator + voter filters */}
            {hasLeftPanel && (
                <aside className={`absolute left-2 md:left-4 top-4 bottom-16 lg:bottom-4 w-[min(88vw,300px)] z-[500] overflow-y-auto pr-1 space-y-3 ${mobileNav ? 'block' : 'hidden'} lg:block`}>
                    {mapLayers.length > 0 && (
                        <GeoNavigator
                            key={candidate?.candidate_id}
                            candidateId={candidate?.candidate_id}
                            value={navScope}
                            onChange={setNavScope}
                        />
                    )}
                    {filterConfig.length > 0 && (
                        <DynamicFilterPanel
                            config={filterConfig}
                            value={filters}
                            onChange={setFilters}
                        />
                    )}
                </aside>
            )}

            {/* Mobile toggle for the nav/filters panel */}
            {hasLeftPanel && (
                <button
                    onClick={() => setMobileNav((v) => !v)}
                    className="lg:hidden absolute bottom-3 left-1/2 -translate-x-1/2 z-[550] bn text-sm font-medium px-4 py-2 rounded-full bg-white shadow-lg border border-brand/30 text-brand"
                >
                    <i className={`fas fa-${mobileNav ? 'map' : 'layer-group'} mr-1`} /> {mobileNav ? 'Map' : 'এলাকা / ফিল্টার'}
                </button>
            )}

            {/* Right: scoped stats */}
            <aside className="absolute right-2 md:right-4 top-4 w-[min(42vw,230px)] z-[400] space-y-2 md:space-y-3">
                <div className="bg-white border border-brand/30 rounded-lg px-4 py-2 shadow-sm">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Scope</div>
                    <div className="text-sm font-medium text-gray-800 truncate" title={scopeLabel}>
                        {scopeLabel}
                    </div>
                </div>
                <StatBox label="Total Voters" value={stats?.total}       tone="text-brand" />
                <StatBox label="Visited"      value={stats?.visited}     tone="text-green-600" />
                <StatBox label="Not Visited"  value={stats?.not_visited} tone="text-gray-700" />
                <StatBox label="Follow-up"    value={stats?.follow_up}   tone="text-amber-600" />
            </aside>
        </div>
    );
}

function StatBox({ label, value, tone }) {
    return (
        <div className="bg-white border border-brand/30 rounded-lg px-4 py-2.5 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</div>
            <div className={`text-2xl font-bold ${tone || 'text-brand'}`}>
                {Number(value || 0).toLocaleString()}
            </div>
        </div>
    );
}
