import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import WardMultiSelect from '../components/canvassing/WardMultiSelect.jsx';
import VoterAreaMultiSelect from '../components/canvassing/VoterAreaMultiSelect.jsx';
import VoterListPanel from '../components/canvassing/VoterListPanel.jsx';
import ActiveFilterChips from '../components/canvassing/ActiveFilterChips.jsx';
import CanvassFormModal from '../components/canvassing/CanvassFormModal.jsx';
import { LoadingState, ErrorState } from '../components/LoadingState.jsx';

import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext.jsx';
import { fetchWardsGeo, fetchVoterAreasGeo, fetchBuildingsGeo } from '../hooks/queries/index.js';

// --- Dedupe voter areas by village_name (production has each row twice) ---
function dedupeVoterAreas(geo) {
    if (!geo?.features) return geo;
    const groups = new Map();
    for (const f of geo.features) {
        const name = (f.properties.village_name || '').trim();
        if (!name) continue;
        if (Number(f.properties.total_population || 0) === 0) continue;
        const list = groups.get(name) || [];
        list.push(f);
        groups.set(name, list);
    }
    return {
        type: 'FeatureCollection',
        features: [...groups.values()].map((siblings) => {
            const sorted = [...siblings].sort(
                (a, b) => Number(a.properties.voter_area_id) - Number(b.properties.voter_area_id)
            );
            const primary = sorted[0];
            return {
                ...primary,
                properties: {
                    ...primary.properties,
                    sibling_ids: sorted.map((f) => String(f.properties.voter_area_id)),
                },
            };
        }),
    };
}

function fitToFeatures(features) {
    if (!features?.length) return null;
    try {
        const layer = L.geoJSON({ type: 'FeatureCollection', features });
        const b = layer.getBounds();
        return b.isValid() ? b : null;
    } catch {
        return null;
    }
}
function FitTo({ features }) {
    const map = useMap();
    useEffect(() => {
        const b = fitToFeatures(features);
        if (b) map.fitBounds(b, { padding: [40, 40] });
    }, [features, map]);
    return null;
}

