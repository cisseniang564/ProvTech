// 📁 Racine: frontend/src/hooks/
// └── useCalculations.ts

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import calculationService, {
  CalculationMethod,
  CalculationRequest,
  CalculationResult,
  CalculationComparison,
  SensitivityAnalysis,
  StressTestResult,
  MonteCarloSimulation,
  BacktestResult,
} from '../services/calculationService';

// Hook principal pour les calculs
export const useCalculations = () => {
  const queryClient = useQueryClient();
  const [activeCalculations, setActiveCalculations] = useState<Map<string, any>>(new Map());
  const wsConnectionsRef = useRef<Map<string, boolean>>(new Map());

  // Récupérer les méthodes disponibles
  const {
    data: methods,
    isLoading: isLoadingMethods,
    error: methodsError,
  } = useQuery<CalculationMethod[]>({
    queryKey: ['calculation-methods'],
    queryFn: () => calculationService.getAvailableMethods(),
    staleTime: 60 * 60 * 1000, // 1 heure
  });

// ✅ CORRECTION dans useCalculations.ts
// Remplacez la section runCalculationMutation par :

const runCalculationMutation = useMutation({
  mutationFn: (request: CalculationRequest) => calculationService.runCalculation(request),
  onSuccess: (data, variables) => {
    // ✅ CORRECTION : L'API renvoie calculation_id (snake_case) pas calculationId (camelCase)
    const calculationId = data.calculationId || data.calculationId;
    
    console.log('🎉 Calcul lancé avec succès:', data);
    console.log('🔍 ID récupéré:', calculationId, '(type:', typeof calculationId, ')');
    
    if (!calculationId) {
      console.error('❌ Pas de calculation_id dans la réponse:', data);
      return;
    }

    // Ajouter le calcul actif avec le bon ID
    setActiveCalculations(prev => new Map(prev).set(calculationId, {
      id: calculationId,
      triangleId: variables.triangleId,
      methods: variables.methods,
      status: 'pending',
      progress: 0,
    }));
    
    // ✅ Se connecter aux mises à jour WebSocket avec l'ID correct
    console.log('🔌 Connexion WebSocket pour:', calculationId);
    connectToCalculationUpdates(calculationId);
  },
  onError: (error) => {
    console.error('❌ Erreur lors du lancement du calcul:', error);
  }
});

  // Se connecter aux mises à jour d'un calcul
  const connectToCalculationUpdates = useCallback((calculationId: string) => {
    if (wsConnectionsRef.current.has(calculationId)) return;

    calculationService.connectToCalculationUpdates(
      calculationId,
      (update) => {
        setActiveCalculations(prev => {
          const newMap = new Map(prev);
          const existing = newMap.get(calculationId);
          if (existing) {
            newMap.set(calculationId, { ...existing, ...update });
          }
          return newMap;
        });

        // Si le calcul est terminé
        if (update.status === 'completed' || update.status === 'failed') {
          wsConnectionsRef.current.delete(calculationId);
          calculationService.disconnectFromUpdates();
          
          // Invalider les queries pertinentes
          queryClient.invalidateQueries({ queryKey: ['calculation-history'] });
          queryClient.invalidateQueries({ queryKey: ['calculation-result', calculationId] });
        }
      },
      (error) => {
        console.error(`WebSocket error for calculation ${calculationId}:`, error);
        wsConnectionsRef.current.delete(calculationId);
      }
    );

    wsConnectionsRef.current.set(calculationId, true);
  }, [queryClient]);

  // Nettoyer les connexions WebSocket au démontage
  useEffect(() => {
    return () => {
      calculationService.disconnectFromUpdates();
      wsConnectionsRef.current.clear();
    };
  }, []);

  // Annuler un calcul
  const cancelCalculation = useCallback(async (calculationId: string) => {
    try {
      await calculationService.cancelCalculation(calculationId);
      setActiveCalculations(prev => {
        const newMap = new Map(prev);
        newMap.delete(calculationId);
        return newMap;
      });
      wsConnectionsRef.current.delete(calculationId);
    } catch (error) {
      console.error('Erreur lors de l\'annulation du calcul:', error);
      throw error;
    }
  }, []);

  return {
    methods: methods || [],
    isLoadingMethods,
    methodsError,
    runCalculation: runCalculationMutation.mutate,
    isRunning: runCalculationMutation.isPending,
    activeCalculations: Array.from(activeCalculations.values()),
    cancelCalculation,
  };
};

