// frontend/src/components/regulatory/RealTimeMonitoringPanel.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, CheckCircle, XCircle, Clock, Bell,
  TrendingUp, TrendingDown, Minus, Gauge, Shield, Zap,
  Eye, Settings, Pause, Play, AlertCircle, Info,
  Wifi, WifiOff, RefreshCw, Download, Share2,
  BarChart3, LineChart, PieChart, ArrowUp, ArrowDown,
  Target, Timer, Signal, Radio, Volume2, VolumeX,
  Server, Database, Globe, Cpu, HardDrive, Network
} from 'lucide-react';
import toast from 'react-hot-toast';

// ===== TYPES =====
interface RealTimeAlert {
  id: string;
  rule_id: string;
  rule_name: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  current_value: number;
  threshold_value: number;
  deviation_percent: number;
  calculation_id?: string;
  triangle_id?: string;
  business_line?: string;
  triggered_at: string;
  acknowledged_at?: string;
  acknowledged_by?: number;
  escalated_at?: string;
  escalation_level: string;
  actions_taken: string[];
  resolution_notes?: string;
  resolved_at?: string;
}

interface MonitoringRule {
  id: string;
  name: string;
  description: string;
  rule_type: string;
  is_active: boolean;
  warning_threshold: number;
  critical_threshold: number;
  blocking_threshold?: number;
  escalation_delays: Record<string, number>;
  escalation_targets: Record<string, string[]>;
  created_by?: number;
  created_at: string;
  last_triggered?: string;
}

interface MarketData {
  date: string;
  risk_free_rates: Record<string, number>;
  equity_indices: Record<string, number>;
  credit_spreads: Record<string, number>;
  fx_rates: Record<string, number>;
  volatilities: Record<string, number>;
}

interface SystemHealth {
  overall_status: string;
  active_alerts_count: number;
  critical_alerts_count: number;
  last_calculation_time?: string;
  system_load: number;
  database_health: string;
  api_response_time: number;
}

interface MonitoringDashboard {
  summary: {
    active_alerts: number;
    critical_alerts: number;
    alerts_last_24h: number;
    active_rules: number;
    monitoring_status: string;
    last_evaluation: string;
  };
  alerts_by_severity: Record<string, number>;
  current_ratios: Record<string, number>;
  market_data?: MarketData;
  recent_alerts: RealTimeAlert[];
  system_metrics: Record<string, any>;
}

// ===== CONFIGURATION API =====
const API = (import.meta as any).env?.VITE_API_URL?.replace(/\/$/, '') || 'http://localhost:8000';
const WS_URL = API.replace(/^http/, 'ws');

const monitoringAPI = {
  getDashboard: async (): Promise<{ dashboard: MonitoringDashboard }> => {
    const response = await fetch(`${API}/api/v1/monitoring/dashboard`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
    });
    if (!response.ok) throw new Error('Erreur lors du chargement du dashboard');
    return response.json();
  },

  getActiveAlerts: async (severity?: string): Promise<{ alerts: RealTimeAlert[], total: number }> => {
    const params = severity ? `?severity=${severity}` : '';
    const response = await fetch(`${API}/api/v1/monitoring/alerts/active${params}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
    });
    if (!response.ok) throw new Error('Erreur lors du chargement des alertes');
    return response.json();
  },

  getMonitoringRules: async (): Promise<{ rules: MonitoringRule[], total: number }> => {
    const response = await fetch(`${API}/api/v1/monitoring/rules`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
    });
    if (!response.ok) throw new Error('Erreur lors du chargement des règles');
    return response.json();
  },

  acknowledgeAlert: async (alertId: string) => {
    const response = await fetch(`${API}/api/v1/monitoring/alerts/${alertId}/acknowledge`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
    });
    if (!response.ok) throw new Error('Erreur lors de l\'acquittement');
    return response.json();
  },

  resolveAlert: async (alertId: string, resolutionNotes: string) => {
    const response = await fetch(`${API}/api/v1/monitoring/alerts/${alertId}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
      },
      body: JSON.stringify({ resolution_notes: resolutionNotes })
    });
    if (!response.ok) throw new Error('Erreur lors de la résolution');
    return response.json();
  },

  getCurrentMarketData: async (): Promise<{ market_data: MarketData }> => {
    const response = await fetch(`${API}/api/v1/monitoring/market-data/current`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
    });
    if (!response.ok) throw new Error('Erreur lors du chargement des données de marché');
    return response.json();
  },

  triggerTestAlert: async () => {
    const response = await fetch(`${API}/api/v1/monitoring/test-alert`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
    });
    if (!response.ok) throw new Error('Erreur lors du test');
    return response.json();
  }
};

