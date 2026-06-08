import { useAuth } from '../auth/AuthContext.jsx';
import UrbanDashboard from './UrbanDashboard.jsx';
import RuralDashboard from './RuralDashboard.jsx';
import DynamicDashboard from './DynamicDashboard.jsx';
import { LoadingState } from '../components/LoadingState.jsx';

/**
 * Routes to the right dashboard based on the active candidate's config.
 *
 * Priority (highest first):
 *   1. map_config.layers is set → <DynamicDashboard> (new layered map)
 *   2. map_config.kind === 'rural' → <RuralDashboard> (legacy)
 *   3. anything else → <UrbanDashboard> (legacy)
 *
 * This keeps both existing candidates working unchanged while opting any
 * future candidate INTO the new layered system by setting `layers`.
 */
export default function DashboardPage() {
    const { candidate, loading } = useAuth();
    if (loading) return <LoadingState />;

    const mc = candidate?.map_config || {};
    if (Array.isArray(mc.layers) && mc.layers.length > 0) return <DynamicDashboard />;
    return mc.kind === 'rural' ? <RuralDashboard /> : <UrbanDashboard />;
}
