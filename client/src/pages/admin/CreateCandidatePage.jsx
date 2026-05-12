import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import PageHeader from '../../components/PageHeader.jsx';
import { Spinner, ErrorState } from '../../components/LoadingState.jsx';
import * as candidatesApi from '../../api/candidates.js';
import { useAuth } from '../../auth/AuthContext.jsx';

// Two starter templates — match the configs we use for dhaka13 and panchagar.
// Super-admins can edit the JSON in step 3 if they want to deviate.
const TEMPLATES = {
    urban: {
        label: 'Urban (Ward → Voter Area → Building)',
        filter_config: [
            { key: 'ward', label: 'Ward', type: 'multi-select',
              source: 'wards', value_col: 'ward_id', label_col: 'ward_number' },
            { key: 'voter_area', label: 'Voter Area', type: 'multi-select-search',
              source: 'voter_areas', value_col: 'voter_area_id',
              label_col: 'bangla_voter_area_name', depends_on: 'ward' },
        ],
        map_config: {
            kind: 'urban',
            base_layer: 'wards',
            drill_layers: ['voter_areas', 'buildings'],
        },
    },
    rural: {
        label: 'Rural (Upazila → Union → Mauza → Voter Area → Village)',
        filter_config: [
            { key: 'upazila', label: 'Upazila', label_bn: 'উপজেলা', type: 'checkbox-group',
              source: 'villages', value_col: 'upazila', label_col: 'upazila' },
            { key: 'union', label: 'Union', label_bn: 'ইউনিয়ন', type: 'select',
              source: 'villages', value_col: 'union', label_col: 'union',
              depends_on: 'upazila' },
            { key: 'mauza', label: 'Mauza', label_bn: 'মৌজা', type: 'select',
              source: 'villages', value_col: 'mauza', label_col: 'mauza',
              depends_on: 'union' },
            { key: 'voter_area', label: 'Voter Area', type: 'select',
              source: 'voters', value_col: 'voter_area_name', label_col: 'voter_area_name' },
            { key: 'village', label: 'Village', type: 'select',
              source: 'villages', value_col: 'village_id', label_col: 'village_name',
              depends_on: 'mauza' },
        ],
        map_config: {
            kind: 'rural',
            base_layer: 'villages',
            shade_by: 'total_population',
            legend: { label: 'Voter Density', buckets: [0, 2000, 5000, 10000, 15000] },
        },
    },
};

