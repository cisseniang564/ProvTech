import React, { useState } from 'react';
import {
  Zap,
  TrendingUp,
  TrendingDown,
  Activity,
  AlertTriangle,
  BarChart3,
  Sliders,
  Play,
  Pause,
  RefreshCw,
  Download,
  Settings,
  Info,
  ChevronRight,
  ChevronDown,
  Target,
  Percent,
  DollarSign,
  Clock,
  Layers,
  GitBranch,
  Shuffle,
  Filter,
  PieChart,
  LineChart,
  CheckCircle,
  XCircle,
  AlertCircle,
  Plus,
  Minus,
  Copy,
  Save,
  FileText,
  Gauge,
  Cpu,
  Cloud,
  Umbrella,
  Sun,
  CloudRain
} from 'lucide-react';

interface Scenario {
  id: string;
  name: string;
  description: string;
  type: 'optimistic' | 'realistic' | 'pessimistic' | 'stress' | 'custom';
  probability: number;
  parameters: ScenarioParameter[];
  results?: ScenarioResults;
  icon: any;
  color: string;
}

interface ScenarioParameter {
  id: string;
  name: string;
  baseValue: number;
  scenarioValue: number;
  unit: string;
  impact: number;
}

interface ScenarioResults {
  reserves: number;
  reserveChange: number;
  ultimateLoss: number;
  confidenceInterval: { low: number; high: number };
  probabilityOfAdequacy: number;
  var95: number;
  tvar95: number;
}

interface SimulationConfig {
  method: string;
  iterations: number;
  confidenceLevel: number;
  timeHorizon: number;
  distributionType: string;
  correlationMatrix: boolean;
  seedValue?: number;
}

interface StressTest {
  name: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'extreme';
  impact: number;
  probability: number;
}

