import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import * as canvassingApi from '../api/canvassing.js';
import { useAuth } from '../auth/AuthContext.jsx';
import VoterHistoryDrawer from '../components/party/VoterHistoryDrawer.jsx';
import { SkeletonList, SkeletonStats, Skeleton, ErrorState, EmptyState, Spinner } from '../components/LoadingState.jsx';

const BN = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
const toBn = (s) => String(s ?? '').replace(/[0-9]/g, (d) => BN[+d]);

function fmtDate(d) {
    if (!d) return '';
    try {
        return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return String(d); }
}

function SupportBadge({ level, rating }) {
    const r = Number(rating || 0);
    const tone = r >= 4 ? 'bg-green-100 text-green-700'
        : r <= 2 && r > 0 ? 'bg-red-100 text-red-700'
        : 'bg-gray-100 text-gray-600';
    return (
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${tone}`}>
            {level || 'Unknown'}{r ? ` · ${toBn(r)}/৫` : ''}
        </span>
    );
}

// The stat cards double as the list's filters — matching the server's own
// definitions (stats query: strong = rating ≥ 4, weak = rating ≤ 2).
const FILTERS = {
    all:      { label: 'মোট জরিপ',      stat: 'total_canvasses', tone: 'text-brand' },
    unique:   { label: 'Voter (unique)', stat: 'unique_voters',   tone: 'text-blue-600' },
    strong:   { label: 'Strong support', stat: 'strong_support',  tone: 'text-green-600' },
    weak:     { label: 'Weak support',   stat: 'weak_support',    tone: 'text-red-600' },
    followup: { label: 'Follow-up',      stat: 'follow_up',       tone: 'text-amber-600' },
};

function applyFilter(records, filter) {
    switch (filter) {
        case 'strong':   return records.filter((r) => Number(r.support_rating) >= 4);
        case 'weak':     return records.filter((r) => { const n = Number(r.support_rating); return n > 0 && n <= 2; });
        case 'followup': return records.filter((r) => r.follow_up_needed);
        case 'unique': { // latest visit per voter (records arrive newest-first)
            const seen = new Set();
            return records.filter((r) => (seen.has(r.voter_id) ? false : (seen.add(r.voter_id), true)));
        }
        default: return records;
    }
}

function FilterCard({ id, value, active, onClick }) {
    const f = FILTERS[id];
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`text-left bg-white rounded-lg px-4 py-3 border transition-colors ${
                active
                    ? 'border-brand ring-1 ring-brand bg-brand/5'
                    : 'border-brand/20 hover:border-brand/50'
            }`}
            title={id === 'all' ? 'সব জরিপ দেখুন' : `শুধু ${f.label} দেখুন`}
        >
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{f.label}</div>
            <div className={`text-2xl font-bold ${f.tone}`}>{toBn(Number(value || 0).toLocaleString('en-US'))}</div>
        </button>
    );
}

// Detail row inside the record dialog
function Detail({ label, value }) {
    if (value == null || value === '' || value === false) return null;
    return (
        <div className="flex gap-2 text-sm">
            <span className="text-gray-500 min-w-[130px] flex-shrink-0">{label}:</span>
            <span className="text-gray-800 font-medium">{String(value)}</span>
        </div>
    );
}

/** Full survey response in a dialog (replaces the old inline expansion). */
function RecordModal({ r, isSuper, onHistory, onClose }) {
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
                <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100">
                    <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900 truncate">
                            {r.voter_name || `Voter #${r.voter_id}`}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                            {r.sos_vid && <span>SOS: {r.sos_vid} · </span>}
                            {r.ward && <span className="bn">ওয়ার্ড {r.ward} · </span>}
                            {r.voter_area_name}
                        </div>
                    </div>
                    <SupportBadge level={r.support_level} rating={r.support_rating} />
                    <button
                        className="h-8 w-8 -mr-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex-shrink-0"
                        onClick={onClose}
                        aria-label="বন্ধ করুন"
                    >
                        <i className="fas fa-xmark" />
                    </button>
                </div>

                <div className="px-5 py-4 overflow-y-auto space-y-1.5">
                    <Detail label="Support level" value={r.support_level} />
                    <Detail label="Support rating" value={r.support_rating ? `${toBn(r.support_rating)}/৫` : null} />
                    <Detail label="Undecided" value={r.is_undecided ? 'হ্যাঁ' : null} />
                    <Detail label="Issues / concerns" value={r.issues_concerns} />
                    <Detail label="Household size" value={r.household_size} />
                    <Detail label="Member count" value={r.voter_member_count} />
                    <Detail label="Income bracket" value={r.income_bracket} />
                    <Detail label="Minority" value={r.is_minority ? 'হ্যাঁ' : null} />
                    <Detail label="Follow-up" value={r.follow_up_needed ? 'প্রয়োজন' : null} />
                    <Detail label="Follow-up date" value={r.follow_up_date ? fmtDate(r.follow_up_date) : null} />
                    <Detail label="Phone" value={r.contact_phone} />
                    <Detail label="Email" value={r.contact_email} />
                    <Detail label="Building" value={r.building_name} />
                    <Detail label="Floor / Flat" value={[r.floor_number, r.flat_number].filter(Boolean).join(' / ') || null} />
                    <Detail label="Address" value={r.address} />
                    <Detail label="Source" value={r.source} />
                    <Detail label="Canvassed by" value={r.canvasser_name} />
                    <Detail label="Date" value={fmtDate(r.canvass_date)} />
                </div>

                {/* §10: only the Main Admin sees the cross-party timeline */}
                {isSuper && (
                    <div className="px-5 py-3 border-t border-gray-100">
                        <button
                            className="inline-flex items-center gap-2 text-sm text-brand border border-brand/30 rounded-md px-3 py-1.5 hover:bg-brand/5"
                            onClick={() => onHistory({ voter_id: r.voter_id, name: r.voter_name })}
                        >
                            <i className="fas fa-clock-rotate-left" />
                            সম্পূর্ণ ভিজিট history (cross-party)
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// The page has two faces: campaign roles see their OWN campaign's records;
// the Main Admin gets the platform-wide view (all parties, all candidates)
// with party → candidate drill-down, modeled on the Political Admin's
// /party/surveys but across every party.
export default function SurveyDataPage() {
    const { user } = useAuth();
    return user?.is_super_admin ? <SuperSurveyView /> : <CampaignSurveyView />;
}

function CampaignSurveyView() {
    const { user, candidate } = useAuth();
    const [stats, setStats]     = useState(null);
    const [records, setRecords] = useState(null);
    const [error, setError]     = useState(null);
    const [q, setQ]             = useState('');
    const [filter, setFilter]   = useState('all');
    const [view, setView]       = useState('table'); // 'table' | 'cards'
    const [selected, setSelected] = useState(null);  // record for the dialog
    const [loading, setLoading] = useState(false);
    const [history, setHistory] = useState(null);    // super-admin: cross-party timeline drawer

    const constituencyId = candidate?.candidate_id;

    // Stats don't depend on the search term — fetch them once per constituency,
    // and only refetch the records list while searching.
    const load = useCallback((search, withStats) => {
        setLoading(true);
        Promise.all([
            canvassingApi.voterRecords({ q: search || undefined, limit: 300 }),
            withStats ? canvassingApi.stats() : null,
        ])
            .then(([r, s]) => {
                setRecords(r.records || []);
                if (s) setStats(s.stats || null);
                setError(null);
            })
            .catch(setError)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load('', true); }, [load, constituencyId]);

    // Debounced search — records only, and not on the initial mount (the effect
    // above already loaded everything; running here too double-fetched).
    const firstSearchRun = useRef(true);
    useEffect(() => {
        if (firstSearchRun.current) { firstSearchRun.current = false; return; }
        const id = setTimeout(() => load(q.trim(), false), 350);
        return () => clearTimeout(id);
    }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

    const visible = useMemo(() => applyFilter(records || [], filter), [records, filter]);

    if (error) return <ErrorState error={error} onRetry={() => load('', true)} />;
    if (records === null) {
        return (
            <div className="max-w-5xl mx-auto space-y-5">
                <Skeleton className="h-8 w-48" />
                <SkeletonStats count={5} className="grid grid-cols-2 md:grid-cols-5 gap-3" />
                <Skeleton className="h-10 w-full" />
                <SkeletonList rows={6} lines={1} />
            </div>
        );
    }

    const isSuper = !!user?.is_super_admin;
    const openHistory = (h) => { setSelected(null); setHistory(h); };

    return (
        <div className="max-w-5xl mx-auto space-y-5">
            <div>
                <h1 className="text-xl font-bold text-gray-900">Survey Data</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                    {candidate?.title || candidate?.constituency} — আপনার সংগৃহীত জরিপের তথ্য
                </p>
            </div>

            {/* Stats = filters: click a card to see only those records */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {Object.keys(FILTERS).map((id) => (
                    <FilterCard
                        key={id}
                        id={id}
                        value={stats?.[FILTERS[id].stat]}
                        active={filter === id}
                        onClick={() => setFilter(filter === id && id !== 'all' ? 'all' : id)}
                    />
                ))}
            </div>

            {/* Search + view toggle */}
            <div className="flex items-center gap-2">
                <div className="relative flex-1">
                    <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
                    <input
                        className="w-full border border-gray-300 rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand"
                        placeholder="Voter নাম বা SOS VID দিয়ে খুঁজুন..."
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                    />
                    {loading && <span className="absolute right-3 top-1/2 -translate-y-1/2"><Spinner size="sm" /></span>}
                </div>
                <div className="flex rounded-md border border-gray-300 overflow-hidden flex-shrink-0" role="group" aria-label="তালিকার ধরন">
                    {[['table', 'fa-table-list', 'টেবিল'], ['cards', 'fa-rectangle-list', 'কার্ড']].map(([v, icon, label]) => (
                        <button
                            key={v}
                            type="button"
                            onClick={() => setView(v)}
                            aria-pressed={view === v}
                            title={`${label} view`}
                            className={`px-3 py-2 text-sm ${
                                view === v ? 'bg-brand text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                            } ${v === 'cards' ? 'border-l border-gray-300' : ''}`}
                        >
                            <i className={`fas ${icon}`} />
                        </button>
                    ))}
                </div>
            </div>

            {/* Active-filter caption */}
            {filter !== 'all' && (
                <p className="text-sm text-gray-500 bn -mt-2">
                    {FILTERS[filter].label} filter — {toBn(visible.length)} টি record দেখানো হচ্ছে ·{' '}
                    <button className="text-brand hover:underline" onClick={() => setFilter('all')}>সব দেখুন</button>
                </p>
            )}

            {visible.length === 0 ? (
                <EmptyState
                    icon="fa-clipboard-list"
                    label={filter === 'all' && !q.trim() ? 'এখনো কোনো জরিপের তথ্য নেই।' : 'এই খোঁজ/filter-এ কিছু পাওয়া যায়নি।'}
                />
            ) : view === 'table' ? (
                <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
                            <tr>
                                <th className="px-4 py-2.5 text-left">ভোটার</th>
                                <th className="px-4 py-2.5 text-left">এলাকা</th>
                                <th className="px-4 py-2.5 text-left">Support</th>
                                <th className="px-4 py-2.5 text-left">Canvasser</th>
                                <th className="px-4 py-2.5 text-left whitespace-nowrap">তারিখ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {visible.map((r) => (
                                <tr
                                    key={r.canvass_id}
                                    className="hover:bg-gray-50 cursor-pointer"
                                    onClick={() => setSelected(r)}
                                    tabIndex={0}
                                    onKeyDown={(e) => { if (e.key === 'Enter') setSelected(r); }}
                                >
                                    <td className="px-4 py-2.5">
                                        <div className="font-medium text-gray-900">{r.voter_name || `Voter #${r.voter_id}`}</div>
                                        {r.sos_vid && <div className="text-xs text-gray-400">SOS: {r.sos_vid}</div>}
                                    </td>
                                    <td className="px-4 py-2.5 text-gray-600">
                                        {r.ward && <span className="bn">ওয়ার্ড {r.ward}</span>}
                                        {r.ward && r.voter_area_name ? ' · ' : ''}
                                        {r.voter_area_name}
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <SupportBadge level={r.support_level} rating={r.support_rating} />
                                            {r.follow_up_needed && (
                                                <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full whitespace-nowrap">Follow-up</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{r.canvasser_name || '—'}</td>
                                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{fmtDate(r.canvass_date)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="space-y-2">
                    {visible.map((r) => (
                        <button
                            key={r.canvass_id}
                            className="w-full bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50"
                            onClick={() => setSelected(r)}
                        >
                            <div className="flex-1 min-w-0">
                                <div className="font-medium text-gray-900 truncate">
                                    {r.voter_name || `Voter #${r.voter_id}`}
                                    {r.sos_vid && <span className="text-xs text-gray-400 ml-2">SOS: {r.sos_vid}</span>}
                                </div>
                                <div className="text-xs text-gray-500 truncate">
                                    {r.ward && <span className="bn">ওয়ার্ড {r.ward} · </span>}
                                    {r.voter_area_name}
                                    {r.canvasser_name && <span> · by {r.canvasser_name}</span>}
                                </div>
                            </div>
                            <SupportBadge level={r.support_level} rating={r.support_rating} />
                            {r.follow_up_needed && (
                                <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">Follow-up</span>
                            )}
                            <span className="text-xs text-gray-400 hidden sm:inline whitespace-nowrap">{fmtDate(r.canvass_date)}</span>
                            <i className="fas fa-chevron-right text-gray-300 text-xs" />
                        </button>
                    ))}
                </div>
            )}

            {selected && (
                <RecordModal
                    r={selected}
                    isSuper={isSuper}
                    onHistory={openHistory}
                    onClose={() => setSelected(null)}
                />
            )}

            {history && (
                <VoterHistoryDrawer
                    voterId={history.voter_id}
                    voterName={history.name}
                    onClose={() => setHistory(null)}
                />
            )}
        </div>
    );
}

// ── Main Admin: platform-wide survey view ─────────────────────────────────────
const PAGE_SIZE = 50;

function Stars({ rating }) {
    const r = Number(rating || 0);
    if (!r) return <span className="text-gray-300">—</span>;
    return (
        <span className="whitespace-nowrap" aria-label={`${r}/5`}>
            {[1, 2, 3, 4, 5].map((i) => (
                <i key={i} className={`fas fa-star text-[10px] ${i <= r ? 'text-amber-400' : 'text-gray-200'}`} />
            ))}
        </span>
    );
}

function Tile({ label, value, tone }) {
    return (
        <div className="bg-white border border-brand/20 rounded-lg px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</div>
            <div className={`text-2xl font-bold ${tone || 'text-brand'}`}>{toBn(Number(value || 0).toLocaleString('en-US'))}</div>
        </div>
    );
}

const CHIP = 'px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border transition-colors';
const chipCls = (active) => `${CHIP} ${active
    ? 'bg-brand text-white border-brand'
    : 'bg-white text-gray-700 border-gray-200 hover:border-brand/50'}`;

function SuperSurveyView() {
    const [stats, setStats]     = useState(null); // one row per candidate (all parties)
    const [records, setRecords] = useState(null);
    const [total, setTotal]     = useState(0);
    const [page, setPage]       = useState(0);
    const [party, setParty]     = useState('all');   // party_id
    const [pc, setPc]           = useState('all');   // candidate user_id
    const [q, setQ]             = useState('');
    const [debouncedQ, setDebouncedQ] = useState('');
    const [error, setError]     = useState(null);
    const [loading, setLoading] = useState(false);
    const [history, setHistory] = useState(null);

    useEffect(() => {
        canvassingApi.partyStats()
            .then((r) => setStats(r.stats || []))
            .catch(setError);
    }, []);

    useEffect(() => {
        const t = setTimeout(() => { setDebouncedQ(q.trim()); setPage(0); }, 350);
        return () => clearTimeout(t);
    }, [q]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        canvassingApi.partyRecords({
            party_id: party === 'all' ? undefined : party,
            political_candidate_id: pc === 'all' ? undefined : pc,
            q: debouncedQ || undefined,
            limit: PAGE_SIZE,
            offset: page * PAGE_SIZE,
        })
            .then((r) => { if (!cancelled) { setRecords(r.records || []); setTotal(r.total || 0); setError(null); } })
            .catch((e) => { if (!cancelled) setError(e); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [party, pc, debouncedQ, page]);

    // Party chips (with per-party totals) from the stats rows.
    const parties = useMemo(() => {
        const map = new Map();
        for (const s of stats || []) {
            const p = map.get(s.party_id) || { id: s.party_id, name: s.party_name, total: 0 };
            p.total += Number(s.total || 0);
            map.set(s.party_id, p);
        }
        return [...map.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    }, [stats]);

    // Candidate chips inside the selected party.
    const candidates = useMemo(() => (
        (stats || [])
            .filter((s) => party === 'all' || s.party_id === party)
            .filter((s) => Number(s.total) > 0 || String(s.candidate_user_id) === pc)
    ), [stats, party, pc]);

    const totals = useMemo(() => (stats || []).reduce((t, s) => ({
        surveys:  t.surveys + Number(s.total || 0),
        strong:   t.strong + Number(s.strong_support || 0),
        followUp: t.followUp + Number(s.follow_up || 0),
    }), { surveys: 0, strong: 0, followUp: 0 }), [stats]);

    const pickParty = (id) => { setParty(id); setPc('all'); setPage(0); };
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    if (error) return <ErrorState error={error} />;
    if (stats === null || records === null) {
        return (
            <div className="max-w-6xl mx-auto space-y-5">
                <Skeleton className="h-8 w-48" />
                <SkeletonStats count={5} className="grid grid-cols-2 md:grid-cols-5 gap-3" />
                <Skeleton className="h-10 w-full" />
                <SkeletonList rows={8} lines={1} />
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-4">
            <div>
                <h1 className="text-xl font-bold text-gray-900">Survey Data</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                    সব দল ও সব candidate-এর সংগৃহীত জরিপ — platform-wide
                </p>
            </div>

            {/* Platform overview */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Tile label="মোট জরিপ" value={totals.surveys} />
                <Tile label="রাজনৈতিক দল" value={parties.length} tone="text-rose-600" />
                <Tile label="Candidate" value={stats.length} tone="text-purple-600" />
                <Tile label="Strong support" value={totals.strong} tone="text-green-600" />
                <Tile label="Follow-up" value={totals.followUp} tone="text-amber-600" />
            </div>

            {/* Party drill-down */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mb-1">
                <button className={chipCls(party === 'all')} onClick={() => pickParty('all')}>
                    সব দল <span className={`bn ${party === 'all' ? 'text-white/80' : 'text-gray-400'}`}>{toBn(totals.surveys)}</span>
                </button>
                {parties.map((p) => (
                    <button key={p.id} className={chipCls(party === p.id)} onClick={() => pickParty(p.id)}>
                        <i className={`fas fa-flag mr-1.5 ${party === p.id ? 'text-white/80' : 'text-rose-400'}`} />
                        {p.name} <span className={`bn ${party === p.id ? 'text-white/80' : 'text-gray-400'}`}>{toBn(p.total)}</span>
                    </button>
                ))}
            </div>

            {/* Candidate drill-down inside the party */}
            {candidates.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1 -mb-1">
                    <button className={chipCls(pc === 'all')} onClick={() => { setPc('all'); setPage(0); }}>
                        সব candidate
                    </button>
                    {candidates.map((c) => (
                        <button
                            key={c.candidate_user_id}
                            className={chipCls(pc === String(c.candidate_user_id))}
                            onClick={() => { setPc(String(c.candidate_user_id)); setPage(0); }}
                        >
                            {c.candidate_name} <span className={`bn ${pc === String(c.candidate_user_id) ? 'text-white/80' : 'text-gray-400'}`}>{toBn(c.total)}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Search + count */}
            <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-md ">
                    <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
                    <input
                        className="w-full border border-gray-300 rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand"
                        placeholder="ভোটারের নাম / VID / canvasser খুঁজুন…"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                    />
                    {loading && <span className="absolute right-3 top-12  -translate-y-1/2"><Spinner size="sm" /></span>}
                </div>
                <span className="text-sm text-gray-500 bn whitespace-nowrap">মোট {toBn(total)}টি জরিপ</span>
            </div>

            {records.length === 0 ? (
                <EmptyState icon="fa-clipboard-list" label="এই খোঁজ/filter-এ কোনো জরিপ পাওয়া যায়নি।" />
            ) : (
                <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
                            <tr>
                                <th className="px-3 py-2.5 text-left whitespace-nowrap">তারিখ</th>
                                <th className="px-3 py-2.5 text-left">ভোটার</th>
                                <th className="px-3 py-2.5 text-left">আসন</th>
                                {party === 'all' && <th className="px-3 py-2.5 text-left">দল</th>}
                                <th className="px-3 py-2.5 text-left">Candidate</th>
                                <th className="px-3 py-2.5 text-left hidden md:table-cell">Canvasser</th>
                                <th className="px-3 py-2.5 text-left">সমর্থন</th>
                                <th className="px-3 py-2.5 text-left hidden sm:table-cell">Follow-up</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {records.map((r) => (
                                <tr key={r.canvass_id} className="hover:bg-gray-50">
                                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-500 bn">
                                        {r.canvass_date ? new Date(r.canvass_date).toLocaleDateString('bn-BD') : '—'}
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <button
                                            type="button"
                                            className="text-left group"
                                            onClick={() => setHistory({ voter_id: r.voter_id, name: r.voter_name })}
                                            title="সম্পূর্ণ cross-party ভিজিট history দেখুন"
                                        >
                                            <div className="font-medium text-gray-800 group-hover:text-brand group-hover:underline">
                                                {r.voter_name || `Voter #${r.voter_id}`}
                                            </div>
                                            <div className="text-xs text-gray-400">
                                                {r.sos_vid}{r.ward ? <span className="bn"> · ওয়ার্ড {r.ward}</span> : null}
                                            </div>
                                        </button>
                                    </td>
                                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{r.constituency_name}</td>
                                    {party === 'all' && (
                                        <td className="px-3 py-2.5">
                                            {r.party_name
                                                ? <span className="text-[11px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full whitespace-nowrap">{r.party_name}</span>
                                                : <span className="text-gray-300">—</span>}
                                        </td>
                                    )}
                                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-800">
                                        <i className="fas fa-user-tie text-purple-400 mr-1.5 text-xs" />
                                        {r.candidate_name}
                                    </td>
                                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-600 hidden md:table-cell">{r.canvasser_name}</td>
                                    <td className="px-3 py-2.5">
                                        <div className="flex items-center gap-2">
                                            <SupportBadge level={r.support_level} rating={null} />
                                            <Stars rating={r.support_rating} />
                                        </div>
                                    </td>
                                    <td className="px-3 py-2.5 hidden sm:table-cell">
                                        {r.follow_up_needed
                                            ? <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">প্রয়োজন</span>
                                            : <span className="text-gray-300">—</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {pages > 1 && (
                <div className="flex items-center justify-between text-sm">
                    <button
                        className="border border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white"
                        disabled={page === 0}
                        onClick={() => setPage((p) => p - 1)}
                    >
                        <i className="fas fa-chevron-left mr-1" /> আগের
                    </button>
                    <span className="text-gray-500 bn">পৃষ্ঠা {toBn(page + 1)} / {toBn(pages)}</span>
                    <button
                        className="border border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white"
                        disabled={page + 1 >= pages}
                        onClick={() => setPage((p) => p + 1)}
                    >
                        পরের <i className="fas fa-chevron-right ml-1" />
                    </button>
                </div>
            )}

            {history && (
                <VoterHistoryDrawer
                    voterId={history.voter_id}
                    voterName={history.name}
                    onClose={() => setHistory(null)}
                />
            )}
        </div>
    );
}
