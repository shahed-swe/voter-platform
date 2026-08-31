import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/AppLayout.jsx';
import ProtectedRoute from './auth/ProtectedRoute.jsx';
import { useAuth } from './auth/AuthContext.jsx';
import { roleHome } from './auth/roleHome.js';
import PartyHomePage from './pages/party/PartyHomePage.jsx';
import DonorProfilePage from './pages/donor/DonorProfilePage.jsx';

import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import CanvassingPage from './pages/CanvassingPage.jsx';
import AnalyticsPage from './pages/AnalyticsPage.jsx';
import SurveyDataPage from './pages/SurveyDataPage.jsx';
import ElectionResultsPage from './pages/ElectionResultsPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import CandidatesListPage from './pages/admin/CandidatesListPage.jsx';
import CreateCandidatePage from './pages/admin/CreateCandidatePage.jsx';
import ImportDataPage from './pages/admin/ImportDataPage.jsx';
import PoliticalCandidatesPage from './pages/admin/PoliticalCandidatesPage.jsx';
import VolunteerManagementPage from './pages/candidate/VolunteerManagementPage.jsx';
import ManagementPage from './pages/admin/ManagementPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

// Role-aware landing: party-level roles (Political Admin / Donor) get their
// own home instead of the constituency dashboard they can't use.
function RoleLanding() {
    const { user } = useAuth();
    return <Navigate to={roleHome(user)} replace />;
}

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
                <Route index element={<RoleLanding />} />
                {/* Party-level landings */}
                <Route path="/party" element={<PartyHomePage />} />
                <Route path="/donor" element={<DonorProfilePage />} />
                <Route path="/dashboard"        element={<DashboardPage />} />
                <Route path="/canvassing"       element={<CanvassingPage />} />
                <Route path="/analytics"        element={<AnalyticsPage />} />
                <Route path="/survey-data"      element={<SurveyDataPage />} />
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
                {/* Unified hierarchy management (#12) — candidate → admin → sub_admin → volunteer */}
                <Route
                    path="/management"
                    element={
                        <ProtectedRoute roles={['candidate', 'admin', 'sub_admin']}>
                            <ManagementPage />
                        </ProtectedRoute>
                    }
                />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
        </Routes>
    );
}
