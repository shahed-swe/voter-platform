import { useEffect, useRef, useState, useMemo } from 'react';
import CheckboxGroup from './CheckboxGroup.jsx';
import SingleSelect  from './SingleSelect.jsx';
import MultiSelect   from './MultiSelect.jsx';
import * as filterOptionsApi from '../../api/filterOptions.js';

/**
 * Renders a filter panel from an array of filter specs (candidate.filter_config).
 *
 * Each spec:
 *   { key, label, label_bn, type, source, value_col, label_col, depends_on? }
 *
 * `type`:
 *   - "checkbox-group"      → multi-value, grid of checkboxes  (small option set)
 *   - "select"              → single-value dropdown
 *   - "multi-select"        → multi-value dropdown
 *   - "multi-select-search" → multi-value dropdown with search box
 *
 * `depends_on`: the key of a parent filter. The child's options reload (filtered
 *               by the parent's selected value) whenever the parent changes.
 *
 * `value` is a flat object: `{ <filterKey>: scalarOrArray }`.
 */

const ICON_BY_KEY = {
    upazila:    'fa-map',
    union:      'fa-map-pin',
    mauza:      'fa-location-dot',
    voter_area: 'fa-location-dot',
    village:    'fa-home',
    ward:       'fa-map',
};

// Single-value vs multi-value type-coercion helpers
const isMulti = (type) =>
    type === 'multi-select' || type === 'multi-select-search' || type === 'checkbox-group';

function emptyValue(type) {
    return isMulti(type) ? [] : null;
}

// Reads the scalar value to pass as parent_value when the parent has a selection.
function parentValueFor(parentSpec, value) {
    const v = value[parentSpec.key];
    if (v == null) return null;
    if (Array.isArray(v)) return v.length === 1 ? v[0] : null;  // only filter when exactly one parent picked
    return v;
}

export default function DynamicFilterPanel({ config, value, onChange }) {
    // Options keyed by filter.key. Reloaded when the filter's parent value changes.
    const [optionsMap, setOptionsMap] = useState({});
    const [loadingMap, setLoadingMap] = useState({});

    const specsByKey = useMemo(() => {
        const m = {};
        for (const s of config) m[s.key] = s;
        return m;
    }, [config]);

    // For each filter, load options whenever its parent's value changes. A filter
    // whose parent value is unchanged keeps its options — previously any value
    // change refetched the option lists for EVERY filter (limit 5000 each),
    // including parentless ones whose options can never change.
    const loadedFor = useRef({});   // spec.key -> parent-value marker of the last load
    const lastConfig = useRef(null);
    useEffect(() => {
        let cancelled = false;
        if (lastConfig.current !== config) {
            lastConfig.current = config;
            loadedFor.current = {};
        }

        async function loadOne(spec, parent, parentVal) {
            setLoadingMap((m) => ({ ...m, [spec.key]: true }));
            try {
                const opts = await filterOptionsApi.list({
                    source: spec.source,
                    valueCol: spec.value_col,
                    labelCol: spec.label_col || spec.value_col,
                    parentCol: parent ? parent.value_col : undefined,
                    parentValue: parentVal || undefined,
                    limit: 5000,
                });
                if (!cancelled) setOptionsMap((m) => ({ ...m, [spec.key]: opts }));
            } catch (err) {
                console.error('[filter]', spec.key, 'load failed:', err.message);
                delete loadedFor.current[spec.key];   // allow a retry on the next change
                if (!cancelled) setOptionsMap((m) => ({ ...m, [spec.key]: [] }));
            } finally {
                if (!cancelled) setLoadingMap((m) => ({ ...m, [spec.key]: false }));
            }
        }

        for (const spec of config) {
            const parent = spec.depends_on ? specsByKey[spec.depends_on] : null;
            const parentVal = parent ? parentValueFor(parent, value) : null;
            const marker = parent ? `p:${parentVal}` : 'root';
            if (loadedFor.current[spec.key] === marker) continue;
            loadedFor.current[spec.key] = marker;

            // If a parent dependency exists but isn't (uniquely) chosen, blank the options.
            if (parent && parentVal == null) {
                setOptionsMap((m) => ({ ...m, [spec.key]: [] }));
                continue;
            }
            loadOne(spec, parent, parentVal);
        }
        return () => { cancelled = true; };
        // We re-run when the value object changes (any parent selection might have moved).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(value), config]);

    function setOne(key, newVal) {
        const next = { ...value, [key]: newVal };
        // Clearing a filter clears its descendants too — otherwise stale state.
        for (const s of config) {
            if (s.depends_on && hasAncestor(s, key, specsByKey)) {
                next[s.key] = emptyValue(s.type);
            }
        }
        onChange(next);
    }

    return (
        <div className="space-y-3">
            {config.map((spec) => {
                const opts = optionsMap[spec.key] || [];
                const v = value[spec.key] ?? emptyValue(spec.type);
                const disabled = !!spec.depends_on && opts.length === 0;
                const common = {
                    label:       spec.label,
                    labelBn:     spec.label_bn,
                    icon:        ICON_BY_KEY[spec.key],
                    options:     opts,
                    value:       v,
                    onChange:    (val) => setOne(spec.key, val),
                    disabled,
                };

                if (spec.type === 'checkbox-group') return <CheckboxGroup key={spec.key} {...common} />;
                if (spec.type === 'select')        return <SingleSelect  key={spec.key} {...common} />;
                if (spec.type === 'multi-select')  return <MultiSelect   key={spec.key} {...common} searchable={false} />;
                if (spec.type === 'multi-select-search') return <MultiSelect key={spec.key} {...common} searchable />;
                return null; // unknown type
            })}
            {/* {Object.values(loadingMap).some(Boolean) && (
                <div className="bg-white border border-brand/30 rounded-lg shadow-sm p-3 text-xs text-gray-500 text-center">
                    <i className="fas fa-spinner fa-spin mr-1" /> Loading options...
                </div>
            )} */}
        </div>
    );
}

/** Returns true if `spec` is a (transitive) descendant of `ancestorKey`. */
function hasAncestor(spec, ancestorKey, specsByKey) {
    let cur = spec;
    while (cur?.depends_on) {
        if (cur.depends_on === ancestorKey) return true;
        cur = specsByKey[cur.depends_on];
    }
    return false;
}
