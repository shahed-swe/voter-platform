import { useState } from 'react';

/**
 * Visual designer for a candidate's geographic layer hierarchy.
 * `value` is an ordered array of layer objects:
 *   { layer_key, display_name, parent_layer_key, geometry_type, is_leaf,
 *     click_action, color_by }
 * Shallow→deep ordering = top→bottom in the list.
 */

const GEOMETRY = [
    { value: 'polygon', label: 'Polygon (area)' },
    { value: 'point',   label: 'Point (marker)' },
];
const CLICK = [
    { value: 'drill',                  label: 'Drill into children' },
    { value: 'select',                 label: 'Select (no drill)' },
    { value: 'modal:canvassed_voters', label: 'Open canvassed-voters popup' },
];
const COLOR = [
    { value: 'uniform',   label: 'Single colour' },
    { value: 'bucket',    label: 'Shade by population' },
    { value: 'canvassed', label: 'Canvassed vs not' },
];

const slugKey = (s) =>
    String(s || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);

function blankLayer(ordinalName = '') {
    return {
        layer_key: slugKey(ordinalName),
        display_name: ordinalName,
        parent_layer_key: null,
        geometry_type: 'polygon',
        is_leaf: false,
        click_action: 'drill',
        color_by: 'uniform',
    };
}

