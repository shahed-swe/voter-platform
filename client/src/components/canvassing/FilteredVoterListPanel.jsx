import { useEffect, useRef, useState } from 'react';
import VoterCard from './VoterCard.jsx';
import * as votersApi from '../../api/voters.js';
import { voterSearchTerms } from '../../utils/avroPhonetic.js';
import { LoadingState, EmptyState, ErrorState } from '../LoadingState.jsx';

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
const toBn = (s) => String(s ?? '').replace(/[0-9]/g, (d) => BN_DIGITS[+d]);

const TABS = [
    { key: '',                  label: 'সকল'             },
    { key: 'Not visited',       label: 'পরিদর্শিত নয়'    },
    { key: 'Visited',           label: 'পরিদর্শিত'         },
    { key: 'Follow-up needed',  label: 'ফলো-আপ প্রয়োজন'  },
];

function useDebounce(value, ms = 400) {
    const [v, setV] = useState(value);
    useEffect(() => {
        const id = setTimeout(() => setV(value), ms);
        return () => clearTimeout(id);
    }, [value, ms]);
    return v;
}

const EMPTY_STATS = { total: 0, visited: 0, not_visited: 0, follow_up: 0 };
const PAGE_SIZE = 10;

/**
 * Voter list panel driven by /api/voters/filtered.
 * Loads PAGE_SIZE voters at a time; additional pages load automatically
 * as the user scrolls to the bottom (IntersectionObserver sentinel).
 *
 *   filters     — user-facing filter values from DynamicFilterPanel
 *   scope       — geo scope (e.g. {ward: '৫২'})
 *   scopeLabel  — display label for the header
 *   onPickVoter — callback when a voter card is clicked
 *   refreshKey  — increment to force reload without changing scope/filters
 */
