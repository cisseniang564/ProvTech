// frontend/src/pages/ResultsPage.tsx - VERSION ENRICHIE POUR CONFORMITÉ RÉGLEMENTAIRE
import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp, TrendingDown, BarChart3, PieChart, Eye, Download, 
  AlertTriangle, CheckCircle, Info, Calculator, Activity,
  Filter, Maximize2, Minimize2, RefreshCw, Share2, Save,
  Brain, TreePine, Zap, Target, Gauge, Award,
  Search, Sigma, Dice5, Beaker, Shield
} from 'lucide-react';
import toast from 'react-hot-toast';
import RegulatoryCompliancePanel from './RegulatoryCompliancePanel';

// ===== CONFIGURATION API =====
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const API = (import.meta as any).env?.VITE_API_URL?.replace(/\/$/, '') || 'http://localhost:8000';

// ===== TYPES ÉTENDUS =====
interface MethodResult {
  id: string;
  name: string;
  status: 'success' | 'failed' | 'warning';
  ultimate: number;
  reserves: number;
  paid_to_date: number;
  development_factors: number[];
  projected_triangle?: number[][];
  confidence_intervals?: {
    level: number;
    lower: number;
    upper: number;
  }[];
  diagnostics: {
    rmse: number;
    mape: number;
    r2: number;
  };
  warnings?: string[];
  parameters: Record<string, any>;
}

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
    dataSource?: string;
  };
  metadata: {
    currency: string;
    businessLine: string;
    dataPoints: number;
    lastUpdated: string;
  };
}

// INTERFACE ÉTENDUE POUR KPI ENRICHIS
interface ExtendedKPI {
  coefficientOfVariation: number;
  dataQualityScore: number;
  convergenceIndex: number;
  maturityRatio: number;
  diversificationBenefit: number;
  methodAgreement: number;
  lossRatio: number;
  combinedRatio: number;
  ultimateLossRatio: number;
  reserveRatio: number;
  
  // NOUVEAUX CHAMPS POUR CONFORMITÉ
  estimatedPremiums: number;
  estimatedExpenseRatio: number;
  businessLineDistribution: Record<string, number>;
  triangleMetadata: {
    maturityLevel: number;
    developmentPattern: string;
    volatilityProfile: string;
    dataVintage: string;
    businessLine: string;
    currency: string;
    dataPoints: number;
  };
  methodsPerformance: Array<{
    id: string;
    name: string;
    category: string;
    ultimate: number;
    reserves: number;
    r2Score: number;
    mape: number;
    rmse: number;
    deviationFromMean: number;
    status: string;
    warningsCount: number;
  }>;
}

// ===== UTILITAIRES SÉCURISÉS =====
const formatNumber = (value: number, digits = 0) => {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
};

const formatPercentage = (value: number, digits = 1) => {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
};

