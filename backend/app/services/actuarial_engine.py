"""
Moteur de calculs actuariels
Implémentation des méthodes de provisionnement techniques
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Any, Union
from dataclasses import dataclass, field
from abc import ABC, abstractmethod
from enum import Enum
import logging
from datetime import datetime
import warnings

from app.models.triangle import Triangle, TriangleType, DataType
from app.core.config import settings

# Configuration du logging
logger = logging.getLogger(__name__)

# ================================
# ENUMS ET CONSTANTES
# ================================

class CalculationMethod(Enum):
    """Méthodes de calcul disponibles"""
    CHAIN_LADDER = "chain_ladder"
    BORNHUETTER_FERGUSON = "bornhuetter_ferguson"
    MACK = "mack"
    CAPE_COD = "cape_cod"
    EXPECTED_LOSS_RATIO = "expected_loss_ratio"
    GENERALISED_CAPE_COD = "generalised_cape_cod"


class TailMethod(Enum):
    """Méthodes d'extrapolation de la queue"""
    NONE = "none"
    CONSTANT = "constant"
    CURVE_FITTING = "curve_fitting"
    EXPONENTIAL = "exponential"
    INVERSE_POWER = "inverse_power"


# ================================
# CLASSES DE DONNÉES
# ================================

@dataclass
class CalculationParameters:
    """
    Paramètres de calcul pour les méthodes actuarielles
    """
    # Paramètres généraux
    method: CalculationMethod
    confidence_level: float = 0.75
    tail_method: TailMethod = TailMethod.CONSTANT
    tail_factor: float = 1.0
    
    # Paramètres spécifiques Chain Ladder
    alpha: float = 1.0  # Paramètre de lissage
    use_volume_weighted: bool = False
    exclude_outliers: bool = False
    outlier_threshold: float = 3.0  # Seuils en écarts-types
    
    # Paramètres Bornhuetter-Ferguson
    expected_loss_ratio: Optional[float] = None
    premium_data: Optional[np.ndarray] = None
    
    # Paramètres Cape Cod
    exposure_data: Optional[np.ndarray] = None
    initial_expected_loss_ratio: float = 0.65
    
    # Paramètres Mack
    estimate_tail: bool = True
    tail_se: bool = True
    bootstrap_samples: int = 1000
    
    # Métadonnées
    description: str = ""
    user_notes: str = ""
    custom_parameters: Dict[str, Any] = field(default_factory=dict)
    
    def validate(self) -> List[str]:
        """Valide les paramètres"""
        errors = []
        
        if not 0 < self.confidence_level < 1:
            errors.append("Le niveau de confiance doit être entre 0 et 1")
        
        if self.tail_factor < 1.0:
            errors.append("Le facteur de queue doit être >= 1.0")
        
        if self.outlier_threshold < 1.0:
            errors.append("Le seuil d'outliers doit être >= 1.0")
        
        # Validations spécifiques par méthode
        if self.method == CalculationMethod.BORNHUETTER_FERGUSON:
            if self.expected_loss_ratio is None:
                errors.append("Bornhuetter-Ferguson: ratio de sinistralité attendu requis")
            elif not 0 < self.expected_loss_ratio < 5:
                errors.append("Ratio de sinistralité attendu doit être entre 0 et 5")
        
        if self.method == CalculationMethod.CAPE_COD:
            if self.exposure_data is None:
                errors.append("Cape Cod: données d'exposition requises")
        
        return errors


