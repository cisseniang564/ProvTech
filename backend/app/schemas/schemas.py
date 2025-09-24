"""
Schémas Pydantic pour la validation des données
Structure complète pour le simulateur actuariel
"""

from datetime import datetime
from typing import Optional, List, Dict, Any, Union
from enum import Enum
from pydantic import BaseModel, Field, validator, EmailStr, constr, conint
import numpy as np

# ============================================================================
# ENUMS - Énumérations pour les choix standardisés
# ============================================================================

class UserRole(str, Enum):
    """Rôles utilisateur disponibles"""
    ADMIN = "admin"
    ACTUARY = "actuary"
    ANALYST = "analyst"
    VIEWER = "viewer"
    AUDITOR = "auditor"

class CalculationMethod(str, Enum):
    """Méthodes de calcul actuariel disponibles"""
    CHAIN_LADDER = "chain_ladder"
    BORNHUETTER_FERGUSON = "bornhuetter_ferguson"
    MACK = "mack"
    CAPE_COD = "cape_cod"
    MUNICH_CHAIN_LADDER = "munich_chain_ladder"
    BOOTSTRAP = "bootstrap"
    GLM = "glm"

class CalculationStatus(str, Enum):
    """Statuts possibles d'un calcul"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class TriangleType(str, Enum):
    """Types de triangles de développement"""
    PAID = "paid"
    INCURRED = "incurred"
    FREQUENCY = "frequency"
    SEVERITY = "severity"
    RBNS = "rbns"  # Reported But Not Settled
    IBNR = "ibnr"  # Incurred But Not Reported

class TailFactor(str, Enum):
    """Types de facteurs de queue"""
    NONE = "none"
    CONSTANT = "constant"
    EXPONENTIAL = "exponential"
    CURVE_FITTING = "curve_fitting"
    MANUAL = "manual"

class Currency(str, Enum):
    """Devises supportées"""
    EUR = "EUR"
    USD = "USD"
    GBP = "GBP"
    CHF = "CHF"
    CAD = "CAD"
    JPY = "JPY"

class InsuranceLine(str, Enum):
    """Branches d'assurance"""
    AUTO_LIABILITY = "auto_liability"
    AUTO_PHYSICAL = "auto_physical"
    PROPERTY = "property"
    CASUALTY = "casualty"
    WORKERS_COMP = "workers_comp"
    PROFESSIONAL_LIABILITY = "professional_liability"
    GENERAL_LIABILITY = "general_liability"
    MARINE = "marine"
    HEALTH = "health"

# ============================================================================
# SCHEMAS - USER (Utilisateurs)
# ============================================================================

class UserBase(BaseModel):
    """Base commune pour les schémas utilisateur"""
    email: EmailStr
    username: constr(min_length=3, max_length=50, regex="^[a-zA-Z0-9_-]+$")
    full_name: Optional[str] = None
    company: Optional[str] = None
    department: Optional[str] = None
    role: UserRole = UserRole.VIEWER
    is_active: bool = True

class UserCreate(UserBase):
    """Schéma pour la création d'un utilisateur"""
    password: constr(min_length=8, max_length=100)
    confirm_password: str
    
    @validator('confirm_password')
    def passwords_match(cls, v, values):
        if 'password' in values and v != values['password']:
            raise ValueError('Les mots de passe ne correspondent pas')
        return v
    
    @validator('password')
    def password_strength(cls, v):
        """Valide la force du mot de passe"""
        if not any(char.isdigit() for char in v):
            raise ValueError('Le mot de passe doit contenir au moins un chiffre')
        if not any(char.isupper() for char in v):
            raise ValueError('Le mot de passe doit contenir au moins une majuscule')
        if not any(char.islower() for char in v):
            raise ValueError('Le mot de passe doit contenir au moins une minuscule')
        if not any(char in "!@#$%^&*()_+-=[]{}|;:,.<>?" for char in v):
            raise ValueError('Le mot de passe doit contenir au moins un caractère spécial')
        return v

