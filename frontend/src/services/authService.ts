// frontend/src/services/authService.ts
// Adaptateur entre AuthContext et mockAuthService

import mockAuthService from 'services/mockAuthService';
import type {
  User,
  LoginCredentials,
  RegisterData,
  TokenResponse,
  UserPreferences,
  UserRole,
} from 'types';

// ==================== Events ====================
type Listener = (payload?: any) => void;

class SimpleEventManager {
  private listeners = new Map<string, Set<Listener>>();

  on(event: string, cb: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
  }
  off(event: string, cb: Listener) {
    this.listeners.get(event)?.delete(cb);
  }
  emit(event: string, payload?: any) {
    this.listeners.get(event)?.forEach((cb) => cb(payload));
  }
}

export const AUTH_EVENTS = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  SESSION_EXTENDED: 'SESSION_EXTENDED',
  LOGOUT: 'LOGOUT',
} as const;

export const AuthEventManager = new SimpleEventManager();

// ==================== Storage helper ====================
// Clé identique au mock pour modifier les préférences
const STORAGE_KEY = 'provtech_auth';
type MockStoredAuth = {
  access_token: string;
  refresh_token: string;
  user: any;
  expires_in: number;
};

const readStoredAuth = (): MockStoredAuth | null => {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as MockStoredAuth) : null;
};

const writeStoredAuth = (auth: MockStoredAuth) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
};

// ==================== Mapping User ====================
const mapMockUserToUser = (mockUser: any): User => {
  const nowIso = new Date().toISOString();
  const name =
    [mockUser?.firstName, mockUser?.lastName].filter(Boolean).join(' ').trim() ||
    mockUser?.email ||
    'Utilisateur';

  const role: UserRole = (mockUser?.role as UserRole) || 'viewer';

  return {
    id: String(mockUser?.id ?? ''),
    email: String(mockUser?.email ?? ''),
    name,
    role,
    is_active: true,
    created_at: mockUser?.created_at || nowIso,
    updated_at: mockUser?.updated_at || nowIso,
    last_login: nowIso,
    preferences: mockUser?.preferences ?? {
      theme: 'light',
      language: 'fr',
      defaultTriangleView: 'table',
      defaultCalculationMethod: 'chain_ladder',
      notifications: {
        email: true,
        browser: true,
        calculation_complete: true,
        data_imported: true,
        audit_alerts: true,
      },
    },
  };
};

// ==================== Permissions par rôle ====================
const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: ['*:*'],
  actuaire: [
    'triangles:read',
    'triangles:write',
    'calculations:execute',
    'calculations:read',
    'reports:generate',
  ],
  analyste: ['triangles:read', 'calculations:read', 'reports:read'],
  auditeur: ['triangles:read', 'reports:read'],
  viewer: ['triangles:read'],
};

const matchPermission = (granted: string[], resource: string, action: string) => {
  return (
    granted.includes('*:*') ||
    granted.includes(`${resource}:*`) ||
    granted.includes(`*:${action}`) ||
    granted.includes(`${resource}:${action}`)
  );
};

// ==================== Service exposé ====================
const AuthService = {
  hasValidToken(): boolean {
    return !!mockAuthService.getAccessToken();
  },

  getToken(): string | null {
    return mockAuthService.getAccessToken();
  },

  getRefreshToken(): string | null {
    const stored = readStoredAuth();
    return stored?.refresh_token ?? null;
  },

  async getCurrentUser(): Promise<User | null> {
    const mockUser = mockAuthService.getCurrentUser();
    return mockUser ? mapMockUserToUser(mockUser) : null;
  },

  async login(credentials: LoginCredentials): Promise<{ user: User; tokens: TokenResponse }> {
    const res = await mockAuthService.login(credentials);
    const user = mapMockUserToUser(res.user);
    const tokens: TokenResponse = {
      access_token: res.access_token,
      refresh_token: res.refresh_token,
      token_type: 'Bearer',
      expires_in: res.expires_in,
    };
    return { user, tokens };
  },

  async register(data: RegisterData): Promise<{ user: User; tokens: TokenResponse }> {
    const [firstName, ...rest] = (data.name || '').trim().split(/\s+/);
    const lastName = rest.join(' ');
    const company = 'ProvTech Demo';

    const res = await (mockAuthService as any).register({
      email: data.email,
      password: data.password,
      firstName: firstName || 'Utilisateur',
      lastName: lastName || '',
      company,
    });

    const user = mapMockUserToUser({ ...res.user, role: data.role ?? res.user.role });

    // Mettre à jour le rôle dans le storage mock si besoin
    const stored = readStoredAuth();
    if (stored) {
      writeStoredAuth({ ...stored, user: { ...stored.user, role: user.role } });
    }

    const tokens: TokenResponse = {
      access_token: res.access_token,
      refresh_token: res.refresh_token,
      token_type: 'Bearer',
      expires_in: res.expires_in,
    };
    return { user, tokens };
  },

  async logout(): Promise<void> {
    await mockAuthService.logout();
  },

  async updateUserPreferences(
    userId: string,
    preferences: Partial<UserPreferences>
  ): Promise<UserPreferences> {
    const stored = readStoredAuth();
    if (!stored || !stored.user) {
      throw new Error('Aucune session active');
    }
    const current = stored.user.preferences ?? {};
    const updated = {
      ...current,
      ...preferences,
      notifications: {
        ...(current.notifications ?? {}),
        ...(preferences.notifications ?? {}),
      },
    };
    writeStoredAuth({ ...stored, user: { ...stored.user, preferences: updated } });
    return updated as UserPreferences;
  },

  canAccessResource(role: UserRole, resource: string, action: string): boolean {
    const perms = ROLE_PERMISSIONS[role] ?? [];
    return matchPermission(perms, resource, action);
  },

  // (Optionnel) rafraîchir la session via le mock
  async refreshSession(): Promise<{ user: User; tokens: TokenResponse }> {
    const refresh = this.getRefreshToken();
    if (!refresh) throw new Error('Aucun refresh token');

    const res = await (mockAuthService as any).refreshToken(refresh);
    const user = mapMockUserToUser(res.user);
    const tokens: TokenResponse = {
      access_token: res.access_token,
      refresh_token: res.refresh_token,
      token_type: 'Bearer',
      expires_in: res.expires_in,
    };
    return { user, tokens };
  },
};

export default AuthService;