@dataclass
class CalculationResult:
    """
    Résultats d'un calcul actuariel
    """
    # Résultats principaux
    ultimate_claims: np.ndarray  # Charges ultimes par période d'origine
    reserves: np.ndarray         # Provisions par période d'origine
    development_factors: np.ndarray  # Facteurs de développement
    
    # Statistiques
    total_ultimate: float
    total_reserves: float
    total_paid: float
    coefficient_of_variation: Optional[float] = None
    
    # Métriques de qualité
    r_squared: Optional[float] = None
    mean_squared_error: Optional[float] = None
    residuals: Optional[np.ndarray] = None
    
    # Intervalles de confiance (si calculés)
    ultimate_lower: Optional[np.ndarray] = None
    ultimate_upper: Optional[np.ndarray] = None
    reserves_lower: Optional[np.ndarray] = None
    reserves_upper: Optional[np.ndarray] = None
    
    # Données intermédiaires
    fitted_triangle: Optional[np.ndarray] = None
    age_to_age_factors: Optional[np.ndarray] = None
    tail_factor: Optional[float] = None
    
    # Métadonnées
    method_used: CalculationMethod
    parameters_used: CalculationParameters
    calculation_date: datetime = field(default_factory=datetime.utcnow)
    computation_time_ms: Optional[float] = None
    warnings: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convertit les résultats en dictionnaire"""
        return {
            "ultimate_claims": self.ultimate_claims.tolist() if self.ultimate_claims is not None else None,
            "reserves": self.reserves.tolist() if self.reserves is not None else None,
            "development_factors": self.development_factors.tolist() if self.development_factors is not None else None,
            "total_ultimate": self.total_ultimate,
            "total_reserves": self.total_reserves,
            "total_paid": self.total_paid,
            "coefficient_of_variation": self.coefficient_of_variation,
            "r_squared": self.r_squared,
            "mean_squared_error": self.mean_squared_error,
            "method_used": self.method_used.value,
            "calculation_date": self.calculation_date.isoformat(),
            "computation_time_ms": self.computation_time_ms,
            "warnings": self.warnings
        }


# ================================
# CLASSES DE BASE
# ================================

class ActuarialMethod(ABC):
    """
    Classe abstraite pour les méthodes actuarielles
    """
    
    def __init__(self, name: str, description: str):
        self.name = name
        self.description = description
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
    
    @abstractmethod
    def calculate(self, triangle_data: np.ndarray, parameters: CalculationParameters) -> CalculationResult:
        """
        Calcule les provisions selon la méthode
        
        Args:
            triangle_data: Matrice des données du triangle
            parameters: Paramètres de calcul
            
        Returns:
            CalculationResult: Résultats du calcul
        """
        pass
    
    @abstractmethod
    def validate_inputs(self, triangle_data: np.ndarray, parameters: CalculationParameters) -> List[str]:
        """
        Valide les données d'entrée pour la méthode
        
        Args:
            triangle_data: Matrice des données
            parameters: Paramètres
            
        Returns:
            List[str]: Liste des erreurs de validation
        """
        pass
    
    def _remove_outliers(self, data: np.ndarray, threshold: float = 3.0) -> np.ndarray:
        """
        Supprime les outliers basés sur les écarts-types
        
        Args:
            data: Données à nettoyer
            threshold: Seuil en écarts-types
            
        Returns:
            np.ndarray: Données nettoyées
        """
        if data.size == 0:
            return data
        
        clean_data = data.copy()
        valid_mask = ~np.isnan(data)
        
        if np.sum(valid_mask) < 3:  # Pas assez de données
            return clean_data
        
        valid_data = data[valid_mask]
        mean_val = np.mean(valid_data)
        std_val = np.std(valid_data)
        
        # Identifie les outliers
        outlier_mask = np.abs(data - mean_val) > threshold * std_val
        
        # Remplace les outliers par NaN
        clean_data[outlier_mask] = np.nan
        
        return clean_data
    
    def _apply_tail_factor(self, development_factors: np.ndarray, tail_method: TailMethod, tail_factor: float) -> np.ndarray:
        """
        Applique un facteur de queue aux facteurs de développement
        
        Args:
            development_factors: Facteurs de développement
            tail_method: Méthode d'extrapolation
            tail_factor: Facteur de queue
            
        Returns:
            np.ndarray: Facteurs avec queue
        """
        if tail_method == TailMethod.NONE:
            return development_factors
        
        factors_with_tail = development_factors.copy()
        
        if tail_method == TailMethod.CONSTANT:
            # Ajoute simplement le facteur de queue
            factors_with_tail = np.append(factors_with_tail, tail_factor)
        
        elif tail_method == TailMethod.EXPONENTIAL:
            # Extrapolation exponentielle des derniers facteurs
            if len(development_factors) >= 3:
                last_factors = development_factors[-3:]
                # Ajuste exponentiellement vers 1.0
                decay_rate = np.mean(np.log(last_factors - 1))
                tail_factor_calc = 1 + np.exp(decay_rate * len(development_factors))
                factors_with_tail = np.append(factors_with_tail, max(tail_factor_calc, 1.0))
        
        elif tail_method == TailMethod.CURVE_FITTING:
            # Ajustement de courbe sur les facteurs
            if len(development_factors) >= 4:
                x = np.arange(1, len(development_factors) + 1)
                y = development_factors - 1  # Décalage pour tendre vers 0
                
                # Ajustement polynomial de degré 2
                try:
                    coeffs = np.polyfit(x, y, 2)
                    next_x = len(development_factors) + 1
                    tail_factor_calc = 1 + np.polyval(coeffs, next_x)
                    factors_with_tail = np.append(factors_with_tail, max(tail_factor_calc, 1.0))
                except:
                    factors_with_tail = np.append(factors_with_tail, tail_factor)
        
        return factors_with_tail


# ================================
# MÉTHODE CHAIN LADDER
# ================================

class ChainLadderMethod(ActuarialMethod):
    """
    Implémentation de la méthode Chain Ladder
    """
    
    def __init__(self):
        super().__init__("Chain Ladder", "Méthode classique de développement des sinistres")
    
    def validate_inputs(self, triangle_data: np.ndarray, parameters: CalculationParameters) -> List[str]:
        """Validation spécifique Chain Ladder"""
        errors = []
        
        if triangle_data.size == 0:
            errors.append("Triangle de données vide")
            return errors
        
        rows, cols = triangle_data.shape
        
        if rows < 2 or cols < 2:
            errors.append("Le triangle doit avoir au moins 2x2 dimensions")
        
        # Vérification qu'il y a assez de données pour calculer des facteurs
        valid_data_count = np.sum(~np.isnan(triangle_data))
        if valid_data_count < rows + cols - 1:
            errors.append("Pas assez de données valides pour le calcul")
        
        return errors
    
    def calculate(self, triangle_data: np.ndarray, parameters: CalculationParameters) -> CalculationResult:
        """
        Calcul Chain Ladder
        """
        start_time = datetime.utcnow()
        warnings_list = []
        
        # Validation
        validation_errors = self.validate_inputs(triangle_data, parameters)
        if validation_errors:
            raise ValueError(f"Erreurs de validation: {'; '.join(validation_errors)}")
        
        # Nettoyage des outliers si demandé
        clean_data = triangle_data.copy()
        if parameters.exclude_outliers:
            clean_data = self._remove_outliers(clean_data, parameters.outlier_threshold)
            outliers_removed = np.sum(np.isnan(clean_data) & ~np.isnan(triangle_data))
            if outliers_removed > 0:
                warnings_list.append(f"{outliers_removed} outliers supprimés")
        
        rows, cols = clean_data.shape
        
        # === CALCUL DES FACTEURS DE DÉVELOPPEMENT ===
        
        # Méthode simple ou pondérée par les volumes
        if parameters.use_volume_weighted and parameters.custom_parameters.get('volume_data') is not None:
            age_to_age_factors = self._calculate_volume_weighted_factors(
                clean_data, 
                parameters.custom_parameters['volume_data']
            )
        else:
            age_to_age_factors = self._calculate_simple_factors(clean_data, parameters.alpha)
        
        # Application du facteur de queue
        development_factors = self._apply_tail_factor(
            age_to_age_factors, 
            parameters.tail_method, 
            parameters.tail_factor
        )
        
        # === PROJECTION DU TRIANGLE ===
        
        ultimate_claims = np.zeros(rows)
        fitted_triangle = clean_data.copy()
        
        for i in range(rows):
            # Trouve la dernière valeur valide
            last_valid_col = -1
            for j in range(cols):
                if not np.isnan(clean_data[i, j]):
                    last_valid_col = j
            
            if last_valid_col == -1:
                ultimate_claims[i] = 0
                continue
            
            # Projette en utilisant les facteurs
            current_value = clean_data[i, last_valid_col]
            
            # Applique les facteurs de développement restants
            for j in range(last_valid_col + 1, len(development_factors)):
                if j < len(development_factors):
                    current_value *= development_factors[j]
                    if j < cols:
                        fitted_triangle[i, j] = current_value
            
            ultimate_claims[i] = current_value
        
        # === CALCUL DES PROVISIONS ===
        
        # Dernière diagonal (valeurs payées à date)
        paid_to_date = np.zeros(rows)
        for i in range(rows):
            for j in range(min(cols, cols - i)):
                if not np.isnan(clean_data[i, j]):
                    paid_to_date[i] = clean_data[i, j]
        
        reserves = ultimate_claims - paid_to_date
        reserves = np.maximum(reserves, 0)  # Pas de provisions négatives
        
        # === CALCUL DES MÉTRIQUES DE QUALITÉ ===
        
        r_squared = self._calculate_r_squared(clean_data, fitted_triangle)
        mse = self._calculate_mse(clean_data, fitted_triangle)
        residuals = self._calculate_residuals(clean_data, fitted_triangle)
        
        # === INTERVALLES DE CONFIANCE (Méthode Mack simplifiée) ===
        
        ultimate_lower, ultimate_upper = None, None
        if parameters.confidence_level and len(age_to_age_factors) > 1:
            try:
                ultimate_lower, ultimate_upper = self._calculate_confidence_intervals(
                    clean_data, development_factors, ultimate_claims, parameters.confidence_level
                )
            except Exception as e:
                warnings_list.append(f"Impossible de calculer les intervalles de confiance: {e}")
        
        # Temps de calcul
        computation_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        
        # Construction du résultat
        result = CalculationResult(
            ultimate_claims=ultimate_claims,
            reserves=reserves,
            development_factors=development_factors,
            total_ultimate=np.sum(ultimate_claims),
            total_reserves=np.sum(reserves),
            total_paid=np.sum(paid_to_date),
            r_squared=r_squared,
            mean_squared_error=mse,
            residuals=residuals,
            ultimate_lower=ultimate_lower,
            ultimate_upper=ultimate_upper,
            fitted_triangle=fitted_triangle,
            age_to_age_factors=age_to_age_factors,
            tail_factor=parameters.tail_factor if parameters.tail_method != TailMethod.NONE else None,
            method_used=CalculationMethod.CHAIN_LADDER,
            parameters_used=parameters,
            computation_time_ms=computation_time,
            warnings=warnings_list
        )
        
        self.logger.info(f"Chain Ladder calculé: {result.total_ultimate:.0f} ultimate, {result.total_reserves:.0f} reserves")
        
        return result
    
    def _calculate_simple_factors(self, triangle_data: np.ndarray, alpha: float = 1.0) -> np.ndarray:
        """
        Calcule les facteurs de développement simples
        
        Args:
            triangle_data: Données du triangle
            alpha: Paramètre de lissage (1.0 = pas de lissage)
            
        Returns:
            np.ndarray: Facteurs de développement
        """
        rows, cols = triangle_data.shape
        factors = []
        
        for j in range(cols - 1):
            numerator = 0
            denominator = 0
            
            for i in range(rows - j - 1):
                if not np.isnan(triangle_data[i, j]) and not np.isnan(triangle_data[i, j + 1]):
                    # Pondération par la puissance alpha de la valeur antérieure
                    weight = triangle_data[i, j] ** alpha if alpha != 1.0 else 1.0
                    numerator += triangle_data[i, j + 1] * weight
                    denominator += triangle_data[i, j] * weight
            
            if denominator > 0:
                factor = numerator / denominator
                factors.append(max(factor, 1.0))  # Facteur minimum de 1.0
            else:
                factors.append(1.0)
        
        return np.array(factors)
    
    def _calculate_volume_weighted_factors(self, triangle_data: np.ndarray, volume_data: np.ndarray) -> np.ndarray:
        """
        Calcule les facteurs pondérés par les volumes
        
        Args:
            triangle_data: Données du triangle
            volume_data: Données de volume (nombre de sinistres, expositions)
            
        Returns:
            np.ndarray: Facteurs pondérés
        """
        rows, cols = triangle_data.shape
        factors = []
        
        for j in range(cols - 1):
            numerator = 0
            denominator = 0
            
            for i in range(rows - j - 1):
                if (not np.isnan(triangle_data[i, j]) and 
                    not np.isnan(triangle_data[i, j + 1]) and
                    not np.isnan(volume_data[i, j]) and 
                    volume_data[i, j] > 0):
                    
                    weight = volume_data[i, j]
                    numerator += triangle_data[i, j + 1] * weight
                    denominator += triangle_data[i, j] * weight
            
            if denominator > 0:
                factor = numerator / denominator
                factors.append(max(factor, 1.0))
            else:
                factors.append(1.0)
        
        return np.array(factors)
    
    def _calculate_confidence_intervals(
        self, 
        triangle_data: np.ndarray, 
        development_factors: np.ndarray,
        ultimate_claims: np.ndarray,
        confidence_level: float
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Calcule les intervalles de confiance selon Mack
        
        Args:
            triangle_data: Données du triangle
            development_factors: Facteurs de développement
            ultimate_claims: Charges ultimes
            confidence_level: Niveau de confiance
            
        Returns:
            Tuple[np.ndarray, np.ndarray]: Bornes inférieures et supérieures
        """
        from scipy import stats
        
        rows, cols = triangle_data.shape
        
        # Calcul des variances des facteurs de développement
        factor_variances = []
        
        for j in range(len(development_factors) - 1):  # Exclut le tail factor
            residuals = []
            
            for i in range(rows - j - 1):
                if not np.isnan(triangle_data[i, j]) and not np.isnan(triangle_data[i, j + 1]):
                    expected = triangle_data[i, j] * development_factors[j]
                    actual = triangle_data[i, j + 1]
                    residual = (actual - expected) / np.sqrt(triangle_data[i, j])
                    residuals.append(residual)
            
            if len(residuals) > 1:
                variance = np.var(residuals, ddof=1)
                factor_variances.append(variance)
            else:
                factor_variances.append(0.0)
        
        # Calcul de l'erreur standard pour chaque période d'origine
        standard_errors = np.zeros(rows)
        
        for i in range(rows):
            se_squared = 0
            
            # Trouve la position actuelle
            last_valid_col = -1
            for j in range(cols):
                if not np.isnan(triangle_data[i, j]):
                    last_valid_col = j
            
            if last_valid_col >= 0 and last_valid_col < cols - 1:
                current_value = triangle_data[i, last_valid_col]
                
                # Accumule la variance pour chaque facteur futur
                for j in range(last_valid_col, min(len(factor_variances), cols - 1)):
                    if j < len(factor_variances) and current_value > 0:
                        se_squared += factor_variances[j] * current_value
                        current_value *= development_factors[j]
            
            standard_errors[i] = np.sqrt(se_squared)
        
        # Calcul des intervalles de confiance
        z_score = stats.norm.ppf((1 + confidence_level) / 2)
        
        lower_bounds = ultimate_claims - z_score * standard_errors
        upper_bounds = ultimate_claims + z_score * standard_errors
        
        # Assure que les bornes sont positives
        lower_bounds = np.maximum(lower_bounds, 0)
        
        return lower_bounds, upper_bounds
    
    def _calculate_r_squared(self, actual: np.ndarray, fitted: np.ndarray) -> float:
        """Calcule le R²"""
        actual_flat = actual[~np.isnan(actual)]
        fitted_flat = fitted[~np.isnan(fitted) & ~np.isnan(actual)]
        
        if len(actual_flat) != len(fitted_flat) or len(actual_flat) < 2:
            return None
        
        ss_res = np.sum((actual_flat - fitted_flat) ** 2)
        ss_tot = np.sum((actual_flat - np.mean(actual_flat)) ** 2)
        
        return 1 - (ss_res / ss_tot) if ss_tot > 0 else None
    
    def _calculate_mse(self, actual: np.ndarray, fitted: np.ndarray) -> float:
        """Calcule l'erreur quadratique moyenne"""
        actual_flat = actual[~np.isnan(actual)]
        fitted_flat = fitted[~np.isnan(fitted) & ~np.isnan(actual)]
        
        if len(actual_flat) != len(fitted_flat) or len(actual_flat) == 0:
            return None
        
        return np.mean((actual_flat - fitted_flat) ** 2)
    
    def _calculate_residuals(self, actual: np.ndarray, fitted: np.ndarray) -> np.ndarray:
        """Calcule les résidus"""
        residuals = actual - fitted
        return residuals[~np.isnan(residuals)]


