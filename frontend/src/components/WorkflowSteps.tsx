// frontend/src/components/WorkflowSteps.tsx - INTERFACE ÉTAPES DE WORKFLOW
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Database, Calculator, BarChart3, TrendingUp, CheckCircle } from 'lucide-react';

interface Step {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  path: string;
  completed?: boolean;
  current?: boolean;
}

interface WorkflowStepsProps {
  className?: string;
}

const WorkflowSteps: React.FC<WorkflowStepsProps> = ({ className = '' }) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Définir les étapes du workflow
  const steps: Step[] = [
    {
      id: 'import',
      name: 'Importer Données',
      description: 'Charger vos triangles CSV/Excel',
      icon: <Database className="h-5 w-5" />,
      path: '/data-import',
      completed: true, // Simuler des données importées
    },
    {
      id: 'calculate',
      name: 'Lancer Calcul',
      description: 'Appliquer méthodes actuarielles',
      icon: <Calculator className="h-5 w-5" />,
      path: '/triangles',
      completed: true, // Simuler calculs effectués
    },
    {
      id: 'analyze',
      name: 'Analyser',
      description: 'Tests de stress et simulations',
      icon: <BarChart3 className="h-5 w-5" />,
      path: '/simulations',
      completed: false,
    },
    {
      id: 'results',
      name: 'Voir Résultats',
      description: 'Consulter rapports détaillés',
      icon: <TrendingUp className="h-5 w-5" />,
      path: '/results/1', // Exemple avec triangle ID
      completed: false,
    },
  ];

  // Déterminer l'étape courante basée sur l'URL
  const currentPath = location.pathname;
  const currentStep = steps.find(step => 
    currentPath.startsWith(step.path) || 
    (step.path.includes('/results/') && currentPath.includes('/results/'))
  );

  const handleStepClick = (step: Step) => {
    if (step.path.includes('/results/') && step.id === 'results') {
      // Pour "Voir Résultats", utiliser un triangle par défaut ou le dernier utilisé
      navigate('/results/1'); // ou récupérer depuis localStorage/context
    } else {
      navigate(step.path);
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Processus Actuariel</h2>
        <p className="text-sm text-gray-600">Suivez les étapes pour analyser vos données</p>
      </div>
      
      <div className="p-6">
        <nav aria-label="Progress">
          <ol className="space-y-4">
            {steps.map((step, stepIndex) => {
              const isCurrent = currentStep?.id === step.id;
              const isCompleted = step.completed;
              const isClickable = true; // Toutes les étapes sont cliquables
              
              return (
                <li key={step.id}>
                  <div 
                    className={`group cursor-pointer ${isClickable ? 'hover:bg-gray-50' : 'cursor-not-allowed opacity-50'} rounded-lg p-3 transition-colors`}
                    onClick={() => isClickable && handleStepClick(step)}
                  >
                    <div className="flex items-start">
                      <div className="flex-shrink-0">
                        <div className={`
                          flex h-10 w-10 items-center justify-center rounded-full border-2
                          ${isCompleted 
                            ? 'bg-green-600 border-green-600' 
                            : isCurrent 
                              ? 'bg-blue-600 border-blue-600' 
                              : 'bg-white border-gray-300'
                          }
                        `}>
                          {isCompleted ? (
                            <CheckCircle className="h-5 w-5 text-white" />
                          ) : (
                            <div className={`
                              ${isCurrent ? 'text-white' : 'text-gray-400 group-hover:text-gray-600'}
                            `}>
                              {step.icon}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="ml-4 min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <p className={`text-sm font-medium ${
                            isCurrent 
                              ? 'text-blue-600' 
                              : isCompleted 
                                ? 'text-green-600' 
                                : 'text-gray-500 group-hover:text-gray-700'
                          }`}>
                            {step.name}
                          </p>
                          
                          {isCurrent && (
                            <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              Étape courante
                            </span>
                          )}
                          
                          {isCompleted && (
                            <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Terminé
                            </span>
                          )}
                        </div>
                        
                        <p className={`text-sm ${
                          isCurrent 
                            ? 'text-blue-600' 
                            : isCompleted 
                              ? 'text-green-600' 
                              : 'text-gray-500'
                        }`}>
                          {step.description}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Ligne de connexion entre les étapes */}
                  {stepIndex < steps.length - 1 && (
                    <div className="ml-5 mt-2 mb-2">
                      <div className={`w-0.5 h-6 ${
                        isCompleted ? 'bg-green-200' : 'bg-gray-200'
                      }`} />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
      
      {/* Actions rapides */}
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-lg">
        <div className="flex justify-between items-center">
          <p className="text-xs text-gray-600">
            Progression: {steps.filter(s => s.completed).length}/{steps.length} étapes
          </p>
          
          <div className="flex gap-2">
            {/* Bouton étape suivante */}
            {(() => {
              const currentIndex = steps.findIndex(s => s.id === currentStep?.id);
              const nextStep = currentIndex >= 0 ? steps[currentIndex + 1] : steps[0];
              
              if (nextStep) {
                return (
                  <button
                    onClick={() => handleStepClick(nextStep)}
                    className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                  >
                    Suivant: {nextStep.name}
                  </button>
                );
              }
              return null;
            })()}
          </div>
        </div>
        
        {/* Barre de progression */}
        <div className="mt-2">
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div 
              className="bg-green-600 h-1.5 rounded-full transition-all duration-300"
              style={{ 
                width: `${(steps.filter(s => s.completed).length / steps.length) * 100}%` 
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkflowSteps;

