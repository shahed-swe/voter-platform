import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import * as authApi from '../api/auth';
import { setUnauthorizedHandler } from '../api/client';

const AuthContext = createContext(null);

const TOKEN_KEY = 'auth.token';
const USER_KEY  = 'auth.user';

function readStored() {
    try {
        const token = localStorage.getItem(TOKEN_KEY);
        const user  = localStorage.getItem(USER_KEY);
        return { token: token || null, user: user ? JSON.parse(user) : null };
    } catch {
        return { token: null, user: null };
    }
}

export function AuthProvider({ children }) {
    const [state, setState] = useState(() => ({ ...readStored(), loading: true }));

    const persist = useCallback((token, user) => {
        if (token) localStorage.setItem(TOKEN_KEY, token);
        else localStorage.removeItem(TOKEN_KEY);
        if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
        else localStorage.removeItem(USER_KEY);
    }, []);

    const logout = useCallback(() => {
        persist(null, null);
        setState({ token: null, user: null, loading: false });
        try { authApi.logout(); } catch { /* ignore */ }
    }, [persist]);

    useEffect(() => {
        setUnauthorizedHandler(() => logout());
        // Optional: validate token by hitting /auth/me; if it fails, clear state.
        if (state.token) {
            authApi.me()
                .then((res) => {
                    if (res?.user) {
                        persist(state.token, res.user);
                        setState((s) => ({ ...s, user: res.user, loading: false }));
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
            persist(res.token, res.user);
            setState({ token: res.token, user: res.user, loading: false });
            return res.user;
        },
        [persist]
    );

    const value = useMemo(
        () => ({
            ...state,
            isAuthenticated: !!state.token,
            login,
            logout,
        }),
        [state, login, logout]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
    return ctx;
}
