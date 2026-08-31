import PageHeader from '../../components/PageHeader.jsx';
import { EmptyState } from '../../components/LoadingState.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';

// Political Admin (tenant_admin) landing. Party-level users hold no
// constituency grant, so this page renders purely from the session (no
// candidate-scoped API calls that would 403). The full party-wide dashboard —
// per-constituency stats, campaign comparison, donor ledger — arrives with the
// later phases of docs/application-flows/plan.md.
export default function PartyHomePage() {
    const { user } = useAuth();
    const parties = (user?.parties || []).filter((p) => p.role === 'tenant_admin');
    const party = parties[0] || null;

    return (
        <>
            <PageHeader
                title={party ? party.name : 'Party'}
                subtitle={`${user?.name || ''} — Political Admin`}
            />
            {party ? (
                <div className="max-w-xl space-y-4">
                    <div className="card">
                        <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-full bg-brand/10 text-brand flex items-center justify-center text-xl">
                                <i className="fas fa-flag" />
                            </div>
                            <div>
                                <div className="font-semibold text-gray-800">{party.name}</div>
                                <div className="text-xs text-gray-500">আপনি এই দলের Political Admin</div>
                            </div>
                        </div>
                    </div>
                    <EmptyState
                        icon="fa-chart-line"
                        label="দল-ব্যাপী dashboard (প্রতিটি আসনের অগ্রগতি, ক্যাম্পেইন তুলনা) শীঘ্রই আসছে।"
                    />
                </div>
            ) : (
                <EmptyState icon="fa-flag" label="আপনার অ্যাকাউন্টে এখনো কোনো দল যুক্ত নেই।" />
            )}
        </>
    );
}
