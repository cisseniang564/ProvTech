// frontend/src/components/regulatory/RealTimeMonitoringSystem.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Activity, AlertTriangle, CheckCircle, XCircle, TrendingUp, TrendingDown,
  Gauge, Zap, Bell, Eye, RefreshCw, Pause, Play, Settings, Filter,
  BarChart3, PieChart, LineChart, Target, Shield, Clock, Calendar,
  ArrowUp, ArrowDown, Minus, Database, Globe, Wifi, WifiOff,
  AlertCircle, Info, MessageSquare, Phone, Mail, Users, Building
} from 'lucide-react';

// ===== TYPES POUR LE MONITORING =====
interface RegulatoryMetric {
  id: string;
  name: string;
  category: 'SCR' | 'MCR' | 'LIQUIDITY' | 'IFRS17' | 'DATA_QUALITY' | 'OPERATIONAL';
  subCategory: string;
  value: number;
  unit: 'PERCENTAGE' | 'AMOUNT' | 'RATIO' | 'COUNT' | 'DURATION';
  
  // Seuils d'alerte
  thresholds: {
    critical: { min?: number; max?: number; };
    warning: { min?: number; max?: number; };
    target: { min?: number; max?: number; };
  };
  
  // État actuel
  status: 'NORMAL' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
  trend: 'UP' | 'DOWN' | 'STABLE' | 'VOLATILE';
  lastUpdate: string;
  
  // Configuration
  config: {
    refreshRate: number; // secondes
    dataSource: string;
    calculation: string;
    enabled: boolean;
    alertOnChange: boolean;
    historicalDepth: number; // jours
  };
  
  // Données historiques
  history: MetricDataPoint[];
}

interface MetricDataPoint {
  timestamp: string;
  value: number;
  status: 'NORMAL' | 'WARNING' | 'CRITICAL';
  source: string;
}

interface AlertRule {
  id: string;
  name: string;
  metricId: string;
  condition: AlertCondition;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  enabled: boolean;
  
  // Configuration de notification
  notifications: {
    channels: ('EMAIL' | 'SMS' | 'SLACK' | 'TEAMS' | 'WEBHOOK')[];
    recipients: NotificationRecipient[];
    template: string;
    throttle: number; // minutes
  };
  
  // État d'activation
  state: {
    isTriggered: boolean;
    lastTriggered?: string;
    triggerCount: number;
    acknowledgements: AlertAcknowledgement[];
  };
}

interface AlertCondition {
  type: 'THRESHOLD' | 'TREND' | 'ANOMALY' | 'CORRELATION' | 'CUSTOM';
  operator: 'GT' | 'LT' | 'EQ' | 'NEQ' | 'GTE' | 'LTE' | 'BETWEEN';
  value: number | number[];
  duration?: number; // minutes - durée minimale de condition
  sensitivity?: number; // pour détection d'anomalies
}

interface NotificationRecipient {
  id: string;
  name: string;
  role: string;
  channels: {
    email?: string;
    phone?: string;
    slack?: string;
    teams?: string;
  };
  escalationLevel: number;
  timezone: string;
  workingHours?: {
    start: string;
    end: string;
    days: number[];
  };
}

interface AlertAcknowledgement {
  id: string;
  userId: string;
  userName: string;
  timestamp: string;
  comment?: string;
  action?: 'ACKNOWLEDGED' | 'RESOLVED' | 'ESCALATED' | 'SUPPRESSED';
}

interface MonitoringDashboard {
  id: string;
  name: string;
  description: string;
  layout: DashboardLayout;
  widgets: DashboardWidget[];
  permissions: {
    view: string[];
    edit: string[];
  };
  
  // Configuration d'affichage
  settings: {
    refreshRate: number;
    autoRefresh: boolean;
    theme: 'LIGHT' | 'DARK' | 'AUTO';
    density: 'COMPACT' | 'COMFORTABLE' | 'SPACIOUS';
  };
}

interface DashboardLayout {
  type: 'GRID' | 'FREEFORM';
  columns: number;
  rows: number;
  widgets: WidgetPosition[];
}

interface WidgetPosition {
  widgetId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DashboardWidget {
  id: string;
  type: 'METRIC' | 'CHART' | 'TABLE' | 'ALERT_LIST' | 'KPI_CARD' | 'GAUGE' | 'HEATMAP';
  title: string;
  config: WidgetConfig;
  dataSource: WidgetDataSource;
}

interface WidgetConfig {
  visualization: {
    chartType?: 'LINE' | 'BAR' | 'PIE' | 'AREA' | 'SCATTER';
    colors?: string[];
    showLegend?: boolean;
    showGrid?: boolean;
    animations?: boolean;
  };
  
