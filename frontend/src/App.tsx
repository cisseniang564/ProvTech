// ===================================
// APP.TSX CORRIGÉ - INTÉGRATION SYSTÈME HYBRIDE + API DATA SELECTOR
// Fichier: /Users/cisseniang/Documents/ProvTech/frontend/src/App.tsx
// ===================================

import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'react-hot-toast';
import { HelmetProvider } from 'react-helmet-async';

import { AuthProvider, useAuth } from './context/AuthContext';
import ErrorBoundary from './components/common/ErrorBoundary';
import LoadingSpinner from './components/common/Loading';
import { validateTestData } from './pages/testData';
console.log(validateTestData());

// Pages existantes (vos imports actuels)
const Login = React.lazy(() => import('./pages/Login'));
const Register = React.lazy(() => import('./pages/Register'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const DataImport = React.lazy(() => import('./pages/DataImport'));
const Calculations = React.lazy(() => import('./pages/Calculations'));
const Reports = React.lazy(() => import('./pages/Reports'));
const Settings = React.lazy(() => import('./pages/Settings'));
const Audit = React.lazy(() => import('./pages/AuditPage'));
const Benchmarking = React.lazy(() => import('./pages/Benchmarking'));
const Simulation = React.lazy(() => import('./pages/ScenarioSimulation'));
const ScenarioSimulation = React.lazy(() => import('./pages/ScenarioSimulation'));
const ResultsPage = React.lazy(() => import('./pages/ResultsPage'));
const TrianglesList = React.lazy(() => import('./pages/TrianglesList'));
const APIManagement = React.lazy(() => import('./pages/APIManagement'));

// Pages d'erreur existantes
const NotFound = React.lazy(() => import('./pages/NotFound'));
const Unauthorized = React.lazy(() => import('./pages/Unauthorized'));

// NOUVEAUX COMPOSANTS SÉCURISÉS
const SecureLogin = React.lazy(() => import('./components/auth/SecureLogin'));
const AdminPanel = React.lazy(() => import('./components/admin/AdminPanel'));
const Migration2FA = React.lazy(() => import('./components/auth/Migration2FA'));
const MigrationPrompt = React.lazy(() => import('./components/auth/MigrationPrompt'));
const RegulatoryCompliancePage = React.lazy(() => import('./pages/RegulatoryCompliancePage'));
const ComplianceTestPage = React.lazy(() => import('./pages/ComplianceTestPage'));
const WorkflowApprovalSystem = React.lazy(() => import('./components/regulatory/WorkflowApprovalSystem'));
const DocumentationGenerator = React.lazy(() => import('./components/regulatory/DocumentationGenerator'));
const RegulatoryDashboardUnified = React.lazy(() => import('./components/dashboard/RegulatoryDashboardUnified'));

// NOUVEAU: Import du composant APIDataSelector et pages associées
const APIDataSelector = React.lazy(() => import('./components/APIDataSelector'));

// NOUVEAU: Page dédiée à la sélection de données API
const APIDataSelectorPage = React.lazy(() => 
  import('./pages/APIDataSelector').catch(() => ({
    default: () => {
      // Fallback si la page n'existe pas encore
      const APIDataSelector = React.lazy(() => import('./components/APIDataSelector'));
      
      return (
        <div className="min-h-screen bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900">Sources de Données API</h1>
              <p className="mt-2 text-gray-600">
                Connectez-vous aux sources de données externes pour enrichir vos calculs actuariels
              </p>
            </div>
            
            <Suspense fallback={<LoadingSpinner />}>
              <APIDataSelector 
                mode="standalone"
                onTriangleSelected={(triangleData) => {
                  // Rediriger vers les calculs avec le triangle sélectionné
                  const params = new URLSearchParams({
                    source: 'api',
                    triangleId: triangleData.id,
                    triangleName: triangleData.name
                  });
                  window.location.href = `/calculations?${params.toString()}`;
                }}
              />
            </Suspense>
          </div>
        </div>
      );
    }
  }))
);

// Configuration React Query (inchangée)
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
    },
  },
});

