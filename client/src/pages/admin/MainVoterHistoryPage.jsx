import PageHeader from '../../components/PageHeader.jsx';
import PersuadableTable from '../../components/party/PersuadableTable.jsx';

/**
 * §10/§13 — the Main Admin's CROSS-PARTY voter history. The persuadable list
 * spans every party's campaigns (each row names the parties involved), and
 * clicking a voter opens the full cross-party timeline: which party's
 * candidate they leaned toward on each visit, and how often they changed
 * their mind. Political Admins never see this — their history stays inside
 * their own party.
 */
export default function MainVoterHistoryPage() {
    return (
        <>
            <PageHeader
                title="Voter History (Cross-party)"
                subtitle="সব দলের ভিজিট মিলিয়ে ভোটারের সমর্থনের ইতিহাস — কে কোন দলের candidate-কে সমর্থন করছে, কতবার মত বদলেছে"
            />
            <PersuadableTable />
        </>
    );
}
