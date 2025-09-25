// frontend/src/components/regulatory/RegulatoryControlsPanel.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield, AlertTriangle, CheckCircle, XCircle, Clock, PlayCircle,
  BarChart3, TrendingUp, Activity, Eye, RefreshCw, Bell, Settings,
  AlertCircle, Info, Zap, Target, Database, FileCheck, Gauge,
  Filter, Search, Calendar, Download, Share2, History,
  ChevronRight, ChevronDown, Minimize2, Maximize2, Plus,
  Archive, Star, Flag, Users, Lock, Unlock, CheckSquare
} from 'lucide-react';
import toast from 'react-hot-toast';

// ===== TYPES =====
interface ControlExecution {
  id: string;
  calculationId: string;
  triangleId: string;
  executedBy: number;
  executedByName: string;
  executedAt: string;
  controlTypes: string[];
  globalStatus: 'passed' | 'warning' | 'failed' | 'error';
  globalScore: number;
  totalExecutionTime: number;
  controlResults: ControlResult[];
  alerts: ThresholdAlert[];
  timeAgo: string;
}

interface ControlResult {
  controlType: string;
  status: string;
  score: number;
  details: Record<string, any>;
  alerts: ThresholdAlert[];
  execution_time: number;
}

interface ThresholdAlert {
  metric: string;
  current_value: number;
  threshold_value: number;
  deviation_percent: number;
  alert_level: 'info' | 'warning' | 'critical' | 'blocking';
  description: string;
  recommendations: string[];
}

interface DashboardData {
  summary: {
    totalExecutions: number;
    averageScore: number;
    failureRate: number;
    activeAlertsCount: number;
    last24hExecutions: number;
    last24hAlerts: number;
  };
  alertsByLevel: Record<string, number>;
  controlsByType: Record<string, number>;
  recentActivity: {
    executions: ControlExecution[];
    alerts: ThresholdAlert[];
  };
  systemHealth: {
    overallStatus: string;
    lastExecution: string;
    nextScheduledExecution: string;
  };
}

// ===== CONFIGURATION API =====
const API = (import.meta as any).env?.VITE_API_URL?.replace(/\/$/, '') || 'http://localhost:8000';

const controlsAPI = {
  executeControls: async (data: {
    calculationId: string;
    triangleId: string;
    controlTypes: string[];
    benchmarkData?: Record<string, any>;
    thresholds?: Record<string, number>;
  }) => {
    const response = await fetch(`${API}/api/v1/regulatory-controls/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
      },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Erreur lors de l\'exécution des contrôles');
    return response.json();
  },

  getDashboard: async (): Promise<{ dashboard: DashboardData }> => {
    const response = await fetch(`${API}/api/v1/regulatory-controls/dashboard`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
    });
    if (!response.ok) throw new Error('Erreur lors du chargement du dashboard');
    return response.json();
  },

  getActiveAlerts: async (params?: {
    alert_level?: string;
    acknowledged?: boolean;
    limit?: number;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.alert_level) queryParams.append('alert_level', params.alert_level);
    if (params?.acknowledged !== undefined) queryParams.append('acknowledged', params.acknowledged.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());

    const response = await fetch(`${API}/api/v1/regulatory-controls/monitoring/alerts?${queryParams}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
    });
    if (!response.ok) throw new Error('Erreur lors du chargement des alertes');
    return response.json();
  },

  acknowledgeAlert: async (alertId: string) => {
    const response = await fetch(`${API}/api/v1/regulatory-controls/monitoring/acknowledge-alert/${alertId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
    });
    if (!response.ok) throw new Error('Erreur lors de l\'acquittement');
    return response.json();
  },

  getExecutionHistory: async (params?: {
    calculation_id?: string;
    limit?: number;
    offset?: number;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.calculation_id) queryParams.append('calculation_id', params.calculation_id);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());

    const response = await fetch(`${API}/api/v1/regulatory-controls/executions/history?${queryParams}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
    });
    if (!response.ok) throw new Error('Erreur lors du chargement de l\'historique');
    return response.json();
  },

  scheduleMonitoring: async (data: {
    calculation_id: string;
    frequency_hours: number;
  }) => {
    const response = await fetch(`${API}/api/v1/regulatory-controls/schedule-monitoring`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
      },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Erreur lors de la programmation');
    return response.json();
  }
};

