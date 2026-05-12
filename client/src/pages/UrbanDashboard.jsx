import { useCallback, useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, GeoJSON, useMap, LayersControl, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import WardMultiSelect from '../components/canvassing/WardMultiSelect.jsx';
import VoterAreaMultiSelect from '../components/dashboard/VoterAreaMultiSelect.jsx';
import PollingToggle from '../components/dashboard/PollingToggle.jsx';
import PopulationStats from '../components/dashboard/PopulationStats.jsx';
import AssignUserCard from '../components/dashboard/AssignUserCard.jsx';
import CanvassedVotersModal from '../components/dashboard/CanvassedVotersModal.jsx';
import { LoadingState, ErrorState } from '../components/LoadingState.jsx';

import * as geoApi from '../api/geo.js';
import * as urbanApi from '../api/urban.js';
import * as adminApi from '../api/admin.js';

// ---- Dedupe voter areas by village_name -------------------------------
// Production has each voter area duplicated (union='<ward>' + union='X (Part)').
// We collapse the dupes, keep the underlying ids as `sibling_ids` so building
// lookups still cover them all, and drop empty/0-population orphan rows.
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
    const features = [...groups.values()].map((siblings) => {
        // Prefer the lowest voter_area_id (in production those carry the buildings).
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
    });
    return { type: 'FeatureCollection', features };
}

