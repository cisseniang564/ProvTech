// frontend/src/components/dashboard/RegulatoryDashboardUnified.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Shield, AlertTriangle, CheckCircle, Bell, Activity, FileText,
  BarChart3, TrendingUp, Clock, Users, Database, Settings,
  Award, Gauge, Target, Zap, Eye, RefreshCw, Download,
  ChevronRight, ChevronDown, Plus, Filter, Search, Calendar,
  Archive, Flag, Lock, Unlock, Play, Pause, ArrowUp, ArrowDown,
  Info, AlertCircle, XCircle, MinusCircle, BookOpen, FileCheck,
  Scale, PieChart, LineChart, Briefcase, Building, Globe
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

// Import des composants spécialisés
import WorkflowApprovalSystem from '../regulatory/WorkflowApprovalSystem';
import RegulatoryControlsPanel from '../regulatory/RegulatoryControlsPanel';

// ===== TYPES =====
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

// ===== CONFIGURATION API =====
const API = (import.meta as any).env?.VITE_API_URL?.replace(/\/$/, '') || 'http://localhost:8000';

const dashboardAPI = {
  getOverview: async (): Promise<{ data: RegulatoryDashboardData }> => {
    const response = await fetch(`${API}/api/v1/regulatory-dashboard/overview`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
    });
    if (!response.ok) throw new Error('Erreur chargement dashboard');
    return response.json();
  },

  getSystemAlerts: async (): Promise<{ alerts: SystemAlert[] }> => {
    const response = await fetch(`${API}/api/v1/regulatory-dashboard/alerts`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
    });
    if (!response.ok) throw new Error('Erreur chargement alertes');
    return response.json();
  },

  acknowledgeAlert: async (alertId: string) => {
    const response = await fetch(`${API}/api/v1/regulatory-dashboard/alerts/${alertId}/acknowledge`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
    });
    if (!response.ok) throw new Error('Erreur acquittement');
    return response.json();
  },

  exportComplianceReport: async () => {
    const response = await fetch(`${API}/api/v1/regulatory-dashboard/export-compliance`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
    });
    if (!response.ok) throw new Error('Erreur export');
    return response.blob();
  }
};

// ===== UTILITAIRES =====
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

