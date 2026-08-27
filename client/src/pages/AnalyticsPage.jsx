import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Chart as ChartJS, ArcElement, BarElement, CategoryScale,
    LinearScale, PointElement, LineElement, Tooltip, Legend, Title, Filler,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import PageHeader from '../components/PageHeader.jsx';
import MultiSelect from '../components/MultiSelect.jsx';
import {
    SkeletonStats, SkeletonCard, SkeletonTable, ErrorState, EmptyState, Spinner,
} from '../components/LoadingState.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import * as analyticsApi from '../api/analytics.js';
import * as votersApi from '../api/voters.js';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Title, Filler);

// ── constants ───────────────────────────────────────────────────────────────

const INPUT = 'w-full border border-gray-300 rounded-md px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand';
const INCOME_BRACKETS = ['Low', 'Lower-middle', 'Middle', 'Upper-middle', 'High'];
const AGE_ORDER = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
const RECORDS_PAGE_SIZE = 50;

// Support level → display metadata (single source of truth for charts + badges).
const SUPPORT_META = {
    'Strong support':  { bn: 'দৃঢ় সমর্থন',          color: '#2E7D32', badge: 'bg-green-100 text-green-700' },
    'Leaning support': { bn: 'সমর্থনের প্রবণতা',    color: '#8BC34A', badge: 'bg-blue-100 text-blue-700' },
    'Undecided':       { bn: 'অনিশ্চিত',             color: '#FBC02D', badge: 'bg-yellow-100 text-yellow-700' },
    'Leaning opposed': { bn: 'বিরোধিতার প্রবণতা',  color: '#FF9800', badge: 'bg-orange-100 text-orange-700' },
    'Strong oppose':   { bn: 'দৃঢ় বিরোধিতা',        color: '#D32F2F', badge: 'bg-red-100 text-red-700' },
    Unknown:           { bn: 'অজানা',                color: '#9E9E9E', badge: 'bg-gray-100 text-gray-600' },
};
const INCOME_PALETTE = ['#9C27B0', '#7E57C2', '#5C6BC0', '#673AB7', '#1A237E', '#F48FB1'];

const num = (v) => Number(v || 0).toLocaleString();
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-US') : '-');

// Default filter window: last 30 days (dates written into state, not just the DOM).
function defaultFilters() {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);
    const iso = (d) => d.toISOString().slice(0, 10);
    return { startDate: iso(start), endDate: iso(end), voterAreas: [], canvasserIds: [], income: '', source: '' };
}

// filters → API query params (comma-joined arrays, empties skipped).
function toParams(f) {
    const p = {};
    if (f.startDate) p.start_date = f.startDate;
    if (f.endDate) p.end_date = f.endDate;
    if (f.voterAreas.length) p.voter_areas = f.voterAreas.join(',');
    if (f.canvasserIds.length) p.canvasser_ids = f.canvasserIds.join(',');
    if (f.income) p.income_bracket = f.income;
    if (f.source) p.source = f.source;
    return p;
}

// ── small presentational pieces ─────────────────────────────────────────────

