import { useEffect, useState } from 'react';
import * as urbanApi from '../../api/urban.js';
import { LoadingState, ErrorState, EmptyState } from '../LoadingState.jsx';

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
const BN_MONTHS = [
    'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
    'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর',
];

function toBengaliDigits(s) {
    return String(s).replace(/[0-9]/g, (d) => BN_DIGITS[+d]);
}

function fmtBengaliDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return `${toBengaliDigits(d.getDate())} ${BN_MONTHS[d.getMonth()]}, ${toBengaliDigits(d.getFullYear())}`;
}

function StarRating({ value }) {
    const v = Math.round(Number(value) || 0);
    return (
        <span className="text-yellow-500">
            {[1, 2, 3, 4, 5].map((i) => (
                <i key={i} className={`fa-star ${i <= v ? 'fas' : 'far text-gray-300'}`} />
            ))}
        </span>
    );
}

/**
 * "Canvassed Voters - Building" modal shown when a user clicks a building
 * polygon on the map. Matches the legacy UX, in Bengali.
 */
export default function CanvassedVotersModal({ building, onClose }) {
    const [data, setData]       = useState(null);
    const [error, setError]     = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!building) return;
        setLoading(true);
        urbanApi
            .canvassedVotersForBuilding(building.building_id)
            .then((res) => setData(res))
            .catch((err) => setError(err))
            .finally(() => setLoading(false));
    }, [building?.building_id]);

    if (!building) return null;

    const voters = data?.voters || [];
    const count = voters.length;
    const buildingLabel =
        building.building_name ||
        building.name_bn ||
        [building.house, building.street].filter(Boolean).join(', ') ||
        `Building #${building.building_id}`;

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[2000]">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col">
                <div className="flex items-start justify-between px-6 pt-5 pb-3 border-b border-gray-100">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800">
                            Canvassed Voters - Building
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[400px]" title={buildingLabel}>
                            {buildingLabel}
                        </p>
                        <p className="bn text-sm text-gray-600 mt-1">
                            {toBengaliDigits(count)} ভোটার ক্যানভাস করা হয়েছে
                        </p>
                    </div>
                    <button
                        className="rounded-full w-8 h-8 flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        <i className="fas fa-times" />
                    </button>
                </div>

                <div className="overflow-y-auto overflow-x-auto px-4 sm:px-6 py-4">
                    {loading ? (
                        <LoadingState />
                    ) : error ? (
                        <ErrorState error={error} />
                    ) : count === 0 ? (
                        <EmptyState
                            icon="fa-user-slash"
                            label="এই ভবনে কোনো ভোটার ক্যানভাস হয়নি"
                        />
                    ) : (
                        <table className="w-full min-w-[480px] text-sm bn">
                            <thead>
                                <tr className="text-left text-gray-500 border-b border-gray-200">
                                    <th className="py-2 pr-4 whitespace-nowrap">ভোটারের নাম</th>
                                    <th className="py-2 pr-4 whitespace-nowrap">সমর্থন স্তর</th>
                                    <th className="py-2 pr-4 whitespace-nowrap">ক্যানভাসার</th>
                                    <th className="py-2 whitespace-nowrap">তারিখ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {voters.map((v) => (
                                    <tr key={v.canvass_id}>
                                        <td className="py-2.5 pr-4 font-medium text-gray-800">
                                            {v.voter_name}
                                        </td>
                                        <td className="py-2.5 pr-4">
                                            <StarRating value={v.support_rating} />
                                        </td>
                                        <td className="py-2.5 pr-4 text-gray-700">
                                            {v.canvasser_name || '—'}
                                        </td>
                                        <td className="py-2.5 text-gray-600 whitespace-nowrap">
                                            {fmtBengaliDate(v.canvass_date)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
