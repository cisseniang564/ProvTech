// frontend/src/pages/SimulationsPage.tsx - PAGE SIMULATIONS FONCTIONNELLE
import React, { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, TrendingUp, AlertTriangle, Settings, BarChart3, Zap, Activity } from 'lucide-react';
import Layout from '../components/common/Layout';
import { useNotifications } from '../context/NotificationContext';

interface SimulationScenario {
  id: string;
  name: string;
  description: string;
  type: 'monte_carlo' | 'stress_test' | 'sensitivity' | 'bootstrap';
  status: 'draft' | 'running' | 'completed' | 'failed';
  triangle_id: string;
  triangle_name: string;
  parameters: Record<string, any>;
  results?: SimulationResults;
  created_at: string;
  duration?: number;
  progress?: number;
}

interface SimulationResults {
  iterations: number;
  mean_ultimate: number;
  std_ultimate: number;
  percentiles: Record<string, number>;
  confidence_intervals: Array<{ level: number; lower: number; upper: number }>;
  risk_metrics: {
    var_95: number;
    var_99: number;
    expected_shortfall_95: number;
    coefficient_of_variation: number;
  };
  distribution_stats: {
    skewness: number;
    kurtosis: number;
    minimum: number;
    maximum: number;
  };
}

const SimulationsPage: React.FC = () => {
  const { success, error: showError } = useNotifications();
  
  const [scenarios, setScenarios] = useState<SimulationScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedScenario, setSelectedScenario] = useState<SimulationScenario | null>(null);
  const [showNewScenario, setShowNewScenario] = useState(false);
  const [newScenario, setNewScenario] = useState({
    name: '',
    description: '',
    type: 'monte_carlo' as const,
    triangle_id: '1',
    iterations: 10000,
    confidence_levels: [75, 90, 95, 99]
  });

  useEffect(() => {
    loadScenarios();
  }, []);

  const loadScenarios = async () => {
    try {
      setLoading(true);
      
      // Simuler des données de scénarios
      const mockScenarios: SimulationScenario[] = [
        {
          id: '1',
          name: 'Monte Carlo Auto 2024',
          description: 'Simulation Monte Carlo pour évaluer l\'incertitude des réserves automobile',
          type: 'monte_carlo',
          status: 'completed',
          triangle_id: '1',
          triangle_name: 'Auto 2024',
          parameters: {
            iterations: 10000,
            confidence_levels: [75, 90, 95, 99],
            seed: 42
          },
          results: {
            iterations: 10000,
            mean_ultimate: 15234567,
            std_ultimate: 892345,
            percentiles: {
              '10': 14123456,
              '25': 14567890,
              '50': 15234567,
              '75': 15890123,
              '90': 16345678
            },
            confidence_intervals: [
              { level: 75, lower: 14567890, upper: 15890123 },
              { level: 90, lower: 14234567, upper: 16234567 },
              { level: 95, lower: 14012345, upper: 16456789 },
              { level: 99, lower: 13678901, upper: 16789123 }
            ],
            risk_metrics: {
              var_95: 16456789,
              var_99: 16789123,
              expected_shortfall_95: 16892345,
              coefficient_of_variation: 0.058
            },
            distribution_stats: {
              skewness: 0.23,
              kurtosis: 3.12,
              minimum: 13456789,
              maximum: 17234567
            }
          },
          created_at: new Date(Date.now() - 3600000).toISOString(),
          duration: 45
        },
        {
          id: '2',
          name: 'Test de Stress RC 2023',
          description: 'Analyse de sensibilité aux variations des facteurs de développement',
          type: 'stress_test',
          status: 'completed',
          triangle_id: '2',
          triangle_name: 'RC 2023',
          parameters: {
            stress_factors: [-20, -10, 10, 20],
            variables: ['development_factors', 'loss_ratios']
          },
          created_at: new Date(Date.now() - 7200000).toISOString(),
          duration: 12
        },
        {
          id: '3',
          name: 'Sensibilité Construction',
          description: 'Analyse de sensibilité paramètres clés',
          type: 'sensitivity',
          status: 'running',
          triangle_id: '3',
          triangle_name: 'Construction 2024',
          parameters: {
            variables: ['ultimate_loss_ratio', 'trend_factor'],
            ranges: { ultimate_loss_ratio: [0.6, 1.2], trend_factor: [0.95, 1.05] }
          },
          created_at: new Date(Date.now() - 300000).toISOString(),
          progress: 67
        }
      ];

      setTimeout(() => {
        setScenarios(mockScenarios);
        setLoading(false);
      }, 800);

    } catch (error) {
      console.error('Erreur chargement simulations:', error);
      setLoading(false);
    }
  };

  const runSimulation = async (scenario: SimulationScenario) => {
    try {
      // Mettre à jour le statut
      const updatedScenarios = scenarios.map(s => 
        s.id === scenario.id ? { ...s, status: 'running' as const, progress: 0 } : s
      );
      setScenarios(updatedScenarios);
      
      success('Simulation lancée', `${scenario.name} - Calcul en cours...`);
      
      // Simuler la progression
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress += Math.random() * 15 + 5; // 5-20% par step
        if (progress > 100) progress = 100;
        
        setScenarios(prev => prev.map(s => 
          s.id === scenario.id ? { ...s, progress: Math.round(progress) } : s
        ));
        
        if (progress >= 100) {
          clearInterval(progressInterval);
          // Marquer comme complété
          setTimeout(() => {
            setScenarios(prev => prev.map(s => 
              s.id === scenario.id ? { ...s, status: 'completed' as const, progress: undefined } : s
            ));
            success('Simulation terminée', `${scenario.name} - Résultats disponibles`);
          }, 1000);
        }
      }, 1000);
      
    } catch (error) {
      showError('Erreur simulation', 'Impossible de lancer la simulation');
    }
  };

  const createScenario = async () => {
    if (!newScenario.name.trim()) {
      showError('Erreur', 'Le nom du scénario est obligatoire');
      return;
    }

    const scenario: SimulationScenario = {
      id: Date.now().toString(),
      name: newScenario.name,
      description: newScenario.description,
      type: newScenario.type,
      status: 'draft',
      triangle_id: newScenario.triangle_id,
      triangle_name: `Triangle ${newScenario.triangle_id}`,
      parameters: {
        iterations: newScenario.iterations,
        confidence_levels: newScenario.confidence_levels
      },
      created_at: new Date().toISOString()
    };

    setScenarios([scenario, ...scenarios]);
    setShowNewScenario(false);
    setNewScenario({
      name: '',
      description: '',
      type: 'monte_carlo',
      triangle_id: '1',
      iterations: 10000,
      confidence_levels: [75, 90, 95, 99]
    });

    success('Scénario créé', 'Nouveau scénario ajouté avec succès');
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'monte_carlo':
        return <Activity className="h-5 w-5 text-blue-600" />;
      case 'stress_test':
        return <AlertTriangle className="h-5 w-5 text-red-600" />;
      case 'sensitivity':
        return <TrendingUp className="h-5 w-5 text-green-600" />;
      case 'bootstrap':
        return <RotateCcw className="h-5 w-5 text-purple-600" />;
      default:
        return <BarChart3 className="h-5 w-5 text-gray-600" />;
    }
  };

  const getTypeName = (type: string) => {
    const types = {
      monte_carlo: 'Monte Carlo',
      stress_test: 'Test de Stress',
      sensitivity: 'Analyse de Sensibilité',
      bootstrap: 'Bootstrap'
    };
    return types[type as keyof typeof types] || type;
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      draft: 'bg-gray-100 text-gray-800',
      running: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800'
    };
    return styles[status as keyof typeof styles] || 'bg-gray-100 text-gray-800';
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Chargement des simulations...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Zap className="h-8 w-8 text-purple-600" />
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">⚡ Simulations</h1>
                  <p className="text-sm text-gray-500 mt-1">
                    Analyses prospectives et tests de stress • {scenarios.length} scénario(s)
                  </p>
                </div>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowNewScenario(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
                >
                  <Play className="h-4 w-4" />
                  Nouveau Scénario
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Grille des scénarios */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Liste des scénarios */}
          <div className="lg:col-span-2">
            <div className="space-y-4">
              {scenarios.map((scenario) => (
                <div
                  key={scenario.id}
                  className={`bg-white rounded-lg shadow border-2 cursor-pointer transition-colors ${
                    selectedScenario?.id === scenario.id ? 'border-purple-600' : 'border-transparent hover:border-gray-200'
                  }`}
                  onClick={() => setSelectedScenario(scenario)}
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        {getTypeIcon(scenario.type)}
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">{scenario.name}</h3>
                          <p className="text-sm text-gray-600">{scenario.description}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusBadge(scenario.status)}`}>
                          {scenario.status}
                        </span>
                        {scenario.status === 'draft' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              runSimulation(scenario);
                            }}
                            className="p-2 text-green-600 hover:bg-green-50 rounded"
                            title="Lancer la simulation"
                          >
                            <Play className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm text-gray-600">
                      <div className="flex items-center gap-4">
                        <span>Type: {getTypeName(scenario.type)}</span>
                        <span>Triangle: {scenario.triangle_name}</span>
                      </div>
                      <span>{new Date(scenario.created_at).toLocaleDateString('fr-FR')}</span>
                    </div>
                    
                    {scenario.status === 'running' && scenario.progress !== undefined && (
                      <div className="mt-4">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span>Progression</span>
                          <span>{scenario.progress}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-purple-600 h-2 rounded-full transition-all duration-1000"
                            style={{ width: `${scenario.progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                    
                    {scenario.results && (
                      <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Ultimate moyen</p>
                          <p className="font-semibold">{formatCurrency(scenario.results.mean_ultimate)}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Écart-type</p>
                          <p className="font-semibold">{formatCurrency(scenario.results.std_ultimate)}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">CV</p>
                          <p className="font-semibold">{(scenario.results.risk_metrics.coefficient_of_variation * 100).toFixed(1)}%</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {scenarios.length === 0 && (
                <div className="bg-white rounded-lg shadow p-12 text-center">
                  <Zap className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Aucune simulation</h3>
                  <p className="text-gray-600 mb-6">
                    Créez votre premier scénario de simulation pour analyser les risques.
                  </p>
                  <button
                    onClick={() => setShowNewScenario(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
                  >
                    <Play className="h-4 w-4" />
                    Nouveau Scénario
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Détails du scénario sélectionné */}
          <div className="lg:col-span-1">
            {selectedScenario ? (
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center gap-3 mb-4">
                  {getTypeIcon(selectedScenario.type)}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{selectedScenario.name}</h3>
                    <p className="text-sm text-gray-600">{getTypeName(selectedScenario.type)}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {selectedScenario.results ? (
                    <>
                      <div>
                        <h4 className="text-md font-medium text-gray-900 mb-2">Résultats principaux</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Ultimate moyen</span>
                            <span className="font-semibold">{formatCurrency(selectedScenario.results.mean_ultimate)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Écart-type</span>
                            <span className="font-semibold">{formatCurrency(selectedScenario.results.std_ultimate)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">VaR 95%</span>
                            <span className="font-semibold">{formatCurrency(selectedScenario.results.risk_metrics.var_95)}</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-md font-medium text-gray-900 mb-2">Percentiles</h4>
                        <div className="space-y-1 text-sm">
                          {Object.entries(selectedScenario.results.percentiles).map(([percentile, value]) => (
                            <div key={percentile} className="flex justify-between">
                              <span className="text-gray-600">P{percentile}</span>
                              <span className="font-mono">{formatCurrency(value)}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h4 className="text-md font-medium text-gray-900 mb-2">Intervalles de confiance</h4>
                        <div className="space-y-1 text-sm">
                          {selectedScenario.results.confidence_intervals.map((ci) => (
                            <div key={ci.level} className="flex justify-between">
                              <span className="text-gray-600">{ci.level}%</span>
                              <span className="font-mono text-xs">
                                [{formatCurrency(ci.lower)} - {formatCurrency(ci.upper)}]
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <Settings className="h-8 w-8 mx-auto mb-2" />
                      <p className="text-sm">Lancez la simulation pour voir les résultats</p>
                    </div>
                  )}

                  <div>
                    <h4 className="text-md font-medium text-gray-900 mb-2">Paramètres</h4>
                    <div className="text-sm space-y-1">
                      {Object.entries(selectedScenario.parameters).map(([key, value]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-gray-600 capitalize">{key.replace('_', ' ')}</span>
                          <span className="font-mono text-xs">
                            {Array.isArray(value) ? value.join(', ') : String(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow p-12 text-center">
                <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Sélectionnez un scénario</h3>
                <p className="text-gray-600">
                  Choisissez un scénario pour voir ses détails et résultats.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Modal nouveau scénario */}
        {showNewScenario && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">Nouveau Scénario</h3>
                <button
                  onClick={() => setShowNewScenario(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
                >
                  &times;
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
                  <input
                    type="text"
                    value={newScenario.name}
                    onChange={(e) => setNewScenario(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    placeholder="Nom du scénario"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={newScenario.description}
                    onChange={(e) => setNewScenario(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    rows={2}
                    placeholder="Description du scénario"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    value={newScenario.type}
                    onChange={(e) => setNewScenario(prev => ({ ...prev, type: e.target.value as any }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  >
                    <option value="monte_carlo">Monte Carlo</option>
                    <option value="stress_test">Test de Stress</option>
                    <option value="sensitivity">Analyse de Sensibilité</option>
                    <option value="bootstrap">Bootstrap</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre d'itérations</label>
                  <input
                    type="number"
                    value={newScenario.iterations}
                    onChange={(e) => setNewScenario(prev => ({ ...prev, iterations: parseInt(e.target.value) }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    min={1000}
                    step={1000}
                  />
                </div>
              </div>
              
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setShowNewScenario(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  onClick={createScenario}
                  className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
                >
                  Créer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default SimulationsPage;