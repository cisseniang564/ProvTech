// ===================================
// CONTEXT D'AUTHENTIFICATION HYBRIDE - VERSION COMPLÈTE
// Fichier: /Users/cisseniang/Documents/ProvTech/frontend/src/context/AuthContext.tsx
// ===================================

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  ReactNode,
  useCallback,
} from 'react';
import toast from 'react-hot-toast';
import {
  User,
  AuthState,
  LoginCredentials,
  RegisterData,
  UserPreferences,
  UserRole,
} from 'types';
import AuthService, { AuthEventManager, AUTH_EVENTS } from 'services/authService';

// ============ TYPES COMPATIBLES AVEC VOTRE STRUCTURE ============
export interface SecureUserExtensions {
  mfaEnabled?: boolean;
  migratedToSecure?: boolean;
  department?: string;
  permissions?: string[];
  restrictions?: {
    portfolios?: string[];
    branches?: string[];
    validationLevel?: number;
  };
}

// Intersection type pour éviter les conflits
export type HybridUser = User & SecureUserExtensions;

// Valeurs par défaut pour UserPreferences
const defaultUserPreferences: UserPreferences = {
  theme: 'light' as any, // Adaptez selon votre enum
  language: 'fr' as any, // Adaptez selon votre enum
  defaultTriangleView: 'table' as any, // Adaptez selon votre enum
  defaultCalculationMethod: 'chainLadder' as any, // Adaptez selon votre enum
  notifications: {
    email: true,
    browser: true,
    calculation_complete: true,
    data_imported: true,
    audit_alerts: false
  }
};

// État hybride compatible
export interface HybridAuthState {
  user: HybridUser | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  authMode: 'legacy' | 'secure' | null;
  migrationAvailable: boolean;
}

export interface AuthContextType extends HybridAuthState {
  login: (credentials: LoginCredentials, mfaToken?: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: Partial<HybridUser>) => void;
  updatePreferences: (preferences: Partial<UserPreferences>) => Promise<void>;
  refreshUser: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  canAccess: (resource: string, action: string) => boolean;
  
  // Fonctions hybrides existantes
  migrateToSecure: (currentPassword: string) => Promise<boolean>;
  setup2FA: () => Promise<{ qrCode: string; secret: string }>;
  verify2FA: (token: string) => Promise<boolean>;
  getMigrationStatus: () => Promise<any>;
  dismissMigrationPrompt: () => void;
  
  // NOUVELLES MÉTHODES AJOUTÉES
  enableTwoFA: () => Promise<{ qrCodeUrl: string; secret: string; manualEntryKey: string }>;
  verifyTwoFA: (token: string) => Promise<{ success: boolean; backupCodes?: string[] }>;
  getUsers: () => Promise<{ users: any[] }>;
  createUser: (userData: any) => Promise<{ success: boolean; user?: any; message?: string }>;
  getAuditLogs: (limit?: number) => Promise<{ logs: any[] }>;
  getMigrationStats: () => Promise<{ stats: any }>;
  startMigration: (dryRun?: boolean) => Promise<{ success: boolean; jobId?: string; message?: string }>;
  isAdmin: () => boolean;
  handleLoginSuccess: (authData: any) => void;
}

// ============ ACTIONS CORRIGÉES ============
type AuthAction =
  | { type: 'LOGIN_START' }
  | { type: 'LOGIN_SUCCESS'; payload: { user: HybridUser; token: string; refreshToken: string; authMode: 'legacy' | 'secure'; migrationAvailable: boolean } }
  | { type: 'LOGIN_FAILURE'; payload: string }
  | { type: 'MFA_REQUIRED' }
  | { type: 'LOGOUT' }
  | { type: 'UPDATE_USER'; payload: Partial<HybridUser> }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'REFRESH_TOKEN'; payload: { token: string; refreshToken?: string } }
  | { type: 'SESSION_EXPIRED' }
  | { type: 'SET_AUTH_MODE'; payload: { authMode: 'legacy' | 'secure'; migrationAvailable: boolean } }
  | { type: 'MIGRATION_SUCCESS' };

// ============ ÉTAT INITIAL ============
const initialState: HybridAuthState = {
  user: null,
  token: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  authMode: null,
  migrationAvailable: false,
};

