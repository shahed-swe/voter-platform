import { useAuth } from '../auth/AuthContext.jsx';
import UrbanCanvassingPage from './UrbanCanvassingPage.jsx';
import RuralCanvassingPage from './RuralCanvassingPage.jsx';
import { LoadingState } from '../components/LoadingState.jsx';

/**
 * Routes to urban (dhaka13) or rural (panchagar) canvassing UI based on the
 * active candidate's map_config.kind. Defaults to urban if not set.
 */
export default function CanvassingPage() {
    const { candidate, loading } = useAuth();
    if (loading) return <LoadingState />;
    const kind = candidate?.map_config?.kind || 'urban';
    return kind === 'rural' ? <RuralCanvassingPage /> : <UrbanCanvassingPage />;
}