// ============ COMPOSANT DE ROUTE PROTÉGÉE ÉTENDU ============
interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermission?: string;
  requiredRole?: string;
  requireSecureAuth?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredPermission,
  requiredRole,
  requireSecureAuth = false
}) => {
  const { 
    isAuthenticated, 
    isLoading, 
    user, 
    hasPermission,
    authMode = 'legacy',
    migrationAvailable = false
  } = useAuth();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requireSecureAuth && authMode === 'legacy') {
    return <Navigate to="/migration/security-required" replace />;
  }

  if (requiredPermission && user && !hasPermission(requiredPermission)) {
    return <Navigate to="/unauthorized" replace />;
  }

  if (requiredRole && user && user.role !== requiredRole) {
    return <Navigate to="/unauthorized" replace />;
  }

  const shouldShowMigrationPrompt = 
    authMode === 'legacy' && 
    migrationAvailable && 
    !sessionStorage.getItem('migration_prompt_dismissed');

  return (
    <>
      {shouldShowMigrationPrompt && <MigrationPrompt />}
      {children}
    </>
  );
};

// ============ COMPOSANT DE ROUTE PUBLIQUE ÉTENDU ============
interface PublicRouteProps {
  children: React.ReactNode;
  forceSecureAuth?: boolean;
}

const PublicRoute: React.FC<PublicRouteProps> = ({ 
  children, 
  forceSecureAuth = false 
}) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

// ============ COMPOSANT DE FALLBACK ============
const SuspenseFallback: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
      <p className="mt-4 text-gray-600">Chargement...</p>
    </div>
  </div>
);