function MetricCard({ label, value, sub }) {
    return (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-4 border-l-4 border-l-brand">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</div>
            <div className="text-3xl font-bold text-gray-900 mt-1">{value}</div>
            {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
        </div>
    );
}

function ChartCard({ icon, title, caption, children }) {
    return (
        <div className="card">
            <h3 className="card-title bn flex items-center gap-2 text-base">
                <i className={`fas ${icon} text-brand`} /> {title}
            </h3>
            <div className="relative h-64 sm:h-72">{children}</div>
            {caption && <p className="text-xs text-gray-400 text-center mt-3 bn">{caption}</p>}
        </div>
    );
}

function SupportBadge({ level }) {
    if (!level) {
        return <span className="inline-block text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700">-</span>;
    }
    const meta = SUPPORT_META[level] || SUPPORT_META.Unknown;
    return <span className={`inline-block text-xs px-2 py-0.5 rounded whitespace-nowrap ${meta.badge}`}>{level}</span>;
}

function Pagination({ page, total, pageSize, onPage }) {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const to = Math.min(total, page * pageSize);
    return (
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-t border-gray-100 text-sm">
            <span className="text-gray-500">
                Showing <span className="font-medium text-gray-800">{num(from)}–{num(to)}</span> of{' '}
                <span className="font-medium text-gray-800">{num(total)}</span>
            </span>
            <div className="flex items-center gap-2">
                <button className="btn-secondary text-xs px-3 py-1.5" disabled={page <= 1} onClick={() => onPage(page - 1)}>
                    <i className="fas fa-chevron-left" /> Prev
                </button>
                <span className="text-gray-600 text-xs">Page {num(page)} / {num(pages)}</span>
                <button className="btn-secondary text-xs px-3 py-1.5" disabled={page >= pages} onClick={() => onPage(page + 1)}>
                    Next <i className="fas fa-chevron-right" />
                </button>
            </div>
        </div>
    );
}

// ── page ────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
    const { candidate } = useAuth();
    const [filters, setFilters] = useState(defaultFilters);
    const [tab, setTab] = useState('overview');

    // Filter options
    const [canvassers, setCanvassers] = useState([]);
    const [areaOpts, setAreaOpts] = useState([]);

    // Overview data (one batched load)
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Tab 2 (issues) + Tab 4 (records) — separately fetched/paginated
    const [issues, setIssues] = useState({ records: [], total: 0, loading: true });
    const [records, setRecords] = useState({ rows: [], total: 0, loading: true });
    const [recordsPage, setRecordsPage] = useState(1);
    const [selected, setSelected] = useState(() => new Set());

    const [exporting, setExporting] = useState(false);
    const supportRef = useRef(null);
    const trendRef = useRef(null);

    const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v }));
    const reset = () => setFilters(defaultFilters());

    // ── filter option lists ─────────────────────────────────────────────────
    useEffect(() => {
        analyticsApi.canvassers().then((r) => setCanvassers(r.canvassers || [])).catch(() => {});
        votersApi.geoOptions([]).then((r) => {
            const wards = (r.wards || []).map((w) => w.value);
            if (wards.length) {
                return votersApi.geoOptions(wards).then((rr) =>
                    setAreaOpts((rr.voter_areas || []).map((a) => ({ value: a.value, label: a.value })))
                );
            }
        }).catch(() => {});
    }, [candidate?.candidate_id]);

    // ── batched overview load (debounced 300ms; stale responses discarded) ──
    useEffect(() => {
        let cancelled = false;
        const id = setTimeout(() => {
            setLoading(true);
            const p = toParams(filters);
            Promise.all([
                analyticsApi.overview(p),
                analyticsApi.supportDistribution(p),
                analyticsApi.demographics(p),
                analyticsApi.incomeDistribution(p),
                analyticsApi.dailyTrends({ ...p, days: 30 }),
                analyticsApi.occupations({ ...p, limit: 10 }),
                analyticsApi.canvasserPerformance({ ...p, limit: 100 }),
                analyticsApi.villagePerformance({ ...p, limit: 10 }),
            ])
                .then((res) => { if (!cancelled) { setData(res); setError(null); } })
                .catch((e) => { if (!cancelled) setError(e); })
                .finally(() => { if (!cancelled) setLoading(false); });
        }, 300);
        return () => { cancelled = true; clearTimeout(id); };
    }, [JSON.stringify(filters), candidate?.candidate_id]);

    // ── issues list ─────────────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        const id = setTimeout(() => {
            setIssues((s) => ({ ...s, loading: true }));
            analyticsApi.issuesRecords({ ...toParams(filters), limit: 500 })
                .then((r) => { if (!cancelled) setIssues({ records: r.records || [], total: r.total || 0, loading: false }); })
                .catch(() => { if (!cancelled) setIssues({ records: [], total: 0, loading: false }); });
        }, 300);
        return () => { cancelled = true; clearTimeout(id); };
    }, [JSON.stringify(filters), candidate?.candidate_id]);

    // ── canvassing records (server-side pagination) ─────────────────────────
    useEffect(() => { setRecordsPage(1); setSelected(new Set()); }, [JSON.stringify(filters)]);
    useEffect(() => {
        let cancelled = false;
        const id = setTimeout(() => {
            setRecords((s) => ({ ...s, loading: true }));
            analyticsApi.canvassingRecords({
                ...toParams(filters),
                limit: RECORDS_PAGE_SIZE,
                offset: (recordsPage - 1) * RECORDS_PAGE_SIZE,
            })
                .then((r) => { if (!cancelled) setRecords({ rows: r.records || [], total: r.total || 0, loading: false }); })
                .catch(() => { if (!cancelled) setRecords({ rows: [], total: 0, loading: false }); });
        }, 300);
        return () => { cancelled = true; clearTimeout(id); };
    }, [JSON.stringify(filters), recordsPage, candidate?.candidate_id]);

    // ── derived chart data ──────────────────────────────────────────────────
    const overview = data?.[0]?.overview || {};
    const supportDist = data?.[1]?.support_distribution || [];
    const demographicsRows = data?.[2]?.demographics || [];
    const incomeDist = data?.[3]?.income_distribution || [];
    const trendRows = data?.[4]?.daily_trends || [];
    const occupationRows = data?.[5]?.occupations || [];
    const canvasserPerf = data?.[6]?.canvasser_performance || [];
    const villagePerf = data?.[7]?.village_performance || [];

    const charts = useMemo(() => {
        if (!data) return null;
        const genderTotals = {};
        const ageTotals = {};
        for (const r of demographicsRows) {
            genderTotals[r.gender] = (genderTotals[r.gender] || 0) + Number(r.count);
            ageTotals[r.age_bucket] = (ageTotals[r.age_bucket] || 0) + Number(r.count);
        }
        const genders = Object.keys(genderTotals).filter((g) => g !== 'Unknown');
        if (genderTotals.Unknown) genders.push('Unknown');
        const ages = AGE_ORDER.filter((a) => ageTotals[a] != null);
        if (ageTotals.Unknown) ages.push('Unknown');

        return {
            support: {
                labels: supportDist.map((r) => (SUPPORT_META[r.support_level] || SUPPORT_META.Unknown).bn),
                datasets: [{
                    data: supportDist.map((r) => Number(r.count)),
                    backgroundColor: supportDist.map((r) => (SUPPORT_META[r.support_level] || SUPPORT_META.Unknown).color),
                    borderWidth: 2, borderColor: '#fff',
                }],
            },
            gender: {
                labels: genders,
                datasets: [{ data: genders.map((g) => genderTotals[g]), backgroundColor: '#1565C0', borderRadius: 3, maxBarThickness: 46 }],
            },
            age: {
                labels: ages,
                datasets: [{ data: ages.map((a) => ageTotals[a]), backgroundColor: '#EF6C00', borderRadius: 3, maxBarThickness: 64 }],
            },
            income: {
                labels: incomeDist.map((r) => r.income_bracket),
                datasets: [{
                    data: incomeDist.map((r) => Number(r.count)),
                    backgroundColor: incomeDist.map((_, i) => INCOME_PALETTE[i % INCOME_PALETTE.length]),
                    borderWidth: 2, borderColor: '#fff',
                }],
            },
            trend: {
                labels: trendRows.map((d) => new Date(d.day).toISOString().slice(0, 10)),
                datasets: [
                    {
                        label: 'Canvasses', data: trendRows.map((d) => Number(d.canvasses)),
                        borderColor: '#2E7D32', backgroundColor: 'rgba(46,125,50,0.12)', fill: true, tension: 0.35,
                        pointRadius: 3, yAxisID: 'y',
                    },
                    {
                        label: 'Unique Voters', data: trendRows.map((d) => Number(d.unique_voters)),
                        borderColor: '#1565C0', backgroundColor: 'transparent', fill: false, tension: 0.35,
                        pointRadius: 3, yAxisID: 'y1',
                    },
                ],
            },
            occupation: {
                labels: occupationRows.map((r) => r.occupation),
                datasets: [{ data: occupationRows.map((r) => Number(r.count)), backgroundColor: '#C62828', borderRadius: 3, maxBarThickness: 46 }],
            },
        };
    }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

    const noLegend = { plugins: { legend: { display: false } }, maintainAspectRatio: false };
    const doughnutOpts = { plugins: { legend: { position: 'bottom', labels: { boxWidth: 14 } } }, maintainAspectRatio: false };

    // ── exports (client-side, current filter state) ─────────────────────────
    async function exportCSV() {
        setExporting(true);
        try {
            const r = await analyticsApi.canvassingRecords({ ...toParams(filters), limit: 20000, offset: 0 });
            const rows = r.records || [];
            const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
            let csv = '﻿'; // BOM so Bengali opens correctly in Excel
            csv += `${candidate?.title || 'Survey'} — Canvassed Voter Records\n`;
            csv += `Generated,${new Date().toLocaleString()}\n`;
            csv += `Date Range,${filters.startDate || 'All'} to ${filters.endDate || 'All'}\n`;
            csv += `Total Records,${rows.length}\n\n`;
            csv += ['Voter Name', 'SOS VID', 'Gender', 'Age', 'Voter Area', 'Support Level', 'Rating', 'Income', 'Issues/Concerns', 'Canvasser', 'Date'].join(',') + '\n';
            for (const x of rows) {
                csv += [
                    esc(x.voter_name), esc(x.sos_vid), esc(x.gender), esc(x.age), esc(x.voter_area_name),
                    esc(x.support_level), esc(x.support_rating ? `${x.support_rating}/5` : ''), esc(x.income_bracket),
                    esc(x.issues_concerns), esc(x.canvasser_name), esc(fmtDate(x.canvass_date)),
                ].join(',') + '\n';
            }
            downloadBlob(csv, `survey-records-${Date.now()}.csv`, 'text/csv;charset=utf-8;');
        } catch (e) {
            alert('CSV export failed: ' + (e.message || e));
        } finally { setExporting(false); }
    }

    function exportPDF() {
        setExporting(true);
        try {
            const o = overview;
            const pdf = new jsPDF('portrait', 'mm', 'a4');
            const W = pdf.internal.pageSize.getWidth();
            pdf.setFontSize(16); pdf.setTextColor('#1B5E20');
            pdf.text(`${candidate?.title || 'Survey'} — Analytics Report`, 14, 18);
            pdf.setFontSize(9); pdf.setTextColor('#555');
            pdf.text(`Generated: ${new Date().toLocaleString()}`, 14, 25);
            const fr = [];
            if (filters.startDate || filters.endDate) fr.push(`Date: ${filters.startDate || 'All'} → ${filters.endDate || 'All'}`);
            if (filters.voterAreas.length) fr.push(`Areas: ${filters.voterAreas.length}`);
            if (filters.canvasserIds.length) fr.push(`Canvassers: ${filters.canvasserIds.length}`);
            if (filters.income) fr.push(`Income: ${filters.income}`);
            if (filters.source) fr.push(`Source: ${filters.source}`);
            if (fr.length) pdf.text(fr.join('   '), 14, 31);

            autoTable(pdf, {
                startY: 36,
                head: [['Total Voters', 'Canvassed', 'Follow-up', 'Strong (5)', 'Undecided', 'Canvassers']],
                body: [[num(o.total_voters), num(o.visited_voters), num(o.followup_voters), num(o.strong_support), num(o.undecided), num(o.active_canvassers)]],
                theme: 'grid', headStyles: { fillColor: [46, 125, 50] }, styles: { halign: 'center', fontSize: 9 },
            });

            let y = pdf.lastAutoTable.finalY + 6;
            const supImg = supportRef.current?.toBase64Image?.();
            const trendImg = trendRef.current?.toBase64Image?.();
            if (supImg) { pdf.setFontSize(11); pdf.setTextColor('#333'); pdf.text('Support distribution', 14, y); pdf.addImage(supImg, 'PNG', 14, y + 2, 80, 55); }
            if (trendImg) { pdf.text('Daily trend', 105, y); pdf.addImage(trendImg, 'PNG', 105, y + 2, 90, 55); }
            y += 64;

            autoTable(pdf, {
                startY: y, head: [['Support level', 'Count']],
                body: supportDist.map((r) => [r.support_level, num(r.count)]),
                theme: 'striped', headStyles: { fillColor: [21, 101, 192] }, styles: { fontSize: 9 },
                margin: { right: W / 2 + 2 },
            });
            autoTable(pdf, {
                startY: y, head: [['Top area', 'Voters', 'Visited', '%']],
                body: villagePerf.slice(0, 10).map((v) => [v.village_name, num(v.total_voters), num(v.visited), `${v.completion_pct || 0}%`]),
                theme: 'striped', headStyles: { fillColor: [46, 125, 50] }, styles: { fontSize: 8 },
                margin: { left: W / 2 + 2 },
            });
            autoTable(pdf, {
                startY: pdf.lastAutoTable.finalY + 6,
                head: [['Canvasser', 'Canvasses', 'Unique voters', 'Strong support', 'Follow-ups', 'Active days']],
                body: canvasserPerf.map((c) => [c.name, num(c.canvasses), num(c.unique_voters), num(c.strong_support), num(c.follow_ups), num(c.active_days)]),
                theme: 'grid', headStyles: { fillColor: [40, 53, 147] }, styles: { fontSize: 9 },
            });
            pdf.save(`analytics-report-${Date.now()}.pdf`);
        } catch (e) {
            alert('PDF export failed: ' + (e.message || e));
        } finally { setExporting(false); }
    }

    // ── selection (records tab) ─────────────────────────────────────────────
    const allOnPageSelected = records.rows.length > 0 && records.rows.every((r) => selected.has(r.canvass_id));
    const toggleAll = () => setSelected((s) => {
        const n = new Set(s);
        if (allOnPageSelected) records.rows.forEach((r) => n.delete(r.canvass_id));
        else records.rows.forEach((r) => n.add(r.canvass_id));
        return n;
    });
    const toggleOne = (id) => setSelected((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id); else n.add(id);
        return n;
    });

    // ── tabs ────────────────────────────────────────────────────────────────
    const TAB_DEFS = [
        { key: 'overview',   icon: 'fa-chart-pie',          label: 'সারসংক্ষেপ',            badge: overview.visited_voters },
        { key: 'issues',     icon: 'fa-circle-exclamation', label: 'সমস্যা',                 badge: issues.total },
        { key: 'canvassers', icon: 'fa-users',              label: 'ক্যানভাসার কর্মক্ষমতা', badge: canvasserPerf.length },
        { key: 'records',    icon: 'fa-clipboard',          label: 'ক্যানভাসিং ডেটা',       badge: records.total },
    ];

    return (
        <>
            {/* Header + exports */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <PageHeader title="Analytics" subtitle="ক্যানভাসিং ডেটা এবং অন্তর্দৃষ্টি — filter & export" />
                <div className="flex gap-2">
                    <button onClick={exportPDF} disabled={exporting || !data} className="btn-primary text-sm px-3 py-2">
                        {exporting ? <Spinner size="sm" /> : <i className="fas fa-file-pdf" />} <span className="bn">পিডিএফ রিপোর্ট</span>
                    </button>
                    <button onClick={exportCSV} disabled={exporting} className="btn-primary text-sm px-3 py-2">
                        {exporting ? <Spinner size="sm" /> : <i className="fas fa-file-csv" />} <span className="bn">সিএসভি ডেটা</span>
                    </button>
                </div>
            </div>

            {/* ── Filter card ── */}
            <div className="card mb-5">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-gray-800 bn">
                        <i className="fas fa-filter mr-1.5 text-brand" /> ফিল্টার
                    </h3>
                    <button onClick={reset} className="btn-secondary text-xs px-3 py-1.5">
                        <i className="fas fa-rotate-left" /> <span className="bn">রিসেট</span>
                    </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1 bn">শুরুর তারিখ</label>
                        <input type="date" className={INPUT} value={filters.startDate} onChange={(e) => set('startDate')(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1 bn">শেষ তারিখ</label>
                        <input type="date" className={INPUT} value={filters.endDate} onChange={(e) => set('endDate')(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1 bn">ভোটার এলাকা</label>
                        <MultiSelect options={areaOpts} value={filters.voterAreas} onChange={set('voterAreas')} placeholder="সব এলাকা" bn />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1 bn">ক্যানভাসার</label>
                        <MultiSelect
                            options={canvassers.map((c) => ({ value: String(c.user_id), label: c.name }))}
                            value={filters.canvasserIds}
                            onChange={set('canvasserIds')}
                            placeholder="সব ক্যানভাসার"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1 bn">আয়ের স্তর</label>
                        <select className={`${INPUT} bn`} value={filters.income} onChange={(e) => set('income')(e.target.value)}>
                            <option value="">সকল আয়ের স্তর</option>
                            {INCOME_BRACKETS.map((b) => <option key={b} value={b}>{b}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1 bn">উৎস (Source)</label>
                        <select className={`${INPUT} bn`} value={filters.source} onChange={(e) => set('source')(e.target.value)}>
                            <option value="">সকল উৎস (All Sources)</option>
                            <option value="Primary">Primary</option>
                            <option value="Secondary">Secondary</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* ── Tab bar ── */}
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-5 flex overflow-x-auto">
                {TAB_DEFS.map((t) => {
                    const active = tab === t.key;
                    return (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`flex items-center gap-2 px-4 sm:px-5 py-3 text-sm font-medium whitespace-nowrap border-b-[3px] transition-colors bn ${
                                active ? 'border-brand text-brand' : 'border-transparent text-gray-600 hover:text-brand'
                            }`}
                        >
                            <i className={`fas ${t.icon}`} />
                            {t.label}
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                active ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'
                            }`}>
                                {num(t.badge)}
                            </span>
                        </button>
                    );
                })}
            </div>

            {error ? <ErrorState error={error} onRetry={reset} /> : (
                <>
                    {/* ════ TAB 1 — Overview ════ */}
                    {tab === 'overview' && (
                        loading && !data ? (
                            <>
                                <SkeletonStats count={6} className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5" />
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                    <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
                                    <MetricCard label="Total Voters"       value={num(overview.total_voters)}     sub="In selected filters" />
                                    <MetricCard label="Canvassed"          value={num(overview.visited_voters)}   sub="Unique voters contacted" />
                                    <MetricCard label="Pending Follow-up"  value={num(overview.followup_voters)}  sub="Require follow-up contact" />
                                    <MetricCard label="Strong Support (5★)" value={num(overview.strong_support)}  sub="5-star supporters" />
                                    <MetricCard label="Undecided"          value={num(overview.undecided)}        sub="No decision yet" />
                                    <MetricCard label="Active Canvassers"  value={num(overview.active_canvassers)} sub="Currently active" />
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                    <ChartCard icon="fa-chart-pie" title="সমর্থন বিভাজন" caption="সমর্থন স্তর অনুযায়ী বিভাজন">
                                        {supportDist.length === 0
                                            ? <EmptyState icon="fa-chart-pie" label="কোনো ডেটা নেই" />
                                            : <Doughnut ref={supportRef} data={charts.support} options={doughnutOpts} />}
                                    </ChartCard>
                                    <ChartCard icon="fa-chart-bar" title="জেন্ডার বিতরণ" caption="জেন্ডার অনুযায়ী বিভাজন">
                                        {demographicsRows.length === 0
                                            ? <EmptyState icon="fa-chart-bar" label="কোনো ডেটা নেই" />
                                            : <Bar data={charts.gender} options={{ ...noLegend, indexAxis: 'y' }} />}
                                    </ChartCard>
                                    <ChartCard icon="fa-chart-column" title="বয়স বিতরণ" caption="বয়স পরিসীমা অনুযায়ী বিভাজন">
                                        {demographicsRows.length === 0
                                            ? <EmptyState icon="fa-chart-column" label="কোনো ডেটা নেই" />
                                            : <Bar data={charts.age} options={noLegend} />}
                                    </ChartCard>
                                    <ChartCard icon="fa-chart-pie" title="আয়ের স্তর" caption="আয়ের বন্ধন অনুযায়ী বিতরণ">
                                        {incomeDist.length === 0
                                            ? <EmptyState icon="fa-chart-pie" label="কোনো ডেটা নেই" />
                                            : <Doughnut data={charts.income} options={doughnutOpts} />}
                                    </ChartCard>
                                    <ChartCard icon="fa-chart-line" title="ক্যানভাসিং প্রবণতা" caption="দৈনিক ক্যানভাসিং কার্যকলাপ (গত ৩০ দিন)">
                                        {trendRows.length === 0
                                            ? <EmptyState icon="fa-chart-line" label="কোনো ডেটা নেই" />
                                            : <Line ref={trendRef} data={charts.trend} options={{
                                                maintainAspectRatio: false,
                                                plugins: { legend: { position: 'bottom', labels: { boxWidth: 20 } } },
                                                scales: {
                                                    y:  { position: 'left', beginAtZero: true },
                                                    y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false } },
                                                },
                                            }} />}
                                    </ChartCard>
                                    <ChartCard icon="fa-briefcase" title="শীর্ষ পেশা" caption="ভোটারদের মধ্যে সবচেয়ে সাধারণ পেশা">
                                        {occupationRows.length === 0
                                            ? <EmptyState icon="fa-briefcase" label="পেশার তথ্য নেই (ভোটার ডেটায় পেশা কলাম নেই)" />
                                            : <Bar data={charts.occupation} options={noLegend} />}
                                    </ChartCard>
                                </div>
                            </>
                        )
                    )}

                    {/* ════ TAB 2 — Issues ════ */}
                    {tab === 'issues' && (
                        <div className="card p-0 overflow-hidden">
                            <h3 className="card-title bn px-5 pt-5 flex items-center gap-2 text-base">
                                <i className="fas fa-circle-exclamation text-red-600" /> সমস্যা এবং উদ্বেগ
                            </h3>
                            {issues.loading ? <SkeletonTable rows={8} cols={7} /> : issues.records.length === 0 ? (
                                <EmptyState icon="fa-circle-check" label="কোনো সমস্যা রেকর্ড করা হয়নি।" />
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>Voter Name</th><th>SOS ID</th><th>Voter Area</th>
                                                <th>Issue/Concern</th><th>Canvasser</th><th>Support Level</th><th>Date</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {issues.records.map((r) => (
                                                <tr key={r.canvass_id}>
                                                    <td className="bn">{r.voter_name || '—'}</td>
                                                    <td className="font-mono text-xs">{r.sos_vid || '—'}</td>
                                                    <td className="bn">{r.voter_area_name || 'Unknown'}</td>
                                                    <td className="bn max-w-[280px] truncate" title={r.issues_concerns}>{r.issues_concerns}</td>
                                                    <td>{r.canvasser_name || '—'}</td>
                                                    <td><SupportBadge level={r.support_level} /></td>
                                                    <td className="text-gray-500">{fmtDate(r.canvass_date)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ════ TAB 3 — Canvasser performance ════ */}
                    {tab === 'canvassers' && (
                        <div className="card p-0 overflow-hidden">
                            <h3 className="card-title bn px-5 pt-5 flex items-center gap-2 text-base">
                                <i className="fas fa-users text-brand" /> ক্যানভাসার কর্মক্ষমতা
                            </h3>
                            {loading && !data ? <SkeletonTable rows={8} cols={6} /> : canvasserPerf.length === 0 ? (
                                <EmptyState icon="fa-users-slash" label="কোনো ক্যানভাসিং ডেটা নেই।" />
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>Canvasser Name</th><th>Total Canvasses</th><th>Unique Voters</th>
                                                <th>Strong Support</th><th>Follow-ups</th><th>Active Days</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {canvasserPerf.map((c) => (
                                                <tr key={c.user_id}>
                                                    <td>{c.name}</td>
                                                    <td>{num(c.canvasses)}</td>
                                                    <td>{num(c.unique_voters)}</td>
                                                    <td><span className="inline-block text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">{num(c.strong_support)}</span></td>
                                                    <td>{num(c.follow_ups)}</td>
                                                    <td>{num(c.active_days)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ════ TAB 4 — Canvassing data ════ */}
                    {tab === 'records' && (
                        <div className="card p-0 overflow-hidden">
                            <h3 className="card-title bn px-5 pt-5 flex items-center gap-2 text-base">
                                <i className="fas fa-clipboard text-brand" /> ক্যানভাসিং ডেটা
                            </h3>
                            {records.loading ? <SkeletonTable rows={10} cols={9} /> : records.rows.length === 0 ? (
                                <EmptyState icon="fa-clipboard" label="কোনো ক্যানভাসিং রেকর্ড নেই।" />
                            ) : (
                                <>
                                    <div className="overflow-x-auto">
                                        <table className="data-table">
                                            <thead>
                                                <tr>
                                                    <th><input type="checkbox" className="accent-brand" checked={allOnPageSelected} onChange={toggleAll} /></th>
                                                    <th>Voter Name</th><th>Voter ID</th><th>Gender</th><th>Age</th>
                                                    <th>Support Level</th><th>Income Level</th><th>Issues/Concerns</th>
                                                    <th>Voter Area</th><th>Canvasser</th><th>Images</th><th>Audio Records</th><th>Date</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {records.rows.map((r) => (
                                                    <tr key={r.canvass_id}>
                                                        <td><input type="checkbox" className="accent-brand" checked={selected.has(r.canvass_id)} onChange={() => toggleOne(r.canvass_id)} /></td>
                                                        <td className="bn">{r.voter_name || '—'}</td>
                                                        <td className="font-mono text-xs">{r.sos_vid || r.voter_id}</td>
                                                        <td>{r.gender || '-'}</td>
                                                        <td>{r.age ?? '-'}</td>
                                                        <td><SupportBadge level={r.support_level} /></td>
                                                        <td>{r.income_bracket || '-'}</td>
                                                        <td className="bn max-w-[220px] truncate" title={r.issues_concerns || ''}>{r.issues_concerns || ''}</td>
                                                        <td className="bn">{r.voter_area_name || '-'}</td>
                                                        <td>{r.canvasser_name || '-'}</td>
                                                        <td>{Number(r.photo_count) > 0
                                                            ? <span className="inline-block text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700"><i className="fas fa-image mr-1" />{r.photo_count}</span>
                                                            : '-'}</td>
                                                        <td>{Number(r.audio_count) > 0
                                                            ? <span className="inline-block text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700"><i className="fas fa-microphone mr-1" />{r.audio_count}</span>
                                                            : '-'}</td>
                                                        <td className="text-gray-500">{fmtDate(r.canvass_date)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <Pagination page={recordsPage} total={records.total} pageSize={RECORDS_PAGE_SIZE} onPage={setRecordsPage} />
                                </>
                            )}
                        </div>
                    )}
                </>
            )}
        </>
    );
}

function downloadBlob(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
}
