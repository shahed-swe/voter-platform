import { useCallback, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import { SkeletonTable, ErrorState, EmptyState, Spinner } from '../components/LoadingState.jsx';
import useApi from '../hooks/useApi.js';
import * as adminApi from '../api/admin.js';
import { useAuth } from '../auth/AuthContext.jsx';

const ROLES = ['admin', 'sub_admin', 'volunteer'];

function CreateUserModal({ onClose, onCreated }) {
    const [form, setForm] = useState({
        username: '', email: '', name: '', role: 'volunteer', phone: '', address: '',
    });
    const [busy, setBusy]   = useState(false);
    const [error, setError] = useState(null);

    const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const res = await adminApi.createUser(form);
            onCreated(res);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[92vh] overflow-y-auto">
                <div className="border-b border-gray-200 px-5 py-3 flex justify-between items-center">
                    <h3 className="font-semibold">Create user</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <i className="fas fa-times" />
                    </button>
                </div>
                <form className="p-5 space-y-3" onSubmit={submit}>
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-2">
                            {error}
                        </div>
                    )}
                    <div>
                        <label className="input-label">Full name</label>
                        <input className="input-field" required value={form.name} onChange={update('name')} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="input-label">Username</label>
                            <input className="input-field" required value={form.username} onChange={update('username')} />
                        </div>
                        <div>
                            <label className="input-label">Role</label>
                            <select className="input-field" value={form.role} onChange={update('role')}>
                                {ROLES.map((r) => (
                                    <option key={r} value={r}>{r}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="input-label">Email</label>
                        <input type="email" className="input-field" required value={form.email} onChange={update('email')} />
                    </div>
                    <div>
                        <label className="input-label">Phone (optional)</label>
                        <input className="input-field" value={form.phone} onChange={update('phone')} placeholder="+88017..." />
                    </div>
                    <div>
                        <label className="input-label">Address (optional)</label>
                        <input className="input-field" value={form.address} onChange={update('address')} />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn-primary" disabled={busy}>
                            {busy ? <Spinner size="sm" /> : null}
                            {busy ? 'Creating...' : 'Create user'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default function AdminPage() {
    const { user } = useAuth();
    const [openCreate, setOpenCreate] = useState(false);
    const [filter, setFilter]         = useState({ role: '', search: '' });

    const fetchUsers = useCallback(
        () => adminApi.listUsers({ role: filter.role || undefined, search: filter.search || undefined }),
        [filter.role, filter.search]
    );
    const { data, loading, error, refetch } = useApi(fetchUsers, [filter.role, filter.search]);

    async function handleDelete(u) {
        if (u.user_id === user.user_id) return alert('You cannot delete yourself.');
        if (!confirm(`Delete user ${u.username}?`)) return;
        try {
            await adminApi.deleteUser(u.user_id);
            refetch();
        } catch (err) {
            alert(err.response?.data?.error || err.message);
        }
    }

    return (
        <>
            <PageHeader
                title="User administration"
                subtitle="Create, manage, and assign volunteers and sub-administrators"
                actions={
                    <button className="btn-primary" onClick={() => setOpenCreate(true)}>
                        <i className="fas fa-plus" /> New user
                    </button>
                }
            />

            <div className="card mb-4">
                <div className="flex flex-wrap gap-3 items-end">
                    <div className="flex-1 min-w-[200px]">
                        <label className="input-label">Search</label>
                        <input
                            className="input-field"
                            placeholder="Search by name, username, or email"
                            value={filter.search}
                            onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="input-label">Role</label>
                        <select
                            className="input-field"
                            value={filter.role}
                            onChange={(e) => setFilter((f) => ({ ...f, role: e.target.value }))}
                        >
                            <option value="">All roles</option>
                            {ROLES.map((r) => (
                                <option key={r} value={r}>{r}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <div className="card overflow-x-auto p-0">
                {loading ? (
                    <SkeletonTable rows={7} cols={6} />
                ) : error ? (
                    <ErrorState error={error} onRetry={refetch} />
                ) : data?.users?.length ? (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Username</th>
                                <th>Email</th>
                                <th>Role</th>
                                <th>Status</th>
                                <th>Phone</th>
                                <th className="w-1"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {data.users.map((u) => (
                                <tr key={u.user_id}>
                                    <td>{u.name}</td>
                                    <td className="font-mono text-xs">{u.username}</td>
                                    <td>{u.email}</td>
                                    <td><span className="badge-info">{u.role}</span></td>
                                    <td>
                                        {u.is_active ? (
                                            <span className="badge-success">Active</span>
                                        ) : (
                                            <span className="badge-danger">Disabled</span>
                                        )}
                                    </td>
                                    <td className="text-gray-500">{u.phone || '—'}</td>
                                    <td>
                                        {user.role === 'admin' && (
                                            <button
                                                className="btn-danger text-xs px-2 py-1"
                                                onClick={() => handleDelete(u)}
                                            >
                                                <i className="fas fa-trash" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <EmptyState label="No users found." icon="fa-user-slash" />
                )}
            </div>

            {openCreate && (
                <CreateUserModal
                    onClose={() => setOpenCreate(false)}
                    onCreated={(res) => {
                        setOpenCreate(false);
                        refetch();
                        if (res?.temp_password) {
                            alert(`User created. Temporary password: ${res.temp_password}`);
                        }
                    }}
                />
            )}
        </>
    );
}
