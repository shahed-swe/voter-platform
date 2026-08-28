import { useEffect, useMemo } from 'react';
import MultiSelect from './MultiSelect.jsx';
import { useGeoOptions } from '../hooks/queries/index.js';

const BN = '০১২৩৪৫৬৭৮৯';
const toBn = (s) => String(s).replace(/[0-9]/g, (d) => BN[+d]);

/**
 * Map navigation: pick one or more WARDS (multi-select) and, within them, a
 * single VOTER AREA (single-select — one area drills the map into its buildings).
 * The selection drives the voter list + stats and the map. Volunteers only see
 * their allowed wards/areas (the backend filters the options).
 *
 * Props:
 *   candidateId  — refetch options on candidate switch
 *   value        — { ward: string[], voter_area: string[] }
 *   onChange     — (nextScope) => void
 */
export default function GeoNavigator({ value, onChange }) {
    const scope = value || { ward: [], voter_area: [] };
    const wards = scope.ward || [];
    const areas = scope.voter_area || [];

    // Shared cached queries — DynamicMap requests the same geoOptions([]) on the
    // same screen; both now read one cache entry instead of firing twice.
    const wardsQuery = useGeoOptions([]);
    const areasQuery = useGeoOptions(wards, { enabled: wards.length > 0 });

    const wardOpts = useMemo(
        () => (wardsQuery.data?.wards || []).map((w) => ({ value: w.value, label: `ওয়ার্ড ${w.value} (${toBn(w.count)})`, count: null })),
        [wardsQuery.data]
    );
    const areaOpts = useMemo(
        () => (wards.length === 0 ? [] : (areasQuery.data?.voter_areas || []).map((a) => ({ value: a.value, label: a.value, count: a.count }))),
        [areasQuery.data, wards.length]
    );
    const loadingW = wardsQuery.isLoading;
    const loadingA = wards.length > 0 && areasQuery.isLoading;

    // Drop any selected areas that are no longer available for the chosen wards.
    useEffect(() => {
        if (wards.length === 0 || !areasQuery.data) return;
        const valid = new Set(areaOpts.map((o) => o.value));
        const keep = areas.filter((a) => valid.has(a));
        if (keep.length !== areas.length) onChange({ ward: wards, voter_area: keep });
    }, [areasQuery.data, areaOpts]); // eslint-disable-line react-hooks/exhaustive-deps

    const setWards = (next) => onChange({ ward: next, voter_area: areas });
    const setAreas = (next) => onChange({ ward: wards, voter_area: next });
    const reset = () => onChange({ ward: [], voter_area: [] });

    return (
        <div className="bg-white border border-brand/30 rounded-lg shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    <i className="fas fa-map-location-dot mr-1.5 text-brand" />
                    Navigate Map
                </span>
                {(wards.length > 0 || areas.length > 0) && (
                    <button className="text-xs text-brand hover:underline" onClick={reset}>
                        <i className="fas fa-arrow-left mr-1" />Reset
                    </button>
                )}
            </div>

            <div className="p-3 space-y-3">
                <div>
                    <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                        Ward <span className="text-gray-400 normal-case">(একাধিক নির্বাচন করা যাবে)</span>
                    </label>
                    <MultiSelect
                        options={wardOpts}
                        value={wards}
                        onChange={setWards}
                        loading={loadingW}
                        loadingLabel="ওয়ার্ড লোড হচ্ছে..."
                        placeholder="সব ওয়ার্ড"
                        bn
                    />
                </div>

                <div>
                    <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                        Voter Area / Village <span className="text-gray-400 normal-case">(একটি)</span>
                    </label>
                    {/* Single-select: picking one area drills the map into that area's buildings. */}
                    <div className="relative">
                        <select
                            aria-busy={loadingA}
                            className={`w-full border rounded-md px-2.5 py-2 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand bn ${
                                loadingA
                                    ? 'border-brand/30 bg-brand/5 text-gray-600 cursor-wait'
                                    : 'border-gray-300 bg-white disabled:bg-gray-50 disabled:text-gray-400'
                            }`}
                            value={areas[0] || ''}
                            onChange={(e) => setAreas(e.target.value ? [e.target.value] : [])}
                            disabled={wards.length === 0 || loadingA}
                        >
                            <option value="">
                                {wards.length === 0
                                    ? 'আগে ওয়ার্ড নির্বাচন করুন'
                                    : loadingA
                                        ? 'ভোটার এলাকা লোড হচ্ছে...'
                                        : 'সব এলাকা'}
                            </option>
                            {areaOpts.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}{o.count ? ` (${toBn(o.count)})` : ''}
                                </option>
                            ))}
                        </select>
                        {loadingA && (
                            <span className="pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                        )}
                    </div>
                </div>

                {(wards.length > 0 || areas.length > 0) && (
                    <div className="text-xs text-gray-500 pt-1 border-t border-gray-100 bn">
                        <i className="fas fa-location-arrow mr-1 text-brand" />
                        {wards.length} ওয়ার্ড{areas.length ? `, ${areas.length} এলাকা` : ''} নির্বাচিত
                    </div>
                )}
            </div>
        </div>
    );
}
