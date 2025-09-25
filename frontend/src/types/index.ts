// ===================================
// TYPES PRINCIPAUX DU FRONTEND
// ===================================

// ============ UTILISATEUR ============
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login?: string;
  preferences?: UserPreferences;
}

export type UserRole = 'admin' | 'actuaire' | 'analyste' | 'auditeur' | 'viewer';

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  language: 'fr' | 'en' | 'de' | 'es';
  defaultTriangleView: 'table' | 'heatmap';
  defaultCalculationMethod: CalculationMethod;
  notifications: {
    email: boolean;
    browser: boolean;
    calculation_complete: boolean;
    data_imported: boolean;
    audit_alerts: boolean;
  };
}

// ============ AUTHENTIFICATION ============
export interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
  remember_me?: boolean;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
  role: UserRole;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

// ============ TRIANGLES ============
export interface Triangle {
  id: string;
  name: string;
  type: TriangleType;
  branch: InsuranceBranch;
  currency: string;
  data: number[][];
  metadata: TriangleMetadata;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_validated: boolean;
  validation_errors?: string[];
}

export type TriangleType = 
  | 'cumulative_claims' 
  | 'incremental_claims' 
  | 'cumulative_payments' 
  | 'incremental_payments'
  | 'case_reserves'
  | 'claim_counts';

export type InsuranceBranch = 
  | 'auto_liability'
  | 'auto_physical_damage'
  | 'property'
  | 'general_liability'
  | 'workers_compensation'
  | 'professional_liability'
  | 'marine'
  | 'aviation'
  | 'credit'
  | 'surety'
  | 'other';

export interface TriangleMetadata {
  accident_years: number[];
  development_periods: number[];
  ultimate_column?: number;
  exposure_base?: string;
  data_source?: string;
  currency_unit?: number; // 1 = units, 1000 = thousands, etc.
  reporting_basis?: 'accident_year' | 'underwriting_year' | 'calendar_year';
  data_quality_score?: number;
  last_updated_by?: string;
}

export interface TriangleStats {
  total_ultimate: number;
  total_paid: number;
  total_outstanding: number;
  average_development_ratio: number;
  coefficient_of_variation: number;
  development_periods_count: number;
}

// ============ CALCULS ACTUARIELS ============
export interface Calculation {
  id: string;
  name: string;
  triangle_id: string;
  method: CalculationMethod;
  parameters: CalculationParameters;
  results: CalculationResults | null;
  status: CalculationStatus;
  created_by: string;
  created_at: string;
  completed_at?: string;
  execution_time?: number; // in milliseconds
  error_message?: string;
}

export type CalculationMethod = 
  | 'chain_ladder'
  | 'bornhuetter_ferguson'
  | 'mack_chain_ladder'
  | 'cape_cod'
  | 'additive_method'
  | 'expected_claims_ratio'
  | 'loss_development';

export type CalculationStatus = 
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface CalculationParameters {
  method: CalculationMethod;
  tail_factor?: number;
  expected_loss_ratio?: number;
  credibility_weights?: number[];
  bootstrap_iterations?: number;
  confidence_level?: number;
  extrapolation_method?: 'exponential' | 'linear' | 'constant';
  development_limit?: number;
  custom_parameters?: Record<string, unknown>;
}

export interface CalculationResults {
  ultimates: number[];
  reserves: number[];
  development_factors: number[];
  age_to_age_factors?: number[][];
  standard_errors?: number[];
  confidence_intervals?: {
    lower: number[];
    upper: number[];
  };
  statistics: {
    total_ultimate: number;
    total_reserves: number;
    coefficient_of_variation: number;
    mean_squared_error?: number;
  };
  diagnostics?: {
    residuals: number[][];
    leverage: number[];
    standardized_residuals: number[][];
  };
}

// ============ EXPORTS & RAPPORTS ============
export interface ExportRequest {
  calculation_ids: string[];
  format: ExportFormat;
  template: ExportTemplate;
  include_charts: boolean;
  include_diagnostics: boolean;
  language: 'fr' | 'en';
}

export type ExportFormat = 'pdf' | 'excel' | 'word' | 'csv' | 'json';

export type ExportTemplate = 
  | 'ifrs17_building_blocks'
  | 'ifrs17_contractual_service_margin'
  | 'solvency2_s19_01'
  | 'solvency2_s28_01'
  | 'custom_report'
  | 'audit_report'
  | 'benchmark_report';

export interface ExportJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  file_url?: string;
  created_at: string;
  expires_at: string;
}