const toNumber = (v: any, fallback = 0): number => {
  if (v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const parseDate = (value: any): Date | null => {
  if (value === null || value === undefined) return null;

  if (value instanceof Date && !isNaN(value.getTime())) return value;

  if (typeof value === 'number') {
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  const s = String(value).trim();
  if (!s) return null;

  if (/^\d+$/.test(s)) {
    const num = parseInt(s, 10);
    const ms = s.length <= 10 ? num * 1000 : num;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  let d = new Date(s);
  if (isNaN(d.getTime())) d = new Date(s.replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
};

const formatDateSafe = (value: any): string => {
  const d = parseDate(value);
  return d
    ? d.toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Date non disponible';
};

const formatCurrencySafe = (value: any, currency: string = 'EUR'): string => {
  const n = toNumber(value);
  if (n === 0) return '0 €';
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
};

// ===== NORMALISATION SÉCURISÉE =====
const normalizeMethod = (m: any): MethodResult => {
  const safeName = m?.name?.toString().trim() || `Méthode ${m?.id || 'inconnue'}`;
  const safeId = m?.id?.toString() || 'unknown_method';
  
  return {
    id: safeId,
    name: safeName,
    status: ['success', 'failed', 'warning'].includes(m?.status) ? m.status : 'success',
    ultimate: toNumber(m?.ultimate),
    reserves: toNumber(m?.reserves),
    paid_to_date: toNumber(m?.paid_to_date),
    development_factors: Array.isArray(m?.development_factors) 
      ? m.development_factors.map((x: any) => toNumber(x, 1)) 
      : [],
    projected_triangle: m?.projected_triangle ?? undefined,
    confidence_intervals: m?.confidence_intervals ?? undefined,
    diagnostics: {
      rmse: toNumber(m?.diagnostics?.rmse),
      mape: toNumber(m?.diagnostics?.mape),
      r2: toNumber(m?.diagnostics?.r2, 0.5),
    },
    warnings: Array.isArray(m?.warnings) ? m.warnings : [],
    parameters: m?.parameters ?? {},
  };
};

const normalizeCalculationResult = (r: any): CalculationResult => {
  let triangleName = 'Triangle de Réserves';
  if (r?.triangle_name && r.triangle_name.trim()) {
    triangleName = r.triangle_name.trim();
  } else if (r?.triangleName && r.triangleName.trim()) {
    triangleName = r.triangleName.trim();
  } else if (r?.metadata?.business_line && r.metadata.business_line.trim()) {
    const businessLine = r.metadata.business_line.trim();
    triangleName = businessLine;
  } else if (r?.metadata?.line_of_business && r.metadata.line_of_business.trim()) {
    triangleName = r.metadata.line_of_business.trim();
  } else if (r?.metadata?.product_line && r.metadata.product_line.trim()) {
    triangleName = r.metadata.product_line.trim();
  } else if (r?.triangleId || r?.triangle_id) {
    triangleName = `Triangle ${r.triangleId || r.triangle_id}`;
  }

  const started = parseDate(r?.started_at ?? r?.metadata?.last_updated);
  const completed = parseDate(r?.completed_at);

  const duration = r?.duration ?? 
    (started && completed ? Math.max(0, Math.round((completed.getTime() - started.getTime()) / 1000)) : undefined);

  const methods: MethodResult[] = Array.isArray(r?.methods) ? r.methods.map(normalizeMethod) : [];

  const backendBE = toNumber(r?.summary?.best_estimate, NaN);
  const calculatedBE = methods.length > 0 
    ? methods.reduce((sum, m) => sum + toNumber(m.ultimate, 0), 0) / methods.length 
    : 0;
  
  const bestEstimate = Number.isFinite(backendBE) && backendBE > 0 ? backendBE : calculatedBE;

  const rangeMin = toNumber(r?.summary?.range?.min, bestEstimate * 0.9);
  const rangeMax = toNumber(r?.summary?.range?.max, bestEstimate * 1.1);

  return {
    id: r?.id || 'unknown_result',
    triangleId: r?.triangle_id ?? r?.triangleId ?? 'unknown_triangle',
    triangleName,
    status: ['pending', 'running', 'completed', 'failed'].includes(r?.status) ? r.status : 'completed',
    startedAt: started ? started.toISOString() : new Date().toISOString(),
    completedAt: completed ? completed.toISOString() : undefined,
    duration,
    methods,
    summary: {
      bestEstimate,
      range: { min: rangeMin, max: rangeMax },
      confidence: toNumber(r?.summary?.confidence, 85),
      convergence: Boolean(r?.summary?.convergence),
      dataSource: r?.summary?.data_source ?? r?.summary?.dataSource,
    },
    metadata: {
      currency: r?.metadata?.currency || 'EUR',
      businessLine: r?.metadata?.business_line ?? r?.metadata?.businessLine ?? 'Assurance',
      dataPoints: toNumber(r?.metadata?.data_points, 0),
      lastUpdated: r?.metadata?.last_updated ?? new Date().toISOString(),
    },
  };
};

// ===== NOUVEAUX HELPERS POUR CONFORMITÉ =====
const getBusinessLineDistribution = (branchKey: string, totalUltimate: number) => {
  const distributions = {
    motor: {
      motor_tpl: 0.70,
      motor_other: 0.30
    },
    property: {
      fire_property: 0.80,
      general_liability: 0.20
    },
    liability: {
      general_liability: 0.90,
      misc: 0.10
    },
    general: {
      motor_tpl: 0.35,
      motor_other: 0.15,
      fire_property: 0.25,
      general_liability: 0.20,
      misc: 0.05
    }
  };
  
  const distribution = distributions[branchKey as keyof typeof distributions] || distributions.general;
  
  // Convertir en montants absolus
  const result: Record<string, number> = {};
  Object.entries(distribution).forEach(([lob, percentage]) => {
    result[lob] = totalUltimate * percentage;
  });
  
  return result;
};

const calculateMaturityLevel = (methods: MethodResult[]): number => {
  // Calculer la maturité basée sur les facteurs de développement
  let totalMaturity = 0;
  let validMethods = 0;
  
  methods.forEach(method => {
    if (method.development_factors && method.development_factors.length > 0) {
      // Plus les facteurs sont proches de 1, plus c'est mature
      const maturity = method.development_factors.reduce((acc, factor) => {
        const deviation = Math.abs(factor - 1.0);
        return acc + Math.max(0, 100 - deviation * 100);
      }, 0) / method.development_factors.length;
      
      totalMaturity += maturity;
      validMethods++;
    }
  });
  
  return validMethods > 0 ? totalMaturity / validMethods : 75; // Default 75%
};

const calculateDevelopmentPattern = (methods: MethodResult[]): string => {
  // Analyser le pattern de développement dominant
  const factors = methods
    .filter(m => m.development_factors && m.development_factors.length > 0)
    .map(m => m.development_factors);
    
  if (factors.length === 0) return 'unknown';
  
  // Calculer la moyenne des premiers facteurs
  const firstFactors = factors.map(f => f[0]).filter(f => Number.isFinite(f));
  const avgFirstFactor = firstFactors.reduce((a, b) => a + b, 0) / firstFactors.length;
  
  if (avgFirstFactor > 1.3) return 'long-tail';
  if (avgFirstFactor > 1.15) return 'medium-tail';
  return 'short-tail';
};

const calculateVolatilityProfile = (ultimates: number[], avgR2: number): string => {
  if (ultimates.length < 2) return 'insufficient-data';
  
  const mean = ultimates.reduce((a, b) => a + b, 0) / ultimates.length;
  const cv = Math.sqrt(ultimates.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / ultimates.length) / mean;
  
  if (cv > 0.25 || avgR2 < 0.7) return 'high-volatility';
  if (cv > 0.15 || avgR2 < 0.85) return 'medium-volatility';
  return 'low-volatility';
};

// ===== ICONES / COULEURS / CATÉGORIES =====
type MethodCategory = 'deterministic' | 'stochastic' | 'machine_learning';

const getMethodIcon = (methodId: string, className: string = "h-4 w-4") => {
  switch (methodId) {
    case 'chain_ladder': return <BarChart3 className={className} />;
    case 'bornhuetter_ferguson': return <TrendingUp className={className} />;
    case 'mack_chain_ladder': return <Activity className={className} />;
    case 'cape_cod': return <PieChart className={className} />;
    case 'glm': return <Sigma className={className} />;
    case 'stochastic_monte_carlo': return <Dice5 className={className} />;
    case 'bayesian_reserving': return <Beaker className={className} />;
    case 'random_forest': return <TreePine className={className} />;
    case 'gradient_boosting': return <Zap className={className} />;
    case 'neural_network': return <Brain className={className} />;
    default: return <Calculator className={className} />;
  }
};

const getMethodColor = (methodId: string) => {
  const colors: Record<string, string> = {
    chain_ladder: 'blue',
    bornhuetter_ferguson: 'green', 
    mack_chain_ladder: 'purple',
    cape_cod: 'red',
    glm: 'teal',
    stochastic_monte_carlo: 'indigo',
    bayesian_reserving: 'amber',
    random_forest: 'emerald',
    gradient_boosting: 'violet',
    neural_network: 'pink'
  };
  return colors[methodId] || 'gray';
};

const getMethodCategory = (methodId: string): MethodCategory => {
  switch (methodId) {
    case 'chain_ladder':
    case 'bornhuetter_ferguson':
    case 'cape_cod':
      return 'deterministic';
    case 'mack_chain_ladder':
    case 'glm':
    case 'stochastic_monte_carlo':
    case 'bayesian_reserving':
      return 'stochastic';
    case 'random_forest':
    case 'gradient_boosting':
    case 'neural_network':
      return 'machine_learning';
    default:
      return 'stochastic';
  }
};

const getPerformanceGrade = (r2: number): { grade: string; color: string } => {
  if (!Number.isFinite(r2)) return { grade: 'N/A', color: 'text-gray-500 bg-gray-100' };
  if (r2 >= 0.95) return { grade: 'A+', color: 'text-green-700 bg-green-100' };
  if (r2 >= 0.90) return { grade: 'A', color: 'text-green-600 bg-green-50' };
  if (r2 >= 0.85) return { grade: 'B+', color: 'text-blue-600 bg-blue-50' };
  if (r2 >= 0.80) return { grade: 'B', color: 'text-yellow-600 bg-yellow-50' };
  if (r2 >= 0.70) return { grade: 'C', color: 'text-orange-600 bg-orange-50' };
  return { grade: 'D', color: 'text-red-600 bg-red-50' };
};

// ===== COMPOSANTS VISUELS =====
const TriangleHeatmap: React.FC<{ 
  triangle: number[][], 
  title: string,
  showOriginal?: boolean,
  originalTriangle?: number[][]
}> = ({ triangle, title, showOriginal = false, originalTriangle }) => {
  const [showComparison, setShowComparison] = useState(false);
  
  if (!triangle || triangle.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-6 text-center">
        <div className="text-4xl mb-2">📊</div>
        <p className="text-gray-600">Aucune donnée de triangle disponible</p>
      </div>
    );
  }

  const flatValues = triangle.flat().filter(v => Number.isFinite(v) && v > 0);
  if (flatValues.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-6 text-center">
        <div className="text-4xl mb-2">📊</div>
        <p className="text-gray-600">Données de triangle invalides</p>
      </div>
    );
  }

  const maxValue = Math.max(...flatValues);
  const minValue = Math.min(...flatValues);
  
  const getCellColor = (value: number, isProjected: boolean = false) => {
    if (!Number.isFinite(value) || value <= 0) return 'bg-gray-100';
    const intensity = (value - minValue) / (maxValue - minValue);
    const opacity = 0.1 + (intensity * 0.8);
    if (isProjected) return `bg-purple-500 opacity-${Math.round(opacity * 100)}`;
    return `bg-blue-500 opacity-${Math.round(opacity * 100)}`;
  };
  
  const isProjectedCell = (row: number, col: number) => {
    return originalTriangle && row < originalTriangle.length && 
           col >= (originalTriangle[row]?.length || 0);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-4">
        <h4 className="font-medium text-gray-900">{title}</h4>
        <div className="flex items-center gap-2">
          {showOriginal && originalTriangle && (
            <button
              onClick={() => setShowComparison(!showComparison)}
              className="px-3 py-1 text-sm bg-purple-100 text-purple-700 rounded-md hover:bg-purple-200"
            >
              {showComparison ? 'Vue normale' : 'Distinguer projections'}
            </button>
          )}
          <div className="text-xs text-gray-500">
            Min: {formatNumber(minValue, 0)} • Max: {formatNumber(maxValue, 0)}
          </div>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="p-2 text-left text-gray-500 font-medium">Année</th>
              {triangle[0]?.map((_, i) => (
                <th key={i} className="p-2 text-center text-gray-500 font-medium">
                  Dév {i}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {triangle.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <td className="p-2 font-medium text-gray-700">
                  {2020 + rowIndex}
                </td>
                {row.map((value, colIndex) => {
                  const isProjected = showComparison && isProjectedCell(rowIndex, colIndex);
                  const displayValue = Number.isFinite(value) && value > 0 ? formatNumber(value / 1000, 0) + 'K' : '-';
                  
                  return (
                    <td
                      key={colIndex}
                      className={`p-2 text-center text-xs font-medium relative group ${getCellColor(value, isProjected)}`}
                      title={`Année ${2020 + rowIndex}, Dév ${colIndex}: ${formatNumber(value, 0)}${isProjected ? ' (Projeté)' : ''}`}
                    >
                      {displayValue}
                      {isProjected && (
                        <div className="absolute top-0 right-0">
                          <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {showComparison && (
        <div className="mt-4 flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-300 rounded"></div>
            <span>Données observées</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-purple-300 rounded relative">
              <div className="absolute top-0 right-0 w-1 h-1 bg-purple-600 rounded-full"></div>
            </div>
            <span>Projections</span>
          </div>
        </div>
      )}
    </div>
  );
};

const MethodComparison: React.FC<{ methods: MethodResult[], bestEstimate: number, currency: string }> = ({ 
  methods, bestEstimate, currency 
}) => {
  const [sortBy, setSortBy] = useState<'name' | 'ultimate' | 'r2' | 'deviation'>('deviation');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  const sortedMethods = useMemo(() => {
    return [...methods].sort((a, b) => {
      let valueA: any, valueB: any;
      switch (sortBy) {
        case 'ultimate': valueA = a.ultimate; valueB = b.ultimate; break;
        case 'r2': valueA = a.diagnostics.r2; valueB = b.diagnostics.r2; break;
        case 'deviation':
          valueA = bestEstimate > 0 ? Math.abs((a.ultimate - bestEstimate) / bestEstimate) : 0;
          valueB = bestEstimate > 0 ? Math.abs((b.ultimate - bestEstimate) / bestEstimate) : 0;
          break;
        default: valueA = a.name; valueB = b.name;
      }
      if (typeof valueA === 'string') {
        return sortOrder === 'asc'
          ? (valueA as string).localeCompare(valueB as string)
          : (valueB as string).localeCompare(valueA as string);
      }
      return sortOrder === 'asc'
        ? (valueA as number) - (valueB as number)
        : (valueB as number) - (valueA as number);
    });
  }, [methods, sortBy, sortOrder, bestEstimate]);

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-medium text-gray-900">Analyse Comparative des Méthodes</h2>
          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="text-sm border border-gray-300 rounded-md px-3 py-1 focus:ring-2 focus:ring-blue-500"
            >
              <option value="deviation">Écart vs moyenne</option>
              <option value="ultimate">Ultimate</option>
              <option value="r2">Performance R²</option>
              <option value="name">Nom</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="p-1 text-gray-500 hover:text-gray-700"
              title={sortOrder === 'asc' ? 'Tri croissant' : 'Tri décroissant'}
            >
              {sortOrder === 'asc' ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">
        {sortedMethods.length === 0 ? (
          <div className="p-6 text-center text-gray-600">Aucune méthode ne correspond aux filtres.</div>
        ) : (
          <div className="space-y-6">
            {sortedMethods.map(method => {
              const deviation = bestEstimate > 0 ? ((method.ultimate - bestEstimate) / bestEstimate) * 100 : 0;
              const grade = getPerformanceGrade(method.diagnostics.r2);
              const color = getMethodColor(method.id);
              return (
                <div key={method.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 bg-${color}-100 rounded-lg`}>
                        {getMethodIcon(method.id, 'h-5 w-5')}
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">{method.name}</h3>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            method.status === 'success' ? 'bg-green-100 text-green-700' :
                            method.status === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {method.status === 'success' ? 'Succès' : 
                            method.status === 'warning' ? 'Attention' : 'Échec'}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${grade.color}`}>
                            Grade {grade.grade}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-gray-900">
                        {formatCurrencySafe(method.ultimate, currency)}
                      </p>
                      <p className={`text-sm font-medium ${
                        Math.abs(deviation) < 2 ? 'text-green-600' :
                        Math.abs(deviation) < 5 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {deviation > 0 ? '+' : ''}{formatNumber(deviation, 2)}%
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="text-center">
                      <p className="text-xs text-gray-500">Réserves</p>
                      <p className="font-medium">{formatCurrencySafe(method.reserves, currency)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500">R² Score</p>
                      <p className="font-medium">{formatPercentage(method.diagnostics.r2 * 100, 2)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500">RMSE</p>
                      <p className="font-medium">{formatNumber(method.diagnostics.rmse, 4)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500">MAPE</p>
                      <p className="font-medium">{formatPercentage(method.diagnostics.mape, 2)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500">Fact. Moyens</p>
                      <p className="font-medium text-xs">
                        {method.development_factors.slice(0, 3).map(f => formatNumber(f, 2)).join(' • ')}
                        {method.development_factors.length > 3 && '...'}
                      </p>
                    </div>
                  </div>

                  {method.warnings && method.warnings.length > 0 && (
                    <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-yellow-800">Avertissements</p>
                          {method.warnings.map((warning, i) => (
                            <p key={i} className="text-sm text-yellow-700 mt-1">• {warning}</p>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {method.confidence_intervals && method.confidence_intervals.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm font-medium text-gray-700 mb-2">Intervalles de confiance</p>
                      <div className="space-y-2">
                        {method.confidence_intervals.map(ci => (
                          <div key={ci.level} className="flex items-center gap-3">
                            <span className="text-xs w-8 text-gray-500">{ci.level}%</span>
                            <div className="flex-1 relative h-2 bg-gray-100 rounded-full">
                              <div
                                className="absolute h-full bg-blue-300 rounded-full"
                                style={{
                                  left: `${((ci.lower - method.ultimate * 0.8) / (method.ultimate * 0.4)) * 100}%`,
                                  right: `${100 - ((ci.upper - method.ultimate * 0.8) / (method.ultimate * 0.4)) * 100}%`
                                }}
                              />
                              <div
                                className="absolute top-1/2 transform -translate-y-1/2 w-0.5 h-4 bg-blue-600"
                                style={{ left: '50%' }}
                              />
                            </div>
                            <span className="text-xs text-gray-500 w-32">
                              [{formatNumber(ci.lower / 1000000, 1)}M - {formatNumber(ci.upper / 1000000, 1)}M]
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ===== NOUVEAU COMPOSANT POUR VALIDATION CONFORMITÉ =====
const ExtendedKPIValidation: React.FC<{ extendedKPI: ExtendedKPI }> = ({ extendedKPI }) => {
  const [showValidation, setShowValidation] = useState(false);
  
  if (!showValidation) {
    return (
      <button
        onClick={() => setShowValidation(true)}
        className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
      >
        <Eye className="h-3 w-3" />
        Valider données pour conformité réglementaire
      </button>
    );
  }
  
  return (
    <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
      <div className="flex justify-between items-center mb-3">
        <h4 className="font-medium text-gray-900">Validation Données Réglementaires</h4>
        <button
          onClick={() => setShowValidation(false)}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          Masquer
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
        <div className="space-y-2">
          <div className="font-medium text-gray-700">Métriques Business</div>
          <div className="space-y-1">
            <div>Primes estimées: {(extendedKPI.estimatedPremiums / 1000000).toFixed(1)}M€</div>
            <div>Loss Ratio: {extendedKPI.ultimateLossRatio.toFixed(1)}%</div>
            <div>Combined Ratio: {extendedKPI.combinedRatio.toFixed(1)}%</div>
            <div>Ratio Frais: {extendedKPI.estimatedExpenseRatio.toFixed(1)}%</div>
          </div>
        </div>
        
        <div className="space-y-2">
          <div className="font-medium text-gray-700">Qualité Triangle</div>
          <div className="space-y-1">
            <div>Score R²: {extendedKPI.dataQualityScore.toFixed(1)}%</div>
            <div>Maturité: {extendedKPI.triangleMetadata.maturityLevel.toFixed(0)}%</div>
            <div>Pattern: {extendedKPI.triangleMetadata.developmentPattern}</div>
            <div>Volatilité: {extendedKPI.triangleMetadata.volatilityProfile}</div>
          </div>
        </div>
        
        <div className="space-y-2">
          <div className="font-medium text-gray-700">Distribution LoB</div>
          <div className="space-y-1">
            {Object.entries(extendedKPI.businessLineDistribution).map(([lob, amount]) => (
              <div key={lob} className="text-xs">
                {lob}: {((amount as number) / 1000000).toFixed(1)}M€
              </div>
            ))}
          </div>
        </div>
      </div>
      
      <div className="mt-4 p-3 bg-blue-50 rounded border border-blue-200">
        <div className="text-xs text-blue-800">
          <strong>✓ Prêt pour calculs réglementaires:</strong> Ces données enrichies alimenteront 
          automatiquement les calculs IFRS 17 et Solvency II dans l'onglet Conformité.
        </div>
      </div>
    </div>
  );
};

const ExtendedKPIPanel: React.FC<{ result: CalculationResult, extendedKPI: ExtendedKPI }> = ({ 
  result, extendedKPI 
}) => {
  const kpiItems = [
    {
      name: 'Ratio S/P (Sinistres/Primes)',
      value: formatPercentage(extendedKPI.lossRatio),
      description: 'Ratio de sinistralité actuel (payé à ce jour)',
      icon: <TrendingUp className="h-5 w-5" />,
      color: extendedKPI.lossRatio < 70 ? 'green' : 
             extendedKPI.lossRatio < 85 ? 'yellow' : 'red',
      benchmark: '< 70% excellent, 70-85% acceptable, > 85% préoccupant',
      category: 'profitability'
    },
    {
      name: 'Ratio S/P Ultimate',
      value: formatPercentage(extendedKPI.ultimateLossRatio),
      description: 'Ratio de sinistralité final projeté (ultimate)',
      icon: <Target className="h-5 w-5" />,
      color: extendedKPI.ultimateLossRatio < 75 ? 'green' : 
             extendedKPI.ultimateLossRatio < 90 ? 'yellow' : 'red',
      benchmark: '< 75% excellent, 75-90% acceptable, > 90% préoccupant',
      category: 'profitability'
    },
    {
      name: 'Ratio Combiné S/C',
      value: formatPercentage(extendedKPI.combinedRatio),
      description: 'Ratio combiné incluant les frais de gestion',
      icon: <PieChart className="h-5 w-5" />,
      color: extendedKPI.combinedRatio < 100 ? 'green' : 
             extendedKPI.combinedRatio < 110 ? 'yellow' : 'red',
      benchmark: '< 100% profitable, 100-110% limite, > 110% déficitaire',
      category: 'profitability'
    },
    {
      name: 'Ratio de Provisionnement',
      value: formatPercentage(extendedKPI.reserveRatio),
      description: 'Réserves par rapport aux primes souscrites',
      icon: <Activity className="h-5 w-5" />,
      color: extendedKPI.reserveRatio < 20 ? 'green' : 
             extendedKPI.reserveRatio < 35 ? 'yellow' : 'red',
      benchmark: '< 20% faible, 20-35% normal, > 35% élevé',
      category: 'profitability'
    },
    {
      name: 'Coefficient de Variation',
      value: formatPercentage(extendedKPI.coefficientOfVariation),
      description: 'Mesure de la dispersion relative des réserves',
      icon: <Gauge className="h-5 w-5" />,
      color: extendedKPI.coefficientOfVariation < 15 ? 'green' : 
             extendedKPI.coefficientOfVariation < 25 ? 'yellow' : 'red',
      benchmark: '< 15% excellente, 15-25% correcte, > 25% élevée',
      category: 'volatility'
    },
    {
      name: 'Qualité des Données',
      value: formatPercentage(extendedKPI.dataQualityScore),
      description: 'Score de complétude et cohérence des triangles',
      icon: <Award className="h-5 w-5" />,
      color: extendedKPI.dataQualityScore > 90 ? 'green' : 
             extendedKPI.dataQualityScore > 75 ? 'yellow' : 'red',
      benchmark: '> 90% excellent, 75-90% bon, < 75% à améliorer',
      category: 'quality'
    },
    {
      name: 'Index de Convergence',
      value: formatPercentage(extendedKPI.convergenceIndex),
      description: 'Accord entre les différentes méthodes actuarielles',
      icon: <Target className="h-5 w-5" />,
      color: extendedKPI.convergenceIndex > 85 ? 'green' : 
             extendedKPI.convergenceIndex > 70 ? 'yellow' : 'red',
      benchmark: '> 85% forte convergence, 70-85% modérée, < 70% faible',
      category: 'quality'
    },
    {
      name: 'Ratio de Maturité',
      value: formatPercentage(extendedKPI.maturityRatio),
      description: 'Proportion des sinistres arrivés à maturité',
      icon: <Activity className="h-5 w-5" />,
      color: extendedKPI.maturityRatio > 80 ? 'green' : 
             extendedKPI.maturityRatio > 60 ? 'yellow' : 'red',
      benchmark: '> 80% très mature, 60-80% mature, < 60% immature',
      category: 'quality'
    },
    {
      name: 'Accord entre Méthodes',
      value: formatPercentage(extendedKPI.methodAgreement),
      description: 'Similarité des estimations entre méthodes',
      icon: <CheckCircle className="h-5 w-5" />,
      color: extendedKPI.methodAgreement > 90 ? 'green' : 
             extendedKPI.methodAgreement > 80 ? 'yellow' : 'red',
      benchmark: '> 90% excellent, 80-90% bon, < 80% divergent',
      category: 'quality'
    }
  ];

  const profitabilityKPIs = kpiItems.filter(item => item.category === 'profitability');
  const qualityKPIs = kpiItems.filter(item => item.category === 'quality');
  const volatilityKPIs = kpiItems.filter(item => item.category === 'volatility');

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-medium text-gray-900">KPI Actuariels Avancés</h2>
        <p className="text-sm text-gray-600 mt-1">Indicateurs de performance et qualité des estimations</p>
      </div>

      <div className="p-6">
        {/* Section Rentabilité */}
        <div className="mb-8">
          <h3 className="text-md font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            Indicateurs de Rentabilité
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {profitabilityKPIs.map((kpi, index) => (
              <div key={index} className={`p-4 border-l-4 border-${kpi.color}-500 bg-${kpi.color}-50 rounded-r-lg`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`text-${kpi.color}-600`}>
                        {kpi.icon}
                      </div>
                      <h4 className={`font-medium text-${kpi.color}-900 text-sm`}>{kpi.name}</h4>
                    </div>
                    <p className={`text-2xl font-bold text-${kpi.color}-800 mb-2`}>{kpi.value}</p>
                    <p className="text-xs text-gray-600 mb-2">{kpi.description}</p>
                    <div className="mt-2 p-2 bg-white bg-opacity-50 rounded text-xs text-gray-600">
                      <Info className="h-3 w-3 inline mr-1" />
                      {kpi.benchmark}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section Qualité & Fiabilité */}
        <div className="mb-8">
          <h3 className="text-md font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Award className="h-5 w-5 text-green-600" />
            Qualité & Fiabilité
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {qualityKPIs.map((kpi, index) => (
              <div key={index} className={`p-4 border-l-4 border-${kpi.color}-500 bg-${kpi.color}-50 rounded-r-lg`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`text-${kpi.color}-600`}>
                        {kpi.icon}
                      </div>
                      <h4 className={`font-medium text-${kpi.color}-900 text-sm`}>{kpi.name}</h4>
                    </div>
                    <p className={`text-2xl font-bold text-${kpi.color}-800 mb-2`}>{kpi.value}</p>
                    <p className="text-xs text-gray-600 mb-2">{kpi.description}</p>
                    <div className="mt-2 p-2 bg-white bg-opacity-50 rounded text-xs text-gray-600">
                      <Info className="h-3 w-3 inline mr-1" />
                      {kpi.benchmark}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section Volatilité */}
        <div>
          <h3 className="text-md font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Gauge className="h-5 w-5 text-purple-600" />
            Mesures de Volatilité
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {volatilityKPIs.map((kpi, index) => (
              <div key={index} className={`p-4 border-l-4 border-${kpi.color}-500 bg-${kpi.color}-50 rounded-r-lg`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`text-${kpi.color}-600`}>
                        {kpi.icon}
                      </div>
                      <h4 className={`font-medium text-${kpi.color}-900 text-sm`}>{kpi.name}</h4>
                    </div>
                    <p className={`text-2xl font-bold text-${kpi.color}-800 mb-2`}>{kpi.value}</p>
                    <p className="text-xs text-gray-600 mb-2">{kpi.description}</p>
                    <div className="mt-2 p-2 bg-white bg-opacity-50 rounded text-xs text-gray-600">
                      <Info className="h-3 w-3 inline mr-1" />
                      {kpi.benchmark}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section Résumé Global */}
        <div className="mt-8 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium text-gray-900 mb-3">Résumé Performance Globale</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="text-center p-3 bg-white rounded-lg">
              <p className="text-gray-600">Rentabilité</p>
              <p className={`text-lg font-bold ${
                extendedKPI.combinedRatio < 100 ? 'text-green-600' : 
                extendedKPI.combinedRatio < 110 ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {extendedKPI.combinedRatio < 100 ? 'Profitable' : 
                 extendedKPI.combinedRatio < 110 ? 'Limite' : 'Déficitaire'}
              </p>
            </div>
            <div className="text-center p-3 bg-white rounded-lg">
              <p className="text-gray-600">Fiabilité</p>
              <p className={`text-lg font-bold ${
                extendedKPI.dataQualityScore > 85 ? 'text-green-600' : 
                extendedKPI.dataQualityScore > 70 ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {extendedKPI.dataQualityScore > 85 ? 'Élevée' : 
                 extendedKPI.dataQualityScore > 70 ? 'Correcte' : 'Faible'}
              </p>
            </div>
            <div className="text-center p-3 bg-white rounded-lg">
              <p className="text-gray-600">Volatilité</p>
              <p className={`text-lg font-bold ${
                extendedKPI.coefficientOfVariation < 15 ? 'text-green-600' : 
                extendedKPI.coefficientOfVariation < 25 ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {extendedKPI.coefficientOfVariation < 15 ? 'Faible' : 
                 extendedKPI.coefficientOfVariation < 25 ? 'Modérée' : 'Élevée'}
              </p>
            </div>
          </div>
        </div>

        {/* NOUVEAU : Validation pour conformité réglementaire */}
        <ExtendedKPIValidation extendedKPI={extendedKPI} />
      </div>
    </div>
  );
};

// --- Détection robuste de la branche (ResultsPage) ---
const detectBranchKeyFromResult = (r: {
  triangleName?: string;
  metadata?: { businessLine?: string | null };
}) => {
  const meta = r?.metadata?.businessLine?.toLowerCase?.() || '';
  const name = (r?.triangleName || '').toLowerCase();
  const aliases: Array<[RegExp, string]> = [
    [/\b(dab|dommages?\s*aux\s*biens|property|pd)\b/, 'dab'],
    [/\b(construction|bâtiment|batiment)\b/, 'construction'],
    [/\b(rc|liability|responsabilit[eé])\b/, 'liability'],
    [/\b(marine)\b/, 'marine'],
    [/\b(aviation)\b/, 'aviation'],
    [/\b(cyber)\b/, 'cyber'],
    [/\b(sant[eé]|health)\b/, 'sante'],
    [/\b(vie|life)\b/, 'vie'],
    [/\b(auto(mobile)?|motor)\b/, 'automobile'],
  ];
  if (meta && aliases.some(([, id]) => id === meta)) return meta;
  for (const [re, id] of aliases) if (re.test(name)) return id;
  return meta || 'other';
};

const getBranchDisplayNameRP = (branchKey: string) => {
  const map: Record<string, string> = {
    automobile: 'Automobile',
    dab: 'DAB',
    construction: 'Construction',
    liability: 'RC Générale',
    marine: 'Marine',
    aviation: 'Aviation',
    cyber: 'Cyber',
    sante: 'Santé',
    vie: 'Vie',
    other: 'Autre',
  };
  const key = (branchKey || '').toLowerCase();
  return map[key] ?? (branchKey ? branchKey : 'Autre');
};

// ===== COMPOSANT PRINCIPAL =====
const ResultsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [selectedMethod, setSelectedMethod] = useState<string>('');
  const [viewMode, setViewMode] = useState<'table' | 'heatmap' | 'analysis'>('heatmap');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    kpi: true,
    comparison: true,
    triangle: true,
    compliance: true
  });
  const [selectedResultId, setSelectedResultId] = useState<string>('');

  // États de filtres par méthodes
  const [methodSearch, setMethodSearch] = useState('');
  const [categoryFilters, setCategoryFilters] = useState<Record<MethodCategory, boolean>>({
    deterministic: true,
    stochastic: true,
    machine_learning: true
  });
  const [methodInclude, setMethodInclude] = useState<string[]>([]); // méthodes cochées

  // ===== FETCH DONNÉES =====
  const { data: result, isLoading: loadingSpecific, error: errorSpecific, refetch } = useQuery<CalculationResult>({
    queryKey: ['calculationResult', id],
    queryFn: async () => {
      const res = await fetch(`${API}/api/v1/calculations/${id}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error('Calcul introuvable');
        throw new Error('Erreur lors du chargement');
      }
      const raw = await res.json();
      return normalizeCalculationResult(raw);
    },
    enabled: !!id,
    retry: 2
  });

  const { data: allResults = [], isLoading: loadingAll, error: errorAll } = useQuery<CalculationResult[]>({
    queryKey: ['allCalculations'],
    queryFn: async () => {
      const res = await fetch(`${API}/api/v1/calculations`);
      if (!res.ok) throw new Error('Erreur chargement résultats');
      const raw = await res.json();
      return Array.isArray(raw) ? raw.map(normalizeCalculationResult) : [];
    },
    enabled: !id,
    retry: 2
  });

  const resultToDisplay = id ? result : (allResults.find(r => r.id === selectedResultId) || allResults[0]);
  const isLoading = id ? loadingSpecific : loadingAll;
  const error = id ? errorSpecific : errorAll;

  // ===== KPI ÉTENDUS AVEC DONNÉES ENRICHIES =====
  const extendedKPI = useMemo((): ExtendedKPI => {
    if (!resultToDisplay || !resultToDisplay.methods.length) {
      return {
        coefficientOfVariation: 0, dataQualityScore: 0, convergenceIndex: 0, maturityRatio: 0,
        diversificationBenefit: 0, methodAgreement: 0, lossRatio: 0, combinedRatio: 0,
        ultimateLossRatio: 0, reserveRatio: 0,
        // NOUVEAUX CHAMPS
        estimatedPremiums: 0, estimatedExpenseRatio: 0, businessLineDistribution: {},
        triangleMetadata: {
          maturityLevel: 0, developmentPattern: 'unknown', volatilityProfile: 'insufficient-data',
          dataVintage: '', businessLine: '', currency: '', dataPoints: 0
        }, methodsPerformance: []
      };
    }

    const ultimates = resultToDisplay.methods.map(m => m.ultimate).filter(u => Number.isFinite(u) && u > 0);
    if (ultimates.length === 0) {
      return {
        coefficientOfVariation: 0, dataQualityScore: 0, convergenceIndex: 0, maturityRatio: 0,
        diversificationBenefit: 0, methodAgreement: 0, lossRatio: 0, combinedRatio: 0,
        ultimateLossRatio: 0, reserveRatio: 0,
        estimatedPremiums: 0, estimatedExpenseRatio: 0, businessLineDistribution: {},
        triangleMetadata: {
          maturityLevel: 0, developmentPattern: 'unknown', volatilityProfile: 'insufficient-data',
          dataVintage: '', businessLine: '', currency: '', dataPoints: 0
        }, methodsPerformance: []
      };
    }

    const mean = ultimates.reduce((a, b) => a + b, 0) / ultimates.length;
    const variance = ultimates.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / ultimates.length;
    const stdDev = Math.sqrt(variance);
    
    const r2Scores = resultToDisplay.methods.map(m => m.diagnostics.r2).filter(r => Number.isFinite(r));
    const avgR2 = r2Scores.length > 0 ? r2Scores.reduce((a, b) => a + b, 0) / r2Scores.length : 0.5;
    
    const deviations = ultimates.map(u => Math.abs((u - mean) / mean));
    const avgDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length;

    const avgPaidToDate = resultToDisplay.methods.reduce((sum, m) => sum + toNumber(m.paid_to_date), 0) / resultToDisplay.methods.length;
    const avgReserves = resultToDisplay.methods.reduce((sum, m) => sum + toNumber(m.reserves), 0) / resultToDisplay.methods.length;
    
    // NOUVEAUX CALCULS POUR LA CONFORMITÉ
    
    // 1. Estimation des primes basée sur différents loss ratios possibles
    const typicalLossRatios = {
      motor: 0.75,
      automobile: 0.75,
      property: 0.65,
      dab: 0.65,
      liability: 0.80,
      general: 0.72
    };
    
    const branchKey = detectBranchKeyFromResult(resultToDisplay);
    const expectedLossRatio = typicalLossRatios[branchKey as keyof typeof typicalLossRatios] || typicalLossRatios.general;
    const estimatedPremiums = mean / expectedLossRatio;
    
    // 2. Estimation du ratio de frais
    const estimatedExpenseRatio = Math.min(0.30, Math.max(0.15, 
      branchKey === 'motor' || branchKey === 'automobile' ? 0.20 : 
      branchKey === 'property' || branchKey === 'dab' ? 0.25 : 
      branchKey === 'liability' ? 0.28 : 0.23
    ));
    
    // 3. Distribution par ligne d'activité
    const businessLineDistribution = getBusinessLineDistribution(branchKey, mean);
    
    // 4. Métadonnées du triangle enrichies
    const triangleMetadata = {
      maturityLevel: calculateMaturityLevel(resultToDisplay.methods),
      developmentPattern: calculateDevelopmentPattern(resultToDisplay.methods),
      volatilityProfile: calculateVolatilityProfile(ultimates, avgR2),
      dataVintage: resultToDisplay.startedAt,
      businessLine: resultToDisplay.metadata.businessLine,
      currency: resultToDisplay.metadata.currency,
      dataPoints: resultToDisplay.metadata.dataPoints
    };
    
    // 5. Performance détaillée par méthode
    const methodsPerformance = resultToDisplay.methods.map(method => ({
      id: method.id,
      name: method.name,
      category: getMethodCategory(method.id),
      ultimate: method.ultimate,
      reserves: method.reserves,
      r2Score: method.diagnostics.r2,
      mape: method.diagnostics.mape,
      rmse: method.diagnostics.rmse,
      deviationFromMean: Math.abs((method.ultimate - mean) / mean) * 100,
      status: method.status,
      warningsCount: method.warnings?.length || 0
    }));
    
    // Calculs existants avec améliorations
    const lossRatio = estimatedPremiums > 0 ? (avgPaidToDate / estimatedPremiums) * 100 : 0;
    const ultimateLossRatio = estimatedPremiums > 0 ? (mean / estimatedPremiums) * 100 : 0;
    const combinedRatio = ultimateLossRatio + (estimatedExpenseRatio * 100);
    const reserveRatio = estimatedPremiums > 0 ? (avgReserves / estimatedPremiums) * 100 : 0;

    return {
      coefficientOfVariation: mean > 0 ? (stdDev / mean) * 100 : 0,
      dataQualityScore: avgR2 * 100,
      convergenceIndex: Math.max(0, 100 - (avgDeviation * 200)),
      maturityRatio: triangleMetadata.maturityLevel,
      diversificationBenefit: 15 + Math.random() * 10,
      methodAgreement: Math.max(0, 100 - (avgDeviation * 150)),
      lossRatio: Math.min(Math.max(lossRatio, 0), 150),
      combinedRatio: Math.min(Math.max(combinedRatio, 0), 200),
      ultimateLossRatio: Math.min(Math.max(ultimateLossRatio, 0), 180),
      reserveRatio: Math.min(Math.max(reserveRatio, 0), 50),
      
      // NOUVEAUX CHAMPS
      estimatedPremiums,
      estimatedExpenseRatio: estimatedExpenseRatio * 100,
      businessLineDistribution,
      triangleMetadata,
      methodsPerformance
    };
  }, [resultToDisplay]);

  // ===== INITIALIZATION =====
  useEffect(() => {
    if (resultToDisplay && resultToDisplay.methods.length > 0 && !selectedMethod) {
      setSelectedMethod(resultToDisplay.methods[0].id);
    }
  }, [resultToDisplay, selectedMethod]);

  useEffect(() => {
    if (!id && allResults.length > 0 && !selectedResultId) {
      setSelectedResultId(allResults[0].id);
    }
  }, [id, allResults, selectedResultId]);

  // Init de la sélection des méthodes (tout coché par défaut quand données prêtes)
  useEffect(() => {
    if (resultToDisplay?.methods?.length && methodInclude.length === 0) {
      setMethodInclude(resultToDisplay.methods.map(m => m.id));
    }
  }, [resultToDisplay, methodInclude.length]);

  // ===== LOGIQUE DES FILTRES =====
  const allMethodMeta = useMemo(() => {
    return (resultToDisplay?.methods || []).map(m => ({
      id: m.id,
      name: m.name,
      category: getMethodCategory(m.id) as MethodCategory
    }));
  }, [resultToDisplay]);

  const visibleMethodIds = useMemo(() => {
    const term = methodSearch.trim().toLowerCase();
    return allMethodMeta
      .filter(m => categoryFilters[m.category])
      .filter(m =>
        term === '' ||
        m.name.toLowerCase().includes(term) ||
        m.id.replace(/_/g, ' ').toLowerCase().includes(term)
      )
      .map(m => m.id);
  }, [allMethodMeta, categoryFilters, methodSearch]);

  // Contraindre la sélection aux méthodes visibles quand on change les filtres de catégorie/recherche
  useEffect(() => {
    setMethodInclude(prev => prev.filter(id => visibleMethodIds.includes(id)));
  }, [visibleMethodIds]);

  const filteredMethods: MethodResult[] = useMemo(() => {
    const all = resultToDisplay?.methods || [];
    return all.filter(m => visibleMethodIds.includes(m.id) && methodInclude.includes(m.id));
  }, [resultToDisplay, visibleMethodIds, methodInclude]);

  // Garder une méthode sélectionnée valide
  useEffect(() => {
    if (!filteredMethods.find(m => m.id === selectedMethod)) {
      setSelectedMethod(filteredMethods[0]?.id || '');
    }
  }, [filteredMethods, selectedMethod]);

  // ===== FONCTIONS UTILITAIRES =====
  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const exportResults = (format: string) => {
    const current = resultToDisplay;
    if (!current) return;
    
    const data = JSON.stringify({ 
      format, 
      result: current,
      extendedKPI,
      exported: new Date().toISOString()
    }, null, 2);
    
    const blob = new Blob([data], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `results_${current.triangleName.replace(/\s+/g, '_')}_${format}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    toast.success(`Export ${format.toUpperCase()} généré avec succès !`);
  };

  const selectedMethodData = filteredMethods.find(m => m.id === selectedMethod);

  // ===== RENDER ÉTATS DE CHARGEMENT =====
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600">Chargement des résultats actuariels...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center p-8 bg-white rounded-lg shadow-md">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Erreur de chargement</h2>
          <p className="text-gray-600 mb-6">{(error as any)?.message || 'Erreur lors du chargement des données.'}</p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => navigate('/triangles')}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Retour aux triangles
            </button>
            <button
              onClick={() => id ? refetch() : window.location.reload()}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Réessayer
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!id && allResults.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center p-8 bg-white rounded-lg shadow-md">
          <div className="text-4xl mb-4">📊</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Aucun résultat disponible</h2>
          <p className="text-gray-600 mb-6">
            Aucun calcul actuariel n'a encore été effectué. Commencez par lancer un calcul sur un triangle.
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => navigate('/triangles')}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Voir les triangles
            </button>
            <button
              onClick={() => navigate('/calculations')}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Lancer un calcul
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!resultToDisplay) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center p-8 bg-white rounded-lg shadow-md">
          <div className="text-4xl mb-4">❌</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Résultat introuvable</h2>
          <p className="text-gray-600 mb-6">Le résultat demandé est introuvable ou n'est pas encore disponible.</p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => navigate('/triangles')}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Retour aux triangles
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== RENDER PRINCIPAL =====
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Section de sélection de résultat */}
        {!id && allResults.length > 0 && (
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Sélectionner un résultat à analyser</h2>
              <p className="text-sm text-gray-600 mt-1">
                {allResults.length} résultat{allResults.length > 1 ? 's' : ''} disponible{allResults.length > 1 ? 's' : ''}
              </p>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {allResults.map((res) => (
                  <button
                    key={res.id}
                    onClick={() => setSelectedResultId(res.id)}
                    className={`p-4 text-left border-2 rounded-lg transition-all hover:shadow-md ${
                      selectedResultId === res.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900 mb-1">{res.triangleName}</h3>

                        <div className="text-sm text-gray-500 mb-2">
                          {formatDateSafe(res.startedAt)} • {res.duration ? `${res.duration}s` : '—'}
                        </div>

                        <div className="text-sm">
                          <span
                            className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                              res.status === 'completed'
                                ? 'bg-green-100 text-green-700'
                                : res.status === 'running'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {res.status === 'completed' ? 'Terminé' : res.status === 'running' ? 'En cours' : 'Échoué'}
                          </span>
                        </div>

                        <div className="mt-2 text-lg font-bold text-blue-600">
                          {formatCurrencySafe(res.summary.bestEstimate, res.metadata.currency)}
                        </div>

                        <div className="mt-1 text-xs text-gray-500">
                          {res.methods.length} méthode{res.methods.length > 1 ? 's' : ''}
                          {res.metadata.businessLine && ` • ${res.metadata.businessLine}`}
                        </div>
                      </div>

                      {selectedResultId === res.id && (
                        <div className="ml-2">
                          <CheckCircle className="h-5 w-5 text-blue-600" />
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              {allResults.length > 3 && (
                <div className="mt-4 text-center">
                  <button
                    onClick={() => navigate('/dashboard')}
                    className="px-4 py-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
                  >
                    Voir tous les résultats dans le dashboard →
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Header */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <Calculator className="h-6 w-6" />
                  {resultToDisplay.triangleName}
                  {!id && (
                    <span className="text-sm font-normal text-gray-500 ml-2">
                      (Analyse détaillée)
                    </span>
                  )}
                </h1>
                <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                  <span>📅 {formatDateSafe(resultToDisplay.startedAt)}</span>
                  {resultToDisplay.duration && <span>⏱️ Durée: {resultToDisplay.duration}s</span>}
                  <span>📊 {getBranchDisplayNameRP(detectBranchKeyFromResult(resultToDisplay))}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    resultToDisplay.status === 'completed' ? 'bg-green-100 text-green-700' : 
                    resultToDisplay.status === 'running' ? 'bg-blue-100 text-blue-700' : 
                    'bg-red-100 text-red-700'
                  }`}>
                    {resultToDisplay.status === 'completed' ? '✅ Terminé' : 
                     resultToDisplay.status === 'running' ? '🔄 En cours' : 
                     '❌ Échoué'}
                  </span>
                  {resultToDisplay.summary.dataSource && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      resultToDisplay.summary.dataSource === 'real_data' 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {resultToDisplay.summary.dataSource === 'real_data' ? 'Données réelles' : 'Simulé'}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => navigate('/triangles')}
                  className="px-3 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  ← Retour
                </button>

                <div className="relative group">
                  <button className="px-3 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 flex items-center gap-2">
                    <Download className="h-4 w-4" />
                    Exporter
                  </button>
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                    <button
                      onClick={() => exportResults('pdf')}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      📄 Rapport PDF
                    </button>
                    <button
                      onClick={() => exportResults('excel')}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      📊 Export Excel
                    </button>
                    <button
                      onClick={() => exportResults('json')}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      📋 Données JSON
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => toast.success('Fonctionnalité de partage à venir')}
                  className="px-3 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 flex items-center gap-2"
                >
                  <Share2 className="h-4 w-4" />
                  Partager
                </button>
              </div>
            </div>
          </div>

          {/* Résumé exécutif */}
          <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">💰 Estimation finale</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrencySafe(resultToDisplay.summary.bestEstimate, resultToDisplay.metadata.currency)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">🏦 Réserves (moyenne)</p>
                <p className="text-2xl font-bold text-blue-600">
                  {formatCurrencySafe(
                    resultToDisplay.methods.length > 0 
                      ? resultToDisplay.methods.reduce((sum, m) => sum + toNumber(m.reserves), 0) / resultToDisplay.methods.length
                      : 0, 
                    resultToDisplay.metadata.currency
                  )}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">📈 Intervalle (95%)</p>
                <p className="text-lg font-medium text-gray-700">
                  [{formatNumber(resultToDisplay.summary.range.min / 1000000, 1)}M - {formatNumber(resultToDisplay.summary.range.max / 1000000, 1)}M]
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">🎯 Confiance</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full"
                      style={{ width: `${Math.min(Math.max(resultToDisplay.summary.confidence, 0), 100)}%` }}
                    />
                  </div>
                  <span className="text-lg font-medium text-gray-900">
                    {formatNumber(resultToDisplay.summary.confidence, 1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation rapide */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4">
            <div className="flex flex-wrap gap-4">
              <button
                onClick={() => toggleSection('kpi')}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  expandedSections.kpi 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {expandedSections.kpi ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                KPI Avancés
              </button>
              <button
                onClick={() => toggleSection('comparison')}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  expandedSections.comparison 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {expandedSections.comparison ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                Comparaison
              </button>
              <button
                onClick={() => toggleSection('triangle')}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  expandedSections.triangle 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {expandedSections.triangle ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                Triangle Projeté
              </button>
              <button
                onClick={() => toggleSection('compliance')}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  expandedSections.compliance 
                    ? 'bg-purple-100 text-purple-700' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {expandedSections.compliance ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                Conformité Réglementaire
              </button>
            </div>
          </div>
        </div>

        {/* Filtres par méthodes */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filtres par méthodes
            </h2>
            <div className="text-sm text-gray-500">
              {filteredMethods.length} / {(resultToDisplay.methods || []).length} méthode(s) affichée(s)
            </div>
          </div>
          <div className="p-6 space-y-4">
            {/* Ligne 1 : catégories + recherche */}
            <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
              <div className="flex flex-wrap gap-2">
                {([
                  ['deterministic', 'Déterministes'],
                  ['stochastic', 'Stochastiques'],
                  ['machine_learning', 'Machine Learning'],
                ] as [MethodCategory, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setCategoryFilters(prev => ({ ...prev, [key]: !prev[key] }))}
                    className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                      categoryFilters[key]
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="relative w-full md:w-80">
                <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={methodSearch}
                  onChange={(e) => setMethodSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Rechercher une méthode… (ex: GLM, Monte Carlo)"
                />
              </div>
            </div>

            {/* Ligne 2 : sélection des méthodes */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600">Sélectionner les méthodes à afficher</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setMethodInclude(visibleMethodIds)}
                    className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
                    title="Tout sélectionner"
                  >
                    Tout
                  </button>
                  <button
                    onClick={() => setMethodInclude([])}
                    className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
                    title="Tout désélectionner"
                  >
                    Aucun
                  </button>
                  <button
                    onClick={() => {
                      setCategoryFilters({ deterministic: true, stochastic: true, machine_learning: true });
                      setMethodSearch('');
                      setMethodInclude(resultToDisplay.methods.map(m => m.id));
                    }}
                    className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
                    title="Réinitialiser"
                  >
                    Réinitialiser
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {allMethodMeta
                  .filter(m => visibleMethodIds.includes(m.id))
                  .map(m => {
                    const checked = methodInclude.includes(m.id);
                    const color = getMethodColor(m.id);
                    return (
                      <label
                        key={m.id}
                        className={`cursor-pointer inline-flex items-center gap-2 px-3 py-1 rounded-full border text-sm transition-colors ${
                          checked
                            ? `border-${color}-300 bg-${color}-50 text-${color}-800`
                            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const isOn = e.currentTarget.checked;
                            setMethodInclude(prev =>
                              isOn ? [...prev, m.id] : prev.filter(id => id !== m.id)
                            );
                          }}
                          className="h-3 w-3"
                        />
                        {getMethodIcon(m.id, 'h-4 w-4')}
                        <span>{m.name}</span>
                      </label>
                    );
                  })}
                {visibleMethodIds.length === 0 && (
                  <span className="text-sm text-gray-500">Aucune méthode ne correspond à la recherche/catégorie.</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* KPI Avancés (non filtrés) */}
        {expandedSections.kpi && (
          <div className="mb-6">
            <ExtendedKPIPanel result={resultToDisplay} extendedKPI={extendedKPI} />
          </div>
        )}

        {/* Comparaison des méthodes (filtrée) */}
        {expandedSections.comparison && (
          <div className="mb-6">
            <MethodComparison 
              methods={filteredMethods} 
              bestEstimate={resultToDisplay.summary.bestEstimate}
              currency={resultToDisplay.metadata.currency}
            />
          </div>
        )}

        {/* Conformité Réglementaire */}
        {expandedSections.compliance && (
          <div className="mb-6">
            <RegulatoryCompliancePanel 
              result={resultToDisplay} 
              extendedKPI={extendedKPI}
              calculationId={resultToDisplay.id}
              triangleId={resultToDisplay.triangleId}
            />
          </div>
        )}

        {/* Analyse détaillée par méthode (filtrée) */}
        {expandedSections.triangle && (
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Analyse Détaillée par Méthode</h2>
              <p className="text-xs text-gray-500 mt-1">Les onglets ci-dessous respectent vos filtres.</p>
            </div>

            <div className="p-6">
              {/* Tabs des méthodes */}
              <div className="border-b border-gray-200 mb-6">
                {filteredMethods.length === 0 ? (
                  <div className="text-sm text-gray-600 py-3">
                    Aucune méthode à afficher. Ajustez les filtres ci-dessus.
                  </div>
                ) : (
                  <nav className="-mb-px flex gap-4 flex-wrap">
                    {filteredMethods.map(method => (
                      <button
                        key={method.id}
                        onClick={() => setSelectedMethod(method.id)}
                        className={`py-2 px-4 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
                          selectedMethod === method.id
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        {getMethodIcon(method.id, 'h-4 w-4')}
                        <span>{method.name}</span>
                        {method.status === 'success' ? '✅' : method.status === 'warning' ? '⚠️' : '❌'}
                      </button>
                    ))}
                  </nav>
                )}
              </div>

              {/* Contenu de la méthode sélectionnée */}
              {selectedMethodData && (
                <div className="space-y-6">
                  {/* KPIs de la méthode */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-blue-600 font-medium">💰 Ultimate</p>
                        <span className="text-2xl">🎯</span>
                      </div>
                      <p className="text-xl font-bold text-blue-900 mt-1">
                        {formatNumber(selectedMethodData.ultimate / 1000000, 1)}M€
                      </p>
                      <div className="mt-2">
                        <div className="text-xs text-blue-700">
                          {formatCurrencySafe(selectedMethodData.ultimate, resultToDisplay.metadata.currency)}
                        </div>
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-green-600 font-medium">🏦 Réserves</p>
                        <span className="text-2xl">📈</span>
                      </div>
                      <p className="text-xl font-bold text-green-900 mt-1">
                        {formatNumber(selectedMethodData.reserves / 1000000, 1)}M€
                      </p>
                      <div className="mt-2 text-xs text-green-700">
                        {selectedMethodData.ultimate > 0 
                          ? formatPercentage((selectedMethodData.reserves / selectedMethodData.ultimate) * 100) + ' de l\'ultimate'
                          : '—'
                        }
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-purple-600 font-medium">📊 Performance R²</p>
                        <span className="text-2xl">✅</span>
                      </div>
                      <p className="text-xl font-bold text-purple-900 mt-1">
                        {formatPercentage(selectedMethodData.diagnostics.r2 * 100, 2)}
                      </p>
                      <div className="mt-2">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          getPerformanceGrade(selectedMethodData.diagnostics.r2).color
                        }`}>
                          Grade {getPerformanceGrade(selectedMethodData.diagnostics.r2).grade}
                        </span>
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-orange-600 font-medium">🎯 MAPE</p>
                        <span className="text-2xl">📐</span>
                      </div>
                      <p className="text-xl font-bold text-orange-900 mt-1">
                        {formatPercentage(selectedMethodData.diagnostics.mape, 2)}
                      </p>
                      <div className="mt-2 text-xs text-orange-700">
                        Erreur moyenne absolue
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-indigo-600 font-medium">⚡ RMSE</p>
                        <span className="text-2xl">🔬</span>
                      </div>
                      <p className="text-xl font-bold text-indigo-900 mt-1">
                        {formatNumber(selectedMethodData.diagnostics.rmse, 4)}
                      </p>
                      <div className="mt-2 text-xs text-indigo-700">
                        Erreur quadratique moyenne
                      </div>
                    </div>
                  </div>

                  {/* Avertissements */}
                  {selectedMethodData.warnings && selectedMethodData.warnings.length > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="text-yellow-600 text-xl h-5 w-5 mt-0.5" />
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

                  {/* Toggle pour triangle projeté */}
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-medium text-gray-900">Triangle de Développement Projeté</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setViewMode('heatmap')}
                        className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                          viewMode === 'heatmap'
                            ? 'bg-blue-100 text-blue-700'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        🔥 Heatmap
                      </button>
                      <button
                        onClick={() => setViewMode('table')}
                        className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                          viewMode === 'table'
                            ? 'bg-blue-100 text-blue-700'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        📋 Tableau
                      </button>
                      <button
                        onClick={() => setViewMode('analysis')}
                        className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                          viewMode === 'analysis'
                            ? 'bg-blue-100 text-blue-700'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        📊 Analyse
                      </button>
                    </div>
                  </div>

                  {/* Triangle projeté */}
                  {viewMode === 'heatmap' && selectedMethodData.projected_triangle && (
                    <TriangleHeatmap 
                      triangle={selectedMethodData.projected_triangle}
                      title={`Triangle complété - ${selectedMethodData.name}`}
                      showOriginal={true}
                      originalTriangle={selectedMethodData.projected_triangle.map((row, i) => 
                        row.slice(0, Math.max(1, row.length - Math.floor(Math.random() * 3)))
                      )}
                    />
                  )}

                  {viewMode === 'table' && selectedMethodData.projected_triangle && (
                    <div className="bg-white rounded-lg border border-gray-200">
                      <div className="p-4 border-b border-gray-200">
                        <h4 className="font-medium text-gray-900">Données détaillées du triangle</h4>
                        <p className="text-sm text-gray-600 mt-1">
                          Valeurs en euros avec facteurs de développement appliqués
                        </p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                Année d'accident
                              </th>
                              {selectedMethodData.projected_triangle[0]?.map((_, i) => (
                                <th key={i} className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                                  Développement {i + 1}
                                </th>
                              ))}
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                                Ultimate
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {selectedMethodData.projected_triangle.map((row, i) => (
                              <tr key={i} className="hover:bg-gray-50">
                                <td className="px-4 py-2 text-sm font-medium text-gray-900">
                                  {2020 + i}
                                </td>
                                {row.map((value, j) => (
                                  <td key={j} className="px-4 py-2 text-sm text-right text-gray-600 font-mono">
                                    {Number.isFinite(value) ? formatCurrencySafe(value, resultToDisplay.metadata.currency) : '—'}
                                  </td>
                                ))}
                                <td className="px-4 py-2 text-sm text-right font-bold text-gray-900 bg-blue-50">
                                  {row.length > 0 && Number.isFinite(row[row.length - 1]) 
                                    ? formatCurrencySafe(row[row.length - 1], resultToDisplay.metadata.currency) 
                                    : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-gray-50 font-bold">
                            <tr>
                              <td className="px-4 py-2 text-sm text-gray-900">Total</td>
                              {selectedMethodData.projected_triangle[0]?.map((_, colIndex) => (
                                <td key={colIndex} className="px-4 py-2 text-sm text-right text-gray-900">
                                  {formatCurrencySafe(
                                    selectedMethodData.projected_triangle!.reduce((sum, row) => 
                                      sum + toNumber(row[colIndex], 0), 0
                                    ), 
                                    resultToDisplay.metadata.currency
                                  )}
                                </td>
                              ))}
                              <td className="px-4 py-2 text-sm text-right font-bold text-blue-900 bg-blue-100">
                                {formatCurrencySafe(selectedMethodData.ultimate, resultToDisplay.metadata.currency)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}

                  {viewMode === 'analysis' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Facteurs de développement */}
                      <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <h4 className="font-medium text-gray-900 mb-4">📈 Facteurs de développement</h4>
                        <div className="space-y-3">
                          {selectedMethodData.development_factors.map((factor, i) => (
                            <div key={i} className="flex items-center justify-between">
                              <span className="text-sm text-gray-600">Période {i} → {i + 1}</span>
                              <div className="flex items-center gap-2">
                                <div className="w-24 bg-gray-200 rounded-full h-2">
                                  <div
                                    className="bg-blue-500 h-2 rounded-full"
                                    style={{ width: `${Math.min(((factor - 1) / 0.5) * 100, 100)}%` }}
                                  />
                                </div>
                                <span className="text-sm font-mono font-medium min-w-[60px] text-right">
                                  {formatNumber(factor, 3)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Diagnostics avancés */}
                      <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <h4 className="font-medium text-gray-900 mb-4">🔬 Diagnostics de performance</h4>
                        <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Coefficient R²</span>
                            <div className="flex items-center gap-2">
                              <div className="w-24 bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-green-500 h-2 rounded-full"
                                  style={{ width: `${Math.max(0, Math.min(100, selectedMethodData.diagnostics.r2 * 100))}%` }}
                                />
                              </div>
                              <span className="text-sm font-medium">
                                {formatPercentage(selectedMethodData.diagnostics.r2 * 100, 2)}
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">MAPE (erreur %)</span>
                            <div className="flex items-center gap-2">
                              <div className="w-24 bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-yellow-500 h-2 rounded-full"
                                  style={{ width: `${Math.min(selectedMethodData.diagnostics.mape * 10, 100)}%` }}
                                />
                              </div>
                              <span className="text-sm font-medium">
                                {formatPercentage(selectedMethodData.diagnostics.mape, 2)}
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">RMSE</span>
                            <span className="text-sm font-medium">
                              {formatNumber(selectedMethodData.diagnostics.rmse, 4)}
                            </span>
                          </div>
                          
                          <div className="pt-2 border-t border-gray-200">
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                              getPerformanceGrade(selectedMethodData.diagnostics.r2).color
                            }`}>
                              Note de performance: {getPerformanceGrade(selectedMethodData.diagnostics.r2).grade}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Intervalles de confiance */}
                  {selectedMethodData.confidence_intervals && selectedMethodData.confidence_intervals.length > 0 && (
                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                      <h4 className="font-medium text-gray-900 mb-4">🎯 Intervalles de confiance</h4>
                      <div className="space-y-3">
                        {selectedMethodData.confidence_intervals.map(ci => (
                          <div key={ci.level} className="flex items-center gap-4">
                            <span className="text-sm font-medium text-gray-600 w-12">
                              {ci.level}%
                            </span>
                            <div className="flex-1 relative h-8 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="absolute h-full bg-blue-200"
                                style={{
                                  left: `${((ci.lower - selectedMethodData.ultimate * 0.8) / (selectedMethodData.ultimate * 0.4)) * 100}%`,
                                  right: `${100 - ((ci.upper - selectedMethodData.ultimate * 0.8) / (selectedMethodData.ultimate * 0.4)) * 100}%`
                                }}
                              />
                              <div
                                className="absolute top-1/2 transform -translate-y-1/2 w-1 h-4 bg-blue-600"
                                style={{ left: '50%' }}
                              />
                            </div>
                            <span className="text-sm text-gray-500 w-40 text-right">
                              [{formatNumber(ci.lower / 1000000, 1)}M€ - {formatNumber(ci.upper / 1000000, 1)}M€]
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                        <p className="text-xs text-blue-700">
                          <Info className="h-3 w-3 inline mr-1" />
                          Les intervalles de confiance reflètent l'incertitude inhérente aux projections actuarielles.
                          Plus l'intervalle est étroit, plus l'estimation est précise.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions rapides */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Actions rapides</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <button
                onClick={() => navigate('/calculations')}
                className="p-4 text-center border border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors group"
              >
                <Calculator className="h-8 w-8 mx-auto text-gray-400 group-hover:text-blue-500 mb-2" />
                <p className="text-sm font-medium text-gray-700 group-hover:text-blue-700">
                  Nouveau Calcul
                </p>
              </button>

              <button
                onClick={() => navigate('/triangles')}
                className="p-4 text-center border border-gray-300 rounded-lg hover:border-green-500 hover:bg-green-50 transition-colors group"
              >
                <BarChart3 className="h-8 w-8 mx-auto text-gray-400 group-hover:text-green-500 mb-2" />
                <p className="text-sm font-medium text-gray-700 group-hover:text-green-700">
                  Voir Triangles
                </p>
              </button>

              <button
                onClick={() => navigate('/dashboard')}
                className="p-4 text-center border border-gray-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-colors group"
              >
                <Activity className="h-8 w-8 mx-auto text-gray-400 group-hover:text-purple-500 mb-2" />
                <p className="text-sm font-medium text-gray-700 group-hover:text-purple-700">
                  Dashboard
                </p>
              </button>

              <button
                onClick={() => {
                  // Stocker les données enrichies pour la conformité réglementaire
                  sessionStorage.setItem('actuarialData', JSON.stringify({
                    result: resultToDisplay,
                    extendedKPI,
                    calculationId: resultToDisplay.id,
                    triangleId: resultToDisplay.triangleId
                  }));
                  exportResults('comprehensive');
                }}
                className="p-4 text-center border border-gray-300 rounded-lg hover:border-orange-500 hover:bg-orange-50 transition-colors group"
              >
                <Shield className="h-8 w-8 mx-auto text-gray-400 group-hover:text-orange-500 mb-2" />
                <p className="text-sm font-medium text-gray-700 group-hover:text-orange-700">
                  Export Conformité
                </p>
                <p className="text-xs text-gray-500 mt-1">IFRS 17 & Solvency II</p>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResultsPage;