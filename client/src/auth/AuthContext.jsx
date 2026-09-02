import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import * as authApi from '../api/auth';
import * as candidatesApi from '../api/candidates';
import { setUnauthorizedHandler } from '../api/client';
import { queryClient } from '../queryClient.js';

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
        // Wipe every cached query: keys are per-constituency, not per-user, so
        // a restricted user logging in next in this tab must never be served
        // the previous user's (broader) cached lists/options.
        queryClient.clear();
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
                        const u = { ...res.user, candidates: res.candidates || [] };
                        persist(state.token, u, cand);
                        setState((s) => ({ ...s, user: u, candidate: cand, loading: false }));
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
            // Fresh session, fresh cache (see logout note).
            queryClient.clear();
            // For now, only candidate-bound users land here. The active_candidate
            // metadata returned by /login is just the id; fetch the full record
            // via /me so we have title/subtitle/filter_config.
            persist(res.token, res.user, null);
            const me = await authApi.me().catch(() => ({}));
            const cand = me?.active_candidate || null;
            const u = { ...res.user, candidates: me?.candidates || res.candidates || [] };
            persist(res.token, u, cand);
            setState({ token: res.token, user: u, candidate: cand, loading: false });
            return u;
        },
        [persist]
    );

    const switchCandidate = useCallback(
        async (candidateId, politicalCandidateId) => {
            const res = await candidatesApi.switchActive(candidateId, politicalCandidateId);
            if (!res?.success) throw new Error(res?.error || 'Switch failed');
            const newToken = res.token;
            const cand = res.active_candidate || null;
            // Reflect the newly-active grant's ward restriction + political candidate
            // on the persisted user so a volunteer's map scopes correctly after switch.
            const nextUser = state.user
                ? {
                    ...state.user,
                    allowed_wards: res.allowed_wards ?? state.user.allowed_wards,
                    political_candidate_id: res.active_political_candidate_id ?? state.user.political_candidate_id,
                }
                : state.user;
            // Persist only — DO NOT setState here. The caller is about to
            // navigate; an intermediate setState triggers a re-render that
            // races the navigation and can leave the React tree half-rendered.
            persist(newToken, nextUser, cand);
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
        const u = { ...me.user, candidates: me.candidates || [] };
        persist(state.token, u, cand);
        setState((s) => ({ ...s, user: u, candidate: cand }));
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
