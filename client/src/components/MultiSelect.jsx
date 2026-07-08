import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Reusable searchable multi-select dropdown with chips.
 *
 *   options     — [{ value, label, count? }]
 *   value       — array of selected values
 *   onChange    — (nextValues) => void
 *   placeholder — text when nothing selected
 *   loading     — show a loading state
 *   disabled    — disable the control
 *   searchable  — show a search box (default: auto when >8 options)
 *   size        — 'sm' | 'md'
 */
export default function MultiSelect({
    options = [], value = [], onChange, placeholder = 'নির্বাচন করুন',
    loading = false, disabled = false, searchable, size = 'md', bn = false,
}) {
    const [open, setOpen]     = useState(false);
    const [search, setSearch] = useState('');
    const [pos, setPos]       = useState({ top: 0, left: 0, width: 0 });
    const ref     = useRef(null);
    const menuRef = useRef(null);

    // The dropdown panel is portalled to <body> (fixed position) so it is never
    // clipped by a scrolling parent or hidden behind the map's stacking context.
    useEffect(() => {
        function onDoc(e) {
            if ((ref.current && ref.current.contains(e.target)) ||
                (menuRef.current && menuRef.current.contains(e.target))) return;
            setOpen(false);
        }
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, []);

    function openMenu() {
        if (ref.current) {
            const r = ref.current.getBoundingClientRect();
            setPos({ top: r.bottom + 4, left: r.left, width: r.width });
        }
        setOpen((o) => !o);
    }

    const showSearch = searchable ?? options.length > 8;
    const filtered = search
        ? options.filter((o) => String(o.label).toLowerCase().includes(search.toLowerCase()))
        : options;

    const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
    const remove = (v) => onChange(value.filter((x) => x !== v));
    const labelFor = (v) => options.find((o) => o.value === v)?.label ?? v;
    const allVisibleSelected = filtered.length > 0 && filtered.every((o) => value.includes(o.value));

    const pad = size === 'sm' ? 'px-2.5 py-1.5 text-sm' : 'px-3 py-2 text-sm';

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                className={`w-full border border-gray-300 rounded-md bg-white text-left flex items-center justify-between ${pad} ${disabled ? 'opacity-60' : ''}`}
                onClick={() => !disabled && openMenu()}
                disabled={disabled || loading}
            >
                <span className={`${value.length ? 'text-gray-800' : 'text-gray-400'} ${bn ? 'bn' : ''} truncate`}>
                    {loading ? 'লোড হচ্ছে...' : value.length ? `${value.length} নির্বাচিত` : placeholder}
                </span>
                <i className={`fas fa-chevron-${open ? 'up' : 'down'} text-xs text-gray-400 ml-1`} />
            </button>

            {open && !loading && createPortal(
                <div
                    ref={menuRef}
                    className="bg-white border border-gray-200 rounded-md shadow-xl"
                    style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 99999 }}
                >
                    {showSearch && (
                        <div className="p-1.5 border-b border-gray-100">
                            <input
                                autoFocus
                                className="w-full text-sm px-2 py-1 border border-gray-200 rounded outline-none focus:border-brand"
                                placeholder="খুঁজুন…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    )}
                    {options.length > 1 && (
                        <button
                            type="button"
                            className="w-full text-left px-3 py-1.5 text-xs text-brand hover:bg-brand/5 border-b border-gray-100"
                            onClick={() => onChange(allVisibleSelected
                                ? value.filter((v) => !filtered.some((o) => o.value === v))
                                : [...new Set([...value, ...filtered.map((o) => o.value)])])}
                        >
                            <i className={`fas ${allVisibleSelected ? 'fa-square' : 'fa-check-double'} mr-1.5`} />
                            {allVisibleSelected ? 'সব বাদ দিন' : 'সব নির্বাচন করুন'}
                        </button>
                    )}
                    <div className="max-h-56 overflow-y-auto">
                        {filtered.length === 0 ? (
                            <div className="px-3 py-2 text-xs text-gray-400">কিছু পাওয়া যায়নি।</div>
                        ) : filtered.map((o) => {
                            const checked = value.includes(o.value);
                            return (
                                <button
                                    key={o.value}
                                    type="button"
                                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-brand/5 flex items-center gap-2 ${bn ? 'bn' : ''}`}
                                    onClick={() => toggle(o.value)}
                                >
                                    <i className={`fas ${checked ? 'fa-check-square text-brand' : 'fa-square text-gray-300'}`} />
                                    <span className="flex-1 truncate">{o.label}</span>
                                    {o.count != null && <span className="text-[11px] text-gray-400">{o.count}</span>}
                                </button>
                            );
                        })}
                    </div>
                </div>,
                document.body
            )}

            {value.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                    {value.map((v) => (
                        <span key={v} className={`text-xs bg-brand/10 text-brand px-2 py-0.5 rounded-full flex items-center gap-1 ${bn ? 'bn' : ''}`}>
                            <span className="truncate max-w-[140px]">{labelFor(v)}</span>
                            <button type="button" onClick={() => remove(v)} className="hover:text-red-500"><i className="fas fa-times text-[10px]" /></button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