// ===== HOOK WEBSOCKET =====
const useWebSocket = (url: string, onMessage: (data: any) => void) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = () => {
    try {
      const ws = new WebSocket(url);
      
      ws.onopen = () => {
        setIsConnected(true);
        console.log('WebSocket connected');
        // Clear any existing reconnect timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastMessage(data);
          onMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        console.log('WebSocket disconnected');
        // Attempt to reconnect after 5 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 5000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setIsConnected(false);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      setIsConnected(false);
    }
  };

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [url]);

  const sendMessage = (message: any) => {
    if (wsRef.current && isConnected) {
      wsRef.current.send(JSON.stringify(message));
    }
  };

  return { isConnected, lastMessage, sendMessage };
};

// ===== UTILITAIRES =====
const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'critical': return 'red';
    case 'high': return 'orange';
    case 'medium': return 'yellow';
    case 'low': return 'blue';
    default: return 'gray';
  }
};

const getSeverityIcon = (severity: string, className: string = "h-4 w-4") => {
  switch (severity) {
    case 'critical': return <AlertTriangle className={`${className} text-red-600`} />;
    case 'high': return <AlertCircle className={`${className} text-orange-600`} />;
    case 'medium': return <Info className={`${className} text-yellow-600`} />;
    case 'low': return <Info className={`${className} text-blue-600`} />;
    default: return <Info className={`${className} text-gray-600`} />;
  }
};

