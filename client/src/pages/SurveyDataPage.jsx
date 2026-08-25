import { useEffect, useState, useCallback } from 'react';
import * as canvassingApi from '../api/canvassing.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { LoadingState, ErrorState, EmptyState, Spinner } from '../components/LoadingState.jsx';

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
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tone}`}>
            {level || 'Unknown'}{r ? ` · ${toBn(r)}/৫` : ''}
        </span>
    );
}

function StatBox({ label, value, tone }) {
    return (
        <div className="bg-white border border-brand/20 rounded-lg px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</div>
            <div className={`text-2xl font-bold ${tone || 'text-brand'}`}>{toBn(Number(value || 0).toLocaleString('en-US'))}</div>
        </div>
    );
}

// Detail row for the expanded survey response
function Detail({ label, value }) {
    if (value == null || value === '' || value === false) return null;
    return (
        <div className="flex gap-2 text-sm">
            <span className="text-gray-500 min-w-[130px]">{label}:</span>
            <span className="text-gray-800 font-medium">{String(value)}</span>
        </div>
    );
}

export default function SurveyDataPage() {
    const { user, candidate } = useAuth();
    const [stats, setStats]     = useState(null);
    const [records, setRecords] = useState(null);
    const [error, setError]     = useState(null);
    const [q, setQ]             = useState('');
    const [expanded, setExpanded] = useState(null);
    const [loading, setLoading] = useState(false);

    const constituencyId = candidate?.candidate_id;

    const load = useCallback((search) => {
        setLoading(true);
        Promise.all([
            canvassingApi.stats(),
            canvassingApi.voterRecords({ q: search || undefined, limit: 300 }),
        ])
            .then(([s, r]) => {
                setStats(s.stats || null);
                setRecords(r.records || []);
                setError(null);
            })
            .catch(setError)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(''); }, [load, constituencyId]);

    // debounce search
    useEffect(() => {
        const id = setTimeout(() => load(q.trim()), 350);
        return () => clearTimeout(id);
    }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

    if (error) return <ErrorState error={error} onRetry={() => load('')} />;
    if (records === null) return <LoadingState />;

    return (
        <div className="max-w-5xl mx-auto space-y-5">
            <div>
                <h1 className="text-xl font-bold text-gray-900">Survey Data</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                    {candidate?.title || candidate?.constituency} — আপনার সংগৃহীত জরিপের তথ্য
                </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <StatBox label="মোট জরিপ" value={stats?.total_canvasses} />
                <StatBox label="Voter (unique)" value={stats?.unique_voters} tone="text-blue-600" />
                <StatBox label="Strong support" value={stats?.strong_support} tone="text-green-600" />
                <StatBox label="Weak support" value={stats?.weak_support} tone="text-red-600" />
                <StatBox label="Follow-up" value={stats?.follow_up} tone="text-amber-600" />
            </div>

            {/* Search */}
            <div className="relative">
                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
                <input
                    className="w-full border border-gray-300 rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand"
                    placeholder="Voter নাম বা SOS VID দিয়ে খুঁজুন..."
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                />
                {loading && <Spinner size="sm" />}
            </div>

            {/* Records */}
            {records.length === 0 ? (
                <EmptyState icon="fa-clipboard-list" label="এখনো কোনো জরিপের তথ্য নেই।" />
            ) : (
                <div className="space-y-2">
                    {records.map((r) => {
                        const open = expanded === r.canvass_id;
                        return (
                            <div key={r.canvass_id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                                <button
                                    className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50"
                                    onClick={() => setExpanded(open ? null : r.canvass_id)}
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
                                    <span className="text-xs text-gray-400 hidden sm:inline">{fmtDate(r.canvass_date)}</span>
                                    <i className={`fas fa-chevron-${open ? 'up' : 'down'} text-gray-300 text-xs`} />
                                </button>
                                {open && (
                                    <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/60 space-y-1.5">
                                        <Detail label="Support level" value={r.support_level} />
                                        <Detail label="Support rating" value={r.support_rating ? `${toBn(r.support_rating)}/৫` : null} />
                                        <Detail label="Undecided" value={r.is_undecided ? 'হ্যাঁ' : null} />
                                        <Detail label="Issues / concerns" value={r.issues_concerns} />
                                        <Detail label="Household size" value={r.household_size} />
                                        <Detail label="Member count" value={r.voter_member_count} />
                                        <Detail label="Income bracket" value={r.income_bracket} />
                                        <Detail label="Minority" value={r.is_minority ? 'হ্যাঁ' : null} />
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
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
