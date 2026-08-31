import PageHeader from '../../components/PageHeader.jsx';
import { EmptyState } from '../../components/LoadingState.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';

// Donor landing: their own profile. Donors sit outside the campaign chain and
// see no canvassing or survey data (flowApplication.md §9) — this page uses
// only the session. The donations module (record a donation to a volunteer,
// volunteer confirms receipt) arrives with a later phase of
// docs/application-flows/plan.md.
export default function DonorProfilePage() {
    const { user } = useAuth();
    const party = (user?.parties || []).find((p) => p.role === 'donor');

    return (
        <>
            <PageHeader
                title={user?.name || 'Donor'}
                subtitle={party ? `Donor — ${party.name}` : 'Donor profile'}
            />
            <div className="grid grid-cols-2 gap-3 mb-6 max-w-md">
                <div className="card py-3">
                    <div className="text-xs text-gray-500">
                        <i className="fas fa-hand-holding-heart text-brand mr-1" /> মোট অনুদান
                    </div>
                    <div className="text-xl font-bold text-gray-800 mt-1">0</div>
                </div>
                <div className="card py-3">
                    <div className="text-xs text-gray-500">
                        <i className="fas fa-clock text-brand mr-1" /> নিশ্চিতকরণ বাকি
                    </div>
                    <div className="text-xl font-bold text-gray-800 mt-1">0</div>
                </div>
            </div>
            <EmptyState
                icon="fa-hand-holding-heart"
                label="অনুদান ফিচার শীঘ্রই আসছে — এখানে volunteer-কে দেওয়া অনুদান রেকর্ড করবেন, volunteer তা নিশ্চিত করবেন।"
            />
        </>
    );
}