  display: {
    showTitle?: boolean;
    showValue?: boolean;
    showTrend?: boolean;
    precision?: number;
    format?: string;
  };
  
  interaction: {
    clickable?: boolean;
    drillDown?: string;
    tooltip?: boolean;
  };
}

interface WidgetDataSource {
  type: 'METRIC' | 'CALCULATED' | 'AGGREGATED' | 'EXTERNAL';
  metrics: string[];
  timeRange: TimeRange;
  filters?: Record<string, any>;
  calculation?: string;
}

interface TimeRange {
  type: 'LAST_MINUTES' | 'LAST_HOURS' | 'LAST_DAYS' | 'CUSTOM';
  value: number;
  start?: string;
  end?: string;
}

interface SystemHealth {
  overall: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'OFFLINE';
  components: ComponentHealth[];
  uptime: number;
  lastIncident?: string;
  maintenanceWindow?: {
    start: string;
    end: string;
    description: string;
  };
}

interface ComponentHealth {
  id: string;
  name: string;
  status: 'UP' | 'DOWN' | 'DEGRADED' | 'MAINTENANCE';
  responseTime?: number;
  errorRate?: number;
  lastCheck: string;
  dependencies: string[];
}

// ===== MÉTRIQUES PRÉDÉFINIES (CORRIGÉES) =====
const REGULATORY_METRICS: Partial<RegulatoryMetric>[] = [
  {
    id: 'scr_coverage_ratio',
    name: 'Ratio de Couverture SCR',
    category: 'SCR',
    subCategory: 'Solvency',
    value: 158.5,
    unit: 'PERCENTAGE',
    thresholds: {
      critical: { min: 100 },
      warning: { min: 120 },
      target: { min: 150, max: 200 }
    },
    status: 'NORMAL',
    trend: 'STABLE',
    config: {
      refreshRate: 300, // 5 minutes
      dataSource: 'solvency2_service',
      calculation: 'own_funds / scr_amount * 100',
      enabled: true,
      alertOnChange: true,
      historicalDepth: 30
    }
  },
  {
    id: 'mcr_coverage_ratio',
    name: 'Ratio de Couverture MCR',
    category: 'MCR',
    subCategory: 'Solvency',
    value: 285.2,
    unit: 'PERCENTAGE',
    thresholds: {
      critical: { min: 100 },
      warning: { min: 150 },
      target: { min: 200 }
    },
    status: 'NORMAL',
    trend: 'UP',
    config: {
      refreshRate: 300,
      dataSource: 'solvency2_service',
      calculation: 'own_funds / mcr_amount * 100',
      enabled: true,
      alertOnChange: true,
      historicalDepth: 30
    }
  },
  {
    id: 'liquidity_coverage_ratio',
    name: 'Ratio de Liquidité',
    category: 'LIQUIDITY',
    subCategory: 'Assets',
    value: 145.8,
    unit: 'PERCENTAGE',
    thresholds: {
      critical: { min: 100 },
      warning: { min: 120 },
      target: { min: 130 }
    },
    status: 'NORMAL',
    trend: 'DOWN',
    config: {
      refreshRate: 900, // 15 minutes
      dataSource: 'treasury_service',
      calculation: 'liquid_assets / stressed_outflows',
      enabled: true,
      alertOnChange: false,
      historicalDepth: 7
    }
  },
  {
    id: 'ifrs17_csm_balance',
    name: 'Balance CSM IFRS 17',
    category: 'IFRS17',
    subCategory: 'CSM',
    value: 156780000,
    unit: 'AMOUNT',
    thresholds: {
      critical: { min: 50000000 }, // ✅ AJOUTÉ: Seuil critique
      warning: { min: 100000000 },
      target: { min: 150000000, max: 300000000 }
    },
    status: 'NORMAL',
    trend: 'STABLE',
    config: {
      refreshRate: 3600, // 1 heure
      dataSource: 'ifrs17_service',
      calculation: 'sum(csm_closing_balance)',
      enabled: true,
      alertOnChange: false,
      historicalDepth: 90
    }
  },
  {
    id: 'data_completeness',
    name: 'Complétude des Données',
    category: 'DATA_QUALITY',
    subCategory: 'Quality',
    value: 96.2,
    unit: 'PERCENTAGE',
    thresholds: {
      critical: { min: 85 }, // ✅ Déjà présent
      warning: { min: 95 },
      target: { min: 98 }
    },
    status: 'WARNING',
    trend: 'DOWN',
    config: {
      refreshRate: 1800, // 30 minutes
      dataSource: 'data_quality_service',
      calculation: 'completed_fields / total_fields * 100',
      enabled: true,
      alertOnChange: true,
      historicalDepth: 7
    }
  }
];

// ===== COMPOSANTS UI =====
const MetricGauge: React.FC<{
  metric: RegulatoryMetric;
  size?: 'sm' | 'md' | 'lg';
  showValue?: boolean;
  showTrend?: boolean;
}> = ({ metric, size = 'md', showValue = true, showTrend = true }) => {
  
  const getStatusColor = (status: RegulatoryMetric['status']) => {
    switch (status) {
      case 'NORMAL': return '#10B981';
      case 'WARNING': return '#F59E0B';
      case 'CRITICAL': return '#EF4444';
      case 'UNKNOWN': return '#6B7280';
    }
  };
  
  const getTrendIcon = (trend: RegulatoryMetric['trend']) => {
    switch (trend) {
      case 'UP': return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'DOWN': return <TrendingDown className="h-4 w-4 text-red-600" />;
      case 'STABLE': return <Minus className="h-4 w-4 text-gray-600" />;
      case 'VOLATILE': return <Activity className="h-4 w-4 text-orange-600" />;
    }
  };
  
  const formatValue = (value: number, unit: string) => {
    switch (unit) {
      case 'PERCENTAGE':
        return `${value.toFixed(1)}%`;
      case 'AMOUNT':
        return `${(value / 1000000).toFixed(1)}M€`;
      case 'RATIO':
        return value.toFixed(2);
      case 'COUNT':
        return value.toString();
      case 'DURATION':
        return `${value}s`;
      default:
        return value.toString();
    }
  };
  
  const getSizeClasses = (size: string) => {
    switch (size) {
      case 'sm': return { container: 'w-24 h-24', text: 'text-sm', value: 'text-lg' };
      case 'lg': return { container: 'w-40 h-40', text: 'text-lg', value: 'text-3xl' };
      default: return { container: 'w-32 h-32', text: 'text-base', value: 'text-xl' };
    }
  };
  
  const sizeClasses = getSizeClasses(size);
  const statusColor = getStatusColor(metric.status);
  
  // Calcul de l'angle pour la jauge (0-180 degrés)
  const minValue = metric.thresholds.critical?.min || 0;
  const maxValue = metric.thresholds.target?.max || metric.value * 1.2;
  const normalizedValue = Math.min(Math.max((metric.value - minValue) / (maxValue - minValue), 0), 1);
  const angle = normalizedValue * 180;
  
  return (
    <div className={`relative ${sizeClasses.container} mx-auto`}>
      {/* SVG Gauge */}
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
        <defs>
          <linearGradient id={`gradient-${metric.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#EF4444" />
            <stop offset="50%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#10B981" />
          </linearGradient>
        </defs>
        
        {/* Background arc */}
        <path
          d="M 10 85 A 40 40 0 0 1 90 85"
          fill="none"
          stroke="#E5E7EB"
          strokeWidth="8"
          strokeLinecap="round"
        />
        
        {/* Value arc */}
        <path
          d="M 10 85 A 40 40 0 0 1 90 85"
          fill="none"
          stroke={statusColor}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${normalizedValue * 125.66} 125.66`}
          className="transition-all duration-1000"
        />
        
        {/* Needle */}
        <line
          x1="50"
          y1="85"
          x2={50 + 35 * Math.cos((angle - 90) * Math.PI / 180)}
          y2={85 + 35 * Math.sin((angle - 90) * Math.PI / 180)}
          stroke={statusColor}
          strokeWidth="2"
          strokeLinecap="round"
          className="transition-all duration-1000"
        />
        
        {/* Center dot */}
        <circle cx="50" cy="85" r="3" fill={statusColor} />
      </svg>
      
      {/* Value display */}
      {showValue && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className={`font-bold ${sizeClasses.value}`} style={{ color: statusColor }}>
            {formatValue(metric.value, metric.unit)}
          </div>
          {showTrend && (
            <div className="flex items-center gap-1 mt-1">
              {getTrendIcon(metric.trend)}
            </div>
          )}
        </div>
      )}
      
      {/* Metric name */}
      <div className={`absolute bottom-0 left-0 right-0 text-center ${sizeClasses.text} font-medium text-gray-700`}>
        {metric.name}
      </div>
    </div>
  );
};

