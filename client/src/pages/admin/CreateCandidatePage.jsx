import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import PageHeader from '../../components/PageHeader.jsx';
import { Spinner, ErrorState } from '../../components/LoadingState.jsx';
import LayerDesigner, { LAYER_PRESETS } from '../../components/onboarding/LayerDesigner.jsx';
import * as candidatesApi from '../../api/candidates.js';
import * as onboardingApi from '../../api/onboarding.js';
import { useAuth } from '../../auth/AuthContext.jsx';

const slug = (s) =>
    String(s || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

const PRESET_LABELS = {
    blank:  'Start from scratch',
    urban:  'Urban  (Ward → Voter Area → Building)',
    rural:  'Rural  (Union → Mauza → Village)',
    uttara: 'Sector-based  (Ward → Sector → Building)',
};

export default function CreateCandidatePage() {
    const { user, switchCandidate } = useAuth();
    const navigate = useNavigate();

    const [step, setStep] = useState(1);
    const [form, setForm] = useState({
        candidate_id: '', name: '', constituency: '', title: '', subtitle: '',
    });
    const [layers, setLayers] = useState([]);
    const [busy, setBusy]     = useState(false);
    const [error, setError]   = useState(null);

    if (!user?.is_super_admin) return <ErrorState error={{ message: 'Super-admin only' }} />;

    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    function applyPreset(key) {
        setLayers(key === 'blank' ? [] : JSON.parse(JSON.stringify(LAYER_PRESETS[key] || [])));
    }

    async function finish() {
        setBusy(true); setError(null);
        try {
            // 1. Create the candidate (empty configs; designer fills map_config next)
            await candidatesApi.create({
                candidate_id: form.candidate_id,
                name: form.name,
                constituency: form.constituency,
                title: form.title,
                subtitle: form.subtitle,
                filter_config: [],
                map_config: { layers: [], center: [23.78, 90.34], zoom: 11 },
            });

            // 2. Switch into the new candidate so layer/ingest calls are scoped to it
            await switchCandidate(form.candidate_id);

            // 3. Save the layer catalog (regenerates map_config server-side)
            await onboardingApi.saveLayers(layers);

            // 4. Go to the data-import page for this candidate
            window.location.assign('/admin/import');
        } catch (err) {
            setError(err.response?.data?.error || err.message);
            setBusy(false);
        }
    }

    const canNext1 = form.candidate_id && form.name && form.constituency && form.title;
    const canFinish = layers.length > 0 &&
        layers.every((l) => l.layer_key && l.display_name);

    return (
        <>
            <PageHeader
                title="Create a new candidate"
                subtitle="Define the constituency's geographic hierarchy, then upload its map + voter data."
                actions={<Link to="/admin/candidates" className="btn-secondary"><i className="fas fa-arrow-left" /> Cancel</Link>}
            />

            <ol className="flex items-center text-sm mb-6 gap-3">
                {['Basics', 'Layers', 'Review'].map((label, i) => (
                    <li key={label} className="flex items-center gap-2">
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${step >= i + 1 ? 'bg-brand text-white' : 'bg-gray-200 text-gray-600'}`}>{i + 1}</span>
                        <span className={step === i + 1 ? 'font-medium text-gray-800' : 'text-gray-500'}>{label}</span>
                        {i < 2 && <span className="text-gray-300 mx-1">→</span>}
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
                                <input className="input-field" placeholder="e.g. Bobby Hajjaj" value={form.name}
                                    onChange={(e) => { const v = e.target.value; set('name', v); if (!form.subtitle) set('subtitle', `Prepared for ${v}`); }} />
                            </div>
                            <div>
                                <label className="input-label">Constituency</label>
                                <input className="input-field" placeholder="e.g. Dhaka-18" value={form.constituency}
                                    onChange={(e) => { const v = e.target.value; set('constituency', v); if (!form.title) set('title', v); if (!form.candidate_id) set('candidate_id', slug(v)); }} />
                            </div>
                            <div>
                                <label className="input-label">Header title</label>
                                <input className="input-field" placeholder="e.g. Dhaka-18" value={form.title} onChange={(e) => set('title', e.target.value)} />
                            </div>
                            <div className="md:col-span-2">
                                <label className="input-label">Subtitle</label>
                                <input className="input-field" placeholder="e.g. Prepared for …" value={form.subtitle} onChange={(e) => set('subtitle', e.target.value)} />
                            </div>
                            <div className="md:col-span-2">
                                <label className="input-label">Candidate ID (immutable slug)</label>
                                <input className="input-field font-mono text-sm" value={form.candidate_id} onChange={(e) => set('candidate_id', slug(e.target.value))} />
                            </div>
                        </div>
                    </>
                )}

                {/* STEP 2 — layer designer */}
                {step === 2 && (
                    <>
                        <h3 className="card-title">Geographic layers</h3>
                        <div className="mb-4">
                            <label className="input-label">Start from a preset (optional)</label>
                            <div className="flex flex-wrap gap-2">
                                {Object.entries(PRESET_LABELS).map(([k, lbl]) => (
                                    <button key={k} type="button" className="btn-secondary text-xs" onClick={() => applyPreset(k)}>
                                        {lbl}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <LayerDesigner value={layers} onChange={setLayers} />
                    </>
                )}

                {/* STEP 3 — review */}
                {step === 3 && (
                    <>
                        <h3 className="card-title">Review</h3>
                        <dl className="text-sm space-y-1.5 mb-4">
                            <div className="flex justify-between"><dt className="text-gray-500">Candidate ID</dt><dd className="font-mono">{form.candidate_id}</dd></div>
                            <div className="flex justify-between"><dt className="text-gray-500">Name</dt><dd>{form.name}</dd></div>
                            <div className="flex justify-between"><dt className="text-gray-500">Constituency</dt><dd>{form.constituency}</dd></div>
                            <div className="flex justify-between"><dt className="text-gray-500">Title / subtitle</dt><dd>{form.title} — {form.subtitle}</dd></div>
                        </dl>
                        <div className="border-t border-gray-100 pt-3">
                            <div className="text-sm font-medium text-gray-700 mb-2">Layer hierarchy</div>
                            <ol className="text-sm space-y-1">
                                {layers.map((l, i) => (
                                    <li key={i} className="flex items-center gap-2">
                                        <span className="text-gray-400" style={{ paddingLeft: depthOf(l, layers) * 16 }}>└</span>
                                        <span className="font-medium">{l.display_name}</span>
                                        <span className="text-xs text-gray-400">({l.layer_key}{l.is_leaf ? ', leaf' : ''})</span>
                                    </li>
                                ))}
                            </ol>
                        </div>
                        <p className="text-xs text-gray-500 mt-4">
                            After creating, you'll be taken to the data-import page to upload a map
                            file for each layer.
                        </p>
                    </>
                )}

                <div className="border-t border-gray-200 mt-5 pt-4 flex justify-between">
                    <button type="button" className="btn-secondary" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1 || busy}>
                        <i className="fas fa-arrow-left" /> Back
                    </button>
                    {step < 3 ? (
                        <button type="button" className="btn-primary"
                            onClick={() => setStep((s) => s + 1)}
                            disabled={(step === 1 && !canNext1) || (step === 2 && layers.length === 0) || busy}>
                            Next <i className="fas fa-arrow-right" />
                        </button>
                    ) : (
                        <button type="button" className="btn-primary" onClick={finish} disabled={!canFinish || busy}>
                            {busy ? <Spinner size="sm" /> : <i className="fas fa-check" />} Create & add data
                        </button>
                    )}
                </div>
            </div>
        </>
    );
}

// crude depth for the review indent
function depthOf(layer, layers) {
    let d = 0;
    let cur = layer;
    const byKey = Object.fromEntries(layers.map((l) => [l.layer_key, l]));
    while (cur?.parent_layer_key && byKey[cur.parent_layer_key]) {
        d++; cur = byKey[cur.parent_layer_key];
        if (d > 10) break;
    }
    return d;
}