// ---- Color palette: layered greens, getting darker with more population ----
function shadeForPopulation(pop, max) {
    const p = Math.min(1, Number(pop || 0) / Math.max(max || 1, 1));
    // 6-step ramp going from light-mint to dark-brand-green
    const ramp = ['#E8F5E9', '#C8E6C9', '#A5D6A7', '#81C784', '#66BB6A', '#43A047', '#2E7D32', '#1B5E20'];
    const idx = Math.min(ramp.length - 1, Math.round(p * (ramp.length - 1)));
    return ramp[idx];
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

// Tiny polling-station pin (no external icon dependencies).
const pollingIcon = L.divIcon({
    className: '',
    html: '<div style="background:#C62828;color:#fff;border-radius:50% 50% 50% 0;width:18px;height:18px;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,0.3);"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 18],
});

export default function UrbanDashboard() {
    // --- state ---
    const [wardsGeo, setWardsGeo]                 = useState(null);
    const [voterAreasGeo, setVoterAreasGeo]       = useState(null);
    const [buildingsGeo, setBuildingsGeo]         = useState(null);
    const [pollingStations, setPollingStations]   = useState([]);
    const [users, setUsers]                       = useState([]);
    const [loadingBase, setLoadingBase]           = useState(true);
    const [loadingScope, setLoadingScope]         = useState(false);
    const [error, setError]                       = useState(null);

    const [wardIds, setWardIds]                   = useState([]);
    const [voterAreaIds, setVoterAreaIds]         = useState([]);
    const [showPolling, setShowPolling]           = useState(false);
    const [activeBuilding, setActiveBuilding]     = useState(null);

    // --- initial load: wards + users ---
    useEffect(() => {
        let cancelled = false;
        Promise.all([geoApi.wards(), adminApi.listUsers({ is_active: true, limit: 500 })])
            .then(([wards, usersResp]) => {
                if (cancelled) return;
                setWardsGeo(wards);
                setUsers(usersResp?.users || []);
            })
            .catch((err) => !cancelled && setError(err))
            .finally(() => !cancelled && setLoadingBase(false));
        return () => { cancelled = true; };
    }, []);

    // --- load voter areas when ward(s) are selected — multi-ward merge ---
    useEffect(() => {
        setVoterAreaIds([]);
        setBuildingsGeo(null);
        if (!wardIds.length) {
            setVoterAreasGeo(null);
            return;
        }
        setLoadingScope(true);
        Promise.all(wardIds.map((id) => geoApi.voterAreas({ ward_id: id })))
            .then((parts) => {
                const merged = { type: 'FeatureCollection', features: parts.flatMap((p) => p.features || []) };
                setVoterAreasGeo(dedupeVoterAreas(merged));
            })
            .catch((err) => setError(err))
            .finally(() => setLoadingScope(false));
    }, [wardIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

    // --- load buildings when voter areas selected ---
    // Expand selected primary ids to their sibling ids so we fetch buildings
    // from every underlying voter_area_id (handles production's duplicate rows).
    useEffect(() => {
        if (voterAreaIds.length === 0 || !voterAreasGeo) {
            setBuildingsGeo(null);
            return;
        }
        const allIds = new Set();
        for (const f of voterAreasGeo.features) {
            const id = String(f.properties.voter_area_id);
            if (voterAreaIds.includes(id)) {
                (f.properties.sibling_ids || [id]).forEach((s) => allIds.add(s));
            }
        }
        setLoadingScope(true);
        Promise.all([...allIds].map((id) => geoApi.buildings(id)))
            .then((parts) => {
                const features = parts.flatMap((p) => p.features || []);
                setBuildingsGeo({ type: 'FeatureCollection', features });
            })
            .catch((err) => setError(err))
            .finally(() => setLoadingScope(false));
    }, [voterAreaIds.join(','), voterAreasGeo]); // eslint-disable-line react-hooks/exhaustive-deps

    // --- polling stations (light fetch when toggled on) ---
    useEffect(() => {
        if (!showPolling || pollingStations.length) return;
        urbanApi
            .pollingStations(wardIds.length === 1 ? wardIds[0] : 'all')
            .then((res) => setPollingStations(res?.polling_stations || []))
            .catch(() => {});
    }, [showPolling, wardIds.join(','), pollingStations.length]); // eslint-disable-line react-hooks/exhaustive-deps

    // ----- derived: stats for current scope -----
    const stats = useMemo(() => {
        const empty = { total_population: 0, male_count: 0, female_count: 0 };
        const sumFeatures = (features) =>
            features.reduce(
                (acc, f) => {
                    acc.total_population += Number(f.properties.total_population || 0);
                    acc.male_count       += Number(f.properties.male_count || 0);
                    acc.female_count     += Number(f.properties.female_count || 0);
                    return acc;
                },
                { ...empty }
            );

        // Voter area scope wins
        if (voterAreaIds.length && voterAreasGeo) {
            return sumFeatures(
                voterAreasGeo.features.filter((f) =>
                    voterAreaIds.includes(String(f.properties.voter_area_id))
                )
            );
        }
        // Ward scope (one or more wards)
        if (wardIds.length && wardsGeo) {
            return sumFeatures(
                wardsGeo.features.filter((f) =>
                    wardIds.includes(String(f.properties.ward_id))
                )
            );
        }
        // Constituency scope
        return wardsGeo ? sumFeatures(wardsGeo.features) : empty;
    }, [wardsGeo, voterAreasGeo, wardIds, voterAreaIds]);

    // ----- derived: assignment target -----
    // Assignment only makes sense for an unambiguous single scope. With
    // multiple wards or multiple voter areas selected, we don't pick one
    // arbitrarily — the card disables itself.
    const assignTarget = useMemo(() => {
        if (voterAreaIds.length === 1 && voterAreasGeo) {
            const a = voterAreasGeo.features.find(
                (f) => String(f.properties.voter_area_id) === voterAreaIds[0]
            );
            if (a) {
                return {
                    type: 'voter_area',
                    value: a.properties.village_name || `Area ${a.properties.voter_area_id}`,
                    label: a.properties.village_name || `Area ${a.properties.voter_area_id}`,
                };
            }
        }
        if (wardIds.length === 1 && voterAreaIds.length === 0 && wardsGeo) {
            const w = wardsGeo.features.find(
                (f) => String(f.properties.ward_id) === wardIds[0]
            );
            if (w) {
                return {
                    type: 'voter_area',
                    value: `Ward ${w.properties.ward_number}`,
                    label: `Ward ${w.properties.ward_number}`,
                };
            }
        }
        return null;
    }, [wardIds, voterAreaIds, wardsGeo, voterAreasGeo]);

    const scopeLabel = useMemo(() => {
        if (voterAreaIds.length === 1) {
            const a = voterAreasGeo?.features.find(
                (f) => String(f.properties.voter_area_id) === voterAreaIds[0]
            );
            return a?.properties.village_name || 'Voter Area';
        }
        if (voterAreaIds.length > 1) return `${voterAreaIds.length} Voter Areas selected`;
        if (wardIds.length === 1 && wardsGeo) {
            const w = wardsGeo.features.find((f) => String(f.properties.ward_id) === wardIds[0]);
            return w ? `Ward ${w.properties.ward_number}` : 'Ward';
        }
        if (wardIds.length > 1) return `${wardIds.length} Wards selected`;
        return 'Constituency';
    }, [wardIds, voterAreaIds, wardsGeo, voterAreasGeo]);

    // ----- derived: layers shown on the map -----
    // Mode 1: no wards → constituency outline (union of wards, fill same color)
    // Mode 2: ward(s) picked → voter areas inside them (population shaded)
    // Mode 3: voter areas picked → outline those + their buildings
    const mode = voterAreaIds.length
        ? 'buildings'
        : wardIds.length
            ? 'voter_areas'
            : 'constituency';

    const voterAreaItems = useMemo(
        () =>
            (voterAreasGeo?.features || []).map((f) => ({
                voter_area_id: String(f.properties.voter_area_id),
                village_name: f.properties.village_name,
                total_population: f.properties.total_population,
            })),
        [voterAreasGeo]
    );

    const maxAreaPop = useMemo(() => {
        if (!voterAreasGeo) return 1;
        return Math.max(
            1,
            ...voterAreasGeo.features.map((f) => Number(f.properties.total_population || 0))
        );
    }, [voterAreasGeo]);

    // Fit bounds source — whichever layer is currently visible
    const fitFeatures = useMemo(() => {
        if (mode === 'buildings' && voterAreasGeo) {
            return voterAreasGeo.features.filter((f) =>
                voterAreaIds.includes(String(f.properties.voter_area_id))
            );
        }
        if (mode === 'voter_areas' && wardsGeo) {
            return wardsGeo.features.filter((f) => wardIds.includes(String(f.properties.ward_id)));
        }
        return wardsGeo?.features || [];
    }, [mode, wardsGeo, voterAreasGeo, wardIds, voterAreaIds]);

    if (loadingBase) return <LoadingState />;
    if (error)       return <ErrorState error={error} onRetry={() => window.location.reload()} />;

    return (
        <div className="h-full flex relative overflow-hidden">
            {/* Map fills the whole pane; cards are positioned on top */}
            <div className="absolute inset-0">
                <MapContainer
                    center={[23.7806, 90.3372]}
                    zoom={12}
                    style={{ height: '100%', width: '100%' }}
                    zoomControl={false}
                    preferCanvas
                >
                    <LayersControl position="bottomright">
                        <LayersControl.BaseLayer checked name="Light">
                            <TileLayer
                                url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
                                attribution="&copy; OpenStreetMap, &copy; CARTO"
                            />
                        </LayersControl.BaseLayer>
                        <LayersControl.BaseLayer name="OpenStreetMap">
                            <TileLayer
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                attribution="&copy; OpenStreetMap contributors"
                            />
                        </LayersControl.BaseLayer>
                        <LayersControl.BaseLayer name="Satellite">
                            <TileLayer
                                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                                attribution="Tiles &copy; Esri"
                            />
                        </LayersControl.BaseLayer>
                    </LayersControl>

                    {/* Constituency mode: union look = wards all in same fill */}
                    {mode === 'constituency' && wardsGeo && (
                        <GeoJSON
                            key={`constituency-${wardsGeo.features.length}`}
                            data={wardsGeo}
                            style={{
                                fillColor: '#4CAF50',
                                color: '#2E7D32',
                                weight: 1,
                                opacity: 0.9,
                                fillOpacity: 0.55,
                                dashArray: '0',
                            }}
                            onEachFeature={(f, layer) => {
                                layer.bindTooltip(
                                    `<strong>Ward ${f.properties.ward_number}</strong><br/>` +
                                    `${Number(f.properties.total_population).toLocaleString()} population`,
                                    { sticky: true }
                                );
                                // Click a ward on the map → select just that one.
                                layer.on('click', () => setWardIds([String(f.properties.ward_id)]));
                            }}
                        />
                    )}

                    {/* Ward outline(s) for all selected wards */}
                    {(mode === 'voter_areas' || mode === 'buildings') && wardsGeo && wardIds.length > 0 && (
                        <GeoJSON
                            key={`ward-${wardIds.join(',')}-${wardsGeo.features.length}`}
                            data={{
                                type: 'FeatureCollection',
                                features: wardsGeo.features.filter(
                                    (f) => wardIds.includes(String(f.properties.ward_id))
                                ),
                            }}
                            style={{
                                fillColor: 'transparent',
                                color: '#2E7D32',
                                weight: 2,
                                opacity: 1,
                                dashArray: '4,3',
                            }}
                        />
                    )}

                    {/* Voter-area mode: shade each area by population */}
                    {mode === 'voter_areas' && voterAreasGeo && (
                        <GeoJSON
                            key={`vas-${wardIds.join(',')}-${voterAreasGeo.features.length}`}
                            data={voterAreasGeo}
                            style={(f) => ({
                                fillColor: shadeForPopulation(f.properties.total_population, maxAreaPop),
                                color: '#2E7D32',
                                weight: 1.2,
                                opacity: 0.9,
                                fillOpacity: 0.7,
                                dashArray: '3,2',
                            })}
                            onEachFeature={(f, layer) => {
                                layer.bindTooltip(
                                    `<strong>${f.properties.village_name || 'Area'}</strong><br/>` +
                                    `${Number(f.properties.total_population || 0).toLocaleString()} pop`,
                                    { sticky: true }
                                );
                                layer.on('click', () =>
                                    setVoterAreaIds([String(f.properties.voter_area_id)])
                                );
                            }}
                        />
                    )}

                    {/* Buildings mode: outline of selected voter areas + their buildings */}
                    {mode === 'buildings' && voterAreasGeo && (
                        <GeoJSON
                            key={`vas-outline-${voterAreaIds.join(',')}-${voterAreasGeo.features.length}`}
                            data={{
                                type: 'FeatureCollection',
                                features: voterAreasGeo.features.filter((f) =>
                                    voterAreaIds.includes(String(f.properties.voter_area_id))
                                ),
                            }}
                            style={{
                                fillColor: 'transparent',
                                color: '#2E7D32',
                                weight: 2.5,
                                opacity: 1,
                                dashArray: '4,3',
                            }}
                        />
                    )}
                    {mode === 'buildings' && buildingsGeo && (
                        <GeoJSON
                            key={`bldgs-${voterAreaIds.join(',')}-${buildingsGeo.features.length}`}
                            data={buildingsGeo}
                            style={(f) => ({
                                fillColor: f.properties.canvassed ? '#2E7D32' : '#3F7BD9',
                                color: f.properties.canvassed ? '#1B5E20' : '#1565C0',
                                weight: 1,
                                opacity: 1,
                                fillOpacity: 0.7,
                            })}
                            onEachFeature={(f, layer) => {
                                const label =
                                    f.properties.building_name ||
                                    f.properties.name_bn ||
                                    [f.properties.house, f.properties.street].filter(Boolean).join(', ') ||
                                    `#${f.properties.building_id}`;
                                layer.bindTooltip(label, { sticky: true });
                                layer.on('click', () => setActiveBuilding(f.properties));
                            }}
                        />
                    )}

                    {/* Polling stations */}
                    {showPolling &&
                        pollingStations
                            .filter((p) => p.latitude && p.longitude)
                            .map((p) => (
                                <Marker
                                    key={p.polling_station_id}
                                    position={[p.latitude, p.longitude]}
                                    icon={pollingIcon}
                                >
                                    <Popup>
                                        <strong className="bn">
                                            {p.polling_centre_name || p.name || 'Polling Station'}
                                        </strong>
                                        {p.voter_area && <><br /><span className="bn">{p.voter_area}</span></>}
                                    </Popup>
                                </Marker>
                            ))}

                    <FitTo features={fitFeatures} />
                </MapContainer>
            </div>

            {/* Left filters panel */}
            <aside className="absolute left-4 top-4 bottom-4 w-[280px] z-[400] space-y-3 overflow-y-auto pr-1">
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
                <PollingToggle checked={showPolling} onChange={setShowPolling} />
                {loadingScope && (
                    <div className="bg-white border border-brand/30 rounded-lg shadow-sm p-3 text-xs text-gray-500 text-center">
                        <i className="fas fa-spinner fa-spin mr-1" /> Loading...
                    </div>
                )}
            </aside>

            {/* Right stats + assign panel */}
            <aside className="absolute right-4 top-4 bottom-4 w-[280px] z-[400] space-y-3 overflow-y-auto pl-1">
                <PopulationStats stats={stats} scopeLabel={scopeLabel} />
                <AssignUserCard users={users} target={assignTarget} />
            </aside>

            {activeBuilding && (
                <CanvassedVotersModal
                    building={activeBuilding}
                    onClose={() => setActiveBuilding(null)}
                />
            )}
        </div>
    );
}
