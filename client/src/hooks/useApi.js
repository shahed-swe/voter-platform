import { useEffect, useState, useCallback } from 'react';

/**
 * useApi(fn) - small data-fetching hook.
 *   fn must be a stable callable (use useCallback in callers).
 *   Returns { data, error, loading, refetch }.
 *
 * Uses a per-run `cancelled` token captured in the effect closure so that
 * React 18 StrictMode's dev-time double-invoke can't leave the previous
 * run's state setters dangling.
 */
export default function useApi(fn, deps = []) {
    const [state, setState] = useState({ data: null, error: null, loading: true });

    const run = useCallback(fn, deps); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        let cancelled = false;
        setState((s) => ({ ...s, loading: true, error: null }));
        (async () => {
            try {
                const data = await run();
                if (!cancelled) setState({ data, error: null, loading: false });
            } catch (err) {
                if (!cancelled) setState({ data: null, error: err, loading: false });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [run]);

    const refetch = useCallback(async () => {
        setState((s) => ({ ...s, loading: true, error: null }));
        try {
            const data = await run();
            setState({ data, error: null, loading: false });
        } catch (err) {
            setState({ data: null, error: err, loading: false });
        }
    }, [run]);

    return { ...state, refetch };
}
