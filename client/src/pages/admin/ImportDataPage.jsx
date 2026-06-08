import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/PageHeader.jsx';
import { Spinner, LoadingState, ErrorState } from '../../components/LoadingState.jsx';
import ColumnMapper from '../../components/onboarding/ColumnMapper.jsx';
import VoterImport from '../../components/onboarding/VoterImport.jsx';
import * as onboardingApi from '../../api/onboarding.js';
import * as analyticsApi from '../../api/analytics.js';
import { useAuth } from '../../auth/AuthContext.jsx';

/**
 * Per-layer data import. For the active candidate, lists every layer from its
 * catalog and lets the operator upload a file → map columns → commit into
 * geo_layers. Shows row counts so you can see progress.
 */
export default function ImportDataPage() {
    const { user, candidate } = useAuth();
    const [layers, setLayers]   = useState(null);
    const [voterCount, setVoterCount] = useState(0);
    const [error, setError]     = useState(null);
    const [active, setActive]   = useState(null); // layer_key currently uploading

    function reload() {
        onboardingApi.getLayers().then(setLayers).catch(setError);
        analyticsApi.overview()
            .then((d) => setVoterCount(Number(d?.overview?.total_voters || 0)))
            .catch(() => setVoterCount(0));
    }
    useEffect(() => { reload(); }, []);

    if (!user?.is_super_admin) return <ErrorState error={{ message: 'Super-admin only' }} />;
    if (error) return <ErrorState error={error} />;
    if (layers === null) return <LoadingState />;

    return (
        <>
            <PageHeader
                title={`Import data — ${candidate?.title || ''}`}
                subtitle="Upload a map file for each layer, map its columns, and commit."
                actions={
                    <Link to="/dashboard" className="btn-primary">
                        <i className="fas fa-check" /> Done — go to dashboard
                    </Link>
                }
            />

            {layers.length === 0 ? (
                <div className="card text-sm text-gray-500">
                    This candidate has no layers defined. <Link className="text-brand underline" to="/admin/candidates/new">Create one with layers first.</Link>
                </div>
            ) : (
                <div className="space-y-3 max-w-3xl">
                    {layers.map((l) => (
                        <LayerImportRow
                            key={l.layer_key}
                            layer={l}
                            layers={layers}
                            expanded={active === l.layer_key}
                            onToggle={() => setActive(active === l.layer_key ? null : l.layer_key)}
                            onImported={reload}
                        />
                    ))}
                </div>
            )}

            {/* Voters — always available, independent of geo layers */}
            <div className="max-w-3xl mt-6">
                <VoterImport voterCount={voterCount} onImported={reload} />
            </div>
        </>
    );
}

function LayerImportRow({ layer, layers, expanded, onToggle, onImported }) {
    const [file, setFile]         = useState(null);
    const [preview, setPreview]   = useState(null);
    const [mapping, setMapping]   = useState({});
    const [uploading, setUploading] = useState(false);
    const [committing, setCommitting] = useState(false);
    const [err, setErr]           = useState(null);
    const [done, setDone]         = useState(null);

    const parentLayer = layers.find((x) => x.layer_key === layer.parent_layer_key);

    async function doUpload(f) {
        setFile(f); setErr(null); setPreview(null); setDone(null);
        setUploading(true);
        try {
            const pv = await onboardingApi.uploadPreview(f);
            setPreview(pv);
            // auto-guess a few common mappings
            const guess = {};
            const cols = pv.columns || [];
            const find = (...cands) => cols.find((c) => cands.some((x) => c.toLowerCase() === x));
            guess.name = find('name', 'village_na', 'polling_ce', 'area') || undefined;
            guess.latitude = find('lat', 'latitude') || undefined;
            guess.longitude = find('lon', 'lng', 'longitude') || undefined;
            guess.total_population = find('total_vote', 'total_population', 'population') || undefined;
            setMapping(guess);
        } catch (e) {
            setErr(e.response?.data?.error || e.message);
        } finally {
            setUploading(false);
        }
    }

    async function doCommit() {
        setCommitting(true); setErr(null);
        try {
            const res = await onboardingApi.commitIngest({
                uploadToken: preview.upload_token,
                originalName: preview.original_name,
                layerKey: layer.layer_key,
                parentLayerKey: layer.parent_layer_key,
                mapping,
            });
            setDone(res.inserted);
            setPreview(null);
            setFile(null);
            onImported();
        } catch (e) {
            setErr(e.response?.data?.error || e.message);
        } finally {
            setCommitting(false);
        }
    }

    return (
        <div className="card p-0 overflow-hidden">
            <button
                type="button"
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50"
                onClick={onToggle}
            >
                <div className="flex items-center gap-3">
                    <i className={`fas fa-chevron-${expanded ? 'down' : 'right'} text-gray-400 text-xs`} />
                    <span className="font-semibold text-gray-800">{layer.display_name}</span>
                    <span className="text-xs text-gray-400 font-mono">{layer.layer_key}</span>
                    {parentLayer && <span className="text-xs text-gray-400">↳ under {parentLayer.display_name}</span>}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded ${layer.row_count > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {layer.row_count > 0 ? `${layer.row_count.toLocaleString()} features` : 'no data'}
                </span>
            </button>

            {expanded && (
                <div className="px-5 pb-5 pt-1 border-t border-gray-100 space-y-4">
                    {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-2">{err}</div>}
                    {done != null && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded p-2">Imported {done.toLocaleString()} features ✓</div>}

                    <div>
                        <label className="input-label">Upload file (GeoJSON, CSV, or zipped Shapefile)</label>
                        <input
                            type="file"
                            accept=".geojson,.json,.csv,.zip"
                            className="block text-sm"
                            onChange={(e) => e.target.files[0] && doUpload(e.target.files[0])}
                        />
                        {uploading && <div className="text-xs text-gray-500 mt-1"><Spinner size="sm" /> Parsing…</div>}
                    </div>

                    {preview && (
                        <>
                            <div className="text-xs text-gray-500">
                                Detected <strong>{preview.format}</strong> · {preview.totalRows.toLocaleString()} rows
                                {preview.hasGeometry ? ' · geometry ✓' : ' · no geometry'}
                            </div>
                            <ColumnMapper
                                columns={preview.columns}
                                sample={preview.sample}
                                value={mapping}
                                onChange={setMapping}
                                hasGeometry={preview.hasGeometry}
                            />
                            <div className="flex justify-end">
                                <button className="btn-primary" onClick={doCommit} disabled={committing}>
                                    {committing ? <Spinner size="sm" /> : <i className="fas fa-database" />}
                                    Import {preview.totalRows.toLocaleString()} into "{layer.display_name}"
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