class UserUpdate(BaseModel):
    """Schéma pour la mise à jour d'un utilisateur"""
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    company: Optional[str] = None
    department: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None

class UserInDB(UserBase):
    """Schéma utilisateur en base de données"""
    id: int
    hashed_password: str
    created_at: datetime
    updated_at: datetime
    last_login: Optional[datetime] = None
    
    class Config:
        orm_mode = True

class UserResponse(UserBase):
    """Schéma de réponse utilisateur (sans mot de passe)"""
    id: int
    created_at: datetime
    last_login: Optional[datetime] = None
    permissions: Optional[List[str]] = []
    quota_used: Optional[int] = 0
    quota_limit: Optional[int] = 100
    
    class Config:
        orm_mode = True

# ============================================================================
# SCHEMAS - AUTHENTICATION
# ============================================================================

class Token(BaseModel):
    """Token JWT"""
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    expires_in: int = 3600

class TokenData(BaseModel):
    """Données contenues dans le token"""
    username: Optional[str] = None
    user_id: Optional[int] = None
    role: Optional[str] = None
    exp: Optional[datetime] = None

class LoginRequest(BaseModel):
    """Requête de connexion"""
    username: str
    password: str
    remember_me: bool = False

class PasswordReset(BaseModel):
    """Réinitialisation de mot de passe"""
    token: str
    new_password: constr(min_length=8, max_length=100)
    confirm_password: str
    
    @validator('confirm_password')
    def passwords_match(cls, v, values):
        if 'new_password' in values and v != values['new_password']:
            raise ValueError('Les mots de passe ne correspondent pas')
        return v

# ============================================================================
# SCHEMAS - TRIANGLE (Triangles de développement)
# ============================================================================

class TriangleBase(BaseModel):
    """Base commune pour les triangles"""
    name: constr(min_length=1, max_length=200)
    description: Optional[str] = None
    triangle_type: TriangleType
    insurance_line: Optional[InsuranceLine] = None
    currency: Currency = Currency.EUR
    unit: Optional[str] = "thousands"  # thousands, millions, units
    
class TriangleCreate(TriangleBase):
    """Création d'un triangle"""
    data: List[List[Optional[float]]]  # Matrice du triangle
    accident_years: Optional[List[int]] = None
    development_periods: Optional[List[int]] = None
    exposure: Optional[List[float]] = None  # Exposition par année
    premiums: Optional[List[float]] = None  # Primes pour BF
    
    @validator('data')
    def validate_triangle_shape(cls, v):
        """Valide la forme triangulaire des données"""
        if not v:
            raise ValueError("Les données du triangle ne peuvent pas être vides")
        
        n = len(v)
        for i, row in enumerate(v):
            expected_length = n - i
            actual_length = len([x for x in row if x is not None])
            if actual_length > expected_length:
                raise ValueError(f"Ligne {i}: trop de valeurs non-nulles")
        return v
    
    @validator('data')
    def validate_positive_values(cls, v):
        """Vérifie que les valeurs sont positives"""
        for row in v:
            for val in row:
                if val is not None and val < 0:
                    raise ValueError("Les valeurs du triangle doivent être positives")
        return v

class TriangleUpdate(BaseModel):
    """Mise à jour d'un triangle"""
    name: Optional[str] = None
    description: Optional[str] = None
    data: Optional[List[List[Optional[float]]]] = None
    exposure: Optional[List[float]] = None
    premiums: Optional[List[float]] = None

class TriangleInDB(TriangleBase):
    """Triangle en base de données"""
    id: int
    user_id: int
    data: Dict[str, Any]  # Stocké en JSON
    metadata: Optional[Dict[str, Any]] = {}
    created_at: datetime
    updated_at: datetime
    is_locked: bool = False
    version: int = 1
    
    class Config:
        orm_mode = True

