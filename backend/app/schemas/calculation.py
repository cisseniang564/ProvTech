"""
Schémas Pydantic pour les calculs actuariels
Validation et sérialisation des données API
"""

from pydantic import BaseModel, Field, validator, root_validator
from typing import List, Optional, Dict, Any, Union
from datetime import datetime
from enum import Enum

from app.services.actuarial_engine import CalculationMethod, TailMethod
from app.models.calculation import CalculationStatus, CalculationPriority, ValidationLevel

# ================================
# SCHÉMAS DE BASE
# ================================

class CalculationMethodEnum(str, Enum):
    """Enum des méthodes de calcul pour l'API"""
    CHAIN_LADDER = "chain_ladder"
    BORNHUETTER_FERGUSON = "bornhuetter_ferguson"
    MACK = "mack"
    CAPE_COD = "cape_cod"
    EXPECTED_LOSS_RATIO = "expected_loss_ratio"


class TailMethodEnum(str, Enum):
    """Enum des méthodes de queue pour l'API"""
    NONE = "none"
    CONSTANT = "constant"
    CURVE_FITTING = "curve_fitting"
    EXPONENTIAL = "exponential"
    INVERSE_POWER = "inverse_power"


class CalculationStatusEnum(str, Enum):
    """Enum des statuts de calcul"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class CalculationPriorityEnum(str, Enum):
    """Enum des priorités de calcul"""
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class ValidationLevelEnum(str, Enum):
    """Enum des niveaux de validation"""
    AUTOMATIC = "automatic"
    REVIEWED = "reviewed"
    APPROVED = "approved"
    REJECTED = "rejected"


# ================================
# SCHÉMAS DE PARAMÈTRES
# ================================

class CalculationParametersBase(BaseModel):
    """Paramètres de base pour tous les calculs"""
    confidence_level: float = Field(
        default=0.75,
        ge=0.01,
        le=0.99,
        description="Niveau de confiance pour les intervalles"
    )
    tail_method: TailMethodEnum = Field(
        default=TailMethodEnum.CONSTANT,
        description="Méthode d'extrapolation de la queue"
    )
    tail_factor: float = Field(
        default=1.0,
        ge=1.0,
        le=2.0,
        description="Facteur de queue"
    )
    description: Optional[str] = Field(
        None,
        max_length=1000,
        description="Description des paramètres"
    )
    user_notes: Optional[str] = Field(
        None,
        max_length=2000,
        description="Notes utilisateur"
    )

    @validator('confidence_level')
    def validate_confidence_level(cls, v):
        if not 0 < v < 1:
            raise ValueError('Le niveau de confiance doit être entre 0 et 1')
        return v


class ChainLadderParameters(CalculationParametersBase):
    """Paramètres spécifiques à Chain Ladder"""
    alpha: float = Field(
        default=1.0,
        ge=0.1,
        le=3.0,
        description="Paramètre de lissage (1.0 = pas de lissage)"
    )
    use_volume_weighted: bool = Field(
        default=False,
        description="Utiliser la pondération par volumes"
    )
    exclude_outliers: bool = Field(
        default=False,
        description="Exclure automatiquement les outliers"
    )
    outlier_threshold: float = Field(
        default=3.0,
        ge=1.0,
        le=5.0,
        description="Seuil de détection des outliers (en écarts-types)"
    )
    volume_data: Optional[List[List[float]]] = Field(
        None,
        description="Données de volume pour pondération"
    )


class BornhuetterFergusonParameters(CalculationParametersBase):
    """Paramètres spécifiques à Bornhuetter-Ferguson"""
    expected_loss_ratio: float = Field(
        ...,
        gt=0,
        le=5.0,
        description="Ratio de sinistralité attendu"
    )
    premium_data: List[float] = Field(
        ...,
        min_items=1,
        description="Données de primes par période d'origine"
    )
    
    @validator('premium_data')
    def validate_premium_data(cls, v):
        if any(p <= 0 for p in v):
            raise ValueError('Les primes doivent être positives')
        return v


class MackParameters(CalculationParametersBase):
    """Paramètres spécifiques à la méthode Mack"""
    estimate_tail: bool = Field(
        default=True,
        description="Estimer automatiquement le facteur de queue"
    )
    tail_se: bool = Field(
        default=True,
        description="Inclure l'erreur standard du facteur de queue"
    )
    bootstrap_samples: int = Field(
        default=1000,
        ge=100,
        le=10000,
        description="Nombre d'échantillons bootstrap"
    )


class CapeCodParameters(CalculationParametersBase):
    """Paramètres spécifiques à Cape Cod"""
    exposure_data: List[float] = Field(
        ...,
        min_items=1,
        description="Données d'exposition par période d'origine"
    )
    initial_expected_loss_ratio: float = Field(
        default=0.65,
        gt=0,
        le=5.0,
        description="Ratio de sinistralité initial"
    )
    
    @validator('exposure_data')
    def validate_exposure_data(cls, v):
        if any(e <= 0 for e in v):
            raise ValueError('Les expositions doivent être positives')
        return v


# ================================
# SCHÉMAS DE CRÉATION
# ================================

class CalculationCreate(BaseModel):
    """Schéma pour créer un nouveau calcul"""
    triangle_id: int = Field(..., gt=0, description="ID du triangle")
    name: str = Field(..., min_length=1, max_length=200, description="Nom du calcul")
    description: Optional[str] = Field(None, max_length=1000, description="Description")
    method: CalculationMethodEnum = Field(..., description="Méthode de calcul")
    priority: Optional[CalculationPriorityEnum] = Field(
        CalculationPriorityEnum.NORMAL,
        description="Priorité d'exécution"
    )
    
    # Paramètres par méthode
    confidence_level: float = Field(default=0.75, ge=0.01, le=0.99)
    tail_method: TailMethodEnum = Field(default=TailMethodEnum.CONSTANT)
    tail_factor: float = Field(default=1.0, ge=1.0, le=2.0)
    
    # Chain Ladder spécifique
    alpha: Optional[float] = Field(default=1.0, ge=0.1, le=3.0)
    use_volume_weighted: Optional[bool] = Field(default=False)
    exclude_outliers: Optional[bool] = Field(default=False)
    outlier_threshold: Optional[float] = Field(default=3.0, ge=1.0, le=5.0)
    
    # Bornhuetter-Ferguson spécifique
    expected_loss_ratio: Optional[float] = Field(None, gt=0, le=5.0)
    premium_data: Optional[List[float]] = Field(None)
    
    # Cape Cod spécifique
    exposure_data: Optional[List[float]] = Field(None)
    initial_expected_loss_ratio: Optional[float] = Field(default=0.65, gt=0, le=5.0)
    
    # Mack spécifique
    estimate_tail: Optional[bool] = Field(default=True)
    tail_se: Optional[bool] = Field(default=True)
    bootstrap_samples: Optional[int] = Field(default=1000, ge=100, le=10000)
    
    # Paramètres généraux
    user_notes: Optional[str] = Field(None, max_length=2000)
    custom_parameters: Optional[Dict[str, Any]] = Field(default_factory=dict)

    @root_validator
    def validate_method_parameters(cls, values):
        """Validation croisée des paramètres selon la méthode"""
        method = values.get('method')
        
        if method == CalculationMethodEnum.BORNHUETTER_FERGUSON:
            if not values.get('expected_loss_ratio'):
                raise ValueError('expected_loss_ratio requis pour Bornhuetter-Ferguson')
            if not values.get('premium_data'):
                raise ValueError('premium_data requis pour Bornhuetter-Ferguson')
        
        elif method == CalculationMethodEnum.CAPE_COD:
            if not values.get('exposure_data'):
                raise ValueError('exposure_data requis pour Cape Cod')
        
        return values

    @validator('name')
    def validate_name(cls, v):
        if not v.strip():
            raise ValueError('Le nom ne peut pas être vide')
        return v.strip()


class CalculationUpdate(BaseModel):
    """Schéma pour mettre à jour un calcul"""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    priority: Optional[CalculationPriorityEnum] = None
    validation_level: Optional[ValidationLevelEnum] = None
    is_baseline: Optional[bool] = None
    is_favorite: Optional[bool] = None
    is_archived: Optional[bool] = None
    review_notes: Optional[str] = Field(None, max_length=2000)
    
    # Mise à jour des paramètres (validation limitée)
    parameters: Optional[Dict[str, Any]] = None

    @validator('name')
    def validate_name(cls, v):
        if v is not None and not v.strip():
            raise ValueError('Le nom ne peut pas être vide')
        return v.strip() if v else v


# ================================
# SCHÉMAS D'EXÉCUTION
# ================================

class CalculationExecuteRequest(BaseModel):
    """Schéma pour lancer l'exécution d'un calcul"""
    priority: Optional[CalculationPriorityEnum] = None
    run_synchronously: bool = Field(
        default=False,
        description="Exécuter de manière synchrone (pour tests)"
    )
    override_parameters: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Paramètres à remplacer pour cette exécution"
    )
    timeout_seconds: Optional[int] = Field(
        default=300,
        ge=10,
        le=3600,
        description="Timeout d'exécution en secondes"
    )


class CalculationComparisonRequest(BaseModel):
    """Schéma pour comparer des calculs"""
    calculation_ids: List[int] = Field(
        ...,
        min_items=2,
        max_items=10,
        description="IDs des calculs à comparer"
    )
    comparison_type: str = Field(
        default="results",
        regex="^(results|methods|sensitivity)$",
        description="Type de comparaison"
    )
    metrics_to_compare: List[str] = Field(
        default=["total_ultimate", "total_reserves", "total_paid"],
        description="Métriques à comparer"
    )
    include_confidence_intervals: bool = Field(
        default=True,
        description="Inclure les intervalles de confiance"
    )


# ================================
# SCHÉMAS DE RÉPONSE
# ================================

class TriangleInfo(BaseModel):
    """Informations sur le triangle associé"""
    id: int
    name: str
    business_line: str
    data_type: str
    dimensions: tuple
    
    class Config:
        orm_mode = True


class UserInfo(BaseModel):
    """Informations sur l'utilisateur"""
    id: int
    name: str
    email: Optional[str] = None
    
    class Config:
        orm_mode = True


