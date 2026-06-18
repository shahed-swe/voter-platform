import { useEffect, useState } from 'react';
import * as votersApi from '../api/voters.js';

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
const toBn = (n) => String(n).replace(/[0-9]/g, (d) => BN_DIGITS[+d]);

/**
 * Dropdown showing distinct voter areas for the currently-selected ward scope.
 * Fetches from POST /api/voters/area-options when scope.ward changes.
 *
 * Props:
 *   scope       — current geo scope, e.g. { ward: '৫২' }
 *   value       — currently selected voter_area_name (or '')
 *   onChange    — (voterAreaName | '') => void
 */
export default function VoterAreaPicker({ scope, value, onChange }) {
    const [areas, setAreas]     = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch]   = useState('');
    const [open, setOpen]       = useState(false);

    const ward = scope?.ward;

    useEffect(() => {
        if (!ward) { setAreas([]); return; }
        let cancelled = false;
        setLoading(true);
        votersApi.areaOptions({ ward })
            .then((d) => { if (!cancelled) setAreas(d.areas || []); })
            .catch(() => { if (!cancelled) setAreas([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [ward]);

    // Clear selection when ward changes
    useEffect(() => { onChange(''); }, [ward]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!open) return;
        const handler = () => setOpen(false);
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    if (!ward) return null;

    const filtered = search
        ? areas.filter((a) => a.voter_area_name.includes(search))
        : areas;

    const selectedLabel = value || '';

    return (
        <div className="bg-white border border-brand/30 rounded-lg shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    <i className="fas fa-layer-group mr-1.5 text-brand" />
                    Voter Area
                </span>
            </div>
            <div className="p-3">
                {loading ? (
                    <div className="text-xs text-gray-400 py-1">
                        <i className="fas fa-spinner fa-spin mr-1" /> Loading…
                    </div>
                ) : (
                    <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
                        <button
                            type="button"
                            className="w-full text-sm border border-gray-200 rounded px-2.5 py-1.5 bg-white text-left flex items-center justify-between focus:border-brand outline-none bn"
                            onClick={() => setOpen((o) => !o)}
                        >
                            <span className={selectedLabel ? 'text-gray-800' : 'text-gray-400'}>
                                {selectedLabel || `সব এলাকা (${toBn(areas.length)})`}
                            </span>
                            <i className={`fas fa-chevron-${open ? 'up' : 'down'} text-gray-400 text-xs ml-1`} />
                        </button>

                        {open && (
                            <div className="absolute z-[600] mt-1 w-full bg-white border border-gray-200 rounded shadow-lg">
                                <div className="p-1.5 border-b border-gray-100">
                                    <input
                                        autoFocus
                                        type="text"
                                        className="w-full text-sm px-2 py-1 border border-gray-200 rounded outline-none focus:border-brand bn"
                                        placeholder="অনুসন্ধান করুন…"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                    />
                                </div>
                                <div className="max-h-52 overflow-y-auto">
                                    <button
                                        type="button"
                                        className="w-full text-left px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-50"
                                        onClick={() => { onChange(''); setOpen(false); setSearch(''); }}
                                    >
                                        সব এলাকা
                                    </button>
                                    {filtered.map((a) => (
                                        <button
                                            key={a.voter_area_name}
                                            type="button"
                                            className={`w-full text-left px-3 py-1.5 text-sm hover:bg-brand/10 flex items-center justify-between bn ${
                                                a.voter_area_name === value
                                                    ? 'bg-brand/10 font-medium text-brand'
                                                    : 'text-gray-800'
                                            }`}
                                            onClick={() => { onChange(a.voter_area_name); setOpen(false); setSearch(''); }}
                                        >
                                            <span className="truncate flex-1 mr-2">{a.voter_area_name}</span>
                                            <span className="text-[10px] text-gray-400 shrink-0">{toBn(a.voter_count)}</span>
                                        </button>
                                    ))}
                                    {filtered.length === 0 && (
                                        <div className="px-3 py-2 text-xs text-gray-400 bn">কিছু পাওয়া যায়নি</div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
