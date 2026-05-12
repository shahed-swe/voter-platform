const config = require('../config');

const store = new Map(); // key -> { value, expiresAt }

function get(key) {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return null;
    }
    return entry.value;
}

function set(key, value, ttl = config.cache.filterTtlMs) {
    store.set(key, { value, expiresAt: Date.now() + ttl });
}

function invalidate(key) {
    if (key) store.delete(key);
    else store.clear();
}

function status() {
    return {
        size: store.size,
        keys: [...store.keys()],
        ttlMs: config.cache.filterTtlMs,
        serverStartTime: config.cache.serverStartTime,
        cacheVersion: `v${config.cache.serverStartTime}`,
    };
}

module.exports = { get, set, invalidate, status };
