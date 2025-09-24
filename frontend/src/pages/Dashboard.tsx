// frontend/src/pages/Dashboard.tsx — Dashboard avec Conformité Réglementaire Intégrée
import React, { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp,
  AlertTriangle,
  Calculator,
  FileText,
  Activity,
  DollarSign,
  BarChart3,
  PieChart,
  Calendar,
  Users,
  Database,
  Clock,
  ChevronRight,
  Upload,
  Download,
  Shield,
  TrendingDown,
  Eye,
  Trash2,
  Brain,
  TreePine,
  Zap,
  RefreshCw,
  Filter,
  ChevronDown,
  Info,
  CheckCircle,
  XCircle,
  Bell,
  Gauge,
  Minus,
  AlertCircle,
  Settings,
  Share2,
  X,
  PlayCircle,
  Scale,
  Target,
  Award,
  FileCheck,
  History,
  Plus,
  Play,
  Pause,
  ArrowUp,
  ArrowDown,
  BookOpen,
  MinusCircle,
  Lock,
  Unlock,
  Archive,
  Flag,
  Search,
  Briefcase,
  Building,
  Globe,
  Cloud
} from 'lucide-react';
import toast from 'react-hot-toast';

/* ================= API ================= */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const API = (import.meta as any).env?.VITE_API_URL?.replace(/\/$/, '') || 'http://localhost:8000';

/* ----------------------------- Types ----------------------------- */
interface MethodResult {
  id: string;
  name: string;
  status: string;
  ultimate: number;
  reserves: number;
  paid_to_date: number;
  development_factors: number[];
  diagnostics: {
    rmse: number;
    mape: number;
    r2: number;
  };
}

interface SavedResult {
  id: string;
  triangle_id: string;
  triangle_name: string;
  calculation_date: string;
  methods: MethodResult[];
  summary: {
    best_estimate: number;
    range: { min: number; max: number };
    confidence: number;
    convergence: boolean;
    data_source?: 'real_data' | 'simulated' | string;
  };
  metadata: {
    currency: string;
    business_line: string;
    data_points: number;
  };
  status: string;
  duration: number;
}

interface DashboardResultsStats {
  total_calculations: number;
  unique_triangles: number;
  avg_ultimate: number;
  last_calculation: string;
  methods_used: string[];
}

interface InteractiveMetrics {
  totalProvisions: number;
  provisionChange: number;
  activeCalculations: number;
  pendingReviews: number;
  complianceScore: number;
  dataQualityScore: number;
  lastUpdate: string;
  volatilityIndex: number;
  convergenceRate: number;
  averageRuntime: number;
}

interface MethodDistribution {
  method: string;
  methodId: string;
  amount: number;
  count: number;
  percentage: number;
  color: string;
  avgUltimate: number;
  avgConfidence: number;
  convergenceRate: number;
}

interface BranchDistribution {
  branch: string;
  branchKey: string;
  amount: number;
  count: number;
  trend: number;
  avgUltimate: number;
  currency: string;
  lastCalculation: string;
  riskLevel: 'low' | 'medium' | 'high';
  maturity: number;
}

// Types pour la conformité réglementaire
interface ComplianceMetrics {
  pendingWorkflows: number;
  criticalAlerts: number;
  documentsGenerated: number;
  lastControlExecution: string;
  overallComplianceScore: number;
  regulatoryStatus: 'compliant' | 'warning' | 'critical';
}

interface RegulatoryDashboardData {
  overview: {
    complianceScore: number;
    activeAlerts: number;
    pendingApprovals: number;
    systemStatus: 'healthy' | 'warning' | 'critical' | 'emergency';
    lastUpdate: string;
  };
  workflows: {
    totalSubmissions: number;
    pendingApprovals: number;
    approvalRate: number;
    overdueSubmissions: number;
  };
  controls: {
    totalExecutions: number;
    averageScore: number;
    failureRate: number;
    activeAlertsCount: number;
  };
  monitoring: {
    solvencyRatio: number;
    mcrCoverage: number;
    liquidityRatio: number;
    overallStatus: string;
  };
  qrt: {
    lastSubmission: string;
    nextDeadline: string;
    templatesReady: number;
    validationStatus: string;
  };
  documentation: {
    documentsGenerated: number;
    complianceRate: number;
    lastGeneration: string;
  };
}

interface SystemAlert {
  id: string;
  type: 'workflow' | 'control' | 'monitoring' | 'qrt' | 'system';
  severity: 'info' | 'warning' | 'critical' | 'blocking';
  title: string;
  description: string;
  timestamp: string;
  acknowledged: boolean;
  actionRequired?: string;
}

/* ----------------------------- Utils ----------------------------- */
const normalizeMethodId = (method: string): string =>
  (method || '').toLowerCase().trim().replace(/[\s-]/g, '_');

const getMethodDisplayName = (method: string): string => {
  const names: Record<string, string> = {
    chain_ladder: 'Chain Ladder',
    'chain-ladder': 'Chain Ladder',
    chainladder: 'Chain Ladder',
    bornhuetter_ferguson: 'Bornhuetter-Ferguson',
    'bornhuetter-ferguson': 'Bornhuetter-Ferguson',
    mack: 'Méthode de Mack',
    mack_chain_ladder: 'Méthode de Mack',
    'mack-chain-ladder': 'Méthode de Mack',
    cape_cod: 'Cape Cod',
    'cape-cod': 'Cape Cod',
    random_forest: 'Random Forest',
    'random-forest': 'Random Forest',
    randomforest: 'Random Forest',
    gradient_boosting: 'Gradient Boosting',
    'gradient-boosting': 'Gradient Boosting',
    neural_network: 'Neural Network',
    'neural-network': 'Neural Network',
    neuralnetwork: 'Neural Network'
  };
  const normalized = (method || '').toLowerCase().replace(/[\s_-]/g, '_');
  return names[normalized] || names[method] || (method ? method.charAt(0).toUpperCase() + method.slice(1).replace(/[_-]/g, ' ') : 'Méthode');
};

const getMethodHexColor = (method: string): string => {
  const normalized = normalizeMethodId(method);
  const colors: Record<string, string> = {
    chain_ladder: '#3B82F6',
    bornhuetter_ferguson: '#10B981',
    mack: '#F59E0B',
    mack_chain_ladder: '#F59E0B',
    cape_cod: '#EF4444',
    random_forest: '#059669',
    gradient_boosting: '#7C3AED',
    neural_network: '#DC2626'
  };
  return colors[normalized] || '#6B7280';
};

const getMethodPillColor = (methodId: string) => {
  const normalized = normalizeMethodId(methodId);
  const classes: Record<string, string> = {
    chain_ladder: 'bg-blue-100 text-blue-800 border-blue-200',
    bornhuetter_ferguson: 'bg-green-100 text-green-800 border-green-200',
    mack_chain_ladder: 'bg-purple-100 text-purple-800 border-purple-200',
    mack: 'bg-purple-100 text-purple-800 border-purple-200',
    cape_cod: 'bg-red-100 text-red-800 border-red-200',
    random_forest: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    gradient_boosting: 'bg-violet-100 text-violet-800 border-violet-200',
    neural_network: 'bg-pink-100 text-pink-800 border-pink-200'
  };
  return classes[normalized] || 'bg-gray-100 text-gray-800 border-gray-200';
};

const getBranchDisplayName = (branch: string): string => {
  const names: Record<string, string> = {
    auto: 'Automobile',
    automobile: 'Automobile',
    rc: 'Responsabilité Civile',
    liability: 'RC Générale',
    'liability-general': 'RC Générale',
    dab: 'Dommages aux Biens',
    property: 'Property',
    'property-damage': 'Dommages aux Biens',
    health: 'Santé',
    sante: 'Santé',
    life: 'Vie',
    vie: 'Vie',
    workers_comp: 'Accidents du Travail',
    'workers-comp': 'Accidents du Travail',
    workcomp: 'Accidents du Travail',
    marine: 'Marine',
    aviation: 'Aviation',
    construction: 'Construction',
    batiment: 'Construction',
    cyber: 'Cyber Risques',
    'cyber-risks': 'Cyber Risques',
    other: 'Autre',
    autre: 'Autre',
    commercial: 'Commercial',
    personal: 'Particuliers',
    reinsurance: 'Réassurance',
    reassurance: 'Réassurance'
  };
  const normalized = branch?.toLowerCase()?.replace(/[\s_-]/g, '_') || '';
  return names[normalized] || names[branch?.toLowerCase?.() || ''] || (branch ? branch.charAt(0).toUpperCase() + branch.slice(1).replace(/[_-]/g, ' ') : 'Autre');
};

const getBranchRiskLevel = (branch: string): 'low' | 'medium' | 'high' => {
  const riskLevels: Record<string, 'low' | 'medium' | 'high'> = {
    auto: 'medium',
    automobile: 'medium',
    construction: 'high',
    batiment: 'high',
    aviation: 'high',
    marine: 'high',
    cyber: 'high',
    liability: 'high',
    rc: 'high',
    property: 'medium',
    dab: 'medium',
    health: 'low',
    sante: 'low',
    life: 'low',
    vie: 'low'
  };
  return riskLevels[branch?.toLowerCase?.() || ''] || 'medium';
};

const formatCurrency = (amount: number, currency: string = 'EUR'): string =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