// ============ REDUCER ============
const authReducer = (state: HybridAuthState, action: AuthAction): HybridAuthState => {
  switch (action.type) {
    case 'LOGIN_START':
      return { ...state, isLoading: true, error: null };

    case 'LOGIN_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        refreshToken: action.payload.refreshToken,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        authMode: action.payload.authMode,
        migrationAvailable: action.payload.migrationAvailable,
      };

    case 'MFA_REQUIRED':
      return {
        ...state,
        isLoading: false,
        error: null,
      };

    case 'LOGIN_FAILURE':
      return {
        ...state,
        user: null,
        token: null,
        refreshToken: null,
        isAuthenticated: false,
        isLoading: false,
        error: action.payload,
        authMode: null,
        migrationAvailable: false,
      };

    case 'LOGOUT':
    case 'SESSION_EXPIRED':
      return { ...initialState, isLoading: false };

    case 'UPDATE_USER':
      return { ...state, user: state.user ? { ...state.user, ...action.payload } : null };

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'CLEAR_ERROR':
      return { ...state, error: null };

    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };

    case 'REFRESH_TOKEN':
      return {
        ...state,
        token: action.payload.token,
        refreshToken: action.payload.refreshToken || state.refreshToken,
      };

    case 'SET_AUTH_MODE':
      return {
        ...state,
        authMode: action.payload.authMode,
        migrationAvailable: action.payload.migrationAvailable,
      };

    case 'MIGRATION_SUCCESS':
      return {
        ...state,
        authMode: 'secure',
        migrationAvailable: false,
      };

    default:
      return state;
  }
};

// ============ MAPPING ROLE STRING -> UserRole ============
const mapStringToUserRole = (roleString: string): UserRole => {
  const roleMap: Record<string, string> = {
    'ADMIN': 'admin',
    'ACTUAIRE_SENIOR': 'actuaire', 
    'ACTUAIRE_JUNIOR': 'actuaire',
    'ACTUAIRE': 'actuaire',
    'VALIDATEUR': 'validateur',
    'AUDITEUR': 'auditeur',
    'CONSULTANT_EXTERNE': 'consultant'
  };
  
  return (roleMap[roleString] || 'actuaire') as UserRole;
};

// ============ SERVICE API HYBRIDE ÉTENDU ============
class HybridAuthService {
  private static API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

