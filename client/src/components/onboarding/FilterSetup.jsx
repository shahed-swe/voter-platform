import { useEffect, useState } from 'react';
import { Spinner } from '../LoadingState.jsx';
import * as onboardingApi from '../../api/onboarding.js';
import { useAuth } from '../../auth/AuthContext.jsx';

/**
 * Standalone filter designer — turn any voter attribute column into a
 * left-panel filter, WITHOUT re-importing voters. Reads the candidate's
 * existing filter_config to pre-select, lists voter attribute keys as
 * toggleable chips, and saves to candidate.filter_config.
 */
export default function FilterSetup() {
    const { candidate, refresh } = useAuth();
    const [keys, setKeys]       = useState(null);
    const [chosen, setChosen]   = useState({});   // value_col → label
    const [saving, setSaving]   = useState(false);
    const [done, setDone]       = useState(false);
    const [err, setErr]         = useState(null);

    useEffect(() => {
        // seed selection from current filter_config (only voters_attr ones)
        const seed = {};
        for (const f of candidate?.filter_config || []) {
            if (f.source === 'voters_attr' && f.value_col) seed[f.value_col] = f.label || f.value_col;
        }
        setChosen(seed);
        onboardingApi.getVoterAttributeKeys().then(setKeys).catch((e) => setErr(e.message));
    }, [candidate?.candidate_id]);

    function toggle(k) {
        setChosen((cur) => {
            const next = { ...cur };
            if (next[k.key] != null) delete next[k.key];
            else next[k.key] = k.key;
            return next;
        });
        setDone(false);
    }

    async function save() {
        setSaving(true); setErr(null);
        try {
            const filters = Object.entries(chosen).map(([value_col, label]) => ({
                key: value_col.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
                label,
                type: 'select',
                source: 'voters_attr',
                value_col,
            }));
            await onboardingApi.saveFilters(filters);
            await refresh?.();   // pull new filter_config into the candidate context
            setDone(true);
        } catch (e) {
            setErr(e.response?.data?.error || e.message);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="card">
            <h3 className="card-title"><i className="fas fa-filter mr-2 text-brand" />Left-panel filters</h3>
            <p className="text-xs text-gray-500 mb-3">
                Pick which voter columns become filters on the canvassing screen. Low-cardinality
                columns (a handful of distinct values) make the best filters. No re-upload needed.
            </p>

            {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-2 mb-3">{err}</div>}
            {done && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded p-2 mb-3">Filters saved ✓</div>}

            {keys === null ? (
                <div className="text-sm text-gray-400"><Spinner size="sm" /> Loading columns… (import voters first)</div>
            ) : keys.length === 0 ? (
                <div className="text-sm text-gray-400">No voter data yet — import voters below first.</div>
            ) : (
                <>
                    <div className="flex flex-wrap gap-2 mb-3">
                        {keys.map((k) => {
                            const on = chosen[k.key] != null;
                            const tooMany = k.distinct_values > 100;
                            return (
                                <button
                                    key={k.key}
                                    type="button"
                                    onClick={() => toggle(k)}
                                    title={`${k.distinct_values} distinct values${k.samples ? ' — e.g. ' + k.samples.filter(Boolean).slice(0,3).join(', ') : ''}`}
                                    className={`text-xs px-2.5 py-1 rounded-full border bn ${
                                        on ? 'bg-brand text-white border-brand'
                                           : tooMany ? 'bg-gray-50 text-gray-400 border-gray-200'
                                                     : 'bg-white text-gray-700 border-gray-300 hover:border-brand'
                                    }`}
                                >
                                    {on && <i className="fas fa-check mr-1" />}
                                    {k.key}
                                    <span className="opacity-60 ml-1">({k.distinct_values})</span>
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-400">{Object.keys(chosen).length} selected</span>
                        <button className="btn-primary" onClick={save} disabled={saving}>
                            {saving ? <Spinner size="sm" /> : <i className="fas fa-save" />} Save filters
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
