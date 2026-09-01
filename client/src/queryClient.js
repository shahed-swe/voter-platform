import { QueryClient } from '@tanstack/react-query';

// Single shared TanStack Query client. Lives in its own module (not main.jsx)
// so non-component code — AuthContext's login/logout — can reach it to wipe
// cached data when the signed-in user changes: cache keys are per-constituency,
// not per-user, so one user's cached options/lists must never survive into
// another user's session in the same tab.
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Behavior-preserving defaults: the app never refetched on window
            // focus or reconnect before the TanStack Query migration.
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            retry: 1,
        },
    },
});
