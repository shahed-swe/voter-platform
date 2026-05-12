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
        if (err.response?.status === 401 && onUnauthorized) onUnauthorized();
        return Promise.reject(err);
    }
);

export default client;
