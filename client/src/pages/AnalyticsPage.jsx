import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Chart as ChartJS, ArcElement, BarElement, CategoryScale,
    LinearScale, PointElement, LineElement, Tooltip, Legend, Title,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import PageHeader from '../components/PageHeader.jsx';
import StatCard from '../components/StatCard.jsx';
import MultiSelect from '../components/MultiSelect.jsx';
import { LoadingState, ErrorState } from '../components/LoadingState.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import * as analyticsApi from '../api/analytics.js';
import * as votersApi from '../api/voters.js';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Title);

const PALETTE = ['#2E7D32', '#1565C0', '#F9A825', '#C62828', '#6A1B9A', '#00838F', '#EF6C00', '#283593'];
const INCOME_BRACKETS = ['Low', 'Lower-middle', 'Middle', 'Upper-middle', 'High'];
const num = (v) => Number(v || 0).toLocaleString();

const INPUT = 'w-full border border-gray-300 rounded-md px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand';

// Build the query params object from the current filters.
function toParams(f) {
    const p = {};
    if (f.startDate) p.start_date = f.startDate;
    if (f.endDate) p.end_date = f.endDate;
    if (f.voterAreas.length) p.voter_areas = f.voterAreas.join(',');
    if (f.canvasserId) p.canvasser_id = f.canvasserId;
    if (f.income) p.income_bracket = f.income;
    if (f.source) p.source = f.source;
    return p;
}

