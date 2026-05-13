import axios from 'axios';

const client = axios.create({
    baseURL: '/api',
    timeout: 30000,
});

let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
    onUnauthorized = fn;
}

client.interceptors.request.use((config) => {
    const token = localStorage.getItem('auth.token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

client.interceptors.response.use(
    (res) => res,
    (err) => {
        // Only trigger onUnauthorized when we actually HAD a token. A 401 on
        // a request that went out without an Authorization header (e.g. on
        // /auth/login itself, or anything fired immediately after logout)
        // doesn't need to re-trigger logout. Without this guard, a stray 401
        // after logout can drive an infinite loop.
        if (err.response?.status === 401 && onUnauthorized) {
            const hadToken = !!localStorage.getItem('auth.token');
            if (hadToken) onUnauthorized();
        }
        return Promise.reject(err);
    }
);

export default client;
