import { useEffect, useRef, useState } from 'react';
import * as canvassingApi from '../../api/canvassing.js';
import * as votersApi from '../../api/voters.js';
import * as urbanApi from '../../api/urban.js';
import * as mediaApi from '../../api/media.js';
import { voterSearchTerms } from '../../utils/avroPhonetic.js';
import { Spinner } from '../LoadingState.jsx';

const SUPPORT_LEVELS = [
    { value: 'Strong support',   label: 'দৃঢ় সমর্থন',         color: 'text-green-700' },
    { value: 'Leaning support',  label: 'সমর্থনের প্রবণতা',   color: 'text-green-500' },
    { value: 'Undecided',        label: 'অনিশ্চিত',           color: 'text-yellow-600' },
    { value: 'Leaning opposed',  label: 'বিরোধিতার প্রবণতা', color: 'text-orange-600' },
    { value: 'Strong oppose',    label: 'দৃঢ় বিরোধিতা',       color: 'text-red-700' },
];

const INCOME_BRACKETS = [
    { value: 'Low',               label: 'নিম্ন' },
    { value: 'Lower-Middle',      label: 'নিম্ন-মধ্যম' },
    { value: 'Middle',            label: 'মধ্যম' },
    { value: 'Upper-Middle',      label: 'উচ্চ-মধ্যম' },
    { value: 'High',              label: 'উচ্চ' },
    { value: 'Prefer not to say', label: 'বলতে পছন্দ করি না' },
];

function emptyForm(voterId, building) {
    return {
        voter_id: voterId,
        support_level: 'Undecided',
        support_rating: 3,
        is_undecided: false,
        is_minority: false,
        source: 'Primary',
        income_bracket: '',
        voter_member_count: '',
        contact_phone: '',
        contact_email: '',
        issues_concerns: '',
        household_size: '',
        follow_up_needed: false,
        follow_up_date: '',
        // Pre-fill the building's geolocation so the canvass — and the voter's
        // location next time — attach to this building (#4, #6).
        latitude: building?.latitude ?? '',
        longitude: building?.longitude ?? '',
        location_verified: false,
        floor_number: '',
        flat_number: '',
        building_feature_id: building?.building_id ?? null,
        building_name: building?.building_name ?? '',
        address: '',
    };
}

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
const toBn = (s) => String(s ?? '').replace(/[0-9]/g, (d) => BN_DIGITS[+d]);

