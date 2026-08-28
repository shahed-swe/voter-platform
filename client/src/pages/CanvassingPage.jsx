import { useAuth } from '../auth/AuthContext.jsx';
import UrbanCanvassingPage from './UrbanCanvassingPage.jsx';
import RuralCanvassingPage from './RuralCanvassingPage.jsx';
import DynamicCanvassing from './DynamicCanvassing.jsx';
import { LoadingState } from '../components/LoadingState.jsx';

/**
 * Routes the canvassing UI based on the active candidate's config.
 *   1. map_config.layers present → <DynamicCanvassing> (wizard-onboarded)
 *   2. map_config.kind === 'rural' → <RuralCanvassingPage> (legacy panchagar)
 *   3. else → <UrbanCanvassingPage> (legacy dhaka13)
 */
export default function CanvassingPage() {
    const { candidate, loading } = useAuth();
    if (loading) return <LoadingState full />;

    const mc = candidate?.map_config || {};
    if (Array.isArray(mc.layers) && mc.layers.length > 0) return <DynamicCanvassing />;
    return mc.kind === 'rural' ? <RuralCanvassingPage /> : <UrbanCanvassingPage />;
}