// ===== COMPOSANT PRINCIPAL =====
const RegulatoryDashboardUnified: React.FC = () => {
  const [activeModule, setActiveModule] = useState<'overview' | 'workflow' | 'controls' | 'monitoring' | 'qrt' | 'documentation'>('overview');
  const [showAlerts, setShowAlerts] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    compliance: true,
    workflow: true,
    monitoring: true
  });

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Queries
  const { data: dashboardData, isLoading: loadingDashboard, refetch: refetchDashboard } = useQuery({
    queryKey: ['regulatory-dashboard-overview'],
    queryFn: dashboardAPI.getOverview,
    refetchInterval: 30000 // Refresh toutes les 30s
  });

  const { data: alertsData, isLoading: loadingAlerts, refetch: refetchAlerts } = useQuery({
    queryKey: ['regulatory-dashboard-alerts'],
    queryFn: dashboardAPI.getSystemAlerts,
    refetchInterval: 15000 // Refresh toutes les 15s pour les alertes
  });

  const data = dashboardData?.data;
  const alerts = alertsData?.alerts || [];
  const unacknowledgedAlerts = alerts.filter(alert => !alert.acknowledged);

  // Modules disponibles
  const modules = [
    {
      id: 'overview',
      name: 'Vue d\'ensemble',
      icon: <BarChart3 className="h-5 w-5" />,
      description: 'Synthèse globale de la conformité',
      color: 'blue'
    },
    {
      id: 'workflow',
      name: 'Workflows',
      icon: <Scale className="h-5 w-5" />,
      description: 'Approbations multi-niveaux',
      color: 'purple',
      alerts: data?.workflows.pendingApprovals || 0
    },
    {
      id: 'controls',
      name: 'Contrôles',
      icon: <Shield className="h-5 w-5" />,
      description: 'Contrôles réglementaires avancés',
      color: 'green',
      alerts: data?.controls.activeAlertsCount || 0
    },
    {
      id: 'monitoring',
      name: 'Monitoring',
      icon: <Activity className="h-5 w-5" />,
      description: 'Surveillance temps réel',
      color: 'orange',
      status: data?.monitoring.overallStatus
    },
    {
      id: 'qrt',
      name: 'QRT',
      icon: <FileText className="h-5 w-5" />,
      description: 'Templates EIOPA automatisés',
      color: 'indigo',
      status: data?.qrt.validationStatus
    },
    {
      id: 'documentation',
      name: 'Documentation',
      icon: <BookOpen className="h-5 w-5" />,
      description: 'Génération automatique',
      color: 'teal'
    }
  ];

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      await dashboardAPI.acknowledgeAlert(alertId);
      refetchAlerts();
      toast.success('Alerte acquittée');
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    }
  };

  const handleExportCompliance = async () => {
    try {
      const blob = await dashboardAPI.exportComplianceReport();
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

  if (loadingDashboard) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement du dashboard réglementaire...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header principal */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-gradient-to-br from-${getStatusColor(data?.overview.systemStatus || 'gray')}-500 to-${getStatusColor(data?.overview.systemStatus || 'gray')}-600 shadow-sm`}>
                  <Shield className="h-6 w-6 text-white" />
                </div>
                Dashboard Réglementaire Pro
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Supervision complète de la conformité IFRS 17 & Solvabilité II
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* Indicateur système */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-${getStatusColor(data?.overview.systemStatus || 'gray')}-100 text-${getStatusColor(data?.overview.systemStatus || 'gray')}-800`}>
                <div className={`w-2 h-2 rounded-full bg-${getStatusColor(data?.overview.systemStatus || 'gray')}-500 animate-pulse`} />
                <span className="text-sm font-medium">
                  {data?.overview.systemStatus === 'healthy' ? 'Système Sain' :
                   data?.overview.systemStatus === 'warning' ? 'Attention' :
                   data?.overview.systemStatus === 'critical' ? 'Critique' : 'Urgence'}
                </span>
              </div>

              {/* Alertes */}
              {unacknowledgedAlerts.length > 0 && (
                <button
                  onClick={() => setShowAlerts(!showAlerts)}
                  className="relative flex items-center gap-2 px-3 py-2 bg-red-100 text-red-800 rounded-lg hover:bg-red-200 transition-colors"
                >
                  <Bell className="h-4 w-4" />
                  <span className="text-sm font-medium">{unacknowledgedAlerts.length}</span>
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                </button>
              )}

              {/* Actions */}
              <button
                onClick={() => {
                  refetchDashboard();
                  refetchAlerts();
                }}
                className="px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
              </button>

              <button
                onClick={handleExportCompliance}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Rapport Conformité
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation modules */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200">
            <nav className="flex overflow-x-auto">
              {modules.map(module => (
                <button
                  key={module.id}
                  onClick={() => setActiveModule(module.id as any)}
                  className={`relative flex items-center gap-3 px-6 py-4 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                    activeModule === module.id
                      ? `border-${module.color}-500 text-${module.color}-600 bg-${module.color}-50`
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className={activeModule === module.id ? `text-${module.color}-600` : 'text-gray-400'}>
                    {module.icon}
                  </div>
                  <div className="text-left">
                    <div className="font-medium">{module.name}</div>
                    <div className="text-xs text-gray-500">{module.description}</div>
                  </div>
                  
                  {/* Indicateurs d'état */}
                  {module.alerts && module.alerts > 0 && (
                    <span className={`ml-2 px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800`}>
                      {module.alerts}
                    </span>
                  )}
                  
                  {module.status && (
                    <div className={`ml-2 w-2 h-2 rounded-full bg-${getStatusColor(module.status)}-500`} />
                  )}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </div>

      {/* Panel d'alertes */}
      {showAlerts && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-6">
          <AlertsPanel 
            alerts={unacknowledgedAlerts} 
            onAcknowledge={handleAcknowledgeAlert}
            onClose={() => setShowAlerts(false)}
          />
        </div>
      )}

      {/* Contenu principal */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        {activeModule === 'overview' && (
          <OverviewModule 
            data={data} 
            expandedSections={expandedSections}
            onToggleSection={toggleSection}
          />
        )}

        {activeModule === 'workflow' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <WorkflowApprovalSystem />
          </div>
        )}

        {activeModule === 'controls' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <RegulatoryControlsPanel />
          </div>
        )}

        {activeModule === 'monitoring' && (
          <MonitoringModule data={data?.monitoring} />
        )}

        {activeModule === 'qrt' && (
          <QRTModule data={data?.qrt} />
        )}

        {activeModule === 'documentation' && (
          <DocumentationModule data={data?.documentation} />
        )}
      </div>
    </div>
  );
};

// ===== COMPOSANTS MODULES =====

const OverviewModule: React.FC<{
  data?: RegulatoryDashboardData;
  expandedSections: Record<string, boolean>;
  onToggleSection: (section: string) => void;
}> = ({ data, expandedSections, onToggleSection }) => {
  if (!data) return <div>Chargement...</div>;

  return (
    <div className="space-y-6">
      {/* Métriques principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Score de Conformité"
          value={formatScore(data.overview.complianceScore)}
          icon={<Award className="h-6 w-6" />}
          color="blue"
          trend={{ value: 2.3, direction: 'up' }}
        />
        
        <MetricCard
          title="Alertes Actives"
          value={{ value: data.overview.activeAlerts.toString(), color: data.overview.activeAlerts > 0 ? 'text-red-600' : 'text-green-600' }}
          icon={<AlertTriangle className="h-6 w-6" />}
          color="red"
          trend={{ value: -15, direction: 'down' }}
        />
        
        <MetricCard
          title="Approbations en Attente"
          value={{ value: data.overview.pendingApprovals.toString(), color: 'text-orange-600' }}
          icon={<Clock className="h-6 w-6" />}
          color="orange"
        />
        
        <MetricCard
          title="Statut Système"
          value={{ 
            value: data.overview.systemStatus === 'healthy' ? 'Opérationnel' : 'Attention', 
            color: data.overview.systemStatus === 'healthy' ? 'text-green-600' : 'text-yellow-600' 
          }}
          icon={<Gauge className="h-6 w-6" />}
          color={getStatusColor(data.overview.systemStatus)}
        />
      </div>

      {/* Sections détaillées */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Workflows */}
        <ExpandableSection
          title="Workflows d'Approbation"
          icon={<Scale className="h-5 w-5" />}
          expanded={expandedSections.workflow}
          onToggle={() => onToggleSection('workflow')}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-2xl font-bold text-gray-900">{data.workflows.totalSubmissions}</p>
                <p className="text-sm text-gray-600">Soumissions Totales</p>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-2xl font-bold text-orange-600">{data.workflows.pendingApprovals}</p>
                <p className="text-sm text-gray-600">En Attente</p>
              </div>
            </div>
            
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Taux d'approbation:</span>
              <span className="font-medium text-green-600">{data.workflows.approvalRate.toFixed(1)}%</span>
            </div>
            
            {data.workflows.overdueSubmissions > 0 && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2 text-red-800">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    {data.workflows.overdueSubmissions} soumission(s) en retard
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
          onToggle={() => onToggleSection('monitoring')}
        >
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Ratio de Solvabilité:</span>
                <span className={`font-medium ${data.monitoring.solvencyRatio > 150 ? 'text-green-600' : data.monitoring.solvencyRatio > 120 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {data.monitoring.solvencyRatio.toFixed(1)}%
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Couverture MCR:</span>
                <span className={`font-medium ${data.monitoring.mcrCoverage > 200 ? 'text-green-600' : data.monitoring.mcrCoverage > 140 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {data.monitoring.mcrCoverage.toFixed(1)}%
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Ratio de Liquidité:</span>
                <span className={`font-medium ${data.monitoring.liquidityRatio > 20 ? 'text-green-600' : data.monitoring.liquidityRatio > 15 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {data.monitoring.liquidityRatio.toFixed(1)}%
                </span>
              </div>
            </div>
            
            <div className={`p-3 rounded-lg border ${
              data.monitoring.overallStatus === 'healthy' 
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-yellow-50 border-yellow-200 text-yellow-800'
            }`}>
              <div className="flex items-center gap-2">
                {data.monitoring.overallStatus === 'healthy' 
                  ? <CheckCircle className="h-4 w-4" />
                  : <AlertTriangle className="h-4 w-4" />
                }
                <span className="text-sm font-medium">
                  {data.monitoring.overallStatus === 'healthy' ? 'Tous les indicateurs sont sains' : 'Surveillance requise'}
                </span>
              </div>
            </div>
          </div>
        </ExpandableSection>
      </div>

      {/* Actions rapides */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Actions Rapides</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <QuickActionCard
              title="Nouveau Workflow"
              description="Soumettre pour approbation"
              icon={<Plus className="h-5 w-5" />}
              color="blue"
              onClick={() => {/* Ouvrir modal workflow */}}
            />
            
            <QuickActionCard
              title="Exécuter Contrôles"
              description="Lancer validation réglementaire"
              icon={<Play className="h-5 w-5" />}
              color="green"
              onClick={() => {/* Ouvrir contrôles */}}
            />
            
            <QuickActionCard
              title="Générer QRT"
              description="Templates EIOPA automatiques"
              icon={<FileCheck className="h-5 w-5" />}
              color="indigo"
              onClick={() => {/* Ouvrir QRT */}}
            />
            
            <QuickActionCard
              title="Rapport Conformité"
              description="Export documentation complète"
              icon={<Download className="h-5 w-5" />}
              color="purple"
              onClick={() => {/* Export rapport */}}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// ===== COMPOSANTS UTILITAIRES =====

const MetricCard: React.FC<{
  title: string;
  value: { value: string; color: string };
  icon: React.ReactNode;
  color: string;
  trend?: { value: number; direction: 'up' | 'down' };
}> = ({ title, value, icon, color, trend }) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
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
}> = ({ title, description, icon, color, onClick }) => (
  <button
    onClick={onClick}
    className={`p-4 border-2 border-${color}-200 rounded-lg hover:border-${color}-300 hover:bg-${color}-50 transition-all text-left group`}
  >
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

// Composants modules additionnels (placeholders)
const MonitoringModule: React.FC<{ data?: any }> = ({ data }) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
    <h2 className="text-xl font-bold mb-4">Module Monitoring Temps Réel</h2>
    <p>Composant de monitoring détaillé à développer...</p>
  </div>
);

const QRTModule: React.FC<{ data?: any }> = ({ data }) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
    <h2 className="text-xl font-bold mb-4">Module QRT Automatisés</h2>
    <p>Composant de génération QRT à développer...</p>
  </div>
);

const DocumentationModule: React.FC<{ data?: any }> = ({ data }) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
    <h2 className="text-xl font-bold mb-4">Module Documentation</h2>
    <p>Composant de génération documentaire à développer...</p>
  </div>
);

export default RegulatoryDashboardUnified;