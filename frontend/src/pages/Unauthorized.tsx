import React from 'react';
import { 
  AlertCircle, 
  Home, 
  ArrowLeft, 
  Search,
  Shield,
  Lock,
  FileQuestion,
  XCircle
} from 'lucide-react';

// Page 404 - Not Found
export const NotFound: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="mb-6">
            <div className="mx-auto w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center">
              <FileQuestion className="w-12 h-12 text-blue-600" />
            </div>
          </div>
          
          <h1 className="text-6xl font-bold text-gray-900 mb-2">404</h1>
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            Page Non Trouvée
          </h2>
          
          <p className="text-gray-600 mb-8">
            Désolé, la page que vous recherchez n'existe pas ou a été déplacée.
            Vérifiez l'URL ou retournez à l'accueil.
          </p>

          <div className="space-y-3">
            <button 
              onClick={() => window.history.back()}
              className="w-full px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Retour
            </button>
            
            <button 
              onClick={() => window.location.href = '/'}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <Home className="w-4 h-4" />
              Accueil
            </button>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-500 mb-3">Pages fréquemment visitées :</p>
            <div className="flex flex-wrap gap-2 justify-center">
              <a href="/dashboard" className="text-sm text-blue-600 hover:text-blue-700">Dashboard</a>
              <span className="text-gray-300">•</span>
              <a href="/calculations" className="text-sm text-blue-600 hover:text-blue-700">Calculs</a>
              <span className="text-gray-300">•</span>
              <a href="/reports" className="text-sm text-blue-600 hover:text-blue-700">Rapports</a>
              <span className="text-gray-300">•</span>
              <a href="/help" className="text-sm text-blue-600 hover:text-blue-700">Aide</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


// Page 403 - Unauthorized
export const Unauthorized: React.FC = () => {
  const [showDetails, setShowDetails] = React.useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-6">
            <div className="mx-auto w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <Lock className="w-12 h-12 text-red-600" />
            </div>
            
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Accès Refusé
            </h1>
            <p className="text-gray-600">
              Vous n'avez pas les permissions nécessaires pour accéder à cette ressource.
            </p>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-900">
                  Autorisation insuffisante
                </p>
                <p className="text-sm text-red-700 mt-1">
                  Cette section nécessite des droits d'administration ou des permissions spécifiques.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowDetails(!showDetails)}
            className="w-full text-left text-sm text-gray-600 hover:text-gray-900 mb-4 flex items-center justify-between"
          >
            <span>Pourquoi ce message apparaît-il ?</span>
            <span className="text-xs">{showDetails ? '▼' : '▶'}</span>
          </button>

          {showDetails && (
            <div className="bg-gray-50 rounded-lg p-4 mb-6 text-sm text-gray-600 space-y-2">
              <p>• Vos permissions actuelles ne permettent pas cet accès</p>
              <p>• La ressource demandée nécessite un niveau d'autorisation supérieur</p>
              <p>• Votre session a peut-être expiré</p>
              <p>• Contactez votre administrateur pour obtenir les droits nécessaires</p>
            </div>
          )}

          <div className="space-y-3">
            <button 
              onClick={() => window.history.back()}
              className="w-full px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Retour à la page précédente
            </button>
            
            <button 
              onClick={() => window.location.href = '/'}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <Home className="w-4 h-4" />
              Retour à l'accueil
            </button>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-200 text-center">
            <p className="text-xs text-gray-500">
              Code d'erreur : 403 | ID de session : {Math.random().toString(36).substr(2, 9)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Composant combiné pour l'export
const ErrorPages: React.FC<{ type?: '404' | '403' }> = ({ type = '404' }) => {
  return type === '404' ? <NotFound /> : <Unauthorized />;
};

export default ErrorPages;