  static async login(credentials: LoginCredentials, mfaToken?: string) {
    try {
      const response = await fetch(`${this.API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: credentials.email, 
          password: credentials.password, 
          mfaToken 
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        // Créer un HybridUser avec toutes les propriétés requises
        const hybridUser: HybridUser = {
          id: data.user.id,
          email: data.user.email,
          name: `${data.user.first_name || data.user.firstName || ''} ${data.user.last_name || data.user.lastName || ''}`.trim() || data.user.email,
          role: mapStringToUserRole(data.user.role),
          preferences: defaultUserPreferences,
          is_active: data.user.is_active ?? true,
          created_at: data.user.created_at || new Date().toISOString(),
          updated_at: data.user.updated_at || new Date().toISOString(),
          // Extensions sécurisées
          mfaEnabled: data.user.has_2fa || data.user.mfaEnabled || false,
          migratedToSecure: data.user.is_migrated || data.user.migratedToSecure || false,
          department: data.user.department,
          permissions: data.user.permissions || [],
          restrictions: data.user.restrictions || {}
        };

        const authMode: 'legacy' | 'secure' = (data.user.is_migrated || data.user.migratedToSecure) ? 'secure' : 'legacy';
        
        return {
          success: true,
          user: hybridUser,
          tokens: {
            access_token: data.tokens?.accessToken || data.accessToken,
            refresh_token: data.tokens?.refreshToken || data.refreshToken
          },
          authMode,
          migrationAvailable: !(data.user.is_migrated || data.user.migratedToSecure),
          mfaRequired: false
        };
      } else if (data.mfaRequired) {
        return {
          success: false,
          mfaRequired: true,
          message: data.message
        };
      } else {
        throw new Error(data.message || data.error || 'Erreur de connexion');
      }
    } catch (error) {
      throw error;
    }
  }

  static async verifyCurrentToken() {
    const token = localStorage.getItem('provtech_access_token') || localStorage.getItem('token') || localStorage.getItem('accessToken');
    if (!token) return null;

    try {
      const response = await fetch(`${this.API_BASE_URL}/api/users`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        const userInfo = data.user || data;
        
        const hybridUser: HybridUser = {
          id: userInfo.id,
          email: userInfo.email,
          name: `${userInfo.first_name || userInfo.firstName || ''} ${userInfo.last_name || userInfo.lastName || ''}`.trim() || userInfo.email,
          role: mapStringToUserRole(userInfo.role || 'ACTUAIRE'),
          preferences: defaultUserPreferences,
          is_active: true,
          created_at: userInfo.created_at || new Date().toISOString(),
          updated_at: userInfo.updated_at || new Date().toISOString(),
          mfaEnabled: userInfo.has_2fa || userInfo.mfaEnabled || false,
          migratedToSecure: userInfo.is_migrated || userInfo.migratedToSecure || false,
          department: userInfo.department,
          permissions: userInfo.permissions || []
        };
        
        const authMode: 'legacy' | 'secure' = (userInfo.is_migrated || userInfo.migratedToSecure) ? 'secure' : 'legacy';
        const migrationAvailable = !(userInfo.is_migrated || userInfo.migratedToSecure);
        
        return {
          user: hybridUser,
          authMode,
          migrationAvailable
        };
      }
      return null;
    } catch (error) {
      console.error('Token verification failed:', error);
      return null;
    }
  }

  static async migrateToSecure(currentPassword: string) {
    const token = localStorage.getItem('provtech_access_token') || localStorage.getItem('token') || localStorage.getItem('accessToken');
    const response = await fetch(`${this.API_BASE_URL}/api/migration/upgrade-user`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ currentPassword })
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || data.error);
    return data;
  }

  static async setup2FA() {
    const token = localStorage.getItem('provtech_access_token') || localStorage.getItem('token') || localStorage.getItem('accessToken');
    const response = await fetch(`${this.API_BASE_URL}/api/auth/setup-2fa`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || data.error);
    return data;
  }

  static async verify2FA(verificationToken: string) {
    const token = localStorage.getItem('provtech_access_token') || localStorage.getItem('token') || localStorage.getItem('accessToken');
    const response = await fetch(`${this.API_BASE_URL}/api/auth/verify-2fa`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token: verificationToken })
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || data.error);
    return data;
  }

  // ============ NOUVELLES MÉTHODES AJOUTÉES ============
  
  static async enableTwoFA() {
    const token = localStorage.getItem('provtech_access_token') || localStorage.getItem('token') || localStorage.getItem('accessToken');
    const response = await fetch(`${this.API_BASE_URL}/api/auth/enable-2fa`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Erreur activation 2FA');
    return data;
  }

  static async verifyTwoFA(verificationToken: string) {
    const token = localStorage.getItem('provtech_access_token') || localStorage.getItem('token') || localStorage.getItem('accessToken');
    const response = await fetch(`${this.API_BASE_URL}/api/auth/verify-2fa`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token: verificationToken })
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Code incorrect');
    return data;
  }

  static async getUsers() {
    const token = localStorage.getItem('provtech_access_token') || localStorage.getItem('token') || localStorage.getItem('accessToken');
    const response = await fetch(`${this.API_BASE_URL}/api/users`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Erreur chargement utilisateurs');
    return data;
  }

  static async createUser(userData: any) {
    const token = localStorage.getItem('provtech_access_token') || localStorage.getItem('token') || localStorage.getItem('accessToken');
    const response = await fetch(`${this.API_BASE_URL}/api/users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role
      })
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Erreur création utilisateur');
    return data;
  }

