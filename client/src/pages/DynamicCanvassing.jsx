import { useEffect, useState } from 'react';
import DynamicMap from '../components/DynamicMap.jsx';
import DynamicFilterPanel from '../components/filters/DynamicFilterPanel.jsx';
import GeoNavigator from '../components/GeoNavigator.jsx';
import FilteredVoterListPanel from '../components/canvassing/FilteredVoterListPanel.jsx';
import CanvassFormModal from '../components/canvassing/CanvassFormModal.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { geoStackToScope, wardLabelToScope } from '../utils/geoScope.js';

export default function DynamicCanvassing() {
    const { candidate } = useAuth();
    const cfg          = candidate?.map_config || {};
    const filterConfig = candidate?.filter_config || [];
    const mapLayers    = (cfg.layers || []).filter((l) => !l.overlay);

    const [geoNavStack, setGeoNavStack]     = useState([]);
    const [filters, setFilters]             = useState({});
    const [activeVoter, setActiveVoter]     = useState(null);
    const [pinnedVoter, setPinnedVoter]     = useState(null);
    const [flash, setFlash]                 = useState(null);
    const [buildingScope, setBuildingScope] = useState(null);
    const [listRefreshKey, setListRefreshKey] = useState(0);

    // Synchronous reset when candidate switches
    const [lastCandidateId, setLastCandidateId] = useState(candidate?.candidate_id);
    if (candidate?.candidate_id !== lastCandidateId) {
        setLastCandidateId(candidate?.candidate_id);
        setGeoNavStack([]);
        setFilters({});
        setBuildingScope(null);
        setPinnedVoter(null);
    }

    const geoScope = buildingScope ?? geoStackToScope(geoNavStack);

    useEffect(() => {
        setBuildingScope(null);
    }, [geoNavStack]);

    // Clear pin whenever navigation changes (ward, voter area, or building)
    useEffect(() => {
        setPinnedVoter(null);
    }, [JSON.stringify(geoNavStack), buildingScope]);

    function handleLeafClick({ wardLabel }) {
        const s = wardLabelToScope(wardLabel);
        if (s) {
            setBuildingScope(s);
            setListRefreshKey((k) => k + 1);
        }
    }

    const scopeLabel =
        (Object.values(geoScope).some(Boolean) ? geoNavStack[1]?.label || '' : null)
        || geoNavStack.at(-1)?.label
        || candidate?.title;

    const hasLeftPanel = mapLayers.length > 0 || filterConfig.length > 0;

    return (
        <div className="h-full flex flex-col relative overflow-hidden">
            {flash && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[600] bg-green-50 border border-green-200 text-green-700 rounded-md px-3 py-2 text-sm shadow-md">
                    <i className="fas fa-check-circle mr-1" /> {flash}
                </div>
            )}

            {/* Map */}
            <div className="absolute inset-0">
                <DynamicMap
                    config={cfg}
                    candidateId={candidate?.candidate_id}
                    controlledDrill={geoNavStack}
                    onDrillChange={setGeoNavStack}
                    onLeafClick={handleLeafClick}
                    pinnedVoter={pinnedVoter}
                    onPinnedVoterClick={(v) => setActiveVoter(v)}
                />
            </div>

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

            {/* Right: voter list */}
            <aside className="absolute right-4 top-4 bottom-4 w-[380px] z-[500]">
                <FilteredVoterListPanel
                    filters={filters}
                    scope={geoScope}
                    scopeLabel={scopeLabel}
                    refreshKey={listRefreshKey}
                    onPickVoter={(v) => setPinnedVoter(v)}
                />
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
