import DynamicMap from '../components/DynamicMap.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

/**
 * Renders any candidate whose `map_config.layers` is set. The map drives the
 * whole page. Side panels (population stats, density legend, assign user)
 * are intentionally NOT rendered here yet — they'll be reintroduced in the
 * next phase as config-driven right-panel widgets keyed off
 * `map_config.right_panel`.
 *
 * For now the goal is to prove the layered-map idea end-to-end; both the
 * legacy Urban/Rural dashboards remain available as a fallback.
 */
export default function DynamicDashboard() {
    const { candidate } = useAuth();
    const cfg = candidate?.map_config || {};
    return (
        <div className="h-full w-full">
            <DynamicMap config={cfg} candidateId={candidate?.candidate_id} />
        </div>
    );
}