class TriangleResponse(TriangleBase):
    """Réponse API pour un triangle"""
    id: int
    user_id: int
    data: List[List[Optional[float]]]
    accident_years: List[int]
    development_periods: List[int]
    statistics: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        orm_mode = True

class TriangleStatistics(BaseModel):
    """Statistiques d'un triangle"""
    triangle_id: int
    size: int  # Dimension du triangle
    total_paid: float
    total_outstanding: Optional[float] = None
    average_development: List[float]
    volatility: Optional[float] = None
    completeness: float  # Pourcentage de cellules remplies
    last_diagonal: List[float]

# ============================================================================
# SCHEMAS - CALCULATION (Calculs actuariels)
# ============================================================================

class CalculationParameters(BaseModel):
    """Paramètres pour les calculs"""
    # Paramètres communs
    tail_factor: TailFactor = TailFactor.NONE
    tail_factor_value: Optional[float] = None
    confidence_level: float = Field(0.95, ge=0.5, le=0.999)
    
    # Chain Ladder
    development_factors_override: Optional[List[float]] = None
    exclude_outliers: bool = False
    outlier_threshold: float = Field(2.5, ge=1.0, le=5.0)
    
    # Bornhuetter-Ferguson
    expected_loss_ratio: Optional[float] = Field(None, ge=0, le=2)
    credibility_weights: Optional[List[float]] = None
    
    # Mack
    include_process_variance: bool = True
    include_parameter_variance: bool = True
    
    # Bootstrap
    n_simulations: Optional[int] = Field(None, ge=100, le=10000)
    random_seed: Optional[int] = None
    
    # Cape Cod
    decay_factor: Optional[float] = Field(None, ge=0, le=1)
    trend_factor: Optional[float] = Field(None, ge=0.9, le=1.1)

class CalculationCreate(BaseModel):
    """Création d'un calcul"""
    triangle_id: int
    method: CalculationMethod
    parameters: Optional[CalculationParameters] = CalculationParameters()
    name: Optional[str] = None
    description: Optional[str] = None
    run_immediately: bool = True

class CalculationUpdate(BaseModel):
    """Mise à jour d'un calcul"""
    name: Optional[str] = None
    description: Optional[str] = None
    parameters: Optional[CalculationParameters] = None

class CalculationResult(BaseModel):
    """Résultats d'un calcul"""
    ultimate_claims: List[float]
    reserves: List[float]
    development_factors: Optional[List[float]] = None
    
    # Intervalles de confiance
    reserves_lower: Optional[List[float]] = None
    reserves_upper: Optional[List[float]] = None
    confidence_level: Optional[float] = None
    
    # Métriques de qualité
    mse: Optional[float] = None  # Mean Squared Error
    mae: Optional[float] = None  # Mean Absolute Error
    r_squared: Optional[float] = None
    
    # Diagnostics
    residuals: Optional[List[List[float]]] = None
    standardized_residuals: Optional[List[List[float]]] = None
    outliers_detected: Optional[List[Dict[str, Any]]] = None
    
    # Métadonnées
    calculation_time: float  # Temps de calcul en secondes
    warnings: Optional[List[str]] = []
    
class CalculationInDB(BaseModel):
    """Calcul en base de données"""
    id: int
    triangle_id: int
    user_id: int
    method: CalculationMethod
    parameters: Dict[str, Any]
    status: CalculationStatus
    results: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    calculation_time: Optional[float] = None
    
    class Config:
        orm_mode = True

class CalculationResponse(BaseModel):
    """Réponse API pour un calcul"""
    id: int
    triangle_id: int
    method: CalculationMethod
    name: Optional[str] = None
    status: CalculationStatus
    results: Optional[CalculationResult] = None
    parameters: CalculationParameters
    created_at: datetime
    completed_at: Optional[datetime] = None
    calculation_time: Optional[float] = None
    
    class Config:
        orm_mode = True

# ============================================================================
# SCHEMAS - COMPARISON (Comparaison de méthodes)
# ============================================================================

