import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, GeoJSON, useMap, LayersControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import DynamicFilterPanel from '../components/filters/DynamicFilterPanel.jsx';
import PopulationStats from '../components/dashboard/PopulationStats.jsx';
import AssignUserCard from '../components/dashboard/AssignUserCard.jsx';
import { LoadingState, ErrorState } from '../components/LoadingState.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

import * as geoApi from '../api/geo.js';
import * as adminApi from '../api/admin.js';

// 5-bucket green palette for voter density (matches the legacy panchagar legend).
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

export default function RuralDashboard() {
    const { user, candidate } = useAuth();
    const cfg = candidate?.filter_config || [];
    const mapCfg = candidate?.map_config || {};
    const buckets = mapCfg.legend?.buckets || [0, 2000, 5000, 10000, 15000];

    const [filters, setFilters]         = useState({});
    const [villagesGeo, setVillagesGeo] = useState(null);
    const [users, setUsers]             = useState([]);
    const [loading, setLoading]         = useState(true);
    const [error, setError]             = useState(null);

    useEffect(() => {
        let cancelled = false;
        Promise.all([
            geoApi.villages(),
            adminApi.listUsers({ is_active: true, limit: 500 }).catch(() => ({ users: [] })),
        ])
            .then(([villages, usersResp]) => {
                if (cancelled) return;
                setVillagesGeo(villages);
                setUsers(usersResp.users || []);
            })
            .catch((err) => !cancelled && setError(err))
            .finally(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
    }, []);

    // ---- Match villages against the current filter selections ----
    const matchedFeatures = useMemo(() => {
        if (!villagesGeo?.features) return [];
        return villagesGeo.features.filter((f) => {
            const p = f.properties;
            // upazila — checkbox group
            if (filters.upazila?.length && !filters.upazila.includes(p.upazila)) return false;
            // union / mauza / village — single select
            if (filters.union && p.union_name !== filters.union) return false;
            if (filters.mauza && p.mauza !== filters.mauza) return false;
            if (filters.village && p.village_id !== filters.village) return false;
            return true;
        });
    }, [villagesGeo, filters]);

    const matchedGeo = useMemo(
        () => ({ type: 'FeatureCollection', features: matchedFeatures }),
        [matchedFeatures]
    );

    // ---- Stats for current scope ----
    const stats = useMemo(() => {
        return matchedFeatures.reduce(
            (acc, f) => {
                acc.total_population += Number(f.properties.total_population || 0);
                acc.male_count       += Number(f.properties.male_count || 0);
                acc.female_count     += Number(f.properties.female_count || 0);
                return acc;
            },
            { total_population: 0, male_count: 0, female_count: 0 }
        );
    }, [matchedFeatures]);

    const scopeLabel = useMemo(() => {
        const parts = [];
        if (filters.upazila?.length) parts.push(`${filters.upazila.length} upazila${filters.upazila.length > 1 ? 's' : ''}`);
        if (filters.union)           parts.push(filters.union);
        if (filters.mauza)           parts.push(filters.mauza);
        if (filters.village) {
            const v = villagesGeo?.features.find((f) => f.properties.village_id === filters.village);
            if (v) parts.push(v.properties.village_name);
        }
        return parts.length ? parts.join(' › ') : 'Constituency';
    }, [filters, villagesGeo]);

    // ---- Assignment target ----
    const assignTarget = useMemo(() => {
        // Most specific selection wins
        if (filters.village) {
            const v = villagesGeo?.features.find((f) => f.properties.village_id === filters.village);
            if (v) return { type: 'village', value: v.properties.village_name, village_id: filters.village, label: v.properties.village_name };
        }
        if (filters.mauza)   return { type: 'mauza',   value: filters.mauza,   label: filters.mauza };
        if (filters.union)   return { type: 'union',   value: filters.union,   label: filters.union };
        if (filters.upazila?.length === 1) return { type: 'upazila', value: filters.upazila[0], label: filters.upazila[0] };
        return null;
    }, [filters, villagesGeo]);

    if (loading) return <LoadingState full />;
    if (error)   return <ErrorState error={error} onRetry={() => window.location.reload()} />;

    return (
        <div className="h-full flex relative overflow-hidden">
            <div className="absolute inset-0">
                <MapContainer center={[26.34, 88.55]} zoom={10} style={{ height: '100%', width: '100%' }} zoomControl={false} preferCanvas>
                    <LayersControl position="bottomright">
                        <LayersControl.BaseLayer checked name="Light">
                            <TileLayer url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
                                       attribution="&copy; OpenStreetMap, &copy; CARTO" />
                        </LayersControl.BaseLayer>
                        <LayersControl.BaseLayer name="OpenStreetMap">
                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                       attribution="&copy; OpenStreetMap contributors" />
                        </LayersControl.BaseLayer>
                        <LayersControl.BaseLayer name="Satellite">
                            <TileLayer
                                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                                attribution="Tiles &copy; Esri" />
                        </LayersControl.BaseLayer>
                    </LayersControl>

                    {matchedGeo.features.length > 0 && (
                        <GeoJSON
                            key={`villages-${Object.values(filters).join('|')}-${matchedGeo.features.length}`}
                            data={matchedGeo}
                            style={(f) => ({
                                fillColor: bucketColor(f.properties[mapCfg.shade_by || 'total_population'], buckets),
                                color:     '#1B5E20',
                                weight:    0.8,
                                opacity:   0.95,
                                fillOpacity: 0.8,
                            })}
                            onEachFeature={(f, layer) => {
                                const name = f.properties.village_name || 'Village';
                                const pop = Number(f.properties.total_population || 0).toLocaleString();
                                layer.bindTooltip(
                                    `<strong>${name}</strong><br/>${pop} voters`,
                                    { sticky: true }
                                );
                            }}
                        />
                    )}
                    <FitTo features={matchedFeatures} />
                </MapContainer>
            </div>

            {/* Left filter panel */}
            <aside className="absolute left-4 top-4 bottom-4 w-[min(85vw,280px)] z-[400] overflow-y-auto pr-1">
                <DynamicFilterPanel config={cfg} value={filters} onChange={setFilters} />
            </aside>

            {/* Right stats + legend + assign */}
            <aside className="absolute right-4 top-4 bottom-4 w-[min(85vw,280px)] z-[400] space-y-3 overflow-y-auto pl-1">
                <PopulationStats stats={{ total_population: stats.total_population, male_count: stats.male_count, female_count: stats.female_count }} scopeLabel={scopeLabel} scopeSubLabel="Total Voters" />

                {/* Voter density legend */}
                <div className="bg-white border border-brand/30 rounded-lg shadow-sm p-4">
                    <div className="text-sm font-bold text-brand uppercase tracking-wide mb-2">
                        {mapCfg.legend?.label || 'Voter Density'}
                    </div>
                    <ul className="space-y-1.5 text-xs text-gray-700">
                        {buckets.map((b, i) => {
                            const next = buckets[i + 1];
                            const label = next ? `${b.toLocaleString()}–${(next - 1).toLocaleString()} voters` : `${b.toLocaleString()}+ voters`;
                            return (
                                <li key={i} className="flex items-center gap-2">
                                    <span className="inline-block w-4 h-4 rounded" style={{ background: PALETTE[Math.min(i, PALETTE.length - 1)] }} />
                                    <span>{label}</span>
                                </li>
                            );
                        })}
                    </ul>
                </div>

                <AssignUserCard users={users} target={assignTarget} />
            </aside>
        </div>
    );
}
