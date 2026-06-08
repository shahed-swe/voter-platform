import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import * as authApi from '../api/auth';
import * as candidatesApi from '../api/candidates';
import { setUnauthorizedHandler } from '../api/client';

const AuthContext = createContext(null);

const TOKEN_KEY     = 'auth.token';
const USER_KEY      = 'auth.user';
const CANDIDATE_KEY = 'auth.candidate';

function readStored() {
    try {
        const token = localStorage.getItem(TOKEN_KEY);
        const user  = localStorage.getItem(USER_KEY);
        const cand  = localStorage.getItem(CANDIDATE_KEY);
        return {
            token: token || null,
            user: user ? JSON.parse(user) : null,
            candidate: cand ? JSON.parse(cand) : null,
        };
    } catch {
        return { token: null, user: null, candidate: null };
    }
}

export function AuthProvider({ children }) {
    const [state, setState] = useState(() => ({ ...readStored(), loading: true }));

    const persist = useCallback((token, user, candidate) => {
        if (token) localStorage.setItem(TOKEN_KEY, token);
        else localStorage.removeItem(TOKEN_KEY);
        if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
        else localStorage.removeItem(USER_KEY);
        if (candidate) localStorage.setItem(CANDIDATE_KEY, JSON.stringify(candidate));
        else localStorage.removeItem(CANDIDATE_KEY);
    }, []);

    const logout = useCallback(() => {
        persist(null, null, null);
        setState({ token: null, user: null, candidate: null, loading: false });
        // NOTE: we deliberately don't call authApi.logout(). The backend's
        // /auth/logout is a no-op (just returns success) and JWTs are
        // stateless — invalidation happens here by dropping the token from
        // localStorage. Calling the API would send a request with no
        // Authorization header (we just cleared it), the server returns 401,
        // the response interceptor calls onUnauthorized → which calls logout
        // → which calls the API again → infinite loop that breaks the next
        // login attempt until the user hard-refreshes.
    }, [persist]);

    useEffect(() => {
        setUnauthorizedHandler(() => logout());
        if (state.token) {
            authApi.me()
                .then((res) => {
                    if (res?.user) {
                        const cand = res.active_candidate || null;
                        persist(state.token, res.user, cand);
                        setState((s) => ({ ...s, user: res.user, candidate: cand, loading: false }));
                    } else {
                        logout();
                    }
                })
                .catch(() => logout());
        } else {
            setState((s) => ({ ...s, loading: false }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const login = useCallback(
        async (username, password) => {
            const res = await authApi.login(username, password);
            if (!res?.success) throw new Error(res?.error || 'Login failed');
            // For now, only candidate-bound users land here. The active_candidate
            // metadata returned by /login is just the id; fetch the full record
            // via /me so we have title/subtitle/filter_config.
            persist(res.token, res.user, null);
            const me = await authApi.me().catch(() => ({}));
            const cand = me?.active_candidate || null;
            persist(res.token, res.user, cand);
            setState({ token: res.token, user: res.user, candidate: cand, loading: false });
            return res.user;
        },
        [persist]
    );

    const switchCandidate = useCallback(
        async (candidateId) => {
            const res = await candidatesApi.switchActive(candidateId);
            if (!res?.success) throw new Error(res?.error || 'Switch failed');
            const newToken = res.token;
            const cand = res.active_candidate || null;
            // Persist only — DO NOT setState here. The caller is about to
            // navigate; an intermediate setState triggers a re-render that
            // races the navigation and can leave the React tree half-rendered.
            persist(newToken, state.user, cand);
            return cand;
        },
        [persist, state.user]
    );

    // Re-fetch the session (e.g. after editing the active candidate's config)
    // so candidate.filter_config / map_config update without a hard reload.
    const refresh = useCallback(async () => {
        if (!state.token) return null;
        const me = await authApi.me().catch(() => null);
        if (!me?.user) return null;
        const cand = me.active_candidate || null;
        persist(state.token, me.user, cand);
        setState((s) => ({ ...s, user: me.user, candidate: cand }));
        return cand;
    }, [state.token, persist]);

    const value = useMemo(
        () => ({
            ...state,
            isAuthenticated: !!state.token,
            login,
            logout,
            switchCandidate,
            refresh,
        }),
        [state, login, logout, switchCandidate, refresh]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
    return ctx;
}
