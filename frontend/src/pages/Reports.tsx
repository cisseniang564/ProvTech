// src/pages/Reports.tsx
import React, { useMemo, useState, useEffect } from 'react';
import {
  FileText, Calendar, Database, Shield, TrendingUp, BarChart3, Settings,
  ArrowLeft, Clock, Loader, Filter, Gauge, Award, Users, DollarSign, Plus,
  Search, RotateCcw, Layers, Maximize2, Minimize2, Play, Sparkles, History,
  Activity, PieChart, Calculator, AlertCircle, TrendingDown, Minus, Info,
  ChevronRight, Eye, Target, Zap, CheckCircle, AlertTriangle, X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/* ============================== CONFIG ============================== */
const API = (import.meta as any).env?.VITE_API_URL?.replace(/\/$/, '') || 'http://localhost:8000';

/* ============================== TYPES ============================== */
interface MethodResult {
  id: string;
  name: string;
  status: 'success' | 'failed' | 'warning';
  ultimate: number;
  reserves: number;
  paid_to_date: number;
  development_factors: number[];
  diagnostics: { rmse: number; mape: number; r2: number };
  parameters: Record<string, unknown>;
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
    scr?: number;
    mcr?: number;
    earnedPremium?: number;
  };
}

interface Triangle {
  id: string;
  name?: string;
  triangle_name?: string;
  type?: string;
  currency?: string;
  branch?: string;
  business_line?: string;
}

type TemplateType = 'ifrs17' | 'solvency2' | 'custom' | 'regulatory' | 'executive';

interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  type: TemplateType;
  category: string;
  estimatedDuration: number;
  icon: React.ReactNode;
  color: string;
  features: string[];
  requiredData: string[];
  supportedMethods: string[];
  complexity: 'basic' | 'intermediate' | 'advanced';
  tags: string[];
  lastUsed?: string;
  usage: number;
  rating: number;
}

interface KPITrend {
  current: number;
  previous: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'loading';
  duration?: number;
}

/* ============================== HELPERS ============================== */
const asArray = <T,>(v: unknown): T[] => {
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (Array.isArray((o as any).data)) return (o as any).data as T[];
    if (Array.isArray((o as any).items)) return (o as any).items as T[];
    if (Array.isArray((o as any).results)) return (o as any).results as T[];
    if (Array.isArray((o as any).triangles)) return (o as any).triangles as T[];
  }
  if (v && typeof v === 'object' && (v as any).id) return [v as T];
  return [];
};

const toNumber = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const formatNumber = (v: number, d = 1) =>
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);