# ================================
# MÉTHODE BORNHUETTER-FERGUSON
# ================================

class BornhuetterFergusonMethod(ActuarialMethod):
    """
    Implémentation de la méthode Bornhuetter-Ferguson
    """
    
    def __init__(self):
        super().__init__("Bornhuetter-Ferguson", "Méthode combinant développement observé et sinistralité attendue")
    
    def validate_inputs(self, triangle_data: np.ndarray, parameters: CalculationParameters) -> List[str]:
        """Validation Bornhuetter-Ferguson"""
        errors = []
        
        if triangle_data.size == 0:
            errors.append("Triangle de données vide")
        
        if parameters.expected_loss_ratio is None:
            errors.append("Ratio de sinistralité attendu requis")
        
        if parameters.premium_data is None:
            errors.append("Données de primes requises")
        
        return errors
    
    def calculate(self, triangle_data: np.ndarray, parameters: CalculationParameters) -> CalculationResult:
        """
        Calcul Bornhuetter-Ferguson
        """
        start_time = datetime.utcnow()
        warnings_list = []
        
        # Validation
        validation_errors = self.validate_inputs(triangle_data, parameters)
        if validation_errors:
            raise ValueError(f"Erreurs de validation: {'; '.join(validation_errors)}")
        
        rows, cols = triangle_data.shape
        premium_data = parameters.premium_data
        expected_lr = parameters.expected_loss_ratio
        
        # Calcul des facteurs de développement avec Chain Ladder
        chain_ladder = ChainLadderMethod()
        cl_params = CalculationParameters(
            method=CalculationMethod.CHAIN_LADDER,
            confidence_level=parameters.confidence_level,
            tail_method=parameters.tail_method,
            tail_factor=parameters.tail_factor
        )
        
        cl_result = chain_ladder.calculate(triangle_data, cl_params)
        development_factors = cl_result.development_factors
        
        # Calcul des pourcentages de développement cumulés
        cumulative_factors = np.cumprod(development_factors)
        
        # Charges ultimes selon Bornhuetter-Ferguson
        ultimate_claims = np.zeros(rows)
        
        for i in range(rows):
            # Trouve la dernière observation
            last_valid_col = -1
            for j in range(cols):
                if not np.isnan(triangle_data[i, j]):
                    last_valid_col = j
            
            if last_valid_col == -1 or i >= len(premium_data):
                ultimate_claims[i] = 0
                continue
            
            # Charge payée à date
            paid_to_date = triangle_data[i, last_valid_col]
            
            # Charge attendue ultime
            expected_ultimate = premium_data[i] * expected_lr
            
            # Pourcentage de développement atteint
            if last_valid_col < len(cumulative_factors):
                percent_developed = 1.0 / cumulative_factors[last_valid_col]
            else:
                percent_developed = 1.0
            
            # Formule Bornhuetter-Ferguson
            # Ultimate = Payé + (Attendu - Payé) * (1 - % développé)
            unpaid_expected = expected_ultimate - paid_to_date
            ultimate_claims[i] = paid_to_date + unpaid_expected * (1 - percent_developed)
        
        # Calcul des provisions
        paid_to_date = np.zeros(rows)
        for i in range(rows):
            for j in range(cols):
                if not np.isnan(triangle_data[i, j]):
                    paid_to_date[i] = triangle_data[i, j]
        
        reserves = ultimate_claims - paid_to_date
        reserves = np.maximum(reserves, 0)
        
        # Temps de calcul
        computation_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        
        result = CalculationResult(
            ultimate_claims=ultimate_claims,
            reserves=reserves,
            development_factors=development_factors,
            total_ultimate=np.sum(ultimate_claims),
            total_reserves=np.sum(reserves),
            total_paid=np.sum(paid_to_date),
            method_used=CalculationMethod.BORNHUETTER_FERGUSON,
            parameters_used=parameters,
            computation_time_ms=computation_time,
            warnings=warnings_list
        )
        
        self.logger.info(f"Bornhuetter-Ferguson calculé: {result.total_ultimate:.0f} ultimate, {result.total_reserves:.0f} reserves")
        
        return result