const formatRatio = (value: number): string => {
  return `${value.toFixed(1)}%`;
};

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('fr-FR', { 
    style: 'currency', 
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

const getTimeAgo = (timestamp: string): string => {
  const now = new Date();
  const time = new Date(timestamp);
  const diffInMinutes = Math.floor((now.getTime() - time.getTime()) / (1000 * 60));
  
  if (diffInMinutes < 1) return "À l'instant";
  if (diffInMinutes < 60) return `Il y a ${diffInMinutes} min`;
  if (diffInMinutes < 1440) return `Il y a ${Math.floor(diffInMinutes / 60)}h`;
  const days = Math.floor(diffInMinutes / 1440);
  return `Il y a ${days} jour${days > 1 ? 's' : ''}`;
};

// ===== COMPOSANT PRINCIPAL =====
const RealTimeMonitoringPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'alerts' | 'ratios' | 'market' | 'rules'>('overview');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [realtimeAlerts, setRealtimeAlerts] = useState<RealTimeAlert[]>([]);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<RealTimeAlert | null>(null);

  const queryClient = useQueryClient();

  // Queries
  const { data: dashboardData, isLoading: loadingDashboard, refetch: refetchDashboard } = useQuery({
    queryKey: ['monitoring-dashboard'],
    queryFn: monitoringAPI.getDashboard,
    refetchInterval: 30000
  });

  const { data: alertsData, refetch: refetchAlerts } = useQuery({
    queryKey: ['monitoring-alerts'],
    queryFn: () => monitoringAPI.getActiveAlerts(),
    refetchInterval: 15000
  });

  const { data: rulesData } = useQuery({
    queryKey: ['monitoring-rules'],
    queryFn: monitoringAPI.getMonitoringRules
  });

  const { data: marketData } = useQuery({
    queryKey: ['market-data'],
    queryFn: monitoringAPI.getCurrentMarketData,
    refetchInterval: 60000
  });

  // Mutations
  const acknowledgeAlertMutation = useMutation({
    mutationFn: monitoringAPI.acknowledgeAlert,
    onSuccess: () => {
      toast.success('Alerte acquittée');
      refetchAlerts();
      refetchDashboard();
    }
  });

  const resolveAlertMutation = useMutation({
    mutationFn: ({ alertId, notes }: { alertId: string, notes: string }) =>
      monitoringAPI.resolveAlert(alertId, notes),
    onSuccess: () => {
      toast.success('Alerte résolue');
      refetchAlerts();
      refetchDashboard();
      setSelectedAlert(null);
    }
  });

  const testAlertMutation = useMutation({
    mutationFn: monitoringAPI.triggerTestAlert,
    onSuccess: () => {
      toast.success('Alerte de test déclenchée');
    }
  });

  // WebSocket pour mises à jour temps réel
  const { isConnected, lastMessage } = useWebSocket(
    `${WS_URL}/api/v1/monitoring/ws`,
    (data) => {
      if (data.type === 'realtime_alert') {
        // Nouvelle alerte temps réel
        setRealtimeAlerts(prev => [data.data, ...prev.slice(0, 49)]); // Garder les 50 dernières
        
        // Son d'alerte si activé
        if (soundEnabled && data.data.severity === 'critical') {
          playAlertSound();
        }
        
        // Notification toast
        toast.error(`ALERTE ${data.data.severity.toUpperCase()}: ${data.data.rule_name}`, {
          duration: 8000,
          icon: getSeverityIcon(data.data.severity)
        });
        
        // Rafraîchir les données
        refetchAlerts();
        refetchDashboard();
      } else if (data.type === 'system_health') {
        setSystemHealth(data.data);
      }
    }
  );

  const playAlertSound = () => {
    try {
      const audio = new Audio('/sounds/alert.mp3');
      audio.volume = 0.5;
      audio.play().catch(() => {
        // Fallback si pas de fichier son
        console.log('Alert sound not available');
      });
    } catch (error) {
      console.log('Audio not supported');
    }
  };

  // Métriques calculées
  const alertStats = useMemo(() => {
    const alerts = alertsData?.alerts || [];
    return {
      total: alerts.length,
      critical: alerts.filter(a => a.severity === 'critical').length,
      unacknowledged: alerts.filter(a => !a.acknowledged_at).length,
      recent: realtimeAlerts.length
    };
  }, [alertsData, realtimeAlerts]);

  return (
    <div className="space-y-6">
      {/* Header avec statut connexion */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
              <Activity className="h-6 w-6 text-blue-600" />
              Monitoring Réglementaire Temps Réel
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <div className="flex items-center gap-1 text-green-600">
                    <Wifi className="h-4 w-4" />
                    <span className="text-xs font-medium">En ligne</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-red-600">
                    <WifiOff className="h-4 w-4" />
                    <span className="text-xs font-medium">Déconnecté</span>
                  </div>
                )}
              </div>
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Surveillance continue des seuils réglementaires et alertes automatiques
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Statut des alertes */}
            {alertStats.critical > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-100 text-red-800 rounded-lg animate-pulse">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">
                  {alertStats.critical} alerte{alertStats.critical > 1 ? 's' : ''} critique{alertStats.critical > 1 ? 's' : ''}
                </span>
              </div>
            )}
            
            {/* Contrôles */}
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2 rounded-lg ${soundEnabled ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}
              title={`${soundEnabled ? 'Désactiver' : 'Activer'} les alertes sonores`}
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            
            <button
              onClick={() => testAlertMutation.mutate()}
              disabled={testAlertMutation.isPending}
              className="px-3 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 text-sm"
            >
              Test Alerte
            </button>
            
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
            { id: 'overview', label: 'Vue d\'ensemble', icon: <BarChart3 className="h-4 w-4" /> },
            { id: 'alerts', label: 'Alertes', icon: <Bell className="h-4 w-4" />, count: alertStats.unacknowledged },
            { id: 'ratios', label: 'Ratios Solvabilité', icon: <Gauge className="h-4 w-4" /> },
            { id: 'market', label: 'Données Marché', icon: <TrendingUp className="h-4 w-4" /> },
            { id: 'rules', label: 'Règles', icon: <Settings className="h-4 w-4" /> }
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
                <span className="ml-1 bg-red-100 text-red-800 text-xs font-medium px-2 py-0.5 rounded-full animate-pulse">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Contenu */}
      {activeTab === 'overview' && (
        <OverviewTab
          dashboardData={dashboardData?.dashboard}
          systemHealth={systemHealth}
          realtimeAlerts={realtimeAlerts}
          loading={loadingDashboard}
        />
      )}

      {activeTab === 'alerts' && (
        <AlertsTab
          alerts={alertsData?.alerts || []}
          realtimeAlerts={realtimeAlerts}
          onAcknowledge={acknowledgeAlertMutation.mutate}
          onResolve={(alertId, notes) => resolveAlertMutation.mutate({ alertId, notes })}
          selectedAlert={selectedAlert}
          setSelectedAlert={setSelectedAlert}
        />
      )}

      {activeTab === 'ratios' && (
        <RatiosTab
          ratios={dashboardData?.dashboard.current_ratios}
          loading={loadingDashboard}
        />
      )}

      {activeTab === 'market' && (
        <MarketDataTab
          marketData={marketData?.market_data}
        />
      )}

      {activeTab === 'rules' && (
        <RulesTab
          rules={rulesData?.rules || []}
        />
      )}
    </div>
  );
};

