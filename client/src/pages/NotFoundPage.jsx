import { Link } from 'react-router-dom';

export default function NotFoundPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center">
                <div className="text-6xl font-bold text-brand">404</div>
                <p className="text-gray-500 my-3">The page you are looking for does not exist.</p>
                <Link to="/dashboard" className="btn-primary">
                    Go to dashboard
                </Link>
            </div>
        </div>
    );
}