# ================================
# MOTEUR PRINCIPAL
# ================================

class ActuarialEngine:
    """
    Moteur principal de calculs actuariels
    Gère toutes les méthodes et orchestration
    """
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.methods = {
            CalculationMethod.CHAIN_LADDER: ChainLadderMethod(),
            CalculationMethod.BORNHUETTER_FERGUSON: BornhuetterFergusonMethod(),
            # TODO: Ajouter Mack, Cape Cod, etc.
        }
    
    def calculate(
        self, 
        triangle: Triangle,
        parameters: CalculationParameters
    ) -> CalculationResult:
        """
        Lance un calcul actuariel sur un triangle
        
        Args:
            triangle: Triangle de données
            parameters: Paramètres de calcul
            
        Returns:
            CalculationResult: Résultats du calcul
        """
        start_time = datetime.utcnow()
        
        try:
            # Validation des paramètres
            param_errors = parameters.validate()
            if param_errors:
                raise ValueError(f"Paramètres invalides: {'; '.join(param_errors)}")
            
            # Validation du triangle
            triangle_errors = triangle.validate_data_structure()
            if triangle_errors:
                raise ValueError(f"Triangle invalide: {'; '.join(triangle_errors)}")
            
            # Récupération de la méthode
            if parameters.method not in self.methods:
                raise ValueError(f"Méthode non supportée: {parameters.method}")
            
            method = self.methods[parameters.method]
            
            # Conversion des données
            triangle_data = triangle.get_data_as_array()
            
            # Validation spécifique à la méthode
            method_errors = method.validate_inputs(triangle_data, parameters)
            if method_errors:
                raise ValueError(f"Validation méthode échouée: {'; '.join(method_errors)}")
            
            # Exécution du calcul
            self.logger.info(f"Démarrage calcul {parameters.method.value} pour triangle {triangle.name}")
            
            result = method.calculate(triangle_data, parameters)
            
            # Enrichissement des résultats
            result.triangle_id = triangle.id
            result.triangle_name = triangle.name
            
            # Validation des résultats
            self._validate_results(result)
            
            calculation_time = (datetime.utcnow() - start_time).total_seconds() * 1000
            result.computation_time_ms = calculation_time
            
            self.logger.info(f"Calcul terminé en {calculation_time:.1f}ms")
            
            return result
            
        except Exception as e:
            self.logger.error(f"Erreur lors du calcul: {e}")
            raise
    
    def calculate_multiple_methods(
        self,
        triangle: Triangle,
        methods: List[CalculationMethod],
        base_parameters: CalculationParameters
    ) -> Dict[CalculationMethod, CalculationResult]:
        """
        Lance plusieurs méthodes de calcul sur le même triangle
        
        Args:
            triangle: Triangle de données
            methods: Liste des méthodes à utiliser
            base_parameters: Paramètres de base
            
        Returns:
            Dict: Résultats par méthode
        """
        results = {}
        
        for method in methods:
            try:
                # Copie des paramètres avec changement de méthode
                method_params = CalculationParameters(
                    method=method,
                    confidence_level=base_parameters.confidence_level,
                    tail_method=base_parameters.tail_method,
                    tail_factor=base_parameters.tail_factor,
                    alpha=base_parameters.alpha,
                    use_volume_weighted=base_parameters.use_volume_weighted,
                    exclude_outliers=base_parameters.exclude_outliers,
                    outlier_threshold=base_parameters.outlier_threshold,
                    expected_loss_ratio=base_parameters.expected_loss_ratio,
                    premium_data=base_parameters.premium_data,
                    exposure_data=base_parameters.exposure_data,
                    custom_parameters=base_parameters.custom_parameters
                )
                
                result = self.calculate(triangle, method_params)
                results[method] = result
                
            except Exception as e:
                self.logger.warning(f"Échec du calcul {method.value}: {e}")
                # Continue avec les autres méthodes
        
        return results
    
    def compare_methods(
        self,
        triangle: Triangle,
        methods: List[CalculationMethod],
        base_parameters: CalculationParameters
    ) -> Dict[str, Any]:
        """
        Compare les résultats de plusieurs méthodes
        
        Args:
            triangle: Triangle de données
            methods: Méthodes à comparer
            base_parameters: Paramètres de base
            
        Returns:
            Dict: Analyse comparative
        """
        results = self.calculate_multiple_methods(triangle, methods, base_parameters)
        
        if not results:
            return {"error": "Aucun calcul réussi"}
        
        # Extraction des métriques clés
        comparison = {
            "methods_compared": [method.value for method in results.keys()],
            "ultimate_claims": {},
            "total_reserves": {},
            "total_ultimate": {},
            "statistics": {}
        }
        
        ultimates = []
        reserves = []
        totals = []
        
        for method, result in results.items():
            method_name = method.value
            comparison["ultimate_claims"][method_name] = result.ultimate_claims.tolist()
            comparison["total_reserves"][method_name] = result.total_reserves
            comparison["total_ultimate"][method_name] = result.total_ultimate
            
            ultimates.append(result.ultimate_claims)
            reserves.append(result.total_reserves)
            totals.append(result.total_ultimate)
        
        # Statistiques comparatives
        if len(totals) > 1:
            comparison["statistics"] = {
                "ultimate_range": {
                    "min": float(np.min(totals)),
                    "max": float(np.max(totals)),
                    "spread": float(np.max(totals) - np.min(totals)),
                    "coefficient_of_variation": float(np.std(totals) / np.mean(totals))
                },
                "reserves_range": {
                    "min": float(np.min(reserves)),
                    "max": float(np.max(reserves)),
                    "spread": float(np.max(reserves) - np.min(reserves))
                },
                "average_ultimate": float(np.mean(totals)),
                "median_ultimate": float(np.median(totals)),
                "consensus_recommendation": self._get_consensus_recommendation(results)
            }
        
        return comparison
    
    def _validate_results(self, result: CalculationResult):
        """
        Valide la cohérence des résultats
        
        Args:
            result: Résultats à valider
        """
        warnings_list = result.warnings or []
        
        # Vérifications de base
        if np.any(np.isnan(result.ultimate_claims)):
            warnings_list.append("Certaines charges ultimes sont NaN")
        
        if np.any(result.ultimate_claims < 0):
            warnings_list.append("Charges ultimes négatives détectées")
        
        if np.any(result.reserves < 0):
            warnings_list.append("Provisions négatives détectées")
        
        # Vérifications de cohérence
        if result.total_ultimate < result.total_paid:
            warnings_list.append("Total ultime inférieur au total payé")
        
        if result.total_reserves < 0:
            warnings_list.append("Total des provisions négatif")
        
        # Vérifications de plausibilité
        if result.total_reserves > result.total_paid * 10:
            warnings_list.append("Provisions très élevées par rapport au payé (>10x)")
        
        # Mise à jour des warnings
        result.warnings = warnings_list
    
    def _get_consensus_recommendation(self, results: Dict[CalculationMethod, CalculationResult]) -> str:
        """
        Fournit une recommandation basée sur les résultats
        
        Args:
            results: Résultats des différentes méthodes
            
        Returns:
            str: Recommandation
        """
        if not results:
            return "Aucune recommandation possible"
        
        ultimates = [result.total_ultimate for result in results.values()]
        cv = np.std(ultimates) / np.mean(ultimates)
        
        if cv < 0.05:
            return "Convergence excellente entre les méthodes"
        elif cv < 0.15:
            return "Convergence acceptable - Utiliser la moyenne"
        elif cv < 0.30:
            return "Divergence modérée - Analyser les hypothèses"
        else:
            return "Divergence importante - Réviser les données et paramètres"
    
    def get_available_methods(self) -> List[Dict[str, str]]:
        """
        Retourne la liste des méthodes disponibles
        
        Returns:
            List[Dict]: Informations sur les méthodes
        """
        return [
            {
                "code": method.value,
                "name": implementation.name,
                "description": implementation.description
            }
            for method, implementation in self.methods.items()
        ]
    
    def estimate_computation_time(self, triangle: Triangle, method: CalculationMethod) -> float:
        """
        Estime le temps de calcul pour un triangle donné
        
        Args:
            triangle: Triangle à analyser
            method: Méthode de calcul
            
        Returns:
            float: Temps estimé en millisecondes
        """
        rows, cols = triangle.dimensions
        data_points = rows * cols
        
        # Estimation basée sur la complexité
        base_time = {
            CalculationMethod.CHAIN_LADDER: 10,
            CalculationMethod.BORNHUETTER_FERGUSON: 15,
            CalculationMethod.MACK: 50,
            CalculationMethod.CAPE_COD: 25
        }.get(method, 20)
        
        # Facteur de complexité basé sur la taille
        complexity_factor = 1 + (data_points / 100)
        
        return base_time * complexity_factor
    
    def optimize_parameters(
        self,
        triangle: Triangle,
        method: CalculationMethod,
        optimization_target: str = "goodness_of_fit"
    ) -> CalculationParameters:
        """
        Optimise automatiquement les paramètres pour un triangle
        
        Args:
            triangle: Triangle de données
            method: Méthode à optimiser
            optimization_target: Critère d'optimisation
            
        Returns:
            CalculationParameters: Paramètres optimisés
        """
        # Paramètres de base
        base_params = CalculationParameters(method=method)
        
        # Pour l'instant, retourne les paramètres par défaut
        # TODO: Implémenter l'optimisation réelle
        self.logger.info(f"Optimisation des paramètres pour {method.value} (non implémentée)")
        
        return base_params


