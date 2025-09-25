// ===================================
// ERROR BOUNDARY - GESTION DES ERREURS
// ===================================

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ExclamationTriangleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

// ============ TYPES ============
interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string;
}

// ============ ERROR BOUNDARY CLASS ============
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
    };
  }

  // ============ CAPTURE DES ERREURS ============
  static getDerivedStateFromError(error: Error): Partial<State> {
    // Générer un ID unique pour l'erreur
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      hasError: true,
      error,
      errorId,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo,
    });

    // Log de l'erreur
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // En production, envoyer à un service de monitoring
    if (process.env.NODE_ENV === 'production') {
      this.logErrorToService(error, errorInfo);
    }
  }

  // ============ LOGGING DES ERREURS ============
  private logErrorToService = (error: Error, errorInfo: ErrorInfo) => {
    try {
      // Préparer les données d'erreur
      const errorData = {
        id: this.state.errorId,
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        userId: this.getCurrentUserId(),
      };

      // Envoyer à votre service de monitoring (Sentry, LogRocket, etc.)
      console.log('Error data to be sent:', errorData);
      
      // Exemple avec fetch
      // fetch('/api/errors', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(errorData),
      // });
    } catch (loggingError) {
      console.error('Failed to log error:', loggingError);
    }
  };

  private getCurrentUserId = (): string | null => {
    try {
      // Récupérer l'ID utilisateur du localStorage ou context
      const token = localStorage.getItem('provtech_token');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.sub || payload.user_id || null;
      }
    } catch {
      // Ignorer les erreurs de parsing
    }
    return null;
  };

  // ============ ACTIONS ============
  private handleReload = () => {
    window.location.reload();
  };

  private handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
    });
  };

  private handleReportError = () => {
    const { error, errorInfo, errorId } = this.state;
    
    const subject = encodeURIComponent(`Erreur ProvTech - ${errorId}`);
    const body = encodeURIComponent(`
Bonjour,

Une erreur s'est produite dans l'application ProvTech.

ID de l'erreur: ${errorId}
Heure: ${new Date().toLocaleString()}
URL: ${window.location.href}

Message d'erreur:
${error?.message}

Stack trace:
${error?.stack}

Informations sur le composant:
${errorInfo?.componentStack}

Merci de votre attention.
    `);

    window.open(`mailto:support@provtech.com?subject=${subject}&body=${body}`);
  };

  // ============ RENDU ============
  render() {
    if (this.state.hasError) {
      // Fallback personnalisé
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Interface d'erreur par défaut
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
          <div className="sm:mx-auto sm:w-full sm:max-w-md">
            <div className="bg-white py-8 px-4 shadow-lg sm:rounded-lg sm:px-10">
              {/* Icône d'erreur */}
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-6">
                <ExclamationTriangleIcon className="h-8 w-8 text-red-600" />
              </div>

              {/* Message principal */}
              <div className="text-center">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                  Oups ! Une erreur s'est produite
                </h1>
                <p className="text-gray-600 mb-6">
                  Nous nous excusons pour la gêne occasionnée. Notre équipe a été notifiée de ce problème.
                </p>

                {/* ID de l'erreur */}
                <div className="bg-gray-50 rounded-lg p-3 mb-6">
                  <p className="text-xs text-gray-500 mb-1">ID de l'erreur</p>
                  <code className="text-sm font-mono text-gray-800">
                    {this.state.errorId}
                  </code>
                </div>

                {/* Actions */}
                <div className="space-y-3">
                  <button
                    onClick={this.handleRetry}
                    className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
                  >
                    <ArrowPathIcon className="h-4 w-4 mr-2" />
                    Réessayer
                  </button>

                  <button
                    onClick={this.handleReload}
                    className="w-full flex justify-center items-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
                  >
                    Recharger la page
                  </button>

                  <button
                    onClick={this.handleReportError}
                    className="w-full flex justify-center items-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
                  >
                    Signaler le problème
                  </button>
                </div>

                {/* Détails techniques en développement */}
                {process.env.NODE_ENV === 'development' && this.state.error && (
                  <details className="mt-6 text-left">
                    <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                      Détails techniques
                    </summary>
                    <div className="mt-2 p-3 bg-red-50 rounded-md">
                      <div className="text-sm">
                        <p className="font-medium text-red-800 mb-2">
                          {this.state.error.message}
                        </p>
                        <pre className="text-xs text-red-700 overflow-auto whitespace-pre-wrap">
                          {this.state.error.stack}
                        </pre>
                        {this.state.errorInfo && (
                          <div className="mt-4">
                            <p className="font-medium text-red-800 mb-2">
                              Component Stack:
                            </p>
                            <pre className="text-xs text-red-700 overflow-auto whitespace-pre-wrap">
                              {this.state.errorInfo.componentStack}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  </details>
                )}

                {/* Liens utiles */}
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <p className="text-xs text-gray-500 text-center">
                    Besoin d'aide ?{' '}
                    <a
                      href="mailto:support@provtech.com"
                      className="text-primary-600 hover:text-primary-500"
                    >
                      Contactez le support
                    </a>
                    {' '}ou{' '}
                    <a
                      href="/help"
                      className="text-primary-600 hover:text-primary-500"
                    >
                      consultez la documentation
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;