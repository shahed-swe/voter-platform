import { useState } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { Spinner } from '../components/LoadingState.jsx';

export default function LoginPage() {
    const { login, isAuthenticated, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const from = location.state?.from?.pathname || '/dashboard';

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPw, setShowPw]     = useState(false);
    const [busy, setBusy]         = useState(false);
    const [error, setError]       = useState(null);

    if (authLoading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Spinner size="lg" />
            </div>
        );
    }
    if (isAuthenticated) return <Navigate to={from} replace />;

    async function handleSubmit(e) {
        e.preventDefault();
        if (!username || !password) {
            setError('Username and password are required');
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await login(username.trim(), password);
            navigate(from, { replace: true });
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'Login failed');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-dark via-brand to-brand-light p-4">
            <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden">
                <div className="bg-brand text-white px-6 py-8 text-center">
                    <div className="flex items-center justify-center gap-3 mb-3">
                        <img src="/assets/images/BSARL.png" alt="BSAR" className="h-12 w-12 object-contain" />
                        <img src="/assets/images/centristnation.png" alt="Centristnation" className="h-12 w-12 object-contain" />
                    </div>
                    <h1 className="text-2xl font-semibold">Voter Survey Platform</h1>
                    <p className="text-sm opacity-80 mt-1">Sign in to your account</p>
                </div>

                <form className="p-6 space-y-4" onSubmit={handleSubmit}>
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md p-3">
                            <i className="fas fa-exclamation-circle mr-2" />
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="input-label" htmlFor="username">
                            Username or email
                        </label>
                        <div className="relative">
                            <i className="fas fa-user absolute top-3 left-3 text-gray-400" />
                            <input
                                id="username"
                                type="text"
                                autoComplete="username"
                                className="input-field pl-9"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                disabled={busy}
                                autoFocus
                            />
                        </div>
                    </div>

                    <div>
                        <label className="input-label" htmlFor="password">
                            Password
                        </label>
                        <div className="relative">
                            <i className="fas fa-lock absolute top-3 left-3 text-gray-400" />
                            <input
                                id="password"
                                type={showPw ? 'text' : 'password'}
                                autoComplete="current-password"
                                className="input-field pl-9 pr-10"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={busy}
                            />
                            <button
                                type="button"
                                className="absolute top-2.5 right-3 text-gray-400 hover:text-gray-600"
                                onClick={() => setShowPw((v) => !v)}
                                tabIndex={-1}
                                aria-label="Toggle password visibility"
                            >
                                <i className={`fas ${showPw ? 'fa-eye-slash' : 'fa-eye'}`} />
                            </button>
                        </div>
                    </div>

                    <button type="submit" className="btn-primary w-full" disabled={busy}>
                        {busy ? <Spinner size="sm" /> : <i className="fas fa-sign-in-alt" />}
                        {busy ? 'Signing in...' : 'Sign in'}
                    </button>

                    <p className="text-center text-xs text-gray-400 pt-2">
                        Need help? Contact your administrator.
                    </p>
                </form>
            </div>
        </div>
    );
}
