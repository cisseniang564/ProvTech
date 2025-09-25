// 📁 Racine: frontend/src/hooks/
// └── useTriangles.ts

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import triangleService, { 
  Triangle, 
  CreateTriangleDto, 
  UpdateTriangleDto, 
  TriangleFilter,
  TriangleValidation,
  PaginatedResponse 
} from '../services/triangleService';

// Hook principal pour la gestion des triangles
export const useTriangles = (filters?: TriangleFilter) => {
  const queryClient = useQueryClient();
  const [selectedTriangles, setSelectedTriangles] = useState<string[]>([]);

  // Query pour récupérer les triangles
  const {
    data,
    isLoading,
    error,
    refetch,
    isFetching
  } = useQuery({
    queryKey: ['triangles', filters],
    queryFn: () => triangleService.getTriangles(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (anciennement cacheTime)
  });

  // Mutation pour créer un triangle
  const createMutation = useMutation({
    mutationFn: (data: CreateTriangleDto) => triangleService.createTriangle(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['triangles'] });
      // Notification de succès (à implémenter avec votre système de notifications)
    },
    onError: (error: any) => {
      console.error('Erreur lors de la création du triangle:', error);
    },
  });

  // Mutation pour mettre à jour un triangle
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTriangleDto }) =>
      triangleService.updateTriangle(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['triangles'] });
    },
  });

  // Mutation pour supprimer un triangle
  const deleteMutation = useMutation({
    mutationFn: (id: string) => triangleService.deleteTriangle(id),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['triangles'] });
      setSelectedTriangles(prev => prev.filter(selectedId => selectedId !== deletedId));
    },
  });

  // Fonction de sélection/désélection
  const toggleSelection = useCallback((id: string) => {
    setSelectedTriangles(prev =>
      prev.includes(id)
        ? prev.filter(selectedId => selectedId !== id)
        : [...prev, id]
    );
  }, []);

  // Sélectionner tout
  const selectAll = useCallback(() => {
    if (data && 'data' in data && Array.isArray(data.data)) {
      setSelectedTriangles(data.data.map((t: Triangle) => t.id));
    }
  }, [data]);

  // Désélectionner tout
  const clearSelection = useCallback(() => {
    setSelectedTriangles([]);
  }, []);

  // Opérations batch
  const batchDelete = useCallback(async () => {
    if (selectedTriangles.length === 0) return;
    
    try {
      const result = await triangleService.batchOperation(selectedTriangles, 'delete');
      queryClient.invalidateQueries({ queryKey: ['triangles'] });
      clearSelection();
      return result;
    } catch (error) {
      console.error('Erreur lors de la suppression batch:', error);
      throw error;
    }
  }, [selectedTriangles, queryClient, clearSelection]);

  // Export de triangles
  const exportTriangle = useCallback(async (
    id: string,
    format: 'csv' | 'excel' | 'json' = 'excel'
  ) => {
    try {
      const blob = await triangleService.exportTriangle(id, format);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `triangle_${id}_${new Date().toISOString()}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erreur lors de l\'export:', error);
      throw error;
    }
  }, []);

  // Extraction sécurisée des données
  const triangles = data && 'data' in data ? data.data : [];
  const total = data && 'total' in data ? data.total : 0;
  const page = data && 'page' in data ? data.page : 1;
  const totalPages = data && 'totalPages' in data ? data.totalPages : 1;

  return {
    // Données
    triangles,
    total,
    page,
    totalPages,
    
    // États
    isLoading,
    isFetching,
    error,
    selectedTriangles,
    
    // Actions
    createTriangle: createMutation.mutate,
    updateTriangle: updateMutation.mutate,
    deleteTriangle: deleteMutation.mutate,
    refetch,
    
    // Sélection
    toggleSelection,
    selectAll,
    clearSelection,
    
    // Opérations batch
    batchDelete,
    exportTriangle,
    
    // États des mutations
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
};

// Hook pour un triangle spécifique
export const useTriangle = (id: string | null) => {
  const queryClient = useQueryClient();

  const {
    data: triangle,
    isLoading,
    error,
  } = useQuery<Triangle>({
    queryKey: ['triangle', id],
    queryFn: () => id ? triangleService.getTriangleById(id) : Promise.reject('No ID'),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });

  // Mutation pour dupliquer
  const duplicateMutation = useMutation({
    mutationFn: (newName: string) => 
      id ? triangleService.duplicateTriangle(id, newName) : Promise.reject('No ID'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['triangles'] });
    },
  });

  // Calcul des facteurs de développement
  const calculateFactors = useCallback(async (
    method: 'simple' | 'weighted' | 'geometric' = 'weighted'
  ) => {
    if (!id) return null;
    try {
      return await triangleService.calculateDevelopmentFactors(id, method);
    } catch (error) {
      console.error('Erreur lors du calcul des facteurs:', error);
      throw error;
    }
  }, [id]);

  // Projection du triangle
  const projectTriangle = useCallback(async (
    method: 'chainLadder' | 'bornhuetter' | 'mack' = 'chainLadder',
    parameters?: Record<string, any>
  ) => {
    if (!id) return null;
    try {
      const result = await triangleService.projectTriangle(id, method, parameters);
      queryClient.setQueryData(['triangle', id], result);
      return result;
    } catch (error) {
      console.error('Erreur lors de la projection:', error);
      throw error;
    }
  }, [id, queryClient]);

  return {
    triangle,
    isLoading,
    error,
    duplicate: duplicateMutation.mutate,
    isDuplicating: duplicateMutation.isPending,
    calculateFactors,
    projectTriangle,
  };
};

// Hook pour la validation
export const useTriangleValidation = () => {
  const [validation, setValidation] = useState<TriangleValidation | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const validateData = useCallback(async (data: number[][]) => {
    setIsValidating(true);
    try {
      const result = await triangleService.validateTriangle(data);
      setValidation(result);
      return result;
    } catch (error) {
      console.error('Erreur lors de la validation:', error);
      throw error;
    } finally {
      setIsValidating(false);
    }
  }, []);

  const clearValidation = useCallback(() => {
    setValidation(null);
  }, []);

  return {
    validation,
    isValidating,
    validateData,
    clearValidation,
  };
};

// Hook pour l'import de fichiers
export const useTriangleImport = () => {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  const importFile = useCallback(async (
    file: File,
    config: {
      branch: string;
      type: string;
      currency: string;
      hasHeaders?: boolean;
      separator?: string;
    }
  ) => {
    setIsImporting(true);
    setProgress(0);
    
    try {
      // Simuler la progression (dans une vraie app, utiliser les événements de progression)
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const result = await triangleService.importTriangle(file, config);
      
      clearInterval(progressInterval);
      setProgress(100);
      setImportResult(result);
      
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['triangles'] });
      }
      
      return result;
    } catch (error) {
      console.error('Erreur lors de l\'import:', error);
      throw error;
    } finally {
      setIsImporting(false);
      setTimeout(() => setProgress(0), 2000);
    }
  }, [queryClient]);

  return {
    importFile,
    isImporting,
    progress,
    importResult,
  };
};

// Hook pour l'historique
export const useTriangleHistory = (triangleId: string | null) => {
  const {
    data: history,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['triangle-history', triangleId],
    queryFn: () => triangleId ? triangleService.getTriangleHistory(triangleId) : null,
    enabled: !!triangleId,
  });

  const restoreVersion = useCallback(async (version: number) => {
    if (!triangleId) return null;
    try {
      return await triangleService.restoreTriangleVersion(triangleId, version);
    } catch (error) {
      console.error('Erreur lors de la restauration:', error);
      throw error;
    }
  }, [triangleId]);

  return {
    history,
    isLoading,
    error,
    restoreVersion,
  };
};

// Hook pour la comparaison
export const useTriangleComparison = () => {
  const [comparisonResult, setComparisonResult] = useState<any>(null);
  const [isComparing, setIsComparing] = useState(false);

  const compareTriangles = useCallback(async (ids: string[]) => {
    if (ids.length < 2) {
      throw new Error('Au moins 2 triangles sont nécessaires pour la comparaison');
    }

    setIsComparing(true);
    try {
      const result = await triangleService.compareTriangles(ids);
      setComparisonResult(result);
      return result;
    } catch (error) {
      console.error('Erreur lors de la comparaison:', error);
      throw error;
    } finally {
      setIsComparing(false);
    }
  }, []);

  return {
    comparisonResult,
    isComparing,
    compareTriangles,
  };
};

// Hook pour les statistiques
export const useTriangleStatistics = (triangleId: string | null) => {
  const {
    data: statistics,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['triangle-statistics', triangleId],
    queryFn: () => triangleId ? triangleService.getTriangleStatistics(triangleId) : null,
    enabled: !!triangleId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    statistics,
    isLoading,
    error,
    refetch,
  };
};

// Hook pour la recherche
export const useTriangleSearch = () => {
  const [searchResults, setSearchResults] = useState<Triangle[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const search = useCallback(async (query: string) => {
    if (!query || query.trim().length < 2) {
      setSearchResults([]);
      return [];
    }

    setIsSearching(true);
    try {
      const results = await triangleService.searchTriangles(query);
      setSearchResults(results);
      return results;
    } catch (error) {
      console.error('Erreur lors de la recherche:', error);
      throw error;
    } finally {
      setIsSearching(false);
    }
  }, []);

  const clearSearch = useCallback(() => {
    setSearchResults([]);
  }, []);

  return {
    searchResults,
    isSearching,
    search,
    clearSearch,
  };
};

// Hook pour les tags
export const useTags = () => {
  const {
    data: tags,
    isLoading,
    error,
  } = useQuery<string[]>({
    queryKey: ['triangle-tags'],
    queryFn: () => triangleService.getAvailableTags(),
    staleTime: 30 * 60 * 1000, // 30 minutes
  });

  return {
    tags: tags || [],
    isLoading,
    error,
  };
};

// Hook pour les templates
export const useTriangleTemplate = () => {
  const downloadTemplate = useCallback(async (
    branch: string,
    type: string
  ) => {
    try {
      const blob = await triangleService.downloadTemplate(branch, type);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `template_${branch}_${type}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erreur lors du téléchargement du template:', error);
      throw error;
    }
  }, []);

  return {
    downloadTemplate,
  };
};