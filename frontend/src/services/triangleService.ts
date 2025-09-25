// 📁 Racine: frontend/src/services/
// └── triangleService.ts

import axios, { AxiosResponse } from 'axios';

// Configuration de base
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// Types
export interface Triangle {
  id: string;
  name: string;
  branch: 'auto' | 'property' | 'liability' | 'construction';
  type: 'paid' | 'incurred' | 'frequency' | 'severity';
  currency: string;
  originYears: number[];
  developmentYears: number[];
  data: number[][];
  metadata: {
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    lastModifiedBy: string;
    status: 'draft' | 'validated' | 'archived';
    completeness: number;
    hasProjections: boolean;
  };
  statistics?: {
    totalAmount: number;
    averageAmount: number;
    standardDeviation: number;
    coefficientOfVariation: number;
    ultimateLoss?: number;
  };
  developmentFactors?: number[];
  tags: string[];
}

export interface CreateTriangleDto {
  name: string;
  branch: string;
  type: string;
  currency: string;
  data: number[][];
  tags?: string[];
}

export interface UpdateTriangleDto extends Partial<CreateTriangleDto> {
  status?: 'draft' | 'validated' | 'archived';
}

export interface TriangleFilter {
  branch?: string;
  type?: string;
  status?: string;
  currency?: string;
  createdAfter?: string;
  createdBefore?: string;
  search?: string;
  tags?: string[];
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface TriangleValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  dataQuality: {
    completeness: number;
    consistency: number;
    accuracy: number;
    outliers: { row: number; col: number; value: number }[];
  };
}

export interface TriangleImportResult {
  success: boolean;
  triangleId?: string;
  errors?: string[];
  warnings?: string[];
  rowsProcessed: number;
  rowsImported: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Service Class
class TriangleService {
  private axiosInstance = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  constructor() {
    // Intercepteur pour ajouter le token d'authentification
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

    // Intercepteur pour gérer les erreurs
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          // Token expiré, tenter de rafraîchir
          try {
            await this.refreshToken();
            return this.axiosInstance.request(error.config);
          } catch (refreshError) {
            // Redirection vers login
            window.location.href = '/login';
          }
        }
        return Promise.reject(error);
      }
    );
  }

  private async refreshToken(): Promise<void> {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) throw new Error('No refresh token');

    const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
      refresh_token: refreshToken,
    });

    localStorage.setItem('access_token', response.data.access_token);
    if (response.data.refresh_token) {
      localStorage.setItem('refresh_token', response.data.refresh_token);
    }
  }

  // CRUD Operations

  /**
   * Récupérer tous les triangles avec filtres et pagination
   */
  async getTriangles(filters?: TriangleFilter): Promise<PaginatedResponse<Triangle>> {
    const response: AxiosResponse<PaginatedResponse<Triangle>> = await this.axiosInstance.get(
      '/triangles',
      { params: filters }
    );
    return response.data;
  }

  /**
   * Récupérer un triangle par ID
   */
  async getTriangleById(id: string): Promise<Triangle> {
    const response: AxiosResponse<Triangle> = await this.axiosInstance.get(
      `/triangles/${id}`
    );
    return response.data;
  }

  /**
   * Créer un nouveau triangle
   */
  async createTriangle(data: CreateTriangleDto): Promise<Triangle> {
    const response: AxiosResponse<Triangle> = await this.axiosInstance.post(
      '/triangles',
      data
    );
    return response.data;
  }

  /**
   * Mettre à jour un triangle
   */
  async updateTriangle(id: string, data: UpdateTriangleDto): Promise<Triangle> {
    const response: AxiosResponse<Triangle> = await this.axiosInstance.patch(
      `/triangles/${id}`,
      data
    );
    return response.data;
  }

  /**
   * Supprimer un triangle
   */
  async deleteTriangle(id: string): Promise<void> {
    await this.axiosInstance.delete(`/triangles/${id}`);
  }

  /**
   * Dupliquer un triangle
   */
  async duplicateTriangle(id: string, newName: string): Promise<Triangle> {
    const response: AxiosResponse<Triangle> = await this.axiosInstance.post(
      `/triangles/${id}/duplicate`,
      { name: newName }
    );
    return response.data;
  }

  // Validation & Import

  /**
   * Valider les données d'un triangle
   */
  async validateTriangle(data: number[][]): Promise<TriangleValidation> {
    const response: AxiosResponse<TriangleValidation> = await this.axiosInstance.post(
      '/triangles/validate',
      { data }
    );
    return response.data;
  }

