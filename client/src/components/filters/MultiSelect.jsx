import { useEffect, useRef, useState } from 'react';

/** Multi-select dropdown with checkboxes; supports optional search box. */
export default function MultiSelect({
    label, labelBn, icon, options, value, onChange, disabled,
    searchable = false, placeholder,
}) {
    const [open, setOpen]   = useState(false);
    const [query, setQuery] = useState('');
    const ref = useRef(null);

    useEffect(() => {
        function onDoc(e) {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        }
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, []);

    const filtered = (searchable && query)
        ? options.filter((o) => String(o.label || '').toLowerCase().includes(query.toLowerCase()))
        : options;

    const valueSet = new Set(value);
    const toggle = (v) => {
        const next = new Set(value);
        next.has(v) ? next.delete(v) : next.add(v);
        onChange([...next]);
    };

    const summary =
        value.length === 0
            ? (placeholder || `Select ${label}...`)
            : value.length === 1
                ? options.find((o) => o.value === value[0])?.label || '1 selected'
                : `${value.length} selected`;

    return (
        <div className="bg-white border border-brand/30 rounded-lg shadow-sm p-4">
            <div className="text-sm font-bold text-brand uppercase tracking-wide flex items-center gap-2 mb-1">
                {icon && <i className={`fas ${icon}`} />}
                <span className="bn">{labelBn || label}</span>
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
                    <span className={`${value.length ? 'text-gray-900' : 'text-gray-500'} bn truncate`}>
                        {summary}
                    </span>
                    <i className={`fas fa-chevron-${open ? 'up' : 'down'} text-gray-400 text-xs flex-shrink-0 ml-2`} />
                </button>

                {open && (
                    <div className="absolute z-30 left-0 right-0 mt-1 bg-gray-900 text-white border border-gray-700 rounded-md shadow-xl max-h-80 overflow-hidden flex flex-col">
                        {searchable && (
                            <input
                                autoFocus
                                placeholder={`Search ${label}...`}
                                className="px-3 py-2 text-sm border-b border-gray-700 bg-transparent focus:outline-none placeholder-gray-500 bn"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                            />
                        )}
                        <ul className="overflow-y-auto text-sm py-1">
                            {filtered.length === 0 ? (
                                <li className="px-3 py-2 text-gray-400">No matches</li>
                            ) : (
                                filtered.map((o) => (
                                    <li
                                        key={o.value}
                                        className="px-3 py-1.5 hover:bg-gray-800 cursor-pointer flex items-start gap-2"
                                        onClick={() => toggle(o.value)}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={valueSet.has(o.value)}
                                            onChange={() => {}}
                                            className="mt-0.5 accent-brand flex-shrink-0"
                                        />
                                        <span className="bn truncate">{o.label}</span>
                                    </li>
                                ))
                            )}
                        </ul>
                        {value.length > 0 && (
                            <button
                                className="text-xs text-gray-400 hover:text-red-400 border-t border-gray-700 py-2"
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
