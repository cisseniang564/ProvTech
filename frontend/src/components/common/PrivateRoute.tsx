// frontend/src/components/common/PrivateRoute.tsx
import React, { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from 'context/AuthContext';
import type { UserRole } from 'types';

interface PrivateRouteProps {
  children: ReactNode;
  requiredRoles?: UserRole[];
  /** Permissions au format "resource:action", ex: "triangles:write" */
  requiredPermissions?: string[];
  /** Composant alternatif à rendre si non autorisé */
  fallback?: ReactNode;
}

const PrivateRoute: React.FC<PrivateRouteProps> = ({
  children,
  requiredRoles = [],
  requiredPermissions = [],
  fallback,
}) => {
  const { user, isLoading, isAuthenticated, hasPermission } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredRoles.length > 0 && !requiredRoles.includes(user.role)) {
    return fallback ? <>{fallback}</> : <Navigate to="/unauthorized" replace />;
  }

  if (requiredPermissions.length > 0) {
    const allowed = requiredPermissions.every((perm) => hasPermission(perm));
    if (!allowed) {
      return fallback ? <>{fallback}</> : <Navigate to="/unauthorized" replace />;
    }
  }

  return <>{children}</>;
};

export default PrivateRoute;
