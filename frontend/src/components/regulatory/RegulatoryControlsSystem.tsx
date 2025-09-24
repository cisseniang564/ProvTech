// frontend/src/components/regulatory/RegulatoryControlsSystem.tsx
import React, { useState, useMemo, useEffect } from 'react';
import {
  Shield, AlertTriangle, CheckCircle, XCircle, Clock, Eye,
  TrendingUp, TrendingDown, BarChart3, PieChart, Target, Zap,
  Database, RefreshCw, Settings, Filter, Search, Calendar,
  FileText, Users, Building, Globe, Activity, Award, Flag,
  ArrowUp, ArrowDown, Minus, Plus, Download, Upload, Save,
  Bell, MessageSquare, Link, ExternalLink, Info, AlertCircle,
  Layers, Calculator, Gauge, Sliders, GitBranch, MapPin
} from 'lucide-react';

// ===== TYPES POUR LES CONTRÔLES RÉGLEMENTAIRES =====
interface RegulatoryControl {
  id: string;
  code: string;
  name: string;
  description: string;
  category: 'IFRS17' | 'SOLVENCY2' | 'PILIER3' | 'ACPR' | 'DATA_QUALITY' | 'CROSS_CHECK';
  subCategory: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  frequency: 'REAL_TIME' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'ON_DEMAND';
  automationLevel: 'AUTOMATED' | 'SEMI_AUTOMATED' | 'MANUAL';
  
  // Configuration du contrôle
  config: {
    dataSources: DataSourceReference[];
    thresholds: ControlThreshold[];
    rules: ValidationRule[];
    dependencies: string[]; // IDs d'autres contrôles
    escalationRules: EscalationRule[];
  };
  
  // Statut d'exécution
  execution: {
    status: 'SCHEDULED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SUSPENDED';
    lastRun?: string;
    nextRun?: string;
    duration?: number;
    result?: ControlResult;
    history: ControlExecution[];
  };
  
  // Métadonnées
  metadata: {
    owner: string;
    reviewers: string[];
    version: string;
    createdAt: string;
    lastModified: string;
    documentation: string;
    references: RegulatoryReference[];
  };
}

interface DataSourceReference {
  id: string;
  name: string;
  type: 'CALCULATION' | 'TRIANGLE' | 'EXTERNAL_API' | 'DATABASE' | 'FILE' | 'MANUAL_INPUT';
  connection: string;
  query?: string;
  refreshRate: 'REAL_TIME' | 'HOURLY' | 'DAILY' | 'MANUAL';
  lastUpdated?: string;
  dataQuality?: {
    completeness: number;
    accuracy: number;
    timeliness: number;
  };
}

interface ControlThreshold {
  id: string;
  metric: string;
  operator: 'GT' | 'LT' | 'EQ' | 'NEQ' | 'GTE' | 'LTE' | 'BETWEEN' | 'NOT_BETWEEN';
  value: number | number[];
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  message: string;
  action?: 'ALERT' | 'ESCALATE' | 'BLOCK' | 'AUTO_CORRECT';
}

interface ValidationRule {
  id: string;
  name: string;
  type: 'FORMULA' | 'COMPARISON' | 'RANGE_CHECK' | 'PATTERN_MATCH' | 'CUSTOM_FUNCTION';
  expression: string;
  errorMessage: string;
  warningMessage?: string;
  tolerance?: number;
}

interface EscalationRule {
  id: string;
  condition: string;
  delay: number; // minutes
  recipients: EscalationRecipient[];
  channels: ('EMAIL' | 'SMS' | 'SLACK' | 'TEAMS' | 'DASHBOARD')[];
  template: string;
}

interface EscalationRecipient {
  id: string;
  name: string;
  role: string;
  contactInfo: {
    email?: string;
    phone?: string;
    slack?: string;
  };
}

interface ControlResult {
  status: 'PASS' | 'FAIL' | 'WARNING' | 'ERROR';
  score?: number;
  details: ControlDetail[];
  summary: string;
  recommendations: string[];
  metrics: Record<string, number>;
  attachments: ResultAttachment[];
}

