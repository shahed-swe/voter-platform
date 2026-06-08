import { useState } from 'react';
import DynamicMap from '../components/DynamicMap.jsx';
import DynamicFilterPanel from '../components/filters/DynamicFilterPanel.jsx';
import FilteredVoterListPanel from '../components/canvassing/FilteredVoterListPanel.jsx';
import CanvassFormModal from '../components/canvassing/CanvassFormModal.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

/**
 * Canvassing for wizard-onboarded candidates (map_config.layers present).
 * Left: config-driven filters (candidate.filter_config). Center: the layered
 * map. Right: the voter list filtered by the chosen filters. Clicking a voter
 * opens the canvass form.
 */
export default function DynamicCanvassing() {
    const { candidate } = useAuth();
    const cfg = candidate?.map_config || {};
    const filterConfig = candidate?.filter_config || [];

    const [filters, setFilters]       = useState({});
    const [activeVoter, setActiveVoter] = useState(null);
    const [flash, setFlash]           = useState(null);

    // Build the scope label from the active filter selections.
    const scopeLabel = Object.entries(filters)
        .filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0))
        .map(([, v]) => (Array.isArray(v) ? v.join(', ') : v))
        .join(' › ');

    return (
        <div className="h-full flex flex-col relative overflow-hidden">
            {flash && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[600] bg-green-50 border border-green-200 text-green-700 rounded-md px-3 py-2 text-sm shadow-md">
                    <i className="fas fa-check-circle mr-1" /> {flash}
                </div>
            )}

            {/* Map fills the pane */}
            <div className="absolute inset-0">
                <DynamicMap config={cfg} candidateId={candidate?.candidate_id} />
            </div>

            {/* Left: filters (only if the candidate has any configured) */}
            {filterConfig.length > 0 && (
                <aside className="absolute left-4 top-4 bottom-4 w-[280px] z-[500] overflow-y-auto pr-1">
                    <DynamicFilterPanel config={filterConfig} value={filters} onChange={setFilters} />
                </aside>
            )}

            {/* Right: voter list, filtered */}
            <aside className="absolute right-4 top-4 bottom-4 w-[380px] z-[500]">
                <FilteredVoterListPanel
                    filters={filters}
                    scopeLabel={scopeLabel || candidate?.title}
                    onPickVoter={(v) => setActiveVoter(v)}
                />
            </aside>

            {activeVoter && (
                <CanvassFormModal
                    voter={activeVoter}
                    onClose={() => setActiveVoter(null)}
                    onSubmitted={() => {
                        setFlash(`Saved canvass for ${activeVoter.name}`);
                        setActiveVoter(null);
                        setTimeout(() => setFlash(null), 4000);
                    }}
                />
            )}
        </div>
    );
}
