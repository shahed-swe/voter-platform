import { useCallback, useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import { LoadingState, ErrorState, EmptyState, Spinner } from '../components/LoadingState.jsx';
import MapView, { styles } from '../components/MapView.jsx';
import useApi from '../hooks/useApi.js';
import * as geoApi from '../api/geo.js';
import * as votersApi from '../api/voters.js';
import * as canvassingApi from '../api/canvassing.js';

const SUPPORT_LEVELS = [
    'Strong support', 'Leaning support', 'Undecided', 'Leaning opposed', 'Strong oppose',
];

function emptyForm(voterId) {
    return {
        voter_id: voterId,
        support_level: 'Undecided',
        support_rating: 3,
        is_undecided: false,
        is_minority: false,
        source: 'Primary',
        voter_member_count: '',
        contact_phone: '',
        contact_email: '',
        issues_concerns: '',
        household_size: '',
        income_bracket: '',
        follow_up_needed: false,
        follow_up_date: '',
        latitude: '',
        longitude: '',
        location_verified: false,
        floor_number: '',
        flat_number: '',
        building_name: '',
        address: '',
    };
}

function CanvassModal({ voter, onClose, onDone }) {
    const [form, setForm]   = useState(() => emptyForm(voter.voter_id));
    const [busy, setBusy]   = useState(false);
    const [error, setError] = useState(null);

    const update = (k) => (e) =>
        setForm((f) => ({
            ...f,
            [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
        }));

    const captureGps = () => {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
            (pos) =>
                setForm((f) => ({
                    ...f,
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    location_verified: true,
                })),
            (err) => setError(err.message)
        );
    };

    async function submit(e) {
        e.preventDefault();
        setBusy(true); setError(null);
        try {
            await canvassingApi.submit({
                ...form,
                support_rating: form.support_rating ? Number(form.support_rating) : null,
                voter_member_count: form.voter_member_count ? Number(form.voter_member_count) : null,
                household_size: form.household_size ? Number(form.household_size) : null,
                latitude: form.latitude ? Number(form.latitude) : null,
                longitude: form.longitude ? Number(form.longitude) : null,
            });
            onDone();
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[1000]">
            <form className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onSubmit={submit}>
                <div className="border-b border-gray-200 px-5 py-3 flex justify-between items-center sticky top-0 bg-white">
                    <div>
                        <h3 className="font-semibold">{voter.name}</h3>
                        <p className="text-xs text-gray-500">VID {voter.sos_vid} · {voter.gender || '—'} · age {voter.age || '?'}</p>
                    </div>
                    <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <i className="fas fa-times" />
                    </button>
                </div>

                <div className="p-5 space-y-3">
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-2">{error}</div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="input-label">Support level</label>
                            <select className="input-field" value={form.support_level} onChange={update('support_level')}>
                                {SUPPORT_LEVELS.map((l) => <option key={l}>{l}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="input-label">Rating (1-5)</label>
                            <input type="number" min="1" max="5" className="input-field"
                                value={form.support_rating} onChange={update('support_rating')} />
                        </div>
                        <div>
                            <label className="input-label">Phone</label>
                            <input className="input-field" value={form.contact_phone} onChange={update('contact_phone')} />
                        </div>
                        <div>
                            <label className="input-label">Household size</label>
                            <input type="number" className="input-field" value={form.household_size} onChange={update('household_size')} />
                        </div>
                        <div className="md:col-span-2">
                            <label className="input-label">Issues / concerns</label>
                            <textarea className="input-field" rows="2" value={form.issues_concerns} onChange={update('issues_concerns')} />
                        </div>
                    </div>

                    <fieldset className="border border-gray-200 rounded-md p-3">
                        <legend className="text-xs font-medium text-gray-600 px-1">Address (urban)</legend>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                            <input className="input-field" placeholder="Building" value={form.building_name} onChange={update('building_name')} />
                            <input className="input-field" placeholder="Floor"    value={form.floor_number}  onChange={update('floor_number')} />
                            <input className="input-field" placeholder="Flat"     value={form.flat_number}   onChange={update('flat_number')} />
                            <input className="input-field" placeholder="Address"  value={form.address}       onChange={update('address')} />
                        </div>
                    </fieldset>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                        <div>
                            <label className="input-label">Latitude</label>
                            <input className="input-field" value={form.latitude} onChange={update('latitude')} />
                        </div>
                        <div>
                            <label className="input-label">Longitude</label>
                            <input className="input-field" value={form.longitude} onChange={update('longitude')} />
                        </div>
                        <button type="button" className="btn-secondary" onClick={captureGps}>
                            <i className="fas fa-location-crosshairs" /> Capture GPS
                        </button>
                    </div>

                    <div className="flex gap-4 text-sm pt-1">
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={form.follow_up_needed} onChange={update('follow_up_needed')} /> Follow-up
                        </label>
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={form.is_minority} onChange={update('is_minority')} /> Minority
                        </label>
                    </div>
                </div>

                <div className="border-t border-gray-200 px-5 py-3 sticky bottom-0 bg-white flex justify-end gap-2">
                    <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn-primary" disabled={busy}>
                        {busy ? <Spinner size="sm" /> : <i className="fas fa-check" />}
                        Save record
                    </button>
                </div>
            </form>
        </div>
    );
}

function VoterListPanel({ voterArea, onClose, onPick }) {
    const fetch = useCallback(() => {
        // First try by_voter_area using village_name as the key (matches clean_voter_area)
        if (!voterArea) return Promise.resolve({ voters: [] });
        return votersApi.byVoterArea(voterArea.village_name, { limit: 500 });
    }, [voterArea]);
    const { data, loading, error, refetch } = useApi(fetch, [voterArea?.voter_area_id]);

    return (
        <div className="card h-full overflow-hidden flex flex-col p-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
                <div>
                    <h3 className="font-semibold text-sm">{voterArea?.village_name || 'Voter area'}</h3>
                    <p className="text-xs text-gray-500">
                        {voterArea?.union_name && <>{voterArea.union_name} · </>}
                        {Number(voterArea?.total_population || 0).toLocaleString()} pop · ID {voterArea?.voter_area_id}
                    </p>
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                    <i className="fas fa-times" />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <LoadingState label="Loading voters..." />
                ) : error ? (
                    <ErrorState error={error} onRetry={refetch} />
                ) : !data?.voters?.length ? (
                    <EmptyState icon="fa-users-slash" label="No voters mapped to this area" />
                ) : (
                    <ul className="divide-y divide-gray-100 text-sm">
                        {data.voters.map((v) => (
                            <li
                                key={v.voter_id}
                                className="px-4 py-2 hover:bg-gray-50 cursor-pointer flex justify-between items-center"
                                onClick={() => onPick(v)}
                            >
                                <div>
                                    <div className="font-medium">{v.name}</div>
                                    <div className="text-xs text-gray-500">VID {v.sos_vid} · age {v.age || '?'} · {v.gender || '—'}</div>
                                </div>
                                <span className={v.status === 'Visited' ? 'badge-success' : 'badge-warning'}>
                                    {v.status}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

export default function CanvassingPage() {
    const [selectedArea, setSelectedArea] = useState(null);
    const [buildings, setBuildings] = useState(null);
    const [loadingBuildings, setLoadingBuildings] = useState(false);
    const [activeVoter, setActiveVoter] = useState(null);
    const [flash, setFlash] = useState(null);

    const fetchAreas = useCallback(() => geoApi.voterAreas(), []);
    const { data: areasGeo, loading, error, refetch } = useApi(fetchAreas, []);

    // When a voter area is picked, fetch its buildings.
    useEffect(() => {
        if (!selectedArea?.voter_area_id) {
            setBuildings(null);
            return;
        }
        setLoadingBuildings(true);
        geoApi
            .buildings(selectedArea.voter_area_id)
            .then((data) => setBuildings(data))
            .catch(() => setBuildings({ type: 'FeatureCollection', features: [] }))
            .finally(() => setLoadingBuildings(false));
    }, [selectedArea?.voter_area_id]);

    if (loading) return <LoadingState />;
    if (error) return <ErrorState error={error} onRetry={refetch} />;

    return (
        <>
            <PageHeader
                title="Canvassing map"
                subtitle="Click a voter area to drill in; click a voter to record a canvass"
            />

            {flash && (
                <div className="bg-green-50 border border-green-200 text-green-700 rounded p-3 mb-4">
                    <i className="fas fa-check-circle mr-2" /> {flash}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ minHeight: 600 }}>
                <div className="lg:col-span-2">
                    <div className="card p-0 overflow-hidden">
                        <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="font-semibold text-gray-800">
                                <i className="fas fa-layer-group mr-2 text-brand" />
                                {selectedArea
                                    ? `${selectedArea.village_name} — ${buildings?.features?.length ?? 0} buildings${
                                          loadingBuildings ? ' (loading...)' : ''
                                      }`
                                    : `${areasGeo.features?.length || 0} voter areas`}
                            </h3>
                            {selectedArea && (
                                <button className="btn-secondary text-xs" onClick={() => setSelectedArea(null)}>
                                    <i className="fas fa-arrow-left" /> Back to areas
                                </button>
                            )}
                        </div>
                        <MapView
                            height={600}
                            layers={
                                selectedArea && buildings
                                    ? [
                                          {
                                              id: 'buildings',
                                              data: buildings,
                                              style: styles.building,
                                              tooltip: (f) => `
                                                  <strong>${escapeHtml(f.properties.building_name || f.properties.house || 'Building #' + f.properties.building_id)}</strong><br/>
                                                  ${escapeHtml(f.properties.street || '')}<br/>
                                                  ${f.properties.canvassed ? '<span style="color:#2E7D32">✓ Canvassed</span>' : 'Not canvassed'}
                                              `,
                                          },
                                      ]
                                    : [
                                          {
                                              id: 'areas',
                                              data: areasGeo,
                                              style: styles.voterArea,
                                              tooltip: (f) => `
                                                  <strong>${escapeHtml(f.properties.village_name || 'Area')}</strong><br/>
                                                  ${escapeHtml(f.properties.union_name || '')}<br/>
                                                  ${Number(f.properties.total_population || 0).toLocaleString()} pop ·
                                                  ${f.properties.building_count || 0} buildings
                                              `,
                                              onClick: (f) => setSelectedArea(f.properties),
                                          },
                                      ]
                            }
                        />
                    </div>
                </div>

                <aside className="lg:col-span-1">
                    {selectedArea ? (
                        <VoterListPanel
                            voterArea={selectedArea}
                            onClose={() => setSelectedArea(null)}
                            onPick={(v) => setActiveVoter(v)}
                        />
                    ) : (
                        <div className="card h-full">
                            <h3 className="card-title">How to canvass</h3>
                            <ol className="text-sm text-gray-600 space-y-2 list-decimal pl-5">
                                <li>Click any voter area polygon on the map.</li>
                                <li>Buildings inside that area will load.</li>
                                <li>Select a voter from the list on the right.</li>
                                <li>Fill in the canvass form and save.</li>
                            </ol>
                        </div>
                    )}
                </aside>
            </div>

            {activeVoter && (
                <CanvassModal
                    voter={activeVoter}
                    onClose={() => setActiveVoter(null)}
                    onDone={() => {
                        setFlash(`Canvass record saved for ${activeVoter.name}.`);
                        setActiveVoter(null);
                    }}
                />
            )}
        </>
    );
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}
