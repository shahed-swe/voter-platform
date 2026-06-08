import { useState } from 'react';
import { Spinner } from '../LoadingState.jsx';
import * as onboardingApi from '../../api/onboarding.js';

// Voter fields we map to fixed columns (shown on voter cards / used for search).
const VOTER_TARGETS = [
    { key: 'sos_vid',         label: 'Voter ID',        required: true },
    { key: 'name',            label: 'Name',            required: true },
    { key: 'father_husband',  label: 'Father / Husband' },
    { key: 'mother',          label: 'Mother' },
    { key: 'age',             label: 'Age' },
    { key: 'gender',          label: 'Gender' },
    { key: 'occupation',      label: 'Occupation' },
    { key: 'birthdate',       label: 'Birthdate' },
    { key: 'address',         label: 'Address' },
    { key: 'ward',            label: 'Ward' },
    { key: 'voter_area_name', label: 'Voter Area' },
    { key: 'upazila',         label: 'Upazila' },
];

/**
 * Voter onboarding: upload CSV → map display columns → choose which columns
 * become left-panel filters → commit. The filter picker writes
 * candidate.filter_config; every source column stays filterable via attributes.
 */
export default function VoterImport({ voterCount, onImported }) {
    const [preview, setPreview]     = useState(null);
    const [mapping, setMapping]     = useState({});
    const [filterCols, setFilterCols] = useState([]);   // source columns chosen as filters
    const [uploading, setUploading] = useState(false);
    const [committing, setCommitting] = useState(false);
    const [err, setErr]             = useState(null);
    const [done, setDone]           = useState(null);

    async function doUpload(f) {
        setErr(null); setPreview(null); setDone(null);
        setUploading(true);
        try {
            const pv = await onboardingApi.uploadPreview(f);
            setPreview(pv);
            // auto-guess common voter columns by fuzzy header match
            const cols = pv.columns || [];
            const has = (...c) => cols.find((col) => c.some((x) => col.toLowerCase().includes(x)));
            setMapping({
                sos_vid:        has('voter_নং', 'voter_no', 'voter id', 'ভোটার') || undefined,
                name:           has('নাম', 'name') || undefined,
                father_husband: has('পিতা', 'father', 'husband') || undefined,
                mother:         has('মাতা', 'mother') || undefined,
                age:            has('age', 'বয়স') || undefined,
                gender:         has('gender', 'sex', 'লিঙ্গ') || undefined,
                address:        has('ঠিকানা', 'address') || undefined,
                ward:           cols.find((c) => c.toLowerCase() === 'ward') || undefined,
                voter_area_name: cols.find((c) => c.toLowerCase().includes('voter_area') && !c.toLowerCase().includes('number')) || undefined,
                upazila:        cols.find((c) => c.toLowerCase() === 'upazila') || undefined,
            });
            setFilterCols([]);
        } catch (e) {
            setErr(e.response?.data?.error || e.message);
        } finally {
            setUploading(false);
        }
    }

    function toggleFilter(col) {
        setFilterCols((cur) => (cur.includes(col) ? cur.filter((c) => c !== col) : [...cur, col]));
    }

    async function doCommit() {
        setCommitting(true); setErr(null);
        try {
            // Build filter_config from the chosen source columns. Each filter
            // reads distinct values of attributes->>'<col>' (voters_attr source).
            const filters = filterCols.map((col) => ({
                key: col.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
                label: col,
                type: 'select',
                source: 'voters_attr',
                value_col: col,
            }));
            const res = await onboardingApi.commitVoters({
                uploadToken: preview.upload_token,
                originalName: preview.original_name,
                mapping,
                filters,
            });
            setDone(res.inserted);
            setPreview(null);
            onImported?.();
        } catch (e) {
            setErr(e.response?.data?.error || e.message);
        } finally {
            setCommitting(false);
        }
    }

    return (
        <div className="card">
            <div className="flex items-center justify-between mb-1">
                <h3 className="card-title mb-0"><i className="fas fa-users mr-2 text-brand" />Voters</h3>
                <span className={`text-xs px-2 py-0.5 rounded ${voterCount > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {voterCount > 0 ? `${voterCount.toLocaleString()} voters` : 'no data'}
                </span>
            </div>
            <p className="text-xs text-gray-500 mb-3">
                Upload the voter list (CSV). Map the display columns, then tick which columns
                should become left-panel filters.
            </p>

            {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-2 mb-3">{err}</div>}
            {done != null && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded p-2 mb-3">Imported {done.toLocaleString()} voters ✓</div>}

            <input
                type="file"
                accept=".csv,.geojson,.json"
                className="block text-sm mb-3"
                onChange={(e) => e.target.files[0] && doUpload(e.target.files[0])}
            />
            {uploading && <div className="text-xs text-gray-500"><Spinner size="sm" /> Parsing…</div>}

            {preview && (
                <div className="space-y-4">
                    <div className="text-xs text-gray-500">
                        {preview.totalRows.toLocaleString()} rows · {preview.columns.length} columns
                    </div>

                    {/* Display-column mapping */}
                    <div>
                        <h4 className="font-semibold text-sm text-gray-800 mb-2">Display columns</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {VOTER_TARGETS.map((t) => (
                                <label key={t.key} className="flex items-center gap-2 text-sm">
                                    <span className="w-32 flex-shrink-0 text-gray-700">
                                        {t.label}{t.required && <span className="text-red-500"> *</span>}
                                    </span>
                                    <select
                                        className="input-field flex-1"
                                        value={mapping[t.key] || ''}
                                        onChange={(e) => setMapping((m) => ({ ...m, [t.key]: e.target.value || undefined }))}
                                    >
                                        <option value="">—</option>
                                        {preview.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Filter picker */}
                    <div>
                        <h4 className="font-semibold text-sm text-gray-800 mb-2">
                            Left-panel filters <span className="font-normal text-gray-400">(pick columns voters can be filtered by)</span>
                        </h4>
                        <div className="flex flex-wrap gap-2">
                            {preview.columns.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => toggleFilter(c)}
                                    className={`text-xs px-2.5 py-1 rounded-full border bn ${
                                        filterCols.includes(c)
                                            ? 'bg-brand text-white border-brand'
                                            : 'bg-white text-gray-600 border-gray-300 hover:border-brand'
                                    }`}
                                >
                                    {filterCols.includes(c) && <i className="fas fa-check mr-1" />}{c}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <button className="btn-primary" onClick={doCommit} disabled={committing || !mapping.sos_vid || !mapping.name}>
                            {committing ? <Spinner size="sm" /> : <i className="fas fa-database" />}
                            Import {preview.totalRows.toLocaleString()} voters
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
