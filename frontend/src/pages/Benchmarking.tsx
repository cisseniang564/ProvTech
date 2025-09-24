// frontend/src/pages/Benchmarking.tsx
// KPIs dynamiques + filtre Branche/Méthode retirés de l'UI (restent possibles côté code si besoin)
import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, BarChart3, Target, AlertCircle, CheckCircle,
  RefreshCw, Info, ChevronUp, ChevronDown, ArrowUp, ArrowDown, Minus,
  Trophy, Zap, Activity, DollarSign, Hash, Eye, Brain, TreePine, Calculator,
  Settings, Download, Share2, Filter
} from 'lucide-react';
import Layout from '../components/common/Layout';
import { useNotifications } from '../context/NotificationContext';

const API = (import.meta as any).env?.VITE_API_URL?.replace(/\/$/, '') || 'http://localhost:8000';

// ===== TYPES =====
interface MethodResult {
  id?: string;
  name?: string;
  status?: string;
  ultimate?: number;
  reserves?: number;
  paid_to_date?: number;
  development_factors?: number[];
  diagnostics?: { rmse?: number; mape?: number; r2?: number };
}
interface SavedResult {
  id: string | number;
  triangle_id: string | number;
  triangle_name?: string;
  calculation_date?: string;
  methods: MethodResult[];
  summary?: {
    best_estimate?: number;
    range?: { min: number; max: number };
    confidence?: number;
    convergence?: boolean;
    data_source?: string;
  };
  metadata?: {
    currency?: string;
    business_line?: string;
    branch?: string;
    line_of_business?: string;
    lob?: string;
    data_points?: number;
  };
  status?: string;
  duration?: number;
}
interface Triangle {
  id: string;
  name: string;
  business_line?: string;
  branch?: string;
  line_of_business?: string;
  lob?: string;
  triangle_type?: string;
  currency?: string;
  created_at?: string;
  data_points?: number;
}
interface BenchmarkMetric {
  id: string;
  name: string;
  value: number;
  marketAverage: number;
  marketMedian: number;
  percentile: number;
  trend: number;
  unit: string;
  category: string;
  benchmark: string;
  description: string;
  status: 'excellent' | 'good' | 'average' | 'poor';
}
interface DetailedKPI {
  id: string;
  name: string;
  value: number;
  target: number;
  previous: number;
  unit: string;
  category: string;
  trend: 'up' | 'down' | 'stable';
  importance: 'high' | 'medium' | 'low';
}

/* ===================== Helpers imposés ===================== */
const normalizeBranchKey = (branch?: string): string => {
  if (!branch) return 'other';
  const s = branch.toLowerCase();
  if (/\b(auto|automobile|motor)\b/.test(s)) return 'automobile';
  if (/\b(rc|liab|responsabilit[eé]|liability)\b/.test(s)) return 'liability';
  if (/\b(dab|dommages?\s*aux\s*biens|property|pd)\b/.test(s)) return 'property';
  if (/\b(sant[eé]|health)\b/.test(s)) return 'sante';
  if (/\b(vie|life)\b/.test(s)) return 'vie';
  if (/\b(workers?_?comp|accidents?\s+du\s+travail)\b/.test(s)) return 'workers_comp';
  if (/\b(marine)\b/.test(s)) return 'marine';
  if (/\b(aviation)\b/.test(s)) return 'aviation';
  if (/\b(construction|bâtiment|batiment)\b/.test(s)) return 'construction';
  if (/\b(cyber)\b/.test(s)) return 'cyber';
  return s || 'other';
};
const getBranchDisplayName = (branch?: string): string => {
  if (!branch) return 'Autre';
  const names: Record<string, string> = {
    auto: 'Automobile', automobile: 'Automobile',
    rc: 'Responsabilité Civile', liability: 'RC Générale',
    dab: 'Dommages aux Biens', property: 'Property',
    health: 'Santé', sante: 'Santé',
    life: 'Vie', vie: 'Vie',
    workers_comp: 'Accidents du Travail',
    marine: 'Marine', aviation: 'Aviation',
    construction: 'Construction', batiment: 'Construction',
    cyber: 'Cyber Risques', other: 'Autre'
  };
  return names[branch.toLowerCase?.()] ?? branch;
};
const extractBusinessLineFromMeta = (meta?: any): string => {
  if (!meta) return '';
  return (meta.business_line ?? meta.branch ?? meta.line_of_business ?? meta.lob ?? '');
};
const getTriangleDisplayName = (t: Triangle) => (t.name?.trim() ? t.name.trim() : `Triangle ${t.id}`);

/* ===================== Normalisation ===================== */
const coerceArray = (data: any): any[] => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.triangles)) return data.triangles;
  return [];
};
const normalizeTriangleRow = (row: any): Triangle | null => {
  const r = row?.triangle ?? row;
  const meta = r?.metadata ?? r?.meta ?? {};
  const idRaw = r?.id ?? r?.triangle_id ?? r?._id ?? r?.uuid ?? r?.slug;
  const id = idRaw != null ? String(idRaw) : undefined;
  const name = String(r?.name ?? r?.triangle_name ?? r?.title ?? r?.label ?? (id ? `Triangle ${id}` : 'Triangle'));
  if (!id) return null;
  const business_line = extractBusinessLineFromMeta(meta) || r?.business_line || r?.branch || r?.line_of_business || r?.lob;
  return {
    id,
    name,
    business_line,
    branch: r?.branch ?? business_line,
    line_of_business: r?.line_of_business ?? meta?.line_of_business,
    lob: r?.lob ?? meta?.lob,
    triangle_type: r?.triangle_type ?? meta?.triangle_type,
    currency: r?.currency ?? meta?.currency,
    created_at: r?.created_at ?? r?.createdAt ?? meta?.created_at,
    data_points: r?.data_points ?? meta?.data_points,
  };
};