// ============ CONFORMITÉ ============
export interface ComplianceCheck {
  id: string;
  type: ComplianceType;
  calculation_id: string;
  status: 'passed' | 'failed' | 'warning';
  checks: ComplianceRule[];
  overall_score: number;
  performed_at: string;
}

export type ComplianceType = 'ifrs17' | 'solvency2' | 'internal_audit';

export interface ComplianceRule {
  rule_id: string;
  rule_name: string;
  status: 'passed' | 'failed' | 'warning';
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  reference?: string;
}

// ============ AUDIT ============
export interface AuditEvent {
  id: string;
  event_type: AuditEventType;
  user_id: string;
  user_name: string;
  resource_type: string;
  resource_id: string;
  action: string;
  details: Record<string, unknown>;
  timestamp: string;
  ip_address?: string;
  user_agent?: string;
}

export type AuditEventType = 
  | 'authentication'
  | 'data_access'
  | 'data_modification'
  | 'calculation'
  | 'export'
  | 'configuration'
  | 'security';

// ============ NOTIFICATIONS ============
export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  status: 'unread' | 'read';
  created_at: string;
  action_url?: string;
  metadata?: Record<string, unknown>;
}

export type NotificationType = 
  | 'calculation_complete'
  | 'calculation_failed'
  | 'data_imported'
  | 'export_ready'
  | 'compliance_alert'
  | 'security_alert'
  | 'system_maintenance';

// ============ API RESPONSES ============
export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

// Requête pour lancer un ou plusieurs calculs sur un triangle
export interface CalculationRequest {
  /** ID du triangle ciblé */
  triangleId: string;

  /**
   * Méthodes à exécuter.
   * Accepte soit les valeurs du type CalculationMethod (snake_case),
   * soit des chaînes libres si vous mappez ailleurs (ex: 'chain-ladder' → 'chain_ladder').
   */
  methods: CalculationMethod[] | string[];

  /**
   * Paramètres par méthode, ex:
   * {
   *   chain_ladder: { tailFactor: 1.0, smoothing: 'none' },
   *   mack_chain_ladder: { confidenceLevel: 0.95, iterations: 1000 }
   * }
   */
  parameters: Record<string, Record<string, unknown>>;

  /**
   * Options d’exécution (obligatoires côté appelant pour éviter les erreurs TS).
   * Laissez vide {} par défaut si vous n’avez rien à préciser.
   */
  options: {
    priority?: 'low' | 'normal' | 'high';
    async?: boolean;
    notifyOnComplete?: boolean;
    tags?: string[];
    [key: string]: unknown;
  };
}

export interface ApiError {
  message: string;
  code?: string;
  status: number;
  details?: Record<string, unknown>;
}

// ============ FORMULAIRES ============
export interface FormFieldError {
  field: string;
  message: string;
}
export interface useAuth {
  
}

export interface ValidationErrors {
  [field: string]: string[];
}

// ============ HOOKS PERSONNALISÉS ============
export interface UseApiOptions {
  enabled?: boolean;
  refetchOnWindowFocus?: boolean;
  retry?: number;
  staleTime?: number;
}

export interface UseFileUploadOptions {
  accept?: string;
  maxSize?: number; // in bytes
  multiple?: boolean;
  onProgress?: (progress: number) => void;
}

// ============ PERMISSIONS ============
export interface Permission {
  resource: string;
  action: string;
  conditions?: Record<string, unknown>;
}

export interface RolePermissions {
  role: UserRole;
  permissions: Permission[];
}

// ============ CONSTANTES ============
export const ROLES: Record<UserRole, string> = {
  admin: 'Administrateur',
  actuaire: 'Actuaire',
  analyste: 'Analyste',
  auditeur: 'Auditeur',
  viewer: 'Consultation'
};

export const TRIANGLE_TYPES: Record<TriangleType, string> = {
  cumulative_claims: 'Sinistres cumulés',
  incremental_claims: 'Sinistres incrémentaux',
  cumulative_payments: 'Paiements cumulés',
  incremental_payments: 'Paiements incrémentaux',
  case_reserves: 'Provisions dossier par dossier',
  claim_counts: 'Nombre de sinistres'
};

export const CALCULATION_METHODS: Record<CalculationMethod, string> = {
  chain_ladder: 'Chain Ladder',
  bornhuetter_ferguson: 'Bornhuetter-Ferguson',
  mack_chain_ladder: 'Mack Chain Ladder',
  cape_cod: 'Cape Cod',
  additive_method: 'Méthode Additive',
  expected_claims_ratio: 'Ratio de Sinistralité Attendu',
  loss_development: 'Développement des Sinistres'
};