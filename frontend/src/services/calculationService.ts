// 📁 Racine: frontend/src/services/
// └── calculationService.ts

import axios, { AxiosResponse } from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000'
// Types
export interface CalculationMethod {
  id: string;
  name: string;
  description: string;
  category: 'deterministic' | 'stochastic' | 'machine_learning';
  requiredParameters: Parameter[];
  optionalParameters: Parameter[];
  supportedTriangleTypes: string[];
}

export interface Parameter {
  id: string;
  name: string;
  type: 'number' | 'string' | 'boolean' | 'select' | 'range';
  defaultValue?: any;
  min?: number;
  max?: number;
  options?: { value: string; label: string }[];
  unit?: string;
  description?: string;
  required: boolean;
}

export interface CalculationRequest {
  triangleId: string;
  methods: string[];
  parameters: Record<string, Record<string, any>>;
  options: {
    generateConfidenceIntervals?: boolean;
    confidenceLevel?: number;
    runSensitivityAnalysis?: boolean;
    includeStressTests?: boolean;
    exportFormat?: 'json' | 'excel' | 'pdf';
  };
}

export interface CalculationResult {
  id: string;
  triangleId: string;
  method: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  startedAt: string;
  completedAt?: string;
  executionTime?: number;
  results: {
    reserves: number;
    ultimateLoss: number;
    ibnr: number;
    paidToDate: number;
    developmentFactors: number[];
    tailFactor?: number;
    confidenceInterval?: {
      lower: number;
      upper: number;
      level: number;
    };
    statistics: {
      mean: number;
      median: number;
      standardDeviation: number;
      coefficientOfVariation: number;
      skewness?: number;
      kurtosis?: number;
    };
    diagnostics: {
      residuals?: number[];
      goodnessOfFit?: number;
      validationMetrics?: Record<string, number>;
    };
  };
  parameters: Record<string, any>;
  warnings?: string[];
  errors?: string[];
}

export interface CalculationComparison {
  triangleId: string;
  methods: string[];
  results: CalculationResult[];
  comparison: {
    metric: string;
    values: Record<string, number>;
    bestMethod: string;
    recommendation: string;
  }[];
  consensus: {
    reserves: number;
    confidenceLevel: number;
    range: { min: number; max: number };
  };
}

export interface SensitivityAnalysis {
  baseCase: CalculationResult;
  scenarios: {
    parameter: string;
    variations: {
      value: any;
      result: CalculationResult;
      impact: number;
      impactPercentage: number;
    }[];
  }[];
  mostSensitive: string[];
  recommendations: string[];
}

export interface StressTestResult {
  scenario: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'extreme';
  probability: number;
  impact: {
    reserves: number;
    reserveChange: number;
    capitalRequirement: number;
  };
  passed: boolean;
  recommendations: string[];
}

export interface MonteCarloSimulation {
  id: string;
  triangleId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  iterations: number;
  seed?: number;
  distribution: string;
  results?: {
    mean: number;
    median: number;
    standardDeviation: number;
    percentiles: Record<number, number>;
    var: number;
    tvar: number;
    histogram: { bin: number; frequency: number }[];
    convergence: { iteration: number; value: number }[];
  };
}

export interface BacktestResult {
  triangleId: string;
  method: string;
  period: string;
  actual: number;
  predicted: number;
  error: number;
  errorPercentage: number;
  mape: number;
  rmse: number;
  performance: 'excellent' | 'good' | 'acceptable' | 'poor';
}

// Service Class
class CalculationService {
  private axiosInstance = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  private wsConnection: WebSocket | null = null;

  constructor() {
    // Configuration des intercepteurs
    this.axiosInstance.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('access_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );
  }

  // Méthodes de calcul

  /**
   * Obtenir les méthodes de calcul disponibles
   */
  async getAvailableMethods(): Promise<CalculationMethod[]> {
    const response: AxiosResponse<CalculationMethod[]> = await this.axiosInstance.get(
      '/calculations/methods'
    );
    return response.data;
  }

  /**
   * Lancer un calcul
   */
  async runCalculation(request: CalculationRequest): Promise<{
    calculationId: string;
    estimatedTime: number;
  }> {
    const response = await this.axiosInstance.post('/calculations/run', request);
    return response.data;
  }

  /**
   * Obtenir le statut d'un calcul
   */
  async getCalculationStatus(calculationId: string): Promise<{
    status: string;
    progress: number;
    message?: string;
  }> {
    const response = await this.axiosInstance.get(`/calculations/${calculationId}/status`);
    return response.data;
  }

  /**
   * Obtenir les résultats d'un calcul
   */
  async getCalculationResult(calculationId: string): Promise<CalculationResult> {
    const response: AxiosResponse<CalculationResult> = await this.axiosInstance.get(
      `/calculations/${calculationId}/result`
    );
    return response.data;
  }

  /**
   * Arrêter un calcul en cours
   */
  async cancelCalculation(calculationId: string): Promise<void> {
    await this.axiosInstance.post(`/calculations/${calculationId}/cancel`);
  }

  /**
   * Obtenir l'historique des calculs
   */
  async getCalculationHistory(
    triangleId?: string,
    limit: number = 50
  ): Promise<CalculationResult[]> {
    const response: AxiosResponse<CalculationResult[]> = await this.axiosInstance.get(
      '/calculations/history',
      { params: { triangleId, limit } }
    );
    return response.data;
  }

  // Comparaison et analyse

  /**
   * Comparer plusieurs méthodes
   */
  async compareMethods(
    triangleId: string,
    methods: string[],
    parameters?: Record<string, any>
  ): Promise<CalculationComparison> {
    const response: AxiosResponse<CalculationComparison> = await this.axiosInstance.post(
      '/calculations/compare',
      { triangleId, methods, parameters }
    );
    return response.data;
  }

  /**
   * Analyse de sensibilité
   */
  async runSensitivityAnalysis(
    calculationId: string,
    parameters: string[],
    ranges: Record<string, { min: number; max: number; steps: number }>
  ): Promise<SensitivityAnalysis> {
    const response: AxiosResponse<SensitivityAnalysis> = await this.axiosInstance.post(
      `/calculations/${calculationId}/sensitivity`,
      { parameters, ranges }
    );
    return response.data;
  }

  /**
   * Tests de stress
   */
  async runStressTests(
    triangleId: string,
    scenarios?: string[]
  ): Promise<StressTestResult[]> {
    const response: AxiosResponse<StressTestResult[]> = await this.axiosInstance.post(
      '/calculations/stress-test',
      { triangleId, scenarios }
    );
    return response.data;
  }

  // Simulations

  /**
   * Lancer une simulation Monte Carlo
   */
  async runMonteCarloSimulation(
    triangleId: string,
    config: {
      iterations: number;
      distribution: string;
      parameters: Record<string, any>;
      seed?: number;
    }
  ): Promise<{ simulationId: string }> {
    const response = await this.axiosInstance.post('/calculations/monte-carlo', {
      triangleId,
      ...config,
    });
    return response.data;
  }

  /**
   * Obtenir les résultats de simulation
   */
  async getSimulationResults(simulationId: string): Promise<MonteCarloSimulation> {
    const response: AxiosResponse<MonteCarloSimulation> = await this.axiosInstance.get(
      `/calculations/monte-carlo/${simulationId}`
    );
    return response.data;
  }

  // Backtesting

  /**
   * Effectuer un backtest
   */
  async runBacktest(
    triangleId: string,
    method: string,
    historicalData: number[][],
    testPeriods: number
  ): Promise<BacktestResult[]> {
    const response: AxiosResponse<BacktestResult[]> = await this.axiosInstance.post(
      '/calculations/backtest',
      { triangleId, method, historicalData, testPeriods }
    );
    return response.data;
  }

  // WebSocket pour calculs temps réel

  /**
   * Se connecter au WebSocket pour les mises à jour temps réel
   */
  connectToCalculationUpdates(
    calculationId: string,
    onUpdate: (data: any) => void,
    onError?: (error: any) => void
  ): void {
    const wsUrl = API_BASE_URL.replace('http', 'ws');
    const token = localStorage.getItem('access_token');
    
    this.wsConnection = new WebSocket(`${wsUrl}/calculations/${calculationId}/ws?token=${token}`);
    
    this.wsConnection.onmessage = (event) => {
      const data = JSON.parse(event.data);
      onUpdate(data);
    };
    
    this.wsConnection.onerror = (error) => {
      if (onError) onError(error);
    };
  }

  /**
   * Déconnecter du WebSocket
   */
  disconnectFromUpdates(): void {
    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
    }
  }

  // Export et rapports

  /**
   * Exporter les résultats de calcul
   */
  async exportCalculationResults(
    calculationId: string,
    format: 'excel' | 'pdf' | 'json' = 'excel'
  ): Promise<Blob> {
    const response = await this.axiosInstance.get(
      `/calculations/${calculationId}/export`,
      {
        params: { format },
        responseType: 'blob',
      }
    );
    return response.data;
  }

  /**
   * Générer un rapport de calcul
   */
  async generateReport(
    calculationIds: string[],
    template: 'standard' | 'detailed' | 'executive' | 'regulatory'
  ): Promise<{ reportId: string; url: string }> {
    const response = await this.axiosInstance.post('/calculations/report', {
      calculationIds,
      template,
    });
    return response.data;
  }

  // Méthodes utilitaires

  /**
   * Valider les paramètres de calcul
   */
  async validateParameters(
    method: string,
    parameters: Record<string, any>
  ): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const response = await this.axiosInstance.post('/calculations/validate', {
      method,
      parameters,
    });
    return response.data;
  }

  /**
   * Obtenir les paramètres recommandés
   */
  async getRecommendedParameters(
    triangleId: string,
    method: string
  ): Promise<Record<string, any>> {
    const response = await this.axiosInstance.get(
      `/calculations/recommendations`,
      { params: { triangleId, method } }
    );
    return response.data;
  }

  /**
   * Obtenir les benchmarks de performance
   */
  async getPerformanceBenchmarks(
    method: string
  ): Promise<{
    averageTime: number;
    accuracy: number;
    usage: number;
    satisfaction: number;
  }> {
    const response = await this.axiosInstance.get(
      `/calculations/benchmarks/${method}`
    );
    return response.data;
  }
}

// Export singleton instance
export default new CalculationService();