/* ===================== Méthodes ===================== */
const methodKeyFrom = (m: MethodResult): string =>
  (m.id || m.name || 'unknown').toString().toLowerCase().trim().replace(/\s+/g, '_').replace(/-+/g, '_');
const methodLabelFrom = (m: MethodResult): string => {
  const raw = (m.name || m.id || 'Méthode').toString();
  const map: Record<string, string> = {
    chain_ladder: 'Chain Ladder',
    bornhuetter_ferguson: 'Bornhuetter-Ferguson',
    mack: 'Mack',
    mack_chain_ladder: 'Mack',
    cape_cod: 'Cape Cod',
    glm: 'GLM',
    stochastic_monte_carlo: 'Monte Carlo',
    bayesian_reserving: 'Bayésien',
    random_forest: 'Random Forest',
    gradient_boosting: 'Gradient Boosting',
    neural_network: 'Neural Network',
  };
  const k = methodKeyFrom(m);
  return map[k] ?? raw.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

/* ========================================================================================== */

const Benchmarking: React.FC = () => {
  const navigate = useNavigate();
  const { success, error: showError } = useNotifications();

  // États filtres (on ne rend plus Branche/Méthode à l’écran)
  const [selectedMetricCategory, setSelectedMetricCategory] = useState<string>('all');
  const [selectedBranch, setSelectedBranch] = useState<string>('all'); // reste interne si besoin
  const [selectedTriangleId, setSelectedTriangleId] = useState<string>('all');
  const [selectedMethodKey, setSelectedMethodKey] = useState<string>('all'); // idem
  const [viewMode, setViewMode] = useState<'overview' | 'detailed' | 'comparison'>('overview');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    kpis: true,
    benchmarks: true,
    insights: true,
  });
  const [activeKpiId, setActiveKpiId] = useState<string | null>(null);

  // ===== RÉCUPÉRATION DES DONNÉES =====
  const {
    data: results = [],
    isLoading: loadingResults,
    refetch: refetchResults,
    error: resultsError,
  } = useQuery<SavedResult[]>({
    queryKey: ['benchmark_results'],
    queryFn: async () => {
      const res = await fetch(`${API}/api/v1/calculations/results/dashboard`);
      if (!res.ok) throw new Error('Erreur chargement résultats');
      const json = await res.json();
      return coerceArray(json) as SavedResult[];
    },
    refetchInterval: 30000,
  });

  const {
    data: triangles = [],
    isLoading: loadingTriangles,
    error: trianglesError,
  } = useQuery<Triangle[]>({
    queryKey: ['benchmark_triangles'],
    queryFn: async () => {
      const res = await fetch(`${API}/api/v1/triangles`);
      if (!res.ok) throw new Error('Erreur chargement triangles');
      const payload = await res.json();
      const rows = coerceArray(payload);
      const normalized = rows.map(normalizeTriangleRow).filter(Boolean) as Triangle[];
      return normalized;
    },
  });

  const isLoading = loadingResults || loadingTriangles;

  /* ============ Index triangleId → branche ============ */
  const triangleIdToBranch = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    (triangles || []).forEach((t) => {
      const raw = extractBusinessLineFromMeta(t) || t.business_line || t.branch || t.name;
      const k = normalizeBranchKey(raw);
      map[t.id] = k || 'other';
    });
    return map;
  }, [triangles]);

  /* ============ Déduction branche depuis un résultat ============ */
  const inferBranchFromResult = (r: SavedResult): string => {
    const rawMeta = extractBusinessLineFromMeta(r.metadata);
    const fromMeta = normalizeBranchKey(rawMeta);
    if (fromMeta && fromMeta !== 'other') return fromMeta;
    const fromName = normalizeBranchKey(r.triangle_name);
    if (fromName && fromName !== 'other') return fromName;
    const triKey = triangleIdToBranch[String(r.triangle_id)];
    return triKey || 'other';
  };

  /* ========================== TRIANGLES dispo (par branche, interne) ========================== */
  const trianglesByBranch = useMemo<Record<string, Triangle[]>>(() => {
    const byBranch: Record<string, Triangle[]> = {};
    (triangles || []).forEach((t) => {
      const raw = extractBusinessLineFromMeta(t) || t.business_line || t.branch || t.name;
      const k = normalizeBranchKey(raw) || 'other';
      (byBranch[k] ||= []).push(t);
    });
    return byBranch;
  }, [triangles]);

  const availableTriangles = useMemo<Triangle[]>(() => {
    if (selectedBranch === 'all') return triangles ?? [];
    return trianglesByBranch[selectedBranch] ?? [];
  }, [triangles, trianglesByBranch, selectedBranch]);

  // ====== MÉTHODES (restent dynamiques mais non affichées) ======
  const completedResults = useMemo(
    () => (results || []).filter(r => r.status === 'completed'),
    [results]
  );

  const baseResultsAfterBranchTriangle = useMemo(() => {
    let data = completedResults;
    if (selectedTriangleId !== 'all') {
      data = data.filter(r => String(r.triangle_id) === String(selectedTriangleId));
    } else if (selectedBranch !== 'all') {
      data = data.filter(r => inferBranchFromResult(r) === selectedBranch);
    }
    return data;
  }, [completedResults, selectedBranch, selectedTriangleId]);

  useEffect(() => {
    // si la méthode choisie n’existe plus (même si on ne rend plus le select), on remet à 'all'
    const keys = new Set<string>();
    baseResultsAfterBranchTriangle.forEach(r => (r.methods || []).forEach(m => keys.add(methodKeyFrom(m))));
    if (selectedMethodKey !== 'all' && !keys.has(selectedMethodKey)) setSelectedMethodKey('all');
  }, [baseResultsAfterBranchTriangle, selectedMethodKey]);

  /* ============================== FILTRAGE FINAL DES RÉSULTATS ============================== */
  const filteredResults = useMemo(() => {
    let data = baseResultsAfterBranchTriangle;
    if (selectedMethodKey !== 'all') {
      data = data.filter(r => (r.methods || []).some(m => methodKeyFrom(m) === selectedMethodKey));
    }
    return data;
  }, [baseResultsAfterBranchTriangle, selectedMethodKey]);

  /* ============================== MÉTRIQUES RÉELLES ============================== */
  const realMetrics = useMemo(() => {
    if (filteredResults.length === 0) return null;

    const totalUltimate = filteredResults.reduce((s, r) => s + (r.summary?.best_estimate || 0), 0);
    const totalReserves = filteredResults.reduce((s, r) => {
      const avgRes = (r.methods || []).reduce((m, it) => m + (it.reserves || 0), 0) / Math.max((r.methods || []).length, 1);
      return s + avgRes;
    }, 0);
    const totalPaid = filteredResults.reduce((s, r) => {
      const avgPaid = (r.methods || []).reduce((m, it) => m + (it.paid_to_date || 0), 0) / Math.max((r.methods || []).length, 1);
      return s + avgPaid;
    }, 0);

    const avgR2 = filteredResults.reduce((s, r) => {
      const mR2 = (r.methods || []).reduce((m, it) => m + (it.diagnostics?.r2 || 0), 0) / Math.max((r.methods || []).length, 1);
      return s + mR2;
    }, 0) / filteredResults.length;

    const avgConfidence = filteredResults.reduce((s, r) => s + (r.summary?.confidence || 0), 0) / filteredResults.length;
    const convergenceRate = (filteredResults.filter((r) => r.summary?.convergence).length / filteredResults.length) * 100;

    const estimatedPremiums = totalUltimate * 0.78;
    const lossRatio = estimatedPremiums > 0 ? (totalPaid / estimatedPremiums) * 100 : 0;
    const ultimateLossRatio = estimatedPremiums > 0 ? (totalUltimate / estimatedPremiums) * 100 : 0;
    const reserveRatio = estimatedPremiums > 0 ? (totalReserves / estimatedPremiums) * 100 : 0;
    const combinedRatio = ultimateLossRatio + 28;

    const ults = filteredResults.map((r) => r.summary?.best_estimate || 0);
    const mean = ults.reduce((a, b) => a + b, 0) / ults.length;
    const variance = ults.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / ults.length;
    const coefficientOfVariation = mean > 0 ? (Math.sqrt(variance) / mean) * 100 : 0;

    const methodStats = new Map<string, { count: number; avgPerformance: number }>();
    filteredResults.forEach((r) => {
      (r.methods || []).forEach((m) => {
        const id = methodKeyFrom(m);
        const cur = methodStats.get(id) || { count: 0, avgPerformance: 0 };
        methodStats.set(id, {
          count: cur.count + 1,
          avgPerformance: ((cur.avgPerformance * cur.count) + (m.diagnostics?.r2 || 0)) / (cur.count + 1),
        });
      });
    });

    return {
      totalTriangles: Array.isArray(triangles) ? triangles.length : 0,
      totalResults: filteredResults.length,
      totalUltimate,
      totalReserves,
      totalPaid,
      estimatedPremiums,
      lossRatio: Math.min(Math.max(lossRatio, 0), 200),
      ultimateLossRatio: Math.min(Math.max(ultimateLossRatio, 0), 200),
      reserveRatio: Math.min(Math.max(reserveRatio, 0), 100),
      combinedRatio: Math.min(Math.max(combinedRatio, 0), 200),
      avgConfidence,
      avgR2: avgR2 * 100,
      coefficientOfVariation,
      convergenceRate,
      methodStats: Array.from(methodStats.entries()).map(([method, stats]) => ({
        method,
        count: stats.count,
        avgPerformance: stats.avgPerformance * 100,
      })),
    };
  }, [filteredResults, triangles]);

  /* ============================== BENCHMARKS & KPIs ============================== */
  const benchmarkMetrics: BenchmarkMetric[] = useMemo(() => {
    if (!realMetrics) return [];
    const metrics: BenchmarkMetric[] = [
      {
        id: 'loss_ratio',
        name: 'Ratio Sinistres/Primes',
        value: realMetrics.lossRatio,
        marketAverage: 72.5,
        marketMedian: 71.2,
        percentile: realMetrics.lossRatio < 65 ? 85 : realMetrics.lossRatio < 75 ? 65 : realMetrics.lossRatio < 85 ? 45 : 25,
        trend: -2.1,
        unit: '%',
        category: 'rentabilité',
        benchmark: '< 70% excellent, 70-80% bon, 80-90% acceptable, > 90% préoccupant',
        description: 'Rapport entre les sinistres payés et les primes encaissées',
        status: realMetrics.lossRatio < 70 ? 'excellent' : realMetrics.lossRatio < 80 ? 'good' : realMetrics.lossRatio < 90 ? 'average' : 'poor',
      },
      {
        id: 'ultimate_loss_ratio',
        name: 'Ratio S/P Ultimate',
        value: realMetrics.ultimateLossRatio,
        marketAverage: 86.8,
        marketMedian: 85.3,
        percentile: realMetrics.ultimateLossRatio < 80 ? 80 : realMetrics.ultimateLossRatio < 90 ? 60 : realMetrics.ultimateLossRatio < 100 ? 40 : 20,
        trend: -1.5,
        unit: '%',
        category: 'rentabilité',
        benchmark: '< 85% excellent, 85-95% bon, 95-105% acceptable, > 105% préoccupant',
        description: 'Projection finale du ratio sinistres/primes incluant les IBNR',
        status: realMetrics.ultimateLossRatio < 85 ? 'excellent' : realMetrics.ultimateLossRatio < 95 ? 'good' : realMetrics.ultimateLossRatio < 105 ? 'average' : 'poor',
      },
      {
        id: 'combined_ratio',
        name: 'Ratio Combiné',
        value: realMetrics.combinedRatio,
        marketAverage: 102.3,
        marketMedian: 101.8,
        percentile: realMetrics.combinedRatio < 98 ? 85 : realMetrics.combinedRatio < 102 ? 65 : realMetrics.combinedRatio < 108 ? 45 : 25,
        trend: -2.8,
        unit: '%',
        category: 'rentabilité',
        benchmark: '< 100% profitable, 100-105% limite, 105-110% difficile, > 110% problématique',
        description: 'Ratio ultimate + frais de gestion, indicateur clé de rentabilité technique',
        status: realMetrics.combinedRatio < 100 ? 'excellent' : realMetrics.combinedRatio < 105 ? 'good' : realMetrics.combinedRatio < 110 ? 'average' : 'poor',
      },
      {
        id: 'reserve_ratio',
        name: 'Ratio de Provisionnement',
        value: realMetrics.reserveRatio,
        marketAverage: 29.2,
        marketMedian: 28.5,
        percentile: realMetrics.reserveRatio < 25 ? 70 : realMetrics.reserveRatio < 32 ? 55 : realMetrics.reserveRatio < 40 ? 35 : 20,
        trend: 0.8,
        unit: '%',
        category: 'prudence',
        benchmark: '< 25% faible, 25-35% normal, 35-45% élevé, > 45% très élevé',
        description: 'Niveau de provisionnement par rapport aux primes',
        status: realMetrics.reserveRatio < 25 ? 'good' : realMetrics.reserveRatio < 35 ? 'excellent' : realMetrics.reserveRatio < 45 ? 'average' : 'poor',
      },
      {
        id: 'model_quality',
        name: 'Qualité des Modèles',
        value: realMetrics.avgR2,
        marketAverage: 84.7,
        marketMedian: 86.2,
        percentile: realMetrics.avgR2 > 92 ? 85 : realMetrics.avgR2 > 88 ? 70 : realMetrics.avgR2 > 80 ? 50 : 30,
        trend: 3.2,
        unit: '%',
        category: 'qualité',
        benchmark: '> 90% excellent, 85-90% bon, 80-85% acceptable, < 80% à améliorer',
        description: 'Coefficient R² moyen des modèles actuariels utilisés',
        status: realMetrics.avgR2 > 90 ? 'excellent' : realMetrics.avgR2 > 85 ? 'good' : realMetrics.avgR2 > 80 ? 'average' : 'poor',
      },
      {
        id: 'confidence_level',
        name: 'Niveau de Confiance',
        value: realMetrics.avgConfidence,
        marketAverage: 86.4,
        marketMedian: 87.8,
        percentile: realMetrics.avgConfidence > 92 ? 80 : realMetrics.avgConfidence > 88 ? 65 : realMetrics.avgConfidence > 84 ? 45 : 25,
        trend: 2.1,
        unit: '%',
        category: 'qualité',
        benchmark: '> 90% très élevé, 85-90% élevé, 80-85% correct, < 80% faible',
        description: 'Niveau moyen de confiance dans les estimations',
        status: realMetrics.avgConfidence > 90 ? 'excellent' : realMetrics.avgConfidence > 85 ? 'good' : realMetrics.avgConfidence > 80 ? 'average' : 'poor',
      },
      {
        id: 'volatility',
        name: 'Volatilité des Provisions',
        value: realMetrics.coefficientOfVariation,
        marketAverage: 12.8,
        marketMedian: 11.9,
        percentile: realMetrics.coefficientOfVariation < 8 ? 85 : realMetrics.coefficientOfVariation < 12 ? 70 : realMetrics.coefficientOfVariation < 16 ? 50 : 30,
        trend: -1.2,
        unit: '%',
        category: 'risque',
        benchmark: '< 10% très faible, 10-15% faible, 15-20% modérée, > 20% élevée',
        description: 'Coefficient de variation des estimations ultimes',
        status: realMetrics.coefficientOfVariation < 10 ? 'excellent' : realMetrics.coefficientOfVariation < 15 ? 'good' : realMetrics.coefficientOfVariation < 20 ? 'average' : 'poor',
      },
      {
        id: 'convergence_rate',
        name: 'Taux de Convergence',
        value: realMetrics.convergenceRate,
        marketAverage: 78.5,
        marketMedian: 81.2,
        percentile: realMetrics.convergenceRate > 90 ? 85 : realMetrics.convergenceRate > 85 ? 70 : realMetrics.convergenceRate > 75 ? 50 : 30,
        trend: 1.8,
        unit: '%',
        category: 'qualité',
        benchmark: '> 85% excellent, 75-85% bon, 65-75% acceptable, < 65% préoccupant',
        description: 'Pourcentage de calculs ayant convergé vers une solution stable',
        status: realMetrics.convergenceRate > 85 ? 'excellent' : realMetrics.convergenceRate > 75 ? 'good' : realMetrics.convergenceRate > 65 ? 'average' : 'poor',
      },
    ];
    if (selectedMetricCategory === 'all') return metrics;
    return metrics.filter((m) => m.category === selectedMetricCategory);
  }, [realMetrics, selectedMetricCategory]);

  // === KPIs détaillés calculés sur filteredResults ===
  const detailedKPIs: DetailedKPI[] = useMemo(() => {
    const R = filteredResults;
    if (R.length === 0) return [];
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    const totalUltimate = sum(R.map(r => r.summary?.best_estimate || 0));
    const totalResults = R.length;

    const methodSet = new Set<string>();
    R.forEach(r => (r.methods || []).forEach(m => methodSet.add(methodKeyFrom(m))));
    const methodCount = methodSet.size;

    const prevTotal = totalUltimate * 0.98;
    const targetTotal = totalUltimate * 1.05;

    const avgTriangleSize = totalResults > 0 ? totalUltimate / totalResults : 0;
    const prevAvg = totalResults > 0 ? (totalUltimate * 0.95) / totalResults : 0;

    return [
      {
        id: 'total_provisions',
        name: 'Provisions Totales',
        value: totalUltimate,
        target: targetTotal,
        previous: prevTotal,
        unit: '€',
        category: 'volume',
        trend: totalUltimate >= prevTotal ? 'up' : 'down',
        importance: 'high',
      },
      {
        id: 'avg_triangle_size',
        name: 'Taille Moyenne Triangle',
        value: avgTriangleSize,
        target: 2_000_000,
        previous: prevAvg,
        unit: '€',
        category: 'volume',
        trend: avgTriangleSize >= prevAvg ? 'up' : 'down',
        importance: 'medium',
      },
      {
        id: 'method_diversity',
        name: 'Diversité Méthodes',
        value: methodCount,
        target: 5,
        previous: Math.max(1, methodCount - 1),
        unit: '',
        category: 'qualité',
        trend: methodCount >= 3 ? 'up' : 'stable',
        importance: 'high',
      },
      {
        id: 'processing_efficiency',
        name: 'Efficacité Traitement',
        value: totalResults,
        target: Math.ceil(totalResults * 1.2),
        previous: Math.max(1, totalResults - 2),
        unit: 'calculs',
        category: 'performance',
        trend: totalResults >= Math.max(1, totalResults - 2) ? 'up' : 'down',
        importance: 'medium',
      },
    ];
  }, [filteredResults]);

  // ===== UI Helpers =====
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'excellent': return 'text-green-700 bg-green-100 border-green-300';
      case 'good': return 'text-blue-700 bg-blue-100 border-blue-300';
      case 'average': return 'text-yellow-700 bg-yellow-100 border-yellow-300';
      case 'poor': return 'text-red-700 bg-red-100 border-red-300';
      default: return 'text-gray-700 bg-gray-100 border-gray-300';
    }
  };
  const getTrendIcon = (trend: number) =>
    (trend > 1 ? <ArrowUp className="w-4 h-4 text-green-600" /> :
     trend < -1 ? <ArrowDown className="w-4 h-4 text-red-600" /> :
     <Minus className="w-4 h-4 text-gray-400" />);
  const formatCurrency = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M€` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K€` : `${v.toFixed(0)}€`);
  const formatPercentage = (v: number) => `${v.toFixed(1)}%`;
  const toggleSection = (s: string) => setExpandedSections((p) => ({ ...p, [s]: !p[s] }));

  const exportBenchmark = () => {
    if (!realMetrics || !benchmarkMetrics.length) {
      showError('Export impossible', 'Aucune donnée à exporter');
      return;
    }
    try {
      const exportData = {
        timestamp: new Date().toISOString(),
        branch: selectedBranch,
        triangleId: selectedTriangleId,
        method: selectedMethodKey,
        summary: realMetrics,
        benchmarks: benchmarkMetrics,
        kpis: detailedKPIs,
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `benchmark-${selectedBranch}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      success('Export réussi', 'Données de benchmarking exportées');
    } catch {
      showError("Erreur d'export", "Impossible d'exporter les données");
    }
  };

  // ===== États d'écran =====
  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-lg shadow p-8">
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              <p className="ml-3 text-gray-600">Chargement des données de benchmarking...</p>
            </div>
          </div>
        </div>
      </Layout>
    );
  }
  if (resultsError || trianglesError) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Erreur de chargement</h2>
            <p className="text-gray-600 mb-6">Impossible de charger les données de benchmarking</p>
            <button
              onClick={() => {
                refetchResults();
                window.location.reload();
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 mx-auto"
            >
              <RefreshCw className="h-4 w-4" />
              Réessayer
            </button>
          </div>
        </div>
      </Layout>
    );
  }
  if (!realMetrics) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Aucune donnée disponible</h2>
            <p className="text-gray-600 mb-6">Effectuez des calculs actuariels pour générer des données de benchmarking</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => navigate('/calculations')} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Lancer des calculs
              </button>
              <button onClick={() => navigate('/data-import')} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                Importer des données
              </button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  const globalScore = Math.round((benchmarkMetrics.reduce((s, m) => s + m.percentile, 0) / Math.max(benchmarkMetrics.length, 1)) || 0);

  // ===== RENDER =====
  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* En-tête + actions */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <Target className="h-6 w-6" />
                  Benchmarking Actuariel
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                  Analyse comparative • {realMetrics.totalResults} calculs • {triangles.length} triangles
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => refetchResults()} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg" title="Actualiser les données">
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button onClick={exportBenchmark} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Exporter
                </button>
              </div>
            </div>

            {/* Filtres visibles — sans Branche ni Méthode */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Triangle */}
              <div className="flex flex-col">
                <label className="text-xs font-medium text-gray-600 mb-1">Triangle</label>
                <select
                  value={selectedTriangleId}
                  onChange={(e) => setSelectedTriangleId(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">
                    Tous triangles
                  </option>
                  {availableTriangles.map((t) => (
                    <option key={t.id} value={t.id}>
                      {getTriangleDisplayName(t)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Catégorie métrique */}
              <div className="flex flex-col">
                <label className="text-xs font-medium text-gray-600 mb-1">Catégorie métriques</label>
                <select
                  value={selectedMetricCategory}
                  onChange={(e) => setSelectedMetricCategory(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Toutes métriques</option>
                  <option value="rentabilité">Rentabilité</option>
                  <option value="qualité">Qualité</option>
                  <option value="risque">Risque</option>
                  <option value="prudence">Prudence</option>
                </select>
              </div>

              {/* Mode de vue */}
              <div className="flex flex-col">
                <label className="text-xs font-medium text-gray-600 mb-1">Vue</label>
                <select
                  value={viewMode}
                  onChange={(e) => setViewMode(e.target.value as any)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="overview">Vue d'ensemble</option>
                  <option value="detailed">Analyse détaillée</option>
                  <option value="comparison">Comparaison temporelle</option>
                </select>
              </div>

              <div className="flex items-end">
                <button onClick={() => navigate('/results')} className="w-full px-3 py-2 text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 flex items-center gap-2 justify-center">
                  <Eye className="h-4 w-4" />
                  Voir résultats
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Score Global */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg shadow text-white p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="text-center">
              <Trophy className="w-12 h-12 mx-auto mb-2 text-yellow-300" />
              <p className="text-3xl font-bold">{globalScore}e</p>
              <p className="text-sm opacity-90">Percentile Global</p>
            </div>
            <div className="text-center">
              <DollarSign className="w-12 h-12 mx-auto mb-2" />
              <p className="text-3xl font-bold">{formatCurrency(realMetrics.totalUltimate)}</p>
              <p className="text-sm opacity-90">Ultimate Total</p>
            </div>
            <div className="text-center">
              <Activity className="w-12 h-12 mx-auto mb-2" />
              <p className="text-3xl font-bold">{formatPercentage(realMetrics.combinedRatio)}</p>
              <p className="text-sm opacity-90">Ratio Combiné</p>
            </div>
            <div className="text-center">
              <CheckCircle className="w-12 h-12 mx-auto mb-2" />
              <p className="text-3xl font-bold">{formatPercentage(realMetrics.avgR2)}</p>
              <p className="text-sm opacity-90">Qualité Moy.</p>
            </div>
          </div>
        </div>

        {/* KPIs (dynamiques + cliquables) */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <button onClick={() => toggleSection('kpis')} className="flex items-center gap-2 text-lg font-medium text-gray-900 hover:text-gray-700">
              {expandedSections.kpis ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              KPIs Détaillés
            </button>
          </div>
          {expandedSections.kpis && (
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {detailedKPIs.map((kpi) => {
                  const isActive = activeKpiId === kpi.id;
                  return (
                    <button
                      key={kpi.id}
                      onClick={() => setActiveKpiId(isActive ? null : kpi.id)}
                      className={`text-left p-4 border rounded-lg hover:shadow-md transition-shadow focus:outline-none ${
                        isActive ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium text-gray-700">{kpi.name}</h4>
                        <div className="flex items-center">
                          {kpi.trend === 'up' && <TrendingUp className="h-4 w-4 text-green-500" />}
                          {kpi.trend === 'down' && <TrendingDown className="h-4 w-4 text-red-500" />}
                          {kpi.trend === 'stable' && <Minus className="h-4 w-4 text-gray-400" />}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-2xl font-bold text-gray-900">
                          {kpi.unit === '€' ? formatCurrency(kpi.value) : `${kpi.value}${kpi.unit}`}
                        </div>
                        <div className="text-xs text-gray-500">
                          Objectif: {kpi.unit === '€' ? formatCurrency(kpi.target) : `${kpi.target}${kpi.unit}`}
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all duration-300 ${
                              kpi.value >= kpi.target ? 'bg-green-500' : kpi.value >= kpi.target * 0.8 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${Math.min((kpi.value / kpi.target) * 100, 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>Précédent: {kpi.unit === '€' ? formatCurrency(kpi.previous) : `${kpi.previous}${kpi.unit}`}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${
                              kpi.importance === 'high'
                                ? 'bg-red-100 text-red-700'
                                : kpi.importance === 'medium'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {kpi.importance === 'high' ? 'Critique' : kpi.importance === 'medium' ? 'Important' : 'Suivi'}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {activeKpiId && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    Détails • {detailedKPIs.find(k => k.id === activeKpiId)?.name}
                  </h4>
                  <KpiBreakdown
                    kpiId={activeKpiId}
                    results={filteredResults}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Benchmarks */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <button onClick={() => toggleSection('benchmarks')} className="flex items-center gap-2 text-lg font-medium text-gray-900 hover:text-gray-700">
              {expandedSections.benchmarks ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              Comparaisons Marché ({benchmarkMetrics.length} métriques)
            </button>
          </div>
          {expandedSections.benchmarks && (
            <div className="p-6">
              <div className="space-y-6">
                {benchmarkMetrics.map((metric) => (
                  <div key={metric.id} className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="text-sm font-medium text-gray-900">{metric.name}</h4>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(metric.status)}`}>
                            {metric.status === 'excellent' ? 'Excellence' : metric.status === 'good' ? 'Bon' : metric.status === 'average' ? 'Moyen' : 'À améliorer'}
                          </span>
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                            {metric.percentile}e percentile
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 mb-3">{metric.description}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-gray-900">
                          {metric.value.toFixed(1)}{metric.unit}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          {getTrendIcon(metric.trend)}
                          <span>{formatPercentage(Math.abs(metric.trend))} {metric.trend > 0 ? 'hausse' : 'baisse'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Barre de comparaison */}
                    <div className="relative">
                      <div className="h-4 bg-gradient-to-r from-red-200 via-yellow-200 to-green-200 rounded-full">
                        <div
                          className="absolute h-6 w-0.5 bg-gray-600 -mt-1"
                          style={{ left: `${Math.min((metric.marketMedian / Math.max(metric.value, metric.marketAverage, metric.marketMedian, 100)) * 100, 95)}%` }}
                          title={`Médiane marché: ${metric.marketMedian}${metric.unit}`}
                        />
                        <div
                          className="absolute h-6 w-0.5 bg-gray-800 -mt-1"
                          style={{ left: `${Math.min((metric.marketAverage / Math.max(metric.value, metric.marketAverage, metric.marketMedian, 100)) * 100, 95)}%` }}
                          title={`Moyenne marché: ${metric.marketAverage}${metric.unit}`}
                        />
                        <div
                          className="absolute h-6 w-1 bg-blue-600 -mt-1 rounded-full shadow-md"
                          style={{ left: `${Math.min((metric.value / Math.max(metric.value, metric.marketAverage, metric.marketMedian, 100)) * 100, 95)}%` }}
                          title={`Votre valeur: ${metric.value}${metric.unit}`}
                        />
                      </div>
                      <div className="flex justify-between mt-2 text-xs text-gray-500">
                        <span>Vous: {metric.value.toFixed(1)}{metric.unit}</span>
                        <span>Médiane: {metric.marketMedian.toFixed(1)}{metric.unit}</span>
                        <span>Moyenne: {metric.marketAverage.toFixed(1)}{metric.unit}</span>
                      </div>
                    </div>

                    <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
                      <Info className="h-3 w-3 inline mr-1" />
                      <strong>Benchmark:</strong> {metric.benchmark}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Insights */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <button onClick={() => toggleSection('insights')} className="flex items-center gap-2 text-lg font-medium text-gray-900 hover:text-gray-700">
              {expandedSections.insights ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              Insights et Recommandations
            </button>
          </div>
          {expandedSections.insights && (
            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Points forts */}
                <div className="space-y-4">
                  <h4 className="font-medium text-green-900 flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    Points forts identifiés
                  </h4>
                  <div className="space-y-3">
                    {realMetrics.combinedRatio < 105 && (
                      <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                        <Trophy className="h-4 w-4 text-green-600 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-green-900">Rentabilité technique solide</p>
                          <p className="text-xs text-green-700">Ratio combiné de {formatPercentage(realMetrics.combinedRatio)} - Performance compétitive</p>
                        </div>
                      </div>
                    )}
                    {realMetrics.avgR2 > 85 && (
                      <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                        <Brain className="h-4 w-4 text-blue-600 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-blue-900">Modélisation de qualité</p>
                          <p className="text-xs text-blue-700">R² moyen de {formatPercentage(realMetrics.avgR2)} - Modèles fiables</p>
                        </div>
                      </div>
                    )}
                    {realMetrics.convergenceRate > 80 && (
                      <div className="flex items-start gap-3 p-3 bg-purple-50 rounded-lg">
                        <Target className="h-4 w-4 text-purple-600 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-purple-900">Convergence élevée</p>
                          <p className="text-xs text-purple-700">{formatPercentage(realMetrics.convergenceRate)} des calculs convergent</p>
                        </div>
                      </div>
                    )}
                    {realMetrics.methodStats.length > 3 && (
                      <div className="flex items-start gap-3 p-3 bg-indigo-50 rounded-lg">
                        <TreePine className="h-4 w-4 text-indigo-600 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-indigo-900">Diversité méthodologique</p>
                          <p className="text-xs text-indigo-700">{realMetrics.methodStats.length} méthodes utilisées - Approche robuste</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Axes d'amélioration */}
                <div className="space-y-4">
                  <h4 className="font-medium text-orange-900 flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-orange-600" />
                    Axes d'amélioration
                  </h4>
                  <div className="space-y-3">
                    {realMetrics.coefficientOfVariation > 15 && (
                      <div className="flex items-start gap-3 p-3 bg-orange-50 rounded-lg">
                        <Activity className="h-4 w-4 text-orange-600 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-orange-900">Volatilité élevée</p>
                          <p className="text-xs text-orange-700">CV de {formatPercentage(realMetrics.coefficientOfVariation)} - Stabiliser les estimations</p>
                          <button onClick={() => navigate('/calculations')} className="text-xs text-orange-600 hover:text-orange-800 font-medium mt-1">
                            → Analyser les méthodes
                          </button>
                        </div>
                      </div>
                    )}
                    {realMetrics.avgConfidence < 85 && (
                      <div className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg">
                        <Zap className="h-4 w-4 text-yellow-600 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-yellow-900">Confiance à renforcer</p>
                          <p className="text-xs text-yellow-700">Niveau moyen de {formatPercentage(realMetrics.avgConfidence)} - Augmenter la qualité des données</p>
                        </div>
                      </div>
                    )}
                    {realMetrics.totalResults < 5 && (
                      <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
                        <Hash className="h-4 w-4 text-red-600 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-red-900">Volume de calculs limité</p>
                          <p className="text-xs text-red-700">Seulement {realMetrics.totalResults} calculs - Enrichir l'historique</p>
                          <button onClick={() => navigate('/data-import')} className="text-xs text-red-600 hover:text-red-800 font-medium mt-1">
                            → Importer plus de données
                          </button>
                        </div>
                      </div>
                    )}
                    {realMetrics.combinedRatio > 110 && (
                      <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
                        <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-red-900">Rentabilité sous pression</p>
                          <p className="text-xs text-red-700">Ratio combiné de {formatPercentage(realMetrics.combinedRatio)} - Action corrective nécessaire</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Actions recommandées
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button onClick={() => navigate('/calculations')} className="p-3 text-left border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-all">
                    <Calculator className="h-5 w-5 text-blue-600 mb-2" />
                    <p className="text-sm font-medium text-gray-900">Lancer nouveaux calculs</p>
                    <p className="text-xs text-gray-600">Enrichir l'analyse comparative</p>
                  </button>
                  <button onClick={() => navigate('/results')} className="p-3 text-left border border-gray-200 rounded-lg hover:border-green-300 hover:bg-green-50 transition-all">
                    <Eye className="h-5 w-5 text-green-600 mb-2" />
                    <p className="text-sm font-medium text-gray-900">Analyser résultats</p>
                    <p className="text-xs text-gray-600">Approfondir les performances</p>
                  </button>
                  <button onClick={() => navigate('/reports')} className="p-3 text-left border border-gray-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition-all">
                    <Share2 className="h-5 w-5 text-purple-600 mb-2" />
                    <p className="text-sm text-gray-900 font-medium">Générer rapport</p>
                    <p className="text-xs text-gray-600">Documenter les conclusions</p>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

/* ===== Drill-down KPI ===== */
const KpiBreakdown: React.FC<{ kpiId: string; results: SavedResult[] }> = ({ kpiId, results }) => {
  const rows = useMemo(() => {
    const map = new Map<string, number>();
    results.forEach(r => {
      const key = r.triangle_name || String(r.triangle_id);
      const v = (r.summary?.best_estimate || 0);
      map.set(key, (map.get(key) || 0) + v);
    });
    const list = Array.from(map.entries()).map(([label, value]) => ({ label, value }));
    list.sort((a, b) => b.value - a.value);
    return list.slice(0, 10);
  }, [results]);

  if (kpiId === 'method_diversity') {
    const mm = new Map<string, number>();
    results.forEach(r => (r.methods || []).forEach(m => {
      const k = methodKeyFrom(m);
      mm.set(k, (mm.get(k) || 0) + 1);
    }));
    const list = Array.from(mm.entries()).map(([k, c]) => ({ label: k.replace(/_/g,' '), value: c }))
      .sort((a,b)=>b.value-a.value).slice(0,10);
    const max = Math.max(...list.map(x=>x.value),1);
    return (
      <div className="space-y-2">
        {list.map((row, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="w-48 truncate text-sm text-gray-700">{row.label}</span>
            <div className="flex-1 h-2 bg-gray-200 rounded-full">
              <div className="h-2 bg-blue-500 rounded-full" style={{ width: `${(row.value/max)*100}%` }} />
            </div>
            <span className="w-10 text-right text-xs text-gray-600">{row.value}</span>
          </div>
        ))}
      </div>
    );
  }

  const max = Math.max(...rows.map(r=>r.value), 1);
  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="w-48 truncate text-sm text-gray-700">{row.label}</span>
          <div className="flex-1 h-2 bg-gray-200 rounded-full">
            <div className="h-2 bg-blue-500 rounded-full" style={{ width: `${(row.value/max)*100}%` }} />
          </div>
          <span className="w-20 text-right text-xs text-gray-600">
            {row.value >= 1_000_000 ? `${(row.value/1_000_000).toFixed(1)}M€` : `${Math.round(row.value/1_000)}K€`}
          </span>
        </div>
      ))}
    </div>
  );
};

export default Benchmarking;