// Hook pour les résultats d'un calcul
export const useCalculationResult = (calculationId: string | null) => {
  const {
    data: result,
    isLoading,
    error,
    refetch,
  } = useQuery<CalculationResult>({
    queryKey: ['calculation-result', calculationId],
    queryFn: () => calculationId ? calculationService.getCalculationResult(calculationId) : null,
    enabled: !!calculationId,
    staleTime: 5 * 60 * 1000,
  });

  // Export des résultats
  const exportResults = useCallback(async (
    format: 'excel' | 'pdf' | 'json' = 'excel'
  ) => {
    if (!calculationId) return;
    
    try {
      const blob = await calculationService.exportCalculationResults(calculationId, format);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `calculation_${calculationId}_${new Date().toISOString()}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erreur lors de l\'export:', error);
      throw error;
    }
  }, [calculationId]);

  return {
    result,
    isLoading,
    error,
    refetch,
    exportResults,
  };
};

// Hook pour l'historique des calculs
export const useCalculationHistory = (triangleId?: string, limit: number = 50) => {
  const {
    data: history,
    isLoading,
    error,
    refetch,
  } = useQuery<CalculationResult[]>({
    queryKey: ['calculation-history', triangleId, limit],
    queryFn: () => calculationService.getCalculationHistory(triangleId, limit),
    staleTime: 2 * 60 * 1000,
  });

  return {
    history: history || [],
    isLoading,
    error,
    refetch,
  };
};

// Hook pour la comparaison de méthodes
export const useMethodComparison = () => {
  const [comparison, setComparison] = useState<CalculationComparison | null>(null);
  const [isComparing, setIsComparing] = useState(false);

  const compareMethods = useCallback(async (
    triangleId: string,
    methods: string[],
    parameters?: Record<string, any>
  ) => {
    setIsComparing(true);
    try {
      const result = await calculationService.compareMethods(triangleId, methods, parameters);
      setComparison(result);
      return result;
    } catch (error) {
      console.error('Erreur lors de la comparaison:', error);
      throw error;
    } finally {
      setIsComparing(false);
    }
  }, []);

  return {
    comparison,
    isComparing,
    compareMethods,
    clearComparison: () => setComparison(null),
  };
};

// Hook pour l'analyse de sensibilité
export const useSensitivityAnalysis = () => {
  const [analysis, setAnalysis] = useState<SensitivityAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const runAnalysis = useCallback(async (
    calculationId: string,
    parameters: string[],
    ranges: Record<string, { min: number; max: number; steps: number }>
  ) => {
    setIsAnalyzing(true);
    try {
      const result = await calculationService.runSensitivityAnalysis(
        calculationId,
        parameters,
        ranges
      );
      setAnalysis(result);
      return result;
    } catch (error) {
      console.error('Erreur lors de l\'analyse de sensibilité:', error);
      throw error;
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  return {
    analysis,
    isAnalyzing,
    runAnalysis,
    clearAnalysis: () => setAnalysis(null),
  };
};

// Hook pour les stress tests
export const useStressTests = () => {
  const [results, setResults] = useState<StressTestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const runStressTests = useCallback(async (
    triangleId: string,
    scenarios?: string[]
  ) => {
    setIsRunning(true);
    try {
      const testResults = await calculationService.runStressTests(triangleId, scenarios);
      setResults(testResults);
      return testResults;
    } catch (error) {
      console.error('Erreur lors des stress tests:', error);
      throw error;
    } finally {
      setIsRunning(false);
    }
  }, []);

  return {
    results,
    isRunning,
    runStressTests,
    clearResults: () => setResults([]),
  };
};

// Hook pour les simulations Monte Carlo
export const useMonteCarloSimulation = () => {
  const [simulationId, setSimulationId] = useState<string | null>(null);
  const [simulation, setSimulation] = useState<MonteCarloSimulation | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [progress, setProgress] = useState(0);

  const runSimulation = useCallback(async (
    triangleId: string,
    config: {
      iterations: number;
      distribution: string;
      parameters: Record<string, any>;
      seed?: number;
    }
  ) => {
    setIsSimulating(true);
    setProgress(0);
    
    try {
      const { simulationId: id } = await calculationService.runMonteCarloSimulation(
        triangleId,
        config
      );
      setSimulationId(id);

      // Connecter aux mises à jour WebSocket
      calculationService.connectToCalculationUpdates(
        id,
        (update) => {
          if (update.progress) setProgress(update.progress);
          if (update.status === 'completed') {
            fetchSimulationResults(id);
          }
        },
        (error) => {
          console.error('WebSocket error:', error);
          setIsSimulating(false);
        }
      );

      return id;
    } catch (error) {
      console.error('Erreur lors du lancement de la simulation:', error);
      setIsSimulating(false);
      throw error;
    }
  }, []);

  const fetchSimulationResults = useCallback(async (id: string) => {
    try {
      const results = await calculationService.getSimulationResults(id);
      setSimulation(results);
      setIsSimulating(false);
    } catch (error) {
      console.error('Erreur lors de la récupération des résultats:', error);
      setIsSimulating(false);
      throw error;
    }
  }, []);

  return {
    simulationId,
    simulation,
    isSimulating,
    progress,
    runSimulation,
    clearSimulation: () => {
      setSimulationId(null);
      setSimulation(null);
      setProgress(0);
    },
  };
};

// Hook pour le backtesting
export const useBacktest = () => {
  const [results, setResults] = useState<BacktestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const runBacktest = useCallback(async (
    triangleId: string,
    method: string,
    historicalData: number[][],
    testPeriods: number
  ) => {
    setIsRunning(true);
    try {
      const backtestResults = await calculationService.runBacktest(
        triangleId,
        method,
        historicalData,
        testPeriods
      );
      setResults(backtestResults);
      return backtestResults;
    } catch (error) {
      console.error('Erreur lors du backtest:', error);
      throw error;
    } finally {
      setIsRunning(false);
    }
  }, []);

  return {
    results,
    isRunning,
    runBacktest,
    clearResults: () => setResults([]),
  };
};

// Hook pour la validation des paramètres
export const useParameterValidation = () => {
  const [validation, setValidation] = useState<any>(null);
  const [isValidating, setIsValidating] = useState(false);

  const validateParameters = useCallback(async (
    method: string,
    parameters: Record<string, any>
  ) => {
    setIsValidating(true);
    try {
      const result = await calculationService.validateParameters(method, parameters);
      setValidation(result);
      return result;
    } catch (error) {
      console.error('Erreur lors de la validation:', error);
      throw error;
    } finally {
      setIsValidating(false);
    }
  }, []);

  return {
    validation,
    isValidating,
    validateParameters,
    clearValidation: () => setValidation(null),
  };
};

// Hook pour les paramètres recommandés
export const useRecommendedParameters = (triangleId: string | null, method: string | null) => {
  const {
    data: parameters,
    isLoading,
    error,
  } = useQuery<Record<string, any>>({
    queryKey: ['recommended-parameters', triangleId, method],
    queryFn: () => 
      triangleId && method 
        ? calculationService.getRecommendedParameters(triangleId, method)
        : null,
    enabled: !!triangleId && !!method,
    staleTime: 10 * 60 * 1000,
  });

  return {
    parameters,
    isLoading,
    error,
  };
};

// Hook pour les rapports
export const useCalculationReport = () => {
  const [isGenerating, setIsGenerating] = useState(false);

  const generateReport = useCallback(async (
    calculationIds: string[],
    template: 'standard' | 'detailed' | 'executive' | 'regulatory'
  ) => {
    setIsGenerating(true);
    try {
      const { reportId, url } = await calculationService.generateReport(
        calculationIds,
        template
      );
      
      // Ouvrir le rapport dans un nouvel onglet
      window.open(url, '_blank');
      
      return { reportId, url };
    } catch (error) {
      console.error('Erreur lors de la génération du rapport:', error);
      throw error;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  return {
    generateReport,
    isGenerating,
  };
};