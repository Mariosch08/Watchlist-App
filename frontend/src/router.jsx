import { createBrowserRouter } from 'react-router-dom';
import { PublicOnly, RequireAuth } from './auth/guards.jsx';
import Layout from './components/Layout.jsx';
import RouteError from './components/RouteError.jsx';
import ForgotPasswordPage from './pages/ForgotPassword.jsx';
import LoginPage from './pages/Login.jsx';
import NotFoundPage from './pages/NotFound.jsx';
import RegisterPage from './pages/Register.jsx';
import ResetPasswordPage from './pages/ResetPassword.jsx';

// Signed-in pages are loaded on demand; the small auth pages ship with the first bundle.
const page = (load) => async () => ({ Component: (await load()).default });

export const routes = [
  {
    element: <Layout />,
    errorElement: <RouteError />,
    children: [
      {
        element: <PublicOnly />,
        children: [
          { path: 'login', element: <LoginPage /> },
          { path: 'register', element: <RegisterPage /> },
          { path: 'forgot-password', element: <ForgotPasswordPage /> },
        ],
      },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      {
        element: <RequireAuth />,
        children: [
          { index: true, lazy: page(() => import('./pages/Watchlist.jsx')) },
          { path: 'import', lazy: page(() => import('./pages/ImportExport.jsx')) },
          { path: 'profile', lazy: page(() => import('./pages/Profile.jsx')) },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

export const createRouter = () => createBrowserRouter(routes, { basename });
