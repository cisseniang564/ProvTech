// 📁 Racine: frontend/src/
// └── App.tsx

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'react-hot-toast';

// Context Providers
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { NotificationProvider } from './context/NotificationContext';

// Layout Components
import Layout from './components/common/Layout';
import PrivateRoute from './components/common/PrivateRoute';
import ErrorBoundary from './components/common/ErrorBoundary';

// Pages
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import DataImport from './pages/DataImport';
import Triangles from './pages/Triangles';
import Calculations from './pages/Calculations';
import Results from './pages/Results';
import Reports from './pages/Reports';
import Benchmarking from './pages/Benchmarking';
import Audit from './pages/Audit';
import Simulation from './pages/Simulation';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';
import Unauthorized from './pages/Unauthorized';

// Configuration React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider>
            <NotificationProvider>
              <Router>
                <Routes>
                  {/* Routes publiques */}
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/unauthorized" element={<Unauthorized />} />
                  
                  {/* Routes protégées avec Layout */}
                  <Route
                    path="/"
                    element={
                      <PrivateRoute>
                        <Layout />
                      </PrivateRoute>
                    }
                  >
                    <Route index element={<Navigate to="/dashboard" replace />} />
                    <Route path="dashboard" element={<Dashboard />} />
                    
                    {/* Gestion des données */}
                    <Route path="data">
                      <Route path="import" element={<DataImport />} />
                      <Route path="triangles" element={<Triangles />} />
                      <Route path="triangles/:id" element={<Triangles />} />
                    </Route>
                    
                    {/* Calculs */}
                    <Route path="calculations">
                      <Route index element={<Calculations />} />
                      <Route path="new" element={<Calculations />} />
                      <Route path=":id" element={<Results />} />
                      <Route path="comparison" element={<Results />} />
                    </Route>
                    
                    {/* Rapports et conformité */}
                    <Route path="reports">
                      <Route index element={<Reports />} />
                      <Route path="ifrs17" element={<Reports />} />
                      <Route path="solvency2" element={<Reports />} />
                      <Route path="custom" element={<Reports />} />
                    </Route>
                    
                    {/* Analyses avancées */}
                    <Route path="benchmarking" element={<Benchmarking />} />
                    <Route path="simulation" element={<Simulation />} />
                    <Route path="audit" element={<Audit />} />
                    
                    {/* Paramètres */}
                    <Route path="settings">
                      <Route index element={<Settings />} />
                      <Route path="profile" element={<Settings />} />
                      <Route path="company" element={<Settings />} />
                      <Route path="users" element={<Settings />} />
                      <Route path="api" element={<Settings />} />
                    </Route>
                  </Route>
                  
                  {/* 404 */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Router>
              
              {/* Notifications Toast */}
              <Toaster
                position="top-right"
                toastOptions={{
                  duration: 4000,
                  style: {
                    background: '#363636',
                    color: '#fff',
                  },
                  success: {
                    iconTheme: {
                      primary: '#10B981',
                      secondary: '#fff',
                    },
                  },
                  error: {
                    iconTheme: {
                      primary: '#EF4444',
                      secondary: '#fff',
                    },
                  },
                }}
              />
              
              {/* React Query Devtools (dev only) */}
              {process.env.NODE_ENV === 'development' && (
                <ReactQueryDevtools initialIsOpen={false} />
              )}
            </NotificationProvider>
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;