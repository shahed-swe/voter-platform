import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/PageHeader.jsx';
import { Spinner, LoadingState, ErrorState } from '../../components/LoadingState.jsx';
import ColumnMapper from '../../components/onboarding/ColumnMapper.jsx';
import VoterImport from '../../components/onboarding/VoterImport.jsx';
import FilterSetup from '../../components/onboarding/FilterSetup.jsx';
import LayerDesigner from '../../components/onboarding/LayerDesigner.jsx';
import * as onboardingApi from '../../api/onboarding.js';
import * as analyticsApi from '../../api/analytics.js';
import * as layersApi from '../../api/layers.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useQueryClient } from '@tanstack/react-query';
import { keys } from '../../api/queryKeys.js';

/**
 * Per-layer data import. For the active candidate, lists every layer from its
 * catalog and lets the operator upload a file → map columns → commit into
 * geo_layers. Shows row counts so you can see progress.
 */
export default function ImportDataPage() {
    const { user, candidate } = useAuth();
    const queryClient = useQueryClient();
    const [layers, setLayers]   = useState(null);
    const [voterCount, setVoterCount] = useState(0);
    const [error, setError]     = useState(null);
    const [active, setActive]   = useState(null); // layer_key currently uploading
    const [editing, setEditing] = useState(false); // editing the layer catalog
    const [draft, setDraft]     = useState([]);
    const [savingLayers, setSavingLayers] = useState(false);

    function reload() {
        onboardingApi.getLayers().then(setLayers).catch(setError);
        analyticsApi.overview()
            .then((d) => setVoterCount(Number(d?.overview?.total_voters || 0)))
            .catch(() => setVoterCount(0));
    }

    // A completed import changes geo layers / option lists that other pages
    // cache as STATIC — drop this candidate's whole cache subtree so they
    // refetch the freshly imported data.
    function afterImport() {
        if (candidate?.candidate_id) {
            queryClient.removeQueries({ queryKey: keys.candidate(candidate.candidate_id) });
        }
        reload();
    }
    useEffect(() => { reload(); }, []);

    function openEditor() {
        // Seed the designer with the existing catalog
        setDraft((layers || []).map((l) => ({
            layer_key: l.layer_key,
            display_name: l.display_name,
            parent_layer_key: l.parent_layer_key,
            geometry_type: l.geometry_type,
            is_leaf: l.is_leaf,
            is_overlay: l.is_overlay,
            click_action: l.click_action,
            color_by: l.color_by,
        })));
        setEditing(true);
    }

    async function saveLayers() {
        setSavingLayers(true); setError(null);
        try {
            await onboardingApi.saveLayers(draft);
            setEditing(false);
            reload();
        } catch (e) {
            setError(e);
        } finally {
            setSavingLayers(false);
        }
    }

    if (!user?.is_super_admin) return <ErrorState error={{ message: 'Super-admin only' }} />;
    if (error) return <ErrorState error={error} />;
    if (layers === null) return <LoadingState full />;

    return (
        <>
            <PageHeader
                title={`Import data — ${candidate?.title || ''}`}
                subtitle="Upload a map file for each layer, map its columns, and commit."
                actions={
                    <div className="flex gap-2">
                        <button className="btn-secondary" onClick={editing ? () => setEditing(false) : openEditor}>
                            <i className="fas fa-layer-group" /> {editing ? 'Cancel' : 'Edit layers'}
                        </button>
                        <Link to="/dashboard" className="btn-primary">
                            <i className="fas fa-check" /> Done
                        </Link>
                    </div>
                }
            />

            {editing && (
                <div className="card max-w-3xl mb-6">
                    <h3 className="card-title">Edit layer hierarchy</h3>
                    <p className="text-xs text-gray-500 mb-3">
                        Add, remove, reorder, or reconfigure layers. Existing imported data is kept
                        for any layer you don't remove. (Removing a layer deletes its features.)
                    </p>
                    <LayerDesigner value={draft} onChange={setDraft} />
                    <div className="flex justify-end gap-2 mt-4">
                        <button className="btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
                        <button className="btn-primary" onClick={saveLayers} disabled={savingLayers}>
                            {savingLayers ? <Spinner size="sm" /> : <i className="fas fa-save" />} Save layers
                        </button>
                    </div>
                </div>
            )}

            {layers.length === 0 ? (
                <div className="card text-sm text-gray-500">
                    This candidate has no layers defined yet. Use <strong>Edit layers</strong> above to add some.
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
                            onImported={afterImport}
                        />
                    ))}
                </div>
            )}

            {/* Voters — always available, independent of geo layers */}
            <div className="max-w-3xl mt-6">
                <VoterImport voterCount={voterCount} onImported={afterImport} />
            </div>

            {/* Filters — pick which voter columns become left-panel filters */}
            <div className="max-w-3xl mt-4">
                <FilterSetup key={voterCount} />
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
    // Parent linking: 'column' = map from a column, 'fixed' = all share one parent,
    // 'spatial' = match each feature to the parent polygon that contains it
    const [parentMode, setParentMode]   = useState('column');
    const [fixedParent, setFixedParent] = useState('');
    const [parentFeatures, setParentFeatures] = useState([]);
    const [spatialResult, setSpatialResult] = useState(null);

    const parentLayer = layers.find((x) => x.layer_key === layer.parent_layer_key);

    // Load the parent layer's features (for the "all belong to one" dropdown)
    useEffect(() => {
        if (!expanded || !parentLayer) return;
        layersApi.fetchSource(`geo:${parentLayer.layer_key}`)
            .then((fc) => setParentFeatures(
                (fc.features || []).map((f) => ({
                    id: String(f.properties.feature_id),
                    name: f.properties.name || f.properties.feature_id,
                }))
            ))
            .catch(() => setParentFeatures([]));
    }, [expanded, parentLayer]);

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
            // For a child layer, try to auto-pick the Parent link column: a
            // column whose name matches the parent layer's key or display name
            // (e.g. a "Ward" column when this layer nests under "ward").
            if (parentLayer) {
                guess.parent_feature_id = find(
                    parentLayer.layer_key,
                    (parentLayer.display_name || '').toLowerCase()
                ) || undefined;
            }
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
                parentFeatureIdFixed: parentMode === 'fixed' ? fixedParent : null,
                parentLinkMode: parentMode === 'spatial' ? 'spatial' : null,
            });
            setDone(res.inserted);
            if (res.spatial) {
                setErr(null);
                setSpatialResult(res.spatial);
            }
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
                            {parentLayer && (
                                <div className="border border-gray-200 rounded-md p-3 bg-gray-50 space-y-2">
                                    <div className="text-sm font-medium text-gray-700">
                                        Link to parent ({parentLayer.display_name})
                                    </div>
                                    <div className="flex flex-wrap gap-4 text-sm">
                                        <label className="flex items-center gap-1.5">
                                            <input type="radio" className="accent-brand" checked={parentMode === 'column'} onChange={() => setParentMode('column')} />
                                            From a column
                                        </label>
                                        <label className="flex items-center gap-1.5">
                                            <input type="radio" className="accent-brand" checked={parentMode === 'fixed'} onChange={() => setParentMode('fixed')} />
                                            All belong to one {parentLayer.display_name}
                                        </label>
                                        <label className="flex items-center gap-1.5" title="Match each feature to the parent polygon that geometrically contains it">
                                            <input type="radio" className="accent-brand" checked={parentMode === 'spatial'} onChange={() => setParentMode('spatial')} />
                                            Link by location (spatial)
                                        </label>
                                    </div>
                                    {parentMode === 'column' && (
                                        <p className="text-xs text-gray-500">
                                            Set <strong>Parent link</strong> in the column map below to the column holding the {parentLayer.display_name} id.
                                            {mapping.parent_feature_id
                                                ? <span className="text-green-700"> ✓ using "{mapping.parent_feature_id}"</span>
                                                : <span className="text-yellow-700"> — not set yet</span>}
                                        </p>
                                    )}
                                    {parentMode === 'fixed' && (
                                        <select
                                            className="input-field"
                                            value={fixedParent}
                                            onChange={(e) => setFixedParent(e.target.value)}
                                        >
                                            <option value="">Select the {parentLayer.display_name} all these belong to…</option>
                                            {parentFeatures.map((p) => (
                                                <option key={p.id} value={p.id}>{p.name} (id {p.id})</option>
                                            ))}
                                        </select>
                                    )}
                                    {parentMode === 'spatial' && (
                                        <p className="text-xs text-gray-600">
                                            <i className="fas fa-location-crosshairs mr-1 text-brand" />
                                            Each feature will be matched to the {parentLayer.display_name} polygon it sits inside.
                                            {parentLayer.row_count > 0
                                                ? <span className="text-green-700"> {parentLayer.display_name} has {parentLayer.row_count.toLocaleString()} features to match against.</span>
                                                : <span className="text-yellow-700"> ⚠ Import {parentLayer.display_name} first — it has no features yet.</span>}
                                        </p>
                                    )}
                                </div>
                            )}
                            {spatialResult && (
                                <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm rounded p-2">
                                    <i className="fas fa-location-crosshairs mr-1" />
                                    Spatially linked <strong>{spatialResult.matched.toLocaleString()}</strong> features
                                    {spatialResult.unmatched > 0 && <> · <span className="text-yellow-700">{spatialResult.unmatched.toLocaleString()} fell outside every {parentLayer.display_name} (left unlinked)</span></>}
                                </div>
                            )}
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