const ScenarioSimulation: React.FC = () => {
  const [activeTab, setActiveTab] = useState('scenarios');
  const [selectedScenario, setSelectedScenario] = useState('realistic');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationProgress, setSimulationProgress] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  const [simulationConfig, setSimulationConfig] = useState<SimulationConfig>({
    method: 'monteCarlo',
    iterations: 10000,
    confidenceLevel: 95,
    timeHorizon: 12,
    distributionType: 'lognormal',
    correlationMatrix: true,
    seedValue: undefined
  });

  const scenarios: Scenario[] = [
    {
      id: 'optimistic',
      name: 'Scénario Optimiste',
      description: 'Conditions favorables avec sinistralité faible',
      type: 'optimistic',
      probability: 20,
      icon: Sun,
      color: 'green',
      parameters: [
        { id: 'frequency', name: 'Fréquence sinistres', baseValue: 100, scenarioValue: 85, unit: '%', impact: -15 },
        { id: 'severity', name: 'Sévérité moyenne', baseValue: 100, scenarioValue: 90, unit: '%', impact: -10 },
        { id: 'inflation', name: 'Inflation', baseValue: 2.0, scenarioValue: 1.5, unit: '%', impact: -0.5 },
        { id: 'development', name: 'Facteur développement', baseValue: 1.45, scenarioValue: 1.38, unit: '', impact: -0.07 }
      ],
      results: {
        reserves: 3200000,
        reserveChange: -15.5,
        ultimateLoss: 13800000,
        confidenceInterval: { low: 2900000, high: 3500000 },
        probabilityOfAdequacy: 92,
        var95: 3450000,
        tvar95: 3580000
      }
    },
    {
      id: 'realistic',
      name: 'Scénario Réaliste',
      description: 'Projection basée sur les tendances actuelles',
      type: 'realistic',
      probability: 50,
      icon: Cloud,
      color: 'blue',
      parameters: [
        { id: 'frequency', name: 'Fréquence sinistres', baseValue: 100, scenarioValue: 100, unit: '%', impact: 0 },
        { id: 'severity', name: 'Sévérité moyenne', baseValue: 100, scenarioValue: 102, unit: '%', impact: 2 },
        { id: 'inflation', name: 'Inflation', baseValue: 2.0, scenarioValue: 2.0, unit: '%', impact: 0 },
        { id: 'development', name: 'Facteur développement', baseValue: 1.45, scenarioValue: 1.45, unit: '', impact: 0 }
      ],
      results: {
        reserves: 3784000,
        reserveChange: 0,
        ultimateLoss: 15234000,
        confidenceInterval: { low: 3400000, high: 4200000 },
        probabilityOfAdequacy: 85,
        var95: 4100000,
        tvar95: 4250000
      }
    },
    {
      id: 'pessimistic',
      name: 'Scénario Pessimiste',
      description: 'Détérioration des conditions avec hausse de la sinistralité',
      type: 'pessimistic',
      probability: 25,
      icon: CloudRain,
      color: 'orange',
      parameters: [
        { id: 'frequency', name: 'Fréquence sinistres', baseValue: 100, scenarioValue: 115, unit: '%', impact: 15 },
        { id: 'severity', name: 'Sévérité moyenne', baseValue: 100, scenarioValue: 110, unit: '%', impact: 10 },
        { id: 'inflation', name: 'Inflation', baseValue: 2.0, scenarioValue: 3.5, unit: '%', impact: 1.5 },
        { id: 'development', name: 'Facteur développement', baseValue: 1.45, scenarioValue: 1.52, unit: '', impact: 0.07 }
      ],
      results: {
        reserves: 4500000,
        reserveChange: 18.9,
        ultimateLoss: 16950000,
        confidenceInterval: { low: 4100000, high: 4900000 },
        probabilityOfAdequacy: 75,
        var95: 4850000,
        tvar95: 5100000
      }
    },
    {
      id: 'stress',
      name: 'Scénario de Stress',
      description: 'Test de résistance avec conditions extrêmes',
      type: 'stress',
      probability: 5,
      icon: Zap,
      color: 'red',
      parameters: [
        { id: 'frequency', name: 'Fréquence sinistres', baseValue: 100, scenarioValue: 130, unit: '%', impact: 30 },
        { id: 'severity', name: 'Sévérité moyenne', baseValue: 100, scenarioValue: 125, unit: '%', impact: 25 },
        { id: 'inflation', name: 'Inflation', baseValue: 2.0, scenarioValue: 5.0, unit: '%', impact: 3.0 },
        { id: 'development', name: 'Facteur développement', baseValue: 1.45, scenarioValue: 1.65, unit: '', impact: 0.20 }
      ],
      results: {
        reserves: 5800000,
        reserveChange: 53.2,
        ultimateLoss: 19250000,
        confidenceInterval: { low: 5200000, high: 6400000 },
        probabilityOfAdequacy: 60,
        var95: 6200000,
        tvar95: 6800000
      }
    }
  ];

  const stressTests: StressTest[] = [
    { name: 'Pandémie', description: 'Impact type COVID-19', severity: 'extreme', impact: 35, probability: 2 },
    { name: 'Catastrophe Naturelle', description: 'Tempête majeure', severity: 'high', impact: 28, probability: 5 },
    { name: 'Crise Économique', description: 'Récession sévère', severity: 'high', impact: 22, probability: 8 },
    { name: 'Changement Réglementaire', description: 'Nouvelles normes', severity: 'medium', impact: 15, probability: 15 },
    { name: 'Inflation Galopante', description: 'Hausse prix > 5%', severity: 'medium', impact: 18, probability: 12 },
    { name: 'Cyber Incident', description: 'Attaque majeure', severity: 'high', impact: 20, probability: 10 }
  ];

  const runSimulation = () => {
    setIsSimulating(true);
    setSimulationProgress(0);
    
    // Simulation progressive
    const interval = setInterval(() => {
      setSimulationProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsSimulating(false);
          return 100;
        }
        return prev + 10;
      });
    }, 300);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  const getScenarioIcon = (scenario: Scenario) => {
    const Icon = scenario.icon;
    return <Icon className="w-5 h-5" />;
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'low': return 'bg-green-100 text-green-700';
      case 'medium': return 'bg-yellow-100 text-yellow-700';
      case 'high': return 'bg-orange-100 text-orange-700';
      case 'extreme': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const currentScenario = scenarios.find(s => s.id === selectedScenario);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Simulations & Analyses de Scénarios</h2>
            <p className="text-gray-600 mt-1">Projections stochastiques et tests de résistance</p>
          </div>
          <div className="flex gap-3">
            <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2">
              <Save className="w-4 h-4" />
              Sauvegarder
            </button>
            <button
              onClick={runSimulation}
              disabled={isSimulating}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 flex items-center gap-2"
            >
              {isSimulating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Simulation...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Lancer Simulation
                </>
              )}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 border-b border-gray-200">
          {['scenarios', 'montecarlo', 'stress', 'sensitivity'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'text-blue-600 border-blue-600'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              {tab === 'scenarios' && 'Scénarios'}
              {tab === 'montecarlo' && 'Monte Carlo'}
              {tab === 'stress' && 'Stress Tests'}
              {tab === 'sensitivity' && 'Sensibilité'}
            </button>
          ))}
        </div>
      </div>

      {/* Scenarios Tab */}
      {activeTab === 'scenarios' && (
        <div className="space-y-6">
          {/* Scenario Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {scenarios.map((scenario) => (
              <button
                key={scenario.id}
                onClick={() => setSelectedScenario(scenario.id)}
                className={`p-4 rounded-xl border-2 transition-all ${
                  selectedScenario === scenario.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className={`p-3 rounded-lg inline-block mb-3 ${
                  scenario.color === 'green' ? 'bg-green-100' :
                  scenario.color === 'blue' ? 'bg-blue-100' :
                  scenario.color === 'orange' ? 'bg-orange-100' :
                  'bg-red-100'
                }`}>
                  {getScenarioIcon(scenario)}
                </div>
                <h3 className="font-semibold text-gray-900">{scenario.name}</h3>
                <p className="text-xs text-gray-600 mt-1">{scenario.description}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">
                    Probabilité: {scenario.probability}%
                  </span>
                  {scenario.results && (
                    <span className={`text-sm font-bold ${
                      scenario.results.reserveChange > 0 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {formatPercentage(scenario.results.reserveChange)}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Selected Scenario Details */}
          {currentScenario && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Parameters */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Paramètres du Scénario</h3>
                
                <div className="space-y-4">
                  {currentScenario.parameters.map((param) => (
                    <div key={param.id}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">{param.name}</span>
                        <span className={`text-sm font-bold ${
                          param.impact > 0 ? 'text-red-600' : param.impact < 0 ? 'text-green-600' : 'text-gray-600'
                        }`}>
                          {formatPercentage(param.impact)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="relative h-2 bg-gray-200 rounded-full">
                            <div
                              className={`absolute h-2 rounded-full ${
                                param.impact > 0 ? 'bg-red-500' : param.impact < 0 ? 'bg-green-500' : 'bg-gray-400'
                              }`}
                              style={{
                                width: `${Math.abs(param.impact) * 3}%`,
                                left: param.impact < 0 ? `${50 - Math.abs(param.impact) * 3}%` : '50%'
                              }}
                            />
                            <div className="absolute h-4 w-1 bg-gray-800 -mt-1" style={{ left: '50%' }} />
                          </div>
                        </div>
                        <span className="text-sm text-gray-600 min-w-[60px] text-right">
                          {param.scenarioValue}{param.unit}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">Impact Global</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {currentScenario.results ? formatPercentage(currentScenario.results.reserveChange) : '-'}
                  </p>
                </div>
              </div>

              {/* Results */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Résultats de Simulation</h3>
                
                {currentScenario.results && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Réserves Projetées</p>
                        <p className="text-xl font-bold text-gray-900">
                          {formatCurrency(currentScenario.results.reserves)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Sinistres Ultimes</p>
                        <p className="text-xl font-bold text-gray-900">
                          {formatCurrency(currentScenario.results.ultimateLoss)}
                        </p>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-gray-200">
                      <p className="text-sm text-gray-600 mb-2">Intervalle de Confiance (95%)</p>
                      <div className="relative h-3 bg-gray-200 rounded-full">
                        <div
                          className="absolute h-3 bg-blue-500 rounded-full"
                          style={{
                            left: '20%',
                            width: '60%'
                          }}
                        />
                      </div>
                      <div className="flex justify-between mt-2 text-xs text-gray-600">
                        <span>{formatCurrency(currentScenario.results.confidenceInterval.low)}</span>
                        <span className="font-bold text-gray-900">
                          {formatCurrency(currentScenario.results.reserves)}
                        </span>
                        <span>{formatCurrency(currentScenario.results.confidenceInterval.high)}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-4">
                      <div className="text-center p-3 bg-blue-50 rounded-lg">
                        <p className="text-sm text-blue-600">VaR 95%</p>
                        <p className="text-lg font-bold text-blue-900">
                          {formatCurrency(currentScenario.results.var95)}
                        </p>
                      </div>
                      <div className="text-center p-3 bg-purple-50 rounded-lg">
                        <p className="text-sm text-purple-600">TVaR 95%</p>
                        <p className="text-lg font-bold text-purple-900">
                          {formatCurrency(currentScenario.results.tvar95)}
                        </p>
                      </div>
                    </div>

                    <div className="pt-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-600">Probabilité d'Adéquation</span>
                        <span className="text-sm font-bold text-gray-900">
                          {currentScenario.results.probabilityOfAdequacy}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            currentScenario.results.probabilityOfAdequacy >= 80 ? 'bg-green-600' :
                            currentScenario.results.probabilityOfAdequacy >= 60 ? 'bg-yellow-600' :
                            'bg-red-600'
                          }`}
                          style={{ width: `${currentScenario.results.probabilityOfAdequacy}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Monte Carlo Tab */}
      {activeTab === 'montecarlo' && (
        <div className="space-y-6">
          {/* Configuration */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Configuration Monte Carlo</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre d'Itérations
                </label>
                <input
                  type="number"
                  value={simulationConfig.iterations}
                  onChange={(e) => setSimulationConfig({
                    ...simulationConfig,
                    iterations: parseInt(e.target.value)
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Niveau de Confiance (%)
                </label>
                <select
                  value={simulationConfig.confidenceLevel}
                  onChange={(e) => setSimulationConfig({
                    ...simulationConfig,
                    confidenceLevel: parseInt(e.target.value)
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value={90}>90%</option>
                  <option value={95}>95%</option>
                  <option value={99}>99%</option>
                  <option value={99.5}>99.5%</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Distribution
                </label>
                <select
                  value={simulationConfig.distributionType}
                  onChange={(e) => setSimulationConfig({
                    ...simulationConfig,
                    distributionType: e.target.value
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="normal">Normale</option>
                  <option value="lognormal">Log-Normale</option>
                  <option value="gamma">Gamma</option>
                  <option value="poisson">Poisson</option>
                  <option value="weibull">Weibull</option>
                </select>
              </div>
            </div>

            {/* Advanced Settings */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="mt-4 text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              {showAdvanced ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              Paramètres Avancés
            </button>

            {showAdvanced && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={simulationConfig.correlationMatrix}
                      onChange={(e) => setSimulationConfig({
                        ...simulationConfig,
                        correlationMatrix: e.target.checked
                      })}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm text-gray-700">Matrice de corrélation</span>
                  </label>
                  
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Seed (optionnel)</label>
                    <input
                      type="number"
                      placeholder="Random"
                      value={simulationConfig.seedValue || ''}
                      onChange={(e) => setSimulationConfig({
                        ...simulationConfig,
                        seedValue: e.target.value ? parseInt(e.target.value) : undefined
                      })}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Horizon (mois)</label>
                    <input
                      type="number"
                      value={simulationConfig.timeHorizon}
                      onChange={(e) => setSimulationConfig({
                        ...simulationConfig,
                        timeHorizon: parseInt(e.target.value)
                      })}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Simulation Progress */}
          {isSimulating && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Simulation en cours...</span>
                <span className="text-sm text-gray-600">{simulationProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all"
                  style={{ width: `${simulationProgress}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                <span>Itération: {Math.floor(simulationConfig.iterations * simulationProgress / 100)}</span>
                <span>Temps restant: ~{Math.ceil((100 - simulationProgress) * 0.3)}s</span>
              </div>
            </div>
          )}

          {/* Results Visualization */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Distribution des Réserves</h3>
              <div className="h-64 flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg">
                <div className="text-center">
                  <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-500">Histogramme de Distribution</p>
                  <p className="text-sm text-gray-400">10,000 simulations</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Statistiques de Simulation</h3>
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Moyenne</span>
                  <span className="font-medium">{formatCurrency(3784000)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Médiane</span>
                  <span className="font-medium">{formatCurrency(3750000)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Écart-type</span>
                  <span className="font-medium">{formatCurrency(320000)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Coefficient de Variation</span>
                  <span className="font-medium">8.5%</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-sm text-gray-600">Skewness</span>
                  <span className="font-medium">0.42</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stress Tests Tab */}
      {activeTab === 'stress' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Tests de Résistance</h3>
            </div>
            
            <div className="divide-y divide-gray-200">
              {stressTests.map((test, index) => (
                <div key={index} className="p-6 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h4 className="font-medium text-gray-900">{test.name}</h4>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(test.severity)}`}>
                          {test.severity === 'low' ? 'Faible' :
                           test.severity === 'medium' ? 'Moyen' :
                           test.severity === 'high' ? 'Élevé' : 'Extrême'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{test.description}</p>
                      
                      <div className="grid grid-cols-3 gap-4 mt-4">
                        <div>
                          <p className="text-xs text-gray-500">Impact sur réserves</p>
                          <p className="text-lg font-bold text-red-600">+{test.impact}%</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Probabilité</p>
                          <p className="text-lg font-bold text-gray-900">{test.probability}%</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Réserves stressées</p>
                          <p className="text-lg font-bold text-gray-900">
                            {formatCurrency(3784000 * (1 + test.impact / 100))}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <button className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200">
                      Simuler
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Combined Stress Test */}
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-orange-600 mt-0.5" />
              <div>
                <h3 className="text-lg font-semibold text-orange-900 mb-2">Test de Stress Combiné</h3>
                <p className="text-sm text-orange-800 mb-3">
                  Impact cumulé de plusieurs événements défavorables simultanés
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white rounded-lg p-3">
                    <p className="text-sm text-gray-600">Impact Total</p>
                    <p className="text-xl font-bold text-red-600">+47.5%</p>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <p className="text-sm text-gray-600">Réserves Requises</p>
                    <p className="text-xl font-bold text-gray-900">{formatCurrency(5580000)}</p>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <p className="text-sm text-gray-600">Capital Additionnel</p>
                    <p className="text-xl font-bold text-orange-600">{formatCurrency(1796000)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScenarioSimulation;