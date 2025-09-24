// frontend/src/pages/Results.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Download, Share2, TrendingUp, AlertTriangle,
  BarChart3, Activity, DollarSign, Percent,
  Calendar, Clock, CheckCircle, XCircle,
  ChevronDown, ChevronUp
} from 'lucide-react';
import Layout from '../components/common/Layout';
import TriangleHeatmap from '../components/charts/TriangleHeatmap';
import { useCalculations } from '../hooks/useCalculations';
import { useNotifications } from '../context/NotificationContext';

interface CalculationResult {
  id: string;
  triangleId: string;
  triangleName: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  duration?: number;
  methods: MethodResult[];
  summary: {
    bestEstimate: number;
    range: { min: number; max: number };
    confidence: number;
    convergence: boolean;
  };
  metadata: {
    currency: string;
    businessLine: string;
    dataPoints: number;
    lastUpdated: string;
  };
}

interface MethodResult {
  id: string;
  name: string;
  status: 'success' | 'failed' | 'warning';
  ultimate: number;
  reserves: number;
  paidToDate: number;
  developmentFactors: number[];
  projectedTriangle?: number[][];
  confidenceIntervals?: {
    level: number;
    lower: number;
    upper: number;
  }[];
  diagnostics: {
    rmse: number;
    mape: number;
    r2: number;
    residuals: number[];
  };
  warnings?: string[];
  parameters: Record<string, any>;
}

/* ---------- utils format ---------- */
const formatCurrency = (value: number, currency: string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);

const formatNumber = (value: number, digits = 0) =>
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);

