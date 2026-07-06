const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
const toBn = (s) => String(s ?? '').replace(/[0-9]/g, (d) => BN_DIGITS[+d]);

const STATUS_STYLE = {
    'Not visited':           'bg-orange-100 text-orange-700 border-orange-200',
    'Visited':               'bg-green-100 text-green-700 border-green-200',
    'Follow-up needed':      'bg-yellow-100 text-yellow-800 border-yellow-200',
    'Declined to participate': 'bg-red-100 text-red-700 border-red-200',
};

const GENDER_ICON = {
    Male:   { icon: 'fa-mars',  cls: 'text-blue-500' },
    Female: { icon: 'fa-venus', cls: 'text-pink-500' },
    Other:  { icon: 'fa-genderless', cls: 'text-gray-500' },
};

// Prefer the per-political-candidate canvass status (has_canvass / follow-up from
// the filtered query) over the shared voters.status column, which isn't maintained
// once a constituency has multiple candidates. (#3, #9)
function effectiveStatus(voter) {
    if (voter.has_canvass != null) {
        if (!voter.has_canvass) return 'Not visited';
        return voter.canvass_follow_up ? 'Follow-up needed' : 'Visited';
    }
    return voter.status || 'Not visited';
}

const STATUS_LABEL = {
    'Not visited':      'পরিদর্শিত নয়',
    'Visited':          'পরিদর্শিত',
    'Follow-up needed': 'ফলো-আপ প্রয়োজন',
};

export default function VoterCard({ voter, onClick }) {
    const g = GENDER_ICON[voter.gender] || GENDER_ICON.Other;
    const status = effectiveStatus(voter);
    return (
        <div
            onClick={() => onClick?.(voter)}
            className="bg-white border border-gray-200 rounded-lg p-3 hover:border-brand cursor-pointer transition-colors"
        >
            <div className="flex items-start justify-between gap-2 mb-2">
                <div className="font-semibold text-gray-800 bn truncate" title={voter.name}>
                    {voter.name}
                </div>
                <span
                    className={`bn text-[10px] font-medium px-2 py-0.5 rounded border whitespace-nowrap ${
                        STATUS_STYLE[status] || STATUS_STYLE['Not visited']
                    }`}
                >
                    {STATUS_LABEL[status] || status}
                </span>
            </div>

            <div className="space-y-1 text-xs text-gray-600">
                <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                        <i className="fas fa-cake-candles text-gray-400" /> {voter.age ?? '—'} বছর
                    </span>
                    <span className="flex items-center gap-1">
                        <i className={`fas ${g.icon} ${g.cls}`} /> {voter.gender || '—'}
                    </span>
                </div>
                {voter.father_husband && (
                    <div className="flex items-center gap-1 truncate bn">
                        <i className="fas fa-user text-gray-400 flex-shrink-0" />
                        <span className="truncate">{voter.father_husband}</span>
                    </div>
                )}
                <div className="flex items-center gap-1 truncate">
                    <i className="fas fa-id-card text-gray-400" />
                    <span className="font-mono">ID: {toBn(voter.sos_vid)}</span>
                </div>
                {(voter.ward || voter.voter_area_name) && (
                    <div className="flex items-center gap-1 truncate">
                        <i className="fas fa-layer-group text-brand/60 flex-shrink-0" />
                        <span className="bn truncate text-brand/80">
                            {voter.ward && <span>ওয়ার্ড {voter.ward}</span>}
                            {voter.ward && voter.voter_area_name && <span className="mx-1 opacity-40">·</span>}
                            {voter.voter_area_name && <span>{voter.voter_area_name}</span>}
                            {voter.voter_area_code && <span className="opacity-60 ml-1">(#{toBn(voter.voter_area_code)})</span>}
                        </span>
                    </div>
                )}
                {voter.address && (
                    <div className="flex items-start gap-1">
                        <i className="fas fa-location-dot text-green-600 mt-0.5 flex-shrink-0" />
                        <span className="bn break-words">{voter.address}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