# ================================
# UTILITAIRES ET FONCTIONS D'AIDE
# ================================

def create_calculation_parameters(
    method: Union[str, CalculationMethod],
    **kwargs
) -> CalculationParameters:
    """
    Factory pour créer des paramètres de calcul
    
    Args:
        method: Méthode de calcul
        **kwargs: Paramètres additionnels
        
    Returns:
        CalculationParameters: Paramètres configurés
    """
    if isinstance(method, str):
        method = CalculationMethod(method)
    
    return CalculationParameters(method=method, **kwargs)


def validate_triangle_for_calculation(triangle: Triangle) -> List[str]:
    """
    Valide qu'un triangle est prêt pour le calcul
    
    Args:
        triangle: Triangle à valider
        
    Returns:
        List[str]: Liste des erreurs
    """
    errors = []
    
    # Validation du statut
    if triangle.validation_status != "validated":
        errors.append("Triangle non validé")
    
    # Validation des données
    if not triangle.data_matrix:
        errors.append("Aucune donnée dans le triangle")
    
    # Validation de la complétude
    if triangle.completeness_ratio < 0.3:
        errors.append("Triangle incomplet (<30% de données)")
    
    # Validation de l'âge
    if triangle.age_months > 48:
        errors.append("Données trop anciennes (>4 ans)")
    
    return errors


