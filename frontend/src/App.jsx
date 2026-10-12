import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useUser } from './auth/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import ConfirmPage from './pages/Confirm.jsx';
import ForgotPasswordPage from './pages/ForgotPassword.jsx';
import LoginPage from './pages/Login.jsx';
import ProfilePage from './pages/Profile.jsx';
import RegisterPage from './pages/Register.jsx';
import WatchlistPage from './pages/Watchlist.jsx';

function RequireAuth({ children }) {
  const user = useUser();
  const location = useLocation();
  return user ? children : <Navigate to="/login" replace state={{ from: location.pathname }} />;
}

function PublicOnly({ children }) {
  return useUser() ? <Navigate to="/" replace /> : children;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
        <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
        <Route path="/confirm" element={<PublicOnly><ConfirmPage /></PublicOnly>} />
        <Route path="/forgot-password" element={<PublicOnly><ForgotPasswordPage /></PublicOnly>} />
        <Route path="/" element={<RequireAuth><WatchlistPage /></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
