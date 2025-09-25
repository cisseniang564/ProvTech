// 📁 Racine: frontend/src/services/
// └── mockAuthService.ts

// Service d'authentification simulé pour le développement
// À remplacer par le vrai service une fois le backend prêt

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'actuaire' | 'analyste' | 'viewer';
  permissions: string[];
  company: string;
}

interface LoginCredentials {
  email: string;
  password: string;
}

interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: User;
  expires_in: number;
}

// Utilisateurs de démonstration
const DEMO_USERS: Record<string, { password: string; user: User }> = {
  'admin@provtech.com': {
    password: 'admin123',
    user: {
      id: '1',
      email: 'admin@provtech.com',
      firstName: 'Jean',
      lastName: 'Dupont',
      role: 'admin',
      permissions: ['all'],
      company: 'ProvTech Demo'
    }
  },
  'actuaire@provtech.com': {
    password: 'actuaire123',
    user: {
      id: '2',
      email: 'actuaire@provtech.com',
      firstName: 'Marie',
      lastName: 'Dubois',
      role: 'actuaire',
      permissions: ['triangles.read', 'triangles.write', 'calculations.execute', 'reports.generate'],
      company: 'ProvTech Demo'
    }
  },
  'analyste@provtech.com': {
    password: 'analyste123',
    user: {
      id: '3',
      email: 'analyste@provtech.com',
      firstName: 'Pierre',
      lastName: 'Martin',
      role: 'analyste',
      permissions: ['triangles.read', 'calculations.read', 'reports.read'],
      company: 'ProvTech Demo'
    }
  },
  'demo@provtech.com': {
    password: 'demo123',
    user: {
      id: '4',
      email: 'demo@provtech.com',
      firstName: 'Demo',
      lastName: 'User',
      role: 'actuaire',
      permissions: ['triangles.read', 'triangles.write', 'calculations.execute', 'reports.generate'],
      company: 'ProvTech Demo'
    }
  }
};

class MockAuthService {
  private readonly STORAGE_KEY = 'provtech_auth';
  private readonly TOKEN_PREFIX = 'mock_token_';

  /**
   * Connexion simulée
   */
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    // Simuler un délai réseau
    await this.simulateDelay(1000);

    const demoUser = DEMO_USERS[credentials.email];

    // Vérifier les credentials
    if (!demoUser || demoUser.password !== credentials.password) {
      throw new Error('Email ou mot de passe incorrect');
    }

    // Générer des tokens simulés
    const access_token = this.generateMockToken('access');
    const refresh_token = this.generateMockToken('refresh');

    const response: AuthResponse = {
      access_token,
      refresh_token,
      user: demoUser.user,
      expires_in: 3600
    };

    // Sauvegarder dans localStorage
    this.saveAuth(response);

    return response;
  }

  /**
   * Déconnexion
   */
  async logout(): Promise<void> {
    await this.simulateDelay(500);
    this.clearAuth();
  }

  /**
   * Inscription simulée
   */
  async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    company: string;
  }): Promise<AuthResponse> {
    await this.simulateDelay(1500);

    // Vérifier si l'email existe déjà
    if (DEMO_USERS[data.email]) {
      throw new Error('Cet email est déjà utilisé');
    }

    // Créer un nouvel utilisateur (simulé - non persistant)
    const newUser: User = {
      id: Math.random().toString(36).substr(2, 9),
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      role: 'viewer',
      permissions: ['triangles.read'],
      company: data.company
    };

    const response: AuthResponse = {
      access_token: this.generateMockToken('access'),
      refresh_token: this.generateMockToken('refresh'),
      user: newUser,
      expires_in: 3600
    };

    this.saveAuth(response);
    return response;
  }

  /**
   * Rafraîchir le token
   */
  async refreshToken(refresh_token: string): Promise<AuthResponse> {
    await this.simulateDelay(500);

    const auth = this.getStoredAuth();
    if (!auth || auth.refresh_token !== refresh_token) {
      throw new Error('Token de rafraîchissement invalide');
    }

    // Générer de nouveaux tokens
    const response: AuthResponse = {
      ...auth,
      access_token: this.generateMockToken('access'),
      refresh_token: this.generateMockToken('refresh'),
      expires_in: 3600
    };

    this.saveAuth(response);
    return response;
  }

  /**
   * Obtenir l'utilisateur actuel
   */
  getCurrentUser(): User | null {
    const auth = this.getStoredAuth();
    return auth?.user || null;
  }

  /**
   * Obtenir le token d'accès
   */
  getAccessToken(): string | null {
    const auth = this.getStoredAuth();
    return auth?.access_token || null;
  }

  /**
   * Vérifier si l'utilisateur est connecté
   */
  isAuthenticated(): boolean {
    const auth = this.getStoredAuth();
    return !!auth?.access_token;
  }

  /**
   * Vérifier les permissions
   */
  hasPermission(permission: string): boolean {
    const user = this.getCurrentUser();
    if (!user) return false;
    
    return user.role === 'admin' || 
           user.permissions.includes('all') || 
           user.permissions.includes(permission);
  }

  /**
   * Mot de passe oublié (simulé)
   */
  async forgotPassword(email: string): Promise<{ message: string }> {
    await this.simulateDelay(1000);

    if (!DEMO_USERS[email]) {
      throw new Error('Aucun compte associé à cet email');
    }

    return {
      message: 'Un email de réinitialisation a été envoyé (simulation)'
    };
  }

  /**
   * Réinitialiser le mot de passe (simulé)
   */
  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    await this.simulateDelay(1000);

    if (!token || newPassword.length < 6) {
      throw new Error('Token invalide ou mot de passe trop court');
    }

    return {
      message: 'Mot de passe réinitialisé avec succès (simulation)'
    };
  }

  // Méthodes utilitaires privées

  private generateMockToken(type: string): string {
    return `${this.TOKEN_PREFIX}${type}_${Math.random().toString(36).substr(2, 20)}`;
  }

  private simulateDelay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private saveAuth(auth: AuthResponse): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(auth));
  }

  private getStoredAuth(): AuthResponse | null {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  }

  private clearAuth(): void {
    localStorage.removeItem(this.STORAGE_KEY);
  }
}

// Export singleton
export const mockAuthService = new MockAuthService();

// Export pour compatibilité avec le vrai service
export default mockAuthService;

// Informations de connexion pour l'interface
export const DEMO_CREDENTIALS = [
  {
    role: 'Admin',
    email: 'admin@provtech.com',
    password: 'admin123',
    description: 'Accès complet à toutes les fonctionnalités'
  },
  {
    role: 'Actuaire',
    email: 'actuaire@provtech.com',
    password: 'actuaire123',
    description: 'Gestion des triangles et calculs'
  },
  {
    role: 'Analyste',
    email: 'analyste@provtech.com',
    password: 'analyste123',
    description: 'Consultation et analyse uniquement'
  },
  {
    role: 'Demo',
    email: 'demo@provtech.com',
    password: 'demo123',
    description: 'Compte de démonstration standard'
  }
];