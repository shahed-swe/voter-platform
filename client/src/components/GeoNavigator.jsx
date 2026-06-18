import { useEffect, useState } from 'react';
import * as layersApi from '../api/layers.js';

/**
 * Cascading geo-layer navigation panel.
 * Fetches fresh data every time — no caching.
 * Renders a searchable select for each drillable layer.
 * When a feature is selected, the map drills into it and zooms.
 *
 * Props:
 *   layers       — map_config.layers (non-overlay)
 *   candidateId  — used to trigger re-fetch on candidate switch
 *   drillStack   — [{id, label}, ...] — current drill state (controlled)
 *   onSelect     — (newDrillStack) => void
 */
export default function GeoNavigator({ layers, candidateId, drillStack, onSelect }) {
    const navLayers = (layers || []).filter(
        (l) => !l.overlay
            && l.click !== 'modal:canvassed_voters'
            && l.click !== 'select'
            && l.click !== 'voters'   // leaf layers (buildings) — selected by clicking the map, not a nav dropdown
    );

    // Per-layer options: { layerKey: [{id, label}] | null }
    // null = not yet loaded/loading; [] = loaded but empty
    const [opts, setOpts]       = useState({});
    const [loading, setLoading] = useState({});

    // Reset everything when candidate switches
    useEffect(() => {
        setOpts({});
        setLoading({});
    }, [candidateId]);

    // Load root layer whenever candidate changes (or on mount) — just fetches, no auto-select
    useEffect(() => {
        if (!navLayers.length) return;
        const root = navLayers[0];
        let cancelled = false;
        setLoading((m) => ({ ...m, [root.id]: true }));
        layersApi.fetchSource(root.source)
            .then((fc) => {
                if (!cancelled) setOpts((m) => ({ ...m, [root.id]: toOpts(fc, root) }));
            })
            .catch(() => { if (!cancelled) setOpts((m) => ({ ...m, [root.id]: [] })); })
            .finally(() => { if (!cancelled) setLoading((m) => ({ ...m, [root.id]: false })); });
        return () => { cancelled = true; };
    }, [candidateId, navLayers.length]); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-select root when: options are loaded, stack is empty, and only 1 option exists.
    // This is a SEPARATE effect from the fetch so it fires after the parent's reset
    // (setGeoNavStack([])) has propagated — avoids the stale-closure bug where the fetch
    // effect captured the old drillStack (e.g. [{id:'Dhaka-4'}]) from a previous candidate.
    useEffect(() => {
        if (!navLayers.length) return;
        const root = navLayers[0];
        const options = opts[root.id];
        if (options?.length === 1 && drillStack.length === 0) {
            onSelect([{ id: options[0].id, label: options[0].label }]);
        }
    }, [opts, drillStack.length, navLayers.length]); // eslint-disable-line react-hooks/exhaustive-deps

    // Load each child layer fresh whenever the parent selection changes
    useEffect(() => {
        const tasks = [];
        for (let i = 0; i < drillStack.length; i++) {
            const childLayer = navLayers[i + 1];
            if (!childLayer) break;
            const parentId = drillStack[i]?.id;
            if (!parentId) break;
            tasks.push({ childLayer, parentId, depth: i + 1 });
        }

        if (!tasks.length) return;

        let cancelled = false;
        tasks.forEach(({ childLayer, parentId }) => {
            setLoading((m) => ({ ...m, [childLayer.id]: true }));
            setOpts((m) => ({ ...m, [childLayer.id]: null })); // clear stale
            layersApi.fetchByParent(childLayer.source, 'parent_feature_id', parentId)
                .then((fc) => {
                    if (!cancelled) setOpts((m) => ({ ...m, [childLayer.id]: toOpts(fc, childLayer) }));
                })
                .catch(() => { if (!cancelled) setOpts((m) => ({ ...m, [childLayer.id]: [] })); })
                .finally(() => { if (!cancelled) setLoading((m) => ({ ...m, [childLayer.id]: false })); });
        });

        return () => { cancelled = true; };
    }, [drillStack, candidateId, navLayers.length]); // eslint-disable-line react-hooks/exhaustive-deps

    // Clear child layers when parent is deselected
    useEffect(() => {
        // Clear any layer deeper than current drill depth
        const clearFrom = drillStack.length + 1; // index in navLayers to start clearing
        if (clearFrom >= navLayers.length) return;
        setOpts((m) => {
            const next = { ...m };
            for (let i = clearFrom; i < navLayers.length; i++) {
                next[navLayers[i].id] = null;
            }
            return next;
        });
    }, [drillStack.length, navLayers.length]); // eslint-disable-line react-hooks/exhaustive-deps

    function selectAt(depth, featureId, featureLabel) {
        if (!featureId) {
            onSelect(drillStack.slice(0, depth));
        } else {
            onSelect([...drillStack.slice(0, depth), { id: featureId, label: featureLabel }]);
        }
    }

    if (!navLayers.length) return null;

    return (
        <div className="bg-white border border-brand/30 rounded-lg shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    <i className="fas fa-map-location-dot mr-1.5 text-brand" />
                    Navigate Map
                </span>
                {drillStack.length > 0 && (
                    <button className="text-xs text-brand hover:underline" onClick={() => onSelect([])}>
                        <i className="fas fa-arrow-left mr-1" />Reset
                    </button>
                )}
            </div>

            <div className="p-3 space-y-3">
                {navLayers.map((layer, i) => {
                    const options  = opts[layer.id] || [];
                    const isLoading = !!loading[layer.id];
                    const disabled  = i > 0 && drillStack.length < i;
                    const selectedId = drillStack[i]?.id || '';

                    // Hide root if it was auto-selected (only 1 option — no point showing the dropdown)
                    const rootAutoSelected =
                        i === 0 && options.length === 1 && drillStack[0]?.id === options[0]?.id;
                    if (rootAutoSelected) return null;

                    return (
                        <div key={layer.id}>
                            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                                {layer.label}
                            </label>
                            {isLoading || (i > 0 && opts[layer.id] === null && !disabled) ? (
                                <div className="text-xs text-gray-400 py-1">
                                    <i className="fas fa-spinner fa-spin mr-1" /> Loading…
                                </div>
                            ) : (
                                <SelectWithSearch
                                    options={options}
                                    value={selectedId}
                                    disabled={disabled}
                                    placeholder={`All ${layer.label}s`}
                                    onChange={(id, label) => selectAt(i, id, label)}
                                />
                            )}
                        </div>
                    );
                })}

                {/* Breadcrumb */}
                {drillStack.length > 1 && (
                    <div className="text-xs text-gray-500 pt-1 border-t border-gray-100">
                        <i className="fas fa-location-arrow mr-1 text-brand" />
                        {drillStack.map((s, i) => (
                            <span key={i}>
                                {i > 0 && <span className="mx-0.5 text-gray-300">›</span>}
                                <button
                                    className="text-brand hover:underline"
                                    onClick={() => onSelect(drillStack.slice(0, i + 1))}
                                >
                                    {s.label || s.id}
                                </button>
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Searchable select ────────────────────────────────────────────────────────

function SelectWithSearch({ options, value, disabled, placeholder, onChange }) {
    const [search, setSearch] = useState('');
    const [open, setOpen]     = useState(false);

    const filtered = search
        ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
        : options;

    const selectedLabel = options.find((o) => o.id === value)?.label || '';

    useEffect(() => {
        if (!open) return;
        const handler = () => setOpen(false);
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    if (disabled) {
        return (
            <div className="w-full text-sm border border-gray-200 rounded px-2.5 py-1.5 text-gray-400 bg-gray-50 select-none">
                {placeholder}
            </div>
        );
    }

    if (options.length <= 20) {
        return (
            <select
                className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 bg-white focus:border-brand outline-none"
                value={value}
                onChange={(e) => {
                    const id = e.target.value;
                    const lbl = options.find((o) => o.id === id)?.label || '';
                    onChange(id, lbl);
                }}
            >
                <option value="">{placeholder}</option>
                {options.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                ))}
            </select>
        );
    }

    return (
        <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
            <button
                type="button"
                className="w-full text-sm border border-gray-200 rounded px-2.5 py-1.5 bg-white text-left flex items-center justify-between focus:border-brand outline-none"
                onClick={() => setOpen((o) => !o)}
            >
                <span className={selectedLabel ? 'text-gray-800' : 'text-gray-400'}>
                    {selectedLabel || placeholder}
                </span>
                <i className={`fas fa-chevron-${open ? 'up' : 'down'} text-gray-400 text-xs`} />
            </button>

            {open && (
                <div className="absolute z-[600] mt-1 w-full bg-white border border-gray-200 rounded shadow-lg">
                    <div className="p-1.5 border-b border-gray-100">
                        <input
                            autoFocus
                            type="text"
                            className="w-full text-sm px-2 py-1 border border-gray-200 rounded outline-none focus:border-brand"
                            placeholder="Search…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="max-h-52 overflow-y-auto">
                        <button
                            type="button"
                            className="w-full text-left px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-50"
                            onClick={() => { onChange('', ''); setOpen(false); setSearch(''); }}
                        >
                            {placeholder}
                        </button>
                        {filtered.map((o) => (
                            <button
                                key={o.id}
                                type="button"
                                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-brand/10 ${o.id === value ? 'bg-brand/10 font-medium text-brand' : 'text-gray-800'}`}
                                onClick={() => { onChange(o.id, o.label); setOpen(false); setSearch(''); }}
                            >
                                {o.label}
                            </button>
                        ))}
                        {filtered.length === 0 && (
                            <div className="px-3 py-2 text-xs text-gray-400">No results</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function toOpts(fc, layer) {
    return (fc.features || [])
        .map((f) => ({
            id:    String(f.properties.feature_id ?? ''),
            label: String(f.properties[layer.label_from || 'name'] ?? f.properties.feature_id ?? ''),
        }))
        .filter((o) => o.id)
        .sort((a, b) => a.label.localeCompare(b.label, 'bn'));
}
