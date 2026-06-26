import { Outlet, useLocation } from 'react-router-dom';
import AppHeader from './AppHeader.jsx';

export default function AppLayout() {
    const { pathname } = useLocation();

    // Dashboard + Canvassing are full-bleed (map driven). Other pages get padding.
    const fullBleed = pathname.startsWith('/dashboard') || pathname.startsWith('/canvassing');

    return (
        <div className="h-screen flex flex-col bg-gray-50">
            {/* z-50 so the Admin dropdown floats over main content; no overflow-hidden on the shell */}
            <div className="relative z-50 flex-shrink-0">
                <AppHeader />
            </div>
            <main className={fullBleed ? 'flex-1 overflow-hidden' : 'flex-1 overflow-y-auto p-4 md:p-6'}>
                <Outlet />
            </main>
        </div>
    );
}
