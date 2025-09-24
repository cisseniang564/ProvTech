// frontend/src/pages/APIManagement.tsx - Interface de gestion des APIs actuarielles
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Settings, RefreshCw, TestTube, AlertTriangle, CheckCircle,
  XCircle, Database, Cloud, Activity, Download, Upload, Eye,
  EyeOff, Trash2, Edit, Save, X, Info, Clock, Zap, Shield
} from 'lucide-react';
import toast from 'react-hot-toast';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const API = (import.meta as any).env?.VITE_API_URL?.replace(/\/$/, '') || 'http://localhost:8000';

// ===== TYPES =====

interface APIProvider {
  id: string;
  name: string;
  description: string;
}

interface DataType {
  id: string;
  name: string;
  description: string;
}

interface APIStatus {
  name: string;
  enabled: boolean;
  status: 'connected' | 'error' | 'unknown';
  endpoints_count: number;
  cache_entries: number;
  last_test: string;
  error?: string;
}

interface APIConfiguration {
  provider: string;
  name: string;
  base_url: string;
  api_key?: string;
  username?: string;
  password?: string;
  headers?: Record<string, string>;
  timeout: number;
  rate_limit: number;
  enabled: boolean;
}

interface Endpoint {
  path: string;
  method: string;
  data_type: string;
  response_format: string;
  params?: Record<string, any>;
}

// ===== SERVICES =====

const apiService = {
  async getProviders(): Promise<{ providers: APIProvider[] }> {
    const response = await fetch(`${API}/api/v1/external-apis/providers`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
    });
    if (!response.ok) throw new Error('Erreur lors du chargement des fournisseurs');
    return response.json();
  },

  async getDataTypes(): Promise<{ data_types: DataType[] }> {
    const response = await fetch(`${API}/api/v1/external-apis/data-types`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
    });
    if (!response.ok) throw new Error('Erreur lors du chargement des types de données');
    return response.json();
  },

  async getStatus(): Promise<{ apis: Record<string, APIStatus> }> {
    const response = await fetch(`${API}/api/v1/external-apis/status`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
    });
    if (!response.ok) throw new Error('Erreur lors du chargement du statut');
    return response.json();
  },

  async configureAPI(config: APIConfiguration): Promise<any> {
    const response = await fetch(`${API}/api/v1/external-apis/configure`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
      },
      body: JSON.stringify(config)
    });
    if (!response.ok) throw new Error('Erreur lors de la configuration');
    return response.json();
  },

  async testConnection(provider: string): Promise<any> {
    const response = await fetch(`${API}/api/v1/external-apis/test-connection/${provider}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
    });
    if (!response.ok) throw new Error('Erreur lors du test de connexion');
    return response.json();
  },

  async getEndpoints(provider: string): Promise<{ endpoints: Endpoint[] }> {
    const response = await fetch(`${API}/api/v1/external-apis/endpoints/${provider}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
    });
    if (!response.ok) throw new Error('Erreur lors du chargement des endpoints');
    return response.json();
  },

  async fetchData(provider: string, dataType: string, params: Record<string, any> = {}): Promise<any> {
    const response = await fetch(`${API}/api/v1/external-apis/fetch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
      },
      body: JSON.stringify({
        provider,
        data_type: dataType,
        params,
        use_cache: true
      })
    });
    if (!response.ok) throw new Error('Erreur lors de la récupération des données');
    return response.json();
  },

  async clearCache(provider?: string): Promise<any> {
    const url = `${API}/api/v1/external-apis/cache` + (provider ? `?provider=${provider}` : '');
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
    });
    if (!response.ok) throw new Error('Erreur lors du vidage du cache');
    return response.json();
  }
};

// ===== COMPOSANTS =====

const StatusBadge: React.FC<{ status: string; className?: string }> = ({ status, className = '' }) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'connected': return { color: 'green', icon: CheckCircle, text: 'Connecté' };
      case 'error': return { color: 'red', icon: XCircle, text: 'Erreur' };
      default: return { color: 'gray', icon: Clock, text: 'Inconnu' };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-${config.color}-100 text-${config.color}-800 ${className}`}>
      <Icon className="h-3 w-3" />
      {config.text}
    </span>
  );
};

const APIConfigurationModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  providers: APIProvider[];
  editingConfig?: APIConfiguration;
}> = ({ isOpen, onClose, providers, editingConfig }) => {
  const [config, setConfig] = useState<APIConfiguration>({
    provider: '',
    name: '',
    base_url: '',
    api_key: '',
    username: '',
    password: '',
    headers: {},
    timeout: 30,
    rate_limit: 100,
    enabled: true
  });
  const [showPassword, setShowPassword] = useState(false);
  const [customHeaders, setCustomHeaders] = useState('');

  useEffect(() => {
    if (editingConfig) {
      setConfig(editingConfig);
      setCustomHeaders(JSON.stringify(editingConfig.headers || {}, null, 2));
    } else {
      setConfig({
        provider: '',
        name: '',
        base_url: '',
        api_key: '',
        username: '',
        password: '',
        headers: {},
        timeout: 30,
        rate_limit: 100,
        enabled: true
      });
      setCustomHeaders('{}');
    }
  }, [editingConfig, isOpen]);

  const queryClient = useQueryClient();

  const configureMutation = useMutation({
    mutationFn: apiService.configureAPI,
    onSuccess: () => {
      toast.success('API configurée avec succès');
      queryClient.invalidateQueries({ queryKey: ['apiStatus'] });
      onClose();
    },
    onError: (error: any) => {
      toast.error(`Erreur: ${error.message}`);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const headers = JSON.parse(customHeaders);
      configureMutation.mutate({ ...config, headers });
    } catch (error) {
      toast.error('Format JSON invalide pour les headers');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            {editingConfig ? 'Modifier l\'API' : 'Nouvelle Configuration API'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fournisseur *
              </label>
              <select
                value={config.provider}
                onChange={(e) => setConfig({ ...config, provider: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Sélectionner un fournisseur</option>
                {providers.map(provider => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nom de la configuration *
              </label>
              <input
                type="text"
                value={config.name}
                onChange={(e) => setConfig({ ...config, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder="Ex: EIOPA Production"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              URL de base *
            </label>
            <input
              type="url"
              value={config.base_url}
              onChange={(e) => setConfig({ ...config, base_url: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              placeholder="https://api.example.com/v1"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Clé API
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={config.api_key || ''}
                  onChange={(e) => setConfig({ ...config, api_key: e.target.value })}
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  placeholder="Optionnel"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nom d'utilisateur
              </label>
              <input
                type="text"
                value={config.username || ''}
                onChange={(e) => setConfig({ ...config, username: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder="Optionnel"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mot de passe
              </label>
              <input
                type={showPassword ? "text" : "password"}
                value={config.password || ''}
                onChange={(e) => setConfig({ ...config, password: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder="Optionnel"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Timeout (s)
              </label>
              <input
                type="number"
                value={config.timeout}
                onChange={(e) => setConfig({ ...config, timeout: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                min="1"
                max="300"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Rate Limit (/min)
              </label>
              <input
                type="number"
                value={config.rate_limit}
                onChange={(e) => setConfig({ ...config, rate_limit: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                min="1"
                max="1000"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Headers personnalisés (JSON)
            </label>
            <textarea
              value={customHeaders}
              onChange={(e) => setCustomHeaders(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 h-24 font-mono text-sm"
              placeholder='{"Accept": "application/json"}'
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="enabled"
              checked={config.enabled}
              onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="enabled" className="ml-2 block text-sm text-gray-900">
              Activer cette API
            </label>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={configureMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {configureMutation.isPending && <RefreshCw className="h-4 w-4 animate-spin" />}
              {editingConfig ? 'Modifier' : 'Configurer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const DataFetchModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  providers: APIProvider[];
  dataTypes: DataType[];
}> = ({ isOpen, onClose, providers, dataTypes }) => {
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedDataType, setSelectedDataType] = useState('');
  const [params, setParams] = useState('{}');
  const [fetchResult, setFetchResult] = useState<any>(null);

  const fetchMutation = useMutation({
    mutationFn: ({ provider, dataType, parsedParams }: any) => 
      apiService.fetchData(provider, dataType, parsedParams),
    onSuccess: (data) => {
      setFetchResult(data);
      toast.success('Données récupérées avec succès');
    },
    onError: (error: any) => {
      toast.error(`Erreur: ${error.message}`);
    }
  });

  const handleFetch = () => {
    try {
      const parsedParams = JSON.parse(params);
      fetchMutation.mutate({
        provider: selectedProvider,
        dataType: selectedDataType,
        parsedParams
      });
    } catch (error) {
      toast.error('Format JSON invalide pour les paramètres');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            Tester la Récupération de Données
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fournisseur
              </label>
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Sélectionner</option>
                {providers.map(provider => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type de données
              </label>
              <select
                value={selectedDataType}
                onChange={(e) => setSelectedDataType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Sélectionner</option>
                {dataTypes.map(type => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Paramètres (JSON)
            </label>
            <textarea
              value={params}
              onChange={(e) => setParams(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 h-24 font-mono text-sm"
              placeholder='{"lob": "auto", "period": "2024Q4"}'
            />
          </div>

          <div className="flex justify-between">
            <button
              onClick={handleFetch}
              disabled={!selectedProvider || !selectedDataType || fetchMutation.isPending}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
            >
              {fetchMutation.isPending && <RefreshCw className="h-4 w-4 animate-spin" />}
              <Download className="h-4 w-4" />
              Récupérer les Données
            </button>

            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Fermer
            </button>
          </div>

          {fetchResult && (
            <div className="border-t pt-6">
              <h3 className="text-lg font-medium text-gray-900 mb-3">Résultat</h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <span className="text-sm text-gray-500">Fournisseur:</span>
                    <p className="font-medium">{fetchResult.provider}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Type de données:</span>
                    <p className="font-medium">{fetchResult.data_type}</p>
                  </div>
                </div>
                <div className="mb-4">
                  <span className="text-sm text-gray-500">Horodatage:</span>
                  <p className="font-medium">{new Date(fetchResult.timestamp).toLocaleString('fr-FR')}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Données:</span>
                  <pre className="mt-2 bg-white p-3 rounded border text-xs overflow-auto max-h-64">
                    {JSON.stringify(fetchResult.data, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ===== COMPOSANT PRINCIPAL =====

const APIManagement: React.FC = () => {
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showFetchModal, setShowFetchModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<APIConfiguration | undefined>();

  // Queries
  const { data: providersData, isLoading: loadingProviders } = useQuery({
    queryKey: ['apiProviders'],
    queryFn: apiService.getProviders
  });

  const { data: dataTypesData, isLoading: loadingDataTypes } = useQuery({
    queryKey: ['apiDataTypes'],
    queryFn: apiService.getDataTypes
  });

  const { 
    data: statusData, 
    isLoading: loadingStatus, 
    refetch: refetchStatus 
  } = useQuery({
    queryKey: ['apiStatus'],
    queryFn: apiService.getStatus,
    refetchInterval: 30000
  });

  const queryClient = useQueryClient();

  // Mutations
  const testConnectionMutation = useMutation({
    mutationFn: apiService.testConnection,
    onSuccess: (data) => {
      toast.success(`Test réussi: ${data.test_result.status}`);
      queryClient.invalidateQueries({ queryKey: ['apiStatus'] });
    },
    onError: (error: any) => {
      toast.error(`Erreur de test: ${error.message}`);
    }
  });

  const clearCacheMutation = useMutation({
    mutationFn: apiService.clearCache,
    onSuccess: () => {
      toast.success('Cache vidé avec succès');
    },
    onError: (error: any) => {
      toast.error(`Erreur: ${error.message}`);
    }
  });

  const providers = providersData?.providers || [];
  const dataTypes = dataTypesData?.data_types || [];
  const apis = statusData?.apis || {};

  const loading = loadingProviders || loadingDataTypes || loadingStatus;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Chargement de la gestion des APIs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Cloud className="h-8 w-8 text-blue-600" />
                Gestion des APIs Actuarielles
              </h1>
              <p className="text-gray-600 mt-2">
                Connectez-vous aux principales sources de données actuarielles externes
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowFetchModal(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
              >
                <TestTube className="h-4 w-4" />
                Tester Récupération
              </button>
              <button
                onClick={() => setShowConfigModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Nouvelle API
              </button>
            </div>
          </div>
        </div>

        {/* Statistiques rapides */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">APIs Configurées</p>
                <p className="text-2xl font-bold text-gray-900">{Object.keys(apis).length}</p>
              </div>
              <Database className="h-8 w-8 text-blue-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">APIs Actives</p>
                <p className="text-2xl font-bold text-green-600">
                  {Object.values(apis).filter((api: APIStatus) => api.status === 'connected').length}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Endpoints</p>
                <p className="text-2xl font-bold text-purple-600">
                  {Object.values(apis).reduce((sum: number, api: APIStatus) => sum + api.endpoints_count, 0)}
                </p>
              </div>
              <Activity className="h-8 w-8 text-purple-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Entrées Cache</p>
                <p className="text-2xl font-bold text-orange-600">
                  {Object.values(apis).reduce((sum: number, api: APIStatus) => sum + api.cache_entries, 0)}
                </p>
              </div>
              <Zap className="h-8 w-8 text-orange-600" />
            </div>
          </div>
        </div>

        {/* Liste des APIs */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">APIs Configurées</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => clearCacheMutation.mutate(undefined)}
                disabled={clearCacheMutation.isPending}
                className="px-3 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 flex items-center gap-2"
              >
                {clearCacheMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Vider Cache
              </button>
              <button
                onClick={() => refetchStatus()}
                className="px-3 py-2 text-blue-600 border border-blue-300 rounded-md hover:bg-blue-50 flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Actualiser
              </button>
            </div>
          </div>

          <div className="divide-y divide-gray-200">
            {Object.keys(apis).length === 0 ? (
              <div className="p-12 text-center">
                <Cloud className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Aucune API configurée</h3>
                <p className="text-gray-600 mb-6">
                  Commencez par configurer votre première API externe pour accéder aux données actuarielles.
                </p>
                <button
                  onClick={() => setShowConfigModal(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 mx-auto"
                >
                  <Plus className="h-4 w-4" />
                  Configurer une API
                </button>
              </div>
            ) : (
              Object.entries(apis).map(([providerId, api]: [string, APIStatus]) => (
                <div key={providerId} className="p-6 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-medium text-gray-900">{api.name}</h3>
                        <StatusBadge status={api.status} />
                        {!api.enabled && (
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                            Désactivé
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                        <div>
                          <span className="font-medium">Endpoints:</span> {api.endpoints_count}
                        </div>
                        <div>
                          <span className="font-medium">Cache:</span> {api.cache_entries} entrées
                        </div>
                        <div>
                          <span className="font-medium">Dernier test:</span> {
                            api.last_test ? new Date(api.last_test).toLocaleString('fr-FR') : 'Jamais'
                          }
                        </div>
                        <div>
                          <span className="font-medium">Provider ID:</span> {providerId}
                        </div>
                      </div>

                      {api.error && (
                        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
                          <div className="flex items-center gap-2 text-red-800">
                            <AlertTriangle className="h-4 w-4" />
                            <span className="text-sm font-medium">Erreur:</span>
                          </div>
                          <p className="text-sm text-red-700 mt-1">{api.error}</p>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 ml-6">
                      <button
                        onClick={() => testConnectionMutation.mutate(providerId)}
                        disabled={testConnectionMutation.isPending}
                        className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-md"
                        title="Tester la connexion"
                      >
                        {testConnectionMutation.isPending ? 
                          <RefreshCw className="h-4 w-4 animate-spin" /> : 
                          <TestTube className="h-4 w-4" />
                        }
                      </button>
                      <button
                        onClick={() => clearCacheMutation.mutate(providerId)}
                        disabled={clearCacheMutation.isPending}
                        className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-md"
                        title="Vider le cache"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          // Note: Pour modifier, vous devriez stocker les configurations
                          // et permettre l'édition
                          toast('Fonction d\'édition à implémenter', { 
                            icon: '⚙️',
                            duration: 3000 
                          });
                        }}
                        className="p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-md"
                        title="Modifier"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Information sur les fournisseurs disponibles */}
        <div className="mt-8 bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Fournisseurs Disponibles</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {providers.map(provider => (
                <div key={provider.id} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                  <h3 className="font-medium text-gray-900 mb-2">{provider.name}</h3>
                  <p className="text-sm text-gray-600 mb-3">{provider.description}</p>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      apis[provider.id] ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {apis[provider.id] ? 'Configuré' : 'Non configuré'}
                    </span>
                    {!apis[provider.id] && (
                      <button
                        onClick={() => {
                          setEditingConfig(undefined);
                          setShowConfigModal(true);
                        }}
                        className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                      >
                        Configurer
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <APIConfigurationModal
        isOpen={showConfigModal}
        onClose={() => {
          setShowConfigModal(false);
          setEditingConfig(undefined);
        }}
        providers={providers}
        editingConfig={editingConfig}
      />

      <DataFetchModal
        isOpen={showFetchModal}
        onClose={() => setShowFetchModal(false)}
        providers={providers}
        dataTypes={dataTypes}
      />
    </div>
  );
};

export default APIManagement;