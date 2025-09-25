// frontend/src/services/api.ts

// ===================================
// CONFIGURATION API AXIOS
// ===================================

import axios, { 
  AxiosInstance, 
  AxiosResponse, 
  AxiosError, 
  InternalAxiosRequestConfig 
} from 'axios';
import toast from 'react-hot-toast';
import { ApiResponse, ApiError } from '@/types';

// ============ CONFIGURATION DE BASE ============
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
const API_VERSION = '/api/v1';

// Instance Axios principale
export const api: AxiosInstance = axios.create({
  //baseURL: `${API_BASE_URL}${API_VERSION}`,
  timeout: 30000, // 30 secondes
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// ============ GESTION DU TOKEN ============
class TokenManager {
  private static readonly TOKEN_KEY = 'provtech_token';
  private static readonly REFRESH_TOKEN_KEY = 'provtech_refresh_token';

  static getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  static setToken(token: string): void {
    localStorage.setItem(this.TOKEN_KEY, token);
  }

  static getRefreshToken(): string | null {
    return localStorage.getItem(this.REFRESH_TOKEN_KEY);
  }

  static setRefreshToken(refreshToken: string): void {
    localStorage.setItem(this.REFRESH_TOKEN_KEY, refreshToken);
  }

  static clearTokens(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
  }

  static hasValidToken(): boolean {
    const token = this.getToken();
    if (!token) return false;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const currentTime = Date.now() / 1000;
      return payload.exp > currentTime;
    } catch {
      return false;
    }
  }
}

// ============ INTERCEPTEURS DE REQUÊTE ============
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Ajouter le token d'autorisation
    const token = TokenManager.getToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Log des requêtes en développement
    if (process.env.NODE_ENV === 'development') {
      console.log(`🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`, {
        params: config.params,
        data: config.data,
      });
    }

    return config;
  },
  (error: AxiosError) => {
    console.error('❌ Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// ============ INTERCEPTEURS DE RÉPONSE ============
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: string) => void;
  reject: (error: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token!);
    }
  });
  
  failedQueue = [];
};

api.interceptors.response.use(
  (response: AxiosResponse) => {
    // Log des réponses en développement
    if (process.env.NODE_ENV === 'development') {
      console.log(`✅ API Response: ${response.config.method?.toUpperCase()} ${response.config.url}`, {
        status: response.status,
        data: response.data,
      });
    }

    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Gestion de l'erreur 401 (token expiré)
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Si un refresh est déjà en cours, ajouter à la queue
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers!.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        }).catch(err => {
          return Promise.reject(err);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = TokenManager.getRefreshToken();

      if (refreshToken) {
        try {
          const response = await axios.post(`${API_BASE_URL}${API_VERSION}/auth/refresh`, {
            refresh_token: refreshToken,
          });

          const { access_token } = response.data;
          TokenManager.setToken(access_token);
          
          processQueue(null, access_token);
          
          originalRequest.headers!.Authorization = `Bearer ${access_token}`;
          return api(originalRequest);
        } catch (refreshError) {
          processQueue(refreshError, null);
          TokenManager.clearTokens();
          
          // Redirection vers la page de login
          window.location.href = '/login';
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      } else {
        TokenManager.clearTokens();
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }

    // Gestion des autres erreurs
    handleApiError(error);
    return Promise.reject(error);
  }
);

// ============ GESTION DES ERREURS ============
const handleApiError = (error: AxiosError) => {
  const apiError: ApiError = {
    message: 'Une erreur inattendue s\'est produite',
    status: error.response?.status || 500,
  };

  if (error.response?.data) {
    const data = error.response.data as any;
    apiError.message = data.message || data.detail || apiError.message;
    apiError.code = data.code;
    apiError.details = data.errors;
  } else if (error.request) {
    apiError.message = 'Impossible de contacter le serveur';
    apiError.status = 0;
  }

  // Affichage des toasts d'erreur (sauf pour certains cas)
  const silentErrors = [401, 403]; // Pas de toast pour les erreurs d'auth
  if (!silentErrors.includes(apiError.status)) {
    toast.error(apiError.message);
  }

  // Log en développement
  if (process.env.NODE_ENV === 'development') {
    console.error('❌ API Error:', apiError);
  }
};

// ============ HELPERS API ============
export class ApiClient {
  // GET avec typing automatique
  static async get<T>(url: string, params?: Record<string, any>): Promise<T> {
    const response = await api.get<ApiResponse<T>>(url, { params });
    return response.data.data;
  }

  // POST avec typing automatique
  static async post<T>(url: string, data?: any): Promise<T> {
    const response = await api.post<ApiResponse<T>>(url, data);
    return response.data.data;
  }

  // PUT avec typing automatique
  static async put<T>(url: string, data?: any): Promise<T> {
    const response = await api.put<ApiResponse<T>>(url, data);
    return response.data.data;
  }

  // DELETE avec typing automatique
  static async delete<T>(url: string): Promise<T> {
    const response = await api.delete<ApiResponse<T>>(url);
    return response.data.data;
  }

  // PATCH avec typing automatique
  static async patch<T>(url: string, data?: any): Promise<T> {
    const response = await api.patch<ApiResponse<T>>(url, data);
    return response.data.data;
  }

  // Upload de fichier avec progression
  static async uploadFile<T>(
    url: string, 
    file: File, 
    onProgress?: (progress: number) => void
  ): Promise<T> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post<ApiResponse<T>>(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      },
    });

    return response.data.data;
  }

  // Download de fichier
  static async downloadFile(url: string, filename?: string): Promise<void> {
    const response = await api.get(url, {
      responseType: 'blob',
    });

    const blob = new Blob([response.data]);
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename || 'download';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
  }
}