// ===== UTILITAIRES =====
const getStatusColor = (status: string) => {
  switch (status) {
    case 'passed': return 'green';
    case 'warning': return 'yellow';
    case 'failed': return 'red';
    case 'error': return 'gray';
    default: return 'blue';
  }
};

const getAlertLevelColor = (level: string) => {
  switch (level) {
    case 'info': return 'blue';
    case 'warning': return 'yellow';
    case 'critical': return 'red';
    case 'blocking': return 'purple';
    default: return 'gray';
  }
};

const getControlTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    'ifrs17_solvency2_reconciliation': 'Réconciliation IFRS 17 ↔ S2',
    'market_benchmark': 'Benchmark Marché',
    'backtest_validation': 'Validation Back-Testing',
    'cross_validation': 'Validation Croisée',
    'plausibility_check': 'Tests de Vraisemblance',
    'statistical_coherence': 'Cohérence Statistique',
    'regulatory_threshold': 'Seuils Réglementaires'
  };
  return labels[type] || type;
};

const getControlIcon = (type: string, className: string = "h-4 w-4") => {
  switch (type) {
    case 'ifrs17_solvency2_reconciliation': return <Shield className={className} />;
    case 'market_benchmark': return <TrendingUp className={className} />;
    case 'backtest_validation': return <History className={className} />;
    case 'cross_validation': return <CheckSquare className={className} />;
    case 'regulatory_threshold': return <Gauge className={className} />;
    default: return <FileCheck className={className} />;
  }
};

const formatScore = (score: number): string => {
  if (score >= 90) return `${score.toFixed(1)}% (Excellent)`;
  if (score >= 80) return `${score.toFixed(1)}% (Bon)`;
  if (score >= 70) return `${score.toFixed(1)}% (Correct)`;
  if (score >= 60) return `${score.toFixed(1)}% (Faible)`;
  return `${score.toFixed(1)}% (Critique)`;
};

