import { useEffect, useState } from 'react';
import WardSelectMap from '../components/WardSelectMap.jsx';
import DynamicFilterPanel from '../components/filters/DynamicFilterPanel.jsx';
import GeoNavigator from '../components/GeoNavigator.jsx';
import FilteredVoterListPanel from '../components/canvassing/FilteredVoterListPanel.jsx';
import CanvassFormModal from '../components/canvassing/CanvassFormModal.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

const EMPTY_SCOPE = { ward: [], voter_area: [] };

export default function DynamicCanvassing() {
    const { candidate, user } = useAuth();
    const allowedWards = user?.allowed_wards || null;
    const cfg          = candidate?.map_config || {};
    const filterConfig = candidate?.filter_config || [];
    const mapLayers    = (cfg.layers || []).filter((l) => !l.overlay);

    const [navScope, setNavScope]           = useState(EMPTY_SCOPE); // { ward:[], voter_area:[] } (multi-select)
    const [filters, setFilters]             = useState({});
    const [activeVoter, setActiveVoter]     = useState(null);
    const [pinnedVoter, setPinnedVoter]     = useState(null);
    const [flash, setFlash]                 = useState(null);
    const [buildingScope, setBuildingScope] = useState(null);
    const [buildingCtx, setBuildingCtx]     = useState(null); // clicked building (id + centroid) for canvass tagging
    const [listRefreshKey, setListRefreshKey] = useState(0);
    const [mobilePanel, setMobilePanel]     = useState(null); // null | 'nav' | 'list' — mobile-only panel toggle

    // Synchronous reset when candidate switches
    const [lastCandidateId, setLastCandidateId] = useState(candidate?.candidate_id);
    if (candidate?.candidate_id !== lastCandidateId) {
        setLastCandidateId(candidate?.candidate_id);
        setNavScope(EMPTY_SCOPE);
        setFilters({});
        setBuildingScope(null);
        setPinnedVoter(null);
    }

    // Clicking a single building narrows to that building's ward; otherwise the
    // multi-select nav scope (wards + areas) drives the list. Empty scope selects nothing.
    const geoScope = buildingScope ?? {
        ...(navScope.ward?.length ? { ward: navScope.ward } : {}),
        ...(navScope.voter_area?.length ? { voter_area: navScope.voter_area } : {}),
    };

    // Selecting in the nav clears any single-building drill-down.
    useEffect(() => {
        setBuildingScope(null);
    }, [JSON.stringify(navScope)]);

    // Clear pin whenever navigation changes (ward, voter area, or building)
    useEffect(() => {
        setPinnedVoter(null);
    }, [JSON.stringify(navScope), buildingScope]);

    // Map ↔ dropdown: clicking a ward on the map toggles the same ward selection
    // the Navigate dropdown edits (bidirectional).
    function toggleWard(w) {
        setNavScope((s) => {
            const cur = s.ward || [];
            const ward = cur.includes(w) ? cur.filter((x) => x !== w) : [...cur, w];
            return { ...s, ward };
        });
    }

    const scopeLabel = buildingScope
        ? 'নির্বাচিত ভবন'
        : navScope.ward?.length
            ? `${navScope.ward.length} ওয়ার্ড${navScope.voter_area?.length ? `, ${navScope.voter_area.length} এলাকা` : ''}`
            : candidate?.title;

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
                <WardSelectMap
                    config={cfg}
                    candidateId={candidate?.candidate_id}
                    selectedWards={navScope.ward}
                    focusAreas={navScope.voter_area}
                    onToggleWard={toggleWard}
                    pinnedVoter={pinnedVoter}
                    onPinnedVoterClick={(v) => setActiveVoter(v)}
                    allowedWards={allowedWards}
                />
            </div>

            {/* Left: geo navigator + voter filters */}
            {hasLeftPanel && (
                <aside className={`absolute left-2 md:left-4 top-4 bottom-16 lg:bottom-4 w-[min(88vw,300px)] z-[500] overflow-y-auto pr-1 space-y-3 ${mobilePanel === 'nav' ? 'block' : 'hidden'} lg:block`}>
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

            {/* Right: voter list */}
            <aside className={`absolute right-2 md:right-4 top-4 bottom-16 lg:bottom-4 w-[min(94vw,380px)] z-[500] ${mobilePanel === 'list' ? 'block' : 'hidden'} lg:block`}>
                <FilteredVoterListPanel
                    filters={filters}
                    scope={geoScope}
                    scopeLabel={scopeLabel}
                    refreshKey={listRefreshKey}
                    onPickVoter={(v) => { setPinnedVoter(v); setActiveVoter(v); }}
                />
            </aside>

            {/* Mobile panel toggle bar (lg:hidden) */}
            <div className="lg:hidden absolute bottom-3 left-1/2 -translate-x-1/2 z-[550] flex gap-2 bg-white rounded-full shadow-lg border border-gray-200 p-1">
                {hasLeftPanel && (
                    <button
                        onClick={() => setMobilePanel((p) => (p === 'nav' ? null : 'nav'))}
                        className={`bn text-sm font-medium px-4 py-1.5 rounded-full ${mobilePanel === 'nav' ? 'bg-brand text-white' : 'text-brand'}`}
                    >
                        <i className="fas fa-layer-group mr-1" /> এলাকা
                    </button>
                )}
                <button
                    onClick={() => setMobilePanel((p) => (p === 'list' ? null : 'list'))}
                    className={`bn text-sm font-medium px-4 py-1.5 rounded-full ${mobilePanel === 'list' ? 'bg-brand text-white' : 'text-brand'}`}
                >
                    <i className="fas fa-users mr-1" /> ভোটার
                </button>
                {mobilePanel && (
                    <button
                        onClick={() => setMobilePanel(null)}
                        className="text-gray-500 px-3 py-1.5 rounded-full"
                    >
                        <i className="fas fa-map" /> Map
                    </button>
                )}
            </div>

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
                    building={buildingCtx}
                    onClose={() => setActiveVoter(null)}
                    onSubmitted={() => {
                        setFlash(`Saved canvass for ${activeVoter.name}`);
                        setActiveVoter(null);
                        setPinnedVoter(null);
                        // Force the voter list to refetch so the row status + counts
                        // update immediately (no manual refresh). (#3)
                        setListRefreshKey((k) => k + 1);
                        setTimeout(() => setFlash(null), 4000);
                    }}
                />
            )}
        </div>
    );
}
