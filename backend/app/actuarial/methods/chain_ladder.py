# backend/app/actuarial/methods/chain_ladder.py

from typing import List, Dict, Any
from datetime import datetime
import random

from ..base.method_interface import (
    DeterministicMethod, 
    TriangleData, 
    CalculationResult,
    MethodConfig
)
from ..base.triangle_utils import (
    validate_triangle_data,
    calculate_development_factors,
    complete_triangle_with_factors,
    estimate_ultimate_simple,
    calculate_triangle_statistics
)

class ChainLadderMethod(DeterministicMethod):
    """
    Implémentation de la méthode Chain Ladder
    
    La méthode Chain Ladder est une approche déterministe qui utilise
    les facteurs de développement historiques pour projeter les sinistres futurs.
    """
    
    def __init__(self):
        config = MethodConfig(
            id="chain_ladder",
            name="Chain Ladder",
            description="Méthode déterministe classique basée sur les facteurs de développement",
            category="deterministic",
            recommended=True,
            processing_time="< 1s",
            accuracy=85,
            parameters={
                "factor_method": "simple_average",  # "simple_average", "weighted_average", "median"
                "tail_factor": None,  # Facteur de queue optionnel
                "exclude_recent_years": 0,  # Exclure les N dernières années
                "manual_factors": None  # Facteurs manuels optionnels
            }
        )
        super().__init__(config)
    
    @property
    def method_id(self) -> str:
        return "chain_ladder"
    
    @property
    def method_name(self) -> str:
        return "Chain Ladder"
    
    def validate_input(self, triangle_data: TriangleData, **kwargs) -> List[str]:
        """Valider les données pour Chain Ladder"""
        errors = validate_triangle_data(triangle_data.data)
        
        # Validations spécifiques Chain Ladder
        if not errors:  # Seulement si les validations de base passent
            if len(triangle_data.data) < 2:
                errors.append("Chain Ladder nécessite au moins 2 années d'accident")
            
            # Vérifier qu'on a assez de données pour calculer des facteurs
            sufficient_data = False
            for row in triangle_data.data:
                if len(row) >= 2:
                    sufficient_data = True
                    break
            
            if not sufficient_data:
                errors.append("Données insuffisantes pour calculer les facteurs de développement")
        
        return errors
    
    def calculate(self, triangle_data: TriangleData, **kwargs) -> CalculationResult:
        """
        Calcul Chain Ladder complet
        
        Args:
            triangle_data: Données du triangle
            **kwargs: Paramètres optionnels (factor_method, tail_factor, etc.)
        
        Returns:
            Résultat du calcul
        """
        self._start_timing()
        self._log_calculation_start(triangle_data)
        
        # Paramètres
        params = self.get_default_parameters()
        params.update(kwargs)
        
        # 1. Validation
        validation_errors = self.validate_input(triangle_data, **kwargs)
        if validation_errors:
            raise ValueError(f"Erreurs de validation: {', '.join(validation_errors)}")
        
        # 2. Calcul des facteurs de développement
        if params.get("manual_factors"):
            development_factors = params["manual_factors"]
            print(f"📝 Utilisation de facteurs manuels: {[f'{f:.3f}' for f in development_factors]}")
        else:
            development_factors = calculate_development_factors(
                triangle_data.data, 
                method=params.get("factor_method", "simple_average")
            )
            print(f"🔢 Facteurs calculés ({params.get('factor_method', 'simple_average')}): {[f'{f:.3f}' for f in development_factors]}")
        
        # 3. Ajouter facteur de queue si spécifié
        if params.get("tail_factor") and params["tail_factor"] > 1.0:
            development_factors.append(params["tail_factor"])
            print(f"🏁 Facteur de queue ajouté: {params['tail_factor']:.3f}")
        
        # 4. Calcul des ultimates
        ultimates_by_year = estimate_ultimate_simple(triangle_data.data, development_factors)
        ultimate_total = sum(ultimates_by_year)
        
        # 5. Triangle complété
        completed_triangle = complete_triangle_with_factors(triangle_data.data, development_factors)
        
        # 6. Calculs de synthèse
        paid_to_date = sum(row[0] if row else 0 for row in triangle_data.data)
        reserves = ultimate_total - paid_to_date
        
        # 7. Statistiques du triangle
        triangle_stats = calculate_triangle_statistics(triangle_data.data)
        
        # 8. Diagnostics
        diagnostics = self._calculate_diagnostics(triangle_data.data, completed_triangle, ultimates_by_year)
        
        # 9. Avertissements
        warnings = self._generate_warnings(triangle_data, development_factors, triangle_stats)
        
        # 10. Métadonnées
        metadata = {
            "currency": triangle_data.currency,
            "business_line": triangle_data.business_line,
            "parameters_used": params,
            "triangle_statistics": triangle_stats,
            "factor_statistics": self._calculate_factor_statistics(development_factors),
            "data_quality_score": self._assess_data_quality(triangle_data.data, triangle_stats)
        }
        
        calculation_time = self._stop_timing()
        
        result = CalculationResult(
            method_id=self.method_id,
            method_name=self.method_name,
            ultimate_total=ultimate_total,
            paid_to_date=paid_to_date,
            reserves=reserves,
            ultimates_by_year=ultimates_by_year,
            development_factors=development_factors,
            completed_triangle=completed_triangle,
            diagnostics=diagnostics,
            warnings=warnings,
            metadata=metadata,
            calculation_time=calculation_time,
            timestamp=datetime.utcnow()
        )
        
        self._log_calculation_end(result)
        return result
    
    def _calculate_diagnostics(self, observed: List[List[float]], 
                             completed: List[List[float]], 
                             ultimates: List[float]) -> Dict[str, float]:
        """Calculer les métriques de diagnostic"""
        
        # RMSE sur les valeurs observées vs prédites
        observed_values = []
        predicted_values = []
        
        for i, (obs_row, comp_row) in enumerate(zip(observed, completed)):
            for j, obs_val in enumerate(obs_row):
                if j < len(comp_row) and comp_row[j] > 0:
                    observed_values.append(obs_val)
                    predicted_values.append(comp_row[j])
        
        if observed_values:
            mse = sum((o - p) ** 2 for o, p in zip(observed_values, predicted_values)) / len(observed_values)
            rmse = mse ** 0.5
            
            # MAPE
            ape_values = [abs((o - p) / o) for o, p in zip(observed_values, predicted_values) if o > 0]
            mape = (sum(ape_values) / len(ape_values)) * 100 if ape_values else 0
            
            # R²
            mean_observed = sum(observed_values) / len(observed_values)
            ss_tot = sum((o - mean_observed) ** 2 for o in observed_values)
            ss_res = sum((o - p) ** 2 for o, p in zip(observed_values, predicted_values))
            r2 = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0
        else:
            rmse = 0
            mape = 0
            r2 = 0
        
        return {
            "rmse": round(rmse, 4),
            "mape": round(mape, 2),
            "r2": round(max(0, min(1, r2)), 4),  # Borner entre 0 et 1
            "ultimate_cv": self._calculate_ultimate_cv(ultimates),
            "convergence": 1.0  # Chain Ladder converge toujours
        }
    
    def _calculate_ultimate_cv(self, ultimates: List[float]) -> float:
        """Calculer le coefficient de variation des ultimates"""
        if len(ultimates) <= 1:
            return 0.0
        
        mean_ult = sum(ultimates) / len(ultimates)
        if mean_ult == 0:
            return 0.0
        
        variance = sum((ult - mean_ult) ** 2 for ult in ultimates) / (len(ultimates) - 1)
        std_dev = variance ** 0.5
        
        return round(std_dev / mean_ult, 4)
    
    def _calculate_factor_statistics(self, factors: List[float]) -> Dict[str, float]:
        """Statistiques des facteurs de développement"""
        if not factors:
            return {}
        
        return {
            "mean_factor": round(sum(factors) / len(factors), 4),
            "min_factor": round(min(factors), 4),
            "max_factor": round(max(factors), 4),
            "factor_range": round(max(factors) - min(factors), 4),
            "tail_effect": round(factors[-1] if factors else 1.0, 4)
        }
    
    def _assess_data_quality(self, triangle_data: List[List[float]], stats: Dict[str, float]) -> float:
        """Évaluer la qualité des données (score 0-1)"""
        score = 1.0
        
        # Pénaliser si peu d'années
        if stats.get("accident_years", 0) < 5:
            score *= 0.8
        
        # Pénaliser si peu de périodes de développement
        if stats.get("max_development_periods", 0) < 4:
            score *= 0.85
        
        # Pénaliser si densité faible (beaucoup de trous dans le triangle)
        density = stats.get("density", 0)
        if density < 0.7:
            score *= (0.5 + 0.5 * density / 0.7)
        
        # Bonifier si beaucoup de données
        if stats.get("data_points", 0) > 20:
            score = min(1.0, score * 1.1)
        
        return round(score, 3)
    
    def _generate_warnings(self, triangle_data: TriangleData, 
                          factors: List[float], 
                          stats: Dict[str, float]) -> List[str]:
        """Générer des avertissements basés sur l'analyse"""
        warnings = []
        
        # Facteurs suspects
        for i, factor in enumerate(factors):
            if factor < 0.5:
                warnings.append(f"Facteur période {i+1} très bas ({factor:.3f}) - données suspectes?")
            elif factor > 3.0:
                warnings.append(f"Facteur période {i+1} très élevé ({factor:.3f}) - vérifier les données")
        
        # Données limitées
        if stats.get("accident_years", 0) < 3:
            warnings.append("Moins de 3 années d'accident - résultats moins fiables")
        
        if stats.get("max_development_periods", 0) < 3:
            warnings.append("Peu de périodes de développement - projection limitée")
        
        # Qualité des données
        data_quality = stats.get("density", 1.0)
        if data_quality < 0.6:
            warnings.append(f"Triangle incomplet (densité: {data_quality:.1%}) - résultats incertains")
        
        # Variabilité élevée
        if len(factors) > 1:
            factor_cv = (max(factors) - min(factors)) / (sum(factors) / len(factors))
            if factor_cv > 0.5:
                warnings.append("Forte variabilité des facteurs de développement")
        
        return warnings
    
    def get_method_info(self) -> Dict[str, Any]:
        """Informations détaillées sur la méthode"""
        return {
            "method_id": self.method_id,
            "method_name": self.method_name,
            "category": self.config.category,
            "description": self.config.description,
            "advantages": [
                "Simple à comprendre et implémenter",
                "Largement accepté par les régulateurs",
                "Bon pour les données stables",
                "Calcul rapide"
            ],
            "limitations": [
                "Sensible aux données aberrantes",
                "Pas d'intervalle de confiance",
                "Suppose une stabilité des tendances",
                "Peut être volatil pour les années récentes"
            ],
            "best_use_cases": [
                "Lignes de business matures",
                "Données historiques stables",
                "Réserves de base",
                "Benchmark avec autres méthodes"
            ],
            "parameters": self.config.parameters
        }

# ✅ Factory function pour créer une instance
def create_chain_ladder_method() -> ChainLadderMethod:
    """Factory pour créer une instance Chain Ladder"""
    return ChainLadderMethod()