// ============ ROUTES DE L'APPLICATION ÉTENDUES ============
const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* ===== ROUTES PUBLIQUES ===== */}
      
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />

      <Route
        path="/login/secure"
        element={
          <PublicRoute forceSecureAuth={true}>
            <SecureLogin onLoginSuccess={undefined} />
          </PublicRoute>
        }
      />
      
      <Route
        path="/register"
        element={
          <PublicRoute>
            <Register />
          </PublicRoute>
        }
      />

      <Route
        path="/regulatory-dashboard"
        element={
          <ProtectedRoute requiredPermission="compliance:read" requireSecureAuth={true}>
            <RegulatoryDashboardUnified />
          </ProtectedRoute>
        }
      />  

      {/* ===== NOUVELLES ROUTES API DATA ===== */}
      
      <Route
        path="/api-data"
        element={
          <ProtectedRoute requiredPermission="api:read">
            <APIDataSelectorPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/api-data/selector"
        element={
          <ProtectedRoute requiredPermission="api:read">
            <div className="min-h-screen bg-gray-50">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <Suspense fallback={<LoadingSpinner />}>
                  <APIDataSelector 
                    mode="standalone"
                    onTriangleSelected={(triangleData) => {
                      const params = new URLSearchParams({
                        source: 'api',
                        triangleId: triangleData.id,
                        triangleName: triangleData.name
                      });
                      window.location.href = `/calculations?${params.toString()}`;
                    }}
                  />
                </Suspense>
              </div>
            </div>
          </ProtectedRoute>
        }
      />

      {/* ===== ROUTES DE MIGRATION ===== */}
      
      <Route
        path="/migration/2fa"
        element={
          <ProtectedRoute>
            <Migration2FA />
          </ProtectedRoute>
        }
      />

      <Route
        path="/migration/security-required"
        element={
          <ProtectedRoute>
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
              <div className="bg-white p-8 rounded-lg shadow-lg max-w-md">
                <h1 className="text-xl font-bold text-gray-900 mb-4">
                  Authentification sécurisée requise
                </h1>
                <p className="text-gray-600 mb-6">
                  Cette fonctionnalité nécessite une authentification renforcée avec 2FA.
                </p>
                <div className="space-y-3">
                  <button 
                    onClick={() => window.location.href = '/migration/2fa'}
                    className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700"
                  >
                    Activer la sécurité avancée
                  </button>
                  <button 
                    onClick={() => window.history.back()}
                    className="w-full bg-gray-200 text-gray-800 py-2 px-4 rounded hover:bg-gray-300"
                  >
                    Retour
                  </button>
                </div>
              </div>
            </div>
          </ProtectedRoute>
        }
      />

      {/* ===== ROUTES PROTÉGÉES EXISTANTES ===== */}
      
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/triangles"
        element={
          <ProtectedRoute requiredPermission="triangles:read">
            <TrianglesList />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/data-import"
        element={
          <ProtectedRoute requiredPermission="triangles:write">
            <DataImport />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/calculations"
        element={
          <ProtectedRoute requiredPermission="calculations:read">
            <Calculations />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/ResultsPage"
        element={
          <ProtectedRoute requiredPermission="calculations:read">
            <ResultsPage />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <Reports />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />

      {/* Routes actuaire */}
      <Route
        path="/benchmarking"
        element={
          <ProtectedRoute requiredPermission="triangles:read">
            <Benchmarking />
          </ProtectedRoute>
        }
      />

      <Route
        path="/simulation"
        element={
          <ProtectedRoute requiredPermission="calculations:write">
            <Simulation />
          </ProtectedRoute>
        }
      />

      <Route
        path="/ScenarioSimulation"
        element={
          <ProtectedRoute requiredPermission="calculations:write">
            <ScenarioSimulation />
          </ProtectedRoute>
        }
      />

      {/* Routes de conformité */}
      <Route
        path="/compliance"
        element={
          <ProtectedRoute requiredPermission="compliance:read">
            <RegulatoryCompliancePage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/compliance/test"
        element={
          <ProtectedRoute>
            <ComplianceTestPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/compliance/:calculationId"
        element={
          <ProtectedRoute requiredPermission="compliance:read">
            <RegulatoryCompliancePage />
          </ProtectedRoute>
        }
      />

      {/* ===== ROUTES ADMINISTRATEUR SÉCURISÉES ===== */}
      
      {/* Routes API Management avec permissions */}
      <Route
        path="/api-management"
        element={
          <ProtectedRoute requiredPermission="api:read">
            <APIManagement />
          </ProtectedRoute>
        }
      />

      <Route
        path="/audit"
        element={
          <ProtectedRoute 
            requiredPermission="audit:read"
            requireSecureAuth={true}
          >
            <Audit />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin"
        element={
          <ProtectedRoute 
            requiredRole="ADMIN" 
            requireSecureAuth={true}
          >
            <AdminPanel />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/users"
        element={
          <ProtectedRoute 
            requiredRole="ADMIN" 
            requireSecureAuth={true}
          >
            <AdminPanel />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/security"
        element={
          <ProtectedRoute 
            requiredRole="ADMIN" 
            requireSecureAuth={true}
          >
            <AdminPanel />
          </ProtectedRoute>
        }
      />

      {/* GOUVERNANCE & VALIDATION */}
      <Route
        path="/governance"
        element={
          <ProtectedRoute>
            <WorkflowApprovalSystem />
          </ProtectedRoute>
        }
      />
      
      {/* ===== ROUTES D'ERREUR ET REDIRECTIONS ===== */}
      <Route path="/unauthorized" element={<Unauthorized />} />
      <Route path="/404" element={<NotFound />} />
      <Route path="/results" element={<ResultsPage />} />
      <Route path="/results/:id" element={<ResultsPage />} />

      {/* Redirection par défaut */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      
      {/* Route catch-all pour 404 */}
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
};

// ============ COMPOSANT PRINCIPAL ============
const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <Router>
            <AuthProvider>
              <div className="App">
                <Suspense fallback={<SuspenseFallback />}>
                  <AppRoutes />
                </Suspense>

                {/* Notifications Toast */}
                <Toaster
                  position="top-right"
                  reverseOrder={false}
                  gutter={8}
                  containerClassName=""
                  containerStyle={{}}
                  toastOptions={{
                    duration: 4000,
                    style: {
                      background: '#fff',
                      color: '#374151',
                      border: '1px solid #e5e7eb',
                      borderRadius: '0.5rem',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                    },
                    success: {
                      duration: 3000,
                      iconTheme: {
                        primary: '#10b981',
                        secondary: '#fff',
                      },
                    },
                    error: {
                      duration: 5000,
                      iconTheme: {
                        primary: '#ef4444',
                        secondary: '#fff',
                      },
                    },
                    loading: {
                      duration: Infinity,
                    },
                  }}
                />

                {/* React Query Devtools - uniquement en développement */}
                {process.env.NODE_ENV === 'development' && (
                  <ReactQueryDevtools 
                    initialIsOpen={false} 
                  />
                )}
              </div>
            </AuthProvider>
          </Router>
        </QueryClientProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
};

export default App;