export default function CanvassFormModal({ voter, building, onClose, onSubmitted }) {
    const [form, setForm]   = useState(() => emptyForm(voter.voter_id, building));
    const [busy, setBusy]   = useState(false);
    const [error, setError] = useState(null);

    // Prefill from the voter's most recent survey so an already-canvassed voter
    // opens with their saved answers instead of a blank form. dirtyRef guards
    // against the response overwriting anything the canvasser already changed.
    const dirtyRef = useRef(false);
    const [prefilledFrom, setPrefilledFrom] = useState(null);
    useEffect(() => {
        let cancelled = false;
        canvassingApi
            .history(voter.voter_id)
            .then((res) => {
                if (cancelled || dirtyRef.current) return;
                const last = res.history?.[0];
                if (!last) return;
                setForm((f) => ({
                    ...f,
                    support_level:      last.support_level || f.support_level,
                    support_rating:     last.support_rating ?? f.support_rating,
                    is_undecided:       !!last.is_undecided,
                    is_minority:        !!last.is_minority,
                    source:             last.source || f.source,
                    income_bracket:     last.income_bracket || '',
                    voter_member_count: last.voter_member_count ?? '',
                    household_size:     last.household_size ?? '',
                    contact_phone:      last.contact_phone || '',
                    contact_email:      last.contact_email || '',
                    issues_concerns:    last.issues_concerns || '',
                    follow_up_needed:   !!last.follow_up_needed,
                    floor_number:       last.floor_number || '',
                    flat_number:        last.flat_number || '',
                    address:            last.address || '',
                    // The clicked building stays authoritative for the geo link;
                    // prior canvass values only fill the gaps.
                    building_name: f.building_name || last.building_name || '',
                    latitude:  f.latitude  !== '' ? f.latitude  : (last.latitude  ?? ''),
                    longitude: f.longitude !== '' ? f.longitude : (last.longitude ?? ''),
                }));
                setPrefilledFrom(last.canvass_date);
            })
            .catch(() => {}); // no history / request failure → keep the blank form
        return () => { cancelled = true; };
    }, [voter.voter_id]);

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
                    ...voterSearchTerms(q),
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

    // Suggest household members: voters already canvassed at this building are
    // likely the same family — offer them as one-tap additions.
    const [suggested, setSuggested] = useState([]);
    useEffect(() => {
        if (!building?.building_id) { setSuggested([]); return; }
        let cancelled = false;
        urbanApi
            .canvassedVotersForBuilding(building.building_id)
            .then((res) => {
                if (cancelled) return;
                const seen = new Set();
                const rows = [];
                for (const c of res.voters || []) {
                    if (!c.voter_id || seen.has(c.voter_id)) continue;
                    seen.add(c.voter_id);
                    rows.push({ voter_id: c.voter_id, name: c.voter_name, sos_vid: c.sos_vid });
                }
                setSuggested(rows);
            })
            .catch(() => !cancelled && setSuggested([]));
        return () => { cancelled = true; };
    }, [building?.building_id]);

    const familyIds = new Set([voter.voter_id, ...family.map((f) => f.voter_id)]);
    const visibleSuggestions = suggested.filter((s) => !familyIds.has(s.voter_id));

    const update = (k) => (e) => {
        dirtyRef.current = true;
        setForm((f) => ({
            ...f,
            [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
        }));
    };

    const [gpsBusy, setGpsBusy] = useState(false);

    const GPS_ERRORS = {
        1: 'লোকেশন অনুমতি দেওয়া হয়নি — ব্রাউজার সেটিংসে এই সাইটের লোকেশন পারমিশন চালু করুন।',
        2: 'লোকেশন পাওয়া যাচ্ছে না — ডিভাইসের GPS/লোকেশন সার্ভিস চালু আছে কিনা দেখুন।',
        3: 'লোকেশন পেতে সময় শেষ — খোলা জায়গায় গিয়ে আবার চেষ্টা করুন।',
    };

    const applyPosition = (pos) => {
        dirtyRef.current = true;
        setGpsBusy(false);
        setForm((f) => ({
            ...f,
            latitude: pos.coords.latitude.toFixed(6),
            longitude: pos.coords.longitude.toFixed(6),
            location_verified: true,
        }));
    };

    const captureGps = () => {
        if (!navigator.geolocation) {
            setError('এই ব্রাউজারে জিপিএস সমর্থিত নয়');
            return;
        }
        // Browsers block the Geolocation API off HTTPS entirely (see docs/HTTPS.md).
        if (!window.isSecureContext) {
            setError('জিপিএস শুধুমাত্র নিরাপদ (https://) ঠিকানায় কাজ করে — HTTPS দিয়ে সাইটটি খুলুন।');
            return;
        }
        setGpsBusy(true);
        setError(null);
        // Fresh, high-accuracy fix first; if the GPS can't deliver one in time,
        // retry once accepting a coarser / recently cached position.
        navigator.geolocation.getCurrentPosition(
            applyPosition,
            (err) => {
                if (err.code === 1) {
                    setGpsBusy(false);
                    setError(GPS_ERRORS[1]);
                    return;
                }
                navigator.geolocation.getCurrentPosition(
                    applyPosition,
                    (err2) => {
                        setGpsBusy(false);
                        setError(GPS_ERRORS[err2.code] || err2.message);
                    },
                    { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
                );
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    // ── Media: photo attachment + voice note (uploaded after the canvass insert) ──
    const [photoFile, setPhotoFile] = useState(null);
    const [photoUrl, setPhotoUrl]   = useState(null);
    const [audio, setAudio]         = useState(null); // { blob, url, mime, seconds }
    const [recording, setRecording] = useState(false);
    const [recSeconds, setRecSeconds] = useState(0);
    const recorderRef   = useRef(null);
    const streamRef     = useRef(null);
    const chunksRef     = useRef([]);
    const timerRef      = useRef(null);
    const recSecondsRef = useRef(0);
    // Canvass already inserted for all targets — a retry after a failed media
    // upload must not create duplicate canvass rows.
    const savedCanvassIdRef = useRef(null);

    const fmtTime = (s) => toBn(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);

    const pickPhoto = (e) => {
        const file = e.target.files?.[0] || null;
        setPhotoFile(file);
        setPhotoUrl((old) => {
            if (old) URL.revokeObjectURL(old);
            return file ? URL.createObjectURL(file) : null;
        });
    };

    const clearPhoto = () => {
        setPhotoFile(null);
        setPhotoUrl((old) => { if (old) URL.revokeObjectURL(old); return null; });
    };

    const startRecording = async () => {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            setError('এই ব্রাউজারে ভয়েস রেকর্ডিং সমর্থিত নয়');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const mime = ['audio/webm', 'audio/mp4', 'audio/ogg']
                .find((m) => MediaRecorder.isTypeSupported(m));
            const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
            chunksRef.current = [];
            rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
            rec.onstop = () => {
                const type = (rec.mimeType || mime || 'audio/webm').split(';')[0];
                const blob = new Blob(chunksRef.current, { type });
                setAudio((old) => {
                    if (old?.url) URL.revokeObjectURL(old.url);
                    return { blob, url: URL.createObjectURL(blob), mime: type, seconds: recSecondsRef.current };
                });
                stream.getTracks().forEach((t) => t.stop());
                streamRef.current = null;
            };
            rec.start();
            recorderRef.current = rec;
            recSecondsRef.current = 0;
            setRecSeconds(0);
            setRecording(true);
            setError(null);
            timerRef.current = setInterval(() => {
                recSecondsRef.current += 1;
                setRecSeconds(recSecondsRef.current);
            }, 1000);
        } catch {
            setError('মাইক্রোফোন ব্যবহারের অনুমতি পাওয়া যায়নি — ব্রাউজার সেটিংসে অনুমতি দিন।');
        }
    };

    const stopRecording = () => {
        clearInterval(timerRef.current);
        setRecording(false);
        if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop();
        recorderRef.current = null;
    };

    const clearAudio = () =>
        setAudio((old) => { if (old?.url) URL.revokeObjectURL(old.url); return null; });

    useEffect(() => () => {
        // Unmount: stop any live recording and release object URLs / the mic.
        clearInterval(timerRef.current);
        if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
        streamRef.current?.getTracks().forEach((t) => t.stop());
    }, []);

    async function submit(e) {
        e.preventDefault();
        if (recording) {
            setError('ভয়েস রেকর্ডিং চলছে — সংরক্ষণের আগে রেকর্ড বন্ধ করুন।');
            return;
        }
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
            if (!savedCanvassIdRef.current) {
                for (const t of targets) {
                    const res = await canvassingApi.submit({ ...shared, voter_id: t.voter_id });
                    if (t.voter_id === voter.voter_id && res?.canvass?.canvass_id) {
                        savedCanvassIdRef.current = res.canvass.canvass_id;
                    }
                }
            }

            // Media attaches to the main voter's canvass record. Each upload clears
            // its local state on success so a retry never uploads it twice.
            const canvassId = savedCanvassIdRef.current;
            if (canvassId && photoFile) {
                await mediaApi.upload(photoFile, {
                    canvassId, voterId: voter.voter_id, fileType: 'photo',
                });
                clearPhoto();
            }
            if (canvassId && audio?.blob) {
                const ext = { 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg' }[audio.mime] || 'webm';
                const voiceFile = new File([audio.blob], `voice-note.${ext}`, { type: audio.mime });
                await mediaApi.upload(voiceFile, {
                    canvassId, voterId: voter.voter_id, fileType: 'audio',
                    durationSeconds: audio.seconds || null,
                });
                clearAudio();
            }

            // Let the page know what was saved (e.g. a typed building name that the
            // server wrote back to the geo layer).
            onSubmitted({ building_name: (shared.building_name || '').trim() || null });
        } catch (err) {
            setError(
                savedCanvassIdRef.current
                    ? 'জরিপ সংরক্ষিত হয়েছে, কিন্তু ছবি/ভয়েস আপলোড ব্যর্থ হয়েছে — আবার "সংরক্ষণ করুন" চাপুন।'
                    : err.response?.data?.error || err.message
            );
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
                    {prefilledFrom && (
                        <div className="bg-blue-50 border border-blue-200 text-blue-700 text-xs rounded p-2.5 bn">
                            <i className="fas fa-clock-rotate-left mr-1" />
                            এই ভোটার আগে জরিপকৃত — শেষ জরিপের তথ্য (
                            {new Date(prefilledFrom).toLocaleDateString('bn-BD')}
                            ) স্বয়ংক্রিয়ভাবে পূরণ করা হয়েছে। প্রয়োজনে পরিবর্তন করে সংরক্ষণ করুন।
                        </div>
                    )}
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3">
                            <i className="fas fa-exclamation-triangle mr-1" /> {error}
                        </div>
                    )}

                    {/* Source: who gave the answers */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2 bn">উৎস</label>
                        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm bn">
                            {[
                                { value: 'Primary',   label: 'ভোটার নিজে' },
                                { value: 'Secondary', label: 'প্রতিবেশী / আত্মীয় / কর্মী' },
                            ].map((s) => (
                                <label key={s.value} className="flex items-center gap-2">
                                    <input
                                        type="radio" name="source" className="accent-brand"
                                        checked={form.source === s.value}
                                        onChange={() => setForm((f) => ({ ...f, source: s.value }))}
                                    />
                                    {s.label}
                                </label>
                            ))}
                        </div>
                    </div>

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
                                    onClick={() => { dirtyRef.current = true; setForm((f) => ({ ...f, support_level: l.value })); }}
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
                                    onClick={() => { dirtyRef.current = true; setForm((f) => ({ ...f, support_rating: n })); }}
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
                            <input
                                type="tel" className="input-field" placeholder="01712345678"
                                value={form.contact_phone} onChange={update('contact_phone')}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1 bn">পরিবারের সদস্য সংখ্যা</label>
                            <input
                                type="number" min="1" className="input-field bn" placeholder="যেমন, ৫"
                                value={form.household_size} onChange={update('household_size')}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1 bn">আয়ের স্তর</label>
                            <select className="input-field bn" value={form.income_bracket} onChange={update('income_bracket')}>
                                <option value="">নির্বাচন করুন...</option>
                                {INCOME_BRACKETS.map((b) => (
                                    <option key={b.value} value={b.value}>{b.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1 bn">এই ঠিকানায় ভোটার সদস্য সংখ্যা</label>
                            <input
                                type="number" min="0" className="input-field bn" placeholder="যেমন, ৩"
                                value={form.voter_member_count} onChange={update('voter_member_count')}
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
                        {/* One-tap suggestions: voters already canvassed at this building */}
                        {visibleSuggestions.length > 0 && (
                            <div className="mt-2">
                                <p className="text-[11px] text-gray-500 bn mb-1">
                                    <i className="fas fa-house-user mr-1 text-gray-400" />
                                    এই ভবনে আগে জরিপকৃত — যোগ করতে ট্যাপ করুন:
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {visibleSuggestions.map((s) => (
                                        <button
                                            key={s.voter_id}
                                            type="button"
                                            onClick={() => addMember(s)}
                                            className="flex items-center gap-1 bg-white border border-brand/40 text-brand text-xs px-2 py-1 rounded-full bn hover:bg-brand/5"
                                        >
                                            <i className="fas fa-plus text-[10px]" />
                                            {s.name}
                                        </button>
                                    ))}
                                </div>
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
                            <input className="input-field bn" placeholder="ভবনের নাম" value={form.building_name} onChange={update('building_name')} />
                            <input className="input-field" placeholder="তলা" value={form.floor_number} onChange={update('floor_number')} />
                            <input className="input-field" placeholder="ফ্ল্যাট" value={form.flat_number} onChange={update('flat_number')} />
                            <input className="input-field" placeholder="ঠিকানা" value={form.address} onChange={update('address')} />
                        </div>
                        {building?.building_id == null && (
                            <p className="text-[11px] text-gray-500 mt-1.5 bn">
                                <i className="fas fa-wand-magic-sparkles mr-1 text-gray-400" />
                                ভবন নির্বাচন করা হয়নি — GPS ক্যাপচার করলে আপনার অবস্থানের ভবনে স্বয়ংক্রিয়ভাবে যুক্ত হবে।
                            </p>
                        )}
                        {building?.building_id != null && (
                            <p className="text-[11px] text-gray-500 mt-1.5 bn">
                                <i className="fas fa-building mr-1 text-gray-400" />
                                নির্বাচিত ভবন:{' '}
                                {building.building_name || (
                                    <span className="font-mono text-gray-400">#{building.building_id}</span>
                                )}
                                {!building.building_name &&
                                    ' — এই ভবনের কোনো নাম নেই। নাম লিখে দিলে ম্যাপে সংরক্ষিত হবে।'}
                            </p>
                        )}
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
                        <button type="button" className="btn-secondary" onClick={captureGps} disabled={gpsBusy}>
                            {gpsBusy ? <Spinner size="sm" /> : <i className="fas fa-location-crosshairs" />}
                            <span className="bn">{gpsBusy ? ' লোকেশন নেওয়া হচ্ছে...' : ' GPS ক্যাপচার'}</span>
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm pt-1 bn">
                        <label className="flex items-center gap-2">
                            <input type="checkbox" className="accent-brand" checked={form.follow_up_needed} onChange={update('follow_up_needed')} />
                            ফলো-আপ প্রয়োজন
                        </label>
                        <label className="flex items-center gap-2">
                            <input type="checkbox" className="accent-brand" checked={form.is_undecided} onChange={update('is_undecided')} />
                            আওয়ামী লীগ
                        </label>
                        <label className="flex items-center gap-2">
                            <input type="checkbox" className="accent-brand" checked={form.is_minority} onChange={update('is_minority')} />
                            সংখ্যালঘু (Minority)
                        </label>
                    </div>

                    {/* Media: photo attachment + voice note */}
                    <fieldset className="border border-gray-200 rounded-md p-3">
                        <legend className="text-xs font-medium text-gray-600 px-1 bn">
                            মিডিয়া (ছবি ও ভয়েস)
                        </legend>

                        <div className="mt-1">
                            <label className="block text-xs font-medium text-gray-600 mb-1 bn">ফটো আপলোড করুন</label>
                            {photoFile ? (
                                <div className="flex items-center gap-3">
                                    {photoUrl && (
                                        <img
                                            src={photoUrl} alt=""
                                            className="w-14 h-14 rounded-md object-cover border border-gray-200"
                                        />
                                    )}
                                    <span className="text-xs text-gray-600 truncate flex-1">{photoFile.name}</span>
                                    <button
                                        type="button" onClick={clearPhoto}
                                        className="text-red-500 hover:text-red-600 text-sm flex-shrink-0"
                                        title="ছবি বাদ দিন"
                                    >
                                        <i className="fas fa-trash-can" />
                                    </button>
                                </div>
                            ) : (
                                <input
                                    type="file" accept="image/*" capture="environment"
                                    className="input-field" onChange={pickPhoto}
                                />
                            )}
                            <p className="text-[11px] text-gray-400 mt-1 bn">JPG, PNG এবং অন্যান্য ছবির ফরম্যাট সমর্থিত</p>
                        </div>

                        <div className="mt-3">
                            <label className="block text-xs font-medium text-gray-600 mb-1 bn">ভয়েস নোট রেকর্ড করুন</label>
                            <div className="flex flex-wrap items-center gap-3">
                                {!recording ? (
                                    <button type="button" className="btn-primary !py-1.5 !px-3 text-xs" onClick={startRecording}>
                                        <i className="fas fa-microphone" />
                                        <span className="bn">রেকর্ড শুরু করুন</span>
                                    </button>
                                ) : (
                                    <button type="button" className="btn-danger !py-1.5 !px-3 text-xs" onClick={stopRecording}>
                                        <i className="fas fa-stop" />
                                        <span className="bn">রেকর্ড বন্ধ করুন</span>
                                    </button>
                                )}
                                {recording && (
                                    <span className="text-xs text-red-600 font-medium">
                                        <i className="fas fa-circle animate-pulse mr-1 text-[8px] align-middle" />
                                        {fmtTime(recSeconds)}
                                    </span>
                                )}
                                {audio && !recording && (
                                    <>
                                        <audio controls src={audio.url} className="h-8 max-w-[220px]" />
                                        <span className="text-xs text-gray-500">{fmtTime(audio.seconds)}</span>
                                        <button
                                            type="button" onClick={clearAudio}
                                            className="text-red-500 hover:text-red-600 text-sm"
                                            title="রেকর্ডিং বাদ দিন"
                                        >
                                            <i className="fas fa-trash-can" />
                                        </button>
                                    </>
                                )}
                            </div>
                            <p className="text-[11px] text-gray-400 mt-1 bn">
                                ভোটারের কথা বা অন্যান্য গুরুত্বপূর্ণ মন্তব্য রেকর্ড করুন
                            </p>
                        </div>
                    </fieldset>
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
