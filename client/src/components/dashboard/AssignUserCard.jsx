import { useState } from 'react';
import * as adminApi from '../../api/admin.js';
import { Spinner } from '../LoadingState.jsx';

/**
 * Shown only when a scope (ward or voter area) is selected.
 * `target` is a description object: { type, value, label, village_id? }
 */
export default function AssignUserCard({ users, target, onAssigned }) {
    const [userId, setUserId] = useState('');
    const [busy, setBusy]     = useState(false);
    const [error, setError]   = useState(null);
    const [success, setOk]    = useState(null);

    async function submit() {
        if (!userId || !target) return;
        setBusy(true); setError(null); setOk(null);
        try {
            await adminApi.createAssignment(userId, {
                assignment_type: target.type,
                assignment_value: target.value,
                village_id: target.village_id,
            });
            setOk(`Assigned to ${users.find((u) => String(u.user_id) === String(userId))?.name || 'user'}.`);
            setUserId('');
            onAssigned?.();
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setBusy(false);
        }
    }

    const disabled = !target;

    return (
        <div className="bg-white border border-brand/30 rounded-lg shadow-sm p-4">
            <div className="text-sm font-bold text-brand flex items-center gap-2 mb-2">
                <i className="fas fa-location-dot" /> Assign User
            </div>

            {!target && (
                <p className="text-xs text-gray-500 mb-2">
                    Select a ward or voter area first.
                </p>
            )}
            {target && (
                <p className="text-xs text-gray-600 mb-2">
                    To: <span className="font-medium text-gray-800">{target.label}</span>
                </p>
            )}

            <select
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none mb-2"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                disabled={disabled}
            >
                <option value="">Select user...</option>
                {users.map((u) => (
                    <option key={u.user_id} value={u.user_id}>
                        {u.name} ({u.role})
                    </option>
                ))}
            </select>

            {error && <div className="text-xs text-red-600 mb-2">{error}</div>}
            {success && <div className="text-xs text-green-700 mb-2">{success}</div>}

            <button
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-brand text-white hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={submit}
                disabled={disabled || busy || !userId}
            >
                {busy ? <Spinner size="sm" /> : <i className="fas fa-check" />} Assign
            </button>
        </div>
    );
}