// Bottom-center Satellite/Map toggle (replaces top-right layer control)
function BaseLayerToggle({ value, onChange }) {
    return (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[400] bg-white rounded-md shadow-md border border-gray-200 flex overflow-hidden">
            <button
                className={`px-4 py-2 text-sm font-medium ${value === 'satellite' ? 'bg-white text-gray-700' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                onClick={() => onChange('satellite')}
            >
                Satellite
            </button>
            <button
                className={`px-4 py-2 text-sm font-medium ${value === 'map' ? 'bg-brand text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                onClick={() => onChange('map')}
            >
                Map
            </button>
        </div>
    );
}

export default function UrbanCanvassingPage() {
    const queryClient = useQueryClient();
    const { candidate } = useAuth();
    const cid = candidate?.candidate_id;

    const [wardsGeo, setWardsGeo]                 = useState(null);
    const [voterAreasGeoAll, setVoterAreasGeoAll] = useState(null); // all areas (across selected wards)
    const [buildingsGeo, setBuildingsGeo]         = useState(null);
    const [loadingBase, setLoadingBase]           = useState(true);
    const [loadingScope, setLoadingScope]         = useState(false);
    const [error, setError]                       = useState(null);

    const [wardIds, setWardIds]                   = useState([]);
    const [voterAreaIds, setVoterAreaIds]         = useState([]);
    const [base, setBase]                         = useState('map');
    const [activeVoter, setActiveVoter]           = useState(null);
    // When a building is clicked, the right panel switches scope to that
    // building's voter area. Cleared automatically if the area selection
    // changes (effect below).
    const [activeBuilding, setActiveBuilding]     = useState(null);
    const [flash, setFlash]                       = useState(null);

    // Whenever wards or voter areas change, clear any active building so the
    // panel falls back to the area-level scope.
    useEffect(() => {
        setActiveBuilding(null);
    }, [wardIds.join(','), voterAreaIds.join(',')]);

    // --- initial load: all wards (cache-shared with the dashboard page) ---
    useEffect(() => {
        let cancelled = false;
        fetchWardsGeo(queryClient, cid)
            .then((data) => !cancelled && setWardsGeo(data))
            .catch((err) => !cancelled && setError(err))
            .finally(() => !cancelled && setLoadingBase(false));
        return () => { cancelled = true; };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // --- load voter areas for selected wards (multi-ward → multi fetch + merge) ---
    useEffect(() => {
        setVoterAreaIds([]);
        setBuildingsGeo(null);
        if (!wardIds.length) {
            setVoterAreasGeoAll(null);
            return;
        }
        setLoadingScope(true);
        Promise.all(wardIds.map((id) => fetchVoterAreasGeo(queryClient, cid, id)))
            .then((parts) => {
                const merged = { type: 'FeatureCollection', features: parts.flatMap((p) => p.features || []) };
                setVoterAreasGeoAll(dedupeVoterAreas(merged));
            })
            .catch((err) => setError(err))
            .finally(() => setLoadingScope(false));
    }, [wardIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

    // --- load buildings when voter areas selected ---
    useEffect(() => {
        if (!voterAreaIds.length || !voterAreasGeoAll) {
            setBuildingsGeo(null);
            return;
        }
        const allIds = new Set();
        for (const f of voterAreasGeoAll.features) {
            const id = String(f.properties.voter_area_id);
            if (voterAreaIds.includes(id)) {
                (f.properties.sibling_ids || [id]).forEach((s) => allIds.add(s));
            }
        }
        setLoadingScope(true);
        Promise.all([...allIds].map((id) => fetchBuildingsGeo(queryClient, cid, id)))
            .then((parts) => {
                const features = parts.flatMap((p) => p.features || []);
                setBuildingsGeo({ type: 'FeatureCollection', features });
            })
            .catch((err) => setError(err))
            .finally(() => setLoadingScope(false));
    }, [voterAreaIds.join(','), voterAreasGeoAll]); // eslint-disable-line react-hooks/exhaustive-deps

    // --- derived: items for voter-area dropdown (Bengali labels) ---
    const voterAreaItems = useMemo(
        () =>
            (voterAreasGeoAll?.features || []).map((f) => ({
                voter_area_id: String(f.properties.voter_area_id),
                label: f.properties.bangla_voter_area_name || f.properties.village_name,
                fallback_label: f.properties.village_name,
                total_population: f.properties.total_population,
            })),
        [voterAreasGeoAll]
    );

    // --- derived: bengali voter area names to query voters by ---
    const scopeAreas = useMemo(() => {
        if (!voterAreasGeoAll) return [];
        const names = new Set();
        for (const f of voterAreasGeoAll.features) {
            if (voterAreaIds.includes(String(f.properties.voter_area_id))) {
                if (f.properties.bangla_voter_area_name) names.add(f.properties.bangla_voter_area_name);
                if (f.properties.village_name) names.add(f.properties.village_name);
            }
        }
        return [...names];
    }, [voterAreaIds, voterAreasGeoAll]);

    // --- derived: scope label for the right-panel header (English fallback) ---
    const scopeLabel = useMemo(() => {
        if (voterAreaIds.length === 1) {
            const a = voterAreasGeoAll?.features.find(
                (f) => String(f.properties.voter_area_id) === voterAreaIds[0]
            );
            return a?.properties.village_name || a?.properties.bangla_voter_area_name || '';
        }
        if (voterAreaIds.length > 1) return `${voterAreaIds.length} voter areas`;
        return '';
    }, [voterAreaIds, voterAreasGeoAll]);

    // --- derived: visible ward + voter-area filter chips ---
    const activeFilters = useMemo(() => {
        const out = [];
        for (const id of wardIds) {
            const w = wardsGeo?.features.find((f) => String(f.properties.ward_id) === id);
            const label = w ? w.properties.ward_number : id;
            out.push({
                key: `ward-${id}`,
                label,
                onClear: () => setWardIds((arr) => arr.filter((x) => x !== id)),
            });
        }
        for (const id of voterAreaIds) {
            const a = voterAreasGeoAll?.features.find(
                (f) => String(f.properties.voter_area_id) === id
            );
            const label = a?.properties.village_name || a?.properties.bangla_voter_area_name || id;
            out.push({
                key: `va-${id}`,
                label,
                onClear: () => setVoterAreaIds((arr) => arr.filter((x) => x !== id)),
            });
        }
        return out;
    }, [wardIds, voterAreaIds, wardsGeo, voterAreasGeoAll]);

    // --- derived: map mode ---
    const mode = voterAreaIds.length ? 'buildings' : wardIds.length ? 'voter_areas' : 'constituency';

    // --- bounds fit ---
    const fitFeatures = useMemo(() => {
        if (mode === 'buildings' && voterAreasGeoAll) {
            return voterAreasGeoAll.features.filter((f) =>
                voterAreaIds.includes(String(f.properties.voter_area_id))
            );
        }
        if (mode === 'voter_areas' && wardsGeo) {
            return wardsGeo.features.filter((f) => wardIds.includes(String(f.properties.ward_id)));
        }
        return wardsGeo?.features || [];
    }, [mode, wardIds, voterAreaIds, wardsGeo, voterAreasGeoAll]);

    if (loadingBase) return <LoadingState full />;
    if (error)       return <ErrorState error={error} onRetry={() => window.location.reload()} />;

    return (
        <div className="h-full flex flex-col relative overflow-hidden">
            {/* Top bar — active filters chip strip */}
            {activeFilters.length > 0 && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] bg-white border border-gray-200 rounded-md shadow-md px-4 py-2">
                    <ActiveFilterChips filters={activeFilters} />
                </div>
            )}

            {flash && (
                <div className="absolute top-3 left-4 z-[500] bg-green-50 border border-green-200 text-green-700 rounded-md px-3 py-2 text-sm shadow-md">
                    <i className="fas fa-check-circle mr-1" /> {flash}
                </div>
            )}

            {/* Map fills the pane */}
            <div className="absolute inset-0">
                <MapContainer
                    center={[23.7806, 90.3372]}
                    zoom={12}
                    style={{ height: '100%', width: '100%' }}
                    zoomControl={false}
                    preferCanvas
                >
                    {base === 'satellite' ? (
                        <TileLayer
                            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                            attribution="Tiles &copy; Esri"
                        />
                    ) : (
                        <TileLayer
                            url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
                            attribution="&copy; OpenStreetMap, &copy; CARTO"
                        />
                    )}

                    {/* Constituency mode: all wards in one shade */}
                    {mode === 'constituency' && wardsGeo && (
                        <GeoJSON
                            key={`constituency-${wardsGeo.features.length}`}
                            data={wardsGeo}
                            style={{
                                fillColor: '#A5D6A7',
                                color: '#1B5E20',
                                weight: 1,
                                opacity: 0.95,
                                fillOpacity: 0.5,
                            }}
                            onEachFeature={(f, layer) => {
                                layer.bindTooltip(
                                    `Ward ${f.properties.ward_number}`,
                                    { sticky: true }
                                );
                                layer.on('click', () => setWardIds([String(f.properties.ward_id)]));
                            }}
                        />
                    )}

                    {/* Voter-areas layer — always render ALL areas of the picked wards.
                        Selected areas get a thick dashed outline (so buildings inside
                        show through); unselected areas stay filled and dimmer so the
                        user can still see them as context and click to switch. */}
                    {(mode === 'voter_areas' || mode === 'buildings') && voterAreasGeoAll && (
                        <GeoJSON
                            key={`va-${wardIds.join(',')}-${voterAreaIds.join(',')}-${voterAreasGeoAll.features.length}`}
                            data={voterAreasGeoAll}
                            style={(f) => {
                                const isSelected = voterAreaIds.includes(
                                    String(f.properties.voter_area_id)
                                );
                                if (isSelected) {
                                    return {
                                        fillColor: 'transparent',
                                        color: '#1B5E20',
                                        weight: 3,
                                        opacity: 1,
                                        dashArray: '4,3',
                                    };
                                }
                                return {
                                    fillColor: '#A5D6A7',
                                    color: '#1B5E20',
                                    weight: 1.2,
                                    // Dim unselected areas a bit when we're zoomed into one
                                    opacity: mode === 'buildings' ? 0.7 : 0.95,
                                    fillOpacity: mode === 'buildings' ? 0.25 : 0.55,
                                };
                            }}
                            onEachFeature={(f, layer) => {
                                layer.bindTooltip(
                                    f.properties.bangla_voter_area_name ||
                                        f.properties.village_name ||
                                        'Area',
                                    { sticky: true, className: 'bn-tooltip' }
                                );
                                // Map click always REPLACES selection with the clicked
                                // area — fastest way to navigate between areas.
                                layer.on('click', () =>
                                    setVoterAreaIds([String(f.properties.voter_area_id)])
                                );
                            }}
                        />
                    )}

                    {/* Buildings layer */}
                    {mode === 'buildings' && buildingsGeo && (
                        <GeoJSON
                            key={`bldgs-${voterAreaIds.join(',')}-${buildingsGeo.features.length}-${activeBuilding?.building_id || ''}`}
                            data={buildingsGeo}
                            style={(f) => {
                                const isActive =
                                    activeBuilding &&
                                    String(f.properties.building_id) ===
                                        String(activeBuilding.building_id);
                                if (isActive) {
                                    return {
                                        fillColor: '#0D47A1',
                                        color: '#0B3D91',
                                        weight: 2.5,
                                        opacity: 1,
                                        fillOpacity: 0.95,
                                    };
                                }
                                return {
                                    fillColor: f.properties.canvassed ? '#2E7D32' : '#3F7BD9',
                                    color: f.properties.canvassed ? '#1B5E20' : '#1565C0',
                                    weight: 1,
                                    opacity: 1,
                                    fillOpacity: 0.7,
                                };
                            }}
                            onEachFeature={(f, layer) => {
                                layer.bindTooltip('Click to see voters', { sticky: true });
                                layer.on('click', () => setActiveBuilding(f.properties));
                            }}
                        />
                    )}

                    <FitTo features={fitFeatures} />
                </MapContainer>

                <BaseLayerToggle value={base} onChange={setBase} />
            </div>

            {/* Left filter panel */}
            <aside className="absolute left-4 top-4 bottom-4 w-[min(85vw,280px)] z-[400] space-y-3 overflow-y-auto pr-1">
                <WardMultiSelect
                    wards={(wardsGeo?.features || []).map((f) => ({
                        ward_id: String(f.properties.ward_id),
                        ward_number: f.properties.ward_number,
                    }))}
                    value={wardIds}
                    onChange={setWardIds}
                />
                <VoterAreaMultiSelect
                    items={voterAreaItems}
                    value={voterAreaIds}
                    onChange={setVoterAreaIds}
                    disabled={!wardIds.length || !voterAreaItems.length}
                />
                {loadingScope && (
                    <div className="bg-white border border-brand/30 rounded-lg shadow-sm p-3 text-xs text-gray-500 text-center">
                        <i className="fas fa-spinner fa-spin mr-1" /> Loading...
                    </div>
                )}
            </aside>

            {/* Right voter list panel */}
            <aside className="absolute right-4 top-4 bottom-4 w-[min(94vw,380px)] z-[400]">
                <VoterListPanel
                    scopeAreas={scopeAreas}
                    scopeLabel={scopeLabel}
                    building={activeBuilding}
                    onClearBuilding={() => setActiveBuilding(null)}
                    onPickVoter={(v) => setActiveVoter(v)}
                />
            </aside>

            {activeVoter && (
                <CanvassFormModal
                    voter={activeVoter}
                    onClose={() => setActiveVoter(null)}
                    onSubmitted={() => {
                        setFlash(`Saved canvass for ${activeVoter.name}`);
                        setActiveVoter(null);
                        setTimeout(() => setFlash(null), 4000);
                    }}
                />
            )}
        </div>
    );
}