/**
   * Importer un triangle depuis un fichier - VERSION CORRIGÉE
   */
  async importTriangle(file: File, config: {
    name?: string;                   // ✅ OPTIONNEL: Nom personnalisé du triangle  
    triangle_name?: string;          // ✅ OPTIONNEL: Alias pour le nom
    branch: string;
    type: string;
    currency: string;
    description?: string;            // ✅ OPTIONNEL: Description optionnelle
    hasHeaders?: boolean;
    separator?: string;
  }): Promise<TriangleImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    
    // ✅ GESTION INTELLIGENTE DU NOM
    const triangleName = config.name || config.triangle_name || `Triangle ${config.branch || 'Importé'}`;
    
    // Envoyer le nom du triangle sous plusieurs formes pour compatibilité
    formData.append('name', triangleName);
    formData.append('triangle_name', triangleName);
    formData.append('branch', config.branch);
    formData.append('business_line', config.branch); // Pour compatibilité backend
    
    // Autres paramètres
    formData.append('type', config.type);
    formData.append('currency', config.currency);
    
    if (config.description) {
      formData.append('description', config.description);
    }
    
    if (config.hasHeaders !== undefined) {
      formData.append('has_headers', String(config.hasHeaders));
    }
    
    if (config.separator) {
      formData.append('separator', config.separator);
    }

    const response: AxiosResponse<TriangleImportResult> = await this.axiosInstance.post(
      '/triangles/import', // ✅ Vérifier que l'URL correspond à votre backend
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  }

  /**
   * Exporter un triangle
   */
  async exportTriangle(
    id: string,
    format: 'csv' | 'excel' | 'json' = 'excel'
  ): Promise<Blob> {
    const response = await this.axiosInstance.get(
      `/triangles/${id}/export`,
      {
        params: { format },
        responseType: 'blob',
      }
    );
    return response.data;
  }

  // Analyse & Calculs

  /**
   * Calculer les facteurs de développement
   */
  async calculateDevelopmentFactors(
    id: string,
    method: 'simple' | 'weighted' | 'geometric' = 'weighted'
  ): Promise<number[]> {
    const response: AxiosResponse<{ factors: number[] }> = await this.axiosInstance.post(
      `/triangles/${id}/development-factors`,
      { method }
    );
    return response.data.factors;
  }

  /**
   * Projeter le triangle complet
   */
  async projectTriangle(
    id: string,
    method: 'chainLadder' | 'bornhuetter' | 'mack' = 'chainLadder',
    parameters?: Record<string, any>
  ): Promise<Triangle> {
    const response: AxiosResponse<Triangle> = await this.axiosInstance.post(
      `/triangles/${id}/project`,
      { method, parameters }
    );
    return response.data;
  }

  /**
   * Obtenir les statistiques d'un triangle
   */
  async getTriangleStatistics(id: string): Promise<Triangle['statistics']> {
    const response: AxiosResponse<Triangle['statistics']> = await this.axiosInstance.get(
      `/triangles/${id}/statistics`
    );
    return response.data;
  }

  /**
   * Comparer plusieurs triangles
   */
  async compareTriangles(ids: string[]): Promise<{
    triangles: Triangle[];
    comparison: {
      metric: string;
      values: Record<string, number>;
      variance: number;
      trend: 'increasing' | 'decreasing' | 'stable';
    }[];
  }> {
    const response = await this.axiosInstance.post('/triangles/compare', { ids });
    return response.data;
  }

  // Batch Operations

  /**
   * Opérations batch sur plusieurs triangles
   */
  async batchOperation(
    ids: string[],
    operation: 'delete' | 'archive' | 'validate' | 'export'
  ): Promise<{
    success: string[];
    failed: { id: string; error: string }[];
  }> {
    const response = await this.axiosInstance.post('/triangles/batch', {
      ids,
      operation,
    });
    return response.data;
  }

  // Historique & Versions

  /**
   * Obtenir l'historique des modifications
   */
  async getTriangleHistory(id: string): Promise<{
    versions: {
      version: number;
      modifiedAt: string;
      modifiedBy: string;
      changes: string[];
    }[];
  }> {
    const response = await this.axiosInstance.get(`/triangles/${id}/history`);
    return response.data;
  }

  /**
   * Restaurer une version antérieure
   */
  async restoreTriangleVersion(id: string, version: number): Promise<Triangle> {
    const response: AxiosResponse<Triangle> = await this.axiosInstance.post(
      `/triangles/${id}/restore`,
      { version }
    );
    return response.data;
  }

  // Méthodes utilitaires

  /**
   * Recherche de triangles
   */
  async searchTriangles(query: string): Promise<Triangle[]> {
    const response: AxiosResponse<Triangle[]> = await this.axiosInstance.get(
      '/triangles/search',
      { params: { q: query } }
    );
    return response.data;
  }

  /**
   * Obtenir les tags disponibles
   */
  async getAvailableTags(): Promise<string[]> {
    const response: AxiosResponse<string[]> = await this.axiosInstance.get(
      '/triangles/tags'
    );
    return response.data;
  }

  /**
   * Télécharger un template de triangle
   */
  async downloadTemplate(branch: string, type: string): Promise<Blob> {
    const response = await this.axiosInstance.get(
      '/triangles/template',
      {
        params: { branch, type },
        responseType: 'blob',
      }
    );
    return response.data;
  }
}

// Export singleton instance
export default new TriangleService();