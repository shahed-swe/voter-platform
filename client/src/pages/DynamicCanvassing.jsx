import { useEffect, useState } from 'react';
import DynamicMap from '../components/DynamicMap.jsx';
import DynamicFilterPanel from '../components/filters/DynamicFilterPanel.jsx';
import GeoNavigator from '../components/GeoNavigator.jsx';
import FilteredVoterListPanel from '../components/canvassing/FilteredVoterListPanel.jsx';
import CanvassFormModal from '../components/canvassing/CanvassFormModal.jsx';
import * as canvassingApi from '../api/canvassing.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { wardLabelToScope } from '../utils/geoScope.js';

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
    const [buildingOnly, setBuildingOnly]   = useState(false); // list shows only voters canvassed at buildingCtx
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

    // Selecting in the nav clears any single-building drill-down/selection.
    useEffect(() => {
        setBuildingScope(null);
        setBuildingCtx(null);
        setBuildingOnly(false);
    }, [JSON.stringify(navScope)]);

    // Clear pin whenever navigation changes (ward, voter area, or building)
    useEffect(() => {
        setPinnedVoter(null);
    }, [JSON.stringify(navScope), buildingScope]);

    // All voters in the selected ward/area whose latest canvass has a geolocation —
    // shown together as pins on the map. Refreshes after each canvass submit so a
    // newly captured location appears immediately.
    const [voterPins, setVoterPins] = useState([]);
    useEffect(() => {
        const scope = {
            ...(navScope.ward?.length ? { ward: navScope.ward } : {}),
            ...(navScope.voter_area?.length ? { voter_area: navScope.voter_area } : {}),
        };
        if (!Object.keys(scope).length) { setVoterPins([]); return; }
        let cancelled = false;
        canvassingApi
            .voterLocations({ scope })
            .then((d) => !cancelled && setVoterPins(d.voters || []))
            .catch(() => !cancelled && setVoterPins([]));
        return () => { cancelled = true; };
    }, [JSON.stringify(navScope), candidate?.candidate_id, listRefreshKey]);

    function handleLeafClick({ wardLabel, building }) {
        // Ward-labelled drills (clicked through the map) narrow the list to that
        // ward. Navigator-driven drills carry a generic "Ward" label that can't be
        // parsed — the GeoNavigator scope already narrows the list there, so the
        // click still counts: it selects the building (highlight + canvass tagging).
        // NO refreshKey bump here: a building click changes no list data by itself,
        // and the fetches already re-run on their own deps (scope change → list;
        // buildingFilter change → building-only list). Bumping it refetched the
        // list + stats + pins on every single building click for nothing.
        const s = wardLabelToScope(wardLabel);
        if (s) setBuildingScope(s);
        setBuildingCtx(building || null);
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
                <DynamicMap
                    config={cfg}
                    candidateId={candidate?.candidate_id}
                    onLeafClick={handleLeafClick}
                    pinnedVoter={pinnedVoter}
                    onPinnedVoterClick={(v) => setActiveVoter(v)}
                    voterPins={voterPins}
                    selectedFeatureId={buildingCtx?.building_id ?? null}
                    refreshKey={listRefreshKey}
                    allowedWards={allowedWards}
                    focusWards={navScope.ward}
                    focusAreaName={navScope.voter_area?.length === 1 ? navScope.voter_area[0] : null}
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
                    scopeLabel={
                        buildingOnly && buildingCtx
                            ? (buildingCtx.building_name || 'নির্বাচিত ভবন')
                            : scopeLabel
                    }
                    refreshKey={listRefreshKey}
                    buildingFilter={buildingOnly ? (buildingCtx?.building_id ?? null) : null}
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

            {/* Selected building indicator — canvasses now tag to this building */}
            {buildingCtx && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[590] max-w-[94vw] bg-amber-50 border border-amber-300 text-amber-800 rounded-full px-3 sm:px-4 py-1.5 text-xs sm:text-sm shadow-md flex items-center gap-1.5 sm:gap-2 whitespace-nowrap">
                    <i className="fas fa-building shrink-0" />
                    <span className="bn font-medium truncate max-w-[28vw] sm:max-w-[220px]">
                        {buildingCtx.building_name || `ভবন #${buildingCtx.building_id}`}
                    </span>
                    {buildingCtx.building_id != null && (
                        <button
                            className={`bn shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border transition-colors whitespace-nowrap ${
                                buildingOnly
                                    ? 'bg-amber-600 text-white border-amber-600'
                                    : 'bg-white text-amber-700 border-amber-400 hover:bg-amber-100'
                            }`}
                            onClick={() => setBuildingOnly((v) => !v)}
                            title="Show only this building's canvassed voters"
                        >
                            এই ভবনের ভোটার
                        </button>
                    )}
                    <button
                        className="text-amber-500 hover:text-amber-800 shrink-0 px-0.5"
                        onClick={() => { setBuildingCtx(null); setBuildingOnly(false); }}
                        title="Clear selected building"
                    >
                        <i className="fas fa-times" />
                    </button>
                </div>
            )}

            {/* Pinned voter indicator */}
            {pinnedVoter && !activeVoter && (
                // bottom-20 on mobile: clears the এলাকা/ভোটার toggle bar at bottom-3
                <div className="absolute bottom-20 lg:bottom-4 left-1/2 -translate-x-1/2 z-[600] max-w-[94vw] bg-indigo-600 text-white rounded-full px-4 py-2 text-sm shadow-lg flex items-center gap-2 whitespace-nowrap">
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
                    onSubmitted={(saved) => {
                        setFlash(`Saved canvass for ${activeVoter.name}`);
                        setActiveVoter(null);
                        setPinnedVoter(null);
                        // A typed building name is written to the geo layer on submit —
                        // reflect it on the selection chip right away too.
                        if (saved?.building_name && buildingCtx && !buildingCtx.building_name) {
                            setBuildingCtx({ ...buildingCtx, building_name: saved.building_name });
                        }
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