// ============ ENDPOINTS CONSTANTS ============
export const API_ENDPOINTS = {
  // Auth
  AUTH_LOGIN: '/auth/login',
  AUTH_REGISTER: '/auth/register',
  AUTH_REFRESH: '/auth/refresh',
  AUTH_LOGOUT: '/auth/logout',
  AUTH_ME: '/auth/me',
  AUTH_CHANGE_PASSWORD: '/auth/change-password',

  // Users
  USERS: '/users',
  USER_BY_ID: (id: string) => `/users/${id}`,
  USER_PREFERENCES: (id: string) => `/users/${id}/preferences`,

  // Triangles
  TRIANGLES: '/triangles',
  TRIANGLE_BY_ID: (id: string) => `/triangles/${id}`,
  TRIANGLE_UPLOAD: '/triangles/upload',
  TRIANGLE_EXPORT: (id: string) => `/triangles/${id}/export`,
  TRIANGLE_VALIDATE: (id: string) => `/triangles/${id}/validate`,
  TRIANGLE_STATS: (id: string) => `/triangles/${id}/stats`,

  // Calculations
  CALCULATIONS: '/calculations',
  CALCULATION_BY_ID: (id: string) => `/calculations/${id}`,
  CALCULATION_RUN: '/calculations/run',
  CALCULATION_RESULTS: (id: string) => `/calculations/${id}/results`,
  CALCULATION_CANCEL: (id: string) => `/calculations/${id}/cancel`,

  // Exports
  EXPORTS: '/exports',
  EXPORT_BY_ID: (id: string) => `/exports/${id}`,
  EXPORT_DOWNLOAD: (id: string) => `/exports/${id}/download`,

  // Compliance
  COMPLIANCE_CHECKS: '/compliance/checks',
  COMPLIANCE_CHECK_BY_ID: (id: string) => `/compliance/checks/${id}`,
  COMPLIANCE_RULES: '/compliance/rules',

  // Audit
  AUDIT_EVENTS: '/audit/events',
  AUDIT_SEARCH: '/audit/search',

  // Notifications
  NOTIFICATIONS: '/notifications',
  NOTIFICATION_BY_ID: (id: string) => `/notifications/${id}`,
  NOTIFICATIONS_MARK_READ: '/notifications/mark-read',

  // Health
  HEALTH: '/health',
  HEALTH_DB: '/health/db',
  HEALTH_REDIS: '/health/redis',
} as const;

// ============ RATE LIMITING ============
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly maxRequests = 100; // max requests per minute
  private readonly timeWindow = 60000; // 1 minute

  canMakeRequest(endpoint: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(endpoint) || [];
    
    // Nettoyer les anciennes requêtes
    const validRequests = requests.filter(time => now - time < this.timeWindow);
    
    if (validRequests.length >= this.maxRequests) {
      return false;
    }

    validRequests.push(now);
    this.requests.set(endpoint, validRequests);
    return true;
  }
}

export const rateLimiter = new RateLimiter();

// ============ UTILITAIRES ============
export const createQueryString = (params: Record<string, any>): string => {
  const searchParams = new URLSearchParams();
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      if (Array.isArray(value)) {
        value.forEach(item => searchParams.append(key, item));
      } else {
        searchParams.append(key, value.toString());
      }
    }
  });

  return searchParams.toString();
};

export const isApiError = (error: any): error is ApiError => {
  return error && typeof error.message === 'string' && typeof error.status === 'number';
};

// Export du token manager pour usage externe
export { TokenManager };

// Export de l'instance par défaut
export default api;