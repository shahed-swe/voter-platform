import { useEffect, useMemo, useState } from 'react';
import VoterCard from './VoterCard.jsx';
import * as votersApi from '../../api/voters.js';
import { SkeletonList, EmptyState, ErrorState } from '../LoadingState.jsx';

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
const toBn = (s) => String(s ?? '').replace(/[0-9]/g, (d) => BN_DIGITS[+d]);

// Deterministic shuffle so the same building always shows the same ordering
// (and a different building shows a different ordering). Uses a tiny LCG.
function seededShuffle(arr, seed) {
    const out = arr.slice();
    let s = (Number(seed) || 1) * 2654435761 % 4294967296;
    for (let i = out.length - 1; i > 0; i--) {
        s = (s * 1103515245 + 12345) % 2147483648;
        const j = s % (i + 1);
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

const TABS = [
    { key: '',                  label: 'সকল'             }, // All
    { key: 'Not visited',       label: 'পরিদর্শিত নয়'      },
    { key: 'Visited',           label: 'পরিদর্শিত'         },
    { key: 'Follow-up needed',  label: 'ফলো-আপ প্রয়োজন'   },
];

// Debounce search input
function useDebounce(value, ms = 300) {
    const [v, setV] = useState(value);
    useEffect(() => {
        const id = setTimeout(() => setV(value), ms);
        return () => clearTimeout(id);
    }, [value, ms]);
    return v;
}

export default function VoterListPanel({ scopeAreas, scopeLabel, building, onClearBuilding, onPickVoter }) {
    const [query, setQuery]       = useState('');
    const [status, setStatus]     = useState('');
    const [data, setData]         = useState({ voters: [], stats: { total: 0, visited: 0, not_visited: 0, follow_up: 0 } });
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState(null);

    const dQuery = useDebounce(query, 300);

    // When a building is active, the data source is the building's own
    // voter_area_name (matches the legacy behavior — "Voters in Building X"
    // is really "voters in the building's voter area").
    const effectiveAreas = building?.voter_area_name
        ? [building.voter_area_name]
        : scopeAreas;

    useEffect(() => {
        if (!effectiveAreas?.length) {
            setData({ voters: [], stats: { total: 0, visited: 0, not_visited: 0, follow_up: 0 } });
            setError(null);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError(null);
        votersApi
            .byVoterAreas({ areas: effectiveAreas, status: status || undefined, search: dQuery || undefined, limit: 500 })
            .then((res) => !cancelled && setData(res))
            .catch((err) => !cancelled && setError(err))
            .finally(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
    }, [effectiveAreas?.join('|'), status, dQuery]); // eslint-disable-line react-hooks/exhaustive-deps

    const hasScope = effectiveAreas?.length > 0;
    const remaining = (data.stats.total || 0) - (data.stats.visited || 0);

    const buildingTitle = building
        ? (building.house
            ? `Building ${building.house}`
            : building.street
                ? building.street
                : building.name_bn
                    ? building.name_bn
                    : `Building #${building.building_id}`)
        : null;

    return (
        <div className="bg-white border-2 border-brand/40 rounded-lg shadow-sm h-full flex flex-col overflow-hidden">
            <div className="px-4 pt-4 pb-2">
                {building ? (
                    <div className="flex items-start justify-between gap-2">
                        <h3 className="text-lg font-bold text-brand bn flex items-center gap-2">
                            <i className="fas fa-building" />
                            <span>{buildingTitle}</span>
                        </h3>
                        <button
                            onClick={onClearBuilding}
                            className="text-gray-400 hover:text-gray-600 text-xs"
                            title="Back to voter area"
                        >
                            <i className="fas fa-times" />
                        </button>
                    </div>
                ) : (
                    <h3 className="bn text-lg font-bold text-brand">
                        {hasScope ? (
                            <>Voters in <span className="text-gray-800">{scopeLabel}</span></>
                        ) : (
                            'একটি ভোটার এলাকা নির্বাচন করুন'
                        )}
                    </h3>
                )}
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
                    <EmptyState icon="fa-location-dot" label="Pick a voter area from the left to load voters." />
                ) : loading ? (
                    <SkeletonList rows={5} lines={3} />
                ) : error ? (
                    <ErrorState error={error} />
                ) : data.voters.length === 0 ? (
                    <EmptyState icon="fa-users-slash" label="No voters match this filter." />
                ) : (
                    (building
                        ? seededShuffle(data.voters, building.building_id)
                        : data.voters
                    ).map((v) => (
                        <VoterCard key={v.voter_id} voter={v} onClick={onPickVoter} />
                    ))
                )}
            </div>
        </div>
    );
}
