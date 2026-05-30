import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

/**
 * Route guard that redirects unauthenticated users to `/login`.
 */
export const ProtectedRoute: React.FC = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const location = useLocation();

  if (!isAuthenticated) {
    // Redirect to login but save the current location they were trying to access
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
};

/**
 * Route guard that prevents authenticated users from viewing login/register pages.
 */
export const PublicRoute: React.FC = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (isAuthenticated) {
    // Redirect already authenticated users straight to the dashboard
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};

/**
 * Scoped workspace role-aware guard.
 * Blocks access and redirects to `/403` if membership role rank is insufficient.
 */
interface RoleGuardProps {
  allowedRoles: string[];
  userRole?: string; // resolved dynamically or passed from workspace details
}

export const RoleGuard: React.FC<RoleGuardProps> = ({ allowedRoles, userRole = 'member' }) => {
  const isAuthorized = allowedRoles.includes(userRole);

  if (!isAuthorized) {
    return <Navigate to="/403" replace />;
  }

  return <Outlet />;
};
