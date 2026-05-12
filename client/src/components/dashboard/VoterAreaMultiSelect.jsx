import { useEffect, useRef, useState } from 'react';

/**
 * Multi-select for voter areas with search box, expanded inline (matches
 * the legacy left-panel design from the screenshots).
 *
 *   items: [{ voter_area_id, village_name, total_population }]
 *   value: array of voter_area_id strings (currently selected)
 */
export default function VoterAreaMultiSelect({ items, value, onChange, disabled }) {
    const [open, setOpen]   = useState(false);
    const [query, setQuery] = useState('');
    const ref = useRef(null);

    useEffect(() => {
        function onDocClick(e) {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        }
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, []);

    const filtered = query
        ? items.filter((i) =>
            (i.village_name || '').toLowerCase().includes(query.toLowerCase())
          )
        : items;

    const valueSet = new Set(value);

    function toggle(id) {
        const next = new Set(value);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onChange([...next]);
    }

    const summary =
        value.length === 0
            ? 'All Voter Areas'
            : value.length === 1
            ? items.find((i) => i.voter_area_id === value[0])?.village_name || '1 selected'
            : `${value.length} selected`;

    return (
        <div className="bg-white border border-brand/30 rounded-lg shadow-sm p-4">
            <div className="text-sm font-bold text-brand uppercase tracking-wide flex items-center gap-2 mb-1">
                <i className="fas fa-location-dot" /> Voter Area
            </div>
            <div className="border-b border-brand/40 mb-3" />

            <div className="relative" ref={ref}>
                <button
                    type="button"
                    className={`w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-left flex items-center justify-between bg-white ${
                        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-brand'
                    }`}
                    disabled={disabled}
                    onClick={() => setOpen((o) => !o)}
                >
                    <span className={value.length ? 'text-gray-900' : 'text-gray-500'}>{summary}</span>
                    <i className={`fas fa-chevron-${open ? 'up' : 'down'} text-gray-400 text-xs`} />
                </button>

                {open && (
                    <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-72 overflow-hidden flex flex-col">
                        <input
                            autoFocus
                            placeholder="Search voter area..."
                            className="px-3 py-2 text-sm border-b border-gray-200 focus:outline-none"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                        <ul className="overflow-y-auto text-sm py-1">
                            {filtered.length === 0 ? (
                                <li className="px-3 py-2 text-gray-400">No matches</li>
                            ) : (
                                filtered.map((i) => (
                                    <li
                                        key={i.voter_area_id}
                                        className="px-3 py-1.5 hover:bg-gray-50 cursor-pointer flex items-start gap-2"
                                        onClick={() => toggle(i.voter_area_id)}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={valueSet.has(i.voter_area_id)}
                                            onChange={() => {}}
                                            className="mt-0.5 accent-brand"
                                        />
                                        <span className="truncate">{i.village_name || `Area ${i.voter_area_id}`}</span>
                                    </li>
                                ))
                            )}
                        </ul>
                        {value.length > 0 && (
                            <button
                                className="text-xs text-gray-500 hover:text-red-600 border-t border-gray-100 py-2"
                                onClick={() => onChange([])}
                            >
                                Clear selection
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
