"""
Modèle Calculation pour stocker les calculs et résultats
Historique et versioning des calculs actuariels
"""

from sqlalchemy import (
    Boolean, Column, Integer, String, DateTime, Text, ForeignKey, 
    Float, JSON, UniqueConstraint, Index, Enum as SQLEnum
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional
from enum import Enum as PyEnum
import json
import numpy as np

from app.core.database import Base
from app.services.actuarial_engine import CalculationMethod, CalculationResult, CalculationParameters

# ================================
# ENUMS
# ================================

class CalculationStatus(PyEnum):
    """Statuts d'un calcul"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class CalculationPriority(PyEnum):
    """Priorités de calcul"""
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class ValidationLevel(PyEnum):
    """Niveaux de validation des résultats"""
    AUTOMATIC = "automatic"
    REVIEWED = "reviewed"
    APPROVED = "approved"
    REJECTED = "rejected"


# ================================
# MODÈLE PRINCIPAL
# ================================

class Calculation(Base):
    """
    Modèle pour stocker les calculs actuariels et leurs résultats
    """
    __tablename__ = "calculations"
    
    # Identifiants
    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(UUID(as_uuid=True), default=uuid.uuid4, unique=True, nullable=False, index=True)
    
    # Relations
    triangle_id = Column(Integer, ForeignKey('triangles.id'), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    
    # Informations de base
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    
    # Configuration du calcul
    method = Column(SQLEnum(CalculationMethod), nullable=False, index=True)
    parameters = Column(JSON, nullable=False)  # Paramètres sérialisés
    
    # Statut et priorité
    status = Column(SQLEnum(CalculationStatus), default=CalculationStatus.PENDING, nullable=False, index=True)
    priority = Column(SQLEnum(CalculationPriority), default=CalculationPriority.NORMAL, nullable=False)
    
    # Résultats du calcul (JSON)
    results = Column(JSON, nullable=True)
    
    # Métriques de performance
    computation_time_ms = Column(Float, nullable=True)
    memory_usage_mb = Column(Float, nullable=True)
    
    # Validation et qualité
    validation_level = Column(SQLEnum(ValidationLevel), default=ValidationLevel.AUTOMATIC, nullable=False)
    quality_score = Column(Float, nullable=True)  # Score de qualité 0-1
    confidence_score = Column(Float, nullable=True)  # Score de confiance 0-1
    
    # Messages et logs
    error_message = Column(Text, nullable=True)
    warnings = Column(JSON, nullable=True)  # Liste des avertissements
    execution_log = Column(Text, nullable=True)
    
    # Versioning
    version = Column(Integer, default=1, nullable=False)
    parent_calculation_id = Column(Integer, ForeignKey('calculations.id'), nullable=True)
    is_baseline = Column(Boolean, default=False, nullable=False)  # Calcul de référence
    
    # Métadonnées temporelles
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Métadonnées utilisateur
    reviewed_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    review_notes = Column(Text, nullable=True)
    
    # Flags de gestion
    is_archived = Column(Boolean, default=False, nullable=False)
    is_favorite = Column(Boolean, default=False, nullable=False)
    is_exported = Column(Boolean, default=False, nullable=False)
    
    # Relations
    triangle = relationship("Triangle", back_populates="calculations")
    user = relationship("User", foreign_keys=[user_id], back_populates="calculations")
    reviewer = relationship("User", foreign_keys=[reviewed_by])
    parent_calculation = relationship("Calculation", remote_side=[id])
    child_calculations = relationship("Calculation", remote_side=[parent_calculation_id])
    exports = relationship("CalculationExport", back_populates="calculation", cascade="all, delete-orphan")
    comparisons = relationship("CalculationComparison", 
                             foreign_keys="[CalculationComparison.calculation_id]",
                             back_populates="calculation")
    
    # Contraintes
    __table_args__ = (
        Index('ix_calculation_triangle_method', 'triangle_id', 'method'),
        Index('ix_calculation_user_status', 'user_id', 'status'),
        Index('ix_calculation_created', 'created_at'),
    )
    
    def __repr__(self):
        return f"<Calculation(name='{self.name}', method='{self.method.value}', status='{self.status.value}')>"
    
    # ================================
    # PROPRIÉTÉS CALCULÉES
    # ================================
    
    @property
    def duration_seconds(self) -> Optional[float]:
        """Durée d'exécution en secondes"""
        if self.started_at and self.completed_at:
            delta = self.completed_at - self.started_at
            return delta.total_seconds()
        return None
    
    @property
    def is_running(self) -> bool:
        """Vérifie si le calcul est en cours"""
        return self.status == CalculationStatus.RUNNING
    
    @property
    def is_completed(self) -> bool:
        """Vérifie si le calcul est terminé avec succès"""
        return self.status == CalculationStatus.COMPLETED
    
    @property
    def has_results(self) -> bool:
        """Vérifie si le calcul a des résultats"""
        return self.results is not None and len(self.results) > 0
    
    @property
    def total_ultimate(self) -> Optional[float]:
        """Total des charges ultimes"""
        if self.has_results and 'total_ultimate' in self.results:
            return self.results['total_ultimate']
        return None
    
    @property
    def total_reserves(self) -> Optional[float]:
        """Total des provisions"""
        if self.has_results and 'total_reserves' in self.results:
            return self.results['total_reserves']
        return None
    
    @property
    def method_display_name(self) -> str:
        """Nom d'affichage de la méthode"""
        method_names = {
            CalculationMethod.CHAIN_LADDER: "Chain Ladder",
            CalculationMethod.BORNHUETTER_FERGUSON: "Bornhuetter-Ferguson",
            CalculationMethod.MACK: "Mack",
            CalculationMethod.CAPE_COD: "Cape Cod",
            CalculationMethod.EXPECTED_LOSS_RATIO: "Expected Loss Ratio"
        }
        return method_names.get(self.method, self.method.value)
    
    # ================================
    # MÉTHODES DE GESTION DU CYCLE DE VIE
    # ================================
    
    def start_execution(self):
        """Marque le début de l'exécution"""
        self.status = CalculationStatus.RUNNING
        self.started_at = datetime.utcnow()
        self.error_message = None
    
    def complete_successfully(self, result: CalculationResult):
        """Marque la fin réussie avec résultats"""
        self.status = CalculationStatus.COMPLETED
        self.completed_at = datetime.utcnow()
        self.results = result.to_dict()
        self.computation_time_ms = result.computation_time_ms
        self.warnings = result.warnings
        
        # Calcul du score de qualité automatique
        self._calculate_quality_metrics(result)
    
    def fail_with_error(self, error_message: str):
        """Marque l'échec avec message d'erreur"""
        self.status = CalculationStatus.FAILED
        self.completed_at = datetime.utcnow()
        self.error_message = error_message
    
    def cancel(self, reason: str = "Cancelled by user"):
        """Annule le calcul"""
        self.status = CalculationStatus.CANCELLED
        self.completed_at = datetime.utcnow()
        self.error_message = reason
    
    def reset(self):
        """Remet à zéro pour relancer"""
        self.status = CalculationStatus.PENDING
        self.started_at = None
        self.completed_at = None
        self.results = None
        self.error_message = None
        self.warnings = None
        self.computation_time_ms = None
    
    # ================================
    # MÉTHODES DE VALIDATION
    # ================================
    
    def validate_parameters(self) -> List[str]:
        """
        Valide les paramètres du calcul
        
        Returns:
            List[str]: Liste des erreurs
        """
        errors = []
        
        if not self.parameters:
            errors.append("Paramètres manquants")
            return errors
        
        try:
            # Reconstruction des paramètres pour validation
            params = CalculationParameters(**self.parameters)
            param_errors = params.validate()
            errors.extend(param_errors)
        except Exception as e:
            errors.append(f"Paramètres invalides: {e}")
        
        return errors
    
    def validate_triangle_compatibility(self) -> List[str]:
        """
        Valide la compatibilité avec le triangle
        
        Returns:
            List[str]: Liste des erreurs
        """
        errors = []
        
        if not self.triangle:
            errors.append("Triangle non trouvé")
            return errors
        
        # Vérifications spécifiques par méthode
        if self.method == CalculationMethod.BORNHUETTER_FERGUSON:
            if 'expected_loss_ratio' not in self.parameters:
                errors.append("BF: ratio de sinistralité attendu requis")
            if 'premium_data' not in self.parameters:
                errors.append("BF: données de primes requises")
        
        elif self.method == CalculationMethod.CAPE_COD:
            if 'exposure_data' not in self.parameters:
                errors.append("Cape Cod: données d'exposition requises")
        
        # Validation de la taille du triangle
        rows, cols = self.triangle.dimensions
        if rows < 2 or cols < 2:
            errors.append("Triangle trop petit pour le calcul")
        
        return errors
    
    def _calculate_quality_metrics(self, result: CalculationResult):
        """
        Calcule automatiquement les métriques de qualité
        
        Args:
            result: Résultats du calcul
        """
        quality_factors = []
        
        # Facteur basé sur R²
        if result.r_squared is not None:
            r2_score = max(0, min(1, result.r_squared))
            quality_factors.append(r2_score)
        
        # Facteur basé sur la cohérence des résultats
        if result.total_ultimate > 0 and result.total_paid > 0:
            ratio = result.total_reserves / result.total_paid
            # Pénalise les ratios extrêmes
            if 0.1 <= ratio <= 2.0:
                coherence_score = 1.0
            elif 0.05 <= ratio <= 5.0:
                coherence_score = 0.7
            else:
                coherence_score = 0.3
            quality_factors.append(coherence_score)
        
        # Facteur basé sur les avertissements
        warning_penalty = max(0, 1.0 - len(result.warnings) * 0.1)
        quality_factors.append(warning_penalty)
        
        # Score final
        if quality_factors:
            self.quality_score = np.mean(quality_factors)
        
        # Score de confiance (simplifié)
        if result.coefficient_of_variation is not None:
            # Plus le CV est faible, plus la confiance est haute
            self.confidence_score = max(0, 1.0 - result.coefficient_of_variation)
        else:
            self.confidence_score = 0.7  # Valeur par défaut
    
    # ================================
    # MÉTHODES D'EXPORT ET SÉRIALISATION
    # ================================
    
    def to_dict(self, include_results: bool = True, include_sensitive: bool = False) -> Dict[str, Any]:
        """
        Convertit le calcul en dictionnaire
        
        Args:
            include_results: Inclure les résultats détaillés
            include_sensitive: Inclure les données sensibles
            
        Returns:
            Dict: Représentation du calcul
        """
        data = {
            "id": self.id,
            "uuid": str(self.uuid),
            "name": self.name,
            "description": self.description,
            "method": self.method.value,
            "method_display_name": self.method_display_name,
            "status": self.status.value,
            "priority": self.priority.value,
            "validation_level": self.validation_level.value,
            "version": self.version,
            "is_baseline": self.is_baseline,
            "quality_score": self.quality_score,
            "confidence_score": self.confidence_score,
            "computation_time_ms": self.computation_time_ms,
            "duration_seconds": self.duration_seconds,
            "created_at": self.created_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "triangle": {
                "id": self.triangle.id,
                "name": self.triangle.name,
                "business_line": self.triangle.business_line,
                "data_type": self.triangle.data_type
            } if self.triangle else None,
            "user": {
                "id": self.user.id,
                "name": self.user.full_name,
                "email": self.user.email if include_sensitive else None
            } if self.user else None,
            "has_results": self.has_results,
            "is_archived": self.is_archived,
            "is_favorite": self.is_favorite,
            "warnings": self.warnings or []
        }
        
        # Ajout des résultats si demandé
        if include_results and self.has_results:
            data["results"] = self.results
            data["total_ultimate"] = self.total_ultimate
            data["total_reserves"] = self.total_reserves
        
        # Ajout des paramètres si sensible autorisé
        if include_sensitive:
            data["parameters"] = self.parameters
            data["error_message"] = self.error_message
            data["execution_log"] = self.execution_log
        
        return data
    
    def get_summary_statistics(self) -> Dict[str, Any]:
        """
        Retourne un résumé statistique du calcul
        
        Returns:
            Dict: Statistiques résumées
        """
        if not self.has_results:
            return {"error": "Aucun résultat disponible"}
        
        results = self.results
        
        summary = {
            "method": self.method_display_name,
            "total_ultimate": results.get('total_ultimate'),
            "total_reserves": results.get('total_reserves'),
            "total_paid": results.get('total_paid'),
            "reserves_ratio": None,
            "quality_indicators": {
                "r_squared": results.get('r_squared'),
                "quality_score": self.quality_score,
                "confidence_score": self.confidence_score,
                "warnings_count": len(self.warnings or [])
            },
            "computation": {
                "time_ms": self.computation_time_ms,
                "memory_mb": self.memory_usage_mb
            }
        }
        
        # Calcul du ratio provisions/payé
        if summary["total_reserves"] and summary["total_paid"]:
            summary["reserves_ratio"] = summary["total_reserves"] / summary["total_paid"]
        
        return summary
    
    def create_version(self, new_parameters: Dict[str, Any], description: str = "") -> 'Calculation':
        """
        Crée une nouvelle version du calcul
        
        Args:
            new_parameters: Nouveaux paramètres
            description: Description des changements
            
        Returns:
            Calculation: Nouvelle version
        """
        new_calculation = Calculation(
            triangle_id=self.triangle_id,
            user_id=self.user_id,
            name=f"{self.name} v{self.version + 1}",
            description=description or f"Version {self.version + 1} de {self.name}",
            method=self.method,
            parameters=new_parameters,
            priority=self.priority,
            version=self.version + 1,
            parent_calculation_id=self.id
        )
        
        return new_calculation
    
    def archive(self, reason: str = "Archived by user"):
        """Archive le calcul"""
        self.is_archived = True
        self.review_notes = reason
        self.updated_at = datetime.utcnow()
    
    def mark_as_baseline(self):
        """Marque comme calcul de référence"""
        self.is_baseline = True
        self.updated_at = datetime.utcnow()


# ================================
# MODÈLES AUXILIAIRES
# ================================

class CalculationComparison(Base):
    """
    Comparaison entre calculs
    Analyse des différences entre méthodes ou versions
    """
    __tablename__ = "calculation_comparisons"
    
    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(UUID(as_uuid=True), default=uuid.uuid4, unique=True, nullable=False)
    
    # Calculs comparés
    calculation_id = Column(Integer, ForeignKey('calculations.id'), nullable=False)
    compared_calculation_id = Column(Integer, ForeignKey('calculations.id'), nullable=False)
    
    # Métadonnées
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey('users.id'), nullable=False)
    
    # Résultats de la comparaison
    comparison_results = Column(JSON, nullable=False)
    summary_statistics = Column(JSON, nullable=True)
    
    # Conclusions
    recommendation = Column(Text, nullable=True)
    confidence_level = Column(Float, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relations
    calculation = relationship("Calculation", foreign_keys=[calculation_id])
    compared_calculation = relationship("Calculation", foreign_keys=[compared_calculation_id])
    creator = relationship("User")
    
    def __repr__(self):
        return f"<CalculationComparison(name='{self.name}')>"


class CalculationExport(Base):
    """
    Exports de calculs vers différents formats
    """
    __tablename__ = "calculation_exports"
    
    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(UUID(as_uuid=True), default=uuid.uuid4, unique=True, nullable=False)
    
    # Calcul exporté
    calculation_id = Column(Integer, ForeignKey('calculations.id'), nullable=False)
    
    # Configuration de l'export
    export_type = Column(String(50), nullable=False)  # excel, pdf, csv, json
    export_format = Column(String(50), nullable=False)  # ifrs17, solvency2, custom
    template_used = Column(String(100), nullable=True)
    
    # Métadonnées du fichier
    file_name = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=True)
    file_size_bytes = Column(Integer, nullable=True)
    file_hash = Column(String(64), nullable=True)
    
    # Configuration
    export_parameters = Column(JSON, nullable=True)
    include_metadata = Column(Boolean, default=True, nullable=False)
    include_charts = Column(Boolean, default=False, nullable=False)
    
    # Statut
    status = Column(String(20), default="pending", nullable=False)
    error_message = Column(Text, nullable=True)
    
    # Métadonnées utilisateur
    created_by = Column(Integer, ForeignKey('users.id'), nullable=False)
    downloaded_count = Column(Integer, default=0, nullable=False)
    last_downloaded_at = Column(DateTime(timezone=True), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relations
    calculation = relationship("Calculation", back_populates="exports")
    creator = relationship("User")
    
    def __repr__(self):
        return f"<CalculationExport(file_name='{self.file_name}', type='{self.export_type}')>"
    
    @property
    def is_expired(self) -> bool:
        """Vérifie si l'export a expiré"""
        if self.expires_at:
            return datetime.utcnow() > self.expires_at.replace(tzinfo=None)
        return False
    
    def mark_downloaded(self):
        """Marque comme téléchargé"""
        self.downloaded_count += 1
        self.last_downloaded_at = datetime.utcnow()


class CalculationSchedule(Base):
    """
    Planification de calculs récurrents
    """
    __tablename__ = "calculation_schedules"
    
    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(UUID(as_uuid=True), default=uuid.uuid4, unique=True, nullable=False)
    
    # Configuration de base
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    
    # Triangle et méthode
    triangle_id = Column(Integer, ForeignKey('triangles.id'), nullable=False)
    method = Column(SQLEnum(CalculationMethod), nullable=False)
    parameters = Column(JSON, nullable=False)
    
    # Configuration de planification
    schedule_type = Column(String(20), nullable=False)  # daily, weekly, monthly, quarterly
    cron_expression = Column(String(100), nullable=True)  # Expression cron pour planification avancée
    
    # Statut
    is_active = Column(Boolean, default=True, nullable=False)
    next_run_at = Column(DateTime(timezone=True), nullable=True)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    last_calculation_id = Column(Integer, ForeignKey('calculations.id'), nullable=True)
    
    # Propriétaire
    created_by = Column(Integer, ForeignKey('users.id'), nullable=False)
    
    # Paramètres d'exécution
    auto_export = Column(Boolean, default=False, nullable=False)
    export_format = Column(String(50), nullable=True)
    notify_on_completion = Column(Boolean, default=True, nullable=False)
    notification_emails = Column(JSON, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relations
    triangle = relationship("Triangle")
    creator = relationship("User")
    last_calculation = relationship("Calculation")
    
    def __repr__(self):
        return f"<CalculationSchedule(name='{self.name}', type='{self.schedule_type}')>"


# ================================
# FONCTIONS UTILITAIRES
# ================================

def create_calculation_from_parameters(
    triangle_id: int,
    user_id: int,
    method: CalculationMethod,
    parameters: CalculationParameters,
    name: Optional[str] = None,
    description: Optional[str] = None
) -> Calculation:
    """
    Crée un nouveau calcul à partir de paramètres
    
    Args:
        triangle_id: ID du triangle
        user_id: ID de l'utilisateur
        method: Méthode de calcul
        parameters: Paramètres de calcul
        name: Nom du calcul
        description: Description
        
    Returns:
        Calculation: Nouveau calcul
    """
    # Nom par défaut
    if not name:
        name = f"Calcul {method.value} - {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}"
    
    # Sérialisation des paramètres
    params_dict = {
        "method": parameters.method.value,
        "confidence_level": parameters.confidence_level,
        "tail_method": parameters.tail_method.value,
        "tail_factor": parameters.tail_factor,
        "alpha": parameters.alpha,
        "use_volume_weighted": parameters.use_volume_weighted,
        "exclude_outliers": parameters.exclude_outliers,
        "outlier_threshold": parameters.outlier_threshold,
        "expected_loss_ratio": parameters.expected_loss_ratio,
        "premium_data": parameters.premium_data.tolist() if parameters.premium_data is not None else None,
        "exposure_data": parameters.exposure_data.tolist() if parameters.exposure_data is not None else None,
        "description": parameters.description,
        "user_notes": parameters.user_notes,
        "custom_parameters": parameters.custom_parameters
    }
    
    calculation = Calculation(
        triangle_id=triangle_id,
        user_id=user_id,
        name=name,
        description=description,
        method=method,
        parameters=params_dict
    )
    
    return calculation


def get_calculation_statistics(calculations: List[Calculation]) -> Dict[str, Any]:
    """
    Calcule des statistiques sur une liste de calculs
    
    Args:
        calculations: Liste des calculs
        
    Returns:
        Dict: Statistiques
    """
    if not calculations:
        return {"total": 0}
    
    stats = {
        "total": len(calculations),
        "by_status": {},
        "by_method": {},
        "performance": {
            "avg_computation_time_ms": 0,
            "total_computation_time_ms": 0,
            "fastest_ms": None,
            "slowest_ms": None
        },
        "quality": {
            "avg_quality_score": 0,
            "avg_confidence_score": 0,
            "high_quality_count": 0  # quality > 0.8
        },
        "temporal": {
            "oldest": None,
            "newest": None,
            "last_24h": 0,
            "last_week": 0
        }
    }
    
    # Calculs par statut
    for calc in calculations:
        status = calc.status.value
        stats["by_status"][status] = stats["by_status"].get(status, 0) + 1
        
        method = calc.method.value
        stats["by_method"][method] = stats["by_method"].get(method, 0) + 1
    
    # Calculs avec résultats pour statistiques de performance
    completed_calcs = [c for c in calculations if c.is_completed and c.computation_time_ms]
    
    if completed_calcs:
        times = [c.computation_time_ms for c in completed_calcs]
        stats["performance"]["avg_computation_time_ms"] = np.mean(times)
        stats["performance"]["total_computation_time_ms"] = sum(times)
        stats["performance"]["fastest_ms"] = min(times)
        stats["performance"]["slowest_ms"] = max(times)
        
        # Scores de qualité
        quality_scores = [c.quality_score for c in completed_calcs if c.quality_score is not None]
        confidence_scores = [c.confidence_score for c in completed_calcs if c.confidence_score is not None]
        
        if quality_scores:
            stats["quality"]["avg_quality_score"] = np.mean(quality_scores)
            stats["quality"]["high_quality_count"] = sum(1 for s in quality_scores if s > 0.8)
        
        if confidence_scores:
            stats["quality"]["avg_confidence_score"] = np.mean(confidence_scores)
    
    # Statistiques temporelles
    if calculations:
        dates = [c.created_at for c in calculations]
        stats["temporal"]["oldest"] = min(dates).isoformat()
        stats["temporal"]["newest"] = max(dates).isoformat()
        
        # Calculs récents
        now = datetime.utcnow()
        day_ago = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_ago = day_ago - timedelta(days=7)
        
        stats["temporal"]["last_24h"] = sum(1 for c in calculations if c.created_at >= day_ago)
        stats["temporal"]["last_week"] = sum(1 for c in calculations if c.created_at >= week_ago)
    
    return stats


def find_similar_calculations(
    calculation: Calculation,
    all_calculations: List[Calculation],
    similarity_threshold: float = 0.8
) -> List[Calculation]:
    """
    Trouve des calculs similaires basés sur les paramètres
    
    Args:
        calculation: Calcul de référence
        all_calculations: Liste de tous les calculs
        similarity_threshold: Seuil de similarité
        
    Returns:
        List[Calculation]: Calculs similaires
    """
    similar = []
    
    for other in all_calculations:
        if other.id == calculation.id:
            continue
        
        # Même triangle et méthode
        if (other.triangle_id == calculation.triangle_id and 
            other.method == calculation.method):
            
            # Comparaison des paramètres clés
            similarity_score = _calculate_parameter_similarity(
                calculation.parameters, 
                other.parameters
            )
            
            if similarity_score >= similarity_threshold:
                similar.append(other)
    
    # Tri par similarité décroissante
    similar.sort(key=lambda x: _calculate_parameter_similarity(
        calculation.parameters, x.parameters
    ), reverse=True)
    
    return similar


def _calculate_parameter_similarity(params1: Dict[str, Any], params2: Dict[str, Any]) -> float:
    """
    Calcule la similarité entre deux ensembles de paramètres
    
    Args:
        params1: Premiers paramètres
        params2: Seconds paramètres
        
    Returns:
        float: Score de similarité (0-1)
    """
    if not params1 or not params2:
        return 0.0
    
    # Paramètres clés à comparer
    key_params = [
        'confidence_level', 'tail_method', 'tail_factor', 
        'alpha', 'expected_loss_ratio', 'exclude_outliers'
    ]
    
    similarities = []
    
    for param in key_params:
        if param in params1 and param in params2:
            val1, val2 = params1[param], params2[param]
            
            if val1 == val2:
                similarities.append(1.0)
            elif isinstance(val1, (int, float)) and isinstance(val2, (int, float)):
                # Similarité numérique
                if val1 == 0 and val2 == 0:
                    similarities.append(1.0)
                else:
                    diff = abs(val1 - val2) / max(abs(val1), abs(val2))
                    similarities.append(max(0, 1 - diff))
            else:
                similarities.append(0.0)
    
    return np.mean(similarities) if similarities else 0.0


# ================================
# EXPORTS
# ================================

__all__ = [
    "Calculation",
    "CalculationComparison",
    "CalculationExport", 
    "CalculationSchedule",
    "CalculationStatus",
    "CalculationPriority",
    "ValidationLevel",
    "create_calculation_from_parameters",
    "get_calculation_statistics",
    "find_similar_calculations"
]