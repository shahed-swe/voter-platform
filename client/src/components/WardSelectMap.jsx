import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, GeoJSON, useMap, Marker, Tooltip, LayersControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

import * as layersApi from '../api/layers.js';
import * as votersApi from '../api/voters.js';
import { wardLabelToScope } from '../utils/geoScope.js';

L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

const myLocationIcon = L.divIcon({
    className: '',
    html: `<div style="position:relative;width:18px;height:18px;">
        <span style="position:absolute;inset:0;border-radius:50%;background:rgba(37,99,235,0.35);animation:vmpulse 1.8s ease-out infinite"></span>
        <span style="position:absolute;top:3px;left:3px;width:12px;height:12px;border-radius:50%;background:#2563eb;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></span>
    </div><style>@keyframes vmpulse{0%{transform:scale(0.6);opacity:0.9}100%{transform:scale(2.4);opacity:0}}</style>`,
    iconSize: [18, 18], iconAnchor: [9, 9],
});
const voterPin = L.divIcon({
    className: '',
    html: '<div style="background:#4f46e5;width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 3px 12px rgba(79,70,229,0.55);display:flex;align-items:center;justify-content:center;"><i class="fas fa-user" style="transform:rotate(45deg);color:white;font-size:12px;"></i></div>',
    iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -32],
});

function FitTo({ features }) {
    const map = useMap();
    useEffect(() => {
        if (!features?.length) return;
        try {
            const b = L.geoJSON({ type: 'FeatureCollection', features }).getBounds();
            if (b.isValid()) map.fitBounds(b, { padding: [30, 30] });
        } catch { /* ignore */ }
    }, [features, map]); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
}

/**
 * Bidirectional ward-selection map. Renders every ward of the constituency;
 * selected wards (value in `selectedWards`) are filled green, the rest are light
 * outlines. Clicking a ward toggles it — the same state the dropdown edits, so
 * map ↔ dropdown stay in sync. Volunteers only see/pick their allowed wards.
 */