const slug = (s) =>
    String(s || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export default function CreateCandidatePage() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [step, setStep] = useState(1);
    const [form, setForm] = useState({
        candidate_id: '',
        name: '',
        constituency: '',
        title: '',
        subtitle: '',
        template: 'rural',
        filter_config_json: JSON.stringify(TEMPLATES.rural.filter_config, null, 2),
        map_config_json: JSON.stringify(TEMPLATES.rural.map_config, null, 2),
    });
    const [busy, setBusy]   = useState(false);
    const [error, setError] = useState(null);

    if (!user?.is_super_admin) return <ErrorState error={{ message: 'Super-admin only' }} />;

    function set(k, v) {
        setForm((f) => ({ ...f, [k]: v }));
    }

    // When user picks a template, reset the config JSON to that template's defaults
    function selectTemplate(t) {
        set('template', t);
        set('filter_config_json', JSON.stringify(TEMPLATES[t].filter_config, null, 2));
        set('map_config_json',    JSON.stringify(TEMPLATES[t].map_config, null, 2));
    }

    async function submit() {
        let filter_config, map_config;
        try {
            filter_config = JSON.parse(form.filter_config_json);
            if (!Array.isArray(filter_config)) throw new Error('filter_config must be an array');
        } catch (err) {
            setError(`filter_config: ${err.message}`);
            return;
        }
        try {
            map_config = JSON.parse(form.map_config_json);
            if (!map_config || typeof map_config !== 'object') throw new Error('must be an object');
        } catch (err) {
            setError(`map_config: ${err.message}`);
            return;
        }

        setBusy(true);
        setError(null);
        try {
            await candidatesApi.create({
                candidate_id: form.candidate_id,
                name:         form.name,
                constituency: form.constituency,
                title:        form.title,
                subtitle:     form.subtitle,
                filter_config,
                map_config,
            });
            navigate('/admin/candidates');
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <PageHeader
                title="Create a new candidate"
                subtitle="A candidate is one campaign's entire data + branding + filter hierarchy."
                actions={
                    <Link to="/admin/candidates" className="btn-secondary">
                        <i className="fas fa-arrow-left" /> Cancel
                    </Link>
                }
            />

            {/* Step indicator */}
            <ol className="flex items-center text-sm mb-6 gap-3">
                {['Basics', 'Template', 'Config', 'Review'].map((label, i) => (
                    <li key={label} className="flex items-center gap-2">
                        <span
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                                step >= i + 1 ? 'bg-brand text-white' : 'bg-gray-200 text-gray-600'
                            }`}
                        >
                            {i + 1}
                        </span>
                        <span className={step === i + 1 ? 'font-medium text-gray-800' : 'text-gray-500'}>{label}</span>
                        {i < 3 && <span className="text-gray-300 mx-1">→</span>}
                    </li>
                ))}
            </ol>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-md p-3 mb-4 text-sm whitespace-pre-wrap">
                    <i className="fas fa-exclamation-triangle mr-1" /> {error}
                </div>
            )}

            <div className="card max-w-3xl">
                {/* STEP 1 — basics */}
                {step === 1 && (
                    <>
                        <h3 className="card-title">Basics</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="md:col-span-2">
                                <label className="input-label">Candidate name</label>
                                <input
                                    className="input-field"
                                    placeholder="e.g. Bobby Hajjaj"
                                    value={form.name}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        set('name', v);
                                        if (!form.subtitle) set('subtitle', `Prepared for ${v}`);
                                    }}
                                />
                            </div>
                            <div>
                                <label className="input-label">Constituency</label>
                                <input
                                    className="input-field"
                                    placeholder="e.g. Dhaka-13"
                                    value={form.constituency}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        set('constituency', v);
                                        if (!form.title) set('title', v);
                                        if (!form.candidate_id) set('candidate_id', slug(v));
                                    }}
                                />
                            </div>
                            <div>
                                <label className="input-label">Header title</label>
                                <input
                                    className="input-field"
                                    placeholder="e.g. Dhaka-13"
                                    value={form.title}
                                    onChange={(e) => set('title', e.target.value)}
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="input-label">Subtitle</label>
                                <input
                                    className="input-field"
                                    placeholder="e.g. Prepared for Bobby Hajjaj"
                                    value={form.subtitle}
                                    onChange={(e) => set('subtitle', e.target.value)}
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="input-label">Candidate ID (slug)</label>
                                <input
                                    className="input-field font-mono text-sm"
                                    placeholder="lowercase-with-hyphens"
                                    value={form.candidate_id}
                                    onChange={(e) => set('candidate_id', slug(e.target.value))}
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    This is the immutable internal ID. Forever. Stays in millions of rows.
                                </p>
                            </div>
                        </div>
                    </>
                )}

                {/* STEP 2 — template */}
                {step === 2 && (
                    <>
                        <h3 className="card-title">Pick a template</h3>
                        <p className="text-sm text-gray-600 mb-3">
                            Templates are starter configs. You can tweak the JSON in the next step.
                        </p>
                        <div className="space-y-2">
                            {Object.entries(TEMPLATES).map(([key, t]) => (
                                <label
                                    key={key}
                                    className={`block border rounded-md p-3 cursor-pointer transition-colors ${
                                        form.template === key
                                            ? 'border-brand bg-brand/5'
                                            : 'border-gray-200 hover:border-brand/50'
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="radio"
                                            name="template"
                                            value={key}
                                            checked={form.template === key}
                                            onChange={() => selectTemplate(key)}
                                            className="accent-brand"
                                        />
                                        <span className="font-medium capitalize">{key}</span>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1 ml-6">{t.label}</p>
                                </label>
                            ))}
                        </div>
                    </>
                )}

                {/* STEP 3 — edit raw JSON */}
                {step === 3 && (
                    <>
                        <h3 className="card-title">Config (edit if needed)</h3>
                        <p className="text-xs text-gray-500 mb-2">
                            Both fields must be valid JSON. The keys you reference must come from the source tables
                            (villages / voters / voter_areas / wards / buildings).
                        </p>
                        <label className="input-label">filter_config</label>
                        <textarea
                            className="input-field font-mono text-xs"
                            rows="14"
                            value={form.filter_config_json}
                            onChange={(e) => set('filter_config_json', e.target.value)}
                        />
                        <label className="input-label mt-3">map_config</label>
                        <textarea
                            className="input-field font-mono text-xs"
                            rows="8"
                            value={form.map_config_json}
                            onChange={(e) => set('map_config_json', e.target.value)}
                        />
                    </>
                )}

                {/* STEP 4 — review */}
                {step === 4 && (
                    <>
                        <h3 className="card-title">Review</h3>
                        <dl className="text-sm space-y-1.5">
                            <div className="flex justify-between"><dt className="text-gray-500">Candidate ID</dt><dd className="font-mono">{form.candidate_id}</dd></div>
                            <div className="flex justify-between"><dt className="text-gray-500">Name</dt><dd>{form.name}</dd></div>
                            <div className="flex justify-between"><dt className="text-gray-500">Constituency</dt><dd>{form.constituency}</dd></div>
                            <div className="flex justify-between"><dt className="text-gray-500">Title / subtitle</dt><dd>{form.title} — {form.subtitle}</dd></div>
                            <div className="flex justify-between"><dt className="text-gray-500">Template</dt><dd className="capitalize">{form.template}</dd></div>
                        </dl>
                        <p className="text-xs text-gray-500 mt-4">
                            After creation, this candidate will have no data yet. You'll need to import voters /
                            villages separately. Existing data import path:
                            <code className="ml-1 bg-gray-100 px-1 rounded">npm run import:legacy</code>{' '}
                            with{' '}
                            <code className="bg-gray-100 px-1 rounded">CANDIDATE_ID={form.candidate_id || '<slug>'}</code>.
                        </p>
                    </>
                )}

                <div className="border-t border-gray-200 mt-5 pt-4 flex justify-between">
                    <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setStep((s) => Math.max(1, s - 1))}
                        disabled={step === 1 || busy}
                    >
                        <i className="fas fa-arrow-left" /> Back
                    </button>
                    {step < 4 ? (
                        <button
                            type="button"
                            className="btn-primary"
                            onClick={() => setStep((s) => s + 1)}
                            disabled={
                                (step === 1 && (!form.candidate_id || !form.name || !form.constituency || !form.title)) ||
                                busy
                            }
                        >
                            Next <i className="fas fa-arrow-right" />
                        </button>
                    ) : (
                        <button type="button" className="btn-primary" onClick={submit} disabled={busy}>
                            {busy ? <Spinner size="sm" /> : <i className="fas fa-check" />}
                            Create candidate
                        </button>
                    )}
                </div>
            </div>
        </>
    );
}