// ===== COMPOSANT PRINCIPAL =====
const RegulatoryControlsPanel: React.FC<{
  calculationId?: string;
  triangleId?: string;
}> = ({ calculationId, triangleId }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'execute' | 'alerts' | 'history'>('dashboard');
  const [selectedControls, setSelectedControls] = useState<string[]>([]);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [filters, setFilters] = useState({
    status: '',
    alertLevel: '',
    acknowledged: '',
    search: ''
  });

  const queryClient = useQueryClient();

  // Queries
  const { data: dashboardData, isLoading: loadingDashboard, refetch: refetchDashboard } = useQuery({
    queryKey: ['regulatory-controls-dashboard'],
    queryFn: controlsAPI.getDashboard,
    refetchInterval: 30000
  });

  const { data: alertsData, isLoading: loadingAlerts, refetch: refetchAlerts } = useQuery({
    queryKey: ['regulatory-alerts', filters.alertLevel, filters.acknowledged],
    queryFn: () => controlsAPI.getActiveAlerts({
      alert_level: filters.alertLevel || undefined,
      acknowledged: filters.acknowledged === '' ? undefined : filters.acknowledged === 'true',
      limit: 100
    }),
    refetchInterval: 15000
  });

  const { data: historyData, isLoading: loadingHistory } = useQuery({
    queryKey: ['controls-history', calculationId],
    queryFn: () => controlsAPI.getExecutionHistory({
      calculation_id: calculationId,
      limit: 50
    })
  });

  // Mutations
  const executeControlsMutation = useMutation({
    mutationFn: controlsAPI.executeControls,
    onSuccess: (data) => {
      toast.success(`Contrôles exécutés: ${data.globalStatus}`);
      refetchDashboard();
      refetchAlerts();
      setActiveTab('dashboard');
    },
    onError: (error: any) => {
      toast.error(`Erreur: ${error.message}`);
    }
  });

  const acknowledgeAlertMutation = useMutation({
    mutationFn: controlsAPI.acknowledgeAlert,
    onSuccess: () => {
      toast.success('Alerte acquittée');
      refetchAlerts();
      refetchDashboard();
    }
  });

  const scheduleMonitoringMutation = useMutation({
    mutationFn: controlsAPI.scheduleMonitoring,
    onSuccess: () => {
      toast.success('Monitoring programmé avec succès');
    }
  });

  // Contrôles disponibles
  const availableControls = [
    {
      id: 'ifrs17_solvency2_reconciliation',
      label: 'Réconciliation IFRS 17 ↔ Solvency II',
      description: 'Vérification de cohérence entre référentiels',
      icon: <Shield className="h-5 w-5" />,
      criticality: 'high',
      estimatedTime: '2-3 min'
    },
    {
      id: 'market_benchmark',
      label: 'Benchmark Marché',
      description: 'Comparaison avec données sectorielles',
      icon: <TrendingUp className="h-5 w-5" />,
      criticality: 'medium',
      estimatedTime: '1-2 min'
    },
    {
      id: 'backtest_validation',
      label: 'Validation Back-Testing',
      description: 'Tests sur données historiques',
      icon: <History className="h-5 w-5" />,
      criticality: 'high',
      estimatedTime: '3-5 min'
    },
    {
      id: 'cross_validation',
      label: 'Validation Croisée',
      description: 'Cohérence triangle/comptabilité/actuariat',
      icon: <CheckSquare className="h-5 w-5" />,
      criticality: 'medium',
      estimatedTime: '1-2 min'
    },
    {
      id: 'regulatory_threshold',
      label: 'Seuils Réglementaires',
      description: 'Vérification des limites réglementaires',
      icon: <Gauge className="h-5 w-5" />,
      criticality: 'critical',
      estimatedTime: '30s-1min'
    }
  ];

  const handleExecuteControls = () => {
    if (!calculationId || !triangleId || selectedControls.length === 0) {
      toast.error('Veuillez sélectionner un calcul et au moins un contrôle');
      return;
    }

    executeControlsMutation.mutate({
      calculationId,
      triangleId,
      controlTypes: selectedControls,
      benchmarkData: {},
      thresholds: {}
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
              <Shield className="h-6 w-6 text-blue-600" />
              Contrôles Réglementaires Avancés
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Validation automatisée de la conformité et détection d'anomalies
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {dashboardData?.dashboard.summary.activeAlertsCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-100 text-red-800 rounded-lg">
                <Bell className="h-4 w-4" />
                <span className="text-sm font-medium">
                  {dashboardData.dashboard.summary.activeAlertsCount} alerte{dashboardData.dashboard.summary.activeAlertsCount > 1 ? 's' : ''}
                </span>
              </div>
            )}
            
            <button
              onClick={() => {
                refetchDashboard();
                refetchAlerts();
              }}
              className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Actualiser
            </button>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: <BarChart3 className="h-4 w-4" /> },
            { id: 'execute', label: 'Exécuter Contrôles', icon: <PlayCircle className="h-4 w-4" /> },
            { id: 'alerts', label: 'Alertes', icon: <Bell className="h-4 w-4" />, count: dashboardData?.dashboard.summary.activeAlertsCount },
            { id: 'history', label: 'Historique', icon: <History className="h-4 w-4" /> }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="ml-1 bg-red-100 text-red-800 text-xs font-medium px-2 py-0.5 rounded-full">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Contenu */}
      {activeTab === 'dashboard' && (
        <DashboardView 
          data={dashboardData?.dashboard} 
          loading={loadingDashboard}
          onScheduleMonitoring={scheduleMonitoringMutation.mutate}
        />
      )}

      {activeTab === 'execute' && (
        <ExecuteControlsView
          availableControls={availableControls}
          selectedControls={selectedControls}
          setSelectedControls={setSelectedControls}
          onExecute={handleExecuteControls}
          loading={executeControlsMutation.isPending}
          calculationId={calculationId}
          triangleId={triangleId}
        />
      )}

      {activeTab === 'alerts' && (
        <AlertsView
          data={alertsData}
          loading={loadingAlerts}
          filters={filters}
          setFilters={setFilters}
          onAcknowledge={acknowledgeAlertMutation.mutate}
        />
      )}

      {activeTab === 'history' && (
        <HistoryView
          data={historyData}
          loading={loadingHistory}
        />
      )}
    </div>
  );
};

// ===== SOUS-COMPOSANTS =====

