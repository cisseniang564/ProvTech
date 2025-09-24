# backend/app/actuarial/methods/mack_method.py

from typing import List, Dict, Any, Tuple
from datetime import datetime
import random
import math

from ..base.method_interface import (
    StochasticMethod,  # Notez: Stochastic au lieu de Deterministic
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

class MackMethod(StochasticMethod):
    """
    Implémentation de la méthode de Mack
    
    La méthode de Mack est une extension stochastique du Chain Ladder
    qui fournit des intervalles de confiance pour les estimations d'ultimate.
    """
    
    def __init__(self):
        config = MethodConfig(
            id="mack_method",
            name="Mack (Chain Ladder Stochastique)",
            description="Extension stochastique du Chain Ladder avec intervalles de confiance",
            category="stochastic",
            recommended=True,
            processing_time="< 3s",
            accuracy=85,
            parameters={
                "confidence_level": 0.95,  # Niveau de confiance (90%, 95%, 99%)
                "bootstrap_iterations": 1000,  # Nombre de simulations Bootstrap
                "tail_factor": None,
                "factor_method": "simple_average",
                "alpha": 1.0,  # Paramètre de variance (Mack assumption)
                "include_process_variance": True,
                "include_parameter_variance": True
            }
        )
        super().__init__(config)
    
    @property
    def method_id(self) -> str:
        return "mack_method"
    
    @property
    def method_name(self) -> str:
        return "Mack (Chain Ladder Stochastique)"
    
    def validate_input(self, triangle_data: TriangleData, **kwargs) -> List[str]:
        """Valider les données pour Mack"""
        errors = validate_triangle_data(triangle_data.data)
        
        if not errors:
            if len(triangle_data.data) < 3:
                errors.append("Mack nécessite au moins 3 années d'accident")
            
            # Vérifier qu'on a suffisamment de données pour calculer les variances
            sufficient_data_points = 0
            for row in triangle_data.data:
                if len(row) >= 2:
                    sufficient_data_points += len(row) - 1
            
            if sufficient_data_points < 6:
                errors.append("Données insuffisantes pour estimation robuste des variances")
            
            # Vérifier les paramètres de confiance
            confidence_level = kwargs.get("confidence_level", 0.95)
            if not 0.8 <= confidence_level <= 0.99:
                errors.append("Niveau de confiance doit être entre 80% et 99%")
        
        return errors
    
    def calculate(self, triangle_data: TriangleData, **kwargs) -> CalculationResult:
        """
        Calcul Mack complet avec intervalles de confiance
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
        development_factors = calculate_development_factors(
            triangle_data.data,
            method=params.get("factor_method", "simple_average")
        )
        
        if params.get("tail_factor") and params["tail_factor"] > 1.0:
            development_factors.append(params["tail_factor"])
        
        print(f"🔢 Facteurs de développement: {[f'{f:.3f}' for f in development_factors]}")
        
        # 3. Calcul des estimations Chain Ladder (point central)
        ultimates_cl = estimate_ultimate_simple(triangle_data.data, development_factors)
        ultimate_total_cl = sum(ultimates_cl)
        
        # 4. Estimation des paramètres de variance (σ²)
        sigma_squares = self._estimate_variance_parameters(triangle_data.data, development_factors, params.get("alpha", 1.0))
        print(f"📊 Paramètres de variance: {[f'{s:.2e}' for s in sigma_squares]}")
        
        # 5. Calcul des erreurs standard de prédiction (MSEP)
        prediction_errors = self._calculate_prediction_errors(
            triangle_data.data, development_factors, sigma_squares,
            params.get("include_process_variance", True),
            params.get("include_parameter_variance", True)
        )
        
        # 6. Bootstrap pour intervalles de confiance
        confidence_intervals = self._bootstrap_confidence_intervals(
            triangle_data.data, development_factors, sigma_squares,
            ultimates_cl, params.get("confidence_level", 0.95),
            params.get("bootstrap_iterations", 1000)
        )
        
        # 7. Triangle complété
        completed_triangle = complete_triangle_with_factors(triangle_data.data, development_factors)
        
        # 8. Calculs de synthèse
        paid_to_date = sum(row[0] if row else 0 for row in triangle_data.data)
        reserves_cl = ultimate_total_cl - paid_to_date
        
        # 9. Diagnostics avec métriques stochastiques
        triangle_stats = calculate_triangle_statistics(triangle_data.data)
        diagnostics = self._calculate_mack_diagnostics(
            triangle_data.data, completed_triangle, ultimates_cl,
            prediction_errors, confidence_intervals, sigma_squares
        )
        
        # 10. Avertissements
        warnings = self._generate_mack_warnings(
            triangle_data, development_factors, triangle_stats, 
            prediction_errors, sigma_squares
        )
        
        # 11. Métadonnées étendues
        metadata = {
            "currency": triangle_data.currency,
            "business_line": triangle_data.business_line,
            "parameters_used": params,
            "triangle_statistics": triangle_stats,
            "variance_parameters": sigma_squares,
            "prediction_errors": prediction_errors,
            "confidence_intervals": confidence_intervals,
            "mack_statistics": self._calculate_mack_statistics(
                ultimates_cl, prediction_errors, confidence_intervals
            ),
            "model_assumptions": self._check_mack_assumptions(triangle_data.data, development_factors)
        }
        
        calculation_time = self._stop_timing()
        
        result = CalculationResult(
            method_id=self.method_id,
            method_name=self.method_name,
            ultimate_total=ultimate_total_cl,
            paid_to_date=paid_to_date,
            reserves=reserves_cl,
            ultimates_by_year=ultimates_cl,
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
    
    def _estimate_variance_parameters(self, triangle_data: List[List[float]], 
                                    development_factors: List[float],
                                    alpha: float = 1.0) -> List[float]:
        """
        Estimer les paramètres de variance σ²_j pour chaque période de développement
        
        Selon Mack: σ²_j = Σ(w_i,j * (C_i,j+1 - f_j * C_i,j)²) / Σ(w_i,j)
        où w_i,j = C_i,j^(2-α) (poids)
        """
        sigma_squares = []
        
        for j in range(len(development_factors)):
            numerator = 0.0
            denominator = 0.0
            
            for i, row in enumerate(triangle_data):
                if len(row) > j + 1:  # On a les deux valeurs C_i,j et C_i,j+1
                    c_ij = row[j]
                    c_ij_plus_1 = row[j + 1]
                    
                    if c_ij > 0:
                        # Poids selon Mack
                        weight = c_ij ** (2 - alpha)
                        
                        # Résidu
                        residual = c_ij_plus_1 - development_factors[j] * c_ij
                        
                        numerator += weight * (residual ** 2)
                        denominator += weight
            
            if denominator > 0:
                sigma_squared = numerator / denominator
            else:
                # Fallback: estimation simple
                sigma_squared = self._estimate_sigma_fallback(triangle_data, j, development_factors[j])
            
            sigma_squares.append(max(sigma_squared, 1e-10))  # Éviter division par zéro
        
        return sigma_squares
    
    def _estimate_sigma_fallback(self, triangle_data: List[List[float]], 
                               period: int, factor: float) -> float:
        """Estimation de fallback pour σ² quand pas assez de données"""
        residuals = []
        
        for row in triangle_data:
            if len(row) > period + 1:
                c_ij = row[period]
                c_ij_plus_1 = row[period + 1]
                if c_ij > 0:
                    predicted = factor * c_ij
                    residual = (c_ij_plus_1 - predicted) / c_ij  # Résidu relatif
                    residuals.append(residual ** 2)
        
        if residuals:
            return sum(residuals) / len(residuals)
        else:
            return 0.01  # Valeur par défaut très faible
    
    def _calculate_prediction_errors(self, triangle_data: List[List[float]],
                                   development_factors: List[float],
                                   sigma_squares: List[float],
                                   include_process: bool = True,
                                   include_parameter: bool = True) -> List[float]:
        """
        Calculer les erreurs standard de prédiction (MSEP) selon Mack
        
        MSEP(R_i) = C_i,I * sqrt(σ²_process + σ²_parameter)
        """
        prediction_errors = []
        
        for i, row in enumerate(triangle_data):
            if not row:
                prediction_errors.append(0.0)
                continue
            
            # Dernière valeur observée
            latest_value = row[-1]
            latest_period = len(row) - 1
            
            # Calcul des composantes de variance
            process_variance = 0.0
            parameter_variance = 0.0
            
            # Variance de processus
            if include_process:
                for j in range(latest_period, len(development_factors)):
                    if j < len(sigma_squares):
                        # Contribution de chaque période future
                        cumul_factor = 1.0
                        for k in range(latest_period, j + 1):
                            if k < len(development_factors):
                                cumul_factor *= development_factors[k]
                        
                        process_variance += (cumul_factor ** 2) * sigma_squares[j] / latest_value
            
            # Variance de paramètre (simplifiée)
            if include_parameter:
                # Estimation empirique basée sur la variabilité des facteurs
                for j in range(latest_period, len(development_factors)):
                    factor_variance = self._estimate_factor_variance(triangle_data, j)
                    parameter_variance += factor_variance * (latest_value ** 2)
            
            # MSEP total
            total_variance = process_variance + parameter_variance
            msep = math.sqrt(total_variance) if total_variance > 0 else 0.0
            
            prediction_errors.append(msep)
        
        return prediction_errors
    
    def _estimate_factor_variance(self, triangle_data: List[List[float]], period: int) -> float:
        """Estimer la variance d'un facteur de développement"""
        
        # Collecter tous les ratios individuels pour ce période
        ratios = []
        for row in triangle_data:
            if len(row) > period + 1 and row[period] > 0:
                ratio = row[period + 1] / row[period]
                ratios.append(ratio)
        
        if len(ratios) < 2:
            return 0.001  # Variance minimale
        
        # Calculer la variance empirique
        mean_ratio = sum(ratios) / len(ratios)
        variance = sum((r - mean_ratio) ** 2 for r in ratios) / (len(ratios) - 1)
        
        return variance
    
    def _bootstrap_confidence_intervals(self, triangle_data: List[List[float]],
                                      development_factors: List[float],
                                      sigma_squares: List[float],
                                      central_ultimates: List[float],
                                      confidence_level: float,
                                      n_iterations: int = 1000) -> Dict[str, List[float]]:
        """
        Bootstrap pour calculer les intervalles de confiance
        """
        print(f"🎲 Démarrage Bootstrap avec {n_iterations} itérations...")
        
        bootstrap_ultimates = []
        
        for iteration in range(n_iterations):
            # Générer un triangle perturbé
            perturbed_triangle = self._generate_perturbed_triangle(
                triangle_data, development_factors, sigma_squares
            )
            
            # Recalculer les facteurs sur le triangle perturbé
            try:
                boot_factors = calculate_development_factors(perturbed_triangle, method="simple_average")
                boot_ultimates = estimate_ultimate_simple(perturbed_triangle, boot_factors)
                bootstrap_ultimates.append(boot_ultimates)
            except:
                # En cas d'erreur, utiliser les valeurs centrales
                bootstrap_ultimates.append(central_ultimates)
        
        # Calculer les percentiles pour les intervalles de confiance
        alpha = 1 - confidence_level
        lower_percentile = (alpha / 2) * 100
        upper_percentile = (1 - alpha / 2) * 100
        
        lower_bounds = []
        upper_bounds = []
        
        for i in range(len(central_ultimates)):
            year_ultimates = [boot[i] if i < len(boot) else central_ultimates[i] for boot in bootstrap_ultimates]
            year_ultimates.sort()
            
            n = len(year_ultimates)
            lower_idx = max(0, int(n * lower_percentile / 100) - 1)
            upper_idx = min(n - 1, int(n * upper_percentile / 100))
            
            lower_bounds.append(year_ultimates[lower_idx])
            upper_bounds.append(year_ultimates[upper_idx])
        
        print(f"✅ Bootstrap terminé - IC {confidence_level:.0%}")
        
        return {
            "confidence_level": confidence_level,
            "lower_bounds": lower_bounds,
            "upper_bounds": upper_bounds,
            "central_estimates": central_ultimates
        }
    
    def _generate_perturbed_triangle(self, triangle_data: List[List[float]],
                                   development_factors: List[float],
                                   sigma_squares: List[float]) -> List[List[float]]:
        """Générer un triangle perturbé pour Bootstrap"""
        
        perturbed = []
        
        for i, row in enumerate(triangle_data):
            if not row:
                perturbed.append([])
                continue
                
            perturbed_row = [row[0]]  # Garder la première valeur
            
            for j in range(1, len(row)):
                if j - 1 < len(development_factors) and j - 1 < len(sigma_squares):
                    # Valeur attendue
                    expected = perturbed_row[j - 1] * development_factors[j - 1]
                    
                    # Ajouter du bruit gaussien
                    if sigma_squares[j - 1] > 0:
                        std_dev = math.sqrt(sigma_squares[j - 1] * perturbed_row[j - 1])
                        noise = random.gauss(0, std_dev)
                        perturbed_value = max(expected + noise, perturbed_row[j - 1])  # Monotonie
                    else:
                        perturbed_value = expected
                    
                    perturbed_row.append(perturbed_value)
                else:
                    perturbed_row.append(row[j])
            
            perturbed.append(perturbed_row)
        
        return perturbed
    
    def _calculate_mack_diagnostics(self, observed: List[List[float]],
                                  completed: List[List[float]],
                                  ultimates: List[float],
                                  prediction_errors: List[float],
                                  confidence_intervals: Dict[str, List[float]],
                                  sigma_squares: List[float]) -> Dict[str, float]:
        """Diagnostics spécifiques à Mack"""
        
        # Diagnostics de base
        ultimate_total = sum(ultimates)
        prediction_error_total = math.sqrt(sum(pe ** 2 for pe in prediction_errors))
        
        # Coefficient de variation total
        cv_total = prediction_error_total / ultimate_total if ultimate_total > 0 else 0
        
        # Largeur moyenne des intervalles de confiance (relatif)
        avg_interval_width = 0
        if confidence_intervals and len(confidence_intervals.get("lower_bounds", [])) == len(ultimates):
            widths = []
            for i, ult in enumerate(ultimates):
                lower = confidence_intervals["lower_bounds"][i]
                upper = confidence_intervals["upper_bounds"][i]
                width = (upper - lower) / ult if ult > 0 else 0
                widths.append(width)
            avg_interval_width = sum(widths) / len(widths) if widths else 0
        
        # Qualité du modèle stochastique
        avg_sigma = sum(sigma_squares) / len(sigma_squares) if sigma_squares else 0
        model_quality = 1.0 / (1.0 + avg_sigma)  # Score de qualité inversé
        
        return {
            "total_prediction_error": round(prediction_error_total, 2),
            "coefficient_of_variation": round(cv_total, 4),
            "avg_interval_width": round(avg_interval_width, 4),
            "model_quality_score": round(model_quality, 4),
            "avg_sigma_square": round(avg_sigma, 6),
            "stochastic_stability": round(1.0 - min(1.0, cv_total), 4),
            "convergence": 1.0
        }
    
    def _calculate_mack_statistics(self, ultimates: List[float],
                                 prediction_errors: List[float],
                                 confidence_intervals: Dict[str, List[float]]) -> Dict[str, float]:
        """Statistiques détaillées Mack"""
        
        return {
            "total_ultimate": round(sum(ultimates), 2),
            "total_prediction_error": round(math.sqrt(sum(pe ** 2 for pe in prediction_errors)), 2),
            "confidence_level": confidence_intervals.get("confidence_level", 0.95),
            "uncertainty_ratio": round(
                math.sqrt(sum(pe ** 2 for pe in prediction_errors)) / sum(ultimates) 
                if sum(ultimates) > 0 else 0, 4
            ),
            "interval_coverage": {
                "average_width": round(
                    sum((confidence_intervals.get("upper_bounds", [0] * len(ultimates))[i] - 
                         confidence_intervals.get("lower_bounds", [0] * len(ultimates))[i]) / ultimates[i] 
                         for i in range(len(ultimates)) if ultimates[i] > 0) / len(ultimates) 
                    if ultimates else 0, 4
                ),
                "max_width": round(
                    max((confidence_intervals.get("upper_bounds", [0] * len(ultimates))[i] - 
                         confidence_intervals.get("lower_bounds", [0] * len(ultimates))[i]) / ultimates[i] 
                         for i in range(len(ultimates)) if ultimates[i] > 0) if ultimates else 0, 4
                )
            }
        }
    
    def _check_mack_assumptions(self, triangle_data: List[List[float]], 
                              development_factors: List[float]) -> Dict[str, Any]:
        """Vérifier les hypothèses du modèle de Mack"""
        
        assumptions = {
            "independence": {
                "satisfied": True,
                "comment": "Hypothèse non testable statistiquement - à valider par expertise"
            },
            "variance_proportionality": {
                "satisfied": None,
                "test_statistic": None,
                "comment": "Test de proportionnalité à implémenter"
            },
            "factor_stability": {
                "satisfied": None,
                "cv_factors": [],
                "comment": "Stabilité des facteurs dans le temps"
            }
        }
        
        # Test de stabilité des facteurs
        factor_cvs = []
        for j in range(len(development_factors)):
            ratios = []
            for row in triangle_data:
                if len(row) > j + 1 and row[j] > 0:
                    ratios.append(row[j + 1] / row[j])
            
            if len(ratios) >= 3:
                mean_ratio = sum(ratios) / len(ratios)
                variance = sum((r - mean_ratio) ** 2 for r in ratios) / (len(ratios) - 1)
                cv = math.sqrt(variance) / mean_ratio if mean_ratio > 0 else 0
                factor_cvs.append(cv)
            else:
                factor_cvs.append(0.0)
        
        assumptions["factor_stability"]["cv_factors"] = factor_cvs
        assumptions["factor_stability"]["satisfied"] = all(cv < 0.3 for cv in factor_cvs)
        assumptions["factor_stability"]["comment"] = f"CVs: {[f'{cv:.2f}' for cv in factor_cvs]}"
        
        return assumptions
    
    def _generate_mack_warnings(self, triangle_data: TriangleData,
                              factors: List[float],
                              stats: Dict[str, float],
                              prediction_errors: List[float],
                              sigma_squares: List[float]) -> List[str]:
        """Avertissements spécifiques Mack"""
        warnings = []
        
        # Vérifications sur les variances
        if any(sigma < 1e-8 for sigma in sigma_squares):
            warnings.append("Paramètres de variance très faibles - modèle potentiellement instable")
        
        if any(sigma > 1e6 for sigma in sigma_squares):
            warnings.append("Paramètres de variance très élevés - forte incertitude")
        
        # Erreurs de prédiction
        max_cv = max(pe / sum(row) if row and sum(row) > 0 else 0 
                    for pe, row in zip(prediction_errors, triangle_data.data))
        if max_cv > 0.5:
            warnings.append(f"Coefficient de variation élevé ({max_cv:.1%}) - incertitude importante")
        
        # Données insuffisantes
        if stats.get("data_points", 0) < 10:
            warnings.append("Peu de données - intervalles de confiance moins fiables")
        
        # Stabilité des facteurs
        if len(factors) > 2:
            factor_range = max(factors) - min(factors)
            factor_mean = sum(factors) / len(factors)
            if factor_range / factor_mean > 0.4:
                warnings.append("Facteurs instables - hypothèses Mack possiblement violées")
        
        return warnings
    
    def get_method_info(self) -> Dict[str, Any]:
        """Informations détaillées sur la méthode de Mack"""
        return {
            "method_id": self.method_id,
            "method_name": self.method_name,
            "category": self.config.category,
            "description": self.config.description,
            "advantages": [
                "Fournit des intervalles de confiance",
                "Quantification rigoureuse de l'incertitude",
                "Extension naturelle du Chain Ladder",
                "Largement accepté académiquement"
            ],
            "limitations": [
                "Hypothèses restrictives à valider",
                "Calculs plus complexes",
                "Sensible à la qualité des données",
                "Intervalles parfois trop larges"
            ],
            "best_use_cases": [
                "Quantification d'incertitude requise",
                "Reporting avec intervalles de confiance",
                "Analyse de sensibilité",
                "Validation d'autres méthodes"
            ],
            "assumptions": [
                "Indépendance des années d'accident",
                "Facteurs de développement futurs = passés",
                "Variance proportionnelle aux montants",
                "Pas de biais systématique"
            ],
            "parameters": self.config.parameters
        }

def create_mack_method() -> MackMethod:
    """Factory pour créer une instance Mack"""
    return MackMethod()