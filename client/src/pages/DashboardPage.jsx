import { useAuth } from '../auth/AuthContext.jsx';
import UrbanDashboard from './UrbanDashboard.jsx';
import RuralDashboard from './RuralDashboard.jsx';
import { LoadingState } from '../components/LoadingState.jsx';

/**
 * Routes to the right dashboard based on the active candidate's map_config.kind.
 *   - 'rural'  → villages-shaded map + upazila/union/mauza filters (Panchagarh)
 *   - 'urban'  → wards / voter areas / buildings drill-down (Dhaka-13)
 * Defaults to urban if kind isn't set.
 */
export default function DashboardPage() {
    const { candidate, loading } = useAuth();
    if (loading) return <LoadingState />;

    const kind = candidate?.map_config?.kind || 'urban';
    return kind === 'rural' ? <RuralDashboard /> : <UrbanDashboard />;
}