class CalculationSummary(BaseModel):
    """Résumé d'un calcul"""
    total_ultimate: Optional[float] = None
    total_reserves: Optional[float] = None
    total_paid: Optional[float] = None
    reserves_ratio: Optional[float] = None
    quality_score: Optional[float] = None
    confidence_score: Optional[float] = None
    computation_time_ms: Optional[float] = None


class CalculationResponse(BaseModel):
    """Réponse complète pour un calcul"""
    id: int
    uuid: str
    name: str
    description: Optional[str] = None
    method: CalculationMethodEnum
    method_display_name: str
    status: CalculationStatusEnum
    priority: CalculationPriorityEnum
    validation_level: ValidationLevelEnum
    version: int
    is_baseline: bool
    is_favorite: bool
    is_archived: bool
    
    # Métadonnées temporelles
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    # Métriques
    quality_score: Optional[float] = None
    confidence_score: Optional[float] = None
    computation_time_ms: Optional[float] = None
    duration_seconds: Optional[float] = None
    
    # Relations
    triangle: Optional[TriangleInfo] = None
    user: Optional[UserInfo] = None
    
    # Résultats (résumé)
    has_results: bool
    summary: Optional[CalculationSummary] = None
    warnings: List[str] = Field(default_factory=list)
    error_message: Optional[str] = None
    
    class Config:
        orm_mode = True

    @validator('summary', pre=True, always=True)
    def build_summary(cls, v, values):
        """Construit automatiquement le résumé si les résultats existent"""
        if v is None and values.get('has_results'):
            # Le résumé sera construit côté serveur
            return None
        return v


