import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/AppLayout.jsx';
import ProtectedRoute from './auth/ProtectedRoute.jsx';

import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import CanvassingPage from './pages/CanvassingPage.jsx';
import AnalyticsPage from './pages/AnalyticsPage.jsx';
import ElectionResultsPage from './pages/ElectionResultsPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

export default function App() {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route
                element={
                    <ProtectedRoute>
                        <AppLayout />
                    </ProtectedRoute>
                }
            >
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard"        element={<DashboardPage />} />
                <Route path="/canvassing"       element={<CanvassingPage />} />
                <Route path="/analytics"        element={<AnalyticsPage />} />
                <Route path="/election-results" element={<ElectionResultsPage />} />
                <Route
                    path="/admin"
                    element={
                        <ProtectedRoute roles={['admin', 'sub_admin']}>
                            <AdminPage />
                        </ProtectedRoute>
                    }
                />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
        </Routes>
    );
}
