import { useEffect, useState } from 'react';
import * as votersApi from '../api/voters.js';
import MultiSelect from './MultiSelect.jsx';

const BN = '০১২৩৪৫৬৭৮৯';
const toBn = (s) => String(s).replace(/[0-9]/g, (d) => BN[+d]);

/**
 * Multi-select map navigation: pick one or more WARDS and (within them) one or
 * more VOTER AREAS. The selection drives the voter list + stats (arrays) and the
 * map fits to the chosen wards. Volunteers only see their allowed wards/areas
 * (the backend filters the options).
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

    // Load voter-area options. With wards chosen we scope areas to them; with no
    // ward we list ALL areas so a user can pick an area directly and let the map
    // focus its ward. (Each area carries its `ward`.)
    useEffect(() => {
        let cancelled = false;
        setLoadingA(true);
        votersApi.geoOptions(wards)
            .then((r) => {
                if (cancelled) return;
                const opts = (r.voter_areas || []).map((a) => ({ value: a.value, label: a.value, count: a.count }));
                setAreaOpts(opts);
                // Only prune selected areas when a ward filter is active (an empty
                // ward filter already lists every area, so nothing to prune).
                if (wards.length) {
                    const valid = new Set(opts.map((o) => o.value));
                    const keep = areas.filter((a) => valid.has(a));
                    if (keep.length !== areas.length) onChange({ ward: wards, voter_area: keep });
                }
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
                        placeholder="সব ওয়ার্ড"
                        bn
                    />
                </div>

                <div>
                    <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                        Voter Area / Village
                    </label>
                    <MultiSelect
                        options={areaOpts}
                        value={areas}
                        onChange={setAreas}
                        loading={loadingA}
                        placeholder={wards.length === 0 ? 'যেকোনো এলাকা বেছে নিন' : 'সব এলাকা'}
                        bn
                    />
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