interface ControlDetail {
  check: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  actualValue: any;
  expectedValue?: any;
  variance?: number;
  message: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

interface ControlExecution {
  id: string;
  startTime: string;
  endTime?: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  triggeredBy: 'SCHEDULED' | 'MANUAL' | 'EVENT' | 'DEPENDENCY';
  result?: ControlResult;
  logs: ExecutionLog[];
}

interface ExecutionLog {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  component?: string;
}

interface ResultAttachment {
  id: string;
  name: string;
  type: 'CHART' | 'TABLE' | 'REPORT' | 'RAW_DATA';
  format: 'PNG' | 'PDF' | 'CSV' | 'XLSX' | 'JSON';
  url: string;
  size: number;
}

interface RegulatoryReference {
  type: 'ARTICLE' | 'STANDARD' | 'GUIDELINE' | 'INTERPRETATION';
  framework: 'IFRS17' | 'SOLVENCY2' | 'ACPR' | 'EIOPA' | 'CRR' | 'CRD';
  reference: string;
  title: string;
  url?: string;
  effectiveDate?: string;
}

interface ControlDashboard {
  overallStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  metrics: {
    totalControls: number;
    activeControls: number;
    passRate: number;
    avgExecutionTime: number;
    trendsData: TrendData[];
  };
  alerts: ControlAlert[];
  recentFailures: ControlExecution[];
  upcomingRuns: ControlSchedule[];
}

interface TrendData {
  date: string;
  passRate: number;
  executionCount: number;
  avgDuration: number;
}

interface ControlAlert {
  id: string;
  controlId: string;
  controlName: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  message: string;
  timestamp: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

interface ControlSchedule {
  controlId: string;
  controlName: string;
  nextRun: string;
  frequency: string;
  estimatedDuration: number;
  dependencies: string[];
}

// ===== CONTRÔLES PRÉDÉFINIS =====
const PREDEFINED_CONTROLS: Partial<RegulatoryControl>[] = [
  {
    id: 'ifrs17_csm_coherence',
    code: 'IFRS17-CSM-001',
    name: 'Cohérence des mouvements CSM',
    description: 'Vérifie la cohérence arithmétique des mouvements du CSM',
    category: 'IFRS17',
    subCategory: 'CSM Validation',
    priority: 'CRITICAL',
    frequency: 'DAILY',
    automationLevel: 'AUTOMATED',
    config: {
      dataSources: [
        {
          id: 'csm_movements',
          name: 'Mouvements CSM',
          type: 'CALCULATION',
          connection: 'ifrs17_service',
          refreshRate: 'DAILY'
        }
      ],
      thresholds: [
        {
          id: 'balance_check',
          metric: 'balance_variance',
          operator: 'LT',
          value: 0.01,
          severity: 'ERROR',
          message: 'Écart de balance CSM supérieur à 1%'
        }
      ],
      rules: [
        {
          id: 'csm_balance_rule',
          name: 'Balance CSM',
          type: 'FORMULA',
          expression: 'opening_balance + interest_accretion + service_release + experience_adj + unlocking_adj = closing_balance',
          errorMessage: 'La balance CSM n\'est pas cohérente'
        }
      ],
      dependencies: [],
      escalationRules: [
        {
          id: 'critical_escalation',
          condition: 'status = FAIL AND severity = CRITICAL',
          delay: 15,
          recipients: [
            {
              id: 'chef_actuaire',
              name: 'Chef Actuaire',
              role: 'ACTUAIRE_CHEF',
              contactInfo: { email: 'chef.actuaire@company.com' }
            }
          ],
          channels: ['EMAIL', 'DASHBOARD'],
          template: 'critical_control_failure'
        }
      ]
    }
  },
  {
    id: 'sii_scr_validation',
    code: 'SII-SCR-001',
    name: 'Validation SCR Standard Formula',
    description: 'Contrôle de cohérence du calcul SCR selon la formule standard',
    category: 'SOLVENCY2',
    subCategory: 'SCR Calculation',
    priority: 'CRITICAL',
    frequency: 'DAILY',
    automationLevel: 'AUTOMATED',
    config: {
      dataSources: [
        {
          id: 'scr_modules',
          name: 'Modules SCR',
          type: 'CALCULATION',
          connection: 'solvency2_service',
          refreshRate: 'DAILY'
        }
      ],
      thresholds: [
        {
          id: 'scr_ratio_threshold',
          metric: 'scr_coverage_ratio',
          operator: 'GTE',
          value: 100,
          severity: 'CRITICAL',
          message: 'Ratio de couverture SCR en dessous du minimum réglementaire'
        }
      ],
      rules: [
        {
          id: 'diversification_rule',
          name: 'Bénéfice de diversification',
          type: 'RANGE_CHECK',
          expression: 'diversification_benefit BETWEEN -50% AND 0%',
          errorMessage: 'Bénéfice de diversification hors limites acceptables'
        }
      ],
      dependencies: ['data_quality_triangles'],
      escalationRules: []
    }
  },
  {
    id: 'data_quality_triangles',
    code: 'DQ-TRI-001',
    name: 'Qualité des Données Triangles',
    description: 'Validation de la complétude et cohérence des triangles de développement',
    category: 'DATA_QUALITY',
    subCategory: 'Triangle Validation',
    priority: 'HIGH',
    frequency: 'DAILY',
    automationLevel: 'AUTOMATED',
    config: {
      dataSources: [
        {
          id: 'triangles_data',
          name: 'Données Triangles',
          type: 'DATABASE',
          connection: 'triangles_db',
          refreshRate: 'HOURLY'
        }
      ],
      thresholds: [
        {
          id: 'completeness_threshold',
          metric: 'data_completeness',
          operator: 'GTE',
          value: 95,
          severity: 'WARNING',
          message: 'Complétude des données triangles insuffisante'
        }
      ],
      rules: [
        {
          id: 'monotonic_cumulative',
          name: 'Cumulés monotones',
          type: 'CUSTOM_FUNCTION',
          expression: 'validate_monotonic_cumulative(triangle_data)',
          errorMessage: 'Les cumulés ne sont pas monotones'
        }
      ],
      dependencies: [],
      escalationRules: []
    }
  },
  {
    id: 'ifrs17_sii_reconciliation',
    code: 'RECON-001',
    name: 'Réconciliation IFRS 17 ↔ Solvency II',
    description: 'Contrôle de cohérence entre les bases IFRS 17 et Solvency II',
    category: 'CROSS_CHECK',
    subCategory: 'Framework Reconciliation',
    priority: 'HIGH',
    frequency: 'MONTHLY',
    automationLevel: 'SEMI_AUTOMATED',
    config: {
      dataSources: [
        {
          id: 'ifrs17_liabilities',
          name: 'Passifs IFRS 17',
          type: 'CALCULATION',
          connection: 'ifrs17_service',
          refreshRate: 'DAILY'
        },
        {
          id: 'sii_technical_provisions',
          name: 'Provisions Techniques SII',
          type: 'CALCULATION',
          connection: 'solvency2_service',
          refreshRate: 'DAILY'
        }
      ],
      thresholds: [
        {
          id: 'reconciliation_variance',
          metric: 'variance_percentage',
          operator: 'LT',
          value: 10,
          severity: 'WARNING',
          message: 'Écart de réconciliation IFRS17/SII supérieur à 10%'
        }
      ],
      rules: [],
      dependencies: ['ifrs17_csm_coherence', 'sii_scr_validation'],
      escalationRules: []
    }
  }
];

// ===== COMPOSANTS UI =====
const ControlStatusBadge: React.FC<{ status: ControlResult['status']; size?: 'sm' | 'md' | 'lg' }> = ({ 
  status, 
  size = 'md' 
}) => {
  const configs = {
    PASS: { color: 'green', icon: CheckCircle, text: 'Conforme' },
    FAIL: { color: 'red', icon: XCircle, text: 'Non conforme' },
    WARNING: { color: 'yellow', icon: AlertTriangle, text: 'Attention' },
    ERROR: { color: 'red', icon: AlertCircle, text: 'Erreur' }
  };
  
  const config = configs[status];
  const Icon = config.icon;
  
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5'
  };
  
  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
  };
  
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium
      bg-${config.color}-100 text-${config.color}-700 ${sizeClasses[size]}`}>
      <Icon className={iconSizes[size]} />
      {config.text}
    </span>
  );
};

const PriorityIndicator: React.FC<{ priority: RegulatoryControl['priority'] }> = ({ priority }) => {
  const configs = {
    CRITICAL: { color: 'red', text: 'Critique', level: 4 },
    HIGH: { color: 'orange', text: 'Élevée', level: 3 },
    MEDIUM: { color: 'yellow', text: 'Moyenne', level: 2 },
    LOW: { color: 'green', text: 'Faible', level: 1 }
  };
  
  const config = configs[priority];
  
  return (
    <div className="flex items-center gap-2">
      <div className="flex">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={`w-1 h-3 mr-0.5 ${
              i < config.level 
                ? `bg-${config.color}-500` 
                : 'bg-gray-300'
            }`}
          />
        ))}
      </div>
      <span className={`text-xs font-medium text-${config.color}-700`}>
        {config.text}
      </span>
    </div>
  );
};

const ControlExecutionTimeline: React.FC<{ 
  executions: ControlExecution[];
  onViewDetails: (execution: ControlExecution) => void;
}> = ({ executions, onViewDetails }) => {
  
  const getStatusColor = (status: ControlExecution['status']) => {
    switch (status) {
      case 'COMPLETED': return 'green';
      case 'FAILED': return 'red';
      case 'RUNNING': return 'blue';
      case 'CANCELLED': return 'gray';
      default: return 'gray';
    }
  };
  
  return (
    <div className="space-y-3">
      {executions.map((execution, index) => (
        <div key={execution.id} className="relative">
          {index < executions.length - 1 && (
            <div className="absolute left-4 top-8 w-0.5 h-12 bg-gray-300" />
          )}
          
          <div className="flex items-start gap-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center
              bg-${getStatusColor(execution.status)}-100 text-${getStatusColor(execution.status)}-600`}>
              {execution.status === 'COMPLETED' && <CheckCircle className="h-4 w-4" />}
              {execution.status === 'FAILED' && <XCircle className="h-4 w-4" />}
              {execution.status === 'RUNNING' && <RefreshCw className="h-4 w-4 animate-spin" />}
              {execution.status === 'CANCELLED' && <Minus className="h-4 w-4" />}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    Exécution {execution.id.substring(0, 8)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(execution.startTime).toLocaleString('fr-FR')}
                    {execution.endTime && (
                      <span> - {new Date(execution.endTime).toLocaleString('fr-FR')}</span>
                    )}
                  </p>
                </div>
                
                <div className="flex items-center gap-2">
                  {execution.result && (
                    <ControlStatusBadge status={execution.result.status} size="sm" />
                  )}
                  <button
                    onClick={() => onViewDetails(execution)}
                    className="text-blue-600 hover:text-blue-700 text-xs font-medium"
                  >
                    Détails
                  </button>
                </div>
              </div>
              
              {execution.result && (
                <div className="mt-2">
                  <p className="text-xs text-gray-600">{execution.result.summary}</p>
                  {execution.result.score !== undefined && (
                    <div className="mt-1 flex items-center gap-2">
                      <div className="w-16 bg-gray-200 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${
                            execution.result.score >= 90 ? 'bg-green-500' :
                            execution.result.score >= 70 ? 'bg-yellow-500' :
                            'bg-red-500'
                          }`}
                          style={{ width: `${execution.result.score}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500">{execution.result.score}%</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const ControlDetailView: React.FC<{ 
  control: RegulatoryControl;
  onEdit: (control: RegulatoryControl) => void;
  onExecute: (controlId: string) => void;
  onSchedule: (controlId: string, schedule: any) => void;
}> = ({ control, onEdit, onExecute, onSchedule }) => {
  
  const [activeTab, setActiveTab] = useState<'overview' | 'config' | 'history' | 'dependencies'>('overview');
  
  const getFrequencyText = (frequency: string) => {
    const map = {
      REAL_TIME: 'Temps réel',
      DAILY: 'Quotidien',
      WEEKLY: 'Hebdomadaire',
      MONTHLY: 'Mensuel',
      QUARTERLY: 'Trimestriel',
      ANNUAL: 'Annuel',
      ON_DEMAND: 'À la demande'
    };
    return map[frequency as keyof typeof map] || frequency;
  };
  
  const getAutomationBadge = (level: string) => {
    const configs = {
      AUTOMATED: { color: 'green', text: 'Automatisé' },
      SEMI_AUTOMATED: { color: 'yellow', text: 'Semi-automatisé' },
      MANUAL: { color: 'gray', text: 'Manuel' }
    };
    const config = configs[level as keyof typeof configs];
    
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
        bg-${config.color}-100 text-${config.color}-700`}>
        {config.text}
      </span>
    );
  };
  
  return (
    <div className="bg-white rounded-lg shadow-lg">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{control.name}</h2>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
              <span className="font-medium">{control.code}</span>
              <span>•</span>
              <span>{control.category}</span>
              <span>•</span>
              <span>{getFrequencyText(control.frequency)}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <PriorityIndicator priority={control.priority} />
            {getAutomationBadge(control.automationLevel)}
            {control.execution.result && (
              <ControlStatusBadge status={control.execution.result.status} />
            )}
          </div>
        </div>
        
        <p className="mt-3 text-gray-700">{control.description}</p>
      </div>
      
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8 px-6">
          {[
            { key: 'overview', label: 'Vue d\'ensemble' },
            { key: 'config', label: 'Configuration' },
            { key: 'history', label: 'Historique' },
            { key: 'dependencies', label: 'Dépendances' }
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as any)}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>
      
      <div className="p-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Statut d'exécution */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">Dernière exécution</span>
                </div>
                <p className="text-lg font-semibold text-gray-900">
                  {control.execution.lastRun 
                    ? new Date(control.execution.lastRun).toLocaleDateString('fr-FR')
                    : 'Jamais'
                  }
                </p>
                {control.execution.duration && (
                  <p className="text-xs text-gray-500 mt-1">
                    Durée: {control.execution.duration}ms
                  </p>
                )}
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <RefreshCw className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">Prochaine exécution</span>
                </div>
                <p className="text-lg font-semibold text-gray-900">
                  {control.execution.nextRun 
                    ? new Date(control.execution.nextRun).toLocaleDateString('fr-FR')
                    : 'Non planifiée'
                  }
                </p>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">Statut</span>
                </div>
                <p className="text-lg font-semibold text-gray-900">
                  {control.execution.status}
                </p>
              </div>
            </div>
            
            {/* Actions rapides */}
            <div className="flex gap-3">
              <button
                onClick={() => onExecute(control.id)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
                disabled={control.execution.status === 'RUNNING'}
              >
                <Zap className="h-4 w-4" />
                Exécuter maintenant
              </button>
              
              <button
                onClick={() => onEdit(control)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 flex items-center gap-2"
              >
                <Settings className="h-4 w-4" />
                Configurer
              </button>
              
              <button
                onClick={() => onSchedule(control.id, {})}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2"
              >
                <Calendar className="h-4 w-4" />
                Planifier
              </button>
            </div>
            
            {/* Derniers résultats */}
            {control.execution.result && (
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Derniers résultats</h3>
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-4">
                    <ControlStatusBadge status={control.execution.result.status} size="lg" />
                    {control.execution.result.score !== undefined && (
                      <div className="text-right">
                        <p className="text-2xl font-bold text-gray-900">{control.execution.result.score}%</p>
                        <p className="text-sm text-gray-500">Score de conformité</p>
                      </div>
                    )}
                  </div>
                  
                  <p className="text-gray-700 mb-4">{control.execution.result.summary}</p>
                  
                  {control.execution.result.details.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-medium text-gray-900">Détails des vérifications</h4>
                      {control.execution.result.details.slice(0, 3).map((detail, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <span className="text-sm text-gray-700">{detail.check}</span>
                          <ControlStatusBadge status={detail.status} size="sm" />
                        </div>
                      ))}
                      {control.execution.result.details.length > 3 && (
                        <p className="text-sm text-gray-500">
                          ... et {control.execution.result.details.length - 3} autres vérifications
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'config' && (
          <div className="space-y-6">
            {/* Sources de données */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Sources de données</h3>
              <div className="space-y-3">
                {control.config.dataSources.map((source, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium text-gray-900">{source.name}</h4>
                        <p className="text-sm text-gray-600 mt-1">Type: {source.type}</p>
                        <p className="text-sm text-gray-600">Connexion: {source.connection}</p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        source.refreshRate === 'REAL_TIME' ? 'bg-green-100 text-green-700' :
                        source.refreshRate === 'HOURLY' || source.refreshRate === 'DAILY' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {source.refreshRate}
                      </span>
                    </div>
                    {source.query && (
                      <div className="mt-3 p-2 bg-gray-50 rounded text-sm font-mono">
                        {source.query}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            
            {/* Seuils */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Seuils et alertes</h3>
              <div className="space-y-3">
                {control.config.thresholds.map((threshold, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium text-gray-900">{threshold.metric}</h4>
                        <p className="text-sm text-gray-600 mt-1">
                          {threshold.operator} {Array.isArray(threshold.value) ? threshold.value.join(' - ') : threshold.value}
                        </p>
                        <p className="text-sm text-gray-600">{threshold.message}</p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        threshold.severity === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                        threshold.severity === 'ERROR' ? 'bg-orange-100 text-orange-700' :
                        threshold.severity === 'WARNING' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {threshold.severity}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Règles de validation */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Règles de validation</h3>
              <div className="space-y-3">
                {control.config.rules.map((rule, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-2">{rule.name}</h4>
                    <div className="bg-gray-50 p-3 rounded text-sm font-mono">
                      {rule.expression}
                    </div>
                    <p className="text-sm text-gray-600 mt-2">{rule.errorMessage}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'history' && (
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Historique des exécutions</h3>
            {control.execution.history.length > 0 ? (
              <ControlExecutionTimeline 
                executions={control.execution.history}
                onViewDetails={(execution) => console.log('View details:', execution)}
              />
            ) : (
              <div className="text-center py-8">
                <Activity className="h-8 w-8 mx-auto text-gray-400 mb-3" />
                <p className="text-gray-600">Aucun historique d'exécution disponible</p>
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'dependencies' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Dépendances</h3>
              {control.config.dependencies.length > 0 ? (
                <div className="space-y-2">
                  {control.config.dependencies.map((depId, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 border border-gray-200 rounded">
                      <GitBranch className="h-4 w-4 text-gray-500" />
                      <span className="text-sm font-medium text-gray-900">{depId}</span>
                      <span className="text-sm text-gray-500">→ Doit être exécuté avant ce contrôle</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-600">Aucune dépendance configurée</p>
              )}
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Règles d'escalade</h3>
              {control.config.escalationRules.length > 0 ? (
                <div className="space-y-3">
                  {control.config.escalationRules.map((rule, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-medium text-gray-900">Escalade #{index + 1}</h4>
                        <span className="text-sm text-gray-500">{rule.delay} minutes</span>
                      </div>
                      <p className="text-sm text-gray-600 mb-3">Condition: {rule.condition}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">Canaux:</span>
                        {rule.channels.map(channel => (
                          <span key={channel} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                            {channel}
                          </span>
                        ))}
                      </div>
                      <div className="mt-2">
                        <span className="text-sm text-gray-500">Destinataires: </span>
                        <span className="text-sm text-gray-900">
                          {rule.recipients.map(r => r.name).join(', ')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-600">Aucune règle d'escalade configurée</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ===== COMPOSANT PRINCIPAL =====
const RegulatoryControlsSystem: React.FC<{
  onControlExecuted?: (controlId: string, result: ControlResult) => void;
  onAlertGenerated?: (alert: ControlAlert) => void;
}> = ({ onControlExecuted, onAlertGenerated }) => {
  
  const [activeView, setActiveView] = useState<'dashboard' | 'controls' | 'alerts' | 'reports'>('dashboard');
  const [selectedControl, setSelectedControl] = useState<RegulatoryControl | null>(null);
  const [filters, setFilters] = useState({
    category: 'ALL',
    priority: 'ALL',
    status: 'ALL',
    automation: 'ALL'
  });
  
  // États des données (simulation)
  const [controls, setControls] = useState<RegulatoryControl[]>(
    PREDEFINED_CONTROLS.map((partial, index) => ({
      ...partial,
      execution: {
        status: 'COMPLETED',
        lastRun: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
        nextRun: new Date(Date.now() + Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
        duration: Math.floor(Math.random() * 5000) + 1000,
        result: {
          status: Math.random() > 0.8 ? 'FAIL' : Math.random() > 0.6 ? 'WARNING' : 'PASS',
          score: Math.floor(Math.random() * 40) + 60,
          details: [],
          summary: 'Contrôle exécuté avec succès',
          recommendations: [],
          metrics: {},
          attachments: []
        },
        history: []
      },
      metadata: {
        owner: 'Jean Actuaire',
        reviewers: ['Marie Chef', 'Paul Valideur'],
        version: '1.0',
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        lastModified: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
        documentation: 'Documentation complète disponible',
        references: []
      }
    } as RegulatoryControl))
  );
  
  const [alerts, setAlerts] = useState<ControlAlert[]>([
    {
      id: 'alert1',
      controlId: 'ifrs17_csm_coherence',
      controlName: 'Cohérence des mouvements CSM',
      severity: 'CRITICAL',
      message: 'Écart de balance CSM détecté: 2.3%',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      acknowledged: false
    },
    {
      id: 'alert2',
      controlId: 'data_quality_triangles',
      controlName: 'Qualité des Données Triangles',
      severity: 'WARNING',
      message: 'Complétude des données: 92% (seuil: 95%)',
      timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      acknowledged: true,
      acknowledgedBy: 'Marie Chef',
      acknowledgedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
    }
  ]);
  
  // Métriques du dashboard
  const dashboardMetrics = useMemo(() => {
    const totalControls = controls.length;
    const activeControls = controls.filter(c => c.execution.status !== 'SUSPENDED').length;
    const passedControls = controls.filter(c => c.execution.result?.status === 'PASS').length;
    const passRate = activeControls > 0 ? (passedControls / activeControls) * 100 : 0;
    const avgExecutionTime = controls.reduce((sum, c) => sum + (c.execution.duration || 0), 0) / controls.length;
    
    return {
      totalControls,
      activeControls,
      passRate,
      avgExecutionTime,
      criticalAlerts: alerts.filter(a => a.severity === 'CRITICAL' && !a.acknowledged).length,
      upcomingRuns: controls.filter(c => c.execution.nextRun).length
    };
  }, [controls, alerts]);
  
  const filteredControls = useMemo(() => {
    return controls.filter(control => {
      if (filters.category !== 'ALL' && control.category !== filters.category) return false;
      if (filters.priority !== 'ALL' && control.priority !== filters.priority) return false;
      if (filters.status !== 'ALL' && control.execution.result?.status !== filters.status) return false;
      if (filters.automation !== 'ALL' && control.automationLevel !== filters.automation) return false;
      return true;
    });
  }, [controls, filters]);
  
  const handleExecuteControl = (controlId: string) => {
    console.log('Executing control:', controlId);
    // Logique d'exécution
  };
  
  const handleEditControl = (control: RegulatoryControl) => {
    console.log('Editing control:', control);
    // Logique d'édition
  };
  
  const handleScheduleControl = (controlId: string, schedule: any) => {
    console.log('Scheduling control:', controlId, schedule);
    // Logique de planification
  };
  
  const handleAcknowledgeAlert = (alertId: string) => {
    setAlerts(prev => prev.map(alert => 
      alert.id === alertId 
        ? { ...alert, acknowledged: true, acknowledgedBy: 'Utilisateur Actuel', acknowledgedAt: new Date().toISOString() }
        : alert
    ));
  };

  return (
    <div className="max-w-7xl mx-auto bg-white rounded-lg shadow-lg">
      {/* Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8 px-6">
          {[
            { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
            { key: 'controls', label: 'Contrôles', icon: Shield },
            { key: 'alerts', label: 'Alertes', icon: Bell },
            { key: 'reports', label: 'Rapports', icon: FileText }
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveView(key as any)}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
                activeView === key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
              {key === 'alerts' && alerts.filter(a => !a.acknowledged).length > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {alerts.filter(a => !a.acknowledged).length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>
      
      <div className="p-6">
        {activeView === 'dashboard' && (
          <div className="space-y-6">
            <h1 className="text-2xl font-bold text-gray-900">
              Tableau de Bord - Contrôles Réglementaires
            </h1>
            
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-6 border border-blue-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-blue-600">Contrôles Actifs</p>
                    <p className="text-3xl font-bold text-blue-900">{dashboardMetrics.activeControls}</p>
                    <p className="text-xs text-blue-600 mt-1">sur {dashboardMetrics.totalControls} total</p>
                  </div>
                  <Shield className="h-8 w-8 text-blue-600" />
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-6 border border-green-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-green-600">Taux de Conformité</p>
                    <p className="text-3xl font-bold text-green-900">{dashboardMetrics.passRate.toFixed(1)}%</p>
                    <p className="text-xs text-green-600 mt-1">dernières 24h</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-6 border border-yellow-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-yellow-600">Alertes Critiques</p>
                    <p className="text-3xl font-bold text-yellow-900">{dashboardMetrics.criticalAlerts}</p>
                    <p className="text-xs text-yellow-600 mt-1">non acquittées</p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-yellow-600" />
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-6 border border-purple-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-purple-600">Temps Moyen</p>
                    <p className="text-3xl font-bold text-purple-900">{(dashboardMetrics.avgExecutionTime / 1000).toFixed(1)}s</p>
                    <p className="text-xs text-purple-600 mt-1">d'exécution</p>
                  </div>
                  <Clock className="h-8 w-8 text-purple-600" />
                </div>
              </div>
            </div>
            
            {/* Alertes récentes */}
            <div className="bg-white border border-gray-200 rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-medium text-gray-900">Alertes Récentes</h2>
              </div>
              <div className="p-6">
                {alerts.slice(0, 5).map(alert => (
                  <div key={alert.id} className="flex items-center justify-between py-3 border-b border-gray-200 last:border-b-0">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${
                        alert.severity === 'CRITICAL' ? 'bg-red-500' :
                        alert.severity === 'WARNING' ? 'bg-yellow-500' :
                        'bg-blue-500'
                      }`} />
                      <div>
                        <p className="font-medium text-gray-900">{alert.controlName}</p>
                        <p className="text-sm text-gray-600">{alert.message}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(alert.timestamp).toLocaleString('fr-FR')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {alert.acknowledged ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                          Acquittée
                        </span>
                      ) : (
                        <button
                          onClick={() => handleAcknowledgeAlert(alert.id)}
                          className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                        >
                          Acquitter
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {activeView === 'controls' && !selectedControl && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold text-gray-900">Contrôles Réglementaires</h1>
              <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Nouveau Contrôle
              </button>
            </div>
            
            {/* Filtres */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie</label>
                  <select
                    value={filters.category}
                    onChange={(e) => setFilters({...filters, category: e.target.value})}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  >
                    <option value="ALL">Toutes</option>
                    <option value="IFRS17">IFRS 17</option>
                    <option value="SOLVENCY2">Solvency II</option>
                    <option value="DATA_QUALITY">Qualité des données</option>
                    <option value="CROSS_CHECK">Contrôles croisés</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priorité</label>
                  <select
                    value={filters.priority}
                    onChange={(e) => setFilters({...filters, priority: e.target.value})}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  >
                    <option value="ALL">Toutes</option>
                    <option value="CRITICAL">Critique</option>
                    <option value="HIGH">Élevée</option>
                    <option value="MEDIUM">Moyenne</option>
                    <option value="LOW">Faible</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
                  <select
                    value={filters.status}
                    onChange={(e) => setFilters({...filters, status: e.target.value})}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  >
                    <option value="ALL">Tous</option>
                    <option value="PASS">Conforme</option>
                    <option value="WARNING">Attention</option>
                    <option value="FAIL">Non conforme</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Automation</label>
                  <select
                    value={filters.automation}
                    onChange={(e) => setFilters({...filters, automation: e.target.value})}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  >
                    <option value="ALL">Tous</option>
                    <option value="AUTOMATED">Automatisé</option>
                    <option value="SEMI_AUTOMATED">Semi-automatisé</option>
                    <option value="MANUAL">Manuel</option>
                  </select>
                </div>
              </div>
            </div>
            
            {/* Liste des contrôles */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {filteredControls.map(control => (
                <div key={control.id} className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-medium text-gray-900 mb-1">{control.name}</h3>
                      <p className="text-sm text-gray-600 mb-2">{control.description}</p>
                      <div className="flex items-center gap-3">
                        <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                          {control.code}
                        </span>
                        <span className="text-xs text-gray-500">{control.category}</span>
                      </div>
                    </div>
                    <PriorityIndicator priority={control.priority} />
                  </div>
                  
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Dernière exécution:</span>
                      {control.execution.result && (
                        <ControlStatusBadge status={control.execution.result.status} size="sm" />
                      )}
                    </div>
                    <span className="text-sm text-gray-500">
                      {control.execution.lastRun 
                        ? new Date(control.execution.lastRun).toLocaleDateString('fr-FR')
                        : 'Jamais'
                      }
                    </span>
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedControl(control)}
                      className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                    >
                      Voir détails
                    </button>
                    <button
                      onClick={() => handleExecuteControl(control.id)}
                      className="px-3 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                      title="Exécuter"
                    >
                      <Zap className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {activeView === 'controls' && selectedControl && (
          <div>
            <div className="mb-6">
              <button
                onClick={() => setSelectedControl(null)}
                className="text-blue-600 hover:text-blue-700 font-medium text-sm flex items-center gap-1"
              >
                ← Retour à la liste
              </button>
            </div>
            <ControlDetailView
              control={selectedControl}
              onEdit={handleEditControl}
              onExecute={handleExecuteControl}
              onSchedule={handleScheduleControl}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default RegulatoryControlsSystem;