class CalculationResultResponse(BaseModel):
    """Réponse détaillée avec tous les résultats"""
    calculation_id: int
    calculation_name: str
    method: str
    status: str
    
    # Résultats bruts
    results: Dict[str, Any]
    
    # Résultats formatés pour affichage
    formatted_results: Optional[Dict[str, Any]] = None
    
    # Résumé statistique
    summary: CalculationSummary
    
    # Informations contextuelles
    triangle: TriangleInfo
    computed_at: Optional[datetime] = None
    computation_time_ms: Optional[float] = None


class CalculationListResponse(BaseModel):
    """Réponse paginée pour la liste des calculs"""
    items: List[CalculationResponse]
    total: int
    skip: int
    limit: int
    has_more: bool = Field(default=False)
    
    @validator('has_more', pre=True, always=True)
    def calculate_has_more(cls, v, values):
        """Calcule automatiquement s'il y a plus d'éléments"""
        total = values.get('total', 0)
        skip = values.get('skip', 0)
        limit = values.get('limit', 0)
        return (skip + limit) < total


class CalculationStatisticsResponse(BaseModel):
    """Statistiques sur les calculs"""
    period_days: int
    triangle_id: Optional[int] = None
    statistics: Dict[str, Any]
    generated_at: datetime = Field(default_factory=datetime.utcnow)


# ================================
# SCHÉMAS D'EXPORT
# ================================

class CalculationExportRequest(BaseModel):
    """Demande d'export de calcul"""
    calculation_ids: List[int] = Field(..., min_items=1, max_items=50)
    export_type: str = Field(
        ...,
        regex="^(excel|pdf|csv|json)$",
        description="Type d'export"
    )
    export_format: str = Field(
        default="standard",
        regex="^(standard|ifrs17|solvency2|custom)$",
        description="Format d'export"
    )
    include_metadata: bool = Field(default=True)
    include_charts: bool = Field(default=False)
    include_confidence_intervals: bool = Field(default=True)
    template_name: Optional[str] = Field(None, max_length=100)
    custom_parameters: Optional[Dict[str, Any]] = Field(default_factory=dict)


