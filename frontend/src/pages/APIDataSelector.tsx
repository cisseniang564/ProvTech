// frontend/src/components/APIDataSelector.tsx - Sélecteur de sources API pour les calculs
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Cloud, Database, Settings, RefreshCw, CheckCircle, AlertCircle,
  Eye, Plus, Trash2, Download, Upload, Info, Clock, Activity,
  Shield, Award, Target, Zap, Filter, Search, X, ChevronDown,
  ChevronRight, Play, Pause, BarChart3, TrendingUp, Globe
} from 'lucide-react';
import toast from 'react-hot-toast';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const API = (import.meta as any).env?.VITE_API_URL?.replace(/\/$/, '') || 'http://localhost:8000';

// ===== TYPES =====

interface APISource {
  id: string;
  name: string;
  description: string;
  provider: string;
  data_type: string;
  data_quality: 'excellent' | 'good' | 'average' | 'poor';
  update_frequency: string;
  supported_lobs: string[];
}

interface CachedTriangle {
  id: string;
  name: string;
  source: string;
  line_of_business: string;
  data_quality: string;
  completeness: number;
  last_updated: string;
  size: string;
}

interface CreateTriangleRequest {
  provider: string;
  data_type: string;
  line_of_business: string;
  parameters: Record<string, any>;
  triangle_name?: string;
}

interface TriangleCreationResult {
  success: boolean;
  triangle_id: string;
  name: string;
  source: string;
  line_of_business: string;
  data_quality: string;
  completeness: number;
  size: string;
  metadata: Record<string, any>;
}

// ===== SERVICES =====

