import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/AppLayout.jsx';
import ProtectedRoute from './auth/ProtectedRoute.jsx';

import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import CanvassingPage from './pages/CanvassingPage.jsx';
import AnalyticsPage from './pages/AnalyticsPage.jsx';
import ElectionResultsPage from './pages/ElectionResultsPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import CandidatesListPage from './pages/admin/CandidatesListPage.jsx';
import CreateCandidatePage from './pages/admin/CreateCandidatePage.jsx';
import ImportDataPage from './pages/admin/ImportDataPage.jsx';
import PoliticalCandidatesPage from './pages/admin/PoliticalCandidatesPage.jsx';
import VolunteerManagementPage from './pages/candidate/VolunteerManagementPage.jsx';
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
                {/* Super-admin tooling (candidate management) */}
                <Route
                    path="/admin/candidates"
                    element={
                        <ProtectedRoute requireSuperAdmin>
                            <CandidatesListPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/admin/candidates/new"
                    element={
                        <ProtectedRoute requireSuperAdmin>
                            <CreateCandidatePage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/admin/import"
                    element={
                        <ProtectedRoute requireSuperAdmin>
                            <ImportDataPage />
                        </ProtectedRoute>
                    }
                />
                {/* Political candidates management (super-admin) */}
                <Route
                    path="/admin/political-candidates"
                    element={
                        <ProtectedRoute requireSuperAdmin>
                            <PoliticalCandidatesPage />
                        </ProtectedRoute>
                    }
                />
                {/* Volunteer management (candidate role) */}
                <Route
                    path="/volunteers"
                    element={
                        <ProtectedRoute roles={['candidate', 'admin']}>
                            <VolunteerManagementPage />
                        </ProtectedRoute>
                    }
                />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
        </Routes>
    );
}
