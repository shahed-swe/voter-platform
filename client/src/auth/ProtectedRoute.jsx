import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

export default function ProtectedRoute({ children, roles, requireSuperAdmin }) {
    const { isAuthenticated, user, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-gray-500">Loading...</div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace state={{ from: location }} />;
    }

    if (requireSuperAdmin && !user?.is_super_admin) {
        return <Navigate to="/dashboard" replace />;
    }

    // Super-admins satisfy any per-role check too.
    if (roles && roles.length && !user?.is_super_admin && !roles.includes(user?.role)) {
        return <Navigate to="/dashboard" replace />;
    }

    return children;
}
