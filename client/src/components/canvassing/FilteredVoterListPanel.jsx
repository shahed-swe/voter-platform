import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import VoterCard from './VoterCard.jsx';
import * as votersApi from '../../api/voters.js';
import { voterSearchTerms } from '../../utils/avroPhonetic.js';
import { SkeletonList, EmptyState, ErrorState } from '../LoadingState.jsx';
import useDebounce from '../../hooks/useDebounce.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { keys, TIER } from '../../api/queryKeys.js';

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
const toBn = (s) => String(s ?? '').replace(/[0-9]/g, (d) => BN_DIGITS[+d]);

const TABS = [
    { key: '',                  label: 'সকল'             },
    { key: 'Not visited',       label: 'পরিদর্শিত নয়'    },
    { key: 'Visited',           label: 'পরিদর্শিত'         },
    { key: 'Follow-up needed',  label: 'ফলো-আপ প্রয়োজন'  },
];

const EMPTY_STATS = { total: 0, visited: 0, not_visited: 0, follow_up: 0 };
const PAGE_SIZE = 10;

/**
 * Voter list panel driven by /api/voters/filtered (useInfiniteQuery).
 * Loads PAGE_SIZE voters at a time; additional pages load automatically
 * as the user scrolls to the bottom (IntersectionObserver sentinel).
 * A canvass submit invalidates the ['c', cid, 'voters'] cache subtree, which
 * refetches this list — no manual refresh keys.
 *
 *   filters     — user-facing filter values from DynamicFilterPanel
 *   scope       — geo scope (e.g. {ward: '৫২'})
 *   scopeLabel  — display label for the header
 *   onPickVoter — callback when a voter card is clicked
 *   buildingFilter — geo building feature_id: only voters canvassed at that building
 */
export default function FilteredVoterListPanel({ filters, scope, scopeLabel, onPickVoter, buildingFilter = null }) {
    const { candidate } = useAuth();
    const cid = candidate?.candidate_id;
    const [query, setQuery]   = useState('');
    const [status, setStatus] = useState('');
    const sentinelRef         = useRef(null);

    const dQuery = useDebounce(query, 400);

    const hasScope =
        Object.values(filters || {}).some((v) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0)) ||
        Object.values(scope  || {}).some((v) => v != null && v !== '');

    // Everything that identifies one list — part of the query key, so changing
    // any of it starts a fresh list at offset 0 (the old "replace" reset).
    const listParams = useMemo(() => {
        const terms = voterSearchTerms(dQuery);
        return {
            filters: filters || {},
            scope:   scope   || {},
            status:  status  || undefined,
            search:  terms.search,
            search_bn: terms.search_bn,
            building_feature_id: buildingFilter || undefined,
        };
    }, [JSON.stringify(filters), JSON.stringify(scope), status, dQuery, buildingFilter]); // eslint-disable-line react-hooks/exhaustive-deps

    const listQuery = useInfiniteQuery({
        queryKey: keys.voterList(cid, listParams),
        queryFn: ({ pageParam }) => votersApi.filtered({ ...listParams, limit: PAGE_SIZE, offset: pageParam }),
        initialPageParam: 0,
        getNextPageParam: (lastPage, allPages) => {
            const loaded = allPages.reduce((n, p) => n + (p.voters?.length || 0), 0);
            const total = Number(lastPage.stats?.total || 0);
            return loaded < total && (lastPage.voters?.length || 0) > 0 ? loaded : undefined;
        },
        enabled: !!cid && hasScope,
        ...TIER.LIVE,
    });

    const voters = useMemo(
        () => (hasScope ? (listQuery.data?.pages || []).flatMap((p) => p.voters || []) : []),
        [listQuery.data, hasScope]
    );
    const stats = (hasScope && listQuery.data?.pages?.length)
        ? (listQuery.data.pages[listQuery.data.pages.length - 1].stats || EMPTY_STATS)
        : EMPTY_STATS;
    const loading     = hasScope && listQuery.isLoading;
    const loadingMore = listQuery.isFetchingNextPage;
    const error       = listQuery.error;
    const hasMore     = !!listQuery.hasNextPage;

    // Infinite scroll — sentinel div at bottom triggers the next page
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel || !hasMore || loading || loadingMore) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) listQuery.fetchNextPage();
            },
            { threshold: 0.1 }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasMore, loading, loadingMore, voters.length]);

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
                    <SkeletonList rows={5} lines={3} />
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
