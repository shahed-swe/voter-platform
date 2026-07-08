import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, GeoJSON, useMap, LayersControl, Marker, Popup, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

import * as layersApi from '../api/layers.js';
import CanvassedVotersModal from './dashboard/CanvassedVotersModal.jsx';
import { LoadingState, ErrorState } from './LoadingState.jsx';
import { wardLabelToScope } from '../utils/geoScope.js';

// Leaflet's default marker icon resolves its PNGs via a computed path that 404s
// under a bundler. Point them at the bundled assets so any default marker (e.g.
// a stray Point feature) renders instead of showing a broken image.
L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
});

// Blue teardrop pin for pinned voter
const voterPin = L.divIcon({
    className: '',
    html: '<div style="background:#4f46e5;width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 3px 12px rgba(79,70,229,0.55);display:flex;align-items:center;justify-content:center;"><i class="fas fa-user" style="transform:rotate(45deg);color:white;font-size:13px;"></i></div>',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -34],
});

// Red teardrop pin for overlay point layers (e.g. polling stations)
const overlayPin = L.divIcon({
    className: '',
    html: '<div style="background:#C62828;width:16px;height:16px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,0.3)"></div>',
    iconSize: [16, 16],
    iconAnchor: [8, 16],
});

// Pulsing blue dot for the canvasser's own live location (#8).
const myLocationIcon = L.divIcon({
    className: '',
    html: `<div style="position:relative;width:18px;height:18px;">
        <span style="position:absolute;inset:0;border-radius:50%;background:rgba(37,99,235,0.35);animation:vmpulse 1.8s ease-out infinite"></span>
        <span style="position:absolute;top:3px;left:3px;width:12px;height:12px;border-radius:50%;background:#2563eb;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></span>
    </div>
    <style>@keyframes vmpulse{0%{transform:scale(0.6);opacity:0.9}100%{transform:scale(2.4);opacity:0}}</style>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
});

// ----- Style helpers -------------------------------------------------------

function bucketColor(value, buckets, palette) {
    const n = Number(value || 0);
    let idx = 0;
    for (let i = 0; i < buckets.length; i++) if (n >= buckets[i]) idx = i;
    return palette[Math.min(idx, palette.length - 1)];
}

function styleFor(layerSpec, feature) {
    const p = feature.properties;
    const base = layerSpec.style || {};

    // Canvassed buildings are highlighted green regardless of the layer's
    // configured color_by (#6). `canvassed` is set by the backend building fetch.
    if (p.canvassed) {
        return {
            fillColor:   '#2E7D32',
            color:       '#1B5E20',
            weight:      base.weight ?? 1,
            opacity:     base.opacity ?? 1,
            fillOpacity: base.fillOpacity ?? 0.75,
        };
    }

    if (layerSpec.color_by === 'bucket') {
        const palette = layerSpec.bucket_palette ||
            ['#E8F5E9', '#A5D6A7', '#66BB6A', '#2E7D32', '#1B5E20'];
        const buckets = layerSpec.buckets || [0];
        const field = layerSpec.bucket_field || 'total_population';
        return {
            fillColor:   bucketColor(p[field], buckets, palette),
            color:       base.stroke || '#1B5E20',
            weight:      base.weight ?? 1,
            opacity:     base.opacity ?? 0.95,
            fillOpacity: base.fillOpacity ?? 0.55,
        };
    }
    if (layerSpec.color_by === 'canvassed') {
        // Buildings get green if canvassed, blue otherwise.
        return {
            fillColor:   p.canvassed ? '#2E7D32' : '#3F7BD9',
            color:       p.canvassed ? '#1B5E20' : '#1565C0',
            weight:      base.weight ?? 1,
            opacity:     base.opacity ?? 1,
            fillOpacity: base.fillOpacity ?? 0.7,
        };
    }
    // uniform
    return {
        fillColor:   base.fill   || '#A5D6A7',
        color:       base.stroke || '#1B5E20',
        weight:      base.weight ?? 1,
        opacity:     base.opacity ?? 0.95,
        fillOpacity: base.fillOpacity ?? 0.55,
    };
}

// Auto-fit to whatever features are visible
function FitTo({ features }) {
    const map = useMap();
    useEffect(() => {
        if (!features?.length) return;
        try {
            const layer = L.geoJSON({ type: 'FeatureCollection', features });
            const b = layer.getBounds();
            if (b.isValid()) map.fitBounds(b, { padding: [40, 40] });
        } catch { /* ignore */ }
    }, [features, map]);
    return null;
}

// Highlight the selected wards (multi-select nav) in green and fit the map to
// them — like the old dhaka13/panchagarh behaviour. Clicking a highlighted ward
// narrows the selection to just that ward.
function WardHighlight({ focusWards, wardLayer, onWardClick }) {
    const map = useMap();
    const [feats, setFeats] = useState(null);

    useEffect(() => {
        if (!focusWards?.length || !wardLayer) { setFeats(null); return; }
        let cancelled = false;
        layersApi.fetchSource(wardLayer.source).then((fc) => {
            if (cancelled) return;
            const matched = (fc.features || []).filter((f) => {
                const scope = wardLabelToScope(f.properties?.[wardLayer.label_from || 'name']);
                return scope?.ward && focusWards.includes(scope.ward);
            });
            setFeats(matched);
            if (matched.length) {
                try {
                    const b = L.geoJSON({ type: 'FeatureCollection', features: matched }).getBounds();
                    if (b.isValid()) map.fitBounds(b, { padding: [30, 30] });
                } catch { /* ignore */ }
            }
        }).catch(() => {});
        return () => { cancelled = true; };
    }, [JSON.stringify(focusWards), wardLayer?.source]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!feats?.length) return null;
    return (
        <GeoJSON
            key={`wh-${focusWards.join(',')}`}
            data={{ type: 'FeatureCollection', features: feats }}
            style={{ color: '#1B5E20', weight: 2.5, fillColor: '#2E7D32', fillOpacity: 0.45 }}
            onEachFeature={(f, layer) => {
                const label = f.properties?.[wardLayer.label_from || 'name'];
                if (label) layer.bindTooltip(String(label), { sticky: true });
                layer.on('click', () => {
                    const scope = wardLabelToScope(label);
                    if (scope?.ward) onWardClick?.(scope.ward);
                });
            }}
        />
    );
}

// ----- Drill-state machine -------------------------------------------------
//
// `drillStack` is an array, one entry per CURRENTLY DRILLED-INTO layer above
// the deepest visible one. e.g. for urban dhaka13 with config [wards, voter_areas, buildings]:
//   stack = []                          → just wards visible (root)
//   stack = [{layer:'wards',  id:'48'}] → ward 48 + its voter areas visible
//   stack = [..., {layer:'voter_areas', id:'554'}] → also buildings of voter area 554
//
// We render layer index 0..stack.length (parents kept visible as context).

export default function DynamicMap({
    config,
    candidateId,
    height,
    controlledDrill,
    onDrillChange,
    onLeafClick,         // optional: ({wardLabel, feature}) => void — fired when a 'voters' leaf is clicked
    pinnedVoter,         // optional: voter object to show as a map pin at the ward centre
    onPinnedVoterClick,  // optional: () => void — fired when the voter pin is clicked
    allowedWards,        // optional: string[] (Bengali digits) — restrict the ward layer to these wards only
    focusWards,          // optional: string[] (Bengali digits) — highlight + fit the map to these wards
    onWardClick,         // optional: (wardValue) => void — clicking a highlighted ward
}) {
    const allLayers = Array.isArray(config?.layers) ? config.layers : [];
    // Drill layers form the click-to-drill hierarchy; overlay layers are
    // toggleable marker layers (e.g. polling stations) shown on top.
    const layersSpec    = allLayers.filter((l) => !l.overlay);
    const overlayLayers = allLayers.filter((l) => l.overlay);
    const center = config?.center || [23.78, 90.34];
    const zoom   = config?.zoom   || 12;

    const [internalDrillStack, setInternalDrillStack] = useState([]);
    // Use controlled stack when provided, otherwise internal
    const drillStack = controlledDrill !== undefined ? controlledDrill : internalDrillStack;

    const [dataByLayer, setDataByLayer] = useState({}); // layerId → FeatureCollection
    const [loading, setLoading]         = useState(false);
    const [error, setError]             = useState(null);
    const [activeBuilding, setActiveBuilding] = useState(null);
    const [overlayOn, setOverlayOn]     = useState({});  // overlayId → bool
    const [overlayData, setOverlayData] = useState({});  // overlayId → FeatureCollection
    const [myLocation, setMyLocation]   = useState(null); // [lat, lng] — canvasser's live position (#8)

    // Track the canvasser's location. Needs an HTTPS secure context (see docs/HTTPS.md);
    // fails silently on http:// (except localhost).
    useEffect(() => {
        if (!('geolocation' in navigator)) return;
        const id = navigator.geolocation.watchPosition(
            (pos) => setMyLocation([pos.coords.latitude, pos.coords.longitude]),
            () => { /* permission denied / unavailable — no marker */ },
            { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
        );
        return () => navigator.geolocation.clearWatch(id);
    }, []);

    // Helper: update drill stack (internal or external)
    function setDrillStack(val) {
        const newStack = typeof val === 'function' ? val(drillStack) : val;
        if (controlledDrill !== undefined) {
            onDrillChange?.(newStack);
        } else {
            setInternalDrillStack(newStack);
        }
    }

    // Reset stack when candidate changes
    useEffect(() => {
        setInternalDrillStack([]);
        setDataByLayer({});
        setActiveBuilding(null);
        setOverlayOn({});
        setOverlayData({});
    }, [candidateId, JSON.stringify(allLayers.map((l) => l.id))]);

    // Fetch an overlay layer's features the first time it's toggled on.
    function toggleOverlay(spec) {
        const on = !overlayOn[spec.id];
        setOverlayOn((m) => ({ ...m, [spec.id]: on }));
        if (on && !overlayData[spec.id]) {
            layersApi.fetchSource(spec.source)
                .then((d) => setOverlayData((m) => ({ ...m, [spec.id]: d })))
                .catch(() => {});
        }
    }

    // Index spec by layer.id for fast lookup
    const specsById = useMemo(() => {
        const m = {};
        for (const l of layersSpec) m[l.id] = l;
        return m;
    }, [layersSpec]);

    // The currently deepest visible layer
    const deepest = layersSpec[drillStack.length];

    // Fetch root layer whenever candidate changes (no caching)
    useEffect(() => {
        if (!layersSpec.length) return;
        const root = layersSpec[0];
        let cancelled = false;
        setLoading(true);
        setDataByLayer({});          // clear all stale data first
        layersApi
            .fetchSource(root.source)
            .then((d) => !cancelled && setDataByLayer({ [root.id]: d }))
            .catch((err) => !cancelled && setError(err))
            .finally(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
    }, [candidateId, JSON.stringify(layersSpec.map((l) => l.id))]); // eslint-disable-line react-hooks/exhaustive-deps

    // Fetch child layer fresh every time the drill selection changes (no caching)
    useEffect(() => {
        if (!deepest) return;
        const parentStack = drillStack[drillStack.length - 1];
        if (!parentStack) return;     // root level — handled above

        const parentFk = deepest.parent_fk;
        if (!parentFk) {
            console.warn(`Layer "${deepest.id}" has no parent_fk; skipping fetch`);
            return;
        }

        let cancelled = false;
        setLoading(true);
        layersApi
            .fetchByParent(deepest.source, parentFk, parentStack.id)
            .then((d) => {
                if (cancelled) return;
                // Store result keyed so we can keep parent context layers visible
                const key = `${deepest.id}|${drillStack.map((s) => s.id).join('>')}`;
                setDataByLayer((m) => ({ ...m, [key]: d }));
            })
            .catch((err) => !cancelled && setError(err))
            .finally(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
    }, [JSON.stringify(drillStack.map((s) => s.id)), candidateId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Restrict a ward layer's features to the volunteer's allowed wards.
    // Non-ward layers and unrestricted users pass through unchanged.
    function restrictWards(spec, data) {
        if (!allowedWards?.length || spec?.id !== 'ward' || !data?.features) return data;
        const features = data.features.filter((f) => {
            const scope = wardLabelToScope(f.properties?.[spec.label_from || 'name']);
            return !scope?.ward || allowedWards.includes(scope.ward);
        });
        return { ...data, features };
    }

    // Resolve data for each visible layer index
    function dataForIndex(idx) {
        const spec = layersSpec[idx];
        if (!spec) return null;
        const raw = idx === 0
            ? dataByLayer[spec.id]
            : dataByLayer[`${spec.id}|${drillStack.slice(0, idx).map((s) => s.id).join('>')}`];
        return restrictWards(spec, raw);
    }

    // Compute the best available centre for the voter pin.
    // Prefers the deepest drilled level (village > ward) so the pin lands inside
    // the visible building cluster rather than at the ward's bounding-box centre.
    const pinnedWardCenter = useMemo(() => {
        if (!pinnedVoter) return null;
        // #4 — if this voter was already canvassed at a building, pin them at that
        // exact building location rather than the ward's bounding-box centre.
        const clat = Number(pinnedVoter.canvass_latitude);
        const clng = Number(pinnedVoter.canvass_longitude);
        if (Number.isFinite(clat) && Number.isFinite(clng) && (clat !== 0 || clng !== 0)) {
            return [clat, clng];
        }
        // Walk from deepest (village, index 2) up to ward (index 1)
        for (let depth = Math.min(drillStack.length - 1, layersSpec.length - 2); depth >= 1; depth--) {
            const entry = drillStack[depth];
            if (!entry) continue;
            const spec  = layersSpec[depth];
            if (!spec)  continue;
            const ancestorIds = drillStack.slice(0, depth).map((s) => s.id).join('>');
            const data  = dataByLayer[`${spec.id}|${ancestorIds}`];
            const feat  = data?.features?.find((f) => f.properties.feature_id === entry.id);
            if (!feat)  continue;
            try {
                const bounds = L.geoJSON(feat).getBounds();
                if (!bounds.isValid()) continue;
                const c = bounds.getCenter();
                return [c.lat, c.lng];
            } catch { /* try shallower level */ }
        }
        return null;
    }, [pinnedVoter?.voter_id, JSON.stringify(drillStack.map((s) => s.id)), dataByLayer]); // eslint-disable-line react-hooks/exhaustive-deps

    function onFeatureClick(spec, feature) {
        const action = spec.click || 'drill';
        if (action.startsWith('modal:')) {
            if (action === 'modal:canvassed_voters') setActiveBuilding(feature.properties);
            return;
        }
        if (action === 'select') return;
        if (action === 'voters') {
            // Leaf layer (building) — fire parent callback with the ward context from drillStack
            // drillStack = [{constituency}, {ward}, {village}]; ward is index 1
            const wardLabel = drillStack[1]?.label || null;
            // Capture the building's id + centroid so the canvass can be tagged to
            // this building and reuse its geolocation for the voter (#4, #6).
            let center = null;
            try {
                const c = L.geoJSON(feature).getBounds().getCenter();
                center = [c.lat, c.lng];
            } catch { /* no geometry */ }
            const p = feature.properties || {};
            onLeafClick?.({
                wardLabel,
                feature: p,
                building: {
                    building_id:   p.feature_id ?? null,
                    building_name: p.name ?? p.building_name ?? null,
                    latitude:      center?.[0] ?? p.latitude ?? null,
                    longitude:     center?.[1] ?? p.longitude ?? null,
                },
            });
            return;
        }
        // Default: drill
        const idx = layersSpec.findIndex((l) => l.id === spec.id);
        const nextLayer = layersSpec[idx + 1];
        if (!nextLayer) return;
        const idCol = guessIdCol(spec);
        const id = feature.properties[idCol];
        if (id == null) return;
        setDrillStack((stack) => {
            const trimmed = stack.slice(0, idx);
            return [...trimmed, { id: String(id), label: feature.properties[spec.label_from] }];
        });
    }

    if (!layersSpec.length && !overlayLayers.length) {
        return <ErrorState error={{ message: 'No layers configured for this candidate' }} />;
    }
    if (error) return <ErrorState error={error} onRetry={() => window.location.reload()} />;

    // Visible layers: root + every layer we've drilled into a parent of
    const visibleCount = drillStack.length + 1;
    const visibleData  = layersSpec.slice(0, visibleCount).map((_, i) => dataForIndex(i));
    const deepestData  = visibleData[visibleData.length - 1];

    return (
        <div className="relative" style={{ height: height || '100%', width: '100%' }}>
            <MapContainer
                center={center}
                zoom={zoom}
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

                {layersSpec.slice(0, visibleCount).map((spec, i) => {
                    const data = visibleData[i];
                    if (!data || !data.features?.length) return null;
                    const isDeepest = i === visibleCount - 1;
                    return (
                        <GeoJSON
                            key={`${spec.id}-${i === 0 ? 'root' : drillStack[i - 1]?.id}-${data.features.length}`}
                            data={data}
                            // Some layers mix polygons with Point features (e.g. a
                            // handful of point-only buildings). Render points as styled
                            // circle markers — otherwise react-leaflet falls back to the
                            // default Leaflet icon, whose PNGs 404 under the bundler and
                            // show as broken images.
                            pointToLayer={(f, latlng) => {
                                const s = styleFor(spec, f);
                                const st = isDeepest
                                    ? s
                                    : { ...s, fillOpacity: (s.fillOpacity ?? 0.55) * 0.4, weight: (s.weight ?? 1) * 0.7 };
                                return L.circleMarker(latlng, { radius: 6, ...st });
                            }}
                            style={(f) => {
                                const s = styleFor(spec, f);
                                return isDeepest
                                    ? s
                                    // Parent layers are kept as visual context — dim them
                                    : { ...s, fillOpacity: (s.fillOpacity ?? 0.55) * 0.4, weight: (s.weight ?? 1) * 0.7 };
                            }}
                            onEachFeature={(f, layer) => {
                                if (spec.label_from && f.properties[spec.label_from] != null) {
                                    const cc = f.properties.canvass_count;
                                    const lbl = String(f.properties[spec.label_from])
                                        + (cc > 0 ? ` — ${cc} canvassed` : '');
                                    layer.bindTooltip(lbl, { sticky: true });
                                }
                                if (isDeepest) {
                                    layer.on('click', () => onFeatureClick(spec, f));
                                }
                            }}
                        />
                    );
                })}

                {/* Overlay layers — toggleable markers/shapes on top of the drill view */}
                {overlayLayers.map((spec) => {
                    if (!overlayOn[spec.id]) return null;
                    const d = overlayData[spec.id];
                    if (!d?.features?.length) return null;
                    return d.features.map((f, idx) => {
                        const g = f.geometry;
                        if (g?.type === 'Point') {
                            const [lng, lat] = g.coordinates;
                            return (
                                <Marker key={`${spec.id}-${idx}`} position={[lat, lng]} icon={overlayPin}>
                                    <Popup>
                                        <strong className="bn">
                                            {f.properties[spec.label_from] || f.properties.name || spec.id}
                                        </strong>
                                    </Popup>
                                </Marker>
                            );
                        }
                        // Non-point overlays render as light outlines
                        return (
                            <GeoJSON
                                key={`${spec.id}-${idx}`}
                                data={f}
                                style={{ color: '#C62828', weight: 1.5, fillOpacity: 0.1 }}
                            />
                        );
                    });
                })}

                {/* Voter pin — shown when a voter has been selected from the list */}
                {pinnedWardCenter && pinnedVoter && (
                    <Marker
                        position={pinnedWardCenter}
                        icon={voterPin}
                        eventHandlers={{ click: () => onPinnedVoterClick?.(pinnedVoter) }}
                    >
                        <Tooltip direction="top" offset={[0, -34]} opacity={1}>
                            <span className="text-xs font-semibold">{pinnedVoter.name || pinnedVoter.voter_id}</span>
                            <span className="block text-[10px] text-gray-500">{pinnedVoter.ward}</span>
                        </Tooltip>
                    </Marker>
                )}

                {/* Canvasser's own live location (#8) */}
                {myLocation && (
                    <Marker position={myLocation} icon={myLocationIcon} zIndexOffset={1000}>
                        <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                            <span className="text-xs font-semibold bn">আপনি এখানে</span>
                        </Tooltip>
                    </Marker>
                )}

                <FitTo features={deepestData?.features} />
                <WardHighlight focusWards={focusWards} wardLayer={layersSpec[1]} onWardClick={onWardClick} />
            </MapContainer>

            {/* Breadcrumb of drill state — only when NOT externally controlled
                (GeoNavigator provides its own navigation in that case) */}
            {controlledDrill === undefined && drillStack.length > 0 && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] bg-white rounded-md shadow-md border border-gray-200 px-3 py-1.5 text-sm flex items-center gap-1">
                    <button
                        className="text-brand hover:underline"
                        onClick={() => setDrillStack([])}
                    >
                        {layersSpec[0]?.id}
                    </button>
                    {drillStack.map((s, i) => (
                        <span key={i} className="flex items-center gap-1">
                            <i className="fas fa-chevron-right text-gray-300 text-xs" />
                            <button
                                className={i === drillStack.length - 1 ? 'text-gray-700 font-medium' : 'text-brand hover:underline'}
                                onClick={() => setDrillStack((stack) => stack.slice(0, i + 1))}
                            >
                                {s.label || s.id}
                            </button>
                        </span>
                    ))}
                </div>
            )}

            {/* Overlay toggles (e.g. Show Polling Stations) */}
            {overlayLayers.length > 0 && (
                <div className="absolute top-4 right-4 z-[500] bg-white rounded-md shadow-md border border-gray-200 px-3 py-2 space-y-1.5">
                    {overlayLayers.map((spec) => (
                        <label key={spec.id} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                                type="checkbox"
                                className="accent-brand"
                                checked={!!overlayOn[spec.id]}
                                onChange={() => toggleOverlay(spec)}
                            />
                            <i className="fas fa-location-dot text-red-600" />
                            <span>{spec.label || spec.id}</span>
                        </label>
                    ))}
                </div>
            )}

            {loading && (
                <div className="absolute bottom-4 left-4 z-[500] bg-white rounded-md shadow-md px-3 py-2 text-xs text-gray-500">
                    <i className="fas fa-spinner fa-spin mr-1" /> Loading...
                </div>
            )}

            {activeBuilding && (
                <CanvassedVotersModal
                    building={activeBuilding}
                    onClose={() => setActiveBuilding(null)}
                />
            )}
        </div>
    );
}

// Each `source` has a known PK column. We use it to read the clicked feature's
// id, which becomes the parent_value the child layer is scoped to.
const ID_COL_BY_SOURCE = {
    wards:            'ward_id',
    voter_areas:      'voter_area_id',
    villages:         'village_id',
    buildings:        'building_id',
    polling_stations: 'polling_station_id',
};
function guessIdCol(spec) {
    // Generic geo_layers features always identify by feature_id.
    if (typeof spec.source === 'string' && spec.source.startsWith('geo:')) {
        return spec.id_field || 'feature_id';
    }
    if (spec.id_field) return spec.id_field;
    return ID_COL_BY_SOURCE[spec.source] || `${spec.source}_id`;
}
