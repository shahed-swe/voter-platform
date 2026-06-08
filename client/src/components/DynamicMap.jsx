import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, GeoJSON, useMap, LayersControl, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import * as layersApi from '../api/layers.js';
import CanvassedVotersModal from './dashboard/CanvassedVotersModal.jsx';
import { LoadingState, ErrorState } from './LoadingState.jsx';

// Red teardrop pin for overlay point layers (e.g. polling stations)
const overlayPin = L.divIcon({
    className: '',
    html: '<div style="background:#C62828;width:16px;height:16px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,0.3)"></div>',
    iconSize: [16, 16],
    iconAnchor: [8, 16],
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
    candidateId,    // used as cache key so switching candidates clears state
    height,
}) {
    const allLayers = Array.isArray(config?.layers) ? config.layers : [];
    // Drill layers form the click-to-drill hierarchy; overlay layers are
    // toggleable marker layers (e.g. polling stations) shown on top.
    const layersSpec    = allLayers.filter((l) => !l.overlay);
    const overlayLayers = allLayers.filter((l) => l.overlay);
    const center = config?.center || [23.78, 90.34];
    const zoom   = config?.zoom   || 12;

    const [drillStack, setDrillStack]   = useState([]);
    const [dataByLayer, setDataByLayer] = useState({}); // layerId → FeatureCollection
    const [loading, setLoading]         = useState(false);
    const [error, setError]             = useState(null);
    const [activeBuilding, setActiveBuilding] = useState(null);
    const [overlayOn, setOverlayOn]     = useState({});  // overlayId → bool
    const [overlayData, setOverlayData] = useState({});  // overlayId → FeatureCollection

    // Reset stack when candidate changes
    useEffect(() => {
        setDrillStack([]);
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

    // Fetch root layer (the first one) on mount
    useEffect(() => {
        if (!layersSpec.length) return;
        const root = layersSpec[0];
        if (dataByLayer[root.id]) return; // already cached
        let cancelled = false;
        setLoading(true);
        layersApi
            .fetchSource(root.source)
            .then((d) => !cancelled && setDataByLayer((m) => ({ ...m, [root.id]: d })))
            .catch((err) => !cancelled && setError(err))
            .finally(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
    }, [layersSpec, candidateId]); // eslint-disable-line react-hooks/exhaustive-deps

    // When drillStack grows, fetch the next layer scoped to the just-clicked parent
    useEffect(() => {
        if (!deepest) return;
        const cacheKey = `${deepest.id}|${drillStack.map((s) => s.id).join('>')}`;
        if (dataByLayer[cacheKey]) return;
        const parentStack = drillStack[drillStack.length - 1];
        if (!parentStack) return;     // root already fetched above

        const parentFk = deepest.parent_fk;
        if (!parentFk) {
            console.warn(`Layer "${deepest.id}" has no parent_fk; skipping fetch`);
            return;
        }

        let cancelled = false;
        setLoading(true);
        layersApi
            .fetchByParent(deepest.source, parentFk, parentStack.id)
            .then((d) => !cancelled && setDataByLayer((m) => ({ ...m, [cacheKey]: d })))
            .catch((err) => !cancelled && setError(err))
            .finally(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
    }, [drillStack, deepest]); // eslint-disable-line react-hooks/exhaustive-deps

    // Resolve data for each visible layer index
    function dataForIndex(idx) {
        const spec = layersSpec[idx];
        if (!spec) return null;
        if (idx === 0) return dataByLayer[spec.id];
        const ancestorIds = drillStack.slice(0, idx).map((s) => s.id).join('>');
        return dataByLayer[`${spec.id}|${ancestorIds}`];
    }

    function onFeatureClick(spec, feature) {
        const action = spec.click || 'drill';
        if (action.startsWith('modal:')) {
            if (action === 'modal:canvassed_voters') setActiveBuilding(feature.properties);
            return;
        }
        if (action === 'select') return;
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
                            style={(f) => {
                                const s = styleFor(spec, f);
                                return isDeepest
                                    ? s
                                    // Parent layers are kept as visual context — dim them
                                    : { ...s, fillOpacity: (s.fillOpacity ?? 0.55) * 0.4, weight: (s.weight ?? 1) * 0.7 };
                            }}
                            onEachFeature={(f, layer) => {
                                if (spec.label_from && f.properties[spec.label_from] != null) {
                                    layer.bindTooltip(String(f.properties[spec.label_from]), { sticky: true });
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

                <FitTo features={deepestData?.features} />
            </MapContainer>

            {/* Breadcrumb of drill state — small floater top-left */}
            {drillStack.length > 0 && (
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
