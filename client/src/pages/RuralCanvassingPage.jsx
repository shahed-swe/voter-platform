import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import DynamicFilterPanel from '../components/filters/DynamicFilterPanel.jsx';
import FilteredVoterListPanel from '../components/canvassing/FilteredVoterListPanel.jsx';
import CanvassFormModal from '../components/canvassing/CanvassFormModal.jsx';
import { LoadingState, ErrorState } from '../components/LoadingState.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

import * as geoApi from '../api/geo.js';

const PALETTE = ['#E8F5E9', '#A5D6A7', '#66BB6A', '#2E7D32', '#1B5E20'];

function bucketColor(value, buckets) {
    const n = Number(value || 0);
    let idx = 0;
    for (let i = 0; i < buckets.length; i++) {
        if (n >= buckets[i]) idx = i;
    }
    return PALETTE[Math.min(idx, PALETTE.length - 1)];
}

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

function BaseLayerToggle({ value, onChange }) {
    return (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[400] bg-white rounded-md shadow-md border border-gray-200 flex overflow-hidden">
            <button
                className={`px-4 py-2 text-sm font-medium ${value === 'satellite' ? 'bg-white text-gray-700' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                onClick={() => onChange('satellite')}
            >Satellite</button>
            <button
                className={`px-4 py-2 text-sm font-medium ${value === 'map' ? 'bg-brand text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                onClick={() => onChange('map')}
            >Map</button>
        </div>
    );
}

export default function RuralCanvassingPage() {
    const { candidate } = useAuth();
    const cfg = candidate?.filter_config || [];
    const mapCfg = candidate?.map_config || {};
    const buckets = mapCfg.legend?.buckets || [0, 2000, 5000, 10000, 15000];

    const [filters, setFilters]         = useState({});
    const [villagesGeo, setVillagesGeo] = useState(null);
    const [loading, setLoading]         = useState(true);
    const [error, setError]             = useState(null);
    const [base, setBase]               = useState('map');
    const [activeVoter, setActiveVoter] = useState(null);
    const [flash, setFlash]             = useState(null);

    useEffect(() => {
        let cancelled = false;
        geoApi.villages()
            .then((d) => !cancelled && setVillagesGeo(d))
            .catch((err) => !cancelled && setError(err))
            .finally(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
    }, []);

    // Villages matching current filters (for map highlight + bounds fit)
    const matchedFeatures = useMemo(() => {
        if (!villagesGeo?.features) return [];
        return villagesGeo.features.filter((f) => {
            const p = f.properties;
            if (filters.upazila?.length && !filters.upazila.includes(p.upazila)) return false;
            if (filters.union && p.union_name !== filters.union) return false;
            if (filters.mauza && p.mauza !== filters.mauza) return false;
            if (filters.village && p.village_id !== filters.village) return false;
            return true;
        });
    }, [villagesGeo, filters]);

    const scopeLabel = useMemo(() => {
        const parts = [];
        if (filters.upazila?.length) parts.push(`${filters.upazila.length} upazila${filters.upazila.length > 1 ? 's' : ''}`);
        if (filters.union)           parts.push(filters.union);
        if (filters.mauza)           parts.push(filters.mauza);
        if (filters.voter_area)      parts.push(filters.voter_area);
        if (filters.village) {
            const v = villagesGeo?.features.find((f) => f.properties.village_id === filters.village);
            if (v) parts.push(v.properties.village_name);
        }
        return parts.length ? parts.join(' › ') : '';
    }, [filters, villagesGeo]);

    if (loading) return <LoadingState />;
    if (error)   return <ErrorState error={error} onRetry={() => window.location.reload()} />;

    const fitFeatures = matchedFeatures.length ? matchedFeatures : (villagesGeo?.features || []);

    return (
        <div className="h-full flex flex-col relative overflow-hidden">
            {flash && (
                <div className="absolute top-3 left-4 z-[500] bg-green-50 border border-green-200 text-green-700 rounded-md px-3 py-2 text-sm shadow-md">
                    <i className="fas fa-check-circle mr-1" /> {flash}
                </div>
            )}

            <div className="absolute inset-0">
                <MapContainer center={[26.34, 88.55]} zoom={10} style={{ height: '100%', width: '100%' }} zoomControl={false} preferCanvas>
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

                    {villagesGeo && (
                        <GeoJSON
                            key={`vils-${Object.values(filters).join('|')}-${villagesGeo.features.length}`}
                            data={villagesGeo}
                            style={(f) => {
                                const p = f.properties;
                                const isMatch = matchedFeatures.includes(f);
                                return {
                                    fillColor: bucketColor(p[mapCfg.shade_by || 'total_population'], buckets),
                                    color:     isMatch ? '#1B5E20' : '#1B5E20',
                                    weight:    isMatch ? 2 : 0.6,
                                    opacity:   isMatch ? 1 : 0.5,
                                    fillOpacity: isMatch ? 0.85 : 0.35,
                                };
                            }}
                            onEachFeature={(f, layer) => {
                                const name = f.properties.village_name || 'Village';
                                const pop = Number(f.properties.total_population || 0).toLocaleString();
                                layer.bindTooltip(`<strong>${name}</strong><br/>${pop} voters`, { sticky: true });
                                layer.on('click', () => {
                                    // Selecting a village on the map updates the filter selection
                                    setFilters((cur) => ({ ...cur, village: f.properties.village_id }));
                                });
                            }}
                        />
                    )}

                    <FitTo features={fitFeatures} />
                </MapContainer>

                <BaseLayerToggle value={base} onChange={setBase} />
            </div>

            {/* Left filter panel */}
            <aside className="absolute left-4 top-4 bottom-4 w-[min(85vw,280px)] z-[400] overflow-y-auto pr-1">
                <DynamicFilterPanel config={cfg} value={filters} onChange={setFilters} />
            </aside>

            {/* Right voter list panel */}
            <aside className="absolute right-4 top-4 bottom-4 w-[min(94vw,380px)] z-[400]">
                <FilteredVoterListPanel
                    filters={filters}
                    scopeLabel={scopeLabel}
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