def calculate_development_pattern_stability(triangle: Triangle) -> Dict[str, float]:
    """
    Analyse la stabilité des patterns de développement
    
    Args:
        triangle: Triangle à analyser
        
    Returns:
        Dict: Métriques de stabilité
    """
    try:
        data = triangle.get_data_as_array()
        rows, cols = data.shape
        
        # Calcul des facteurs par période d'origine
        factors_by_origin = []
        
        for i in range(rows - 1):
            row_factors = []
            for j in range(cols - 1):
                if not np.isnan(data[i, j]) and not np.isnan(data[i, j + 1]) and data[i, j] > 0:
                    factor = data[i, j + 1] / data[i, j]
                    row_factors.append(factor)
            if row_factors:
                factors_by_origin.append(row_factors)
        
        # Calcul de la variabilité
        if not factors_by_origin:
            return {"stability_score": 0.0, "coefficient_of_variation": 1.0}
        
        # Coefficient de variation moyen
        cvs = []
        max_length = max(len(factors) for factors in factors_by_origin)
        
        for j in range(max_length):
            col_factors = []
            for factors in factors_by_origin:
                if j < len(factors):
                    col_factors.append(factors[j])
            
            if len(col_factors) > 1:
                cv = np.std(col_factors) / np.mean(col_factors)
                cvs.append(cv)
        
        mean_cv = np.mean(cvs) if cvs else 1.0
        stability_score = max(0.0, 1.0 - mean_cv)
        
        return {
            "stability_score": stability_score,
            "coefficient_of_variation": mean_cv,
            "development_periods_analyzed": len(cvs)
        }
        
    except Exception as e:
        return {"stability_score": 0.0, "error": str(e)}


