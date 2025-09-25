// /src/services/SecureAuthService.ts
// Service pour intégrer votre backend sécurisé avec votre système existant

class SecureAuthService {
  private static readonly API_BASE_URL = 'http://localhost:3001';

  private static async makeRequest(endpoint: string, options: RequestInit = {}) {
    const token = localStorage.getItem('accessToken');
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(`${this.API_BASE_URL}${endpoint}`, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      return data;
    } catch (error: any) {
      console.error(`Secure API Error [${endpoint}]:`, error);
      throw error;
    }
  }

  // Test de connectivité avec votre backend
  static async testConnection(): Promise<boolean> {
    try {
      await this.makeRequest('/api/health');
      return true;
    } catch (error) {
      console.error('Backend connection failed:', error);
      return false;
    }
  }

  // Login sécurisé (alternative à votre login existant)
  static async secureLogin(email: string, password: string, mfaToken?: string) {
    return this.makeRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, mfaToken }),
    });
  }

  // Configuration 2FA
  static async enable2FA() {
    return this.makeRequest('/api/auth/enable-2fa', {
      method: 'POST',
    });
  }

  // Vérification 2FA
  static async verify2FA(token: string) {
    return this.makeRequest('/api/auth/verify-2fa', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  // Récupération des utilisateurs (pour admin)
  static async getUsers() {
    return this.makeRequest('/api/users');
  }

  // Création d'utilisateur (pour admin)
  static async createUser(userData: any) {
    return this.makeRequest('/api/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  // Logs d'audit
  static async getAuditLogs(filters: Record<string, string | undefined> = {}) {
    const params = new URLSearchParams();
    
    // Filtrer et ajouter seulement les valeurs non vides
    Object.entries(filters).forEach(([key, value]) => {
      if (value && typeof value === 'string' && value.trim() !== '') {
        params.append(key, value);
      }
    });
    
    return this.makeRequest(`/api/audit?${params}`);
  }

  // Migration vers système sécurisé
  static async checkMigrationStatus() {
    try {
      return await this.makeRequest('/api/migration/stats');
    } catch (error) {
      return null;
    }
  }
}

export default SecureAuthService;