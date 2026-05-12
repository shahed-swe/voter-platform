import { useEffect, useRef, useState } from 'react';

export default function WardMultiSelect({ wards, value, onChange }) {
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
        ? wards.filter((w) =>
            String(w.ward_number || '').toLowerCase().includes(query.toLowerCase())
          )
        : wards;

    const valueSet = new Set(value);
    const toggle = (id) => {
        const next = new Set(value);
        next.has(id) ? next.delete(id) : next.add(id);
        onChange([...next]);
    };

    const summary =
        value.length === 0
            ? 'Select Ward...'
            : value.length === 1
            ? wards.find((w) => w.ward_id === value[0])?.ward_number || '1 selected'
            : `${value.length} wards selected`;

    return (
        <div className="bg-white border border-brand/30 rounded-lg shadow-sm p-4">
            <div className="text-sm font-bold text-brand uppercase tracking-wide flex items-center gap-2 mb-1">
                <i className="fas fa-map" /> Ward
            </div>
            <div className="border-b border-brand/40 mb-3" />

            <div className="relative" ref={ref}>
                <button
                    type="button"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-left flex items-center justify-between bg-white hover:border-brand"
                    onClick={() => setOpen((o) => !o)}
                >
                    <span className={value.length ? 'text-gray-900' : 'text-gray-500'}>{summary}</span>
                    <i className={`fas fa-chevron-${open ? 'up' : 'down'} text-gray-400 text-xs`} />
                </button>

                {open && (
                    <div className="absolute z-30 left-0 right-0 mt-1 bg-gray-900 text-white border border-gray-700 rounded-md shadow-xl max-h-72 overflow-hidden flex flex-col">
                        <input
                            autoFocus
                            placeholder="Search Ward..."
                            className="px-3 py-2 text-sm border-b border-gray-700 bg-transparent focus:outline-none placeholder-gray-500"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                        <ul className="overflow-y-auto text-sm py-1">
                            {filtered.map((w) => (
                                <li
                                    key={w.ward_id}
                                    className="px-3 py-2 hover:bg-gray-800 cursor-pointer flex items-center gap-2"
                                    onClick={() => toggle(w.ward_id)}
                                >
                                    <input
                                        type="checkbox"
                                        checked={valueSet.has(w.ward_id)}
                                        onChange={() => {}}
                                        className="accent-brand"
                                    />
                                    <span>{w.ward_number}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}
