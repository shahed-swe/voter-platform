import { useEffect, useState } from 'react';
import * as votersApi from '../api/voters.js';
import MultiSelect from './MultiSelect.jsx';

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
export default function GeoNavigator({ candidateId, value, onChange }) {
    const scope = value || { ward: [], voter_area: [] };
    const wards = scope.ward || [];
    const areas = scope.voter_area || [];

    const [wardOpts, setWardOpts] = useState([]);
    const [areaOpts, setAreaOpts] = useState([]);
    const [loadingW, setLoadingW] = useState(false);
    const [loadingA, setLoadingA] = useState(false);

    // Load ward options on mount / candidate switch.
    useEffect(() => {
        let cancelled = false;
        setLoadingW(true);
        votersApi.geoOptions([])
            .then((r) => { if (!cancelled) setWardOpts((r.wards || []).map((w) => ({ value: w.value, label: `ওয়ার্ড ${w.value} (${toBn(w.count)})`, count: null }))); })
            .catch(() => { if (!cancelled) setWardOpts([]); })
            .finally(() => { if (!cancelled) setLoadingW(false); });
        return () => { cancelled = true; };
    }, [candidateId]);

    // Load voter-area options whenever the selected wards change.
    useEffect(() => {
        let cancelled = false;
        if (wards.length === 0) { setAreaOpts([]); return; }
        setLoadingA(true);
        votersApi.geoOptions(wards)
            .then((r) => {
                if (cancelled) return;
                const opts = (r.voter_areas || []).map((a) => ({ value: a.value, label: a.value, count: a.count }));
                setAreaOpts(opts);
                // Drop any selected areas that are no longer available.
                const valid = new Set(opts.map((o) => o.value));
                const keep = areas.filter((a) => valid.has(a));
                if (keep.length !== areas.length) onChange({ ward: wards, voter_area: keep });
            })
            .catch(() => { if (!cancelled) setAreaOpts([]); })
            .finally(() => { if (!cancelled) setLoadingA(false); });
        return () => { cancelled = true; };
    }, [JSON.stringify(wards), candidateId]); // eslint-disable-line react-hooks/exhaustive-deps

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
