// ===================================
// POINT D'ENTRÉE REACT
// ===================================

import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import App from './App';

// Performance monitoring
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

// ============ PERFORMANCE MONITORING ============
const sendToAnalytics = (metric: any) => {
  // En production, envoyer les métriques à votre service d'analytics
  if (process.env.NODE_ENV === 'production') {
    console.log('Performance metric:', metric);
    // Exemple: analytics.track('Web Vital', metric);
  }
};

// Mesurer les Core Web Vitals
getCLS(sendToAnalytics);
getFID(sendToAnalytics);
getFCP(sendToAnalytics);
getLCP(sendToAnalytics);
getTTFB(sendToAnalytics);

// ============ ERROR HANDLING GLOBAL ============
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  
  // En production, envoyer à un service de monitoring d'erreurs
  if (process.env.NODE_ENV === 'production') {
    // Exemple: Sentry.captureException(event.error);
  }
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  
  // En production, envoyer à un service de monitoring d'erreurs
  if (process.env.NODE_ENV === 'production') {
    // Exemple: Sentry.captureException(event.reason);
  }
});

// ============ INITIALISATION DE L'APP ============
const container = document.getElementById('root');

if (!container) {
  throw new Error('Root element not found');
}

const root = createRoot(container);

// Mode strict uniquement en développement
const AppWithStrictMode = process.env.NODE_ENV === 'development' 
  ? () => (
      <React.StrictMode>
        <App />
      </React.StrictMode>
    )
  : App;

root.render(<AppWithStrictMode />);

// ============ HOT MODULE REPLACEMENT ============
if (process.env.NODE_ENV === 'development' && (module as any).hot) {
  (module as any).hot.accept('./App', () => {
    const NextApp = require('./App').default;
    root.render(<NextApp />);
  });
}