  static async getAuditLogs(limit = 50) {
    const token = localStorage.getItem('provtech_access_token') || localStorage.getItem('token') || localStorage.getItem('accessToken');
    const response = await fetch(`${this.API_BASE_URL}/api/audit?limit=${limit}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Erreur chargement audit');
    return data;
  }

  static async getMigrationStats() {
    const token = localStorage.getItem('provtech_access_token') || localStorage.getItem('token') || localStorage.getItem('accessToken');
    const response = await fetch(`${this.API_BASE_URL}/api/migration/stats`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Erreur stats migration');
    return data;
  }

  static async startMigration(dryRun = false) {
    const token = localStorage.getItem('provtech_access_token') || localStorage.getItem('token') || localStorage.getItem('accessToken');
    const response = await fetch(`${this.API_BASE_URL}/api/migration/start`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ dryRun })
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Erreur démarrage migration');
    return data;
  }
}

// ============ CONTEXT ============
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ============ PROVIDER ============
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // ============ FONCTION UTILITAIRE CONVERSION ============
  const convertToHybridUser = (user: User): HybridUser => {
    return {
      ...user,
      mfaEnabled: false,
      migratedToSecure: false,
      department: undefined,
      permissions: [],
      restrictions: {}
    };
  };

  // ============ INITIALISATION HYBRIDE ============
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Essayer le système hybride d'abord
        const hybridAuth = await HybridAuthService.verifyCurrentToken();
        if (hybridAuth) {
          const token = localStorage.getItem('provtech_access_token') || localStorage.getItem('token') || localStorage.getItem('accessToken') || '';
          const refreshToken = localStorage.getItem('provtech_refresh_token') || localStorage.getItem('refreshToken') || '';
          
          dispatch({
            type: 'LOGIN_SUCCESS',
            payload: {
              user: hybridAuth.user,
              token,
              refreshToken,
              authMode: hybridAuth.authMode,
              migrationAvailable: hybridAuth.migrationAvailable
            },
          });
          AuthEventManager.emit(AUTH_EVENTS.LOGIN_SUCCESS, hybridAuth.user);
          return;
        }

        // Fallback vers l'ancien système
        if (AuthService.hasValidToken()) {
          const user = await AuthService.getCurrentUser();
          const token = AuthService.getToken();
          const refresh = AuthService.getRefreshToken();

          if (user && token) {
            const hybridUser = convertToHybridUser(user);

            dispatch({
              type: 'LOGIN_SUCCESS',
              payload: {
                user: hybridUser,
                token,
                refreshToken: refresh || '',
                authMode: 'legacy',
                migrationAvailable: true
              },
            });

            AuthEventManager.emit(AUTH_EVENTS.LOGIN_SUCCESS, user);
            return;
          }
        }
      } catch (error) {
        console.error('Auth initialization failed:', error);
        await AuthService.logout();
      }
      dispatch({ type: 'SET_LOADING', payload: false });
    };

    initializeAuth();
  }, []);

  // ============ ÉCOUTE DES ÉVÉNEMENTS (conservée) ============
  useEffect(() => {
    const handleTokenExpired = () => {
      dispatch({ type: 'SESSION_EXPIRED' });
      toast.error('Votre session a expiré. Veuillez vous reconnecter.');
    };

    const handleSessionExtended = (data: any) => {
      if (data?.token) {
        dispatch({
          type: 'REFRESH_TOKEN',
          payload: { token: data.token, refreshToken: data.refreshToken },
        });
      }
    };

    AuthEventManager.on(AUTH_EVENTS.TOKEN_EXPIRED, handleTokenExpired);
    AuthEventManager.on(AUTH_EVENTS.SESSION_EXTENDED, handleSessionExtended);

    return () => {
      AuthEventManager.off(AUTH_EVENTS.TOKEN_EXPIRED, handleTokenExpired);
      AuthEventManager.off(AUTH_EVENTS.SESSION_EXTENDED, handleSessionExtended);
    };
  }, []);

  // ============ LOGIN HYBRIDE ============
  const login = useCallback(async (credentials: LoginCredentials, mfaToken?: string) => {
    try {
      dispatch({ type: 'LOGIN_START' });
      
      // Essayer le système hybride
      try {
        const result = await HybridAuthService.login(credentials, mfaToken);
        
        if (result.success) {
          localStorage.setItem('provtech_access_token', result.tokens.access_token);
          localStorage.setItem('provtech_refresh_token', result.tokens.refresh_token);
          localStorage.setItem('token', result.tokens.access_token);
          localStorage.setItem('refreshToken', result.tokens.refresh_token);

          dispatch({
            type: 'LOGIN_SUCCESS',
            payload: {
              user: result.user,
              token: result.tokens.access_token,
              refreshToken: result.tokens.refresh_token,
              authMode: result.authMode,
              migrationAvailable: result.migrationAvailable
            },
          });

          AuthEventManager.emit(AUTH_EVENTS.LOGIN_SUCCESS, result.user);
          toast.success(`Bienvenue, ${result.user.name}!`);
          return;
          
        } else if (result.mfaRequired) {
          dispatch({ type: 'MFA_REQUIRED' });
          return;
        }
      } catch (hybridError) {
        console.error('Hybrid auth failed, trying legacy:', hybridError);
      }
      
      // Fallback vers l'ancien système
      const { user, tokens } = await AuthService.login(credentials);
      const hybridUser = convertToHybridUser(user);
      
      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: {
          user: hybridUser,
          token: tokens.access_token,
          refreshToken: tokens.refresh_token,
          authMode: 'legacy',
          migrationAvailable: true
        },
      });

      AuthEventManager.emit(AUTH_EVENTS.LOGIN_SUCCESS, user);
      toast.success(`Bienvenue, ${user.name}!`);
        
    } catch (error: any) {
      const errorMessage = error?.message || 'Échec de la connexion';
      dispatch({ type: 'LOGIN_FAILURE', payload: errorMessage });
      AuthEventManager.emit(AUTH_EVENTS.LOGIN_FAILED, error);
      throw error;
    }
  }, []);

  // ============ AUTRES FONCTIONS (conservées) ============
  const register = useCallback(async (data: RegisterData) => {
    try {
      dispatch({ type: 'LOGIN_START' });
      const { user, tokens } = await AuthService.register(data);
      const hybridUser = convertToHybridUser(user);

      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: {
          user: hybridUser,
          token: tokens.access_token,
          refreshToken: tokens.refresh_token,
          authMode: 'legacy',
          migrationAvailable: true
        },
      });

      AuthEventManager.emit(AUTH_EVENTS.LOGIN_SUCCESS, user);
      toast.success(`Compte créé avec succès ! Bienvenue, ${user.name}!`);
    } catch (error: any) {
      const errorMessage = error?.message || "Échec de l'inscription";
      dispatch({ type: 'LOGIN_FAILURE', payload: errorMessage });
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await AuthService.logout();
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      // Nettoyer tous les tokens
      localStorage.removeItem('provtech_access_token');
      localStorage.removeItem('provtech_refresh_token');
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('accessToken');
      
      dispatch({ type: 'LOGOUT' });
      AuthEventManager.emit(AUTH_EVENTS.LOGOUT);
      toast.success('Déconnexion réussie');
    }
  }, []);

  const updateUser = useCallback((userData: Partial<HybridUser>) => {
    dispatch({ type: 'UPDATE_USER', payload: userData });
  }, []);

  const updatePreferences = useCallback(
    async (preferences: Partial<UserPreferences>) => {
      if (!state.user) throw new Error('Utilisateur non connecté');

      try {
        const updatedPreferences = await AuthService.updateUserPreferences(
          state.user.id,
          preferences
        );
        updateUser({ preferences: updatedPreferences });
        toast.success('Préférences mises à jour');
      } catch (error) {
        console.error('Failed to update preferences:', error);
        toast.error('Échec de la mise à jour des préférences');
        throw error;
      }
    },
    [state.user, updateUser]
  );

  const refreshUser = useCallback(async () => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      
      const hybridAuth = await HybridAuthService.verifyCurrentToken();
      if (hybridAuth) {
        updateUser(hybridAuth.user);
        dispatch({
          type: 'SET_AUTH_MODE',
          payload: {
            authMode: hybridAuth.authMode,
            migrationAvailable: hybridAuth.migrationAvailable
          }
        });
      } else {
        const user = await AuthService.getCurrentUser();
        if (user) {
          const hybridUser = convertToHybridUser(user);
          updateUser(hybridUser);
        }
      }
    } catch (error) {
      console.error('Failed to refresh user:', error);
      dispatch({
        type: 'SET_ERROR',
        payload: 'Impossible de rafraîchir les données utilisateur',
      });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [updateUser]);

  // ============ PERMISSIONS HYBRIDES ============
  const hasPermission = useCallback(
    (permission: string): boolean => {
      if (!state.user) return false;
      if (state.user.role === 'admin') return true;

      // Système sécurisé : permissions granulaires
      if (state.authMode === 'secure' && state.user.permissions) {
        return state.user.permissions.includes(permission);
      }

      // Système legacy : utiliser AuthService
      const [resource, action] = permission.split(':');
      return AuthService.canAccessResource(state.user.role, resource, action);
    },
    [state.user, state.authMode]
  );

  const canAccess = useCallback(
    (resource: string, action: string): boolean => {
      if (!state.user) return false;
      return hasPermission(`${resource}:${action}`);
    },
    [hasPermission]
  );

  // ============ FONCTIONS HYBRIDES EXISTANTES ============
  const migrateToSecure = useCallback(async (currentPassword: string): Promise<boolean> => {
    try {
      await HybridAuthService.migrateToSecure(currentPassword);
      dispatch({ type: 'MIGRATION_SUCCESS' });
      await refreshUser();
      toast.success('Migration vers le système sécurisé réussie !');
      return true;
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la migration');
      return false;
    }
  }, [refreshUser]);

  const setup2FA = useCallback(async () => {
    try {
      return await HybridAuthService.setup2FA();
    } catch (error: any) {
      toast.error(error.message || 'Erreur configuration 2FA');
      throw error;
    }
  }, []);

  const verify2FA = useCallback(async (verificationToken: string): Promise<boolean> => {
    try {
      await HybridAuthService.verify2FA(verificationToken);
      await refreshUser();
      toast.success('2FA activé avec succès !');
      return true;
    } catch (error: any) {
      toast.error(error.message || 'Erreur vérification 2FA');
      return false;
    }
  }, [refreshUser]);

  const getMigrationStatus = useCallback(async () => {
    try {
      return await HybridAuthService.verifyCurrentToken();
    } catch (error: any) {
      toast.error(error.message || 'Erreur statut migration');
      throw error;
    }
  }, []);

  const dismissMigrationPrompt = useCallback(() => {
    sessionStorage.setItem('migration_prompt_dismissed', 'true');
  }, []);

  // ============ NOUVELLES MÉTHODES AJOUTÉES ============
  
  const enableTwoFA = useCallback(async () => {
    try {
      const result = await HybridAuthService.enableTwoFA();
      return {
        qrCodeUrl: result.qrCodeUrl,
        secret: result.secret,
        manualEntryKey: result.manualEntryKey
      };
    } catch (error: any) {
      toast.error(error.message || 'Erreur activation 2FA');
      throw error;
    }
  }, []);

  const verifyTwoFA = useCallback(async (verificationToken: string) => {
    try {
      const result = await HybridAuthService.verifyTwoFA(verificationToken);
      await refreshUser();
      toast.success('2FA activé avec succès !');
      return {
        success: true,
        backupCodes: result.backupCodes || []
      };
    } catch (error: any) {
      toast.error(error.message || 'Erreur vérification 2FA');
      return { success: false };
    }
  }, [refreshUser]);

  const getUsers = useCallback(async () => {
    try {
      return await HybridAuthService.getUsers();
    } catch (error: any) {
      toast.error(error.message || 'Erreur chargement utilisateurs');
      throw error;
    }
  }, []);

  const createUser = useCallback(async (userData: any) => {
    try {
      const result = await HybridAuthService.createUser(userData);
      toast.success('Utilisateur créé avec succès');
      return { success: true, user: result.user };
    } catch (error: any) {
      const message = error.message || 'Erreur création utilisateur';
      toast.error(message);
      return { success: false, message };
    }
  }, []);

  const getAuditLogs = useCallback(async (limit = 50) => {
    try {
      return await HybridAuthService.getAuditLogs(limit);
    } catch (error: any) {
      toast.error(error.message || 'Erreur chargement logs');
      throw error;
    }
  }, []);

  const getMigrationStats = useCallback(async () => {
    try {
      return await HybridAuthService.getMigrationStats();
    } catch (error: any) {
      toast.error(error.message || 'Erreur stats migration');
      throw error;
    }
  }, []);

  const startMigration = useCallback(async (dryRun = false) => {
    try {
      const result = await HybridAuthService.startMigration(dryRun);
      toast.success('Migration démarrée');
      return { success: true, jobId: result.jobId };
    } catch (error: any) {
      const message = error.message || 'Erreur démarrage migration';
      toast.error(message);
      return { success: false, message };
    }
  }, []);

  const isAdmin = useCallback((): boolean => {
    if (!state.user) return false;
    
    // Vérifier le rôle sous forme de string (pour le système hybride)
    const roleString = state.user.role as string;
    if (typeof roleString === 'string') {
      const upperRole = roleString.toUpperCase();
      return upperRole === 'ADMIN' || upperRole === 'ADMINISTRATOR';
    }
    
    // Fallback pour les types UserRole existants si nécessaire
    return false;
  }, [state.user]);

  const handleLoginSuccess = useCallback((authData: any) => {
    console.log('Login success callback:', authData);
  }, []);

  // ============ GESTION INACTIVITÉ (conservée) ============
  useEffect(() => {
    if (state.error) {
      const timer = setTimeout(() => {
        dispatch({ type: 'CLEAR_ERROR' });
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [state.error]);

  useEffect(() => {
    let inactivityTimer: ReturnType<typeof setTimeout>;
    const INACTIVITY_TIMEOUT = 30 * 60 * 1000;

    const resetInactivityTimer = () => {
      clearTimeout(inactivityTimer);
      if (state.isAuthenticated) {
        inactivityTimer = setTimeout(() => {
          toast.error("Session expirée due à l'inactivité");
          logout();
        }, INACTIVITY_TIMEOUT);
      }
    };

    if (state.isAuthenticated) {
      const events = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const;
      events.forEach((ev) =>
        document.addEventListener(ev, resetInactivityTimer, true)
      );
      resetInactivityTimer();

      return () => {
        clearTimeout(inactivityTimer);
        events.forEach((ev) =>
          document.removeEventListener(ev, resetInactivityTimer, true)
        );
      };
    }
  }, [state.isAuthenticated, logout]);

  // ============ VALEUR DU CONTEXT ============
  const contextValue: AuthContextType = {
    ...state,
    login,
    register,
    logout,
    updateUser,
    updatePreferences,
    refreshUser,
    hasPermission,
    canAccess,
    migrateToSecure,
    setup2FA,
    verify2FA,
    getMigrationStatus,
    dismissMigrationPrompt,
    // NOUVELLES MÉTHODES
    enableTwoFA,
    verifyTwoFA,
    getUsers,
    createUser,
    getAuditLogs,
    getMigrationStats,
    startMigration,
    isAdmin,
    handleLoginSuccess,
  };

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

// ============ HOOK (conservé) ============
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth doit être utilisé à l'intérieur d'un AuthProvider");
  }
  return context;
};

// HOC et RouteGuard conservés exactement tels quels de votre version originale...
export const withAuth = <P extends object>(
  Component: React.ComponentType<P>,
  options: { requiredPermission?: string; requiredRole?: string; fallback?: ReactNode } = {}
) => {
  const AuthenticatedComponent = (props: P): React.ReactElement => {
    const { isAuthenticated, isLoading, user, hasPermission } = useAuth();

    if (isLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500" />
        </div>
      );
    }

    if (!isAuthenticated) {
      return options.fallback ? <>{options.fallback}</> : <div>Accès refusé</div>;
    }

    if (options.requiredPermission && !hasPermission(options.requiredPermission)) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-gray-900">Accès refusé</h2>
            <p className="text-gray-600 mt-2">
              Vous n'avez pas les permissions nécessaires pour accéder à cette page.
            </p>
          </div>
        </div>
      );
    }

    if (options.requiredRole && user?.role !== options.requiredRole) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-gray-900">Accès refusé</h2>
            <p className="text-gray-600 mt-2">
              Votre rôle ne vous permet pas d'accéder à cette page.
            </p>
          </div>
        </div>
      );
    }

    return <Component {...props} />;
  };

  AuthenticatedComponent.displayName = `withAuth(${Component.displayName || Component.name})`;
  return AuthenticatedComponent;
};

interface RouteGuardProps {
  children: ReactNode;
  requiredPermission?: string;
  requiredRole?: string;
  fallback?: ReactNode;
}

export const RouteGuard = ({
  children,
  requiredPermission,
  requiredRole,
  fallback,
}: RouteGuardProps): React.ReactElement => {
  const { isAuthenticated, isLoading, user, hasPermission } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return fallback ? <>{fallback}</> : (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900">Connexion requise</h2>
          <p className="text-gray-600 mt-2">Veuillez vous connecter pour accéder à cette page.</p>
        </div>
      </div>
    );
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return fallback ? <>{fallback}</> : (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900">Accès refusé</h2>
          <p className="text-gray-600 mt-2">Permissions insuffisantes.</p>
        </div>
      </div>
    );
  }

  if (requiredRole && user?.role !== requiredRole) {
    return fallback ? <>{fallback}</> : (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900">Accès refusé</h2>
          <p className="text-gray-600 mt-2">Rôle insuffisant.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default AuthContext;