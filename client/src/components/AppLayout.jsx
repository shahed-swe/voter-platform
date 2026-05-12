import { Outlet, useLocation } from 'react-router-dom';
import AppHeader from './AppHeader.jsx';

export default function AppLayout() {
    const { pathname } = useLocation();

    // Dashboard is full-bleed (map driven). Other pages get padding.
    const fullBleed = pathname.startsWith('/dashboard');

    return (
        <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
            <AppHeader />
            <main className={fullBleed ? 'flex-1 overflow-hidden' : 'flex-1 overflow-y-auto p-4 md:p-6'}>
                <Outlet />
            </main>
        </div>
    );
}
