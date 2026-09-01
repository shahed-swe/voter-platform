import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as canvassingApi from '../../api/canvassing.js';
import PageHeader from '../../components/PageHeader.jsx';
import PartySurveyTable from '../../components/party/PartySurveyTable.jsx';
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
    );
}