// ===== SOUS-COMPOSANTS =====

const OverviewTab: React.FC<{
  dashboardData?: MonitoringDashboard;
  systemHealth?: SystemHealth | null;
  realtimeAlerts: RealTimeAlert[];
  loading: boolean;
}> = ({ dashboardData, systemHealth, realtimeAlerts, loading }) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!dashboardData) return <div>Données non disponibles</div>;

  const overallHealth = systemHealth?.overall_status || 'unknown';
  const healthColor = overallHealth === 'healthy' ? 'green' : 
                     overallHealth === 'warning' ? 'yellow' : 'red';

  return (
    <div className="space-y-6">
      {/* Statut système */}
      <div className={`bg-gradient-to-r from-${healthColor}-50 to-white rounded-lg border border-${healthColor}-200 p-6`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
              <Server className={`h-5 w-5 text-${healthColor}-600`} />
              État du Système
            </h3>
            <p className={`text-2xl font-bold text-${healthColor}-800 mt-1`}>
              {overallHealth === 'healthy' ? 'Système Sain' :
               overallHealth === 'warning' ? 'Attention Requise' : 'État Critique'}
            </p>
          </div>
          
          {systemHealth && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="text-center">
                <p className="text-gray-600">Charge Système</p>
                <p className="font-bold">{(systemHealth.system_load * 100).toFixed(1)}%</p>
              </div>
              <div className="text-center">
                <p className="text-gray-600">Temps Réponse API</p>
                <p className="font-bold">{systemHealth.api_response_time.toFixed(0)}ms</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Métriques principales */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Bell className="h-8 w-8 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Alertes Actives</p>
              <p className="text-2xl font-bold text-gray-900">{dashboardData.summary.active_alerts}</p>
              <p className="text-xs text-gray-600">
                +{realtimeAlerts.length} temps réel
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-500">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Alertes Critiques</p>
              <p className="text-2xl font-bold text-gray-900">{dashboardData.summary.critical_alerts}</p>
              <p className="text-xs text-gray-600">
                Nécessitent attention immédiate
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Shield className="h-8 w-8 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Règles Actives</p>
              <p className="text-2xl font-bold text-gray-900">{dashboardData.summary.active_rules}</p>
              <p className="text-xs text-gray-600">
                Surveillance continue
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-purple-500">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Activity className="h-8 w-8 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">24h</p>
              <p className="text-2xl font-bold text-gray-900">{dashboardData.summary.alerts_last_24h}</p>
              <p className="text-xs text-gray-600">
                Alertes dernières 24h
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Ratios temps réel */}
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Ratios de Solvabilité Temps Réel</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {Object.entries(dashboardData.current_ratios).map(([ratio, value]) => {
              const ratioValue = value as number;
              const isHealthy = ratioValue > 150; // Seuil générique
              const isWarning = ratioValue > 120 && ratioValue <= 150;
              const isCritical = ratioValue <= 120;
              
              return (
                <div key={ratio} className="text-center">
                  <h4 className="text-sm font-medium text-gray-600 mb-2">
                    {ratio.replace('_', ' ').toUpperCase()}
                  </h4>
                  <div className={`text-3xl font-bold ${
                    isHealthy ? 'text-green-600' :
                    isWarning ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {formatRatio(ratioValue)}
                  </div>
                  <div className="mt-2">
                    {isHealthy && <CheckCircle className="h-5 w-5 text-green-600 mx-auto" />}
                    {isWarning && <AlertCircle className="h-5 w-5 text-yellow-600 mx-auto" />}
                    {isCritical && <XCircle className="h-5 w-5 text-red-600 mx-auto" />}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Seuil: {ratio.includes('scr') ? '100%' : '120%'}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Alertes récentes temps réel */}
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
            <Radio className="h-5 w-5 text-blue-600" />
            Flux Temps Réel
            <span className="text-sm font-normal text-gray-500">
                ({realtimeAlerts.length} événements)
            </span>
            </h3>
        </div>
        
        <div className="max-h-64 overflow-y-auto">
          {realtimeAlerts.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              <Signal className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>En attente d'événements temps réel...</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {realtimeAlerts.slice(0, 10).map((alert, index) => (
                <div key={alert.id} className="px-6 py-3 hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    {getSeverityIcon(alert.severity)}
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{alert.rule_name}</p>
                      <p className="text-xs text-gray-600">
                        {alert.current_value.toFixed(2)} vs {alert.threshold_value.toFixed(2)} 
                        ({alert.deviation_percent > 0 ? '+' : ''}{alert.deviation_percent.toFixed(1)}%)
                      </p>
                    </div>
                    <div className="text-xs text-gray-500">
                      {getTimeAgo(alert.triggered_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const AlertsTab: React.FC<{
  alerts: RealTimeAlert[];
  realtimeAlerts: RealTimeAlert[];
  onAcknowledge: (alertId: string) => void;
  onResolve: (alertId: string, notes: string) => void;
  selectedAlert: RealTimeAlert | null;
  setSelectedAlert: (alert: RealTimeAlert | null) => void;
}> = ({ alerts, realtimeAlerts, onAcknowledge, onResolve, selectedAlert, setSelectedAlert }) => {
  const [resolutionNotes, setResolutionNotes] = useState('');

  // Combiner alertes persistantes et temps réel
  const allAlerts = useMemo(() => {
    const combined = [...alerts, ...realtimeAlerts];
    // Déduplication par ID
    const unique = combined.filter((alert, index, self) => 
      index === self.findIndex(a => a.id === alert.id)
    );
    // Trier par sévérité puis par date
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return unique.sort((a, b) => {
      const severityDiff = (severityOrder[a.severity as keyof typeof severityOrder] || 4) - 
                          (severityOrder[b.severity as keyof typeof severityOrder] || 4);
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.triggered_at).getTime() - new Date(a.triggered_at).getTime();
    });
  }, [alerts, realtimeAlerts]);

  const handleResolve = () => {
    if (selectedAlert && resolutionNotes.trim()) {
      onResolve(selectedAlert.id, resolutionNotes);
      setResolutionNotes('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {['critical', 'high', 'medium', 'low'].map(severity => {
          const count = allAlerts.filter(a => a.severity === severity).length;
          const color = getSeverityColor(severity);
          
          return (
            <div key={severity} className={`bg-white rounded-lg shadow p-4 border-l-4 border-${color}-500`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 capitalize">
                    {severity === 'critical' ? 'Critiques' :
                     severity === 'high' ? 'Élevées' :
                     severity === 'medium' ? 'Moyennes' : 'Faibles'}
                  </p>
                  <p className={`text-2xl font-bold text-${color}-600`}>{count}</p>
                </div>
                {getSeverityIcon(severity, 'h-6 w-6')}
              </div>
            </div>
          );
        })}
      </div>

      {/* Liste des alertes */}
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            Alertes Actives ({allAlerts.length})
          </h3>
        </div>
        
        <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
          {allAlerts.map((alert) => (
            <div
              key={alert.id}
              className={`px-6 py-4 hover:bg-gray-50 cursor-pointer ${
                selectedAlert?.id === alert.id ? 'bg-blue-50' : ''
              }`}
              onClick={() => setSelectedAlert(alert)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    {getSeverityIcon(alert.severity)}
                    <span className="font-medium text-gray-900">{alert.rule_name}</span>
                    {alert.acknowledged_at && (
                      <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                        Acquittée
                      </span>
                    )}
                    {alert.resolved_at && (
                      <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded-full">
                        Résolue
                      </span>
                    )}
                  </div>
                  
                  <div className="text-sm text-gray-600 mb-2">
                    Valeur: {alert.current_value.toFixed(2)} • 
                    Seuil: {alert.threshold_value.toFixed(2)} • 
                    Écart: {alert.deviation_percent > 0 ? '+' : ''}{alert.deviation_percent.toFixed(1)}%
                  </div>
                  
                  <div className="text-xs text-gray-500">
                    {getTimeAgo(alert.triggered_at)}
                    {alert.business_line && ` • ${alert.business_line}`}
                  </div>
                </div>
                
                <div className="flex items-center gap-2 ml-4">
                  {!alert.acknowledged_at && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAcknowledge(alert.id);
                      }}
                      className="px-3 py-1 text-sm text-green-600 hover:text-green-700 hover:bg-green-50 rounded"
                    >
                      Acquitter
                    </button>
                  )}
                  <Eye className="h-4 w-4 text-gray-400" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal de résolution */}
      {selectedAlert && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Résoudre l'Alerte</h3>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <p className="font-medium text-gray-900">{selectedAlert.rule_name}</p>
                <p className="text-sm text-gray-600">
                  Déclenchée {getTimeAgo(selectedAlert.triggered_at)}
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes de résolution
                </label>
                <textarea
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  rows={4}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="Décrivez les actions prises pour résoudre cette alerte..."
                />
              </div>
            </div>
            
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setSelectedAlert(null)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Annuler
              </button>
              <button
                onClick={handleResolve}
                disabled={!resolutionNotes.trim()}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                Résoudre
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const RatiosTab: React.FC<{
  ratios?: Record<string, number>;
  loading: boolean;
}> = ({ ratios, loading }) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!ratios) return <div>Données non disponibles</div>;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-6">Ratios de Solvabilité Détaillés</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {Object.entries(ratios).map(([ratio, value]) => {
            const ratioValue = value as number;
            const isHealthy = ratioValue > 150;
            const isWarning = ratioValue > 120 && ratioValue <= 150;
            const isCritical = ratioValue <= 120;
            
            return (
              <div key={ratio} className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-gray-900">
                    {ratio.replace('_', ' ').toUpperCase()}
                  </h4>
                  <span className={`text-2xl font-bold ${
                    isHealthy ? 'text-green-600' :
                    isWarning ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {formatRatio(ratioValue)}
                  </span>
                </div>
                
                <div className="w-full bg-gray-200 rounded-full h-4">
                  <div
                    className={`h-4 rounded-full transition-all duration-500 ${
                      isHealthy ? 'bg-green-500' :
                      isWarning ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(ratioValue / 2, 100)}%` }}
                  />
                </div>
                
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Critique: 100%</span>
                  <span>Alerte: 120%</span>
                  <span>Sain: 150%+</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const MarketDataTab: React.FC<{
  marketData?: MarketData;
}> = ({ marketData }) => {
  if (!marketData) {
    return <div className="text-center py-12 text-gray-500">Données de marché non disponibles</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Taux sans risque */}
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            Taux Sans Risque
          </h3>
          <div className="space-y-3">
            {Object.entries(marketData.risk_free_rates).map(([currency, rate]) => (
              <div key={currency} className="flex justify-between">
                <span className="text-gray-600">{currency}</span>
                <span className="font-medium">{(rate * 100).toFixed(3)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Indices actions */}
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-green-600" />
            Indices Actions
          </h3>
          <div className="space-y-3">
            {Object.entries(marketData.equity_indices).map(([index, value]) => (
              <div key={index} className="flex justify-between">
                <span className="text-gray-600 text-sm">{index.replace('_', ' ')}</span>
                <span className="font-medium">{value.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Spreads de crédit */}
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
            <Target className="h-5 w-5 text-orange-600" />
            Spreads de Crédit
          </h3>
          <div className="space-y-3">
            {Object.entries(marketData.credit_spreads).map(([rating, spread]) => (
              <div key={rating} className="flex justify-between">
                <span className="text-gray-600">{rating}</span>
                <span className="font-medium">{(spread * 100).toFixed(1)} bp</span>
              </div>
            ))}
          </div>
        </div>

        {/* Taux de change */}
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
            <Globe className="h-5 w-5 text-purple-600" />
            Taux de Change
          </h3>
          <div className="space-y-3">
            {Object.entries(marketData.fx_rates).map(([pair, rate]) => (
              <div key={pair} className="flex justify-between">
                <span className="text-gray-600">{pair.replace('_', '/')}</span>
                <span className="font-medium">{rate.toFixed(4)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Volatilités */}
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5 text-red-600" />
            Volatilités
          </h3>
          <div className="space-y-3">
            {Object.entries(marketData.volatilities).map(([index, vol]) => (
              <div key={index} className="flex justify-between">
                <span className="text-gray-600">{index}</span>
                <span className="font-medium">{vol.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Timestamp */}
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6 flex items-center justify-center">
          <div className="text-center">
            <Clock className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600">Dernière mise à jour</p>
            <p className="font-medium">{new Date(marketData.date).toLocaleString('fr-FR')}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const RulesTab: React.FC<{
  rules: MonitoringRule[];
}> = ({ rules }) => {
  return (
    <div className="bg-white rounded-lg shadow border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">
          Règles de Surveillance ({rules.length})
        </h3>
      </div>
      
      <div className="divide-y divide-gray-200">
        {rules.map((rule) => (
          <div key={rule.id} className="px-6 py-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h4 className="font-medium text-gray-900">{rule.name}</h4>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    rule.is_active 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {rule.is_active ? 'Actif' : 'Inactif'}
                  </span>
                </div>
                
                <p className="text-sm text-gray-600 mb-3">{rule.description}</p>
                
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Seuil d'alerte:</span>
                    <span className="ml-1 font-medium">{rule.warning_threshold}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Seuil critique:</span>
                    <span className="ml-1 font-medium">{rule.critical_threshold}</span>
                  </div>
                  {rule.blocking_threshold && (
                    <div>
                      <span className="text-gray-500">Seuil bloquant:</span>
                      <span className="ml-1 font-medium">{rule.blocking_threshold}</span>
                    </div>
                  )}
                </div>
                
                {rule.last_triggered && (
                  <div className="mt-2 text-xs text-gray-500">
                    Dernière activation: {getTimeAgo(rule.last_triggered)}
                  </div>
                )}
              </div>
              
              <button className="p-2 text-gray-400 hover:text-gray-600">
                <Settings className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RealTimeMonitoringPanel;