const apiDataService = {
  async getAPISources(lineOfBusiness?: string): Promise<{ success: boolean; sources: APISource[] }> {
    const url = `${API}/api/v1/data-integration/sources${lineOfBusiness ? `?line_of_business=${lineOfBusiness}` : ''}`;
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) throw new Error('Erreur lors du chargement des sources API');
    return response.json();
  },

  async getCachedTriangles(): Promise<{ success: boolean; triangles: CachedTriangle[]; total: number }> {
    const response = await fetch(`${API}/api/v1/data-integration/triangles/cached`, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) throw new Error('Erreur lors du chargement des triangles');
    return response.json();
  },

  async createTriangleFromAPI(request: CreateTriangleRequest): Promise<TriangleCreationResult> {
    const response = await fetch(`${API}/api/v1/data-integration/create-triangle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });
    if (!response.ok) throw new Error('Erreur lors de la création du triangle');
    return response.json();
  },

  async getTriangleDetails(triangleId: string): Promise<{ success: boolean; triangle: any }> {
    const response = await fetch(`${API}/api/v1/data-integration/triangles/${triangleId}`, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) throw new Error('Erreur lors du chargement du triangle');
    return response.json();
  },

  async prepareTriangleForCalculation(triangleId: string): Promise<{ success: boolean; triangle_data: any }> {
    const response = await fetch(`${API}/api/v1/data-integration/triangles/${triangleId}/use-for-calculation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) throw new Error('Erreur lors de la préparation');
    return response.json();
  },

  async deleteTriangle(triangleId: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API}/api/v1/data-integration/triangles/${triangleId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) throw new Error('Erreur lors de la suppression');
    return response.json();
  },

  async clearCache(): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API}/api/v1/data-integration/cache/clear`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) throw new Error('Erreur lors du vidage du cache');
    return response.json();
  }
};

// ===== UTILITAIRES =====

const getQualityColor = (quality: string) => {
  switch (quality) {
    case 'excellent': return 'text-green-600 bg-green-100';
    case 'good': return 'text-blue-600 bg-blue-100';
    case 'average': return 'text-yellow-600 bg-yellow-100';
    case 'poor': return 'text-red-600 bg-red-100';
    default: return 'text-gray-600 bg-gray-100';
  }
};

const getProviderIcon = (provider: string) => {
  switch (provider) {
    case 'eiopa': return <Shield className="h-4 w-4" />;
    case 'willis_towers_watson': return <Target className="h-4 w-4" />;
    case 'milliman': return <BarChart3 className="h-4 w-4" />;
    case 'sas': return <TrendingUp className="h-4 w-4" />;
    default: return <Globe className="h-4 w-4" />;
  }
};

const getLOBDisplayName = (lob: string) => {
  const names: Record<string, string> = {
    auto: 'Automobile',
    property: 'Dommages aux Biens',
    liability: 'Responsabilité Civile',
    marine: 'Transport Maritime',
    aviation: 'Aviation',
    construction: 'Construction',
    life: 'Assurance Vie',
    health: 'Santé'
  };
  return names[lob] || lob.charAt(0).toUpperCase() + lob.slice(1);
};

// ===== COMPOSANTS =====

const APISourceCard: React.FC<{
  source: APISource;
  onSelect: (source: APISource) => void;
  isSelected: boolean;
}> = ({ source, onSelect, isSelected }) => (
  <div 
    className={`p-4 border rounded-lg cursor-pointer transition-all ${
      isSelected 
        ? 'border-blue-500 bg-blue-50 shadow-md' 
        : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
    }`}
    onClick={() => onSelect(source)}
  >
    <div className="flex items-start justify-between">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2">
          {getProviderIcon(source.provider)}
          <h3 className="font-medium text-gray-900">{source.name}</h3>
          <span className={`px-2 py-1 text-xs rounded-full ${getQualityColor(source.data_quality)}`}>
            {source.data_quality}
          </span>
        </div>
        
        <p className="text-sm text-gray-600 mb-3">{source.description}</p>
        
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded">
            {source.update_frequency}
          </span>
          <span className="px-2 py-1 bg-purple-100 text-purple-600 rounded">
            {source.data_type.replace('_', ' ')}
          </span>
        </div>
        
        <div className="mt-2">
          <span className="text-xs text-gray-500">Branches supportées: </span>
          <div className="flex flex-wrap gap-1 mt-1">
            {source.supported_lobs.slice(0, 3).map(lob => (
              <span key={lob} className="px-1 py-0.5 bg-blue-100 text-blue-600 text-xs rounded">
                {getLOBDisplayName(lob)}
              </span>
            ))}
            {source.supported_lobs.length > 3 && (
              <span className="px-1 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                +{source.supported_lobs.length - 3}
              </span>
            )}
          </div>
        </div>
      </div>
      
      {isSelected && (
        <CheckCircle className="h-5 w-5 text-blue-600 ml-2" />
      )}
    </div>
  </div>
);

const CachedTriangleCard: React.FC<{
  triangle: CachedTriangle;
  onUseForCalculation: (triangleId: string) => void;
  onDelete: (triangleId: string) => void;
  onViewDetails: (triangleId: string) => void;
}> = ({ triangle, onUseForCalculation, onDelete, onViewDetails }) => (
  <div className="p-4 border border-gray-200 rounded-lg hover:shadow-sm transition-shadow">
    <div className="flex items-start justify-between">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2">
          <h4 className="font-medium text-gray-900">{triangle.name}</h4>
          <span className={`px-2 py-1 text-xs rounded-full ${getQualityColor(triangle.data_quality)}`}>
            {triangle.data_quality}
          </span>
        </div>
        
        <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-3">
          <div>
            <span className="font-medium">Source:</span> {triangle.source}
          </div>
          <div>
            <span className="font-medium">Branche:</span> {getLOBDisplayName(triangle.line_of_business)}
          </div>
          <div>
            <span className="font-medium">Complétude:</span> {triangle.completeness.toFixed(1)}%
          </div>
          <div>
            <span className="font-medium">Taille:</span> {triangle.size}
          </div>
        </div>
        
        <div className="text-xs text-gray-500">
          Dernière MAJ: {new Date(triangle.last_updated).toLocaleString('fr-FR')}
        </div>
      </div>
      
      <div className="flex items-center gap-2 ml-4">
        <button
          onClick={() => onViewDetails(triangle.id)}
          className="p-2 text-gray-400 hover:text-gray-600"
          title="Voir détails"
        >
          <Eye className="h-4 w-4" />
        </button>
        
        <button
          onClick={() => onUseForCalculation(triangle.id)}
          className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
        >
          Utiliser
        </button>
        
        <button
          onClick={() => onDelete(triangle.id)}
          className="p-2 text-gray-400 hover:text-red-600"
          title="Supprimer"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  </div>
);

// ===== COMPOSANT PRINCIPAL =====

interface APIDataSelectorProps {
  onTriangleSelected?: (triangleData: any) => void;
  selectedLineOfBusiness?: string;
  mode?: 'standalone' | 'embedded';
}

const APIDataSelector: React.FC<APIDataSelectorProps> = ({
  onTriangleSelected,
  selectedLineOfBusiness,
  mode = 'standalone'
}) => {
  const [activeTab, setActiveTab] = useState<'sources' | 'cached'>('sources');
  const [selectedSource, setSelectedSource] = useState<APISource | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [lineOfBusinessFilter, setLineOfBusinessFilter] = useState(selectedLineOfBusiness || '');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Formulaire de création
  const [triangleName, setTriangleName] = useState('');
  const [parameters, setParameters] = useState<Record<string, any>>({});
  const [parametersText, setParametersText] = useState('{}');

  const queryClient = useQueryClient();

  // Queries
  const {
    data: sourcesData,
    isLoading: loadingSources,
    refetch: refetchSources
  } = useQuery({
    queryKey: ['apiSources', lineOfBusinessFilter],
    queryFn: () => apiDataService.getAPISources(lineOfBusinessFilter || undefined),
    refetchInterval: 60000
  });

  const {
    data: cachedData,
    isLoading: loadingCached,
    refetch: refetchCached
  } = useQuery({
    queryKey: ['cachedTriangles'],
    queryFn: apiDataService.getCachedTriangles,
    refetchInterval: 30000
  });

  // Mutations
  const createTriangleMutation = useMutation({
    mutationFn: apiDataService.createTriangleFromAPI,
    onSuccess: (result) => {
      toast.success(`Triangle créé: ${result.name}`);
      setShowCreateForm(false);
      setSelectedSource(null);
      refetchCached();
    },
    onError: (error: any) => {
      toast.error(`Erreur: ${error.message}`);
    }
  });

  const prepareTriangleMutation = useMutation({
    mutationFn: apiDataService.prepareTriangleForCalculation,
    onSuccess: (result, triangleId) => {
      toast.success('Triangle préparé pour les calculs');
      if (onTriangleSelected) {
        onTriangleSelected(result.triangle_data);
      }
    },
    onError: (error: any) => {
      toast.error(`Erreur: ${error.message}`);
    }
  });

  const deleteTriangleMutation = useMutation({
    mutationFn: apiDataService.deleteTriangle,
    onSuccess: () => {
      toast.success('Triangle supprimé');
      refetchCached();
    },
    onError: (error: any) => {
      toast.error(`Erreur: ${error.message}`);
    }
  });

  const clearCacheMutation = useMutation({
    mutationFn: apiDataService.clearCache,
    onSuccess: () => {
      toast.success('Cache vidé');
      refetchCached();
    },
    onError: (error: any) => {
      toast.error(`Erreur: ${error.message}`);
    }
  });

  const sources = sourcesData?.sources || [];
  const cachedTriangles = cachedData?.triangles || [];

  // Filtrage
  const filteredSources = sources.filter(source => {
    const matchesSearch = !searchQuery || 
      source.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      source.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      source.provider.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesLOB = !lineOfBusinessFilter || 
      source.supported_lobs.includes(lineOfBusinessFilter);
    
    return matchesSearch && matchesLOB;
  });

  // Gestion des paramètres JSON
  const handleParametersChange = (value: string) => {
    setParametersText(value);
    try {
      const parsed = JSON.parse(value);
      setParameters(parsed);
    } catch (e) {
      // JSON invalide, on garde l'ancienne valeur
    }
  };

  const handleCreateTriangle = () => {
    if (!selectedSource) return;

    const request: CreateTriangleRequest = {
      provider: selectedSource.provider,
      data_type: selectedSource.data_type,
      line_of_business: lineOfBusinessFilter || selectedSource.supported_lobs[0],
      parameters,
      triangle_name: triangleName || undefined
    };

    createTriangleMutation.mutate(request);
  };

  const handleUseTriangle = (triangleId: string) => {
    prepareTriangleMutation.mutate(triangleId);
  };

  const handleDeleteTriangle = (triangleId: string) => {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce triangle ?')) {
      deleteTriangleMutation.mutate(triangleId);
    }
  };

  const handleViewTriangleDetails = (triangleId: string) => {
    // Ouvrir modal avec détails du triangle
    toast('Détails du triangle à implémenter', { icon: 'ℹ️' });
  };

  if (loadingSources && activeTab === 'sources') {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Chargement des sources API...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={mode === 'standalone' ? 'bg-white rounded-lg shadow-sm border border-gray-200' : ''}>
      {mode === 'standalone' && (
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                <Cloud className="h-6 w-6 text-blue-600" />
                Sources de Données API
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Utilisez des données externes directement dans vos calculs
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => clearCacheMutation.mutate()}
                disabled={clearCacheMutation.isPending}
                className="px-3 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 flex items-center gap-2"
              >
                {clearCacheMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Vider Cache
              </button>
              
              <button
                onClick={() => {
                  refetchSources();
                  refetchCached();
                }}
                className="px-3 py-2 text-blue-600 border border-blue-300 rounded-md hover:bg-blue-50 flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Actualiser
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="p-6">
        {/* Navigation par onglets */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('sources')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'sources'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Sources Disponibles
                {sources.length > 0 && (
                  <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                    {sources.length}
                  </span>
                )}
              </div>
            </button>
            
            <button
              onClick={() => setActiveTab('cached')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'cached'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                Triangles Créés
                {cachedTriangles.length > 0 && (
                  <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                    {cachedTriangles.length}
                  </span>
                )}
              </div>
            </button>
          </div>

          {/* Filtres */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <select
              value={lineOfBusinessFilter}
              onChange={(e) => setLineOfBusinessFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Toutes les branches</option>
              <option value="auto">Automobile</option>
              <option value="property">Dommages aux Biens</option>
              <option value="liability">Responsabilité Civile</option>
              <option value="marine">Transport Maritime</option>
              <option value="aviation">Aviation</option>
              <option value="construction">Construction</option>
            </select>
          </div>
        </div>

        {/* Contenu des onglets */}
        {activeTab === 'sources' && (
          <div className="space-y-6">
            {filteredSources.length === 0 ? (
              <div className="text-center py-12">
                <Cloud className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Aucune source API disponible</h3>
                <p className="text-gray-600">
                  {searchQuery || lineOfBusinessFilter 
                    ? 'Aucune source ne correspond à vos critères de recherche.'
                    : 'Les sources API sont en cours de chargement ou non configurées.'}
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredSources.map(source => (
                    <APISourceCard
                      key={source.id}
                      source={source}
                      onSelect={setSelectedSource}
                      isSelected={selectedSource?.id === source.id}
                    />
                  ))}
                </div>

                {selectedSource && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">
                      Créer un triangle depuis {selectedSource.name}
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Nom du triangle (optionnel)
                        </label>
                        <input
                          type="text"
                          value={triangleName}
                          onChange={(e) => setTriangleName(e.target.value)}
                          placeholder="Ex: EIOPA_Auto_2024"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Ligne d'affaires
                        </label>
                        <select
                          value={lineOfBusinessFilter}
                          onChange={(e) => setLineOfBusinessFilter(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                          required
                        >
                          {selectedSource.supported_lobs.map(lob => (
                            <option key={lob} value={lob}>
                              {getLOBDisplayName(lob)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Paramètres API (JSON)
                      </label>
                      <textarea
                        value={parametersText}
                        onChange={(e) => handleParametersChange(e.target.value)}
                        placeholder='{"period": "2024Q4", "currency": "EUR"}'
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 h-24 font-mono text-sm"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-3 mt-6">
                      <button
                        onClick={() => {
                          setSelectedSource(null);
                          setTriangleName('');
                          setParametersText('{}');
                        }}
                        className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                      >
                        Annuler
                      </button>
                      
                      <button
                        onClick={handleCreateTriangle}
                        disabled={createTriangleMutation.isPending || !lineOfBusinessFilter}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                      >
                        {createTriangleMutation.isPending && <RefreshCw className="h-4 w-4 animate-spin" />}
                        Créer le Triangle
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'cached' && (
          <div className="space-y-4">
            {loadingCached ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-blue-600 mr-3" />
                <span className="text-gray-600">Chargement des triangles...</span>
              </div>
            ) : cachedTriangles.length === 0 ? (
              <div className="text-center py-12">
                <Database className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun triangle créé</h3>
                <p className="text-gray-600 mb-6">
                  Créez votre premier triangle à partir d'une source API externe.
                </p>
                <button
                  onClick={() => setActiveTab('sources')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Parcourir les Sources
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-gray-600">
                    {cachedTriangles.length} triangle{cachedTriangles.length > 1 ? 's' : ''} disponible{cachedTriangles.length > 1 ? 's' : ''}
                  </p>
                </div>

                <div className="space-y-3">
                  {cachedTriangles.map(triangle => (
                    <CachedTriangleCard
                      key={triangle.id}
                      triangle={triangle}
                      onUseForCalculation={handleUseTriangle}
                      onDelete={handleDeleteTriangle}
                      onViewDetails={handleViewTriangleDetails}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default APIDataSelector;