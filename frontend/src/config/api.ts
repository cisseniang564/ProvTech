// frontend/src/config/api.ts - CONFIGURATION API COMPLÈTE
const API_CONFIG = {
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:8000', // Port backend
  endpoints: {
    // ===== TRIANGLES =====
    triangles: '/api/v1/triangles',
    triangleById: (id: string) => `/api/v1/triangles/${id}`,
    validateImport: '/api/v1/triangles/validate',
    importTriangle: '/api/v1/triangles/import',
    exportTriangle: (id: string) => `/api/v1/triangles/${id}/export`,
    deleteTriangle: (id: string) => `/api/v1/triangles/${id}`,
    
    // ===== CALCULS =====
    calculations: '/api/v1/calculations',
    runCalculation: '/api/v1/calculations/run',
    calculationById: (id: string) => `/api/v1/calculations/${id}`,
    cancelCalculation: (id: string) => `/api/v1/calculations/${id}/cancel`,
    methods: '/api/v1/calculations/methods',
    
    // ===== RÉSULTATS ===== ✅ NOUVEAU
    results: '/api/v1/results',
    resultById: (id: string) => `/api/v1/results/${id}`,
    resultsByTriangle: (triangleId: string) => `/api/v1/results?triangleId=${triangleId}`,
    exportResults: (id: string, format: string) => `/api/v1/results/${id}/export?format=${format}`,
    compareResults: '/api/v1/results/compare',
    
    // ===== SIMULATIONS =====
    simulations: '/api/v1/simulations',
    simulationById: (id: string) => `/api/v1/simulations/${id}`,
    runSimulation: '/api/v1/simulations/run',
    simulationResults: (id: string) => `/api/v1/simulations/${id}/results`,
    
    // ===== AUDIT =====
    audit: '/api/v1/audit',
    auditEvents: '/api/v1/audit/events',
    auditSearch: '/api/v1/audit/search',
    
    // ===== UTILISATEURS & AUTH =====
    auth: {
      login: '/api/v1/auth/login',
      logout: '/api/v1/auth/logout',
      register: '/api/v1/auth/register',
      refresh: '/api/v1/auth/refresh',
      me: '/api/v1/auth/me'
    },
    
    // ===== HEALTH & DEBUG =====
    health: '/health',
    healthDetailed: '/api/v1/health',
    test: '/api/v1/test',
    ping: '/api/v1/ping'
  }
};

// ===== HELPER FUNCTIONS =====
export const buildUrl = (endpoint: string, baseURL?: string) => {
  const base = baseURL || API_CONFIG.baseURL;
  return `${base}${endpoint}`;
};

export const buildEndpoint = (path: string, params?: Record<string, string>) => {
  let endpoint = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      endpoint = endpoint.replace(`:${key}`, value);
    });
  }
  return endpoint;
};

// ===== TYPES POUR L'API =====
export interface ApiEndpoints {
  triangles: string;
  results: string;
  calculations: string;
  simulations: string;
  audit: string;
}

export interface ApiResponse<T = any> {
  data: T;
  message?: string;
  status: 'success' | 'error';
  timestamp: string;
}

export interface PaginatedResponse<T = any> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default API_CONFIG;