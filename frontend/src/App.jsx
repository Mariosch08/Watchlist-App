import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import ForgotPasswordPage from './pages/ForgotPassword.jsx';
import ImportExportPage from './pages/ImportExport.jsx';
import LoginPage from './pages/Login.jsx';
import ProfilePage from './pages/Profile.jsx';
import RegisterPage from './pages/Register.jsx';
import ResetPasswordPage from './pages/ResetPassword.jsx';
import WatchlistPage from './pages/Watchlist.jsx';

function RequireAuth({ children }) {
  const { user, loading, recovery } = useAuth();
  const location = useLocation();
  if (loading) return <p>Lade …</p>;
  if (recovery) return <Navigate to="/reset-password" replace />;
  return user ? children : <Navigate to="/login" replace state={{ from: location.pathname }} />;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <p>Lade …</p>;
  return user ? <Navigate to="/" replace /> : children;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
        <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
        <Route path="/forgot-password" element={<PublicOnly><ForgotPasswordPage /></PublicOnly>} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/" element={<RequireAuth><WatchlistPage /></RequireAuth>} />
        <Route path="/import" element={<RequireAuth><ImportExportPage /></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
