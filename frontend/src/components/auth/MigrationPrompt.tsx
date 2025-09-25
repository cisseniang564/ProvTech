import React, { useState } from 'react';
import { Shield, ArrowRight, Lock, X } from 'lucide-react';

interface MigrationPromptProps {
  onMigrate?: () => void;
  onDismiss?: () => void;
}

const MigrationPrompt = ({ onMigrate, onDismiss }: MigrationPromptProps) => {
  const [showDetails, setShowDetails] = useState(false);

  const handleMigrate = () => {
    if (onMigrate) {
      onMigrate();
    } else {
      // Fallback - redirection simple
      window.location.href = '/migration/2fa';
    }
  };

  const handleDismiss = () => {
    if (onDismiss) {
      onDismiss();
    } else {
      // Fallback - cacher via sessionStorage
      sessionStorage.setItem('migration_prompt_dismissed', 'true');
      // Recharger la page pour cacher le composant
      window.location.reload();
    }
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6 mx-4">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <Shield className="h-6 w-6 text-blue-600" />
        </div>
        <div className="ml-3 flex-1">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-blue-800">
              Sécurisez votre compte ProvTech
            </h3>
            <button
              onClick={handleDismiss}
              className="text-blue-400 hover:text-blue-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 text-sm text-blue-700">
            <p>
              Votre compte peut maintenant bénéficier de fonctionnalités de sécurité avancées :
              authentification 2FA, audit trail et permissions granulaires.
            </p>
          </div>
          
          {showDetails && (
            <div className="mt-4 bg-white rounded-md p-4">
              <h4 className="font-medium text-gray-900 mb-2">Nouveautés disponibles :</h4>
              <ul className="text-sm text-gray-700 space-y-1">
                <li className="flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  Authentification à deux facteurs (2FA)
                </li>
                <li className="flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  Logs d'audit de vos actions
                </li>
                <li className="flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  Permissions détaillées par portefeuille
                </li>
                <li className="flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  Dashboard sécurisé avec workflows de validation
                </li>
              </ul>
              <div className="mt-3 p-2 bg-yellow-50 rounded">
                <p className="text-xs text-yellow-700 flex items-center">
                  <Lock className="w-3 h-3 mr-1" />
                  Votre mot de passe actuel reste inchangé
                </p>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <button
              onClick={handleMigrate}
              className="flex items-center justify-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
            >
              Activer la sécurité avancée
              <ArrowRight className="ml-2 h-4 w-4" />
            </button>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="px-4 py-2 bg-white text-blue-600 text-sm font-medium rounded-md border border-blue-300 hover:bg-blue-50 transition-colors"
            >
              {showDetails ? 'Masquer' : 'En savoir plus'}
            </button>
            <button
              onClick={handleDismiss}
              className="px-4 py-2 text-blue-600 text-sm font-medium hover:text-blue-500 transition-colors"
            >
              Plus tard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MigrationPrompt;