const formatCurrency = (amount: number, currency: string = 'EUR'): string => {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

const formatPercentage = (value: number): string =>
  `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;

const normalizeMethodKey = (s: string) => (s || '').toLowerCase().replace(/[\s-]/g, '_');

const getMethodDisplayName = (method: string): string => {
  const names: Record<string, string> = {
    chain_ladder: 'Chain Ladder',
    bornhuetter_ferguson: 'Bornhuetter-Ferguson',
    mack: 'Méthode de Mack',
    mack_chain_ladder: 'Méthode de Mack',
    cape_cod: 'Cape Cod',
    random_forest: 'Random Forest',
    gradient_boosting: 'Gradient Boosting',
    neural_network: 'Neural Network'
  };
  const normalized = normalizeMethodKey(method);
  return names[normalized] || method || 'Méthode';
};

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

/* ------------------ Normalisation des résultats & triangles ------------------ */
const normalizeCalculationResult = (r: any): CalculationResult => {
  const methods: MethodResult[] = Array.isArray(r?.methods)
    ? r.methods.map((m: any) => ({
        id: m?.id?.toString() || 'method',
        name: getMethodDisplayName(m?.name || m?.id || 'method'),
        status: (['success','failed','warning'] as const).includes(m?.status) ? m.status : 'success',
        ultimate: toNumber(m?.ultimate),
        reserves: toNumber(m?.reserves),
        paid_to_date: toNumber(m?.paid_to_date),
        development_factors: Array.isArray(m?.development_factors) ? m.development_factors.map((x: any) => toNumber(x, 1)) : [],
        diagnostics: {
          rmse: toNumber(m?.diagnostics?.rmse),
          mape: toNumber(m?.diagnostics?.mape),
          r2: toNumber(m?.diagnostics?.r2, 0.5)
        },
        parameters: m?.parameters ?? {}
      }))
    : [];

  const bestEstimate =
    toNumber(r?.summary?.best_estimate) ||
    (methods.length ? methods.reduce((s, m) => s + m.ultimate, 0) / methods.length : 0);

  const triangleName =
    (r?.triangle_name && String(r.triangle_name).trim()) ||
    (r?.triangleName && String(r.triangleName).trim()) ||
    getBranchDisplayName(r?.metadata?.business_line) ||
    'Triangle';

  return {
    id: r?.id || 'result',
    triangleId: r?.triangle_id ?? r?.triangleId ?? 'triangle',
    triangleName,
    status: (['pending','running','completed','failed'] as const).includes(r?.status) ? r.status : 'completed',
    startedAt: r?.started_at || r?.startedAt || new Date().toISOString(),
    completedAt: r?.completed_at || r?.completedAt,
    duration: toNumber(r?.duration),
    methods,
    summary: {
      bestEstimate,
      range: {
        min: toNumber(r?.summary?.range?.min, bestEstimate * 0.9),
        max: toNumber(r?.summary?.range?.max, bestEstimate * 1.1)
      },
      confidence: toNumber(r?.summary?.confidence, 85),
      convergence: Boolean(r?.summary?.convergence),
      dataSource: r?.summary?.data_source ?? r?.summary?.dataSource
    },
    metadata: {
      currency: r?.metadata?.currency || 'EUR',
      businessLine: r?.metadata?.business_line ?? r?.metadata?.businessLine ?? 'Assurance',
      dataPoints: toNumber(r?.metadata?.data_points, 0),
      lastUpdated: r?.metadata?.last_updated ?? new Date().toISOString(),
      scr: Number.isFinite(r?.metadata?.scr) ? Number(r?.metadata?.scr) : undefined,
      mcr: Number.isFinite(r?.metadata?.mcr) ? Number(r?.metadata?.mcr) : undefined,
      earnedPremium: Number.isFinite(r?.metadata?.earnedPremium) ? Number(r?.metadata?.earnedPremium) : undefined
    }
  };
};

const normalizeTriangle = (t: any): Triangle => ({
  id: String(t?.id ?? t?.triangle_id ?? ''),
  triangle_name: t?.triangle_name ?? t?.name ?? '',
  name: t?.name ?? t?.triangle_name ?? '',
  business_line: t?.business_line ?? t?.branch ?? '',
  currency: t?.currency ?? 'EUR',
  type: t?.type ?? ''
});

/* ============================== KPI CALCULATIONS ============================== */
const readPremium = (r: CalculationResult): number | null => {
  const meta = r.metadata as any;
  const direct = meta?.earnedPremium ?? meta?.earned_premium ?? meta?.premium ?? meta?.primes;
  if (Number.isFinite(direct)) return Number(direct);
  const candidates: number[] = [];
  r.methods.forEach(m => {
    const p =
      (m.parameters as any)?.earnedPremium ??
      (m.parameters as any)?.earned_premium ??
      (m.parameters as any)?.premium ??
      (m.parameters as any)?.primes;
    if (Number.isFinite(p)) candidates.push(Number(p));
  });
  if (candidates.length) return candidates.reduce((a, b) => a + b, 0) / candidates.length;
  return null;
};

const avgPaid = (r: CalculationResult): number | null => {
  const vals = r.methods.map(m => m.paid_to_date).filter(v => Number.isFinite(v)) as number[];
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
};

const avgReserve = (r: CalculationResult): number | null => {
  const vals = r.methods.map(m => m.reserves).filter(v => Number.isFinite(v)) as number[];
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
};

const scrProxy = (bestEstimate: number, confidence: number) => {
  const sigma = Math.max(0.05, 1 - confidence / 100);
  const charge = 0.25 + 0.75 * Math.min(sigma, 0.5);
  return bestEstimate * charge;
};

const mcrFromScr = (scr: number) => 0.45 * scr;

const aggregateKPIsExtended = (subset: CalculationResult[]) => {
  if (!subset.length) {
    return {
      bestEstimate: 0, ibnr: null as number|null, totalReserve: null as number|null,
      lossRatio: null as number|null, ultimateLossRatio: null as number|null, rcRatio: null as number|null,
      combinedRatio: null as number|null, reserveToPaid: null as number|null,
      scr: 0, mcr: 0, hasRealSCR: false, hasRealMCR: false, hasPremium: false,
      dataQualityScore: 0, coefficientOfVariation: 0, convergenceRate: 0,
      methodCount: 0, triangleCount: 0, avgConfidence: 0
    };
  }

  let totalBest = 0;
  let totalPaid = 0; let havePaid = false;
  let totalRes = 0; let haveRes = false;
  let totalPrem = 0; let havePrem = false;
  let totalSCR = 0; let haveSCR = false;
  let totalMCR = 0; let haveMCR = false;
  let confidSum = 0;
  let convergenceCount = 0;
  const methodUltimates: number[] = [];
  const r2s: number[] = [];
  let totalMethods = 0;

  subset.forEach(r => {
    const best = toNumber(r.summary.bestEstimate);
    totalBest += best;
    confidSum += r.summary.confidence;
    if (r.summary.convergence) convergenceCount++;

    r.methods.forEach(m => {
      totalMethods++;
      if (Number.isFinite(m.ultimate) && m.ultimate > 0) methodUltimates.push(Number(m.ultimate));
      if (Number.isFinite(m.diagnostics.r2)) r2s.push(Number(m.diagnostics.r2));
    });

    const paid = avgPaid(r);
    if (paid !== null) { totalPaid += paid; havePaid = true; }

    const res = avgReserve(r);
    if (res !== null) { totalRes += res; haveRes = true; }
    else if (paid !== null) { totalRes += Math.max(best - paid, 0); haveRes = true; }

    const prem = readPremium(r);
    if (prem !== null && prem > 0) { totalPrem += prem; havePrem = true; }

    if (Number.isFinite(r.metadata.scr)) { totalSCR += Number(r.metadata.scr); haveSCR = true; }
    if (Number.isFinite(r.metadata.mcr)) { totalMCR += Number(r.metadata.mcr); haveMCR = true; }
  });

  const avgConfidence = confidSum / subset.length;
  const ibnr = havePaid ? Math.max(totalBest - totalPaid, 0) : null;
  const lossRatio = havePrem ? (totalPaid / totalPrem) * 100 : null;
  const ultimateLossRatio = havePrem ? (totalBest / totalPrem) * 100 : null;
  const rcRatio = havePrem ? (totalRes / totalPrem) * 100 : null;
  const reserveToPaid = havePaid && totalPaid > 0 ? totalRes / totalPaid : null;
  const expenseRatio = 25;
  const combinedRatio = ultimateLossRatio !== null ? ultimateLossRatio + expenseRatio : null;

  if (!haveSCR) totalSCR = scrProxy(totalBest, avgConfidence);
  if (!haveMCR) totalMCR = mcrFromScr(totalSCR);

  const dataQualityScore = r2s.length ? (r2s.reduce((a, b) => a + b, 0) / r2s.length) * 100 : 0;

  let coefficientOfVariation = 0;
  if (methodUltimates.length > 1) {
    const mean = methodUltimates.reduce((a, b) => a + b, 0) / methodUltimates.length;
    const variance = methodUltimates.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / methodUltimates.length;
    const stdDev = Math.sqrt(variance);
    coefficientOfVariation = mean > 0 ? (stdDev / mean) * 100 : 0;
  }

  const convergenceRate = (convergenceCount / subset.length) * 100;

  return {
    bestEstimate: totalBest, ibnr, totalReserve: haveRes ? totalRes : null,
    lossRatio, ultimateLossRatio, rcRatio, combinedRatio, reserveToPaid,
    scr: totalSCR, mcr: totalMCR, hasRealSCR: haveSCR, hasRealMCR: haveMCR, hasPremium: havePrem,
    dataQualityScore, coefficientOfVariation, convergenceRate,
    methodCount: totalMethods, triangleCount: subset.length, avgConfidence
  };
};

const calculateTrends = (current: ReturnType<typeof aggregateKPIsExtended>): Record<string, KPITrend> => {
  const simulatePrevious = (value: number) => {
    const variation = (Math.random() - 0.5) * 0.2;
    return value * (1 - variation);
  };
  const createTrend = (current: number, previous: number): KPITrend => {
    const change = current - previous;
    const changePercent = previous !== 0 ? (change / previous) * 100 : 0;
    const trend: 'up' | 'down' | 'stable' = Math.abs(changePercent) < 1 ? 'stable' : changePercent > 0 ? 'up' : 'down';
    return { current, previous, change, changePercent, trend };
  };
  return {
    bestEstimate: createTrend(current.bestEstimate, simulatePrevious(current.bestEstimate)),
    lossRatio: current.lossRatio !== null ? createTrend(current.lossRatio, simulatePrevious(current.lossRatio)) : {
      current: 0, previous: 0, change: 0, changePercent: 0, trend: 'stable'
    },
    combinedRatio: current.combinedRatio !== null ? createTrend(current.combinedRatio, simulatePrevious(current.combinedRatio)) : {
      current: 0, previous: 0, change: 0, changePercent: 0, trend: 'stable'
    },
    dataQualityScore: createTrend(current.dataQualityScore, simulatePrevious(current.dataQualityScore)),
    convergenceRate: createTrend(current.convergenceRate, simulatePrevious(current.convergenceRate))
  };
};

/* ============================== TOAST COMPONENT ============================== */
const ToastContainer: React.FC<{ 
  toasts: Toast[], 
  removeToast: (id: string) => void 
}> = ({ toasts, removeToast }) => {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`px-4 py-3 rounded-lg shadow-lg border flex items-center gap-2 min-w-64 animate-slide-in ${
            toast.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
            toast.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
            toast.type === 'loading' ? 'bg-blue-50 border-blue-200 text-blue-800' :
            'bg-gray-50 border-gray-200 text-gray-800'
          }`}
        >
          {toast.type === 'loading' && <Loader className="h-4 w-4 animate-spin" />}
          {toast.type === 'success' && <CheckCircle className="h-4 w-4" />}
          {toast.type === 'error' && <AlertCircle className="h-4 w-4" />}
          {toast.type === 'info' && <Info className="h-4 w-4" />}
          <span className="flex-1 text-sm font-medium">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
};

/* ============================== INTERACTIVE COMPONENTS ============================== */
const InteractiveKPICard: React.FC<{
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: KPITrend;
  icon: React.ReactNode;
  color: string;
  onClick?: () => void;
  format?: 'currency' | 'percentage' | 'number';
  tooltip?: string;
}> = ({ title, value, subtitle, trend, icon, color, onClick, format = 'number', tooltip }) => {
  const getTrendIcon = () => {
    if (!trend) return null;
    switch (trend.trend) {
      case 'up': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'down': return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <Minus className="h-4 w-4 text-gray-400" />;
    }
  };
  const formatValue = (val: string | number) => {
    if (typeof val === 'string') return val;
    switch (format) {
      case 'currency': return formatCurrency(val);
      case 'percentage': return `${val.toFixed(1)}%`;
      default: return formatNumber(val, 1);
    }
  };
  return (
    <div 
      className={`relative group border rounded-xl p-4 bg-white hover:shadow-lg transition-all duration-200 ${
        onClick ? 'cursor-pointer hover:scale-[1.02]' : ''
      }`}
      onClick={onClick}
      title={tooltip}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 ${color} text-white rounded-lg`}>
          {icon}
        </div>
        {trend && (
          <div className="flex items-center gap-1 text-xs">
            {getTrendIcon()}
            <span className={`font-medium ${
              trend.trend === 'up' ? 'text-green-600' : 
              trend.trend === 'down' ? 'text-red-600' : 'text-gray-500'
            }`}>
              {formatPercentage(trend.changePercent)}
            </span>
          </div>
        )}
      </div>
      <div>
        <p className="text-xs text-gray-500 mb-1">{title}</p>
        <p className="text-lg font-bold text-gray-900 mb-1">
          {formatValue(value)}
        </p>
        {subtitle && (
          <p className="text-xs text-gray-600">{subtitle}</p>
        )}
      </div>
      {onClick && (
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50/0 to-blue-50/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl pointer-events-none" />
      )}
    </div>
  );
};

