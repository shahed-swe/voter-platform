import { useEffect, useState } from 'react';
import DynamicMap from '../components/DynamicMap.jsx';
import DynamicFilterPanel from '../components/filters/DynamicFilterPanel.jsx';
import GeoNavigator from '../components/GeoNavigator.jsx';
import FilteredVoterListPanel from '../components/canvassing/FilteredVoterListPanel.jsx';
import CanvassFormModal from '../components/canvassing/CanvassFormModal.jsx';
import * as votersApi from '../api/voters.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { geoStackToScope, wardLabelToScope } from '../utils/geoScope.js';

export default function DynamicDashboard() {
    const { candidate, user } = useAuth();
    const allowedWards = user?.allowed_wards || null;
    const cfg          = candidate?.map_config || {};
    const filterConfig = candidate?.filter_config || [];
    const mapLayers    = (cfg.layers || []).filter((l) => !l.overlay);

    const [geoNavStack, setGeoNavStack]     = useState([]);
    const [filters, setFilters]             = useState({});
    const [stats, setStats]                 = useState(null);
    const [voterModal, setVoterModal]       = useState(null);
    const [pinnedVoter, setPinnedVoter]     = useState(null);
    const [activeVoter, setActiveVoter]     = useState(null);
    const [flash, setFlash]                 = useState(null);

    // Synchronous reset when candidate switches
    const [lastCandidateId, setLastCandidateId] = useState(candidate?.candidate_id);
    if (candidate?.candidate_id !== lastCandidateId) {
        setLastCandidateId(candidate?.candidate_id);
        setGeoNavStack([]);
        setFilters({});
        setStats(null);
        setVoterModal(null);
        setPinnedVoter(null);
        setActiveVoter(null);
    }

    const wardScope = geoStackToScope(geoNavStack);

    // Clear pin whenever navigation changes (ward or voter area)
    useEffect(() => {
        setPinnedVoter(null);
    }, [JSON.stringify(geoNavStack)]);

    useEffect(() => {
        const hasFilters = Object.values(filters).some(
            (v) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0)
        );
        const hasWard = Object.values(wardScope).some((v) => v != null && v !== '');
        if (!hasFilters && !hasWard) { setStats(null); return; }

        let cancelled = false;
        votersApi
            .filtered({ filters, scope: wardScope, limit: 1 })
            .then((d) => !cancelled && setStats(d.stats || null))
            .catch(() => !cancelled && setStats(null));
        return () => { cancelled = true; };
    }, [JSON.stringify(filters), JSON.stringify(wardScope), candidate?.candidate_id]);

    function handleLeafClick({ wardLabel }) {
        const scope = wardLabelToScope(wardLabel);
        if (!scope) return;
        setVoterModal({ scope, label: wardLabel });
    }

    const scopeLabel =
        Object.entries(filters)
            .filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0))
            .map(([, v]) => (Array.isArray(v) ? v.join(', ') : v))
            .join(' › ') ||
        geoNavStack.at(-1)?.label ||
        candidate?.constituency ||
        candidate?.title;

    const hasLeftPanel = mapLayers.length > 0 || filterConfig.length > 0;

    return (
        <div className="h-full w-full relative">
            {flash && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[900] bg-green-50 border border-green-200 text-green-700 rounded-md px-3 py-2 text-sm shadow-md">
                    <i className="fas fa-check-circle mr-1" /> {flash}
                </div>
            )}

            <DynamicMap
                config={cfg}
                candidateId={candidate?.candidate_id}
                controlledDrill={geoNavStack}
                onDrillChange={setGeoNavStack}
                onLeafClick={handleLeafClick}
                pinnedVoter={pinnedVoter}
                onPinnedVoterClick={(v) => setActiveVoter(v)}
            />

            {/* Left: geo navigator + voter filters */}
            {hasLeftPanel && (
                <aside className="absolute left-4 top-4 bottom-4 w-[280px] z-[500] overflow-y-auto pr-1 space-y-3">
                    {mapLayers.length > 0 && (
                        <GeoNavigator
                            key={candidate?.candidate_id}
                            layers={mapLayers}
                            candidateId={candidate?.candidate_id}
                            drillStack={geoNavStack}
                            onSelect={setGeoNavStack}
                            allowedWards={allowedWards}
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

            {/* Right: scoped stats */}
            <aside className="absolute right-4 top-4 w-[230px] z-[400] space-y-3">
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

            {/* Pinned voter indicator */}
            {pinnedVoter && !activeVoter && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[600] bg-indigo-600 text-white rounded-full px-4 py-2 text-sm shadow-lg flex items-center gap-2">
                    <i className="fas fa-map-pin" />
                    <span className="font-medium truncate max-w-[180px]">{pinnedVoter.name}</span>
                    <span className="text-indigo-200 text-xs">— click pin to open</span>
                    <button
                        className="ml-1 text-indigo-200 hover:text-white"
                        onClick={() => setPinnedVoter(null)}
                    >
                        <i className="fas fa-times" />
                    </button>
                </div>
            )}

            {/* Voter list modal: opens when a building is clicked */}
            {voterModal && (
                <div className="fixed inset-0 z-[800] flex items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/40"
                        onClick={() => setVoterModal(null)}
                    />
                    <div className="relative z-10 w-[480px] h-[75vh] flex flex-col bg-white rounded-xl shadow-2xl overflow-hidden">
                        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-brand/5">
                            <div>
                                <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Voters</div>
                                <div className="text-sm font-semibold text-gray-800 truncate max-w-[340px]">
                                    {voterModal.label}
                                </div>
                            </div>
                            <button
                                className="text-gray-400 hover:text-gray-700 text-lg"
                                onClick={() => setVoterModal(null)}
                            >
                                <i className="fas fa-times" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <FilteredVoterListPanel
                                filters={{}}
                                scope={voterModal.scope}
                                scopeLabel={voterModal.label}
                                onPickVoter={(v) => {
                                    setVoterModal(null);
                                    setPinnedVoter(v);
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Canvass form: opens when the voter pin is clicked */}
            {activeVoter && (
                <CanvassFormModal
                    voter={activeVoter}
                    onClose={() => setActiveVoter(null)}
                    onSubmitted={() => {
                        setFlash(`Saved canvass for ${activeVoter.name}`);
                        setActiveVoter(null);
                        setPinnedVoter(null);
                        setTimeout(() => setFlash(null), 4000);
                    }}
                />
            )}
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