export default function WardSelectMap({ config, candidateId, selectedWards = [], focusAreas = [], onToggleWard, allowedWards, pinnedVoter, onPinnedVoterClick }) {
    const layers = Array.isArray(config?.layers) ? config.layers : [];
    const wardLayer = layers.find((l) => l.id === 'ward') || layers.filter((l) => !l.overlay)[1];
    const center = config?.center || [23.78, 90.34];
    const zoom   = config?.zoom   || 12;

    const [wards, setWards]     = useState(null);
    const [areaToWard, setAreaToWard] = useState({}); // voter_area_name -> ward value
    const [myLocation, setMyLocation] = useState(null);

    // Map every voter area to its ward so selecting an area (with no ward picked)
    // still focuses the map on the ward that contains it.
    useEffect(() => {
        let cancelled = false;
        votersApi.geoOptions([])
            .then((r) => {
                if (cancelled) return;
                const m = {};
                for (const a of r.voter_areas || []) if (a.ward) m[a.value] = a.ward;
                setAreaToWard(m);
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [candidateId]);

    // Track canvasser location (needs HTTPS secure context).
    useEffect(() => {
        if (!('geolocation' in navigator)) return;
        const id = navigator.geolocation.watchPosition(
            (pos) => setMyLocation([pos.coords.latitude, pos.coords.longitude]),
            () => {}, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
        );
        return () => navigator.geolocation.clearWatch(id);
    }, []);

    // Fetch all wards of the constituency.
    useEffect(() => {
        if (!wardLayer) { setWards(null); return; }
        let cancelled = false;
        setWards(null);
        layersApi.fetchSource(wardLayer.source)
            .then((fc) => {
                if (cancelled) return;
                let feats = fc.features || [];
                if (allowedWards?.length) {
                    feats = feats.filter((f) => {
                        const s = wardLabelToScope(f.properties?.[wardLayer.label_from || 'name']);
                        return !s?.ward || allowedWards.includes(s.ward);
                    });
                }
                setWards(feats);
            })
            .catch(() => !cancelled && setWards([]));
        return () => { cancelled = true; };
    }, [candidateId, wardLayer?.source, JSON.stringify(allowedWards)]); // eslint-disable-line react-hooks/exhaustive-deps

    const wardValue = (f) => wardLabelToScope(f.properties?.[wardLayer?.label_from || 'name'])?.ward;

    // Wards to highlight/zoom = explicitly selected wards PLUS the wards that
    // contain the selected voter areas.
    const focusSet = useMemo(() => {
        const s = new Set(selectedWards);
        for (const a of focusAreas) { const w = areaToWard[a]; if (w) s.add(w); }
        return s;
    }, [selectedWards, focusAreas, areaToWard]);
    const selectedSet = useMemo(() => new Set(selectedWards), [selectedWards]);

    const fitFeatures = useMemo(() => {
        if (!wards) return null;
        const sel = wards.filter((f) => focusSet.has(wardValue(f)));
        return sel.length ? sel : wards; // fit to focus, else whole constituency
    }, [wards, focusSet]); // eslint-disable-line react-hooks/exhaustive-deps

    function styleFor(f) {
        const w = wardValue(f);
        if (selectedSet.has(w)) return { color: '#1B5E20', weight: 2.5, fillColor: '#2E7D32', fillOpacity: 0.5 };
        if (focusSet.has(w))    return { color: '#1B5E20', weight: 2, fillColor: '#66BB6A', fillOpacity: 0.35 }; // ward of a picked area
        return { color: '#2E7D32', weight: 1, fillColor: '#A5D6A7', fillOpacity: 0.12 };
    }

    return (
        <div className="relative" style={{ height: '100%', width: '100%' }}>
            <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }} zoomControl={false} preferCanvas>
                <LayersControl position="bottomright">
                    <LayersControl.BaseLayer checked name="Light">
                        <TileLayer url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png" attribution="&copy; OpenStreetMap, &copy; CARTO" />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name="OpenStreetMap">
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name="Satellite">
                        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="Tiles &copy; Esri" />
                    </LayersControl.BaseLayer>
                </LayersControl>

                {wards && wards.length > 0 && (
                    <GeoJSON
                        key={`wards-${[...focusSet].sort().join(',')}-${selectedWards.join(',')}`}
                        data={{ type: 'FeatureCollection', features: wards }}
                        style={styleFor}
                        onEachFeature={(f, layer) => {
                            const label = f.properties?.[wardLayer.label_from || 'name'];
                            if (label) layer.bindTooltip(String(label), { sticky: true });
                            layer.on('click', () => {
                                const w = wardValue(f);
                                if (w) onToggleWard?.(w);
                            });
                        }}
                    />
                )}

                {pinnedVoter?.canvass_latitude && pinnedVoter?.canvass_longitude && (
                    <Marker
                        position={[Number(pinnedVoter.canvass_latitude), Number(pinnedVoter.canvass_longitude)]}
                        icon={voterPin}
                        eventHandlers={{ click: () => onPinnedVoterClick?.(pinnedVoter) }}
                    >
                        <Tooltip direction="top" offset={[0, -30]}>{pinnedVoter.name}</Tooltip>
                    </Marker>
                )}

                {myLocation && (
                    <Marker position={myLocation} icon={myLocationIcon} zIndexOffset={1000}>
                        <Tooltip direction="top" offset={[0, -8]}><span className="bn">আপনি এখানে</span></Tooltip>
                    </Marker>
                )}

                <FitTo features={fitFeatures} />
            </MapContainer>

            {!wards && (
                <div className="absolute bottom-4 left-4 z-[500] bg-white rounded-md shadow px-3 py-2 text-xs text-gray-500">
                    <i className="fas fa-spinner fa-spin mr-1" /> Loading…
                </div>
            )}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] bg-white/90 rounded-full shadow px-3 py-1 text-xs text-gray-600 pointer-events-none">
                <i className="fas fa-hand-pointer text-brand mr-1" /> ওয়ার্ডে ক্লিক করে নির্বাচন করুন
            </div>
        </div>
    );
}
