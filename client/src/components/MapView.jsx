import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Bangladesh-ish default view; the map will auto-fit to the data once loaded.
const DEFAULT_CENTER = [23.7806, 90.3372]; // Dhaka
const DEFAULT_ZOOM = 12;

/**
 * Color ramp for completion percentage (canvassing % visited).
 */
function colorByCompletion(pct) {
    const p = Number(pct || 0);
    if (p >= 80) return '#1B5E20';
    if (p >= 60) return '#2E7D32';
    if (p >= 40) return '#66BB6A';
    if (p >= 20) return '#FFB300';
    if (p > 0)   return '#EF6C00';
    return '#9E9E9E';
}

function colorByPopulation(pop) {
    const p = Number(pop || 0);
    if (p > 30000) return '#1565C0';
    if (p > 15000) return '#1976D2';
    if (p > 5000)  return '#42A5F5';
    if (p > 1000)  return '#90CAF9';
    return '#E3F2FD';
}

/** Re-fits the map to the current featureCollection on each change. */
function FitBounds({ data }) {
    const map = useMap();
    useEffect(() => {
        if (!data || !data.features?.length) return;
        try {
            const layer = L.geoJSON(data);
            const bounds = layer.getBounds();
            if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
        } catch {
            /* ignore — empty or invalid geometry */
        }
    }, [data, map]);
    return null;
}

function HoverHighlight({ layer, originalStyle }) {
    // Used inline; kept here to keep semantics clear.
    layer.on({
        mouseover: (e) => {
            const l = e.target;
            l.setStyle({ weight: 3, fillOpacity: 0.7 });
            l.bringToFront();
        },
        mouseout: (e) => e.target.setStyle(originalStyle),
    });
}

export default function MapView({
    layers,                          // [{ id, data, style, onClick, popup, tooltip }]
    height = 500,
    center = DEFAULT_CENTER,
    zoom = DEFAULT_ZOOM,
    showLayerControl = true,
}) {
    const baseLayers = useMemo(
        () => [
            {
                name: 'Light',
                url: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
                attribution: '&copy; OpenStreetMap, &copy; CARTO',
                default: true,
            },
            {
                name: 'OpenStreetMap',
                url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                attribution: '&copy; OpenStreetMap contributors',
            },
            {
                name: 'Satellite',
                url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                attribution: 'Tiles &copy; Esri',
            },
        ],
        []
    );

    // Compute fit-bounds source — first non-empty layer
    const fitData = layers.find((l) => l.data?.features?.length)?.data;

    return (
        <div className="rounded-lg overflow-hidden border border-gray-200 shadow-sm relative" style={{ height }}>
            <MapContainer
                center={center}
                zoom={zoom}
                style={{ height: '100%', width: '100%' }}
                preferCanvas
            >
                {showLayerControl ? (
                    <LayersControl position="topright">
                        {baseLayers.map((b) => (
                            <LayersControl.BaseLayer key={b.name} name={b.name} checked={!!b.default}>
                                <TileLayer url={b.url} attribution={b.attribution} />
                            </LayersControl.BaseLayer>
                        ))}
                    </LayersControl>
                ) : (
                    <TileLayer url={baseLayers[0].url} attribution={baseLayers[0].attribution} />
                )}

                {layers
                    .filter((l) => l.data?.features?.length)
                    .map((layer) => (
                        <GeoJSON
                            key={`${layer.id}-${layer.data.features.length}`}
                            data={layer.data}
                            style={layer.style}
                            onEachFeature={(feature, leafletLayer) => {
                                if (layer.tooltip) leafletLayer.bindTooltip(layer.tooltip(feature), { sticky: true });
                                if (layer.popup) leafletLayer.bindPopup(layer.popup(feature));
                                const originalStyle =
                                    typeof layer.style === 'function' ? layer.style(feature) : layer.style;
                                leafletLayer.on({
                                    mouseover: (e) => {
                                        e.target.setStyle({ weight: 3, fillOpacity: 0.7 });
                                        e.target.bringToFront();
                                    },
                                    mouseout: (e) => e.target.setStyle(originalStyle),
                                    click: (e) => {
                                        if (layer.onClick) layer.onClick(feature, e);
                                    },
                                });
                            }}
                        />
                    ))}

                <FitBounds data={fitData} />
            </MapContainer>
        </div>
    );
}

// Convenience style builders so pages don't have to repeat themselves.
export const styles = {
    completion: (f) => ({
        fillColor: colorByCompletion(f.properties.completion_pct),
        color: '#1f2937',
        weight: 1,
        opacity: 0.8,
        fillOpacity: 0.55,
    }),
    population: (f) => ({
        fillColor: colorByPopulation(f.properties.total_population),
        color: '#1f2937',
        weight: 1,
        opacity: 0.8,
        fillOpacity: 0.55,
    }),
    voterArea: (f) => ({
        fillColor: colorByPopulation(f.properties.total_population),
        color: '#1565C0',
        weight: 1.2,
        opacity: 0.9,
        fillOpacity: 0.4,
    }),
    building: (f) => ({
        fillColor: f.properties.canvassed ? '#2E7D32' : '#90A4AE',
        color: '#37474F',
        weight: 0.6,
        opacity: 0.9,
        fillOpacity: 0.7,
    }),
};

export { colorByCompletion, colorByPopulation };
