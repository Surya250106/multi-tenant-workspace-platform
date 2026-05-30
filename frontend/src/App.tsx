import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { Forbidden, NotFound } from './pages/ErrorPages';
import { ProtectedRoute, PublicRoute } from './components/RouteGuards';
import { Analytics } from './pages/Analytics';
import { KanbanBoard } from './components/KanbanBoard';
import { DashboardLayout } from './components/DashboardLayout';
import { ToastProvider } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Notifications } from './pages/Notifications';
import { ProfileSettings } from './pages/ProfileSettings';

// Setup TanStack QueryClient
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000 // 5 minutes
    }
  }
});

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              {/* 1. Public Auth Gates (Redirects to /dashboard if logged in) */}
              <Route element={<PublicRoute />}>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
              </Route>

              {/* 2. Protected Session Gates (Redirects to /login if anonymous) */}
              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                
                {/* Active Platform Routes */}
                <Route path="/workspaces/:workspaceId" element={<Dashboard />} />
                <Route path="/workspaces/:workspaceId/projects/:projectId" element={<Dashboard />} />
                <Route path="/workspaces/:workspaceId/projects/:projectId/boards/:boardId" element={<DashboardLayout><KanbanBoard /></DashboardLayout>} />
                <Route path="/workspaces/:workspaceId/analytics" element={<Analytics />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/settings/profile" element={<ProfileSettings />} />
              </Route>

              {/* 3. Global Ingress Error Layouts */}
              <Route path="/403" element={<Forbidden />} />
              <Route path="/404" element={<NotFound />} />
              <Route path="*" element={<Navigate to="/404" replace />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  );
};

export default App;