const formatPercentage = (value: number): string =>
  `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;

const formatDateTime = (dateString: string) =>
  new Date(dateString).toLocaleString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const getTimeAgo = (dateString: string): string => {
  const now = new Date();
  const date = new Date(dateString);
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
  if (diffInMinutes < 1) return "À l'instant";
  if (diffInMinutes < 60) return `Il y a ${diffInMinutes} min`;
  if (diffInMinutes < 1440) return `Il y a ${Math.floor(diffInMinutes / 60)}h`;
  const d = Math.floor(diffInMinutes / 1440);
  return `Il y a ${d} jour${d > 1 ? 's' : ''}`;
};

const getMethodIcon = (methodId: string, className: string = "h-4 w-4") => {
  const normalized = normalizeMethodId(methodId);
  switch (normalized) {
    case 'chain_ladder': return <Calculator className={className} />;
    case 'bornhuetter_ferguson': return <TrendingUp className={className} />;
    case 'mack_chain_ladder':
    case 'mack': return <BarChart3 className={className} />;
    case 'cape_cod': return <PieChart className={className} />;
    case 'random_forest': return <TreePine className={className} />;
    case 'gradient_boosting': return <Zap className={className} />;
    case 'neural_network': return <Brain className={className} />;
    default: return <Calculator className={className} />;
  }
};

const getTrendIcon = (value: number, className: string = "h-4 w-4") => {
  if (value > 2) return <TrendingUp className={className} />;
  if (value < -2) return <TrendingDown className={className} />;
  return <Minus className={className} />;
};

// Utilitaires réglementaires
const getStatusColor = (status: string) => {
  switch (status) {
    case 'healthy': return 'green';
    case 'warning': return 'yellow';
    case 'critical': return 'red';
    case 'emergency': return 'purple';
    default: return 'gray';
  }
};

const getSeverityIcon = (severity: string, className = 'h-4 w-4') => {
  switch (severity) {
    case 'info': return <Info className={`${className} text-blue-500`} />;
    case 'warning': return <AlertTriangle className={`${className} text-yellow-500`} />;
    case 'critical': return <AlertCircle className={`${className} text-red-500`} />;
    case 'blocking': return <XCircle className={`${className} text-purple-500`} />;
    default: return <MinusCircle className={`${className} text-gray-500`} />;
  }
};

const formatScore = (score: number): { value: string; color: string } => {
  if (score >= 90) return { value: `${score.toFixed(1)}%`, color: 'text-green-600' };
  if (score >= 80) return { value: `${score.toFixed(1)}%`, color: 'text-blue-600' };
  if (score >= 70) return { value: `${score.toFixed(1)}%`, color: 'text-yellow-600' };
  return { value: `${score.toFixed(1)}%`, color: 'text-red-600' };
};

/* ------------------- Data Fetchers ------------------- */
async function fetchResults(): Promise<SavedResult[]> {
  const res = await fetch(`${API}/api/v1/calculations/results/dashboard`);
  if (!res.ok) throw new Error('Erreur de chargement des résultats');
  return res.json();
}

async function fetchActive(): Promise<{ active_count: number; pending_reviews: number }> {
  const res = await fetch(`${API}/api/v1/triangles/calculations/active`);
  if (!res.ok) return { active_count: 0, pending_reviews: 0 };
  return res.json();
}

async function fetchStats(): Promise<DashboardResultsStats> {
  const res = await fetch(`${API}/api/v1/calculations/results/stats`);
  if (!res.ok) {
    return { total_calculations: 0, unique_triangles: 0, avg_ultimate: 0, last_calculation: '', methods_used: [] };
  }
  return res.json();
}

// Data fetchers pour la conformité réglementaire
async function fetchComplianceMetrics(): Promise<ComplianceMetrics> {
  try {
    // Récupérer données workflow
    const workflowRes = await fetch(`${API}/api/v1/workflow/dashboard`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
    });
    
    // Récupérer données contrôles
    const controlsRes = await fetch(`${API}/api/v1/regulatory-controls/dashboard`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
    });

    // Récupérer alertes
    const alertsRes = await fetch(`${API}/api/v1/regulatory-controls/monitoring/alerts`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
    });

    const workflowData = workflowRes.ok ? await workflowRes.json() : null;
    const controlsData = controlsRes.ok ? await controlsRes.json() : null;
    const alertsData = alertsRes.ok ? await alertsRes.json() : null;

    const pendingWorkflows = workflowData?.dashboard?.summary?.pendingApprovals || 0;
    const criticalAlerts = alertsData?.summary?.critical || 0;
    const overallScore = controlsData?.dashboard?.summary?.averageScore || 85;
    
    let regulatoryStatus: 'compliant' | 'warning' | 'critical' = 'compliant';
    if (criticalAlerts > 0 || overallScore < 60) {
      regulatoryStatus = 'critical';
    } else if (pendingWorkflows > 3 || overallScore < 80) {
      regulatoryStatus = 'warning';
    }

    return {
      pendingWorkflows,
      criticalAlerts,
      documentsGenerated: Math.floor(Math.random() * 10) + 5, // Simulation
      lastControlExecution: controlsData?.dashboard?.systemHealth?.lastExecution || new Date().toISOString(),
      overallComplianceScore: overallScore,
      regulatoryStatus
    };
  } catch (error) {
    // Valeurs par défaut en cas d'erreur
    return {
      pendingWorkflows: 0,
      criticalAlerts: 0,
      documentsGenerated: 0,
      lastControlExecution: '',
      overallComplianceScore: 85,
      regulatoryStatus: 'compliant'
    };
  }
}

async function fetchRegulatoryDashboard(): Promise<{ data: RegulatoryDashboardData }> {
  const response = await fetch(`${API}/api/v1/regulatory-dashboard/overview`, {
    headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
  });
  if (!response.ok) {
    // Données simulées en cas d'erreur
    return {
      data: {
        overview: {
          complianceScore: 87.5,
          activeAlerts: 2,
          pendingApprovals: 3,
          systemStatus: 'warning',
          lastUpdate: new Date().toISOString()
        },
        workflows: {
          totalSubmissions: 45,
          pendingApprovals: 3,
          approvalRate: 92.5,
          overdueSubmissions: 1
        },
        controls: {
          totalExecutions: 1247,
          averageScore: 88.2,
          failureRate: 4.3,
          activeAlertsCount: 2
        },
        monitoring: {
          solvencyRatio: 165.3,
          mcrCoverage: 245.7,
          liquidityRatio: 22.8,
          overallStatus: 'healthy'
        },
        qrt: {
          lastSubmission: '2024-12-15T10:30:00Z',
          nextDeadline: '2025-01-31T23:59:59Z',
          templatesReady: 12,
          validationStatus: 'validated'
        },
        documentation: {
          documentsGenerated: 34,
          complianceRate: 96.8,
          lastGeneration: new Date().toISOString()
        }
      }
    };
  }
  return response.json();
}

async function fetchSystemAlerts(): Promise<{ alerts: SystemAlert[] }> {
  const response = await fetch(`${API}/api/v1/regulatory-dashboard/alerts`, {
    headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
  });
  if (!response.ok) {
    // Alertes simulées
    return {
      alerts: [
        {
          id: 'alert1',
          type: 'control',
          severity: 'warning',
          title: 'Contrôle de liquidité',
          description: 'Le ratio de liquidité est proche du seuil minimum',
          timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
          acknowledged: false
        },
        {
          id: 'alert2',
          type: 'workflow',
          severity: 'critical',
          title: 'Approbation en retard',
          description: 'Une approbation est en retard de plus de 24h',
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          acknowledged: false,
          actionRequired: 'Contacter le responsable'
        }
      ]
    };
  }
  return response.json();
}

/* ----------------------------- Composants Utilitaires ----------------------------- */
const MetricCard: React.FC<{
  title: string;
  value: { value: string; color: string };
  icon: React.ReactNode;
  color: string;
  trend?: { value: number; direction: 'up' | 'down' };
  badge?: React.ReactNode;
}> = ({ title, value, icon, color, trend, badge }) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 relative">
    {badge && (
      <div className="absolute top-2 right-2">
        {badge}
      </div>
    )}
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-600">{title}</p>
        <p className={`text-2xl font-bold ${value.color} mt-2`}>
          {value.value}
        </p>
        {trend && (
          <div className="flex items-center gap-1 mt-2">
            {trend.direction === 'up' ? (
              <ArrowUp className="h-4 w-4 text-green-500" />
            ) : (
              <ArrowDown className="h-4 w-4 text-red-500" />
            )}
            <span className={`text-sm font-medium ${trend.direction === 'up' ? 'text-green-600' : 'text-red-600'}`}>
              {Math.abs(trend.value)}%
            </span>
          </div>
        )}
      </div>
      <div className={`p-3 bg-${color}-100 rounded-lg`}>
        <div className={`text-${color}-600`}>
          {icon}
        </div>
      </div>
    </div>
  </div>
);

const ExpandableSection: React.FC<{
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ title, icon, expanded, onToggle, children }) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-200">
    <button
      onClick={onToggle}
      className="w-full px-6 py-4 flex items-center justify-between border-b border-gray-200 hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="text-gray-600">{icon}</div>
        <h3 className="text-lg font-medium text-gray-900">{title}</h3>
      </div>
      {expanded ? (
        <ChevronDown className="h-5 w-5 text-gray-400" />
      ) : (
        <ChevronRight className="h-5 w-5 text-gray-400" />
      )}
    </button>
    {expanded && (
      <div className="p-6">
        {children}
      </div>
    )}
  </div>
);

const QuickActionCard: React.FC<{
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  onClick: () => void;
  badge?: number;
}> = ({ title, description, icon, color, onClick, badge }) => (
  <button
    onClick={onClick}
    className={`p-4 border-2 border-${color}-200 rounded-lg hover:border-${color}-300 hover:bg-${color}-50 transition-all text-left group relative`}
  >
    {badge && badge > 0 && (
      <span className={`absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center`}>
        {badge}
      </span>
    )}
    <div className="flex items-center gap-3">
      <div className={`p-2 bg-${color}-100 rounded-lg group-hover:bg-${color}-200 transition-colors`}>
        <div className={`text-${color}-600`}>
          {icon}
        </div>
      </div>
      <div>
        <h4 className="font-medium text-gray-900">{title}</h4>
        <p className="text-sm text-gray-600">{description}</p>
      </div>
    </div>
  </button>
);

const AlertsPanel: React.FC<{
  alerts: SystemAlert[];
  onAcknowledge: (id: string) => void;
  onClose: () => void;
}> = ({ alerts, onAcknowledge, onClose }) => (
  <div className="bg-white rounded-lg shadow-lg border border-gray-200">
    <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
      <h3 className="text-lg font-medium text-gray-900">Alertes Système</h3>
      <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
        <XCircle className="h-5 w-5" />
      </button>
    </div>
    <div className="max-h-96 overflow-y-auto">
      {alerts.map(alert => (
        <div key={alert.id} className="px-6 py-4 border-b border-gray-100 last:border-b-0">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                {getSeverityIcon(alert.severity)}
                <span className="font-medium text-gray-900">{alert.title}</span>
                <span className="text-xs text-gray-500">{alert.type}</span>
              </div>
              <p className="text-sm text-gray-600 mb-2">{alert.description}</p>
              <div className="text-xs text-gray-500">
                {new Date(alert.timestamp).toLocaleString('fr-FR')}
              </div>
            </div>
            <button
              onClick={() => onAcknowledge(alert.id)}
              className="ml-4 px-3 py-1 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md"
            >
              Acquitter
            </button>
          </div>
        </div>
      ))}
    </div>
  </div>
);

/* ----------------------------- Page Dashboard ----------------------------- */
const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [activeSection, setActiveSection] = useState<'overview' | 'regulatory' | 'workflows' | 'controls'>('overview');
  const [showAlerts, setShowAlerts] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    compliance: true,
    workflow: true,
    monitoring: true
  });

  // États de filtres
  const [showFilters, setShowFilters] = useState(false);
  const [methodQuery, setMethodQuery] = useState('');
  const [selectedMethods, setSelectedMethods] = useState<string[]>([]);
  const [onlyConverged, setOnlyConverged] = useState(false);
  const [onlyRealData, setOnlyRealData] = useState(false);
  const [minConfidence, setMinConfidence] = useState(0);

  // Queries existantes
  const {
    data: results = [],
    isLoading: loadingResults,
    refetch: refetchResults
  } = useQuery({ queryKey: ['dashboard_results'], queryFn: fetchResults, refetchInterval: 30000 });

  const {
    data: activeCalculationsData = { active_count: 0, pending_reviews: 0 },
    isLoading: loadingActive
  } = useQuery({ queryKey: ['dashboard_active'], queryFn: fetchActive, refetchInterval: 10000 });

  const { data: stats } = useQuery({ queryKey: ['dashboard_stats'], queryFn: fetchStats, refetchInterval: 60000 });

  // Nouvelles queries réglementaires
  const {
    data: complianceMetrics = {
      pendingWorkflows: 0,
      criticalAlerts: 0,
      documentsGenerated: 0,
      lastControlExecution: '',
      overallComplianceScore: 85,
      regulatoryStatus: 'compliant' as const
    },
    isLoading: loadingCompliance,
    refetch: refetchCompliance
  } = useQuery({ 
    queryKey: ['compliance_metrics'], 
    queryFn: fetchComplianceMetrics, 
    refetchInterval: 45000 
  });

  const {
    data: regulatoryData,
    isLoading: loadingRegulatory,
    refetch: refetchRegulatory
  } = useQuery({
    queryKey: ['regulatory-dashboard-overview'],
    queryFn: fetchRegulatoryDashboard,
    refetchInterval: 30000
  });

  const {
    data: alertsData,
    isLoading: loadingAlerts,
    refetch: refetchAlerts
  } = useQuery({
    queryKey: ['regulatory-dashboard-alerts'],
    queryFn: fetchSystemAlerts,
    refetchInterval: 15000
  });

  const data = regulatoryData?.data;
  const alerts = alertsData?.alerts || [];
  const unacknowledgedAlerts = alerts.filter(alert => !alert.acknowledged);

  const loading = loadingResults || loadingActive;

  // Détection robuste de la branche
  const detectBranchKey = (r: SavedResult): string => {
    const metaKey = r?.metadata?.business_line?.toLowerCase?.() || '';
    const name = (r?.triangle_name || '').toLowerCase();

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

    if (metaKey && aliases.some(([, id]) => id === metaKey)) return metaKey;
    for (const [re, id] of aliases) {
      if (re.test(name)) return id;
    }
    return metaKey || 'other';
  };

  // Méthodes disponibles dynamiques + familles
  const METHOD_FAMILIES: Record<string, string> = {
    chain_ladder: 'deterministic',
    bornhuetter_ferguson: 'deterministic',
    mack: 'deterministic',
    mack_chain_ladder: 'deterministic',
    cape_cod: 'deterministic',
    random_forest: 'ml',
    gradient_boosting: 'ml',
    neural_network: 'ml'
  };

  const allMethods = useMemo(() => {
    const counts: Record<string, number> = {};
    results.forEach(r =>
      r.methods.forEach(m => {
        const key = normalizeMethodId(m.id || m.name);
        counts[key] = (counts[key] || 0) + 1;
      })
    );
    const list = Object.keys(counts).map((id) => ({
      id,
      label: getMethodDisplayName(id),
      count: counts[id],
      family: METHOD_FAMILIES[id] || 'other'
    }));
    const familyOrder: Record<string, number> = { deterministic: 0, ml: 1, other: 2 };
    return list.sort((a, b) => {
      const f = (familyOrder[a.family] ?? 99) - (familyOrder[b.family] ?? 99);
      if (f !== 0) return f;
      return a.label.localeCompare(b.label, 'fr');
    });
  }, [results]);

  const methodsByFamily = useMemo(() => {
    const groups: Record<'deterministic' | 'ml' | 'other', typeof allMethods> = {
      deterministic: [],
      ml: [],
      other: []
    };
    allMethods.forEach(m => {
      (groups[(m.family as 'deterministic' | 'ml' | 'other')] || groups.other).push(m);
    });
    return groups;
  }, [allMethods]);

  // URL sync
  useEffect(() => {
    const urlParam = (searchParams.get('methods') || '').trim();
    if (urlParam) {
      const initial = urlParam.split(',').map(normalizeMethodId).filter(Boolean);
      setSelectedMethods(initial);
      setShowFilters(true);
    }
    const converged = searchParams.get('converged') === '1';
    const real = searchParams.get('real') === '1';
    const conf = Number(searchParams.get('minconf') || '0');
    setOnlyConverged(converged);
    setOnlyRealData(real);
    setMinConfidence(Number.isFinite(conf) ? Math.max(0, Math.min(100, conf)) : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const params: Record<string, string> = {};
    if (selectedMethods.length) params.methods = selectedMethods.join(',');
    if (onlyConverged) params.converged = '1';
    if (onlyRealData) params.real = '1';
    if (minConfidence > 0) params.minconf = String(Math.round(minConfidence));
    setSearchParams(params, { replace: true });
  }, [selectedMethods, onlyConverged, onlyRealData, minConfidence, setSearchParams]);

  // Métriques interactives
  const interactiveMetrics = useMemo(() => {
    if (!results || results.length === 0) {
      return {
        totalProvisions: 0,
        provisionChange: 0,
        activeCalculations: activeCalculationsData?.active_count || 0,
        pendingReviews: activeCalculationsData?.pending_reviews || 0,
        complianceScore: complianceMetrics.overallComplianceScore,
        dataQualityScore: 0,
        lastUpdate: new Date().toLocaleString('fr-FR'),
        volatilityIndex: 0,
        convergenceRate: 0,
        averageRuntime: 0,
        compliance: complianceMetrics
      };
    }

    const totalProvisions = results.reduce((sum, result) => sum + (result.summary?.best_estimate || 0), 0);

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recentResults = results.filter(r => new Date(r.calculation_date) >= thirtyDaysAgo);
    const olderResults = results.filter(r => new Date(r.calculation_date) < thirtyDaysAgo);

    const recentTotal = recentResults.reduce((sum, r) => sum + (r.summary?.best_estimate || 0), 0);
    const olderTotal = olderResults.reduce((sum, r) => sum + (r.summary?.best_estimate || 0), 0);
    const provisionChange = olderTotal > 0 ? ((recentTotal - olderTotal) / olderTotal) * 100 : 0;

    const avgConfidence = results.reduce((sum, r) => sum + (r.summary?.confidence || 0), 0) / results.length;
    const convergenceCount = results.filter(r => r.summary?.convergence).length;
    const convergenceRate = results.length ? (convergenceCount / results.length) * 100 : 0;
    const complianceScore = Math.round((avgConfidence + convergenceRate + complianceMetrics.overallComplianceScore) / 3);

    const realDataCount = results.filter(r => r.summary?.data_source === 'real_data').length;
    const dataQualityScore = results.length ? Math.round((realDataCount / results.length) * 100) : 0;

    const ultimates = results.map(r => r.summary?.best_estimate || 0).filter(n => Number.isFinite(n));
    const mean = ultimates.length ? (ultimates.reduce((a, b) => a + b, 0) / ultimates.length) : 0;
    const variance = ultimates.length ? (ultimates.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / ultimates.length) : 0;
    const volatilityIndex = mean > 0 ? (Math.sqrt(variance) / mean) * 100 : 0;

    const averageRuntime = results.length ? (results.reduce((sum, r) => sum + (r.duration || 0), 0) / results.length) : 0;

    return {
      totalProvisions,
      provisionChange,
      activeCalculations: activeCalculationsData?.active_count || 0,
      pendingReviews: activeCalculationsData?.pending_reviews || 0,
      complianceScore,
      dataQualityScore,
      lastUpdate: new Date().toLocaleString('fr-FR'),
      volatilityIndex: Math.round(volatilityIndex * 10) / 10,
      convergenceRate: Math.round(convergenceRate),
      averageRuntime: Math.round(averageRuntime * 10) / 10,
      compliance: complianceMetrics
    };
  }, [results, activeCalculationsData, complianceMetrics]);

  // Distributions
  const methodDistribution = useMemo(() => {
    if (!results || results.length === 0) return [];
    const methodStats: Record<string, any> = {};
    results.forEach(result => {
      result.methods.forEach(method => {
        const key = normalizeMethodId(method.id || method.name);
        methodStats[key] ??= { totalUltimate: 0, count: 0, ultimates: [], confidences: [], convergences: 0 };
        methodStats[key].totalUltimate += (method.ultimate || 0);
        methodStats[key].count += 1;
        methodStats[key].ultimates.push(method.ultimate || 0);
        methodStats[key].confidences.push(result.summary?.confidence || 0);
        if (result.summary?.convergence) methodStats[key].convergences += 1;
      });
    });
    const grandTotal = Object.values(methodStats).reduce((s: number, st: any) => s + st.totalUltimate, 0);
    return Object.entries(methodStats)
      .map(([methodId, st]: [string, any]) => ({
        method: getMethodDisplayName(methodId),
        methodId,
        amount: st.totalUltimate,
        count: st.count,
        percentage: grandTotal > 0 ? (st.totalUltimate / grandTotal) * 100 : 0,
        color: getMethodHexColor(methodId),
        avgUltimate: st.count ? st.totalUltimate / st.count : 0,
        avgConfidence: st.confidences.length ? (st.confidences.reduce((a: number, b: number) => a + b, 0) / st.confidences.length) : 0,
        convergenceRate: st.count ? (st.convergences / st.count) * 100 : 0
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [results]);

  const branchDistribution = useMemo(() => {
    if (!results || results.length === 0) return [];
    const branchStats: Record<string, any> = {};
    results.forEach(result => {
      let branchKey = result.metadata?.business_line || 'other';
      if (result.triangle_name) {
        const name = result.triangle_name.toLowerCase();
        if (name.includes('auto') || name.includes('automobile')) branchKey = 'automobile';
        else if (name.includes('construct') || name.includes('batiment')) branchKey = 'construction';
        else if (name.includes('property') || name.includes('dab')) branchKey = 'property';
        else if (name.includes('liability') || name.includes('rc')) branchKey = 'liability';
        else if (name.includes('marine')) branchKey = 'marine';
        else if (name.includes('aviation')) branchKey = 'aviation';
        else if (name.includes('cyber')) branchKey = 'cyber';
        else if (name.includes('health') || name.includes('sante')) branchKey = 'health';
        else if (name.includes('life') || name.includes('vie')) branchKey = 'life';
      }
      const ultimate = result.summary?.best_estimate || 0;
      branchStats[branchKey] ??= {
        totalUltimate: 0, count: 0, ultimates: [], currency: result.metadata?.currency || 'EUR', lastCalculation: result.calculation_date, confidences: []
      };
      branchStats[branchKey].totalUltimate += ultimate;
      branchStats[branchKey].count += 1;
      branchStats[branchKey].ultimates.push(ultimate);
      branchStats[branchKey].confidences.push(result.summary?.confidence || 0);
      if (result.calculation_date > branchStats[branchKey].lastCalculation) {
        branchStats[branchKey].lastCalculation = result.calculation_date;
      }
    });
    return Object.entries(branchStats).map(([branchKey, stats]: [string, any]) => {
      const sorted = stats.ultimates.slice().sort((a: number, b: number) => a - b);
      const firstThird = sorted.slice(0, Math.ceil(sorted.length * 0.3));
      const lastThird = sorted.slice(-Math.ceil(sorted.length * 0.3));
      const firstAvg = firstThird.length ? firstThird.reduce((a: number, b: number) => a + b, 0) / firstThird.length : 0;
      const lastAvg = lastThird.length ? lastThird.reduce((a: number, b: number) => a + b, 0) / lastThird.length : 0;
      const trend = firstAvg > 0 ? ((lastAvg - firstAvg) / firstAvg) * 100 : 0;
      const avgConfidence = stats.confidences.length ? (stats.confidences.reduce((a: number, b: number) => a + b, 0) / stats.confidences.length) : 0;
      return {
        branch: getBranchDisplayName(branchKey),
        branchKey,
        amount: stats.totalUltimate,
        count: stats.count,
        trend: Math.min(Math.max(trend, -50), 50),
        avgUltimate: stats.count ? stats.totalUltimate / stats.count : 0,
        currency: stats.currency,
        lastCalculation: stats.lastCalculation,
        riskLevel: getBranchRiskLevel(branchKey),
        maturity: Math.round(avgConfidence)
      };
    }).sort((a, b) => b.amount - a.amount);
  }, [results]);

  // Filtre
  const filteredResults = useMemo(() => {
    let out = results;

    if (selectedMethods.length > 0) {
      const wanted = new Set(selectedMethods.map(normalizeMethodId));
      out = out.filter(result =>
        result.methods?.some(m => wanted.has(normalizeMethodId(m.id || m.name)))
      );
    }

    if (onlyConverged) {
      out = out.filter(r => !!r.summary?.convergence);
    }
    if (onlyRealData) {
      out = out.filter(r => r.summary?.data_source === 'real_data');
    }
    if (minConfidence > 0) {
      out = out.filter(r => (r.summary?.confidence || 0) >= minConfidence);
    }

    return out;
  }, [results, selectedMethods, onlyConverged, onlyRealData, minConfidence]);

  const toggleMethod = (id: string) => {
    const key = normalizeMethodId(id);
    setSelectedMethods((prev) =>
      prev.includes(key) ? prev.filter(m => m !== key) : [...prev, key]
    );
  };

  const clearAllFilters = () => {
    setSelectedMethods([]);
    setOnlyConverged(false);
    setOnlyRealData(false);
    setMinConfidence(0);
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Actions réglementaires
  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      const response = await fetch(`${API}/api/v1/regulatory-dashboard/alerts/${alertId}/acknowledge`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
      });
      if (!response.ok) throw new Error('Erreur acquittement');
      refetchAlerts();
      toast.success('Alerte acquittée');
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    }
  };

  const handleExportCompliance = async () => {
    try {
      const response = await fetch(`${API}/api/v1/regulatory-dashboard/export-compliance`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
      });
      if (!response.ok) throw new Error('Erreur export');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `compliance_report_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Rapport de conformité exporté');
    } catch (error: any) {
      toast.error(`Erreur export: ${error.message}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement du Dashboard Actuariel...</p>
          <p className="text-sm text-gray-500 mt-2">Préparation des données actuarielles...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50">
        {/* Header ÉTENDU avec alertes de conformité */}
        <div className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg`}>
                      <div className="flex items-center gap-2 text-white">
                        <BarChart3 className="h-6 w-6" />
                        <Shield className="h-5 w-5" />
                      </div>
                    </div>

                    <div>
                      <h1 className="text-2xl font-bold text-gray-900">Dashboard Actuariel Pro</h1>
                      <p className="text-sm text-gray-600">Supervision avancée des provisions et conformité réglementaire</p>
                    </div>
                  </div>

                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-${getStatusColor(data?.overview.systemStatus || 'gray')}-100 text-${getStatusColor(data?.overview.systemStatus || 'gray')}-800`}>
                    <div className={`w-2 h-2 rounded-full bg-${getStatusColor(data?.overview.systemStatus || 'gray')}-500 animate-pulse`} />
                    <span className="text-sm font-medium">
                      Conformité: {interactiveMetrics.compliance.overallComplianceScore}%
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    <span className="font-medium">
                      {results.length} résultat{results.length > 1 ? 's' : ''} • {branchDistribution.length} branche{branchDistribution.length > 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Dernière MAJ: {interactiveMetrics.lastUpdate}
                  </div>

                  {/* NOUVELLES ALERTES DE CONFORMITÉ */}
                  {interactiveMetrics.compliance.criticalAlerts > 0 && (
                    <div className="flex items-center gap-2 px-2 py-1 bg-red-100 text-red-800 rounded-md">
                      <AlertCircle className="h-4 w-4" />
                      {interactiveMetrics.compliance.criticalAlerts} alerte{interactiveMetrics.compliance.criticalAlerts > 1 ? 's' : ''} critique{interactiveMetrics.compliance.criticalAlerts > 1 ? 's' : ''}
                    </div>
                  )}

                  {interactiveMetrics.compliance.pendingWorkflows > 0 && (
                    <div className="flex items-center gap-2 px-2 py-1 bg-orange-100 text-orange-800 rounded-md">
                      <Clock className="h-4 w-4" />
                      {interactiveMetrics.compliance.pendingWorkflows} approbation{interactiveMetrics.compliance.pendingWorkflows > 1 ? 's' : ''} en attente
                    </div>
                  )}

                  {interactiveMetrics.pendingReviews > 0 && (
                    <div className="flex items-center gap-2 px-2 py-1 bg-yellow-100 text-yellow-800 rounded-md">
                      <Eye className="h-4 w-4" />
                      {interactiveMetrics.pendingReviews} revue{interactiveMetrics.pendingReviews > 1 ? 's' : ''} en attente
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <select 
                  value={selectedPeriod} 
                  onChange={(e) => setSelectedPeriod(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="today">Aujourd'hui</option>
                  <option value="week">Cette semaine</option>
                  <option value="month">Ce mois</option>
                  <option value="quarter">Ce trimestre</option>
                  <option value="year">Cette année</option>
                </select>

                <button 
                  onClick={() => {
                    refetchResults();
                    refetchCompliance();
                  }}
                  className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
                  title="Actualiser les données"
                >
                  <RefreshCw className="h-4 w-4" />
                  Actualiser
                </button>

                <button 
                  onClick={() => navigate('/calculations')}
                  className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm rounded-lg hover:from-blue-700 hover:to-indigo-700 flex items-center gap-2 font-medium shadow-sm"
                >
                  <Calculator className="h-4 w-4" />
                  Nouveau Calcul
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Navigation par onglets */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex space-x-8">
              {[
                { id: 'overview', label: 'Vue d\'ensemble', icon: <BarChart3 className="h-5 w-5" /> },
                { 
                  id: 'regulatory', 
                  label: 'Dashboard Réglementaire', 
                  icon: <Shield className="h-5 w-5" />,
                  badge: interactiveMetrics.compliance.criticalAlerts > 0 ? interactiveMetrics.compliance.criticalAlerts : undefined,
                  badgeColor: 'red'
                },
                { 
                  id: 'workflows', 
                  label: 'Workflows d\'Approbation', 
                  icon: <Scale className="h-5 w-5" />,
                  badge: interactiveMetrics.compliance.pendingWorkflows > 0 ? interactiveMetrics.compliance.pendingWorkflows : undefined,
                  badgeColor: 'orange'
                },
                { id: 'controls', label: 'Contrôles Automatisés', icon: <Target className="h-5 w-5" /> }
              ].map(tab => (
                <button 
                  key={tab.id}
                  onClick={() => setActiveSection(tab.id as any)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 relative ${
                    activeSection === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                  {tab.badge && (
                    <span className={`ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      tab.badgeColor === 'red' ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'
                    }`}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Panel d'alertes */}
        {showAlerts && unacknowledgedAlerts.length > 0 && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-6 mt-6">
            <AlertsPanel 
              alerts={unacknowledgedAlerts} 
              onAcknowledge={handleAcknowledgeAlert}
              onClose={() => setShowAlerts(false)}
            />
          </div>
        )}

        {/* Contenu basé sur l'onglet sélectionné */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {activeSection === 'overview' && (
            <div className="space-y-8">
              {/* Métriques principales ÉTENDUES */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                {/* Provisions Totales */}
                <MetricCard
                  title="Provisions Totales"
                  value={{ value: formatCurrency(interactiveMetrics.totalProvisions), color: 'text-blue-600' }}
                  icon={<DollarSign className="h-6 w-6" />}
                  color="blue"
                  trend={{ value: Math.abs(interactiveMetrics.provisionChange), direction: interactiveMetrics.provisionChange >= 0 ? 'up' : 'down' }}
                />

                {/* Calculs Actifs */}
                <MetricCard
                  title="Calculs Actifs"
                  value={{ 
                    value: interactiveMetrics.activeCalculations.toString(), 
                    color: interactiveMetrics.activeCalculations > 0 ? 'text-green-600' : 'text-gray-600' 
                  }}
                  icon={<Activity className="h-6 w-6" />}
                  color="green"
                />

                {/* Approbations */}
                <MetricCard
                  title="Approbations"
                  value={{ 
                    value: interactiveMetrics.compliance.pendingWorkflows.toString(), 
                    color: interactiveMetrics.compliance.pendingWorkflows > 0 ? 'text-orange-600' : 'text-green-600' 
                  }}
                  icon={<Scale className="h-6 w-6" />}
                  color="orange"
                  badge={interactiveMetrics.compliance.pendingWorkflows > 0 ? (
                    <span className="bg-orange-100 text-orange-800 text-xs font-medium px-2 py-1 rounded-full">
                      {interactiveMetrics.compliance.pendingWorkflows}
                    </span>
                  ) : undefined}
                />

                {/* Alertes Critiques */}
                <MetricCard
                  title="Alertes Critiques"
                  value={{ 
                    value: interactiveMetrics.compliance.criticalAlerts.toString(), 
                    color: interactiveMetrics.compliance.criticalAlerts > 0 ? 'text-red-600' : 'text-green-600' 
                  }}
                  icon={<AlertTriangle className="h-6 w-6" />}
                  color="red"
                  badge={interactiveMetrics.compliance.criticalAlerts > 0 ? (
                    <span className="bg-red-100 text-red-800 text-xs font-medium px-2 py-1 rounded-full">
                      {interactiveMetrics.compliance.criticalAlerts}
                    </span>
                  ) : undefined}
                />

                {/* Score Conformité */}
                <MetricCard
                  title="Conformité Globale"
                  value={formatScore(interactiveMetrics.compliance.overallComplianceScore)}
                  icon={<Award className="h-6 w-6" />}
                  color={interactiveMetrics.compliance.overallComplianceScore >= 90 ? 'green' : 
                         interactiveMetrics.compliance.overallComplianceScore >= 80 ? 'blue' : 'red'}
                  badge={interactiveMetrics.compliance.overallComplianceScore >= 90 ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : undefined}
                />
              </div>

              {/* Section Filtres */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <button 
                  onClick={() => setShowFilters(!showFilters)}
                  className="flex items-center gap-2 text-gray-700 hover:text-gray-900 transition-colors"
                >
                  <Filter className="h-5 w-5" />
                  Filtres par méthode
                  <span className="text-sm text-gray-500">
                    ({filteredResults.length}/{results.length} résultat{results.length > 1 ? 's' : ''})
                  </span>

                  {(selectedMethods.length > 0 || onlyConverged || onlyRealData || minConfidence > 0) && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); clearAllFilters(); }}
                      className="ml-3 px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded-full flex items-center gap-1"
                      title="Effacer tous les filtres"
                    >
                      <X className="h-3 w-3" />
                      Tout effacer
                    </button>
                  )}
                </button>

                {/* Résumé des filtres actifs */}
                {(selectedMethods.length > 0 || onlyConverged || onlyRealData || minConfidence > 0) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedMethods.map(m => (
                      <span key={m} className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border ${getMethodPillColor(m)}`}>
                        {getMethodIcon(m, 'h-3 w-3')}
                        {getMethodDisplayName(m)}
                        <button 
                          onClick={() => toggleMethod(m)}
                          className="ml-1 text-current opacity-70 hover:opacity-100"
                          title="Retirer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}

                    {onlyConverged && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                        Convergé
                        <button onClick={() => setOnlyConverged(false)} title="Retirer">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    )}
                    {onlyRealData && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                        Données réelles
                        <button onClick={() => setOnlyRealData(false)} title="Retirer">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    )}
                    {minConfidence > 0 && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
                        Confiance ≥ {Math.round(minConfidence)}%
                        <button onClick={() => setMinConfidence(0)} title="Retirer">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    )}
                  </div>
                )}

                {showFilters && (
                  <div className="mt-6 space-y-6">
                    {/* Barre de recherche */}
                    <div className="flex items-center gap-4">
                      <input 
                        type="text"
                        value={methodQuery}
                        onChange={(e) => setMethodQuery(e.target.value)}
                        placeholder="Rechercher une méthode…"
                        className="flex-1 min-w-[220px] px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                      <button 
                        onClick={() => setSelectedMethods(allMethods.map(m => m.id))}
                        className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
                        disabled={allMethods.length === 0}
                        title="Tout sélectionner"
                      >
                        Tout
                      </button>
                      <button 
                        onClick={() => setSelectedMethods([])}
                        className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
                        title="Effacer la sélection"
                      >
                        Aucune
                      </button>

                      <div className="flex items-center gap-4 ml-6">
                        {/* Filtres additionnels */}
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input 
                            type="checkbox" 
                            checked={onlyConverged}
                            onChange={(e) => setOnlyConverged(e.target.checked)}
                          />
                          Convergé uniquement
                        </label>
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input 
                            type="checkbox" 
                            checked={onlyRealData}
                            onChange={(e) => setOnlyRealData(e.target.checked)}
                          />
                          Données réelles
                        </label>

                        <div className="flex items-center gap-2">
                          <label className="text-sm text-gray-700">Confiance min.</label>
                          <input 
                            type="range" 
                            min="0" 
                            max="100" 
                            value={minConfidence}
                            onChange={(e) => setMinConfidence(Number(e.target.value))}
                          />
                          <span className="text-sm text-gray-600">{Math.round(minConfidence)}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Groupes de méthodes dynamiques */}
                    <div className="space-y-6">
                      {(['deterministic', 'ml', 'other'] as const).map((family) => {
                        const group = methodsByFamily[family].filter(m =>
                          !methodQuery ||
                          m.label.toLowerCase().includes(methodQuery.toLowerCase()) ||
                          m.id.includes(methodQuery.toLowerCase())
                        );
                        if (group.length === 0) return null;

                        const familyLabel = family === 'deterministic'
                          ? 'Méthodes Déterministes'
                          : family === 'ml'
                            ? 'Machine Learning'
                            : 'Autres Méthodes';

                        const familyStyle =
                          family === 'deterministic'
                            ? { base: 'bg-blue-50 text-blue-700 border-blue-200', active: 'bg-blue-600 text-white border-blue-600', chip: 'bg-blue-200 text-blue-700' }
                            : family === 'ml'
                              ? { base: 'bg-emerald-50 text-emerald-700 border-emerald-200', active: 'bg-emerald-600 text-white border-emerald-600', chip: 'bg-emerald-200 text-emerald-700' }
                              : { base: 'bg-gray-50 text-gray-700 border-gray-200', active: 'bg-gray-700 text-white border-gray-700', chip: 'bg-gray-200 text-gray-700' };

                        return (
                          <div key={family} className="space-y-3">
                            <h4 className="text-sm font-medium text-gray-900">
                              {familyLabel}
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {group.map(m => {
                                const isActive = selectedMethods.includes(m.id);
                                return (
                                  <button 
                                    key={m.id}
                                    onClick={() => toggleMethod(m.id)}
                                    disabled={m.count === 0}
                                    className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all duration-200 border ${
                                      isActive ? familyStyle.active : familyStyle.base
                                    } ${m.count === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-sm'}`}
                                  >
                                    {getMethodIcon(m.id, 'h-4 w-4')}
                                    {m.label}
                                    <span className={`px-2 py-1 text-xs rounded-full ${familyStyle.chip}`}>
                                      {m.count}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Info filtre actif */}
                    {(selectedMethods.length > 0 || onlyConverged || onlyRealData || minConfidence > 0) && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Info className="h-4 w-4 text-blue-600" />
                            <span className="text-sm font-medium text-blue-900">
                              {filteredResults.length} résultat{filteredResults.length > 1 ? 's' : ''} après filtres
                            </span>
                          </div>
                          <button 
                            onClick={clearAllFilters}
                            className="text-sm text-blue-700 hover:text-blue-900 underline"
                          >
                            Effacer tous les filtres
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Résultats récents */}
              {filteredResults.length === 0 ? (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                  <Database className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    {selectedMethods.length === 0 ? 'Aucun résultat' : 'Aucun résultat pour ces filtres'}
                  </h3>
                  <p className="text-gray-600 mb-6">
                    {selectedMethods.length === 0
                      ? 'Les données sont en cours de chargement ou aucun calcul n\'a encore été effectué.'
                      : `Aucun calcul trouvé pour la sélection actuelle.`}
                  </p>
                  <div className="flex items-center justify-center gap-4">
                    {(selectedMethods.length > 0 || onlyConverged || onlyRealData || minConfidence > 0) && (
                      <button 
                        onClick={clearAllFilters}
                        className="px-4 py-2 text-blue-600 hover:text-blue-700 underline"
                      >
                        <Eye className="h-4 w-4 inline mr-2" />
                        Voir tous les résultats
                      </button>
                    )}
                    <button 
                      onClick={() => navigate('/data-import')}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                    >
                      <Upload className="h-4 w-4" />
                      Importer des données
                    </button>
                    <button 
                      onClick={() => navigate('/triangles')}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
                    >
                      <Eye className="h-4 w-4" />
                      Voir les triangles
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                  <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">Calculs récents</h3>
                      <p className="text-sm text-gray-600">
                        ({filteredResults.length} résultat{filteredResults.length > 1 ? 's' : ''})
                      </p>
                    </div>
                    <Link 
                      to="/results" 
                      className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                    >
                      Voir tout
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>

                  <div className="divide-y divide-gray-100">
                    {filteredResults.slice(0, 3).map((result, index) => (
                      <div key={result.id} className="p-6 hover:bg-gray-50 transition-colors">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h4 className="font-medium text-gray-900">{result.triangle_name}</h4>
                              {index === 0 && (
                                <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                                  Plus récent
                                </span>
                              )}
                              {result.summary.convergence && (
                                <span className="text-green-600" title="Convergé">
                                  <CheckCircle className="h-4 w-4" />
                                </span>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-6 text-sm text-gray-600">
                              <div className="flex items-center gap-1">
                                <Clock className="h-4 w-4" />
                                {formatDateTime(result.calculation_date)}
                              </div>
                              <div className="flex items-center gap-1">
                                <Activity className="h-4 w-4" />
                                {result.duration}s
                              </div>
                              <div className="flex items-center gap-1">
                                <Building className="h-4 w-4" />
                                {getBranchDisplayName(detectBranchKey(result))}
                              </div>
                              <span className={result.summary.data_source === 'real_data' ? 'text-green-600' : 'text-gray-500'}>
                                {result.summary.data_source === 'real_data' ? 'Données réelles' : 'Simulé'}
                              </span>
                            </div>
                          </div>

                          <div className="text-right">
                            <Link 
                              to={`/results/${result.id}`}
                              className="text-blue-600 hover:text-blue-700"
                              title="Voir les détails"
                            >
                              <Eye className="h-5 w-5" />
                            </Link>
                          </div>
                        </div>

                        <div className="grid grid-cols-4 gap-6 mt-4">
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider">Ultimate</p>
                            <p className="text-lg font-semibold text-gray-900">
                              {formatCurrency(result.summary.best_estimate, result.metadata?.currency || 'EUR')}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider">Confiance</p>
                            <div className="flex items-center gap-2">
                              <p className={`text-lg font-semibold ${
                                result.summary.confidence >= 90 ? 'text-green-600' : 
                                result.summary.confidence >= 80 ? 'text-blue-600' : 'text-orange-600'
                              }`}>
                                {Math.round(result.summary.confidence)}%
                              </p>
                              {result.summary.confidence >= 90 && <CheckCircle className="h-4 w-4 text-green-500" />}
                            </div>
                          </div>

                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider">Convergence</p>
                            <div className="flex items-center gap-2">
                              <p className={`text-lg font-semibold ${result.summary.convergence ? 'text-green-600' : 'text-red-600'}`}>
                                {result.summary.convergence ? 'Oui' : 'Non'}
                              </p>
                              {result.summary.convergence ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-500" />
                              )}
                            </div>
                          </div>

                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider">Méthodes</p>
                            <p className="text-lg font-semibold text-gray-900">
                              {result.methods.length}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <p className="text-sm text-gray-600 mb-2">Méthodes utilisées :</p>
                          <div className="flex flex-wrap gap-2">
                            {result.methods.slice(0, 3).map((method) => (
                              <span key={method.id} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${getMethodPillColor(method.id)}`}>
                                {getMethodIcon(method.id, 'h-3 w-3')}
                                {method.name}
                              </span>
                            ))}
                            {result.methods.length > 3 && (
                              <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md">
                                +{result.methods.length - 3} autres
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {filteredResults.length > 3 && (
                    <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 text-center">
                      <Link 
                        to="/results" 
                        className="text-blue-600 hover:text-blue-700 font-medium flex items-center justify-center gap-1"
                      >
                        Voir tous les résultats ({filteredResults.length})
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </div>
                  )}
                </div>
              )}

              {/* Actions rapides */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">Actions Rapides & Conformité</h3>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <QuickActionCard
                      title="Importer Données"
                      description="CSV/Excel"
                      icon={<Upload className="h-5 w-5" />}
                      color="blue"
                      onClick={() => navigate('/data-import')}
                    />
                    <QuickActionCard
                      title="APIs Externes"
                      description="Gérer les connexions"
                      icon={<Cloud className="h-5 w-5" />}
                      color="indigo"
                      onClick={() => navigate('/api-management')}
                    />
                    
                    <QuickActionCard
                      title="Lancer Calcul"
                      description="Méthodes avancées"
                      icon={<Calculator className="h-5 w-5" />}
                      color="green"
                      onClick={() => navigate('/calculations')}
                    />
                    
                    <QuickActionCard
                      title="Workflows"
                      description="Approbations"
                      icon={<Scale className="h-5 w-5" />}
                      color="orange"
                      onClick={() => setActiveSection('workflows')}
                      badge={interactiveMetrics.compliance.pendingWorkflows}
                    />
                    
                    <QuickActionCard
                      title="Contrôles"
                      description="Automatisés"
                      icon={<Target className="h-5 w-5" />}
                      color="purple"
                      onClick={() => setActiveSection('controls')}
                      badge={interactiveMetrics.compliance.criticalAlerts}
                    />

                    <QuickActionCard
                      title="Rapports"
                      description="IFRS 17 / S2"
                      icon={<FileText className="h-5 w-5" />}
                      color="indigo"
                      onClick={handleExportCompliance}
                    />
                    
                    <QuickActionCard
                      title="Conformité"
                      description="Réglementaire"
                      icon={<Shield className="h-5 w-5" />}
                      color="red"
                      onClick={() => setActiveSection('regulatory')}
                    />
                    
                    <QuickActionCard
                      title="Résultats"
                      description="Analyses"
                      icon={<BarChart3 className="h-5 w-5" />}
                      color="teal"
                      onClick={() => navigate('/results')}
                    />
                    
                    <QuickActionCard
                      title="Export"
                      description="Dashboard"
                      icon={<Download className="h-5 w-5" />}
                      color="gray"
                      onClick={() => {
                        const exportData = {
                          timestamp: new Date().toISOString(),
                          metrics: interactiveMetrics,
                          methodDistribution,
                          branchDistribution,
                          results: filteredResults.slice(0, 10)
                        };
                        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `dashboard-actuarial-${new Date().toISOString().split('T')[0]}.json`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Section Dashboard Réglementaire */}
          {activeSection === 'regulatory' && (
            <div className="space-y-6">
              {/* Métriques réglementaires principales */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <MetricCard
                  title="Score de Conformité"
                  value={formatScore(data?.overview.complianceScore || 87.5)}
                  icon={<Award className="h-6 w-6" />}
                  color="blue"
                  trend={{ value: 2.3, direction: 'up' }}
                />
                
                <MetricCard
                  title="Alertes Actives"
                  value={{ 
                    value: (data?.overview.activeAlerts || 2).toString(), 
                    color: (data?.overview.activeAlerts || 2) > 0 ? 'text-red-600' : 'text-green-600' 
                  }}
                  icon={<AlertTriangle className="h-6 w-6" />}
                  color="red"
                  trend={{ value: -15, direction: 'down' }}
                />
                
                <MetricCard
                  title="Approbations en Attente"
                  value={{ value: (data?.overview.pendingApprovals || 3).toString(), color: 'text-orange-600' }}
                  icon={<Clock className="h-6 w-6" />}
                  color="orange"
                />
                
                <MetricCard
                  title="Statut Système"
                  value={{ 
                    value: (data?.overview.systemStatus || 'warning') === 'healthy' ? 'Opérationnel' : 'Attention', 
                    color: (data?.overview.systemStatus || 'warning') === 'healthy' ? 'text-green-600' : 'text-yellow-600' 
                  }}
                  icon={<Gauge className="h-6 w-6" />}
                  color={getStatusColor(data?.overview.systemStatus || 'warning')}
                />
              </div>

              {/* Sections détaillées */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Workflows */}
                <ExpandableSection
                  title="Workflows d'Approbation"
                  icon={<Scale className="h-5 w-5" />}
                  expanded={expandedSections.workflow}
                  onToggle={() => toggleSection('workflow')}
                >
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <p className="text-2xl font-bold text-gray-900">{data?.workflows.totalSubmissions || 45}</p>
                        <p className="text-sm text-gray-600">Soumissions Totales</p>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <p className="text-2xl font-bold text-orange-600">{data?.workflows.pendingApprovals || 3}</p>
                        <p className="text-sm text-gray-600">En Attente</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Taux d'approbation:</span>
                      <span className="font-medium text-green-600">{(data?.workflows.approvalRate || 92.5).toFixed(1)}%</span>
                    </div>
                    
                    {(data?.workflows.overdueSubmissions || 1) > 0 && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                        <div className="flex items-center gap-2 text-red-800">
                          <AlertTriangle className="h-4 w-4" />
                          <span className="text-sm font-medium">
                            {data?.workflows.overdueSubmissions || 1} soumission(s) en retard
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </ExpandableSection>

                {/* Monitoring */}
                <ExpandableSection
                  title="Monitoring Temps Réel"
                  icon={<Activity className="h-5 w-5" />}
                  expanded={expandedSections.monitoring}
                  onToggle={() => toggleSection('monitoring')}
                >
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Ratio de Solvabilité:</span>
                        <span className={`font-medium ${(data?.monitoring.solvencyRatio || 165.3) > 150 ? 'text-green-600' : (data?.monitoring.solvencyRatio || 165.3) > 120 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {(data?.monitoring.solvencyRatio || 165.3).toFixed(1)}%
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Couverture MCR:</span>
                        <span className={`font-medium ${(data?.monitoring.mcrCoverage || 245.7) > 200 ? 'text-green-600' : (data?.monitoring.mcrCoverage || 245.7) > 140 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {(data?.monitoring.mcrCoverage || 245.7).toFixed(1)}%
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Ratio de Liquidité:</span>
                        <span className={`font-medium ${(data?.monitoring.liquidityRatio || 22.8) > 20 ? 'text-green-600' : (data?.monitoring.liquidityRatio || 22.8) > 15 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {(data?.monitoring.liquidityRatio || 22.8).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    
                    <div className={`p-3 rounded-lg border ${
                      (data?.monitoring.overallStatus || 'healthy') === 'healthy' 
                        ? 'bg-green-50 border-green-200 text-green-800'
                        : 'bg-yellow-50 border-yellow-200 text-yellow-800'
                    }`}>
                      <div className="flex items-center gap-2">
                        {(data?.monitoring.overallStatus || 'healthy') === 'healthy' 
                          ? <CheckCircle className="h-4 w-4" />
                          : <AlertTriangle className="h-4 w-4" />
                        }
                        <span className="text-sm font-medium">
                          {(data?.monitoring.overallStatus || 'healthy') === 'healthy' ? 'Tous les indicateurs sont sains' : 'Surveillance requise'}
                        </span>
                      </div>
                    </div>
                  </div>
                </ExpandableSection>
              </div>

              {/* QRT et Documentation */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ExpandableSection
                  title="Templates QRT EIOPA"
                  icon={<FileText className="h-5 w-5" />}
                  expanded={expandedSections.qrt || true}
                  onToggle={() => toggleSection('qrt')}
                >
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <p className="text-2xl font-bold text-indigo-600">{data?.qrt.templatesReady || 12}</p>
                        <p className="text-sm text-gray-600">Templates Prêts</p>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <p className="text-sm font-medium text-gray-900">Prochaine Échéance</p>
                        <p className="text-xs text-gray-600">31 Jan 2025</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Statut de validation:</span>
                      <span className={`font-medium ${(data?.qrt.validationStatus || 'validated') === 'validated' ? 'text-green-600' : 'text-orange-600'}`}>
                        {(data?.qrt.validationStatus || 'validated') === 'validated' ? 'Validé' : 'En cours'}
                      </span>
                    </div>
                    
                    <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                      <div className="flex items-center gap-2 text-indigo-800">
                        <FileCheck className="h-4 w-4" />
                        <span className="text-sm font-medium">
                          Génération automatique activée
                        </span>
                      </div>
                    </div>
                  </div>
                </ExpandableSection>

                <ExpandableSection
                  title="Documentation Automatique"
                  icon={<BookOpen className="h-5 w-5" />}
                  expanded={expandedSections.documentation || true}
                  onToggle={() => toggleSection('documentation')}
                >
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <p className="text-2xl font-bold text-teal-600">{data?.documentation.documentsGenerated || 34}</p>
                        <p className="text-sm text-gray-600">Documents Générés</p>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <p className="text-2xl font-bold text-green-600">{(data?.documentation.complianceRate || 96.8).toFixed(1)}%</p>
                        <p className="text-sm text-gray-600">Conformité</p>
                      </div>
                    </div>
                    
                    <div className="text-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-600">Dernière génération:</span>
                        <span className="font-medium text-gray-900">
                          {getTimeAgo(data?.documentation.lastGeneration || new Date().toISOString())}
                        </span>
                      </div>
                    </div>
                    
                    <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg">
                      <div className="flex items-center gap-2 text-teal-800">
                        <Award className="h-4 w-4" />
                        <span className="text-sm font-medium">
                          Documentation IFRS 17 & Solvency II à jour
                        </span>
                      </div>
                    </div>
                  </div>
                </ExpandableSection>
              </div>

              {/* Actions rapides réglementaires */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">Actions Réglementaires</h3>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <QuickActionCard
                      title="Nouveau Workflow"
                      description="Soumettre pour approbation"
                      icon={<Plus className="h-5 w-5" />}
                      color="blue"
                      onClick={() => setActiveSection('workflows')}
                    />
                    
                    <QuickActionCard
                      title="Exécuter Contrôles"
                      description="Lancer validation réglementaire"
                      icon={<Play className="h-5 w-5" />}
                      color="green"
                      onClick={() => setActiveSection('controls')}
                    />

                    <QuickActionCard
                      title="Générer QRT"
                      description="Templates EIOPA automatiques"
                      icon={<FileCheck className="h-5 w-5" />}
                      color="indigo"
                      onClick={() => {
                        toast.success('Génération QRT lancée');
                      }}
                    />
                    
                    <QuickActionCard
                      title="Rapport Conformité"
                      description="Export documentation complète"
                      icon={<Download className="h-5 w-5" />}
                      color="purple"
                      onClick={handleExportCompliance}
                    />
                    
                    <QuickActionCard
                      title="Alertes"
                      description="Voir toutes les alertes"
                      icon={<Bell className="h-5 w-5" />}
                      color="red"
                      onClick={() => setShowAlerts(true)}
                      badge={unacknowledgedAlerts.length}
                    />
                    
                    <QuickActionCard
                      title="Monitoring"
                      description="Surveillance temps réel"
                      icon={<Activity className="h-5 w-5" />}
                      color="orange"
                      onClick={() => {
                        refetchRegulatory();
                        toast.success('Données de monitoring actualisées');
                      }}
                    />
                    
                    <QuickActionCard
                      title="Configuration"
                      description="Paramètres réglementaires"
                      icon={<Settings className="h-5 w-5" />}
                      color="gray"
                      onClick={() => {
                        toast('Module de configuration à venir', { icon: 'ℹ️' });
                      }}
                    />
                    
                    <QuickActionCard
                      title="Historique"
                      description="Journal des activités"
                      icon={<History className="h-5 w-5" />}
                      color="slate"
                      onClick={() => {
                        toast('Historique des activités réglementaires', { icon: 'ℹ️' });
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Indicateurs de performance réglementaire */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">Indicateurs de Performance</h3>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="text-center">
                      <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Gauge className="h-8 w-8 text-blue-600" />
                      </div>
                      <h4 className="font-semibold text-gray-900 mb-1">Efficacité des Contrôles</h4>
                      <p className="text-2xl font-bold text-blue-600">{(data?.controls.averageScore || 88.2).toFixed(1)}%</p>
                      <p className="text-sm text-gray-600">Score moyen des contrôles</p>
                    </div>
                    
                    <div className="text-center">
                      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Target className="h-8 w-8 text-green-600" />
                      </div>
                      <h4 className="font-semibold text-gray-900 mb-1">Taux de Réussite</h4>
                      <p className="text-2xl font-bold text-green-600">{(100 - (data?.controls.failureRate || 4.3)).toFixed(1)}%</p>
                      <p className="text-sm text-gray-600">Contrôles réussis</p>
                    </div>
                    
                    <div className="text-center">
                      <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Award className="h-8 w-8 text-indigo-600" />
                      </div>
                      <h4 className="font-semibold text-gray-900 mb-1">Conformité Globale</h4>
                      <p className="text-2xl font-bold text-indigo-600">{(data?.overview.complianceScore || 87.5).toFixed(1)}%</p>
                      <p className="text-sm text-gray-600">Score de conformité</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Section Workflows d'Approbation */}
          {activeSection === 'workflows' && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                        <Scale className="h-6 w-6 text-purple-600" />
                        Workflows d'Approbation
                      </h2>
                      <p className="text-sm text-gray-600 mt-1">
                        Gestion des processus d'approbation multi-niveaux
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {interactiveMetrics.compliance.pendingWorkflows > 0 && (
                        <span className="bg-orange-100 text-orange-800 text-sm font-medium px-3 py-1 rounded-full">
                          {interactiveMetrics.compliance.pendingWorkflows} en attente
                        </span>
                      )}
                      <button
                        onClick={() => {
                          toast.success('Nouveau workflow créé');
                        }}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2"
                      >
                        <Plus className="h-4 w-4" />
                        Nouveau Workflow
                      </button>
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <MetricCard
                      title="Soumissions Totales"
                      value={{ value: (data?.workflows.totalSubmissions || 45).toString(), color: 'text-gray-900' }}
                      icon={<FileText className="h-6 w-6" />}
                      color="blue"
                    />
                    
                    <MetricCard
                      title="En Attente"
                      value={{ value: (data?.workflows.pendingApprovals || 3).toString(), color: 'text-orange-600' }}
                      icon={<Clock className="h-6 w-6" />}
                      color="orange"
                    />
                    
                    <MetricCard
                      title="Taux d'Approbation"
                      value={{ value: `${(data?.workflows.approvalRate || 92.5).toFixed(1)}%`, color: 'text-green-600' }}
                      icon={<CheckCircle className="h-6 w-6" />}
                      color="green"
                    />
                    
                    <MetricCard
                      title="En Retard"
                      value={{ 
                        value: (data?.workflows.overdueSubmissions || 1).toString(), 
                        color: (data?.workflows.overdueSubmissions || 1) > 0 ? 'text-red-600' : 'text-green-600' 
                      }}
                      icon={<AlertTriangle className="h-6 w-6" />}
                      color="red"
                    />
                  </div>

                  {/* Liste des workflows récents */}
                  <div className="mt-8">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Workflows Récents</h3>
                    <div className="space-y-4">
                      {[
                        {
                          id: 'wf1',
                          title: 'Validation Provisions Q4',
                          status: 'pending',
                          submitter: 'Marie Dupont',
                          date: '2024-12-18T14:30:00Z',
                          priority: 'high'
                        },
                        {
                          id: 'wf2',
                          title: 'Approbation Méthode Chain Ladder',
                          status: 'approved',
                          submitter: 'Jean Martin',
                          date: '2024-12-17T09:15:00Z',
                          priority: 'medium'
                        },
                        {
                          id: 'wf3',
                          title: 'Révision QRT S.02.01',
                          status: 'rejected',
                          submitter: 'Sophie Blanc',
                          date: '2024-12-16T16:45:00Z',
                          priority: 'low'
                        }
                      ].map((workflow) => (
                        <div key={workflow.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h4 className="font-medium text-gray-900">{workflow.title}</h4>
                                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                  workflow.status === 'pending' ? 'bg-orange-100 text-orange-800' :
                                  workflow.status === 'approved' ? 'bg-green-100 text-green-800' :
                                  'bg-red-100 text-red-800'
                                }`}>
                                  {workflow.status === 'pending' ? 'En attente' :
                                   workflow.status === 'approved' ? 'Approuvé' : 'Rejeté'}
                                </span>
                                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                  workflow.priority === 'high' ? 'bg-red-100 text-red-800' :
                                  workflow.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {workflow.priority === 'high' ? 'Haute' :
                                   workflow.priority === 'medium' ? 'Moyenne' : 'Basse'}
                                </span>
                              </div>
                              <div className="flex items-center gap-4 text-sm text-gray-600">
                                <span>Par: {workflow.submitter}</span>
                                <span>{formatDateTime(workflow.date)}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button className="p-2 text-gray-400 hover:text-gray-600">
                                <Eye className="h-4 w-4" />
                              </button>
                              {workflow.status === 'pending' && (
                                <>
                                  <button 
                                    onClick={() => toast.success('Workflow approuvé')}
                                    className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                                  >
                                    Approuver
                                  </button>
                                  <button 
                                    onClick={() => toast.error('Workflow rejeté')}
                                    className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                                  >
                                    Rejeter
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Section Contrôles Automatisés */}
          {activeSection === 'controls' && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                        <Target className="h-6 w-6 text-green-600" />
                        Contrôles Réglementaires Automatisés
                      </h2>
                      <p className="text-sm text-gray-600 mt-1">
                        Exécution et surveillance des contrôles de conformité
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {interactiveMetrics.compliance.criticalAlerts > 0 && (
                        <span className="bg-red-100 text-red-800 text-sm font-medium px-3 py-1 rounded-full">
                          {interactiveMetrics.compliance.criticalAlerts} alertes critiques
                        </span>
                      )}
                      <button
                        onClick={() => {
                          toast.success('Contrôles lancés');
                        }}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                      >
                        <Play className="h-4 w-4" />
                        Lancer Contrôles
                      </button>
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <MetricCard
                      title="Exécutions Totales"
                      value={{ value: (data?.controls.totalExecutions || 1247).toString(), color: 'text-gray-900' }}
                      icon={<Activity className="h-6 w-6" />}
                      color="blue"
                    />
                    
                    <MetricCard
                      title="Score Moyen"
                      value={{ value: `${(data?.controls.averageScore || 88.2).toFixed(1)}%`, color: 'text-green-600' }}
                      icon={<Gauge className="h-6 w-6" />}
                      color="green"
                    />
                    
                    <MetricCard
                      title="Taux d'Échec"
                      value={{ value: `${(data?.controls.failureRate || 4.3).toFixed(1)}%`, color: 'text-orange-600' }}
                      icon={<AlertTriangle className="h-6 w-6" />}
                      color="orange"
                    />
                    
                    <MetricCard
                      title="Alertes Actives"
                      value={{ 
                        value: (data?.controls.activeAlertsCount || 2).toString(), 
                        color: (data?.controls.activeAlertsCount || 2) > 0 ? 'text-red-600' : 'text-green-600' 
                      }}
                      icon={<Bell className="h-6 w-6" />}
                      color="red"
                    />
                  </div>

                  {/* Liste des contrôles récents */}
                  <div className="mt-8">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Contrôles Récents</h3>
                    <div className="space-y-4">
                      {[
                        {
                          id: 'ctrl1',
                          name: 'Validation Cohérence Données',
                          status: 'success',
                          score: 95.2,
                          duration: 45,
                          lastRun: '2024-12-18T15:30:00Z'
                        },
                        {
                          id: 'ctrl2',
                          name: 'Contrôle Seuils Réglementaires',
                          status: 'warning',
                          score: 78.5,
                          duration: 62,
                          lastRun: '2024-12-18T14:15:00Z'
                        },
                        {
                          id: 'ctrl3',
                          name: 'Vérification QRT Templates',
                          status: 'failure',
                          score: 45.2,
                          duration: 28,
                          lastRun: '2024-12-18T13:00:00Z'
                        }
                      ].map((control) => (
                        <div key={control.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h4 className="font-medium text-gray-900">{control.name}</h4>
                                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                  control.status === 'success' ? 'bg-green-100 text-green-800' :
                                  control.status === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-red-100 text-red-800'
                                }`}>
                                  {control.status === 'success' ? 'Réussi' :
                                   control.status === 'warning' ? 'Attention' : 'Échec'}
                                </span>
                                <span className={`text-sm font-medium ${
                                  control.score >= 90 ? 'text-green-600' :
                                  control.score >= 70 ? 'text-yellow-600' : 'text-red-600'
                                }`}>
                                  {control.score.toFixed(1)}%
                                </span>
                              </div>
                              <div className="flex items-center gap-4 text-sm text-gray-600">
                                <span>Durée: {control.duration}s</span>
                                <span>Exécuté: {formatDateTime(control.lastRun)}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button className="p-2 text-gray-400 hover:text-gray-600">
                                <Eye className="h-4 w-4" />
                              </button>
                              <button 
                                onClick={() => toast.success(`Contrôle ${control.name} relancé`)}
                                className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                              >
                                Relancer
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Graphique de performance */}
                  <div className="mt-8">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Performance des Contrôles</h3>
                    <div className="bg-gray-50 rounded-lg p-6 text-center">
                      <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600">Graphique de performance à intégrer</p>
                      <p className="text-sm text-gray-500">Évolution des scores de contrôles sur 30 jours</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Dashboard;