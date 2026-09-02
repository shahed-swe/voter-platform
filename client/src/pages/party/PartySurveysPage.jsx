import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as canvassingApi from '../../api/canvassing.js';
import PageHeader from '../../components/PageHeader.jsx';
import PartySurveyTable from '../../components/party/PartySurveyTable.jsx';
import PersuadableTable from '../../components/party/PersuadableTable.jsx';
import { ErrorState } from '../../components/LoadingState.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { isPartyAdmin } from '../../auth/roleHome.js';

const bn = (n) => Number(n || 0).toLocaleString('bn-BD');

// Political Admin's party-wide survey view: every canvass carried out for HIS
// party's candidates, across all constituencies — filterable per candidate so
// it's always clear whose campaign each survey belongs to. The server joins on
// the candidate grant's party_id, so no other party's data can appear here.
export default function PartySurveysPage() {
    const { user } = useAuth();
    const [params, setParams] = useSearchParams();
    const [candidates, setCandidates] = useState([]); // [{candidate_user_id, candidate_name, total}]
    const selected = params.get('candidate') || '';
    const view = params.get('view') === 'persuadable' ? 'persuadable' : 'surveys';

    useEffect(() => {
        let cancelled = false;
        canvassingApi.partyStats()
            .then((r) => { if (!cancelled) setCandidates(r.stats || []); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, []);

    if (!user?.is_super_admin && !isPartyAdmin(user)) {
        return <ErrorState error={{ message: 'Political Admin only' }} />;
    }

    return (
        <>
            <PageHeader
                title="দলের জরিপসমূহ"
                subtitle="আপনার দলের সব candidate-এর ক্যাম্পেইনে সংগৃহীত জরিপ — সব আসন মিলিয়ে"
            />

            {/* All surveys vs the §10 persuadable-voter analysis */}
            <div className="flex border-b border-gray-200 mb-4 gap-1">
                {[
                    { key: 'surveys',     label: 'জরিপসমূহ',           icon: 'fa-clipboard-list' },
                    { key: 'persuadable', label: 'Persuadable ভোটার', icon: 'fa-arrows-turn-to-dots' },
                ].map((t) => (
                    <button
                        key={t.key}
                        className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                            view === t.key
                                ? 'border-brand text-brand'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                        onClick={() => setParams(t.key === 'surveys' ? {} : { view: t.key }, { replace: true })}
                    >
                        <i className={`fas ${t.icon} mr-1.5`} />{t.label}
                    </button>
                ))}
            </div>

            {view === 'persuadable' ? (
                <PersuadableTable />
            ) : (
            <>
            {/* Which candidate's campaign — the party-wide default shows all */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
                <button
                    className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                        !selected
                            ? 'bg-brand text-white border-brand'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-brand/50'
                    }`}
                    onClick={() => setParams({}, { replace: true })}
                >
                    সব candidate
                </button>
                {candidates.map((c) => (
                    <button
                        key={c.candidate_user_id}
                        className={`text-sm px-3 py-1.5 rounded-full border transition-colors bn ${
                            String(selected) === String(c.candidate_user_id)
                                ? 'bg-brand text-white border-brand'
                                : 'bg-white text-gray-600 border-gray-300 hover:border-brand/50'
                        }`}
                        onClick={() => setParams({ candidate: String(c.candidate_user_id) }, { replace: true })}
                        title={`${c.candidate_name}-এর জরিপ`}
                    >
                        {c.candidate_name}
                        <span className={String(selected) === String(c.candidate_user_id) ? 'text-white/70 ml-1.5' : 'text-gray-400 ml-1.5'}>
                            {bn(c.total)}
                        </span>
                    </button>
                ))}
            </div>

            <PartySurveyTable
                politicalCandidateId={selected ? parseInt(selected, 10) : null}
                showCandidate={!selected}
            />
            </>
            )}
        </>
    );
}
