import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import { CardSkeleton } from './components/Skeleton.jsx';
import { ToastProvider } from './components/toast/ToastProvider.jsx';
import { queryClient } from './lib/queryClient.js';
import { createRouter } from './router.jsx';
import './styles/index.css';

const router = createRouter();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <RouterProvider router={router} fallbackElement={<CardSkeleton />} />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