const DashboardView: React.FC<{
  data?: DashboardData;
  loading: boolean;
  onScheduleMonitoring: (data: { calculation_id: string; frequency_hours: number }) => void;
}> = ({ data, loading, onScheduleMonitoring }) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!data) return <div>Données indisponibles</div>;

  return (
    <div className="space-y-6">
      {/* Métriques principales */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Activity className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Exécutions</p>
              <p className="text-lg font-bold text-gray-900">{data.summary.totalExecutions}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Target className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Score Moyen</p>
              <p className="text-lg font-bold text-gray-900">{data.summary.averageScore.toFixed(1)}%</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Taux d'Échec</p>
              <p className="text-lg font-bold text-gray-900">{data.summary.failureRate.toFixed(1)}%</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Bell className="h-6 w-6 text-orange-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Alertes Actives</p>
              <p className="text-lg font-bold text-gray-900">{data.summary.activeAlertsCount}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Clock className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">24h</p>
              <p className="text-lg font-bold text-gray-900">{data.summary.last24hExecutions}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Gauge className={`h-6 w-6 ${
                data.systemHealth.overallStatus === 'healthy' ? 'text-green-600' :
                data.systemHealth.overallStatus === 'warning' ? 'text-yellow-600' : 'text-red-600'
              }`} />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Santé Système</p>
              <p className={`text-sm font-bold ${
                data.systemHealth.overallStatus === 'healthy' ? 'text-green-600' :
                data.systemHealth.overallStatus === 'warning' ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {data.systemHealth.overallStatus === 'healthy' ? 'Sain' :
                 data.systemHealth.overallStatus === 'warning' ? 'Attention' : 'Critique'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Alertes par niveau */}
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Répartition des Alertes</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(data.alertsByLevel).map(([level, count]) => (
              <div key={level} className={`p-4 rounded-lg border-2 border-${getAlertLevelColor(level)}-200 bg-${getAlertLevelColor(level)}-50`}>
                <div className="text-center">
                  <p className={`text-2xl font-bold text-${getAlertLevelColor(level)}-800`}>{count}</p>
                  <p className={`text-sm font-medium text-${getAlertLevelColor(level)}-600 capitalize`}>
                    {level === 'info' ? 'Information' :
                     level === 'warning' ? 'Avertissement' :
                     level === 'critical' ? 'Critique' : 'Bloquant'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Contrôles par type */}
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Utilisation par Type de Contrôle</h3>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {Object.entries(data.controlsByType).map(([type, count]) => (
              <div key={type} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getControlIcon(type, 'h-5 w-5 text-gray-600')}
                  <span className="font-medium text-gray-900">{getControlTypeLabel(type)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-32 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full"
                      style={{ width: `${Math.min((count / Math.max(...Object.values(data.controlsByType))) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-600 w-8 text-right">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Activité récente */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Exécutions récentes */}
        <div className="bg-white rounded-lg shadow border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Exécutions Récentes</h3>
          </div>
          <div className="divide-y divide-gray-200">
            {data.recentActivity.executions.slice(0, 5).map((execution) => (
              <div key={execution.id} className="px-6 py-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full bg-${getStatusColor(execution.globalStatus)}-100 text-${getStatusColor(execution.globalStatus)}-800`}>
                        {execution.globalStatus === 'passed' ? 'Validé' :
                         execution.globalStatus === 'warning' ? 'Attention' :
                         execution.globalStatus === 'failed' ? 'Échec' : 'Erreur'}
                      </span>
                      <span className="text-sm font-medium text-gray-900">
                        Score: {execution.globalScore.toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {execution.controlTypes.length} contrôle{execution.controlTypes.length > 1 ? 's' : ''} • 
                      {execution.executedByName} • {execution.timeAgo}
                    </p>
                  </div>
                  <Eye className="h-4 w-4 text-gray-400" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Alertes récentes */}
        <div className="bg-white rounded-lg shadow border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Alertes Récentes</h3>
          </div>
          <div className="divide-y divide-gray-200">
            {data.recentActivity.alerts.slice(0, 5).map((alert, index) => (
              <div key={index} className="px-6 py-4 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full bg-${getAlertLevelColor(alert.alert_level)}-100 text-${getAlertLevelColor(alert.alert_level)}-800`}>
                        {alert.alert_level === 'info' ? 'Info' :
                         alert.alert_level === 'warning' ? 'Attention' :
                         alert.alert_level === 'critical' ? 'Critique' : 'Bloquant'}
                      </span>
                      <span className="text-sm font-medium text-gray-900">{alert.metric}</span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {alert.current_value.toFixed(2)} vs seuil {alert.threshold_value.toFixed(2)} 
                      ({alert.deviation_percent > 0 ? '+' : ''}{alert.deviation_percent.toFixed(1)}%)
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const ExecuteControlsView: React.FC<{
  availableControls: any[];
  selectedControls: string[];
  setSelectedControls: (controls: string[]) => void;
  onExecute: () => void;
  loading: boolean;
  calculationId?: string;
  triangleId?: string;
}> = ({ availableControls, selectedControls, setSelectedControls, onExecute, loading, calculationId, triangleId }) => {
  const toggleControl = (controlId: string) => {
    setSelectedControls(
      selectedControls.includes(controlId)
        ? selectedControls.filter(id => id !== controlId)
        : [...selectedControls, controlId]
    );
  };

  const selectAllControls = () => {
    setSelectedControls(availableControls.map(c => c.id));
  };

  const selectCriticalControls = () => {
    setSelectedControls(availableControls.filter(c => c.criticality === 'critical' || c.criticality === 'high').map(c => c.id));
  };

  return (
    <div className="space-y-6">
      {/* Informations du calcul */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Configuration de l'Exécution</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">ID du Calcul</label>
            <input
              type="text"
              value={calculationId || ''}
              readOnly
              className="w-full border border-gray-300 rounded-md px-3 py-2 bg-gray-50"
              placeholder="Sélectionnez un calcul"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">ID du Triangle</label>
            <input
              type="text"
              value={triangleId || ''}
              readOnly
              className="w-full border border-gray-300 rounded-md px-3 py-2 bg-gray-50"
              placeholder="Triangle associé"
            />
          </div>
        </div>
      </div>

      {/* Sélection des contrôles */}
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium text-gray-900">Contrôles à Exécuter</h3>
            <div className="flex gap-2">
              <button
                onClick={selectCriticalControls}
                className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded-md hover:bg-red-200"
              >
                Critiques
              </button>
              <button
                onClick={selectAllControls}
                className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
              >
                Tout
              </button>
              <button
                onClick={() => setSelectedControls([])}
                className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
              >
                Aucun
              </button>
            </div>
          </div>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {availableControls.map((control) => {
              const isSelected = selectedControls.includes(control.id);
              const criticalityColor = {
                'critical': 'red',
                'high': 'orange',
                'medium': 'yellow',
                'low': 'green'
              }[control.criticality] || 'gray';

              return (
                <div
                  key={control.id}
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-all duration-200 ${
                    isSelected 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                  onClick={() => toggleControl(control.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`p-2 rounded-lg ${isSelected ? 'bg-blue-100' : 'bg-gray-100'}`}>
                          {control.icon}
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-900">{control.label}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full bg-${criticalityColor}-100 text-${criticalityColor}-800`}>
                              {control.criticality === 'critical' ? 'Critique' :
                               control.criticality === 'high' ? 'Élevé' :
                               control.criticality === 'medium' ? 'Moyen' : 'Faible'}
                            </span>
                            <span className="text-xs text-gray-500">{control.estimatedTime}</span>
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600">{control.description}</p>
                    </div>
                    
                    <div className="ml-3">
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                        isSelected 
                          ? 'border-blue-500 bg-blue-500' 
                          : 'border-gray-300'
                      }`}>
                        {isSelected && <CheckCircle className="h-3 w-3 text-white" />}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bouton d'exécution */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-gray-900">
              {selectedControls.length} contrôle{selectedControls.length > 1 ? 's' : ''} sélectionné{selectedControls.length > 1 ? 's' : ''}
            </h4>
            <p className="text-sm text-gray-600 mt-1">
              Temps estimé: {selectedControls.length * 2}-{selectedControls.length * 4} minutes
            </p>
          </div>
          
          <button
            onClick={onExecute}
            disabled={loading || selectedControls.length === 0 || !calculationId}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Exécution en cours...
              </>
            ) : (
              <>
                <PlayCircle className="h-4 w-4" />
                Exécuter les Contrôles
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

const AlertsView: React.FC<{
  data: any;
  loading: boolean;
  filters: any;
  setFilters: (filters: any) => void;
  onAcknowledge: (alertId: string) => void;
}> = ({ data, loading, filters, setFilters, onAcknowledge }) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const alerts = data?.alerts || [];

  return (
    <div className="space-y-6">
      {/* Filtres */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Niveau</label>
            <select
              value={filters.alertLevel}
              onChange={(e) => setFilters({ ...filters, alertLevel: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="">Tous les niveaux</option>
              <option value="info">Information</option>
              <option value="warning">Avertissement</option>
              <option value="critical">Critique</option>
              <option value="blocking">Bloquant</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Statut</label>
            <select
              value={filters.acknowledged}
              onChange={(e) => setFilters({ ...filters, acknowledged: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="">Toutes</option>
              <option value="false">Non acquittées</option>
              <option value="true">Acquittées</option>
            </select>
          </div>
          
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">Recherche</label>
            <div className="relative">
              <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                placeholder="Rechercher par métrique..."
                className="w-full border border-gray-300 rounded-md pl-9 pr-3 py-2"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Liste des alertes */}
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            Alertes Actives ({alerts.length})
          </h3>
        </div>
        
        {alerts.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Aucune alerte</h3>
            <p className="text-gray-600">Tous les contrôles sont conformes !</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {alerts.map((alert: any) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                onAcknowledge={() => onAcknowledge(alert.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const AlertRow: React.FC<{
  alert: any;
  onAcknowledge: () => void;
}> = ({ alert, onAcknowledge }) => {
  const levelColor = getAlertLevelColor(alert.alertLevel);
  
  return (
    <div className={`px-6 py-4 hover:bg-gray-50 ${alert.acknowledged ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full bg-${levelColor}-100 text-${levelColor}-800`}>
              {alert.alertLevel === 'info' ? 'Info' :
               alert.alertLevel === 'warning' ? 'Attention' :
               alert.alertLevel === 'critical' ? 'Critique' : 'Bloquant'}
            </span>
            <span className="text-sm font-medium text-gray-900">{alert.metric}</span>
            {alert.acknowledged && (
              <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                Acquittée
              </span>
            )}
          </div>
          
          <p className="text-sm text-gray-700 mb-2">{alert.description}</p>
          
          <div className="text-sm text-gray-600 mb-3">
            Valeur: {alert.currentValue.toFixed(2)} • 
            Seuil: {alert.thresholdValue.toFixed(2)} • 
            Écart: {alert.deviationPercent > 0 ? '+' : ''}{alert.deviationPercent.toFixed(1)}% •
            {alert.timeAgo}
          </div>
          
          {alert.recommendations && alert.recommendations.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium text-gray-700 mb-1">Recommandations:</p>
              <ul className="text-xs text-gray-600 space-y-1">
                {alert.recommendations.map((rec: string, index: number) => (
                  <li key={index}>• {rec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        
        <div className="ml-4 flex items-center gap-2">
          {!alert.acknowledged && (
            <button
              onClick={onAcknowledge}
              className="px-3 py-2 text-sm text-green-600 hover:text-green-700 hover:bg-green-50 rounded-md"
            >
              Acquitter
            </button>
          )}
          <button className="p-2 text-gray-400 hover:text-gray-600">
            <Eye className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

const HistoryView: React.FC<{
  data: any;
  loading: boolean;
}> = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const executions = data?.executions || [];

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">
          Historique des Exécutions ({executions.length})
        </h3>
      </div>
      
      <div className="divide-y divide-gray-200">
        {executions.map((execution: ControlExecution) => (
          <div key={execution.id} className="px-6 py-4 hover:bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full bg-${getStatusColor(execution.globalStatus)}-100 text-${getStatusColor(execution.globalStatus)}-800`}>
                    {execution.globalStatus === 'passed' ? 'Validé' :
                     execution.globalStatus === 'warning' ? 'Attention' :
                     execution.globalStatus === 'failed' ? 'Échec' : 'Erreur'}
                  </span>
                  <span className="text-sm font-medium text-gray-900">
                    {formatScore(execution.globalScore)}
                  </span>
                  <span className="text-sm text-gray-500">
                    {execution.totalExecutionTime.toFixed(1)}s
                  </span>
                </div>
                
                <div className="text-sm text-gray-600 mb-2">
                  {execution.controlTypes.length} contrôle{execution.controlTypes.length > 1 ? 's' : ''}: {' '}
                  {execution.controlTypes.map(type => getControlTypeLabel(type)).join(', ')}
                </div>
                
                <div className="text-sm text-gray-500">
                  Exécuté par {execution.executedByName} • {execution.timeAgo}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button className="p-2 text-gray-400 hover:text-gray-600">
                  <Eye className="h-4 w-4" />
                </button>
                <button className="p-2 text-gray-400 hover:text-gray-600">
                  <Download className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RegulatoryControlsPanel;