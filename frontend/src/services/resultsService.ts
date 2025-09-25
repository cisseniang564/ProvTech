// frontend/src/services/resultsService.ts - SERVICE POUR LES RÉSULTATS
import API_CONFIG, { buildUrl } from '../config/api';

// ===== TYPES POUR LES RÉSULTATS =====
export interface MethodResult {
  id: string;
  name: string;
  status: 'success' | 'failed' | 'warning';
  ultimate: number;
  reserves: number;
  paid_to_date: number;
  development_factors: number[];
  projected_triangle?: number[][];
  confidence_intervals?: {
    level: number;
    lower: number;
    upper: number;
  }[];
  diagnostics: {
    rmse: number;
    mape: number;
    r2: number;
  };
  warnings?: string[];
  parameters: Record<string, any>;
}

export interface ResultSummary {
  best_estimate: number;
  range: { min: number; max: number };
  confidence: number;
  convergence: boolean;
}

export interface ResultMetadata {
  currency: string;
  business_line: string;
  data_points: number;
  last_updated: string;
}

export interface CalculationResult {
  id: string;
  triangle_id: string;
  triangle_name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  started_at: string;
  completed_at?: string;
  duration?: number;
  methods: MethodResult[];
  summary: ResultSummary;
  metadata: ResultMetadata;
}

export interface ResultsListResponse {
  data: CalculationResult[];
  total: number;
  page: number;
  limit: number;
}

export interface ExportOptions {
  format: 'json' | 'csv' | 'excel' | 'pdf';
  include_raw_data?: boolean;
  include_charts?: boolean;
}

// ===== SERVICE CLASS =====
class ResultsService {
  private baseURL = API_CONFIG.baseURL;

  /**
   * Récupérer la liste des résultats
   */
  async getResults(params?: {
    triangleId?: string;
    page?: number;
    limit?: number;
    status?: string;
  }): Promise<ResultsListResponse> {
    try {
      const url = new URL(buildUrl(API_CONFIG.endpoints.results));
      
      if (params) {
        if (params.triangleId) url.searchParams.append('triangleId', params.triangleId);
        if (params.page) url.searchParams.append('page', params.page.toString());
        if (params.limit) url.searchParams.append('limit', params.limit.toString());
        if (params.status) url.searchParams.append('status', params.status);
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Erreur lors de la récupération des résultats:', error);
      throw error;
    }
  }

  /**
   * Récupérer un résultat spécifique par ID
   */
  async getResultById(resultId: string): Promise<CalculationResult> {
    try {
      const url = buildUrl(API_CONFIG.endpoints.resultById(resultId));
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Erreur lors de la récupération du résultat ${resultId}:`, error);
      throw error;
    }
  }

  /**
   * Récupérer les résultats d'un triangle spécifique
   */
  async getResultsByTriangle(triangleId: string): Promise<CalculationResult[]> {
    try {
      const response = await this.getResults({ triangleId, limit: 100 });
      return response.data;
    } catch (error) {
      console.error(`Erreur lors de la récupération des résultats pour le triangle ${triangleId}:`, error);
      throw error;
    }
  }

  /**
   * Exporter un résultat
   */
  async exportResult(resultId: string, options: ExportOptions = { format: 'json' }): Promise<any> {
    try {
      const url = buildUrl(API_CONFIG.endpoints.exportResults(resultId, options.format));
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (options.format === 'json') {
        return await response.json();
      } else {
        // Pour les autres formats, retourner les informations sur le fichier
        return await response.json();
      }
    } catch (error) {
      console.error(`Erreur lors de l'export du résultat ${resultId}:`, error);
      throw error;
    }
  }

  /**
   * Comparer plusieurs résultats
   */
  async compareResults(resultIds: string[]): Promise<{
    results: any[];
    comparison_stats: {
      mean_estimate: number;
      min_estimate: number;
      max_estimate: number;
      variance: number;
    };
    total_compared: number;
  }> {
    try {
      if (resultIds.length < 2) {
        throw new Error('Au moins 2 résultats requis pour la comparaison');
      }

      const url = buildUrl(API_CONFIG.endpoints.compareResults);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(resultIds),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Erreur lors de la comparaison des résultats:', error);
      throw error;
    }
  }

  /**
   * Supprimer un résultat
   */
  async deleteResult(resultId: string): Promise<void> {
    try {
      const url = buildUrl(API_CONFIG.endpoints.resultById(resultId));
      
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error(`Erreur lors de la suppression du résultat ${resultId}:`, error);
      throw error;
    }
  }

  /**
   * Télécharger un fichier exporté
   */
  async downloadExport(resultId: string, format: string): Promise<void> {
    try {
      const exportData = await this.exportResult(resultId, { format: format as any });
      
      let blob: Blob;
      let filename: string;

      if (format === 'json') {
        blob = new Blob([JSON.stringify(exportData, null, 2)], { 
          type: 'application/json' 
        });
        filename = `result_${resultId}.json`;
      } else if (format === 'csv' && exportData.data) {
        blob = new Blob([exportData.data], { 
          type: 'text/csv' 
        });
        filename = exportData.filename || `result_${resultId}.csv`;
      } else {
        // Pour les autres formats, utiliser une approche générique
        blob = new Blob([JSON.stringify(exportData)], { 
          type: 'application/octet-stream' 
        });
        filename = exportData.filename || `result_${resultId}.${format}`;
      }

      // Créer et déclencher le téléchargement
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(`Erreur lors du téléchargement du résultat ${resultId}:`, error);
      throw error;
    }
  }
}

// ===== UTILITAIRES =====
export const formatCurrency = (amount: number, currency: string = 'EUR'): string => {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatNumber = (value: number, digits: number = 0): string => {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
};

export const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Export de l'instance singleton
export default new ResultsService();