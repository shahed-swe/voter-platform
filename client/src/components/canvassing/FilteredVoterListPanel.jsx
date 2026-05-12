import { useEffect, useState } from 'react';
import VoterCard from './VoterCard.jsx';
import * as votersApi from '../../api/voters.js';
import { LoadingState, EmptyState, ErrorState } from '../LoadingState.jsx';

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
const toBn = (s) => String(s ?? '').replace(/[0-9]/g, (d) => BN_DIGITS[+d]);

const TABS = [
    { key: '',                  label: 'সকল'             },
    { key: 'Not visited',       label: 'পরিদর্শিত নয়'      },
    { key: 'Visited',           label: 'পরিদর্শিত'         },
    { key: 'Follow-up needed',  label: 'ফলো-আপ প্রয়োজন'   },
];

function useDebounce(value, ms = 300) {
    const [v, setV] = useState(value);
    useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
    return v;
}

/**
 * Voter list panel driven by the generic /api/voters/filtered endpoint.
 * Pass the active filter object (same shape as DynamicFilterPanel's value).
 *
 *   filters    — { upazila: [...], union: 'X', mauza: 'Y', village: 'V' }
 *   scopeLabel — display label for the panel header
 *   onPickVoter — callback when a voter card is clicked
 */
export default function FilteredVoterListPanel({ filters, scopeLabel, onPickVoter }) {
    const [query, setQuery]     = useState('');
    const [status, setStatus]   = useState('');
    const [data, setData]       = useState({ voters: [], stats: { total: 0, visited: 0, not_visited: 0, follow_up: 0 } });
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState(null);

    const dQuery = useDebounce(query, 300);

    // Has user picked any filter at all?
    const hasScope = Object.values(filters || {}).some(
        (v) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0)
    );

    useEffect(() => {
        if (!hasScope) {
            setData({ voters: [], stats: { total: 0, visited: 0, not_visited: 0, follow_up: 0 } });
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError(null);
        votersApi
            .filtered({
                filters,
                status: status || undefined,
                search: dQuery || undefined,
                limit:  500,
            })
            .then((res) => !cancelled && setData(res))
            .catch((err) => !cancelled && setError(err))
            .finally(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
    }, [JSON.stringify(filters), status, dQuery, hasScope]);

    const remaining = (data.stats.total || 0) - (data.stats.visited || 0);

    return (
        <div className="bg-white border-2 border-brand/40 rounded-lg shadow-sm h-full flex flex-col overflow-hidden">
            <div className="px-4 pt-4 pb-2">
                <h3 className="bn text-lg font-bold text-brand truncate">
                    {hasScope ? (
                        <>Voters in <span className="text-gray-800">{scopeLabel || 'selection'}</span></>
                    ) : (
                        'একটি এলাকা নির্বাচন করুন'
                    )}
                </h3>
            </div>

            <div className="px-4 pb-3">
                <input
                    type="text"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bn placeholder-gray-400 focus:border-brand focus:ring-1 focus:ring-brand outline-none"
                    placeholder="ভোটার অনুসন্ধান করুন..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    disabled={!hasScope}
                />
            </div>

            <div className="bg-brand/10 mx-4 mb-3 rounded-md px-3 py-2 grid grid-cols-3 gap-2 text-center bn">
                <div>
                    <div className="text-[11px] text-gray-600">মোট:</div>
                    <div className="text-lg font-bold text-brand">{toBn(data.stats.total || 0)}</div>
                </div>
                <div>
                    <div className="text-[11px] text-gray-600">পরিদর্শিত:</div>
                    <div className="text-lg font-bold text-brand">{toBn(data.stats.visited || 0)}</div>
                </div>
                <div>
                    <div className="text-[11px] text-gray-600">বাকি:</div>
                    <div className="text-lg font-bold text-brand">{toBn(remaining > 0 ? remaining : 0)}</div>
                </div>
            </div>

            <div className="px-4 pb-3 flex gap-2 overflow-x-auto">
                {TABS.map((t) => (
                    <button
                        key={t.key || 'all'}
                        onClick={() => setStatus(t.key)}
                        className={`bn text-xs font-medium px-3 py-1.5 rounded border whitespace-nowrap transition-colors ${
                            status === t.key
                                ? 'bg-brand text-white border-brand'
                                : 'bg-white text-brand border-brand hover:bg-brand/5'
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
                {!hasScope ? (
                    <EmptyState icon="fa-location-dot" label="Pick a filter on the left to load voters." />
                ) : loading ? (
                    <LoadingState />
                ) : error ? (
                    <ErrorState error={error} />
                ) : data.voters.length === 0 ? (
                    <EmptyState icon="fa-users-slash" label="No voters match this filter." />
                ) : (
                    data.voters.map((v) => <VoterCard key={v.voter_id} voter={v} onClick={onPickVoter} />)
                )}
            </div>
        </div>
    );
}