export default function FilteredVoterListPanel({ filters, scope, scopeLabel, onPickVoter, refreshKey = 0 }) {
    const [query, setQuery]             = useState('');
    const [status, setStatus]           = useState('');
    const [voters, setVoters]           = useState([]);
    const [stats, setStats]             = useState(EMPTY_STATS);
    const [loading, setLoading]         = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError]             = useState(null);

    // fetchSpec drives all API calls.
    // replace:true  → clear list and load from offset 0
    // replace:false → append next page to existing list
    const [fetchSpec, setFetchSpec] = useState(null);
    const sentinelRef               = useRef(null);

    const dQuery = useDebounce(query, 400);

    const hasScope =
        Object.values(filters || {}).some((v) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0)) ||
        Object.values(scope  || {}).some((v) => v != null && v !== '');

    // Reset to page 0 whenever scope / filters / status / search / refreshKey change
    useEffect(() => {
        if (!hasScope) {
            setVoters([]);
            setStats(EMPTY_STATS);
            setFetchSpec(null);
            return;
        }
        const terms = voterSearchTerms(dQuery);
        setFetchSpec({
            filters: filters || {},
            scope:   scope   || {},
            status:  status  || undefined,
            search:  terms.search,
            search_bn: terms.search_bn,
            offset:  0,
            replace: true,
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(filters), JSON.stringify(scope), status, dQuery, hasScope, refreshKey]);

    // Execute whichever fetch is queued
    useEffect(() => {
        if (!fetchSpec) return;
        let cancelled = false;

        if (fetchSpec.replace) { setLoading(true); setError(null); }
        else                   { setLoadingMore(true); }

        votersApi.filtered({
            filters:   fetchSpec.filters,
            scope:     fetchSpec.scope,
            status:    fetchSpec.status,
            search:    fetchSpec.search,
            search_bn: fetchSpec.search_bn,
            limit:     PAGE_SIZE,
            offset:    fetchSpec.offset,
        })
            .then((res) => {
                if (cancelled) return;
                const next = res.voters || [];
                if (fetchSpec.replace) setVoters(next);
                else                   setVoters((prev) => [...prev, ...next]);
                setStats(res.stats || EMPTY_STATS);
            })
            .catch((err) => { if (!cancelled) setError(err); })
            .finally(() => {
                if (!cancelled) { setLoading(false); setLoadingMore(false); }
            });

        return () => { cancelled = true; };
    }, [fetchSpec]);

    const hasMore = voters.length < (stats.total || 0);

    // Infinite scroll — sentinel div at bottom triggers next page
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel || !hasMore || loading || loadingMore) return;

        // Snapshot current values so the observer callback is never stale
        const terms = voterSearchTerms(dQuery);
        const snap = {
            filters: filters || {},
            scope:   scope   || {},
            status:  status  || undefined,
            search:  terms.search,
            search_bn: terms.search_bn,
            offset:  voters.length,
        };

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setFetchSpec({ ...snap, replace: false });
                }
            },
            { threshold: 0.1 }
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasMore, loading, loadingMore, voters.length,
        JSON.stringify(filters), JSON.stringify(scope), status, dQuery]);

    const remaining = (stats.total || 0) - (stats.visited || 0);

    return (
        <div className="bg-white border-2 border-brand/40 rounded-lg shadow-sm h-full flex flex-col overflow-hidden">

            {/* Header */}
            <div className="px-4 pt-4 pb-2">
                <h3 className="bn text-lg font-bold text-brand truncate">
                    {hasScope ? (
                        <>
                            <span className="text-gray-800">{scopeLabel || 'নির্বাচিত এলাকা'}</span>
                            {stats.total > 0 && (
                                <span className="ml-2 text-sm font-normal text-gray-500">
                                    ({toBn(stats.total)} জন)
                                </span>
                            )}
                        </>
                    ) : (
                        'একটি এলাকা নির্বাচন করুন'
                    )}
                </h3>
            </div>

            {/* Search — English typing is transliterated to Bangla (Avro) */}
            <div className="px-4 pb-3">
                <input
                    type="text"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bn placeholder-gray-400 focus:border-brand focus:ring-1 focus:ring-brand outline-none"
                    placeholder="ভোটার খুঁজুন (English/বাংলা)..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    disabled={!hasScope}
                />
                {voterSearchTerms(query).search_bn && (
                    <div className="mt-1 text-xs text-gray-500 bn">
                        খুঁজছি: <span className="font-medium text-brand">{voterSearchTerms(query).search_bn}</span>
                    </div>
                )}
            </div>

            {/* Stats strip */}
            <div className="bg-brand/10 mx-4 mb-3 rounded-md px-3 py-2 grid grid-cols-3 gap-2 text-center bn">
                <div>
                    <div className="text-[11px] text-gray-600">মোট:</div>
                    <div className="text-lg font-bold text-brand">{toBn(stats.total || 0)}</div>
                </div>
                <div>
                    <div className="text-[11px] text-gray-600">পরিদর্শিত:</div>
                    <div className="text-lg font-bold text-brand">{toBn(stats.visited || 0)}</div>
                </div>
                <div>
                    <div className="text-[11px] text-gray-600">বাকি:</div>
                    <div className="text-lg font-bold text-brand">{toBn(remaining > 0 ? remaining : 0)}</div>
                </div>
            </div>

            {/* Status tabs */}
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

            {/* Voter list */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
                {!hasScope ? (
                    <EmptyState icon="fa-location-dot" label="একটি ওয়ার্ড নির্বাচন করুন।" />
                ) : loading ? (
                    <LoadingState />
                ) : error ? (
                    <ErrorState error={error} />
                ) : voters.length === 0 ? (
                    <EmptyState icon="fa-users-slash" label="কোনো ভোটার পাওয়া যায়নি।" />
                ) : (
                    <>
                        <div className="text-xs text-gray-400 text-center pb-1 bn">
                            দেখাচ্ছে {toBn(voters.length)} / {toBn(stats.total)} জন
                        </div>

                        {voters.map((v) => (
                            <VoterCard key={v.voter_id} voter={v} onClick={onPickVoter} />
                        ))}

                        {/* Sentinel — scrolling into view triggers next page load */}
                        {hasMore && (
                            <div ref={sentinelRef} className="py-4 flex justify-center">
                                {loadingMore ? (
                                    <span className="flex items-center gap-2 text-xs text-gray-400 bn">
                                        <svg className="animate-spin h-4 w-4 text-brand" viewBox="0 0 24 24" fill="none">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                        লোড হচ্ছে...
                                    </span>
                                ) : (
                                    <span className="text-xs text-gray-300 bn">↓ আরও দেখতে স্ক্রল করুন</span>
                                )}
                            </div>
                        )}

                        {!hasMore && voters.length > PAGE_SIZE && (
                            <div className="text-xs text-gray-400 text-center py-2 bn">
                                সকল {toBn(stats.total)} জন দেখানো হয়েছে
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