const RealTimeChart: React.FC<{
  metrics: RegulatoryMetric[];
  timeRange: TimeRange;
  chartType: 'LINE' | 'AREA' | 'BAR';
}> = ({ metrics, timeRange, chartType }) => {
  
  const [isLive, setIsLive] = useState(true);
  const chartRef = useRef<HTMLDivElement>(null);
  
  // Simulation de données temps réel
  const [liveData, setLiveData] = useState(() => {
    const now = Date.now();
    const data: Array<{ timestamp: string; [key: string]: any }> = [];
    
    for (let i = 59; i >= 0; i--) {
      const timestamp = new Date(now - i * 60000).toISOString();
      const point: any = { timestamp };
      
      metrics.forEach(metric => {
        // Simulation de variation des données
        const baseValue = metric.value;
        const variance = baseValue * 0.02; // 2% de variation
        point[metric.id] = baseValue + (Math.random() - 0.5) * variance;
      });
      
      data.push(point);
    }
    
    return data;
  });
  
  useEffect(() => {
    if (!isLive) return;
    
    const interval = setInterval(() => {
      setLiveData(prev => {
        const newData = [...prev];
        const now = new Date().toISOString();
        const newPoint: any = { timestamp: now };
        
        metrics.forEach(metric => {
          const lastValue = prev[prev.length - 1]?.[metric.id] || metric.value;
          const variance = metric.value * 0.01;
          newPoint[metric.id] = lastValue + (Math.random() - 0.5) * variance;
        });
        
        newData.push(newPoint);
        return newData.slice(-60); // Garde seulement les 60 derniers points
      });
    }, 5000); // Mise à jour toutes les 5 secondes
    
    return () => clearInterval(interval);
  }, [isLive, metrics]);
  
  const getMetricColor = (metricId: string) => {
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
    const index = metrics.findIndex(m => m.id === metricId);
    return colors[index % colors.length];
  };
  
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium text-gray-900">Monitoring Temps Réel</h3>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            <span className="text-sm text-gray-600">{isLive ? 'Live' : 'Paused'}</span>
          </div>
          <button
            onClick={() => setIsLive(!isLive)}
            className="p-2 text-gray-500 hover:text-gray-700"
          >
            {isLive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
        </div>
      </div>
      
      <div ref={chartRef} className="h-64 relative">
        {/* Simulation d'un graphique SVG */}
        <svg className="w-full h-full" viewBox="0 0 800 200">
          <defs>
            {metrics.map(metric => (
              <linearGradient key={metric.id} id={`area-${metric.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={getMetricColor(metric.id)} stopOpacity={0.3} />
                <stop offset="100%" stopColor={getMetricColor(metric.id)} stopOpacity={0.0} />
              </linearGradient>
            ))}
          </defs>
          
          {/* Grid lines */}
          <g stroke="#E5E7EB" strokeWidth="1" opacity="0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <line key={i} x1="0" y1={i * 40} x2="800" y2={i * 40} />
            ))}
            {Array.from({ length: 9 }).map((_, i) => (
              <line key={i} x1={i * 100} y1="0" x2={i * 100} y2="200" />
            ))}
          </g>
          
          {/* Data lines */}
          {metrics.map((metric, metricIndex) => {
            const points = liveData.map((point, i) => {
              const x = (i / (liveData.length - 1)) * 800;
              const value = point[metric.id];
              const normalizedValue = Math.max(0, Math.min(1, (value - metric.value * 0.8) / (metric.value * 0.4)));
              const y = 200 - (normalizedValue * 200);
              return `${x},${y}`;
            }).join(' ');
            
            return (
              <g key={metric.id}>
                {chartType === 'AREA' && (
                  <polygon
                    points={`0,200 ${points} 800,200`}
                    fill={`url(#area-${metric.id})`}
                  />
                )}
                <polyline
                  points={points}
                  fill="none"
                  stroke={getMetricColor(metric.id)}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </g>
            );
          })}
        </svg>
        
        {/* Legend */}
        <div className="absolute top-4 right-4 bg-white bg-opacity-90 rounded p-2 space-y-1">
          {metrics.map(metric => (
            <div key={metric.id} className="flex items-center gap-2 text-xs">
              <div 
                className="w-3 h-3 rounded" 
                style={{ backgroundColor: getMetricColor(metric.id) }}
              />
              <span>{metric.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const AlertsPanel: React.FC<{
  alerts: AlertRule[];
  onAcknowledge: (alertId: string) => void;
  onResolve: (alertId: string) => void;
  onEscalate: (alertId: string) => void;
}> = ({ alerts, onAcknowledge, onResolve, onEscalate }) => {
  
  const [filter, setFilter] = useState<'ALL' | 'CRITICAL' | 'WARNING' | 'TRIGGERED'>('ALL');
  
  const filteredAlerts = useMemo(() => {
    return alerts.filter(alert => {
      if (filter === 'ALL') return true;
      if (filter === 'TRIGGERED') return alert.state.isTriggered;
      return alert.severity === filter;
    });
  }, [alerts, filter]);
  
  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return <AlertCircle className="h-4 w-4 text-red-600" />;
      case 'WARNING': return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case 'INFO': return <Info className="h-4 w-4 text-blue-600" />;
      default: return <Bell className="h-4 w-4 text-gray-600" />;
    }
  };
  
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'bg-red-100 text-red-700 border-red-200';
      case 'WARNING': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'INFO': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };
  
  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-medium text-gray-900">Alertes Actives</h2>
          <div className="flex gap-2">
            {['ALL', 'CRITICAL', 'WARNING', 'TRIGGERED'].map(filterOption => (
              <button
                key={filterOption}
                onClick={() => setFilter(filterOption as any)}
                className={`px-3 py-1 rounded text-sm ${
                  filter === filterOption
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {filterOption}
              </button>
            ))}
          </div>
        </div>
      </div>
      
      <div className="max-h-96 overflow-y-auto">
        {filteredAlerts.length === 0 ? (
          <div className="p-6 text-center">
            <CheckCircle className="h-8 w-8 mx-auto text-green-500 mb-3" />
            <p className="text-gray-600">Aucune alerte active</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredAlerts.map(alert => (
              <div key={alert.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {getSeverityIcon(alert.severity)}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-gray-900">{alert.name}</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Métrique: {alert.metricId}
                      </p>
                      {alert.state.lastTriggered && (
                        <p className="text-xs text-gray-500 mt-1">
                          Déclenchée: {new Date(alert.state.lastTriggered).toLocaleString('fr-FR')}
                        </p>
                      )}
                      {alert.state.triggerCount > 1 && (
                        <p className="text-xs text-gray-500">
                          Occurrences: {alert.state.triggerCount}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getSeverityColor(alert.severity)}`}>
                      {alert.severity}
                    </span>
                    {alert.state.isTriggered && (
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    )}
                  </div>
                </div>
                
                {alert.state.isTriggered && (
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => onAcknowledge(alert.id)}
                      className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                    >
                      Acquitter
                    </button>
                    <button
                      onClick={() => onResolve(alert.id)}
                      className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                    >
                      Résoudre
                    </button>
                    <button
                      onClick={() => onEscalate(alert.id)}
                      className="px-3 py-1 bg-orange-600 text-white rounded text-xs hover:bg-orange-700"
                    >
                      Escalader
                    </button>
                  </div>
                )}
                
                {alert.state.acknowledgements.length > 0 && (
                  <div className="mt-3 p-2 bg-gray-50 rounded text-xs">
                    <p className="font-medium text-gray-700">Dernière action:</p>
                    <p className="text-gray-600">
                      {alert.state.acknowledgements[alert.state.acknowledgements.length - 1].userName} - 
                      {alert.state.acknowledgements[alert.state.acknowledgements.length - 1].action} - 
                      {new Date(alert.state.acknowledgements[alert.state.acknowledgements.length - 1].timestamp).toLocaleString('fr-FR')}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const SystemHealthStatus: React.FC<{ systemHealth: SystemHealth }> = ({ systemHealth }) => {
  
  const getOverallStatusColor = (status: SystemHealth['overall']) => {
    switch (status) {
      case 'HEALTHY': return 'text-green-600 bg-green-100';
      case 'DEGRADED': return 'text-yellow-600 bg-yellow-100';
      case 'CRITICAL': return 'text-red-600 bg-red-100';
      case 'OFFLINE': return 'text-gray-600 bg-gray-100';
    }
  };
  
  const getComponentStatusColor = (status: ComponentHealth['status']) => {
    switch (status) {
      case 'UP': return 'bg-green-500';
      case 'DOWN': return 'bg-red-500';
      case 'DEGRADED': return 'bg-yellow-500';
      case 'MAINTENANCE': return 'bg-blue-500';
    }
  };
  
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex justify-between items-start mb-4">
        <h2 className="text-lg font-medium text-gray-900">État du Système</h2>
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${getOverallStatusColor(systemHealth.overall)}`}>
          {systemHealth.overall}
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <p className="text-sm text-gray-600">Uptime</p>
          <p className="text-xl font-bold text-gray-900">{systemHealth.uptime.toFixed(2)}%</p>
        </div>
        <div>
          <p className="text-sm text-gray-600">Dernière vérification</p>
          <p className="text-sm text-gray-900">
            {new Date().toLocaleTimeString('fr-FR')}
          </p>
        </div>
      </div>
      
      <div className="space-y-3">
        <h3 className="font-medium text-gray-900">Composants</h3>
        {systemHealth.components.map(component => (
          <div key={component.id} className="flex items-center justify-between p-3 border border-gray-200 rounded">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${getComponentStatusColor(component.status)}`} />
              <div>
                <p className="font-medium text-gray-900">{component.name}</p>
                {component.responseTime && (
                  <p className="text-xs text-gray-500">
                    Temps de réponse: {component.responseTime}ms
                  </p>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">{component.status}</p>
              <p className="text-xs text-gray-500">
                {new Date(component.lastCheck).toLocaleTimeString('fr-FR')}
              </p>
            </div>
          </div>
        ))}
      </div>
      
      {systemHealth.maintenanceWindow && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
          <div className="flex items-start gap-2">
            <Settings className="h-4 w-4 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium text-blue-900">Fenêtre de maintenance programmée</p>
              <p className="text-sm text-blue-700 mt-1">
                {new Date(systemHealth.maintenanceWindow.start).toLocaleString('fr-FR')} - 
                {new Date(systemHealth.maintenanceWindow.end).toLocaleString('fr-FR')}
              </p>
              <p className="text-sm text-blue-600 mt-1">
                {systemHealth.maintenanceWindow.description}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ===== COMPOSANT PRINCIPAL =====
const RealTimeMonitoringSystem: React.FC<{
  onMetricAlert?: (metricId: string, alert: AlertRule) => void;
  onSystemEvent?: (event: any) => void;
}> = ({ onMetricAlert, onSystemEvent }) => {
  
  const [activeView, setActiveView] = useState<'overview' | 'metrics' | 'alerts' | 'system'>('overview');
  const [refreshRate, setRefreshRate] = useState(30); // secondes
  const [isConnected, setIsConnected] = useState(true);
  
  // Simulation des données
  const [metrics, setMetrics] = useState<RegulatoryMetric[]>(
    REGULATORY_METRICS.map(partial => ({
      ...partial,
      lastUpdate: new Date().toISOString(),
      history: Array.from({ length: 24 }, (_, i) => ({
        timestamp: new Date(Date.now() - (23 - i) * 60 * 60 * 1000).toISOString(),
        value: (partial.value || 0) + (Math.random() - 0.5) * (partial.value || 0) * 0.05,
        status: 'NORMAL' as const,
        source: 'real_time_monitor'
      }))
    } as RegulatoryMetric))
  );
  
  const [alerts, setAlerts] = useState<AlertRule[]>([
    {
      id: 'scr_critical_alert',
      name: 'SCR Ratio Critique',
      metricId: 'scr_coverage_ratio',
      condition: {
        type: 'THRESHOLD',
        operator: 'LT',
        value: 120,
        duration: 5
      },
      severity: 'CRITICAL',
      enabled: true,
      notifications: {
        channels: ['EMAIL', 'SMS'],
        recipients: [
          {
            id: 'chef_actuaire',
            name: 'Chef Actuaire',
            role: 'ACTUAIRE_CHEF',
            channels: { email: 'chef@company.com', phone: '+33123456789' },
            escalationLevel: 1,
            timezone: 'Europe/Paris'
          }
        ],
        template: 'critical_scr_alert',
        throttle: 15
      },
      state: {
        isTriggered: false,
        triggerCount: 0,
        acknowledgements: []
      }
    }
  ]);
  
  const [systemHealth] = useState<SystemHealth>({
    overall: 'HEALTHY',
    components: [
      {
        id: 'api_gateway',
        name: 'API Gateway',
        status: 'UP',
        responseTime: 45,
        errorRate: 0.1,
        lastCheck: new Date().toISOString(),
        dependencies: []
      },
      {
        id: 'ifrs17_service',
        name: 'Service IFRS 17',
        status: 'UP',
        responseTime: 120,
        errorRate: 0.0,
        lastCheck: new Date().toISOString(),
        dependencies: ['api_gateway']
      },
      {
        id: 'solvency2_service',
        name: 'Service Solvency II',
        status: 'UP',
        responseTime: 98,
        errorRate: 0.2,
        lastCheck: new Date().toISOString(),
        dependencies: ['api_gateway']
      },
      {
        id: 'data_quality_service',
        name: 'Service Qualité Données',
        status: 'DEGRADED',
        responseTime: 350,
        errorRate: 2.1,
        lastCheck: new Date().toISOString(),
        dependencies: ['api_gateway']
      }
    ],
    uptime: 99.87
  });
  
  // Simulation de mise à jour temps réel
  useEffect(() => {
    if (!isConnected) return;
    
    const interval = setInterval(() => {
      setMetrics(prev => prev.map(metric => {
        // Simulation de variation de valeur
        const variance = metric.value * 0.01; // 1% de variance
        const newValue = metric.value + (Math.random() - 0.5) * variance;
        
        // Détermination du statut
        let newStatus: RegulatoryMetric['status'] = 'NORMAL';
        if (metric.thresholds.critical?.min && newValue < metric.thresholds.critical.min) {
          newStatus = 'CRITICAL';
        } else if (metric.thresholds.critical?.max && newValue > metric.thresholds.critical.max) {
          newStatus = 'CRITICAL';
        } else if (metric.thresholds.warning?.min && newValue < metric.thresholds.warning.min) {
          newStatus = 'WARNING';
        } else if (metric.thresholds.warning?.max && newValue > metric.thresholds.warning.max) {
          newStatus = 'WARNING';
        }
        
        return {
          ...metric,
          value: newValue,
          status: newStatus,
          lastUpdate: new Date().toISOString(),
          history: [
            ...metric.history.slice(-23),
            {
              timestamp: new Date().toISOString(),
              value: newValue,
              status: newStatus,
              source: 'real_time_monitor'
            }
          ]
        };
      }));
    }, refreshRate * 1000);
    
    return () => clearInterval(interval);
  }, [refreshRate, isConnected]);
  
  const handleAcknowledgeAlert = (alertId: string) => {
    setAlerts(prev => prev.map(alert =>
      alert.id === alertId
        ? {
            ...alert,
            state: {
              ...alert.state,
              acknowledgements: [
                ...alert.state.acknowledgements,
                {
                  id: `ack_${Date.now()}`,
                  userId: 'current_user',
                  userName: 'Utilisateur Actuel',
                  timestamp: new Date().toISOString(),
                  action: 'ACKNOWLEDGED'
                }
              ]
            }
          }
        : alert
    ));
  };
  
  const handleResolveAlert = (alertId: string) => {
    setAlerts(prev => prev.map(alert =>
      alert.id === alertId
        ? {
            ...alert,
            state: {
              ...alert.state,
              isTriggered: false,
              acknowledgements: [
                ...alert.state.acknowledgements,
                {
                  id: `res_${Date.now()}`,
                  userId: 'current_user',
                  userName: 'Utilisateur Actuel',
                  timestamp: new Date().toISOString(),
                  action: 'RESOLVED'
                }
              ]
            }
          }
        : alert
    ));
  };
  
  const handleEscalateAlert = (alertId: string) => {
    console.log('Escalating alert:', alertId);
    // Logique d'escalade
  };

  const criticalMetrics = metrics.filter(m => m.status === 'CRITICAL');
  const warningMetrics = metrics.filter(m => m.status === 'WARNING');
  const activeAlerts = alerts.filter(a => a.state.isTriggered);

  return (
    <div className="max-w-7xl mx-auto bg-white rounded-lg shadow-lg">
      {/* Header avec statut de connexion */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Monitoring Réglementaire Temps Réel</h1>
            <div className="flex items-center gap-4 mt-2 text-sm">
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <>
                    <Wifi className="h-4 w-4 text-green-600" />
                    <span className="text-green-600">Connecté</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="h-4 w-4 text-red-600" />
                    <span className="text-red-600">Déconnecté</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-gray-500" />
                <span className="text-gray-600">Refresh: {refreshRate}s</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-500" />
                <span className="text-gray-600">{new Date().toLocaleTimeString('fr-FR')}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <select
              value={refreshRate}
              onChange={(e) => setRefreshRate(Number(e.target.value))}
              className="text-sm border border-gray-300 rounded px-3 py-2"
            >
              <option value={10}>10s</option>
              <option value={30}>30s</option>
              <option value={60}>1 min</option>
              <option value={300}>5 min</option>
            </select>
            
            <button
              onClick={() => setIsConnected(!isConnected)}
              className={`px-3 py-2 rounded-md text-sm font-medium ${
                isConnected
                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
            >
              {isConnected ? 'Déconnecter' : 'Reconnecter'}
            </button>
          </div>
        </div>
      </div>
      
      {/* Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8 px-6">
          {[
            { key: 'overview', label: 'Vue d\'ensemble', count: criticalMetrics.length + warningMetrics.length },
            { key: 'metrics', label: 'Métriques', count: metrics.length },
            { key: 'alerts', label: 'Alertes', count: activeAlerts.length },
            { key: 'system', label: 'Système', count: 0 }
          ].map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setActiveView(key as any)}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
                activeView === key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {label}
              {count > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  activeView === key ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                }`}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>
      
      <div className="p-6">
        {activeView === 'overview' && (
          <div className="space-y-6">
            {/* KPI Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-6 border border-green-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-green-600">Métriques Normales</p>
                    <p className="text-3xl font-bold text-green-900">
                      {metrics.filter(m => m.status === 'NORMAL').length}
                    </p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-6 border border-yellow-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-yellow-600">Avertissements</p>
                    <p className="text-3xl font-bold text-yellow-900">{warningMetrics.length}</p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-yellow-600" />
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-6 border border-red-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-red-600">Critiques</p>
                    <p className="text-3xl font-bold text-red-900">{criticalMetrics.length}</p>
                  </div>
                  <XCircle className="h-8 w-8 text-red-600" />
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-6 border border-blue-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-blue-600">Alertes Actives</p>
                    <p className="text-3xl font-bold text-blue-900">{activeAlerts.length}</p>
                  </div>
                  <Bell className="h-8 w-8 text-blue-600" />
                </div>
              </div>
            </div>
            
            {/* Key Metrics Gauges */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
              {metrics.slice(0, 5).map(metric => (
                <MetricGauge key={metric.id} metric={metric} size="md" />
              ))}
            </div>
            
            {/* Real-time Chart */}
            <RealTimeChart
              metrics={metrics.slice(0, 3)}
              timeRange={{ type: 'LAST_HOURS', value: 1 }}
              chartType="LINE"
            />
            
            {/* Critical Issues */}
            {(criticalMetrics.length > 0 || warningMetrics.length > 0) && (
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Issues Nécessitant une Attention
                </h3>
                <div className="space-y-3">
                  {criticalMetrics.map(metric => (
                    <div key={metric.id} className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded">
                      <div className="flex items-center gap-3">
                        <XCircle className="h-5 w-5 text-red-600" />
                        <div>
                          <p className="font-medium text-red-900">{metric.name}</p>
                          <p className="text-sm text-red-700">
                            Valeur actuelle: {metric.value.toFixed(2)} {metric.unit === 'PERCENTAGE' ? '%' : ''}
                          </p>
                        </div>
                      </div>
                      <button className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700">
                        Investiguer
                      </button>
                    </div>
                  ))}
                  
                  {warningMetrics.map(metric => (
                    <div key={metric.id} className="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="h-5 w-5 text-yellow-600" />
                        <div>
                          <p className="font-medium text-yellow-900">{metric.name}</p>
                          <p className="text-sm text-yellow-700">
                            Valeur actuelle: {metric.value.toFixed(2)} {metric.unit === 'PERCENTAGE' ? '%' : ''}
                          </p>
                        </div>
                      </div>
                      <button className="px-3 py-1 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700">
                        Surveiller
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        
        {activeView === 'metrics' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">Métriques Réglementaires</h2>
              <div className="flex gap-3">
                <select className="text-sm border border-gray-300 rounded px-3 py-2">
                  <option value="ALL">Toutes les catégories</option>
                  <option value="SCR">SCR</option>
                  <option value="MCR">MCR</option>
                  <option value="IFRS17">IFRS 17</option>
                  <option value="LIQUIDITY">Liquidité</option>
                </select>
              </div>
            </div>
            
            {/* Métriques en grille */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {metrics.map(metric => (
                <div key={metric.id} className="bg-white border border-gray-200 rounded-lg p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-medium text-gray-900">{metric.name}</h3>
                      <p className="text-sm text-gray-600">{metric.category} - {metric.subCategory}</p>
                    </div>
                    <div className={`w-3 h-3 rounded-full ${
                      metric.status === 'NORMAL' ? 'bg-green-500' :
                      metric.status === 'WARNING' ? 'bg-yellow-500' :
                      metric.status === 'CRITICAL' ? 'bg-red-500' :
                      'bg-gray-500'
                    }`} />
                  </div>
                  
                  <MetricGauge metric={metric} size="lg" />
                  
                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Dernière mise à jour:</span>
                      <span className="text-gray-900">
                        {new Date(metric.lastUpdate).toLocaleTimeString('fr-FR')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Seuil critique:</span>
                      <span className="text-gray-900">
                        {metric.thresholds.critical?.min || metric.thresholds.critical?.max || '—'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Tendance:</span>
                      <span className="text-gray-900">{metric.trend}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {activeView === 'alerts' && (
          <AlertsPanel
            alerts={alerts}
            onAcknowledge={handleAcknowledgeAlert}
            onResolve={handleResolveAlert}
            onEscalate={handleEscalateAlert}
          />
        )}
        
        {activeView === 'system' && (
          <SystemHealthStatus systemHealth={systemHealth} />
        )}
      </div>
    </div>
  );
};

export default RealTimeMonitoringSystem;