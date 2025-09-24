# backend/app/actuarial/base/method_interface.py

"""
Interfaces de base et classes de données pour les méthodes actuarielles

Ce module définit l'architecture commune à toutes les méthodes actuarielles :
- Classes de données pour les inputs/outputs
- Interfaces abstraites pour les différents types de méthodes
- Configuration et métadonnées des méthodes
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional, Union
from datetime import datetime
from dataclasses import dataclass
from enum import Enum
import time

class MethodCategory(Enum):
    """Catégories de méthodes actuarielles"""
    DETERMINISTIC = "deterministic"
    STOCHASTIC = "stochastic" 
    MACHINE_LEARNING = "machine_learning"
    HYBRID = "hybrid"

@dataclass
class TriangleData:
    """
    Données d'entrée : triangle de développement
    
    Attributes:
        data: Triangle sous forme de liste de listes (chaque ligne = année d'accident)
        currency: Devise des montants 
        business_line: Ligne de business
        accident_years: Liste des années d'accident (optionnel)
        development_periods: Liste des périodes de développement (optionnel)
        metadata: Métadonnées additionnelles
    """
    data: List[List[float]]
    currency: str = "EUR"
    business_line: str = "General"
    accident_years: Optional[List[int]] = None
    development_periods: Optional[List[int]] = None
    metadata: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}
        
        # Auto-générer les années/périodes si pas fournies
        if self.accident_years is None and self.data:
            base_year = 2020  # Année de base par défaut
            self.accident_years = list(range(base_year - len(self.data) + 1, base_year + 1))
        
        if self.development_periods is None and self.data:
            max_periods = max(len(row) for row in self.data) if self.data else 0
            self.development_periods = list(range(max_periods))

@dataclass
class CalculationResult:
    """
    Résultat d'un calcul actuariel
    
    Attributes:
        method_id: Identifiant de la méthode utilisée
        method_name: Nom de la méthode
        ultimate_total: Total des ultimates
        paid_to_date: Total payé à ce jour
        reserves: Réserves (ultimate - payé)
        ultimates_by_year: Ultimate par année d'accident
        development_factors: Facteurs de développement utilisés
        completed_triangle: Triangle complété avec prédictions
        diagnostics: Métriques de diagnostic
        warnings: Avertissements et alertes
        metadata: Métadonnées du calcul
        calculation_time: Temps de calcul en secondes
        timestamp: Horodatage du calcul
    """
    method_id: str
    method_name: str
    ultimate_total: float
    paid_to_date: float
    reserves: float
    ultimates_by_year: List[float]
    development_factors: List[float]
    completed_triangle: List[List[float]]
    diagnostics: Dict[str, float]
    warnings: List[str]
    metadata: Dict[str, Any]
    calculation_time: float
    timestamp: datetime
    
    def to_dict(self) -> Dict[str, Any]:
        """Convertir en dictionnaire pour sérialisation"""
        return {
            "method_id": self.method_id,
            "method_name": self.method_name,
            "ultimate_total": round(self.ultimate_total, 2),
            "paid_to_date": round(self.paid_to_date, 2),
            "reserves": round(self.reserves, 2),
            "ultimates_by_year": [round(u, 2) for u in self.ultimates_by_year],
            "development_factors": [round(f, 4) for f in self.development_factors],
            "completed_triangle": [[round(val, 2) for val in row] for row in self.completed_triangle],
            "diagnostics": self.diagnostics,
            "warnings": self.warnings,
            "metadata": self.metadata,
            "calculation_time": round(self.calculation_time, 4),
            "timestamp": self.timestamp.isoformat()
        }
    
    def get_summary(self) -> Dict[str, Any]:
        """Résumé concis du résultat"""
        return {
            "method": self.method_name,
            "ultimate_total": round(self.ultimate_total, 2),
            "reserves": round(self.reserves, 2),
            "calculation_time": f"{self.calculation_time:.3f}s",
            "warnings_count": len(self.warnings),
            "key_diagnostics": {
                k: v for k, v in list(self.diagnostics.items())[:3]  # Top 3 métriques
            }
        }

@dataclass 
class MethodConfig:
    """
    Configuration d'une méthode actuarielle
    
    Attributes:
        id: Identifiant unique
        name: Nom affiché
        description: Description détaillée
        category: Catégorie de la méthode
        recommended: Si c'est une méthode recommandée
        processing_time: Temps de traitement estimé
        accuracy: Score d'accuracy estimé (0-100)
        parameters: Paramètres par défaut
    """
    id: str
    name: str
    description: str
    category: str
    recommended: bool = True
    processing_time: str = "< 1s"
    accuracy: int = 80
    parameters: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.parameters is None:
            self.parameters = {}

class ActuarialMethod(ABC):
    """
    Interface abstraite pour toutes les méthodes actuarielles
    
    Définit le contrat commun que toutes les méthodes doivent respecter.
    """
    
    def __init__(self, config: MethodConfig):
        self.config = config
        self._start_time: Optional[float] = None
        self._calculation_count = 0
    
    @property
    @abstractmethod
    def method_id(self) -> str:
        """Identifiant unique de la méthode"""
        pass
    
    @property
    @abstractmethod
    def method_name(self) -> str:
        """Nom affiché de la méthode"""
        pass
    
    @abstractmethod
    def validate_input(self, triangle_data: TriangleData, **kwargs) -> List[str]:
        """
        Valider les données d'entrée
        
        Args:
            triangle_data: Données du triangle
            **kwargs: Paramètres additionnels
            
        Returns:
            Liste des erreurs de validation (vide si OK)
        """
        pass
    
    @abstractmethod
    def calculate(self, triangle_data: TriangleData, **kwargs) -> CalculationResult:
        """
        Effectuer le calcul actuariel
        
        Args:
            triangle_data: Données du triangle
            **kwargs: Paramètres de calcul
            
        Returns:
            Résultat du calcul
            
        Raises:
            ValueError: Si les données ne sont pas valides
        """
        pass
    
    @abstractmethod
    def get_method_info(self) -> Dict[str, Any]:
        """
        Informations détaillées sur la méthode
        
        Returns:
            Dictionnaire avec description, avantages, limitations, cas d'usage
        """
        pass
    
    def get_default_parameters(self) -> Dict[str, Any]:
        """Obtenir les paramètres par défaut"""
        return self.config.parameters.copy()
    
    def _start_timing(self):
        """Démarrer le chronométrage"""
        self._start_time = time.time()
    
    def _stop_timing(self) -> float:
        """Arrêter le chronométrage et retourner la durée"""
        if self._start_time is None:
            return 0.0
        
        duration = time.time() - self._start_time
        self._start_time = None
        return duration
    
    def _log_calculation_start(self, triangle_data: TriangleData):
        """Logger le début du calcul"""
        self._calculation_count += 1
        data_points = sum(len(row) for row in triangle_data.data)
        print(f"🚀 {self.method_name} - Calcul #{self._calculation_count}")
        print(f"📊 Données: {len(triangle_data.data)} années, {data_points} points")
    
    def _log_calculation_end(self, result: CalculationResult):
        """Logger la fin du calcul"""
        print(f"✅ {self.method_name} terminé en {result.calculation_time:.3f}s")
        print(f"💰 Ultimate: {result.ultimate_total:,.2f} {result.metadata.get('currency', 'EUR')}")
        if result.warnings:
            print(f"⚠️  {len(result.warnings)} avertissement(s)")
    
    def __str__(self) -> str:
        return f"{self.method_name} ({self.method_id})"
    
    def __repr__(self) -> str:
        return f"<{self.__class__.__name__}(id='{self.method_id}')>"

class DeterministicMethod(ActuarialMethod):
    """
    Classe de base pour les méthodes déterministes
    
    Les méthodes déterministes produisent toujours le même résultat
    pour les mêmes données d'entrée.
    """
    
    def __init__(self, config: MethodConfig):
        if config.category != "deterministic":
            config.category = "deterministic"
        super().__init__(config)
    
    def calculate_confidence_interval(self, triangle_data: TriangleData, 
                                    confidence_level: float = 0.95) -> Dict[str, Any]:
        """
        Les méthodes déterministes ne fournissent pas d'intervalles de confiance par défaut
        Cette méthode peut être surchargée par des méthodes spécifiques si applicable.
        """
        return {
            "confidence_level": confidence_level,
            "lower_bounds": None,
            "upper_bounds": None,
            "message": f"{self.method_name} est une méthode déterministe sans intervalles de confiance natifs"
        }

class StochasticMethod(ActuarialMethod):
    """
    Classe de base pour les méthodes stochastiques
    
    Les méthodes stochastiques incorporent de l'incertitude et fournissent
    des intervalles de confiance.
    """
    
    def __init__(self, config: MethodConfig):
        if config.category != "stochastic":
            config.category = "stochastic"
        super().__init__(config)
    
    @abstractmethod
    def calculate_confidence_interval(self, triangle_data: TriangleData,
                                    confidence_level: float = 0.95) -> Dict[str, Any]:
        """
        Calculer les intervalles de confiance
        
        Args:
            triangle_data: Données du triangle
            confidence_level: Niveau de confiance (0.90, 0.95, 0.99)
            
        Returns:
            Dictionnaire avec lower_bounds, upper_bounds, confidence_level
        """
        pass
    
    def simulate_scenarios(self, triangle_data: TriangleData, 
                         n_scenarios: int = 1000) -> Dict[str, Any]:
        """
        Simuler des scenarios (à implémenter par les sous-classes si applicable)
        """
        return {
            "scenarios": [],
            "message": f"Simulation de scénarios non implémentée pour {self.method_name}"
        }

class MachineLearningMethod(ActuarialMethod):
    """
    Classe de base pour les méthodes de Machine Learning
    
    Les méthodes ML utilisent des algorithmes d'apprentissage pour
    identifier des patterns dans les données.
    """
    
    def __init__(self, config: MethodConfig):
        if config.category != "machine_learning":
            config.category = "machine_learning"
        super().__init__(config)
    
    def get_feature_importance(self) -> Dict[str, float]:
        """
        Obtenir l'importance des features (à implémenter par les sous-classes)
        """
        return {}
    
    def cross_validate(self, triangle_data: TriangleData, 
                      cv_folds: int = 5) -> Dict[str, Any]:
        """
        Validation croisée (à implémenter par les sous-classes)
        """
        return {
            "cv_scores": [],
            "mean_score": 0,
            "std_score": 0,
            "message": f"Validation croisée non implémentée pour {self.method_name}"
        }
    
    def explain_prediction(self, triangle_data: TriangleData) -> Dict[str, Any]:
        """
        Expliquer les prédictions (à implémenter si applicable)
        """
        return {
            "explanations": [],
            "message": f"Explication des prédictions non disponible pour {self.method_name}"
        }

class HybridMethod(ActuarialMethod):
    """
    Classe de base pour les méthodes hybrides
    
    Les méthodes hybrides combinent plusieurs approches
    (par ex. traditionnel + ML, ou déterministe + stochastique).
    """
    
    def __init__(self, config: MethodConfig):
        if config.category != "hybrid":
            config.category = "hybrid"
        super().__init__(config)
    
    @abstractmethod
    def get_component_methods(self) -> List[str]:
        """
        Obtenir la liste des méthodes composantes
        
        Returns:
            Liste des IDs des méthodes utilisées dans l'hybride
        """
        pass
    
    @abstractmethod
    def get_combination_weights(self) -> Dict[str, float]:
        """
        Obtenir les poids de combinaison des méthodes
        
        Returns:
            Dictionnaire method_id -> poids
        """
        pass

class MethodValidator:
    """
    Utilitaires de validation pour les méthodes actuarielles
    """
    
    @staticmethod
    def validate_triangle_structure(triangle_data: List[List[float]]) -> List[str]:
        """Valider la structure de base du triangle"""
        errors = []
        
        if not triangle_data:
            errors.append("Triangle vide")
            return errors
        
        if not isinstance(triangle_data, list):
            errors.append("Triangle doit être une liste")
            return errors
        
        # Vérifier chaque ligne
        for i, row in enumerate(triangle_data):
            if not isinstance(row, list):
                errors.append(f"Ligne {i} doit être une liste")
                continue
            
            # Vérifier les valeurs
            for j, value in enumerate(row):
                if not isinstance(value, (int, float)):
                    errors.append(f"Valeur [{i}][{j}] doit être numérique")
                elif value < 0:
                    errors.append(f"Valeur négative [{i}][{j}]: {value}")
        
        # Vérifier la forme du triangle
        max_length = max(len(row) for row in triangle_data)
        for i, row in enumerate(triangle_data):
            expected_max_length = max_length - i
            if len(row) > expected_max_length:
                errors.append(f"Ligne {i} trop longue pour un triangle ({len(row)} > {expected_max_length})")
        
        return errors
    
    @staticmethod
    def validate_parameters(parameters: Dict[str, Any], 
                          expected_params: Dict[str, Any]) -> List[str]:
        """Valider les paramètres par rapport aux attentes"""
        errors = []
        
        for param_name, param_value in parameters.items():
            if param_name in expected_params:
                expected_type = type(expected_params[param_name])
                if expected_type != type(None) and not isinstance(param_value, expected_type):
                    errors.append(f"Paramètre '{param_name}': type attendu {expected_type.__name__}, reçu {type(param_value).__name__}")
        
        return errors

# Fonctions utilitaires
def create_triangle_data(data: List[List[float]], 
                        currency: str = "EUR",
                        business_line: str = "General",
                        **kwargs) -> TriangleData:
    """
    Factory function pour créer TriangleData avec validation
    """
    # Validation de base
    errors = MethodValidator.validate_triangle_structure(data)
    if errors:
        raise ValueError(f"Erreurs dans les données triangle: {', '.join(errors)}")
    
    return TriangleData(
        data=data,
        currency=currency,
        business_line=business_line,
        **kwargs
    )

def compare_calculation_results(results: List[CalculationResult]) -> Dict[str, Any]:
    """
    Comparer plusieurs résultats de calcul
    
    Args:
        results: Liste des résultats à comparer
        
    Returns:
        Dictionnaire de comparaison
    """
    if not results:
        return {}
    
    ultimates = [r.ultimate_total for r in results]
    reserves = [r.reserves for r in results]
    
    return {
        "methods": [r.method_name for r in results],
        "ultimate_total": {
            "values": ultimates,
            "min": min(ultimates),
            "max": max(ultimates),
            "mean": sum(ultimates) / len(ultimates),
            "range": max(ultimates) - min(ultimates),
            "cv": (max(ultimates) - min(ultimates)) / (sum(ultimates) / len(ultimates)) if ultimates else 0
        },
        "reserves": {
            "values": reserves,
            "min": min(reserves),
            "max": max(reserves),
            "mean": sum(reserves) / len(reserves),
            "range": max(reserves) - min(reserves)
        },
        "calculation_times": [r.calculation_time for r in results],
        "warnings_summary": {
            "total_warnings": sum(len(r.warnings) for r in results),
            "methods_with_warnings": sum(1 for r in results if r.warnings),
            "common_warnings": []  # TODO: identifier les avertissements communs
        }
    }