const Results: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  // Correction: utiliser seulement les propriétés qui existent dans le hook
  const { methods, isLoadingMethods } = useCalculations();
  const { success, error: showError } = useNotifications();

  const [result, setResult] = useState<CalculationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMethod, setSelectedMethod] = useState<string>('');
  const [compareMode, setCompareMode] = useState(false);
  const [expandedSections, setExpandedSections] = useState<string[]>(['summary', 'methods']);
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('chart');

  // Simulation locale des méthodes manquantes
  const getCalculation = async (calculationId: string) => {
    try {
      // Simuler un appel API
      await new Promise(resolve => setTimeout(resolve, 600));

      const mockResult: CalculationResult = {
        id: calculationId,
        triangleId: 'triangle-1',
        triangleName: 'Sinistres Auto 2024',
        status: 'completed',
        startedAt: new Date(Date.now() - 120000).toISOString(),
        completedAt: new Date().toISOString(),
        duration: 45,
        methods: [
          {
            id: 'chain-ladder',
            name: 'Chain Ladder',
            status: 'success',
            ultimate: 15_234_567,
            reserves: 3_456_789,
            paidToDate: 11_777_778,
            developmentFactors: [1.456, 1.234, 1.123, 1.067, 1.023, 1.011, 1.005],
            projectedTriangle: generateMockTriangle(8),
            confidenceIntervals: [
              { level: 75, lower: 14_500_000, upper: 15_900_000 },
              { level: 95, lower: 14_100_000, upper: 16_400_000 },
              { level: 99, lower: 13_800_000, upper: 16_800_000 }
            ],
            diagnostics: {
              rmse: 0.0234,
              mape: 2.45,
              r2: 0.9856,
              residuals: [0.012, -0.008, 0.015, -0.011, 0.005, -0.003, 0.001]
            },
            parameters: {
              tailFactor: 1.0,
              excludeOutliers: true,
              smoothing: 'none'
            }
          },
          {
            id: 'bornhuetter-ferguson',
            name: 'Bornhuetter-Ferguson',
            status: 'success',
            ultimate: 15_567_890,
            reserves: 3_790_123,
            paidToDate: 11_777_778,
            developmentFactors: [1.478, 1.245, 1.134, 1.078, 1.034, 1.015, 1.007],
            confidenceIntervals: [
              { level: 75, lower: 14_800_000, upper: 16_200_000 },
              { level: 95, lower: 14_400_000, upper: 16_700_000 },
              { level: 99, lower: 14_000_000, upper: 17_100_000 }
            ],
            diagnostics: {
              rmse: 0.0256,
              mape: 2.67,
              r2: 0.9823,
              residuals: [0.014, -0.009, 0.017, -0.013, 0.006, -0.004, 0.002]
            },
            warnings: ["Ratio de sinistralité élevé détecté pour l'année 2022"],
            parameters: {
              aprioriLossRatio: 0.75,
              credibilityWeight: 0.5,
              adjustForInflation: true
            }
          }
        ],
        summary: {
          bestEstimate: 15_308_637,
          range: { min: 14_100_000, max: 16_800_000 },
          confidence: 92.5,
          convergence: true
        },
        metadata: {
          currency: 'EUR',
          businessLine: 'Automobile',
          dataPoints: 45,
          lastUpdated: new Date().toISOString()
        }
      };

      return mockResult;
    } catch (error) {
      console.error('Erreur lors de la récupération du calcul:', error);
      throw error;
    }
  };

  const exportResults = async (format: string = 'excel') => {
    try {
      // Simuler un export
      const data = JSON.stringify({ id, format, exported: true });
      const blob = new Blob([data], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `results_${id}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erreur lors de l\'export:', error);
      throw error;
    }
  };

  useEffect(() => {
    const fetchResult = async () => {
      setLoading(true);
      try {
        const apiResult = await getCalculation(id || '');
        setResult(apiResult);
        setSelectedMethod(apiResult.methods[0].id);
      } catch (err) {
        showError('Erreur de chargement', 'Impossible de charger les résultats');
      } finally {
        setLoading(false);
      }
    };

    fetchResult();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const selectedMethodData = useMemo(
    () => result?.methods.find(m => m.id === selectedMethod),
    [result, selectedMethod]
  );

  function generateMockTriangle(size: number) {
    const triangle: number[][] = [];
    for (let i = 0; i < size; i++) {
      triangle[i] = [];
      for (let j = 0; j <= i; j++) {
        triangle[i][j] = Math.random() * 1_000_000 + 500_000;
      }
    }
    return triangle;
  }

  const toggleSection = (section: string) => {
    setExpandedSections(prev =>
      prev.includes(section) ? prev.filter(s => s !== section) : [...prev, section]
    );
  };

  const handleExport = async (format: 'pdf' | 'excel' | 'json') => {
    try {
      await exportResults(format);
      success(`Export ${format.toUpperCase()} généré avec succès`);
    } catch {
      showError("Erreur d'export", "Impossible de générer l'export");
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
            <p className="mt-4 text-gray-600">Chargement des résultats...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!result) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <XCircle className="h-12 w-12 text-red-500 mx-auto" />
            <p className="mt-4 text-gray-600">Résultats introuvables</p>
            <button
              onClick={() => navigate('/calculations')}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Retour aux calculs
            </button>
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
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{result.triangleName}</h1>
                <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {new Date(result.startedAt).toLocaleDateString('fr-FR')}
                  </span>
                  {typeof result.duration === 'number' && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      Durée: {result.duration}s
                    </span>
                  )}
                  <span
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
                    ${result.status === 'completed' ? 'bg-green-100 text-green-700' : ''}
                    ${result.status === 'running' ? 'bg-blue-100 text-blue-700' : ''}
                    ${result.status === 'failed' ? 'bg-red-100 text-red-700' : ''}`}
                  >
                    {result.status === 'completed' && <CheckCircle className="h-3 w-3" />}
                    {result.status === 'completed' ? 'Terminé' : result.status}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setCompareMode(!compareMode)}
                  className="px-3 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  title="Comparer les méthodes"
                >
                  <BarChart3 className="h-4 w-4" />
                </button>

                <div className="relative group">
                  <button
                    className="px-3 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    title="Exporter"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                    <button
                      onClick={() => handleExport('pdf')}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Export PDF
                    </button>
                    <button
                      onClick={() => handleExport('excel')}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Export Excel
                    </button>
                    <button
                      onClick={() => handleExport('json')}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Export JSON
                    </button>
                  </div>
                </div>

                <button
                  className="px-3 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  title="Partager"
                >
                  <Share2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Résumé exécutif */}
          <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">Estimation finale</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(result.summary.bestEstimate, result.metadata.currency)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Réserves (est.)</p>
                <p className="text-2xl font-bold text-blue-600">
                  {selectedMethodData
                    ? formatCurrency(selectedMethodData.reserves, result.metadata.currency)
                    : formatCurrency(Math.max(result.summary.bestEstimate - 11_777_778, 0), result.metadata.currency)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Intervalle (95%)</p>
                <p className="text-lg font-medium text-gray-700">
                  [
                  {formatNumber(result.summary.range.min / 1_000_000)}M -{' '}
                  {formatNumber(result.summary.range.max / 1_000_000)}M]
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Niveau de confiance</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full"
                      style={{ width: `${Math.min(Math.max(result.summary.confidence, 0), 100)}%` }}
                    />
                  </div>
                  <span className="text-lg font-medium text-gray-900">
                    {formatNumber(result.summary.confidence, 1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Résultats par méthode */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div
            className="px-6 py-4 border-b border-gray-200 cursor-pointer hover:bg-gray-50"
            onClick={() => toggleSection('methods')}
          >
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-medium text-gray-900">Résultats par méthode</h2>
              {expandedSections.includes('methods')
                ? <ChevronUp className="h-5 w-5 text-gray-500" />
                : <ChevronDown className="h-5 w-5 text-gray-500" />
              }
            </div>
          </div>

          {expandedSections.includes('methods') && (
            <div className="p-6">
              {/* Tabs des méthodes */}
              <div className="border-b border-gray-200 mb-6">
                <nav className="-mb-px flex flex-wrap gap-4 sm:space-x-8">
                  {result.methods.map(method => (
                    <button
                      key={method.id}
                      onClick={() => setSelectedMethod(method.id)}
                      className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors
                        ${selectedMethod === method.id
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                      <span className="flex items-center gap-2">
                        {method.status === 'success' && <CheckCircle className="h-4 w-4 text-green-500" />}
                        {method.status === 'warning' && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
                        {method.status === 'failed' && <XCircle className="h-4 w-4 text-red-500" />}
                        {method.name}
                      </span>
                    </button>
                  ))}
                </nav>
              </div>

              {/* Contenu de la méthode sélectionnée */}
              {selectedMethodData && (
                <div className="space-y-6">
                  {/* KPIs de la méthode */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-600">Ultimate</p>
                        <DollarSign className="h-4 w-4 text-gray-400" />
                      </div>
                      <p className="text-xl font-bold text-gray-900 mt-1">
                        {formatNumber(selectedMethodData.ultimate / 1_000_000)}M
                      </p>
                    </div>

                    <div className="bg-blue-50 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-600">Réserves</p>
                        <TrendingUp className="h-4 w-4 text-blue-400" />
                      </div>
                      <p className="text-xl font-bold text-blue-600 mt-1">
                        {formatNumber(selectedMethodData.reserves / 1_000_000)}M
                      </p>
                    </div>

                    <div className="bg-green-50 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-600">R² Score</p>
                        <Activity className="h-4 w-4 text-green-400" />
                      </div>
                      <p className="text-xl font-bold text-green-600 mt-1">
                        {formatNumber(selectedMethodData.diagnostics.r2 * 100, 2)}%
                      </p>
                    </div>

                    <div className="bg-purple-50 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-600">MAPE</p>
                        <Percent className="h-4 w-4 text-purple-400" />
                      </div>
                      <p className="text-xl font-bold text-purple-600 mt-1">
                        {formatNumber(selectedMethodData.diagnostics.mape, 2)}%
                      </p>
                    </div>
                  </div>

                  {/* Avertissements */}
                  {!!selectedMethodData.warnings?.length && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                        <div>
                          <h4 className="font-medium text-yellow-900">Avertissements</h4>
                          <ul className="mt-2 space-y-1">
                            {selectedMethodData.warnings.map((warning, i) => (
                              <li key={i} className="text-sm text-yellow-700">• {warning}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Basculer entre tableau et graphique */}
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-medium text-gray-900">Triangle projeté</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setViewMode('table')}
                        className={`px-3 py-1 rounded-md text-sm font-medium transition-colors
                          ${viewMode === 'table'
                            ? 'bg-blue-100 text-blue-700'
                            : 'text-gray-600 hover:text-gray-900'
                          }`}
                      >
                        Tableau
                      </button>
                      <button
                        onClick={() => setViewMode('chart')}
                        className={`px-3 py-1 rounded-md text-sm font-medium transition-colors
                          ${viewMode === 'chart'
                            ? 'bg-blue-100 text-blue-700'
                            : 'text-gray-600 hover:text-gray-900'
                          }`}
                      >
                        Graphique
                      </button>
                    </div>
                  </div>

                  {/* Visualisation */}
                  {viewMode === 'chart' && selectedMethodData.projectedTriangle && selectedMethodData.projectedTriangle.length > 0 && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      {/* Correction: retirer la prop title qui n'existe pas */}
                      <TriangleHeatmap data={selectedMethodData.projectedTriangle} />
                    </div>
                  )}

                  {viewMode === 'table' && selectedMethodData.projectedTriangle && selectedMethodData.projectedTriangle.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                              Période
                            </th>
                            {selectedMethodData.projectedTriangle[0].map((_, i) => (
                              <th key={i} className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                                Dev {i}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {selectedMethodData.projectedTriangle.map((row, i) => (
                            <tr key={i}>
                              <td className="px-4 py-2 text-sm font-medium text-gray-900">
                                {2020 + i}
                              </td>
                              {row.map((value, j) => (
                                <td key={j} className="px-4 py-2 text-sm text-right text-gray-600">
                                  {typeof value === 'number'
                                    ? formatNumber(value, 0)
                                    : '-'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Intervalles de confiance */}
                  {!!selectedMethodData.confidenceIntervals?.length && (
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 mb-4">
                        Intervalles de confiance
                      </h3>
                      <div className="space-y-3">
                        {selectedMethodData.confidenceIntervals.map(ci => (
                          <div key={ci.level} className="flex items-center gap-4">
                            <span className="text-sm font-medium text-gray-600 w-12">
                              {ci.level}%
                            </span>
                            <div className="flex-1 relative h-8 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="absolute h-full bg-blue-200"
                                style={{
                                  left: `${((ci.lower - 13_000_000) / 5_000_000) * 100}%`,
                                  right: `${100 - ((ci.upper - 13_000_000) / 5_000_000) * 100}%`
                                }}
                              />
                              <div
                                className="absolute top-1/2 transform -translate-y-1/2 w-1 h-4 bg-blue-600"
                                style={{
                                  left: `${(((selectedMethodData.ultimate ?? 0) - 13_000_000) / 5_000_000) * 100}%`
                                }}
                              />
                            </div>
                            <span className="text-sm text-gray-500 w-32 text-right">
                              [{(ci.lower / 1_000_000).toFixed(1)}M - {(ci.upper / 1_000_000).toFixed(1)}M]
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mode comparaison */}
        {compareMode && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Comparaison des méthodes
            </h2>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Méthode
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Ultimate
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Réserves
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Écart vs moyenne
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      R²
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      MAPE
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      Statut
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {result.methods.map(method => {
                    const deviation = ((method.ultimate - result.summary.bestEstimate) / result.summary.bestEstimate) * 100;
                    return (
                      <tr key={method.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          {method.name}
                        </td>
                        <td className="px-6 py-4 text-sm text-right text-gray-600">
                          {formatCurrency(method.ultimate, result.metadata.currency)}
                        </td>
                        <td className="px-6 py-4 text-sm text-right text-gray-600">
                          {formatCurrency(method.reserves, result.metadata.currency)}
                        </td>
                        <td className={`px-6 py-4 text-sm text-right font-medium
                          ${Math.abs(deviation) < 2 ? 'text-green-600' :
                            Math.abs(deviation) < 5 ? 'text-yellow-600' : 'text-red-600'}`}
                        >
                          {deviation > 0 ? '+' : ''}{deviation.toFixed(2)}%
                        </td>
                        <td className="px-6 py-4 text-sm text-right text-gray-600">
                          {(method.diagnostics.r2 * 100).toFixed(2)}%
                        </td>
                        <td className="px-6 py-4 text-sm text-right text-gray-600">
                          {method.diagnostics.mape.toFixed(2)}%
                        </td>
                        <td className="px-6 py-4 text-center">
                          {method.status === 'success' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Succès
                            </span>
                          )}
                          {method.status === 'warning' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Avertissement
                            </span>
                          )}
                          {method.status === 'failed' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              <XCircle className="h-3 w-3 mr-1" />
                              Échec
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Results;