class CalculationExportResponse(BaseModel):
    """Réponse d'export"""
    export_id: str
    status: str
    file_name: Optional[str] = None
    file_size_bytes: Optional[int] = None
    download_url: Optional[str] = None
    expires_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ================================
# SCHÉMAS DE VALIDATION
# ================================

class CalculationValidationRequest(BaseModel):
    """Demande de validation d'un calcul"""
    validation_level: ValidationLevelEnum
    review_notes: Optional[str] = Field(None, max_length=2000)
    approve_for_reporting: bool = Field(default=False)


class CalculationValidationResponse(BaseModel):
    """Réponse de validation"""
    calculation_id: int
    validation_level: ValidationLevelEnum
    validated_by: UserInfo
    validated_at: datetime
    review_notes: Optional[str] = None
    validation_checks: Dict[str, bool] = Field(default_factory=dict)


# ================================
# SCHÉMAS D'ERREUR
# ================================

class CalculationError(BaseModel):
    """Schéma d'erreur pour les calculs"""
    error_type: str
    error_code: str
    message: str
    details: Optional[Dict[str, Any]] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ValidationErrorDetail(BaseModel):
    """Détail d'erreur de validation"""
    field: str
    message: str
    invalid_value: Any


class ValidationErrorResponse(BaseModel):
    """Réponse d'erreur de validation"""
    error_type: str = "validation_error"
    message: str
    errors: List[ValidationErrorDetail]
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# ================================
# UTILITAIRES DE CONVERSION
# ================================

def convert_calculation_method_to_enum(method: CalculationMethod) -> CalculationMethodEnum:
    """Convertit une méthode de calcul vers l'enum API"""
    mapping = {
        CalculationMethod.CHAIN_LADDER: CalculationMethodEnum.CHAIN_LADDER,
        CalculationMethod.BORNHUETTER_FERGUSON: CalculationMethodEnum.BORNHUETTER_FERGUSON,
        CalculationMethod.MACK: CalculationMethodEnum.MACK,
        CalculationMethod.CAPE_COD: CalculationMethodEnum.CAPE_COD,
        CalculationMethod.EXPECTED_LOSS_RATIO: CalculationMethodEnum.EXPECTED_LOSS_RATIO,
    }
    return mapping.get(method, CalculationMethodEnum.CHAIN_LADDER)


def convert_enum_to_calculation_method(method_enum: CalculationMethodEnum) -> CalculationMethod:
    """Convertit un enum API vers la méthode de calcul"""
    mapping = {
        CalculationMethodEnum.CHAIN_LADDER: CalculationMethod.CHAIN_LADDER,
        CalculationMethodEnum.BORNHUETTER_FERGUSON: CalculationMethod.BORNHUETTER_FERGUSON,
        CalculationMethodEnum.MACK: CalculationMethod.MACK,
        CalculationMethodEnum.CAPE_COD: CalculationMethod.CAPE_COD,
        CalculationMethodEnum.EXPECTED_LOSS_RATIO: CalculationMethod.EXPECTED_LOSS_RATIO,
    }
    return mapping.get(method_enum, CalculationMethod.CHAIN_LADDER)


# ================================
# EXPORTS
# ================================

__all__ = [
    # Enums
    "CalculationMethodEnum",
    "TailMethodEnum", 
    "CalculationStatusEnum",
    "CalculationPriorityEnum",
    "ValidationLevelEnum",
    
    # Paramètres
    "CalculationParametersBase",
    "ChainLadderParameters",
    "BornhuetterFergusonParameters",
    "MackParameters",
    "CapeCodParameters",
    
    # Requêtes
    "CalculationCreate",
    "CalculationUpdate",
    "CalculationExecuteRequest",
    "CalculationComparisonRequest",
    "CalculationExportRequest",
    "CalculationValidationRequest",
    
    # Réponses
    "CalculationResponse",
    "CalculationResultResponse",
    "CalculationListResponse",
    "CalculationStatisticsResponse",
    "CalculationExportResponse",
    "CalculationValidationResponse",
    
    # Utilitaires
    "TriangleInfo",
    "UserInfo",
    "CalculationSummary",
    "CalculationError",
    "ValidationErrorResponse",
    
    # Fonctions de conversion
    "convert_calculation_method_to_enum",
    "convert_enum_to_calculation_method"
]