def recommend_calculation_method(triangle: Triangle) -> Dict[str, Any]:
    """
    Recommande la meilleure méthode de calcul pour un triangle
    
    Args:
        triangle: Triangle à analyser
        
    Returns:
        Dict: Recommandation avec justification
    """
    recommendations = []
    
    # Analyse de la taille
    rows, cols = triangle.dimensions
    data_points = triangle.data_points_count or 0
    
    # Analyse de la stabilité
    stability = calculate_development_pattern_stability(triangle)
    
    # Analyse de la complétude
    completeness = triangle.completeness_ratio
    
    # Logique de recommandation
    if completeness > 0.8 and stability["stability_score"] > 0.7:
        recommendations.append({
            "method": CalculationMethod.CHAIN_LADDER,
            "confidence": 0.9,
            "reason": "Données complètes et pattern stable - Chain Ladder optimal"
        })
    
    if completeness < 0.6 or stability["stability_score"] < 0.5:
        recommendations.append({
            "method": CalculationMethod.BORNHUETTER_FERGUSON,
            "confidence": 0.8,
            "reason": "Données incomplètes ou instables - BF recommandé"
        })
    
    if triangle.business_line in ["motor", "property"] and data_points > 50:
        recommendations.append({
            "method": CalculationMethod.MACK,
            "confidence": 0.7,
            "reason": "Branche appropriée et données suffisantes pour Mack"
        })
    
    # Tri par niveau de confiance
    recommendations.sort(key=lambda x: x["confidence"], reverse=True)
    
    return {
        "primary_recommendation": recommendations[0] if recommendations else None,
        "alternative_methods": recommendations[1:3],
        "triangle_analysis": {
            "completeness": completeness,
            "stability_score": stability["stability_score"],
            "data_points": data_points,
            "dimensions": f"{rows}x{cols}"
        }
    }


# ================================
# INSTANCE GLOBALE
# ================================

# Instance principale du moteur actuariel
actuarial_engine = ActuarialEngine()

# ================================
# EXPORTS
# ================================

__all__ = [
    "ActuarialEngine",
    "CalculationMethod",
    "CalculationParameters", 
    "CalculationResult",
    "TailMethod",
    "ChainLadderMethod",
    "BornhuetterFergusonMethod",
    "actuarial_engine",
    "create_calculation_parameters",
    "validate_triangle_for_calculation",
    "calculate_development_pattern_stability",
    "recommend_calculation_method"
]