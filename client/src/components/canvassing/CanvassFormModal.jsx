import { useEffect, useState } from 'react';
import * as canvassingApi from '../../api/canvassing.js';
import * as votersApi from '../../api/voters.js';
import { Spinner } from '../LoadingState.jsx';

const SUPPORT_LEVELS = [
    { value: 'Strong support',   label: 'দৃঢ় সমর্থন',         color: 'text-green-700' },
    { value: 'Leaning support',  label: 'সমর্থনের প্রবণতা',   color: 'text-green-500' },
    { value: 'Undecided',        label: 'অনিশ্চিত',           color: 'text-yellow-600' },
    { value: 'Leaning opposed',  label: 'বিরোধিতার প্রবণতা', color: 'text-orange-600' },
    { value: 'Strong oppose',    label: 'দৃঢ় বিরোধিতা',       color: 'text-red-700' },
];

function emptyForm(voterId) {
    return {
        voter_id: voterId,
        support_level: 'Undecided',
        support_rating: 3,
        is_minority: false,
        source: 'Primary',
        voter_member_count: '',
        contact_phone: '',
        contact_email: '',
        issues_concerns: '',
        household_size: '',
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

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
const toBn = (s) => String(s ?? '').replace(/[0-9]/g, (d) => BN_DIGITS[+d]);

export default function CanvassFormModal({ voter, onClose, onSubmitted }) {
    const [form, setForm]   = useState(() => emptyForm(voter.voter_id));
    const [busy, setBusy]   = useState(false);
    const [error, setError] = useState(null);

    // #10 — family members: additional voters at the same location that this one
    // canvass should also cover (same household). The main voter is always included.
    const [family, setFamily]   = useState([]);
    const [q, setQ]             = useState('');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        if (q.trim().length < 2) { setResults([]); return; }
        let cancelled = false;
        setSearching(true);
        const id = setTimeout(() => {
            votersApi
                .filtered({
                    scope: voter.ward ? { ward: voter.ward } : {},
                    search: q.trim(),
                    limit: 8,
                })
                .then((d) => {
                    if (cancelled) return;
                    const excluded = new Set([voter.voter_id, ...family.map((f) => f.voter_id)]);
                    setResults((d.voters || []).filter((v) => !excluded.has(v.voter_id)));
                })
                .catch(() => !cancelled && setResults([]))
                .finally(() => !cancelled && setSearching(false));
        }, 350);
        return () => { cancelled = true; clearTimeout(id); };
    }, [q, voter.ward, voter.voter_id, family]);

    const addMember = (v) => { setFamily((f) => [...f, v]); setQ(''); setResults([]); };
    const removeMember = (id) => setFamily((f) => f.filter((v) => v.voter_id !== id));

    const update = (k) => (e) =>
        setForm((f) => ({
            ...f,
            [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
        }));

    const captureGps = () => {
        if (!navigator.geolocation) {
            setError('জিপিএস অনুপলব্ধ');
            return;
        }
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
        setBusy(true);
        setError(null);
        const shared = {
            ...form,
            support_rating: form.support_rating ? Number(form.support_rating) : null,
            voter_member_count: form.voter_member_count ? Number(form.voter_member_count) : null,
            household_size: form.household_size ? Number(form.household_size) : null,
            latitude: form.latitude ? Number(form.latitude) : null,
            longitude: form.longitude ? Number(form.longitude) : null,
        };
        // Submit a canvass for the main voter + each added family member, sharing the
        // same answers/location but each tagged to its own voter. (#10)
        const targets = [voter, ...family];
        try {
            for (const t of targets) {
                await canvassingApi.submit({ ...shared, voter_id: t.voter_id });
            }
            onSubmitted();
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[2000]">
            <form
                className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto"
                onSubmit={submit}
            >
                <div className="bg-brand text-white px-6 py-4 flex justify-between items-start rounded-t-xl">
                    <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-bold bn">{voter.name}</h3>
                        <p className="text-xs opacity-80 mt-0.5 bn">
                            VID: {toBn(voter.sos_vid)} · {voter.gender} · {voter.age ? `${voter.age} বছর` : '—'}
                        </p>
                        {voter.father_husband && (
                            <p className="text-xs opacity-80 bn mt-0.5">পিতা/স্বামী: {voter.father_husband}</p>
                        )}
                        {(voter.ward || voter.voter_area_name) && (
                            <p className="text-xs opacity-75 bn mt-0.5">
                                <i className="fas fa-layer-group mr-1 opacity-70" />
                                {voter.ward && `ওয়ার্ড ${voter.ward}`}
                                {voter.ward && voter.voter_area_name && ' · '}
                                {voter.voter_area_name}
                                {voter.voter_area_code && ` (#${voter.voter_area_code})`}
                            </p>
                        )}
                        {voter.address && (
                            <p className="text-xs opacity-75 bn mt-0.5 break-words">
                                <i className="fas fa-location-dot mr-1 opacity-70" />{voter.address}
                            </p>
                        )}
                    </div>
                    <button type="button" onClick={onClose} className="text-white/80 hover:text-white ml-3 flex-shrink-0">
                        <i className="fas fa-times" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3">
                            <i className="fas fa-exclamation-triangle mr-1" /> {error}
                        </div>
                    )}

                    {/* Support level: button group */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2 bn">
                            সমর্থন স্তর
                        </label>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                            {SUPPORT_LEVELS.map((l) => (
                                <button
                                    key={l.value}
                                    type="button"
                                    onClick={() => setForm((f) => ({ ...f, support_level: l.value }))}
                                    className={`rounded-md border px-2 py-2 text-xs bn transition-colors ${
                                        form.support_level === l.value
                                            ? 'bg-brand text-white border-brand'
                                            : 'bg-white border-gray-200 hover:border-brand ' + l.color
                                    }`}
                                >
                                    {l.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Support rating: stars */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2 bn">
                            রেটিং (১ থেকে ৫)
                        </label>
                        <div className="flex gap-2 text-2xl">
                            {[1, 2, 3, 4, 5].map((n) => (
                                <button
                                    key={n}
                                    type="button"
                                    onClick={() => setForm((f) => ({ ...f, support_rating: n }))}
                                    className={n <= form.support_rating ? 'text-yellow-500' : 'text-gray-300'}
                                >
                                    <i className="fas fa-star" />
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1 bn">যোগাযোগ ফোন</label>
                            <input className="input-field" value={form.contact_phone} onChange={update('contact_phone')} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1 bn">পরিবারের আকার</label>
                            <input
                                type="number" className="input-field"
                                value={form.household_size} onChange={update('household_size')}
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-600 mb-1 bn">সমস্যা / মতামত</label>
                            <textarea
                                rows="2" className="input-field bn"
                                value={form.issues_concerns} onChange={update('issues_concerns')}
                            />
                        </div>
                    </div>

                    {/* #10 — family members at the same location */}
                    <fieldset className="border border-gray-200 rounded-md p-3">
                        <legend className="text-xs font-medium text-gray-600 px-1 bn">
                            পরিবারের সদস্য (একই বাড়ির অন্য ভোটার)
                        </legend>
                        <div className="relative mt-1">
                            <input
                                className="input-field bn w-full"
                                placeholder="নাম বা VID দিয়ে খুঁজে যোগ করুন..."
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                            />
                            {(results.length > 0 || searching) && (
                                <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-52 overflow-y-auto">
                                    {searching && <div className="px-3 py-2 text-xs text-gray-400 bn">খুঁজছি...</div>}
                                    {results.map((v) => (
                                        <button
                                            key={v.voter_id}
                                            type="button"
                                            onClick={() => addMember(v)}
                                            className="w-full text-left px-3 py-2 hover:bg-brand/5 flex items-center gap-2 text-sm bn"
                                        >
                                            <i className="fas fa-user-plus text-brand/60" />
                                            <span className="font-medium truncate">{v.name}</span>
                                            <span className="text-gray-400 text-xs">VID {toBn(v.sos_vid)}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        {family.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                {family.map((v) => (
                                    <span key={v.voter_id} className="flex items-center gap-1 bg-brand/10 text-brand text-xs px-2 py-1 rounded-full bn">
                                        {v.name}
                                        <button type="button" onClick={() => removeMember(v.voter_id)} className="ml-0.5 hover:text-red-500">
                                            <i className="fas fa-times text-[10px]" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                        <p className="text-[11px] text-gray-400 mt-1.5 bn">
                            যোগ করলে এই জরিপ {toBn(family.length + 1)} জন ভোটারের জন্য সংরক্ষিত হবে।
                        </p>
                    </fieldset>

                    <fieldset className="border border-gray-200 rounded-md p-3">
                        <legend className="text-xs font-medium text-gray-600 px-1 bn">
                            ঠিকানা (শহুরে ক্যানভাসিংয়ের জন্য)
                        </legend>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-1">
                            <input className="input-field" placeholder="ভবন" value={form.building_name} onChange={update('building_name')} />
                            <input className="input-field" placeholder="তলা" value={form.floor_number} onChange={update('floor_number')} />
                            <input className="input-field" placeholder="ফ্ল্যাট" value={form.flat_number} onChange={update('flat_number')} />
                            <input className="input-field" placeholder="ঠিকানা" value={form.address} onChange={update('address')} />
                        </div>
                    </fieldset>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Latitude</label>
                            <input className="input-field" value={form.latitude} onChange={update('latitude')} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Longitude</label>
                            <input className="input-field" value={form.longitude} onChange={update('longitude')} />
                        </div>
                        <button type="button" className="btn-secondary" onClick={captureGps}>
                            <i className="fas fa-location-crosshairs" /> GPS ক্যাপচার
                        </button>
                    </div>

                    <div className="flex gap-6 text-sm pt-1 bn">
                        <label className="flex items-center gap-2">
                            <input type="checkbox" className="accent-brand" checked={form.follow_up_needed} onChange={update('follow_up_needed')} />
                            ফলো-আপ প্রয়োজন
                        </label>
                        <label className="flex items-center gap-2">
                            <input type="checkbox" className="accent-brand" checked={form.is_minority} onChange={update('is_minority')} />
                            সংখ্যালঘু পরিবার
                        </label>
                    </div>
                </div>

                <div className="border-t border-gray-200 px-6 py-3 sticky bottom-0 bg-white flex justify-end gap-2 rounded-b-xl">
                    <button type="button" className="btn-secondary" onClick={onClose}>বাতিল</button>
                    <button type="submit" className="btn-primary" disabled={busy}>
                        {busy ? <Spinner size="sm" /> : <i className="fas fa-check" />}
                        <span className="bn">
                            সংরক্ষণ করুন{family.length > 0 ? ` (${toBn(family.length + 1)} জন)` : ''}
                        </span>
                    </button>
                </div>
            </form>
        </div>
    );
}
