import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { CardSkeleton } from '../components/Skeleton.jsx';
import { needsPassword, useAuth } from './AuthContext.jsx';

// Only same-app paths are accepted as return targets.
export const safeReturnPath = (from) => (typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/');

export function RequireAuth() {
  const { user, loading, recovery } = useAuth();
  const location = useLocation();
  if (loading) return <CardSkeleton />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search + location.hash }} />;
  if (recovery || needsPassword(user)) return <Navigate to="/reset-password" replace />;
  return <Outlet />;
}

export function PublicOnly() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <CardSkeleton />;
  if (user) return <Navigate to={safeReturnPath(location.state?.from)} replace />;
  return <Outlet />;
}