class MethodComparison(BaseModel):
    """Comparaison de plusieurs méthodes"""
    triangle_id: int
    methods: List[CalculationMethod]
    parameters_by_method: Optional[Dict[str, CalculationParameters]] = {}

class ComparisonResult(BaseModel):
    """Résultats de comparaison"""
    triangle_id: int
    comparison_id: str
    methods: Dict[str, CalculationResult]
    summary: Dict[str, Any]  # Statistiques de comparaison
    recommendations: List[str]
    best_estimate: float
    range_min: float
    range_max: float
    coefficient_of_variation: float

# ============================================================================
# SCHEMAS - AUDIT (Piste d'audit)
# ============================================================================

class AuditLog(BaseModel):
    """Entrée du journal d'audit"""
    id: int
    user_id: int
    action: str
    resource_type: str
    resource_id: Optional[int] = None
    details: Optional[Dict[str, Any]] = {}
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    timestamp: datetime
    
    class Config:
        orm_mode = True

# ============================================================================
# SCHEMAS - EXPORT (Exports et rapports)
# ============================================================================

class ExportRequest(BaseModel):
    """Demande d'export"""
    calculation_ids: List[int]
    format: str = Field("excel", regex="^(excel|pdf|csv|json)$")
    template: Optional[str] = None  # IFRS17, Solvency2, Custom
    include_charts: bool = True
    include_audit_trail: bool = False
    language: str = "fr"

class ExportResponse(BaseModel):
    """Réponse d'export"""
    export_id: str
    filename: str
    download_url: str
    expires_at: datetime
    size_bytes: int

# ============================================================================
# SCHEMAS - COMPLIANCE (Conformité réglementaire)
# ============================================================================

class IFRS17Parameters(BaseModel):
    """Paramètres IFRS 17"""
    contract_boundary: int  # En mois
    risk_adjustment_confidence: float = Field(0.75, ge=0.5, le=0.99)
    discount_rate: float = Field(0.02, ge=-0.01, le=0.1)
    coverage_units: Optional[List[float]] = None
    loss_component: Optional[float] = None

class Solvency2Parameters(BaseModel):
    """Paramètres Solvabilité II"""
    risk_margin_coc: float = Field(0.06, ge=0, le=0.2)  # Cost of Capital
    volatility_adjustment: Optional[float] = None
    matching_adjustment: Optional[float] = None
    transitional_measures: bool = False

# ============================================================================
# SCHEMAS - COMMON (Réponses communes)
# ============================================================================

class HealthCheck(BaseModel):
    """Vérification de santé de l'API"""
    status: str = "healthy"
    version: str
    timestamp: datetime
    database: bool
    redis: bool
    celery: bool

class PaginatedResponse(BaseModel):
    """Réponse paginée générique"""
    items: List[Any]
    total: int
    page: int
    per_page: int
    pages: int

class ErrorResponse(BaseModel):
    """Réponse d'erreur standardisée"""
    error: str
    message: str
    details: Optional[Dict[str, Any]] = None
    request_id: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class SuccessResponse(BaseModel):
    """Réponse de succès standardisée"""
    success: bool = True
    message: str
    data: Optional[Any] = None

# ============================================================================
# VALIDATORS - Fonctions de validation communes
# ============================================================================

def validate_triangle_data(data: List[List[Optional[float]]]) -> bool:
    """
    Valide qu'une matrice est bien un triangle de développement valide
    """
    if not data:
        return False
    
    n = len(data)
    for i, row in enumerate(data):
        # Vérifier que chaque ligne a le bon nombre de valeurs
        expected = n - i
        actual = len([x for x in row[:expected] if x is not None])
        if actual == 0:
            return False
            
    return True

def validate_percentage(value: float, field_name: str = "value") -> float:
    """Valide qu'une valeur est un pourcentage valide (0-1)"""
    if not 0 <= value <= 1:
        raise ValueError(f"{field_name} doit être entre 0 et 1")
    return value