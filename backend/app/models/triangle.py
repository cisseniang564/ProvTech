"""
Modèle Triangle de développement
Gestion des données actuarielles et métadonnées associées
"""

from sqlalchemy import (
    Boolean, Column, Integer, String, DateTime, Text, ForeignKey, 
    Float, JSON, UniqueConstraint, Index
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID, ARRAY
import uuid
from datetime import datetime, date
from typing import List, Dict, Any, Optional, Tuple
from enum import Enum as PyEnum
import json
import numpy as np
import pandas as pd

from app.core.database import Base

# ================================
# ENUMS
# ================================

class TriangleType(PyEnum):
    """Types de triangle"""
    INCREMENTAL = "incremental"
    CUMULATIVE = "cumulative"
    MIXED = "mixed"


class DataType(PyEnum):
    """Types de données dans le triangle"""
    CLAIMS_PAID = "claims_paid"
    CLAIMS_INCURRED = "claims_incurred"
    CLAIMS_COUNT = "claims_count"
    PREMIUMS = "premiums"
    EXPOSURES = "exposures"
    RESERVES = "reserves"


class Currency(PyEnum):
    """Devises supportées"""
    EUR = "EUR"
    USD = "USD"
    GBP = "GBP"
    CHF = "CHF"
    CAD = "CAD"
    JPY = "JPY"


class BusinessLine(PyEnum):
    """Branches d'assurance"""
    MOTOR = "motor"
    PROPERTY = "property"
    CASUALTY = "casualty"
    MARINE = "marine"
    AVIATION = "aviation"
    CREDIT = "credit"
    HEALTH = "health"
    LIFE = "life"
    OTHER = "other"


class DataQuality(PyEnum):
    """Niveaux de qualité des données"""
    EXCELLENT = "excellent"
    GOOD = "good"
    FAIR = "fair"
    POOR = "poor"
    UNKNOWN = "unknown"


class ValidationStatus(PyEnum):
    """Statuts de validation"""
    PENDING = "pending"
    VALIDATED = "validated"
    REJECTED = "rejected"
    NEEDS_REVIEW = "needs_review"


# ================================
# MODÈLE PRINCIPAL
# ================================

class Triangle(Base):
    """
    Modèle principal pour les triangles de développement
    Stocke les données actuarielles et leurs métadonnées
    """
    __tablename__ = "triangles"
    
    # Identifiants
    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(UUID(as_uuid=True), default=uuid.uuid4, unique=True, nullable=False, index=True)
    
    # Informations de base
    name = Column(String(200), nullable=False, index=True)
    description = Column(Text, nullable=True)
    
    # Propriétaire et permissions
    owner_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    is_public = Column(Boolean, default=False, nullable=False)
    is_template = Column(Boolean, default=False, nullable=False)
    
    # Métadonnées métier
    business_line = Column(String(50), nullable=False, index=True)
    data_type = Column(String(50), nullable=False, index=True)
    triangle_type = Column(String(20), default=TriangleType.CUMULATIVE.value, nullable=False)
    currency = Column(String(3), default=Currency.EUR.value, nullable=False)
    
    # Informations temporelles
    origin_start_date = Column(DateTime(timezone=True), nullable=False)  # Première période d'origine
    origin_end_date = Column(DateTime(timezone=True), nullable=False)    # Dernière période d'origine
    valuation_date = Column(DateTime(timezone=True), nullable=False)     # Date de valorisation
    development_lags = Column(Integer, nullable=False)                   # Nombre de périodes de développement
    
    # Configuration des périodes
    origin_period = Column(String(20), default="year", nullable=False)   # year, quarter, month
    development_period = Column(String(20), default="year", nullable=False)
    
    # Données du triangle (JSON format)
    data_matrix = Column(JSON, nullable=False)  # Matrice des données principales
    volume_matrix = Column(JSON, nullable=True)  # Matrice des volumes (nombre de sinistres, expositions)
    
    # Informations de qualité
    data_quality = Column(String(20), default=DataQuality.UNKNOWN.value, nullable=False)
    validation_status = Column(String(20), default=ValidationStatus.PENDING.value, nullable=False)
    validation_notes = Column(Text, nullable=True)
    validated_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    validated_at = Column(DateTime(timezone=True), nullable=True)
    
    # Statistiques calculées
    total_amount = Column(Float, nullable=True)
    latest_diagonal = Column(Float, nullable=True)
    data_points_count = Column(Integer, nullable=True)
    missing_values_count = Column(Integer, nullable=True)
    
    # Configuration d'import
    source_file_name = Column(String(255), nullable=True)
    source_file_hash = Column(String(64), nullable=True)  # SHA-256
    import_configuration = Column(JSON, nullable=True)
    
    # Métadonnées techniques
    schema_version = Column(String(10), default="1.0", nullable=False)
    data_checksum = Column(String(64), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_calculated_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relations
    owner = relationship("User", foreign_keys=[owner_id], back_populates="triangles")
    validator = relationship("User", foreign_keys=[validated_by])
    calculations = relationship("Calculation", back_populates="triangle", cascade="all, delete-orphan")
    segments = relationship("TriangleSegment", back_populates="triangle", cascade="all, delete-orphan")
    adjustments = relationship("TriangleAdjustment", back_populates="triangle", cascade="all, delete-orphan")
    
    # Contraintes
    __table_args__ = (
        UniqueConstraint('owner_id', 'name', name='uq_triangle_owner_name'),
        Index('ix_triangle_business_data', 'business_line', 'data_type'),
        Index('ix_triangle_dates', 'origin_start_date', 'valuation_date'),
    )
    
    def __repr__(self):
        return f"<Triangle(name='{self.name}', business_line='{self.business_line}', data_type='{self.data_type}')>"
    
    # ================================
    # PROPRIÉTÉS CALCULÉES
    # ================================
    
    @property
    def dimensions(self) -> Tuple[int, int]:
        """Retourne les dimensions du triangle (origine, développement)"""
        if not self.data_matrix:
            return (0, 0)
        
        matrix = self.data_matrix
        if isinstance(matrix, dict):
            rows = len(matrix)
            cols = max(len(row) for row in matrix.values()) if rows > 0 else 0
        else:
            rows = len(matrix)
            cols = len(matrix[0]) if rows > 0 else 0
        
        return (rows, cols)
    
    @property
    def origin_periods_count(self) -> int:
        """Nombre de périodes d'origine"""
        return self.dimensions[0]
    
    @property
    def development_periods_count(self) -> int:
        """Nombre de périodes de développement"""
        return self.dimensions[1]
    
    @property
    def is_complete(self) -> bool:
        """Vérifie si le triangle est complet (forme triangulaire)"""
        if not self.data_matrix:
            return False
        
        try:
            matrix = self.get_data_as_array()
            rows, cols = matrix.shape
            
            # Vérification de la forme triangulaire
            for i in range(rows):
                for j in range(cols):
                    if i + j >= cols and not np.isnan(matrix[i, j]):
                        return False
                    if i + j < cols and np.isnan(matrix[i, j]):
                        return False
            return True
        except:
            return False
    
    @property
    def completeness_ratio(self) -> float:
        """Ratio de complétude des données (0.0 à 1.0)"""
        if not self.data_matrix:
            return 0.0
        
        try:
            matrix = self.get_data_as_array()
            total_cells = matrix.size
            non_nan_cells = np.count_nonzero(~np.isnan(matrix))
            return non_nan_cells / total_cells if total_cells > 0 else 0.0
        except:
            return 0.0
    
    @property
    def latest_origin_period(self) -> str:
        """Dernière période d'origine formatée"""
        return self.origin_end_date.strftime('%Y-%m-%d')
    
    @property
    def age_months(self) -> int:
        """Âge des données en mois"""
        today = datetime.utcnow()
        delta = today - self.valuation_date.replace(tzinfo=None)
        return int(delta.days / 30.44)  # Moyenne de jours par mois
    
    # ================================
    # MÉTHODES DE DONNÉES
    # ================================
    
    def get_data_as_array(self) -> np.ndarray:
        """
        Convertit les données en array NumPy
        
        Returns:
            np.ndarray: Matrice des données
        """
        if not self.data_matrix:
            return np.array([])
        
        try:
            if isinstance(self.data_matrix, dict):
                # Format dictionnaire {periode: [valeurs]}
                periods = sorted(self.data_matrix.keys())
                max_dev = max(len(self.data_matrix[p]) for p in periods)
                
                matrix = np.full((len(periods), max_dev), np.nan)
                for i, period in enumerate(periods):
                    values = self.data_matrix[period]
                    matrix[i, :len(values)] = values
                
                return matrix
            else:
                # Format liste de listes
                return np.array(self.data_matrix, dtype=float)
        except Exception as e:
            raise ValueError(f"Erreur de conversion des données: {e}")
    
    def get_data_as_dataframe(self) -> pd.DataFrame:
        """
        Convertit les données en DataFrame pandas
        
        Returns:
            pd.DataFrame: DataFrame avec index = périodes origine, colonnes = développement
        """
        matrix = self.get_data_as_array()
        
        # Génération des labels
        origin_labels = self.generate_origin_labels()
        dev_labels = [f"Dev_{i+1}" for i in range(matrix.shape[1])]
        
        return pd.DataFrame(
            matrix,
            index=origin_labels,
            columns=dev_labels
        )
    
    def set_data_from_array(self, matrix: np.ndarray):
        """
        Définit les données à partir d'un array NumPy
        
        Args:
            matrix: Matrice des données
        """
        # Conversion en format JSON
        self.data_matrix = matrix.tolist()
        
        # Mise à jour des statistiques
        self.update_statistics()
    
    def set_data_from_dataframe(self, df: pd.DataFrame):
        """
        Définit les données à partir d'un DataFrame
        
        Args:
            df: DataFrame avec les données
        """
        matrix = df.values
        self.set_data_from_array(matrix)
    
    def generate_origin_labels(self) -> List[str]:
        """
        Génère les labels des périodes d'origine
        
        Returns:
            List[str]: Liste des labels
        """
        labels = []
        current_date = self.origin_start_date
        
        rows, _ = self.dimensions
        for i in range(rows):
            if self.origin_period == "year":
                labels.append(current_date.strftime('%Y'))
                current_date = current_date.replace(year=current_date.year + 1)
            elif self.origin_period == "quarter":
                quarter = (current_date.month - 1) // 3 + 1
                labels.append(f"{current_date.year}Q{quarter}")
                # Ajouter 3 mois
                month = current_date.month + 3
                year = current_date.year
                if month > 12:
                    month -= 12
                    year += 1
                current_date = current_date.replace(year=year, month=month)
            elif self.origin_period == "month":
                labels.append(current_date.strftime('%Y-%m'))
                # Ajouter 1 mois
                month = current_date.month + 1
                year = current_date.year
                if month > 12:
                    month = 1
                    year += 1
                current_date = current_date.replace(year=year, month=month)
        
        return labels
    
    def update_statistics(self):
        """Met à jour les statistiques calculées du triangle"""
        try:
            matrix = self.get_data_as_array()
            
            if matrix.size == 0:
                self.total_amount = None
                self.latest_diagonal = None
                self.data_points_count = 0
                self.missing_values_count = 0
                return
            
            # Statistiques de base
            valid_data = matrix[~np.isnan(matrix)]
            self.total_amount = float(np.sum(valid_data)) if len(valid_data) > 0 else None
            self.data_points_count = len(valid_data)
            self.missing_values_count = int(np.sum(np.isnan(matrix)))
            
            # Dernière diagonal (valeurs les plus récentes)
            rows, cols = matrix.shape
            diagonal_values = []
            for i in range(min(rows, cols)):
                if not np.isnan(matrix[i, cols - 1 - i]):
                    diagonal_values.append(matrix[i, cols - 1 - i])
            
            self.latest_diagonal = float(np.sum(diagonal_values)) if diagonal_values else None
            
            # Checksum des données
            self.data_checksum = self.calculate_data_checksum()
            
        except Exception as e:
            # En cas d'erreur, on met des valeurs par défaut
            self.total_amount = None
            self.latest_diagonal = None
            self.data_points_count = 0
            self.missing_values_count = 0
    
    def calculate_data_checksum(self) -> str:
        """
        Calcule un checksum des données pour détecter les modifications
        
        Returns:
            str: Checksum SHA-256
        """
        import hashlib
        
        try:
            matrix = self.get_data_as_array()
            # Conversion en bytes pour le hash
            data_bytes = matrix.tobytes()
            return hashlib.sha256(data_bytes).hexdigest()
        except:
            return ""
    
    # ================================
    # MÉTHODES DE VALIDATION
    # ================================
    
    def validate_data_structure(self) -> List[str]:
        """
        Valide la structure des données
        
        Returns:
            List[str]: Liste des erreurs trouvées
        """
        errors = []
        
        try:
            matrix = self.get_data_as_array()
            
            if matrix.size == 0:
                errors.append("Le triangle ne contient aucune donnée")
                return errors
            
            rows, cols = matrix.shape
            
            # Vérifications de base
            if rows < 2:
                errors.append("Le triangle doit contenir au moins 2 périodes d'origine")
            
            if cols < 2:
                errors.append("Le triangle doit contenir au moins 2 périodes de développement")
            
            # Vérification des valeurs négatives
            valid_data = matrix[~np.isnan(matrix)]
            if self.data_type in [DataType.CLAIMS_PAID.value, DataType.CLAIMS_COUNT.value, DataType.PREMIUMS.value]:
                if np.any(valid_data < 0):
                    errors.append(f"Des valeurs négatives détectées pour le type de données {self.data_type}")
            
            # Vérification de la cohérence cumulé/incrémental
            if self.triangle_type == TriangleType.CUMULATIVE.value:
                # Pour les cumulés, vérifier que les valeurs sont croissantes
                for i in range(rows):
                    row_data = matrix[i, :cols]
                    valid_indices = ~np.isnan(row_data)
                    if np.sum(valid_indices) > 1:
                        valid_values = row_data[valid_indices]
                        if not np.all(np.diff(valid_values) >= 0):
                            errors.append(f"Ligne {i+1}: les valeurs cumulées ne sont pas croissantes")
            
            # Vérification de la complétude
            if self.completeness_ratio < 0.5:
                errors.append("Le triangle contient trop de valeurs manquantes (>50%)")
            
        except Exception as e:
            errors.append(f"Erreur lors de la validation: {e}")
        
        return errors
    
    def validate_business_rules(self) -> List[str]:
        """
        Valide les règles métier spécifiques
        
        Returns:
            List[str]: Liste des avertissements
        """
        warnings = []
        
        try:
            matrix = self.get_data_as_array()
            
            if matrix.size == 0:
                return warnings
            
            # Règles par type de données
            if self.data_type == DataType.CLAIMS_PAID.value:
                # Vérification des montants anormalement élevés
                valid_data = matrix[~np.isnan(matrix)]
                if len(valid_data) > 0:
                    q99 = np.percentile(valid_data, 99)
                    median = np.median(valid_data)
                    if q99 > median * 100:  # Valeur extrême
                        warnings.append("Détection de valeurs potentiellement anormales (>100x la médiane)")
            
            # Vérification de l'âge des données
            if self.age_months > 36:
                warnings.append(f"Les données datent de {self.age_months} mois (>3 ans)")
            
            # Vérification de la taille du triangle
            rows, cols = self.dimensions
            if rows > 20 or cols > 20:
                warnings.append("Triangle de grande taille (>20x20), performance potentiellement dégradée")
            
        except Exception as e:
            warnings.append(f"Erreur lors de la validation métier: {e}")
        
        return warnings
    
    def is_valid(self) -> bool:
        """
        Vérifie si le triangle est valide
        
        Returns:
            bool: True si valide
        """
        errors = self.validate_data_structure()
        return len(errors) == 0
    
    # ================================
    # MÉTHODES D'EXPORT
    # ================================
    
    def to_dict(self) -> Dict[str, Any]:
        """
        Exporte le triangle en dictionnaire
        
        Returns:
            Dict: Représentation complète du triangle
        """
        return {
            "id": self.id,
            "uuid": str(self.uuid),
            "name": self.name,
            "description": self.description,
            "business_line": self.business_line,
            "data_type": self.data_type,
            "triangle_type": self.triangle_type,
            "currency": self.currency,
            "origin_start_date": self.origin_start_date.isoformat(),
            "origin_end_date": self.origin_end_date.isoformat(),
            "valuation_date": self.valuation_date.isoformat(),
            "development_lags": self.development_lags,
            "origin_period": self.origin_period,
            "development_period": self.development_period,
            "data_matrix": self.data_matrix,
            "volume_matrix": self.volume_matrix,
            "data_quality": self.data_quality,
            "validation_status": self.validation_status,
            "dimensions": self.dimensions,
            "completeness_ratio": self.completeness_ratio,
            "total_amount": self.total_amount,
            "latest_diagonal": self.latest_diagonal,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "is_public": self.is_public,
            "is_template": self.is_template
        }
    
    def to_csv_format(self) -> str:
        """
        Exporte le triangle en format CSV
        
        Returns:
            str: Données CSV
        """
        df = self.get_data_as_dataframe()
        return df.to_csv()
    
    def to_excel_format(self) -> bytes:
        """
        Exporte le triangle en format Excel
        
        Returns:
            bytes: Données Excel
        """
        from io import BytesIO
        
        df = self.get_data_as_dataframe()
        buffer = BytesIO()
        
        with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
            # Feuille principale avec les données
            df.to_excel(writer, sheet_name='Data', index=True)
            
            # Feuille métadonnées
            metadata = pd.DataFrame([
                ['Nom', self.name],
                ['Description', self.description or ''],
                ['Branche', self.business_line],
                ['Type de données', self.data_type],
                ['Type de triangle', self.triangle_type],
                ['Devise', self.currency],
                ['Date de valorisation', self.valuation_date.strftime('%Y-%m-%d')],
                ['Qualité des données', self.data_quality],
                ['Statut de validation', self.validation_status],
                ['Dimensions', f"{self.dimensions[0]}x{self.dimensions[1]}"],
                ['Complétude', f"{self.completeness_ratio:.1%}"],
                ['Total', self.total_amount or 'N/A']
            ], columns=['Attribut', 'Valeur'])
            
            metadata.to_excel(writer, sheet_name='Metadata', index=False)
        
        buffer.seek(0)
        return buffer.getvalue()


# ================================
# MODÈLES AUXILIAIRES
# ================================

class TriangleSegment(Base):
    """
    Segmentation des triangles
    Permet de diviser un triangle en sous-segments
    """
    __tablename__ = "triangle_segments"
    
    id = Column(Integer, primary_key=True, index=True)
    triangle_id = Column(Integer, ForeignKey('triangles.id'), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    
    # Critères de segmentation
    segment_type = Column(String(50), nullable=False)  # geography, product, channel, etc.
    segment_value = Column(String(100), nullable=False)
    
    # Données du segment
    data_matrix = Column(JSON, nullable=False)
    weight = Column(Float, nullable=True)  # Poids relatif du segment
    
    # Métadonnées
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relations
    triangle = relationship("Triangle", back_populates="segments")
    
    def __repr__(self):
        return f"<TriangleSegment(triangle='{self.triangle.name}', segment='{self.name}')>"


class TriangleAdjustment(Base):
    """
    Ajustements apportés aux triangles
    Historique des modifications et corrections
    """
    __tablename__ = "triangle_adjustments"
    
    id = Column(Integer, primary_key=True, index=True)
    triangle_id = Column(Integer, ForeignKey('triangles.id'), nullable=False)
    
    # Type d'ajustement
    adjustment_type = Column(String(50), nullable=False)  # correction, outlier_removal, smoothing
    description = Column(Text, nullable=False)
    
    # Détails de l'ajustement
    origin_period_index = Column(Integer, nullable=True)
    development_period_index = Column(Integer, nullable=True)
    old_value = Column(Float, nullable=True)
    new_value = Column(Float, nullable=True)
    
    # Justification
    reason = Column(Text, nullable=False)
    applied_by = Column(Integer, ForeignKey('users.id'), nullable=False)
    
    # Métadonnées
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relations
    triangle = relationship("Triangle", back_populates="adjustments")
    applied_by_user = relationship("User")
    
    def __repr__(self):
        return f"<TriangleAdjustment(triangle='{self.triangle.name}', type='{self.adjustment_type}')>"


class TriangleTemplate(Base):
    """
    Templates de triangles
    Modèles prédéfinis pour faciliter la création
    """
    __tablename__ = "triangle_templates"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    
    # Configuration du template
    business_line = Column(String(50), nullable=False)
    data_type = Column(String(50), nullable=False)
    triangle_type = Column(String(20), nullable=False)
    default_currency = Column(String(3), nullable=False)
    
    # Structure par défaut
    default_dimensions = Column(JSON, nullable=False)  # {rows: 10, cols: 10}
    default_periods = Column(JSON, nullable=False)     # {origin: "year", development: "year"}
    
    # Configuration des validations
    validation_rules = Column(JSON, nullable=True)
    business_rules = Column(JSON, nullable=True)
    
    # Métadonnées
    is_public = Column(Boolean, default=True, nullable=False)
    created_by = Column(Integer, ForeignKey('users.id'), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    usage_count = Column(Integer, default=0, nullable=False)
    
    # Relations
    creator = relationship("User")
    
    def __repr__(self):
        return f"<TriangleTemplate(name='{self.name}', business_line='{self.business_line}')>"


# ================================
# FONCTIONS UTILITAIRES
# ================================

def create_sample_triangle(
    owner_id: int,
    name: str = "Triangle de test",
    business_line: str = BusinessLine.MOTOR.value,
    data_type: str = DataType.CLAIMS_PAID.value
) -> Triangle:
    """
    Crée un triangle d'exemple pour les tests
    
    Args:
        owner_id: ID du propriétaire
        name: Nom du triangle
        business_line: Branche d'assurance
        data_type: Type de données
        
    Returns:
        Triangle: Triangle d'exemple
    """
    # Données d'exemple (triangle 5x5)
    sample_data = [
        [1000, 1100, 1150, 1170, 1180],
        [2000, 2200, 2280, 2300, np.nan],
        [1500, 1650, 1700, np.nan, np.nan],
        [3000, 3300, np.nan, np.nan, np.nan],
        [2500, np.nan, np.nan, np.nan, np.nan]
    ]
    
    # Dates d'exemple
    from datetime import datetime, timedelta
    start_date = datetime(2019, 1, 1)
    end_date = datetime(2023, 1, 1)
    valuation_date = datetime(2024, 1, 1)
    
    triangle = Triangle(
        name=name,
        description="Triangle d'exemple généré automatiquement",
        owner_id=owner_id,
        business_line=business_line,
        data_type=data_type,
        triangle_type=TriangleType.CUMULATIVE.value,
        currency=Currency.EUR.value,
        origin_start_date=start_date,
        origin_end_date=end_date,
        valuation_date=valuation_date,
        development_lags=5,
        origin_period="year",
        development_period="year",
        data_matrix=sample_data,
        data_quality=DataQuality.GOOD.value
    )
    
    # Mise à jour des statistiques
    triangle.update_statistics()
    
    return triangle


def validate_triangle_import(data: Dict[str, Any]) -> List[str]:
    """
    Valide les données d'import d'un triangle
    
    Args:
        data: Données à valider
        
    Returns:
        List[str]: Liste des erreurs
    """
    errors = []
    
    # Champs requis
    required_fields = ['name', 'business_line', 'data_type', 'data_matrix']
    for field in required_fields:
        if field not in data or not data[field]:
            errors.append(f"Champ requis manquant: {field}")
    
    # Validation des valeurs énumérées
    if 'business_line' in data:
        valid_business_lines = [e.value for e in BusinessLine]
        if data['business_line'] not in valid_business_lines:
            errors.append(f"Branche d'assurance invalide: {data['business_line']}")
    
    if 'data_type' in data:
        valid_data_types = [e.value for e in DataType]
        if data['data_type'] not in valid_data_types:
            errors.append(f"Type de données invalide: {data['data_type']}")
    
    # Validation de la matrice de données
    if 'data_matrix' in data:
        try:
            matrix = np.array(data['data_matrix'], dtype=float)
            if matrix.size == 0:
                errors.append("La matrice de données est vide")
            elif matrix.ndim != 2:
                errors.append("La matrice de données doit être bidimensionnelle")
            elif matrix.shape[0] < 2 or matrix.shape[1] < 2:
                errors.append("La matrice doit avoir au moins 2x2 dimensions")
        except (ValueError, TypeError):
            errors.append("Format de matrice de données invalide")
    
    return errors


# ================================
# EXPORTS
# ================================

__all__ = [
    "Triangle",
    "TriangleSegment", 
    "TriangleAdjustment",
    "TriangleTemplate",
    "TriangleType",
    "DataType",
    "Currency",
    "BusinessLine",
    "DataQuality",
    "ValidationStatus",
    "create_sample_triangle",
    "validate_triangle_import"
]