export default function LayerDesigner({ value, onChange }) {
    const layers = value || [];

    function update(i, patch) {
        const next = layers.map((l, idx) => (idx === i ? { ...l, ...patch } : l));
        onChange(next);
    }
    function add() {
        onChange([...layers, blankLayer('')]);
    }
    function remove(i) {
        const removedKey = layers[i].layer_key;
        // also clear any child references to the removed layer
        onChange(
            layers
                .filter((_, idx) => idx !== i)
                .map((l) => (l.parent_layer_key === removedKey ? { ...l, parent_layer_key: null } : l))
        );
    }
    function move(i, dir) {
        const j = i + dir;
        if (j < 0 || j >= layers.length) return;
        const next = layers.slice();
        [next[i], next[j]] = [next[j], next[i]];
        onChange(next);
    }

    return (
        <div className="space-y-3">
            <p className="text-sm text-gray-600">
                Define this constituency's geographic levels, shallowest first. Each level can
                drill into the next (e.g. <em>Ward → Sector → Building</em>). You'll upload a map
                file for each one after creating the candidate.
            </p>

            {layers.length === 0 && (
                <div className="text-sm text-gray-400 border border-dashed border-gray-300 rounded-md p-6 text-center">
                    No layers yet. Add your first level (usually the largest area, e.g. Ward).
                </div>
            )}

            {layers.map((l, i) => {
                // valid parents = any layer ABOVE this one in the list
                const parentOptions = layers.slice(0, i);
                return (
                    <div key={i} className="border border-gray-200 rounded-md p-3 bg-white">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="w-6 h-6 rounded-full bg-brand text-white text-xs flex items-center justify-center font-semibold">
                                {i + 1}
                            </span>
                            <input
                                className="input-field flex-1"
                                placeholder="Layer name (e.g. Ward, Sector, Building)"
                                value={l.display_name}
                                onChange={(e) => {
                                    const dn = e.target.value;
                                    // auto-fill key from name only if key was empty or auto-derived
                                    const autoKey = slugKey(l.display_name) === l.layer_key;
                                    update(i, autoKey ? { display_name: dn, layer_key: slugKey(dn) } : { display_name: dn });
                                }}
                            />
                            <div className="flex flex-col">
                                <button type="button" className="text-gray-400 hover:text-brand text-xs" onClick={() => move(i, -1)} disabled={i === 0}>▲</button>
                                <button type="button" className="text-gray-400 hover:text-brand text-xs" onClick={() => move(i, 1)} disabled={i === layers.length - 1}>▼</button>
                            </div>
                            <button type="button" className="text-red-400 hover:text-red-600 ml-1" onClick={() => remove(i)}>
                                <i className="fas fa-trash" />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                            <label className="block">
                                <span className="text-xs text-gray-500">Key (immutable id)</span>
                                <input
                                    className="input-field font-mono text-xs"
                                    value={l.layer_key}
                                    onChange={(e) => update(i, { layer_key: slugKey(e.target.value) })}
                                />
                            </label>
                            <label className="block">
                                <span className="text-xs text-gray-500">Nests under</span>
                                <select
                                    className="input-field"
                                    value={l.parent_layer_key || ''}
                                    onChange={(e) => update(i, { parent_layer_key: e.target.value || null })}
                                >
                                    <option value="">— top level —</option>
                                    {parentOptions.map((p) => (
                                        <option key={p.layer_key} value={p.layer_key}>{p.display_name || p.layer_key}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-xs text-gray-500">Geometry</span>
                                <select className="input-field" value={l.geometry_type} onChange={(e) => update(i, { geometry_type: e.target.value })}>
                                    {GEOMETRY.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-xs text-gray-500">On click</span>
                                <select className="input-field" value={l.click_action} onChange={(e) => update(i, { click_action: e.target.value })}>
                                    {CLICK.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-xs text-gray-500">Colour</span>
                                <select className="input-field" value={l.color_by} onChange={(e) => update(i, { color_by: e.target.value })}>
                                    {COLOR.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                                </select>
                            </label>
                            <label className="flex items-center gap-2 mt-5">
                                <input type="checkbox" className="accent-brand" checked={!!l.is_leaf} onChange={(e) => update(i, { is_leaf: e.target.checked })} />
                                <span className="text-xs text-gray-600">Leaf (deepest level)</span>
                            </label>
                        </div>
                    </div>
                );
            })}

            <button type="button" className="btn-secondary w-full" onClick={add}>
                <i className="fas fa-plus" /> Add a layer
            </button>
        </div>
    );
}

// Two starter presets the wizard can drop in (user can then edit freely).
export const LAYER_PRESETS = {
    urban: [
        { layer_key: 'ward',       display_name: 'Ward',       parent_layer_key: null,         geometry_type: 'polygon', is_leaf: false, click_action: 'drill',  color_by: 'uniform' },
        { layer_key: 'voter_area', display_name: 'Voter Area', parent_layer_key: 'ward',       geometry_type: 'polygon', is_leaf: false, click_action: 'drill',  color_by: 'bucket'  },
        { layer_key: 'building',   display_name: 'Building',   parent_layer_key: 'voter_area', geometry_type: 'polygon', is_leaf: true,  click_action: 'modal:canvassed_voters', color_by: 'canvassed' },
    ],
    rural: [
        { layer_key: 'union',   display_name: 'Union',   parent_layer_key: null,    geometry_type: 'polygon', is_leaf: false, click_action: 'drill',  color_by: 'uniform' },
        { layer_key: 'mauza',   display_name: 'Mauza',   parent_layer_key: 'union', geometry_type: 'polygon', is_leaf: false, click_action: 'drill',  color_by: 'bucket'  },
        { layer_key: 'village', display_name: 'Village', parent_layer_key: 'mauza', geometry_type: 'polygon', is_leaf: true,  click_action: 'select', color_by: 'bucket'  },
    ],
    uttara: [
        { layer_key: 'ward',     display_name: 'Ward',     parent_layer_key: null,     geometry_type: 'polygon', is_leaf: false, click_action: 'drill',  color_by: 'uniform' },
        { layer_key: 'sector',   display_name: 'Sector',   parent_layer_key: 'ward',   geometry_type: 'polygon', is_leaf: false, click_action: 'drill',  color_by: 'bucket'  },
        { layer_key: 'building', display_name: 'Building', parent_layer_key: 'sector', geometry_type: 'polygon', is_leaf: true,  click_action: 'modal:canvassed_voters', color_by: 'canvassed' },
    ],
};