export default function AnalyticsPage() {
    const { candidate } = useAuth();
    const [filters, setFilters] = useState({ startDate: '', endDate: '', voterAreas: [], canvasserId: '', income: '', source: '' });
    const [data, setData]       = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState(null);
    const [canvassers, setCanvassers] = useState([]);
    const [areaOpts, setAreaOpts]     = useState([]);
    const [exporting, setExporting]   = useState(false);
    const supportRef = useRef(null);
    const trendRef   = useRef(null);

    const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v }));

    // Load filter option lists once (canvassers + voter areas).
    useEffect(() => {
        analyticsApi.canvassers().then((r) => setCanvassers(r.canvassers || [])).catch(() => {});
        votersApi.geoOptions([]).then((r) => {
            const wards = (r.wards || []).map((w) => w.value);
            if (wards.length) return votersApi.geoOptions(wards).then((rr) => setAreaOpts((rr.voter_areas || []).map((a) => ({ value: a.value, label: a.value }))));
        }).catch(() => {});
    }, [candidate?.candidate_id]);

    // (Re)load analytics whenever filters change.
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        const p = toParams(filters);
        Promise.all([
            analyticsApi.overview(p),
            analyticsApi.supportDistribution(p),
            analyticsApi.demographics(p),
            analyticsApi.incomeDistribution(p),
            analyticsApi.dailyTrends({ ...p, days: 30 }),
            analyticsApi.villagePerformance({ ...p, limit: 10 }),
            analyticsApi.canvasserPerformance({ ...p, limit: 10 }),
        ])
            .then((res) => { if (!cancelled) { setData(res); setError(null); } })
            .catch((e) => { if (!cancelled) setError(e); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [JSON.stringify(filters), candidate?.candidate_id]);

    const reset = () => setFilters({ startDate: '', endDate: '', voterAreas: [], canvasserId: '', income: '', source: '' });

    // ── CSV export (canvassed voter records with current filters) ──────────────
    async function exportCSV() {
        setExporting(true);
        try {
            const r = await analyticsApi.canvassingRecords({ ...toParams(filters), limit: 20000 });
            const rows = r.records || [];
            const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
            let csv = `${candidate?.title || 'Survey'} — Canvassed Voter Records\n`;
            csv += `Generated,${new Date().toLocaleString()}\n`;
            csv += `Date Range,${filters.startDate || 'All'} to ${filters.endDate || 'All'}\n`;
            csv += `Total Records,${rows.length}\n\n`;
            csv += ['Voter Name', 'SOS VID', 'Gender', 'Age', 'Voter Area', 'Support Level', 'Rating', 'Income', 'Canvasser', 'Date'].join(',') + '\n';
            for (const x of rows) {
                csv += [
                    esc(x.voter_name), esc(x.sos_vid), esc(x.gender), esc(x.age), esc(x.voter_area_name),
                    esc(x.support_level), esc(x.support_rating ? `${x.support_rating}/5` : ''), esc(x.income_bracket),
                    esc(x.canvasser_name), esc(x.canvass_date ? new Date(x.canvass_date).toLocaleDateString() : ''),
                ].join(',') + '\n';
            }
            downloadBlob(csv, `survey-records-${Date.now()}.csv`, 'text/csv;charset=utf-8;');
        } catch (e) {
            alert('CSV export failed: ' + (e.message || e));
        } finally { setExporting(false); }
    }

    // ── PDF report (summary + charts + tables) ─────────────────────────────────
    function exportPDF() {
        setExporting(true);
        try {
            const [ovr, sup, , , , villagePerf, canvasserPerf] = data;
            const o = ovr.overview || {};
            const pdf = new jsPDF('portrait', 'mm', 'a4');
            const W = pdf.internal.pageSize.getWidth();
            pdf.setFontSize(16); pdf.setTextColor('#1B5E20');
            pdf.text(`${candidate?.title || 'Survey'} — Analytics Report`, 14, 18);
            pdf.setFontSize(9); pdf.setTextColor('#555');
            pdf.text(`Generated: ${new Date().toLocaleString()}`, 14, 25);
            const fr = [];
            if (filters.startDate || filters.endDate) fr.push(`Date: ${filters.startDate || 'All'} → ${filters.endDate || 'All'}`);
            if (filters.voterAreas.length) fr.push(`Areas: ${filters.voterAreas.length}`);
            if (filters.income) fr.push(`Income: ${filters.income}`);
            if (filters.source) fr.push(`Source: ${filters.source}`);
            if (fr.length) pdf.text(fr.join('   '), 14, 31);

            // Summary boxes
            autoTable(pdf, {
                startY: 36,
                head: [['Total Voters', 'Visited', 'Total Canvasses', 'Active Canvassers']],
                body: [[num(o.total_voters), num(o.visited_voters), num(o.total_canvasses), num(o.active_canvassers)]],
                theme: 'grid', headStyles: { fillColor: [46, 125, 50] }, styles: { halign: 'center', fontSize: 10 },
            });

            // Chart images
            let y = pdf.lastAutoTable.finalY + 6;
            const supImg = supportRef.current?.toBase64Image?.();
            const trendImg = trendRef.current?.toBase64Image?.();
            if (supImg) { pdf.setFontSize(11); pdf.setTextColor('#333'); pdf.text('Support distribution', 14, y); pdf.addImage(supImg, 'PNG', 14, y + 2, 80, 55); }
            if (trendImg) { pdf.text('Daily trend', 105, y); pdf.addImage(trendImg, 'PNG', 105, y + 2, 90, 55); }
            y += 64;

            // Support table
            autoTable(pdf, {
                startY: y, head: [['Support level', 'Count']],
                body: (sup.support_distribution || []).map((r) => [r.support_level, num(r.count)]),
                theme: 'striped', headStyles: { fillColor: [21, 101, 192] }, styles: { fontSize: 9 },
                margin: { right: W / 2 + 2 },
            });
            autoTable(pdf, {
                startY: y, head: [['Top area', 'Voters', 'Visited', '%']],
                body: (villagePerf.village_performance || []).slice(0, 10).map((v) => [v.village_name, num(v.total_voters), num(v.visited), `${v.completion_pct || 0}%`]),
                theme: 'striped', headStyles: { fillColor: [46, 125, 50] }, styles: { fontSize: 8 },
                margin: { left: W / 2 + 2 },
            });
            autoTable(pdf, {
                startY: pdf.lastAutoTable.finalY + 6,
                head: [['Canvasser', 'Role', 'Canvasses', 'Unique voters', 'Strong support']],
                body: (canvasserPerf.canvasser_performance || []).map((c) => [c.name, c.role, num(c.canvasses), num(c.unique_voters), num(c.strong_support)]),
                theme: 'grid', headStyles: { fillColor: [40, 53, 147] }, styles: { fontSize: 9 },
            });
            pdf.save(`analytics-report-${Date.now()}.pdf`);
        } catch (e) {
            alert('PDF export failed: ' + (e.message || e));
        } finally { setExporting(false); }
    }

    const charts = useMemo(() => {
        if (!data) return null;
        const [, sup, demo, income, daily] = data;
        const buckets = [...new Set((demo.demographics || []).map((d) => d.age_bucket))];
        return {
            support: {
                labels: (sup.support_distribution || []).map((r) => r.support_level),
                datasets: [{ data: (sup.support_distribution || []).map((r) => Number(r.count)), backgroundColor: PALETTE }],
            },
            demo: {
                labels: buckets,
                datasets: ['Male', 'Female', 'Other', 'Unknown'].map((g, i) => ({
                    label: g,
                    data: buckets.map((b) => Number((demo.demographics || []).find((d) => d.age_bucket === b && d.gender === g)?.count || 0)),
                    backgroundColor: PALETTE[i],
                })),
            },
            income: {
                labels: (income.income_distribution || []).map((r) => r.income_bracket),
                datasets: [{ data: (income.income_distribution || []).map((r) => Number(r.count)), backgroundColor: PALETTE }],
            },
            trend: {
                labels: (daily.daily_trends || []).map((d) => new Date(d.day).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })),
                datasets: [{ label: 'Canvasses', data: (daily.daily_trends || []).map((d) => Number(d.canvasses)), borderColor: '#2E7D32', backgroundColor: 'rgba(46,125,50,0.15)', fill: true, tension: 0.3 }],
            },
        };
    }, [data]);

    const overview = data?.[0]?.overview || {};
    const villagePerf = data?.[5]?.village_performance || [];
    const canvasserPerf = data?.[6]?.canvasser_performance || [];

    return (
        <>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <PageHeader title="Analytics" subtitle="Survey progress, support, demographics — filter & export" />
                <div className="flex gap-2">
                    <button onClick={exportCSV} disabled={exporting} className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-3 py-2 rounded-md hover:bg-gray-50 disabled:opacity-50">
                        <i className="fas fa-file-csv text-green-600" /> CSV
                    </button>
                    <button onClick={exportPDF} disabled={exporting || !data} className="inline-flex items-center gap-2 bg-brand text-white text-sm font-medium px-3 py-2 rounded-md hover:bg-brand/90 disabled:opacity-50">
                        <i className="fas fa-file-pdf" /> PDF Report
                    </button>
                </div>
            </div>

            {/* Filter bar */}
            <div className="bg-white border border-gray-200 rounded-lg p-3 mb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                <div><label className="block text-[11px] font-medium text-gray-500 mb-1">শুরুর তারিখ</label>
                    <input type="date" className={INPUT} value={filters.startDate} onChange={(e) => set('startDate')(e.target.value)} /></div>
                <div><label className="block text-[11px] font-medium text-gray-500 mb-1">শেষ তারিখ</label>
                    <input type="date" className={INPUT} value={filters.endDate} onChange={(e) => set('endDate')(e.target.value)} /></div>
                <div><label className="block text-[11px] font-medium text-gray-500 mb-1">ভোটার এলাকা</label>
                    <MultiSelect options={areaOpts} value={filters.voterAreas} onChange={set('voterAreas')} placeholder="সব এলাকা" bn /></div>
                <div><label className="block text-[11px] font-medium text-gray-500 mb-1">ক্যানভাসার</label>
                    <select className={INPUT} value={filters.canvasserId} onChange={(e) => set('canvasserId')(e.target.value)}>
                        <option value="">সব</option>
                        {canvassers.map((c) => <option key={c.user_id} value={c.user_id}>{c.name}</option>)}
                    </select></div>
                <div><label className="block text-[11px] font-medium text-gray-500 mb-1">আয়ের স্তর</label>
                    <select className={INPUT} value={filters.income} onChange={(e) => set('income')(e.target.value)}>
                        <option value="">সব আয়</option>
                        {INCOME_BRACKETS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select></div>
                <div className="flex items-end gap-2">
                    <select className={INPUT} value={filters.source} onChange={(e) => set('source')(e.target.value)}>
                        <option value="">Source: All</option>
                        <option value="Primary">Primary</option>
                        <option value="Secondary">Secondary</option>
                    </select>
                    <button onClick={reset} className="text-xs text-brand hover:underline whitespace-nowrap px-1">Reset</button>
                </div>
            </div>

            {loading && !data ? <LoadingState /> : error ? <ErrorState error={error} /> : (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                        <StatCard label="Total voters"      value={num(overview.total_voters)}     icon="fa-users"           tone="brand"   />
                        <StatCard label="Visited voters"    value={num(overview.visited_voters)}   icon="fa-clipboard-check" tone="accent"  />
                        <StatCard label="Total canvasses"   value={num(overview.total_canvasses)}  icon="fa-comments"        tone="warning" />
                        <StatCard label="Active canvassers" value={num(overview.active_canvassers)}icon="fa-user-check"      tone="gray"    />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
                        <div className="card"><h3 className="card-title">Support distribution</h3>
                            <Doughnut ref={supportRef} data={charts.support} options={{ plugins: { legend: { position: 'bottom' } } }} /></div>
                        <div className="card"><h3 className="card-title">Income distribution</h3>
                            <Doughnut data={charts.income} options={{ plugins: { legend: { position: 'bottom' } } }} /></div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
                        <div className="card"><h3 className="card-title">Demographics (gender × age)</h3>
                            <Bar data={charts.demo} options={{ plugins: { legend: { position: 'bottom' } } }} /></div>
                        <div className="card"><h3 className="card-title">Daily canvassing trend</h3>
                            <Line ref={trendRef} data={charts.trend} /></div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <div className="card overflow-x-auto p-0">
                            <h3 className="card-title px-5 pt-5">Top areas</h3>
                            <table className="data-table">
                                <thead><tr><th>Area</th><th>Voters</th><th>Visited</th><th>%</th></tr></thead>
                                <tbody className="divide-y divide-gray-100">
                                    {villagePerf.map((v) => (
                                        <tr key={v.village_id}><td className="bn">{v.village_name}</td><td>{num(v.total_voters)}</td><td>{num(v.visited)}</td><td>{v.completion_pct || 0}%</td></tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="card overflow-x-auto p-0">
                            <h3 className="card-title px-5 pt-5">Top canvassers</h3>
                            <table className="data-table">
                                <thead><tr><th>Name</th><th>Role</th><th>Canvasses</th><th>Strong</th></tr></thead>
                                <tbody className="divide-y divide-gray-100">
                                    {canvasserPerf.map((c) => (
                                        <tr key={c.user_id}><td>{c.name}</td><td><span className="badge-info">{c.role}</span></td><td>{num(c.canvasses)}</td><td>{num(c.strong_support)}</td></tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
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
