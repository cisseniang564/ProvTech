// pages/ComplianceTestPage.tsx
// Page de test pour le centre de conformité avec différents scénarios

import React, { useState } from 'react';
import RegulatoryCompliancePanel from './RegulatoryCompliancePanel';
import testData, { validateTestData } from './testData';
import { Shield, CheckCircle, AlertTriangle, AlertCircle, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ComplianceTestPage: React.FC = () => {
  const navigate = useNavigate();
  const [currentTestSet, setCurrentTestSet] = useState('comprehensive');
  
  // Différents jeux de données pour tester différents scénarios
  const testSets = {
    comprehensive: {
      name: 'Données Complètes',
      description: 'Assureur en bonne santé financière',
      color: 'blue',
      data: testData.props
    },
    
    stressed: {
      name: 'Situation Tendue',
      description: 'Ratios de solvabilité proches des seuils',
      color: 'yellow',
      data: {
        ...testData.props,
        extendedKPI: {
          ...testData.kpi,
          combinedRatio: 108.5,
          solvencyMetrics: {
            ...testData.kpi.solvencyMetrics,
            scrRatio: 115.2, // Proche du seuil
            mcrRatio: 167.8
          }
        }
      }
    },
    
    problematic: {
      name: 'Situation Problématique',
      description: 'Ratios en dessous des seuils réglementaires',
      color: 'red',
      data: {
        ...testData.props,
        extendedKPI: {
          ...testData.kpi,
          combinedRatio: 125.8,
          solvencyMetrics: {
            ...testData.kpi.solvencyMetrics,
            scrRatio: 92.4, // En dessous de 100%
            mcrRatio: 142.1
          }
        }
      }
    },

    optimistic: {
      name: 'Situation Excellente',
      description: 'Performance supérieure aux attentes',
      color: 'green',
      data: {
        ...testData.props,
        extendedKPI: {
          ...testData.kpi,
          combinedRatio: 87.2,
          solvencyMetrics: {
            ...testData.kpi.solvencyMetrics,
            scrRatio: 225.8,
            mcrRatio: 387.4
          }
        }
      }
    }
  };

  // Validation des données de test
  const validationResults = validateTestData();
  const allTestsPassed = validationResults.every(check => check.passed);

  const getColorClasses = (color: string) => {
    const colors = {
      blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800' },
      yellow: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800' },
      red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800' },
      green: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800' }
    };
    return colors[color as keyof typeof colors] || colors.blue;
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header de test */}
      <div className="bg-white shadow-sm border-b border-gray-200 p-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour au Dashboard
            </button>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <Shield className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Test - Centre de Conformité Réglementaire
              </h1>
              <p className="text-sm text-gray-600">
                Environnement de test avec données simulées IFRS 17 & Solvency II
              </p>
            </div>
          </div>
          
          {/* Sélecteur de scénario de test */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            {Object.entries(testSets).map(([key, set]) => {
              const colorClasses = getColorClasses(set.color);
              const isActive = currentTestSet === key;
              
              return (
                <button
                  key={key}
                  onClick={() => setCurrentTestSet(key)}
                  className={`p-3 rounded-lg border-2 transition-all text-left ${
                    isActive 
                      ? `${colorClasses.bg} ${colorClasses.border} ${colorClasses.text}` 
                      : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium text-sm">{set.name}</div>
                  <div className="text-xs mt-1">{set.description}</div>
                  <div className="text-xs mt-2">
                    SCR: {set.data.extendedKPI.solvencyMetrics.scrRatio}% | 
                    CR: {set.data.extendedKPI.combinedRatio}%
                  </div>
                </button>
              );
            })}
          </div>

          {/* Statut de validation des données */}
          <div className={`p-3 rounded-lg ${allTestsPassed ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <div className={`text-sm font-medium flex items-center gap-2 ${allTestsPassed ? 'text-green-800' : 'text-red-800'}`}>
              {allTestsPassed ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              Validation des données de test: {allTestsPassed ? 'Toutes les vérifications passées' : 'Erreurs détectées'}
            </div>
            {!allTestsPassed && (
              <div className="mt-2 space-y-1">
                {validationResults.filter(check => !check.passed).map((check, index) => (
                  <div key={index} className="text-xs text-red-700 flex items-center gap-2">
                    <AlertTriangle className="h-3 w-3" />
                    {check.name}: {check.details}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Résumé des données de test */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="bg-blue-50 p-3 rounded border border-blue-200">
              <div className="text-xs text-blue-600">Ultimate Claims</div>
              <div className="text-lg font-bold text-blue-900">
                {(testData.result.summary.ultimate / 1000000).toFixed(1)}M€
              </div>
            </div>
            <div className="bg-green-50 p-3 rounded border border-green-200">
              <div className="text-xs text-green-600">Combined Ratio</div>
              <div className="text-lg font-bold text-green-900">
                {testSets[currentTestSet as keyof typeof testSets].data.extendedKPI.combinedRatio}%
              </div>
            </div>
            <div className="bg-purple-50 p-3 rounded border border-purple-200">
              <div className="text-xs text-purple-600">SCR Ratio</div>
              <div className="text-lg font-bold text-purple-900">
                {testSets[currentTestSet as keyof typeof testSets].data.extendedKPI.solvencyMetrics.scrRatio}%
              </div>
            </div>
            <div className="bg-orange-50 p-3 rounded border border-orange-200">
              <div className="text-xs text-orange-600">Réserves</div>
              <div className="text-lg font-bold text-orange-900">
                {(testData.result.summary.outstanding / 1000000).toFixed(1)}M€
              </div>
            </div>
            <div className="bg-indigo-50 p-3 rounded border border-indigo-200">
              <div className="text-xs text-indigo-600">MCR Ratio</div>
              <div className="text-lg font-bold text-indigo-900">
                {testSets[currentTestSet as keyof typeof testSets].data.extendedKPI.solvencyMetrics.mcrRatio}%
              </div>
            </div>
          </div>

          {/* Instructions d'utilisation */}
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-blue-900 mb-2">Instructions de test</h3>
            <div className="text-xs text-blue-800 space-y-1">
              <div>• Sélectionnez un scénario ci-dessus pour voir les différents états du système</div>
              <div>• Naviguez entre les onglets pour tester IFRS 17, Solvency II, Scénarios et Audit</div>
              <div>• Les données sont simulées mais cohérentes pour valider les calculs réglementaires</div>
              <div>• Utilisez les curseurs et paramètres interactifs pour tester la réactivité</div>
            </div>
          </div>
        </div>
      </div>

      {/* Composant principal */}
      <RegulatoryCompliancePanel 
        {...testSets[currentTestSet as keyof typeof testSets].data}
      />
    </div>
  );
};

export default ComplianceTestPage;