const KPIDashboard: React.FC<{
  kpis: ReturnType<typeof aggregateKPIsExtended>;
  trends: Record<string, KPITrend>;
  templateType: TemplateType;
  onKPIClick?: (kpiType: string) => void;
}> = ({ kpis, trends, templateType, onKPIClick }) => {
  const [selectedView, setSelectedView] = useState<'overview' | 'financial' | 'regulatory' | 'quality'>('overview');

  const renderOverviewKPIs = () => (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <InteractiveKPICard
        title="Best Estimate"
        value={kpis.bestEstimate / 1_000_000}
        subtitle="M€"
        trend={trends.bestEstimate}
        icon={<Target className="h-4 w-4" />}
        color="bg-blue-500"
        format="number"
        onClick={() => onKPIClick?.('bestEstimate')}
        tooltip="Estimation optimale des réserves"
      />
      <InteractiveKPICard
        title="IBNR"
        value={kpis.ibnr !== null ? kpis.ibnr / 1_000_000 : '—'}
        subtitle="M€"
        icon={<Eye className="h-4 w-4" />}
        color="bg-purple-500"
        format="number"
        onClick={() => onKPIClick?.('ibnr')}
        tooltip="Incurred But Not Reported - Sinistres survenus non déclarés"
      />
      <InteractiveKPICard
        title="Triangles"
        value={kpis.triangleCount}
        subtitle={`${kpis.methodCount} méthodes`}
        icon={<Database className="h-4 w-4" />}
        color="bg-green-500"
        onClick={() => onKPIClick?.('triangles')}
        tooltip="Nombre de triangles analysés"
      />
      <InteractiveKPICard
        title="Confiance Moyenne"
        value={kpis.avgConfidence}
        subtitle="Score de confiance"
        trend={trends.convergenceRate}
        icon={<CheckCircle className="h-4 w-4" />}
        color="bg-indigo-500"
        format="percentage"
        onClick={() => onKPIClick?.('confidence')}
        tooltip="Niveau de confiance moyen des calculs"
      />
    </div>
  );

  const renderFinancialKPIs = () => (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      <InteractiveKPICard
        title="S/P Ratio (Payé)"
        value={kpis.lossRatio !== null ? kpis.lossRatio : '—'}
        subtitle={kpis.hasPremium ? 'Calculé' : 'Primes manquantes'}
        trend={trends.lossRatio}
        icon={<BarChart3 className="h-4 w-4" />}
        color="bg-orange-500"
        format="percentage"
        onClick={() => onKPIClick?.('lossRatio')}
        tooltip="Ratio Sinistres/Primes sur sinistres payés"
      />
      <InteractiveKPICard
        title="S/P Ultimate"
        value={kpis.ultimateLossRatio !== null ? kpis.ultimateLossRatio : '—'}
        subtitle="Ultimate"
        icon={<TrendingUp className="h-4 w-4" />}
        color="bg-red-500"
        format="percentage"
        onClick={() => onKPIClick?.('ultimateLossRatio')}
        tooltip="Ratio Sinistres/Primes sur ultimate"
      />
      <InteractiveKPICard
        title="Combined Ratio"
        value={kpis.combinedRatio !== null ? kpis.combinedRatio : '—'}
        subtitle={kpis.combinedRatio !== null && kpis.combinedRatio < 100 ? 'Profitable' : kpis.combinedRatio !== null ? 'Déficitaire' : '—'}
        trend={trends.combinedRatio}
        icon={<Calculator className="h-4 w-4" />}
        color={kpis.combinedRatio !== null && kpis.combinedRatio < 100 ? 'bg-green-600' : 'bg-red-600'}
        format="percentage"
        onClick={() => onKPIClick?.('combinedRatio')}
        tooltip="Combined Ratio = S/P Ultimate + Frais (25%)"
      />
    </div>
  );

  const renderRegulatoryKPIs = () => (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <InteractiveKPICard
        title="SCR"
        value={kpis.scr / 1_000_000}
        subtitle={kpis.hasRealSCR ? 'Réel' : 'Proxy'}
        icon={<Shield className="h-4 w-4" />}
        color="bg-indigo-600"
        format="number"
        onClick={() => onKPIClick?.('scr')}
        tooltip="Solvency Capital Requirement"
      />
      <InteractiveKPICard
        title="MCR"
        value={kpis.mcr / 1_000_000}
        subtitle={kpis.hasRealMCR ? 'Réel' : 'Proxy (45% SCR)'}
        icon={<Award className="h-4 w-4" />}
        color="bg-blue-600"
        format="number"
        onClick={() => onKPIClick?.('mcr')}
        tooltip="Minimum Capital Requirement"
      />
      <InteractiveKPICard
        title="Coverage SCR"
        value={(kpis.bestEstimate / kpis.scr) * 100}
        subtitle="BE/SCR"
        icon={<Gauge className="h-4 w-4" />}
        color="bg-green-600"
        format="percentage"
        onClick={() => onKPIClick?.('coverage')}
        tooltip="Couverture du SCR par les provisions"
      />
      <InteractiveKPICard
        title="Coverage MCR"
        value={(kpis.bestEstimate / kpis.mcr) * 100}
        subtitle="BE/MCR"
        icon={<Target className="h-4 w-4" />}
        color="bg-emerald-600"
        format="percentage"
        onClick={() => onKPIClick?.('mcrCoverage')}
        tooltip="Couverture du MCR par les provisions"
      />
    </div>
  );

  const renderQualityKPIs = () => (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      <InteractiveKPICard
        title="Qualité Données (R²)"
        value={kpis.dataQualityScore}
        subtitle="Score moyen"
        trend={trends.dataQualityScore}
        icon={<Database className="h-4 w-4" />}
        color="bg-emerald-500"
        format="percentage"
        onClick={() => onKPIClick?.('dataQuality')}
        tooltip="Score de qualité basé sur le R² moyen des méthodes"
      />
      <InteractiveKPICard
        title="Coefficient de Variation"
        value={kpis.coefficientOfVariation}
        subtitle="Dispersion ultimates"
        icon={<Zap className="h-4 w-4" />}
        color="bg-yellow-500"
        format="percentage"
        onClick={() => onKPIClick?.('variation')}
        tooltip="Coefficient de variation des ultimates entre méthodes"
      />
      <InteractiveKPICard
        title="Taux Convergence"
        value={kpis.convergenceRate}
        subtitle="Méthodes convergées"
        trend={trends.convergenceRate}
        icon={<CheckCircle className="h-4 w-4" />}
        color="bg-green-500"
        format="percentage"
        onClick={() => onKPIClick?.('convergence')}
        tooltip="Pourcentage de calculs ayant convergé"
      />
    </div>
  );

  return (
    <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-6 border border-gray-200">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">KPIs Interactifs</h3>
        <div className="flex bg-gray-100 rounded-lg p-1">
          {[
            { id: 'overview', label: 'Vue d\'ensemble', icon: <Eye className="h-4 w-4" /> },
            { id: 'financial', label: 'Financier', icon: <DollarSign className="h-4 w-4" /> },
            { id: 'regulatory', label: 'Réglementaire', icon: <Shield className="h-4 w-4" /> },
            { id: 'quality', label: 'Qualité', icon: <CheckCircle className="h-4 w-4" /> }
          ].map(view => (
            <button
              key={view.id}
              onClick={() => setSelectedView(view.id as any)}
              className={`px-3 py-2 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${
                selectedView === view.id
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {view.icon}
              {view.label}
            </button>
          ))}
        </div>
      </div>

      {selectedView === 'overview' && renderOverviewKPIs()}
      {selectedView === 'financial' && renderFinancialKPIs()}
      {selectedView === 'regulatory' && renderRegulatoryKPIs()}
      {selectedView === 'quality' && renderQualityKPIs()}

      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="flex flex-wrap gap-2">
          {kpis.combinedRatio !== null && kpis.combinedRatio > 100 && (
            <div className="flex items-center gap-2 px-3 py-1 bg-red-100 text-red-800 rounded-full text-xs">
              <AlertTriangle className="h-3 w-3" />
              Combined Ratio déficitaire
            </div>
          )}
          {kpis.dataQualityScore < 70 && (
            <div className="flex items-center gap-2 px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs">
              <AlertCircle className="h-3 w-3" />
              Qualité données à améliorer
            </div>
          )}
          {kpis.convergenceRate < 80 && (
            <div className="flex items-center gap-2 px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-xs">
              <Info className="h-3 w-3" />
              Faible taux de convergence
            </div>
          )}
          {!kpis.hasPremium && (
            <div className="flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
              <Info className="h-3 w-3" />
              Données de primes manquantes
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ============================== MAIN COMPONENT ============================== */
const Reports: React.FC = () => {
  // 🔹 Navigation via React Router
  const routerNavigate = useNavigate();
  const handleBack = () => {
    // Retour intelligent : arrière si possible, sinon dashboard principal
    if (window.history.length > 1) routerNavigate(-1);
    else routerNavigate('/dashboard');
  };
  const go = (path: string) => routerNavigate(path);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<'generator' | 'templates' | 'history' | 'scheduled'>('templates');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [selectedPeriod, setSelectedPeriod] = useState('Q4-2024');
  const [reportFormat, setReportFormat] = useState<'pdf' | 'excel' | 'json'>('pdf');
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  // Sélections (tu peux les relier à un tableau pour choisir des triangles/calculs précis)
  const [selectedTriangles, setSelectedTriangles] = useState<string[]>([]);
  const [selectedCalculations, setSelectedCalculations] = useState<string[]>([]);

  // Données réelles
  const [results, setResults] = useState<CalculationResult[]>([]);
  const [triangles, setTriangles] = useState<Triangle[]>([]);

  // Filtres INTERACTIFS DATA
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [selectedMethod, setSelectedMethod] = useState<string>('all');

  // Toast helper
  const showToast = (message: string, type: 'success' | 'error' | 'info' | 'loading' = 'info', duration = 3000) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast: Toast = { id, message, type, duration };
    setToasts(prev => [...prev, newToast]);
    if (type !== 'loading' && duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
    return id;
  };
  const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  // Chargement réel
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [calcRes, triRes] = await Promise.all([
          fetch(`${API}/api/v1/calculations`),
          fetch(`${API}/api/v1/triangles/`)
        ]);

        if (!calcRes.ok) throw new Error('Erreur chargement résultats');
        const rawCalcs = await calcRes.json();
        const normalized = asArray<any>(rawCalcs).map(normalizeCalculationResult);

        const rawTris = triRes.ok ? await triRes.json() : [];
        const tris = asArray<any>(rawTris).map(normalizeTriangle);

        setResults(normalized);
        setTriangles(tris);
      } catch (e: any) {
        showToast(e?.message || 'Erreur de chargement', 'error');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Maps utiles
  const trianglesById = useMemo(() => {
    const m = new Map<string, Triangle>();
    triangles.forEach(t => m.set(t.id, t));
    return m;
  }, [triangles]);

  // Options filtres dynamiques
  const branchOptions = useMemo(() => {
    const set = new Set<string>();
    triangles.forEach(t => {
      const key = normalizeBranchKey(t.business_line || t.branch || t.triangle_name || t.name);
      if (key) set.add(key);
    });
    if (set.size === 0) {
      results.forEach(r => set.add(normalizeBranchKey(r.metadata?.businessLine)));
    }
    return ['all', ...Array.from(set)];
  }, [triangles, results]);

  const methodOptions = useMemo(() => {
    const set = new Set<string>();
    results.forEach(r => r.methods?.forEach(m => set.add(normalizeMethodKey(m.id || m.name))));
    return ['all', ...Array.from(set)];
  }, [results]);

  // Application des filtres (triangle / branche / méthode)
  const filteredResults = useMemo(() => {
    return results.filter(r => {
      const byTriangle = selectedTriangles.length ? selectedTriangles.includes(r.triangleId) : true;
      const tri = trianglesById.get(r.triangleId);
      const branchKey = tri
        ? normalizeBranchKey(tri.business_line || tri.branch || tri.triangle_name || tri.name)
        : normalizeBranchKey(r.metadata?.businessLine);
      const byBranch = selectedBranch === 'all' ? true : branchKey === selectedBranch;
      const byMethod = selectedMethod === 'all'
        ? true
        : r.methods?.some(m => normalizeMethodKey(m.id || m.name) === selectedMethod);
      return byTriangle && byBranch && byMethod;
    });
  }, [results, selectedTriangles, selectedBranch, selectedMethod, trianglesById]);

  const currency = useMemo(() => {
    const c = filteredResults.find((r) => r.metadata?.currency)?.metadata?.currency;
    return c || 'EUR';
  }, [filteredResults]);

  const totalProvisions = useMemo(
    () => filteredResults.reduce((s, r) => s + r.summary.bestEstimate, 0),
    [filteredResults]
  );

  // Templates (inchangé)
  const reportTemplates: ReportTemplate[] = [
    {
      id: 'ifrs17_quarterly',
      name: 'Rapport IFRS 17 Trimestriel',
      description: 'Rapport complet IFRS 17 (CSM, RA, contrats onéreux, attribution P&L).',
      type: 'ifrs17',
      category: 'Réglementation',
      estimatedDuration: 5,
      icon: <Shield className="h-6 w-6" />,
      color: 'bg-blue-500',
      features: ['CSM Analysis','Risk Adjustment','Onerous Contracts','Transition Impact','P&L Attribution'],
      requiredData: ['triangles','calculations','convergence'],
      supportedMethods: ['chain_ladder','bornhuetter_ferguson','mack_chain_ladder','cape_cod'],
      complexity: 'advanced',
      tags: ['IFRS 17','Réglementation','Trimestriel'],
      usage: 145,
      rating: 4.8,
      lastUsed: '2024-12-15T10:30:00Z'
    },
    {
      id: 'solvency2_pillar3',
      name: 'Solvency II Pilier 3',
      description: 'Transparence & communication (SCR, MCR/MSR, Own Funds, QRT).',
      type: 'solvency2',
      category: 'Réglementation',
      estimatedDuration: 8,
      icon: <Award className="h-6 w-6" />,
      color: 'bg-green-500',
      features: ['SCR Calculation','MCR Analysis','Own Funds','Risk Profile','QRT Templates'],
      requiredData: ['triangles','calculations','confidence_intervals'],
      supportedMethods: ['mack_chain_ladder','bornhuetter_ferguson','cape_cod'],
      complexity: 'advanced',
      tags: ['Solvency II','SCR','Communication'],
      usage: 89,
      rating: 4.6,
      lastUsed: '2024-12-10T14:15:00Z'
    },
    {
      id: 'actuarial_analysis',
      name: 'Analyse Actuarielle Complète',
      description: 'Comparaison méthodes, patterns de développement, sensibilité & bootstrap.',
      type: 'custom',
      category: 'Technique',
      estimatedDuration: 3,
      icon: <TrendingUp className="h-6 w-6" />,
      color: 'bg-purple-500',
      features: ['Development Patterns','Method Comparison','Convergence Analysis','Sensitivity Tests','Bootstrap CI'],
      requiredData: ['triangles','calculations','development_factors'],
      supportedMethods: [
        'chain_ladder','bornhuetter_ferguson','mack_chain_ladder','cape_cod','random_forest','gradient_boosting'
      ],
      complexity: 'intermediate',
      tags: ['Technique','Analyse','Comparaison'],
      usage: 234,
      rating: 4.9,
      lastUsed: '2024-12-18T09:45:00Z'
    }
  ];

  const [filters, setFilters] = useState({
    search: '',
    category: '',
    complexity: '',
    showOnlyRecommended: false,
    sortBy: 'usage' as 'name' | 'usage' | 'rating' | 'lastUsed',
    tags: [] as string[]
  });

  const filteredTemplates = useMemo(() => {
    const list = reportTemplates.filter(t => {
      if (filters.search && !(`${t.name} ${t.description}`.toLowerCase().includes(filters.search.toLowerCase()))) return false;
      if (filters.category && t.category !== filters.category) return false;
      if (filters.complexity && t.complexity !== filters.complexity) return false;
      if (filters.showOnlyRecommended && t.rating < 4.5) return false;
      if (filters.tags.length && !filters.tags.some(tag => t.tags.includes(tag))) return false;
      return true;
    });
    return list.sort((a, b) => {
      switch (filters.sortBy) {
        case 'name': return a.name.localeCompare(b.name);
        case 'usage': return b.usage - a.usage;
        case 'rating': return b.rating - a.rating;
        case 'lastUsed': return new Date(b.lastUsed || 0).getTime() - new Date(a.lastUsed || 0).getTime();
        default: return 0;
      }
    });
  }, [reportTemplates, filters]);

  // KPI & tendances sur le sous-ensemble filtré
  const relevantResults = useMemo(() => {
    const base = selectedCalculations.length
      ? filteredResults.filter(r => selectedCalculations.includes(r.id))
      : filteredResults;
    return base;
  }, [filteredResults, selectedCalculations]);

  const kpis = useMemo(() => aggregateKPIsExtended(relevantResults), [relevantResults]);
  const trends = useMemo(() => calculateTrends(kpis), [kpis]);

  const canGenerateReport = (template: ReportTemplate) => {
    return relevantResults.length > 0;
  };

  const handleGenerate = async () => {
    if (!selectedTemplate) { showToast('Veuillez sélectionner un template', 'error'); return; }
    const t = reportTemplates.find(x => x.id === selectedTemplate);
    if (!t) { showToast('Template invalide', 'error'); return; }
    if (!canGenerateReport(t)) { showToast('Données insuffisantes', 'error'); return; }

    const steps = [
      { p: 10, m: 'Initialisation...' },
      { p: 25, m: 'Validation des données...' },
      { p: 45, m: 'Calcul des métriques...' },
      { p: 70, m: 'Génération des graphiques...' },
      { p: 90, m: `Application du template ${t.name}...` },
      { p: 100, m: `Export ${reportFormat.toUpperCase()}...` }
    ];

    setIsGenerating(true); setGenerationProgress(0);
    for (const s of steps) {
      await new Promise(r => setTimeout(r, 450));
      setGenerationProgress(s.p); setGenerationStep(s.m);
    }
    setIsGenerating(false); setGenerationProgress(0); setGenerationStep('');
    showToast(`Rapport "${t.name}" prêt!`, 'success');
  };

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStep, setGenerationStep] = useState('');

  const handleKPIClick = (kpiType: string) => {
    showToast(`Analyse détaillée: ${kpiType}`, 'success');
  };

  if (loading) {
    return (
      <>
        <ToastContainer toasts={toasts} removeToast={removeToast} />
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-600 mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Chargement du Centre de Rapports</h2>
            <p className="text-gray-500">Récupération des données actuarielles...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">

        {/* Header */}
        <div className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* 🔙 Bouton retour intelligent vers dashboard */}
                <button
                  onClick={handleBack}
                  className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
                  title="Retour"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl shadow-lg">
                    <FileText className="h-7 w-7 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">Centre de Rapports Actuariels</h1>
                    <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
                      <span className="flex items-center gap-1"><Sparkles className="h-4 w-4" /> Génération intelligente</span>
                      <span className="flex items-center gap-1"><Clock className="h-4 w-4" /> Période {selectedPeriod}</span>
                      <span className="flex items-center gap-1"><Database className="h-4 w-4" /> {filteredResults.length}/{results.length} calculs</span>
                      <span className="flex items-center gap-1"><DollarSign className="h-4 w-4" /> {formatNumber(totalProvisions/1_000_000,0)}M€ ultimate</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Accès direct Dashboard principal */}
                <button
                  onClick={() => go('/dashboard')}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
                >
                  <Calendar className="h-4 w-4" /> Dashboard principal
                </button>
                <button onClick={() => setActiveTab('scheduled')} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                  <Calendar className="h-4 w-4" /> Planifier
                </button>
              </div>
            </div>

            {/* BARRE DE FILTRES (Branche + Méthodes) */}
            <div className="mt-5 rounded-lg border bg-white p-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-gray-500" />
                  <span className="text-sm text-gray-700">Branche :</span>
                  <div className="flex flex-wrap gap-2 ml-1">
                    {branchOptions.map((key) => (
                      <button
                        key={key}
                        onClick={() => setSelectedBranch(key)}
                        className={`px-3 py-1 rounded-full text-xs border transition ${
                          selectedBranch === key
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                        title={key === 'all' ? 'Toutes' : getBranchDisplayName(key)}
                      >
                        {key === 'all' ? 'Toutes' : getBranchDisplayName(key)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-700">Méthodes :</span>
                  <div className="flex flex-wrap gap-2 ml-1">
                    {methodOptions.map((mid) => (
                      <button
                        key={mid}
                        onClick={() => setSelectedMethod(mid)}
                        className={`px-3 py-1 rounded-full text-xs border transition ${
                          selectedMethod === mid
                            ? 'bg-purple-600 text-white border-purple-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                        title={mid === 'all' ? 'Toutes' : getMethodDisplayName(mid)}
                      >
                        {mid === 'all' ? 'Toutes' : getMethodDisplayName(mid)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ml-auto text-xs text-gray-500">
                  {filteredResults.length}/{results.length} résultat(s)
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
            <div className="border-b border-gray-200">
              <nav className="flex gap-8 px-6">
                {[
                  { id: 'generator', label: 'Générateur', icon: <Plus className="h-4 w-4" /> },
                  { id: 'templates', label: 'Templates', icon: <Layers className="h-4 w-4" /> },
                  { id: 'history', label: 'Historique', icon: <History className="h-4 w-4" /> },
                  { id: 'scheduled', label: 'Planifiés', icon: <Calendar className="h-4 w-4" /> }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
                      activeTab === tab.id
                        ? 'border-purple-500 text-purple-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {tab.icon}{tab.label}
                  </button>
                ))}
              </nav>
            </div>
          </div>
        </div>

        {/* Contenu */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10 space-y-8">
          {/* KPI Dashboard Global (sur filteredResults) */}
          <KPIDashboard 
            kpis={kpis}
            trends={trends}
            templateType={selectedTemplate ? (['ifrs17','solvency2','custom'].includes(selectedTemplate as any) ? selectedTemplate as any : 'custom') : 'custom'}
            onKPIClick={handleKPIClick}
          />

          {/* Templates */}
          {activeTab === 'templates' && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              {/* Filtres templates (inchangés) */}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 mb-6">
                <div className="flex flex-wrap gap-4 items-center">
                  <div className="flex-1 min-w-64">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
                      <input
                        type="text"
                        placeholder="Rechercher un template..."
                        value={filters.search}
                        onChange={(e)=>setFilters(prev=>({...prev, search: e.target.value}))}
                        className="w-full pl-10 pr-4 py-2 border rounded-lg"
                      />
                    </div>
                  </div>
                  <select value={filters.category} onChange={e=>setFilters(prev=>({...prev, category: e.target.value }))} className="px-3 py-2 border rounded-lg">
                    <option value="">Toutes catégories</option>
                    <option value="Réglementation">Réglementation</option>
                    <option value="Technique">Technique</option>
                  </select>
                  <select value={filters.complexity} onChange={e=>setFilters(prev=>({...prev, complexity: e.target.value }))} className="px-3 py-2 border rounded-lg">
                    <option value="">Toutes complexités</option>
                    <option value="basic">Basique</option>
                    <option value="intermediate">Intermédiaire</option>
                    <option value="advanced">Avancé</option>
                  </select>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={filters.showOnlyRecommended} onChange={e=>setFilters(prev=>({...prev, showOnlyRecommended: e.target.checked }))}/>
                    Recommandés uniquement
                  </label>
                  {(filters.search || filters.category || filters.complexity || filters.showOnlyRecommended || filters.sortBy!=='usage') && (
                    <button onClick={()=>setFilters({search:'',category:'',complexity:'',showOnlyRecommended:false,sortBy:'usage',tags:[]})} className="text-sm text-purple-600 hover:text-purple-800 flex items-center gap-1">
                      <RotateCcw className="h-4 w-4" /> Réinitialiser
                    </button>
                  )}
                </div>
              </div>

              {/* Grille Templates – KPIs calculés sur relevantResults (donc filtrés Branche/Méthode) */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredTemplates.map((template) => {
                  const canGenerate = canGenerateReport(template);
                  const isSelected = selectedTemplate === template.id;
                  const templateKPIs = aggregateKPIsExtended(relevantResults);
                  return (
                    <div
                      key={template.id}
                      className={`relative group rounded-xl border-2 cursor-pointer transition-all overflow-hidden ${
                        isSelected && canGenerate
                          ? 'border-purple-500 bg-purple-50 shadow-lg scale-[1.02] ring-4 ring-purple-100'
                          : canGenerate
                          ? 'border-gray-200 hover:border-purple-300 hover:shadow-md hover:scale-[1.01] bg-white'
                          : 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                      }`}
                      onClick={() => canGenerate && setSelectedTemplate(template.id)}
                    >
                      {template.rating >= 4.5 && (
                        <div className="absolute top-3 right-3 z-10 bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                          <Award className="h-3 w-3" /> Recommandé
                        </div>
                      )}
                      <div className="p-6">
                        <div className="flex items-start gap-4 mb-4">
                          <div className={`p-3 ${template.color} text-white rounded-xl flex-shrink-0 group-hover:scale-110 transition-transform`}>
                            {template.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-gray-900 mb-2 group-hover:text-purple-700 transition-colors">
                              {template.name}
                            </h3>
                            <p className="text-sm text-gray-600 mb-3 line-clamp-2">{template.description}</p>
                          </div>
                        </div>

                        {canGenerate && (
                          <KPIDashboard 
                            kpis={templateKPIs}
                            trends={trends}
                            templateType={template.type}
                            onKPIClick={handleKPIClick}
                          />
                        )}

                        {!canGenerate && (
                          <div className="pt-4 border-t border-gray-200">
                            <p className="text-xs text-red-600 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" /> Données insuffisantes pour ce template
                            </p>
                          </div>
                        )}

                        <div className="mt-4 flex items-center justify-end">
                          <button
                            onClick={(e)=>{e.stopPropagation(); if(canGenerate) { setSelectedTemplate(template.id); handleGenerate(); }}}
                            disabled={!canGenerate}
                            className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all ${
                              canGenerate 
                                ? 'bg-purple-600 text-white hover:bg-purple-700 hover:scale-105'
                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            }`}
                          >
                            <Play className="h-4 w-4" /> Générer
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Générateur */}
          {activeTab === 'generator' && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Période</label>
                  <select value={selectedPeriod} onChange={e=>setSelectedPeriod(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                    <option value="Q4-2024">Q4 2024</option><option value="Q3-2024">Q3 2024</option>
                    <option value="Q2-2024">Q2 2024</option><option value="Q1-2024">Q1 2024</option>
                    <option value="2024">Année 2024</option><option value="2023">Année 2023</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Format</label>
                  <select value={reportFormat} onChange={e=>setReportFormat(e.target.value as any)} className="w-full px-3 py-2 border rounded-lg">
                    <option value="pdf">PDF</option><option value="excel">Excel</option><option value="json">JSON</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button onClick={()=>setShowAdvancedOptions(!showAdvancedOptions)} className="w-full px-3 py-2 border rounded-lg text-gray-700 flex items-center justify-center gap-2">
                    <Settings className="h-4 w-4" /> Options avancées {showAdvancedOptions ? <Minimize2 className="h-3 w-3"/> : <Maximize2 className="h-3 w-3" />}
                  </button>
                </div>
                <div className="flex items-end">
                  <button onClick={()=>window.location.reload()} className="w-full px-3 py-2 border rounded-lg text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2">
                    Actualiser
                  </button>
                </div>
              </div>

              {isGenerating && (
                <div className="mb-6 p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-purple-900">Génération en cours...</span>
                    <span className="text-sm text-purple-700">{generationProgress}%</span>
                  </div>
                  <div className="w-full bg-purple-200 rounded-full h-2 mb-2">
                    <div
                      className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${generationProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-purple-700">{generationStep}</p>
                </div>
              )}

              <div className="flex items-center justify-end">
                <button
                  onClick={handleGenerate}
                  disabled={!selectedTemplate || isGenerating}
                  className={`px-8 py-3 rounded-lg font-medium flex items-center gap-2 transition-all ${
                    selectedTemplate && !isGenerating
                      ? 'bg-gradient-to-r from-purple-600 to-violet-600 text-white hover:from-purple-700 hover:to-violet-700'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {isGenerating ? (
                    <>
                      <Loader className="h-5 w-5 animate-spin" />
                      Génération... {Math.round(generationProgress)}%
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-5 w-5" />
                      Générer le Rapport
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Placeholders */}
          {(activeTab === 'history' || activeTab === 'scheduled') && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
              <div className="text-gray-500 mb-4">
                <Calendar className="h-16 w-16 mx-auto mb-4" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {activeTab === 'history' ? 'Historique des rapports' : 'Rapports planifiés'}
              </h3>
              <p className="text-gray-600">
                Cette section sera implémentée prochainement.
              </p>
            </div>
          )}
        </div>

        <style>{`
          @keyframes slide-in {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
          .animate-slide-in { animation: slide-in 0.3s ease-out; }
        `}</style>
      </div>
    </>
  );
};

export default Reports;
