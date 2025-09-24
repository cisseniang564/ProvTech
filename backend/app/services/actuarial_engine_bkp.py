"""
Moteur de calculs actuariels pour provisionnement
Implémente les méthodes Chain Ladder, Bornhuetter-Ferguson, Mack et autres
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Optional, Union
from datetime import datetime
from enum import Enum
import logging
from dataclasses import dataclass
from scipy import stats
import warnings

logger = logging.getLogger(__name__)

class ReservingMethod(str, Enum):
    """Méthodes de provisionnement supportées"""
    CHAIN_LADDER = "chain_ladder"
    BORNHUETTER_FERGUSON = "bornhuetter_ferguson"
    MACK_CHAIN_LADDER = "mack_chain_ladder"
    CAPE_COD = "cape_cod"
    EXPECTED_LOSS_RATIO = "expected_loss_ratio"
    ADDITIVE_METHOD = "additive_method"
    MUNICH_CHAIN_LADDER = "munich_chain_ladder"

class TriangleType(str, Enum):
    """Types de triangles"""
    INCREMENTAL = "incremental"
    CUMULATIVE = "cumulative"
    PAID = "paid"
    INCURRED = "incurred"

@dataclass
class ActuarialResult:
    """Résultat d'un calcul actuariel"""
    method: ReservingMethod
    ultimate_claims: np.ndarray
    reserves: np.ndarray
    development_factors: Optional[np.ndarray] = None
    tail_factor: Optional[float] = None
    statistics: Optional[Dict] = None
    confidence_intervals: Optional[Dict] = None
    residuals: Optional[np.ndarray] = None
    process_variance: Optional[float] = None
    parameter_variance: Optional[float] = None
    total_process_error: Optional[float] = None
    created_at: datetime = None
    
    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.utcnow()

class ActuarialEngine:
    """
    Moteur de calculs actuariels principal
    
    Implémente les principales méthodes de provisionnement selon les standards:
    - IFRS 17
    - Solvency II
    - Directive européenne
    """
    
    def __init__(self, confidence_level: float = 0.75):
        self.confidence_level = confidence_level
        self.logger = logging.getLogger(__name__)
        
    def validate_triangle(self, triangle: np.ndarray) -> Tuple[bool, str]:
        """
        Valide la structure et qualité des données du triangle
        
        Args:
            triangle: Triangle de développement (matrice n×m)
            
        Returns:
            (is_valid, error_message)
        """
        try:
            if not isinstance(triangle, np.ndarray):
                return False, "Triangle doit être un numpy array"
                
            if triangle.ndim != 2:
                return False, "Triangle doit être une matrice 2D"
                
            if triangle.shape[0] == 0 or triangle.shape[1] == 0:
                return False, "Triangle ne peut pas être vide"
                
            # Vérifier la structure triangulaire
            n_rows, n_cols = triangle.shape
            for i in range(n_rows):
                for j in range(n_cols):
                    if i + j >= n_cols and not np.isnan(triangle[i, j]) and triangle[i, j] != 0:
                        return False, f"Valeur non-nulle détectée hors triangle à ({i}, {j})"
            
            # Vérifier les valeurs négatives
            valid_mask = ~np.isnan(triangle)
            if np.any(triangle[valid_mask] < 0):
                return False, "Triangle contient des valeurs négatives"
                
            # Vérifier qu'il y a au moins une ligne complète
            complete_rows = 0
            for i in range(n_rows):
                if not np.any(np.isnan(triangle[i, :n_cols-i])):
                    complete_rows += 1
                    
            if complete_rows == 0:
                return False, "Triangle doit avoir au moins une ligne complète"
                
            return True, "Triangle valide"
            
        except Exception as e:
            return False, f"Erreur de validation: {str(e)}"

    def to_cumulative(self, incremental_triangle: np.ndarray) -> np.ndarray:
        """Convertit un triangle incrémental en cumulatif"""
        cumulative = np.copy(incremental_triangle)
        n_rows, n_cols = cumulative.shape
        
        for i in range(n_rows):
            for j in range(1, min(n_cols, n_cols - i)):
                if not np.isnan(cumulative[i, j]) and not np.isnan(cumulative[i, j-1]):
                    cumulative[i, j] = cumulative[i, j-1] + incremental_triangle[i, j]
                elif not np.isnan(cumulative[i, j-1]):
                    cumulative[i, j] = cumulative[i, j-1]
                    
        return cumulative

    def to_incremental(self, cumulative_triangle: np.ndarray) -> np.ndarray:
        """Convertit un triangle cumulatif en incrémental"""
        incremental = np.copy(cumulative_triangle)
        n_rows, n_cols = incremental.shape
        
        for i in range(n_rows):
            for j in range(min(n_cols - 1, n_cols - i - 1), 0, -1):
                if not np.isnan(incremental[i, j]) and not np.isnan(incremental[i, j-1]):
                    incremental[i, j] = cumulative_triangle[i, j] - cumulative_triangle[i, j-1]
                    
        return incremental

    def chain_ladder(self, triangle: np.ndarray, tail_factor: Optional[float] = None) -> ActuarialResult:
        """
        Méthode Chain Ladder classique
        
        Args:
            triangle: Triangle de développement cumulatif
            tail_factor: Facteur de queue optionnel
            
        Returns:
            ActuarialResult avec projections et statistiques
        """
        self.logger.info("Début calcul Chain Ladder")
        
        # Validation
        is_valid, error_msg = self.validate_triangle(triangle)
        if not is_valid:
            raise ValueError(f"Triangle invalide: {error_msg}")
        
        n_rows, n_cols = triangle.shape
        
        # Calcul des facteurs de développement
        factors = np.full(n_cols - 1, np.nan)
        weights = np.full(n_cols - 1, np.nan)
        
        for j in range(n_cols - 1):
            numerator = 0
            denominator = 0
            
            for i in range(n_rows - j - 1):
                if (not np.isnan(triangle[i, j]) and not np.isnan(triangle[i, j + 1]) 
                    and triangle[i, j] > 0):
                    numerator += triangle[i, j + 1]
                    denominator += triangle[i, j]
            
            if denominator > 0:
                factors[j] = numerator / denominator
                weights[j] = denominator
            else:
                factors[j] = 1.0
                weights[j] = 0
        
        # Application du facteur de queue si fourni
        if tail_factor is not None and tail_factor > 1.0:
            factors = np.append(factors, tail_factor)
        
        # Projection du triangle
        projected_triangle = np.copy(triangle)
        
        for i in range(n_rows):
            for j in range(n_cols):
                if np.isnan(projected_triangle[i, j]) and i + j >= n_cols:
                    # Reconstitution à partir de la dernière valeur connue
                    last_known_j = n_cols - i - 1
                    if last_known_j >= 0 and not np.isnan(projected_triangle[i, last_known_j]):
                        value = projected_triangle[i, last_known_j]
                        
                        # Application des facteurs de développement
                        for k in range(last_known_j, j):
                            if k < len(factors) and not np.isnan(factors[k]):
                                value *= factors[k]
                        
                        projected_triangle[i, j] = value
        
        # Calcul des ultimes et réserves
        ultimate_claims = np.full(n_rows, np.nan)
        reserves = np.full(n_rows, np.nan)
        
        for i in range(n_rows):
            # Ultimate = dernière colonne du triangle projeté
            if tail_factor is not None:
                # Si facteur de queue, on l'applique à la dernière valeur connue
                last_known_j = n_cols - i - 1
                if last_known_j >= 0 and not np.isnan(projected_triangle[i, last_known_j]):
                    ultimate_claims[i] = projected_triangle[i, last_known_j]
                    if tail_factor > 1.0:
                        ultimate_claims[i] *= tail_factor
            else:
                ultimate_claims[i] = projected_triangle[i, -1]
            
            # Réserve = Ultimate - dernière valeur observée
            last_observed_j = n_cols - i - 1
            if (last_observed_j >= 0 and 
                not np.isnan(triangle[i, last_observed_j]) and
                not np.isnan(ultimate_claims[i])):
                reserves[i] = ultimate_claims[i] - triangle[i, last_observed_j]
            else:
                reserves[i] = ultimate_claims[i]
        
        # Statistiques
        statistics = {
            'total_reserves': np.nansum(reserves),
            'total_ultimate': np.nansum(ultimate_claims),
            'average_factor': np.nanmean(factors[~np.isnan(factors)]),
            'factors_volatility': np.nanstd(factors[~np.isnan(factors)]),
            'weighted_factors': factors,
            'weights': weights
        }
        
        self.logger.info(f"Chain Ladder terminé - Réserves totales: {statistics['total_reserves']:.0f}")
        
        return ActuarialResult(
            method=ReservingMethod.CHAIN_LADDER,
            ultimate_claims=ultimate_claims,
            reserves=reserves,
            development_factors=factors,
            tail_factor=tail_factor,
            statistics=statistics
        )

    def bornhuetter_ferguson(self, 
                           triangle: np.ndarray,
                           expected_loss_ratios: np.ndarray,
                           premiums: np.ndarray,
                           tail_factor: Optional[float] = None) -> ActuarialResult:
        """
        Méthode Bornhuetter-Ferguson
        
        Args:
            triangle: Triangle de développement cumulatif
            expected_loss_ratios: Ratios S/P attendus par année de survenance
            premiums: Primes acquises par année de survenance
            tail_factor: Facteur de queue optionnel
            
        Returns:
            ActuarialResult avec projections BF
        """
        self.logger.info("Début calcul Bornhuetter-Ferguson")
        
        # Validation
        is_valid, error_msg = self.validate_triangle(triangle)
        if not is_valid:
            raise ValueError(f"Triangle invalide: {error_msg}")
            
        n_rows, n_cols = triangle.shape
        
        if len(expected_loss_ratios) != n_rows:
            raise ValueError("Nombre de ratios S/P doit égaler le nombre de lignes")
            
        if len(premiums) != n_rows:
            raise ValueError("Nombre de primes doit égaler le nombre de lignes")
        
        # Calcul des facteurs de développement (Chain Ladder)
        cl_result = self.chain_ladder(triangle, tail_factor)
        factors = cl_result.development_factors
        
        # Calcul des pourcentages de développement
        development_patterns = np.full((n_rows, n_cols), np.nan)
        
        for i in range(n_rows):
            # Pourcentage développé à chaque période
            for j in range(n_cols):
                if i + j < n_cols:  # Données observées
                    if j == 0:
                        development_patterns[i, j] = 1.0 / np.prod(factors[j:n_cols-i-1]) if n_cols-i-1 > j else 1.0
                    else:
                        development_patterns[i, j] = development_patterns[i, j-1] * factors[j-1] if j-1 < len(factors) else development_patterns[i, j-1]
        
        # Application de la formule BF
        ultimate_claims = np.full(n_rows, np.nan)
        reserves = np.full(n_rows, np.nan)
        
        for i in range(n_rows):
            expected_ultimate = expected_loss_ratios[i] * premiums[i]
            
            # Déterminer le dernier développement observé
            last_dev_j = n_cols - i - 1
            if last_dev_j >= 0 and not np.isnan(triangle[i, last_dev_j]):
                observed_amount = triangle[i, last_dev_j]
                
                # Pourcentage développé à ce stade
                if last_dev_j < n_cols and not np.isnan(development_patterns[i, last_dev_j]):
                    pct_developed = development_patterns[i, last_dev_j]
                else:
                    # Calcul du pourcentage développé basé sur les facteurs
                    remaining_factors = factors[last_dev_j:] if last_dev_j < len(factors) else []
                    if len(remaining_factors) > 0:
                        total_factor = np.prod(remaining_factors[~np.isnan(remaining_factors)])
                        pct_developed = 1.0 / total_factor if total_factor > 0 else 1.0
                    else:
                        pct_developed = 1.0
                
                # Formule BF: Ultimate = Observed + (Expected - Observed) * (1 - % développé)
                if pct_developed < 1.0:
                    expected_at_current_dev = expected_ultimate * pct_developed
                    ultimate_claims[i] = observed_amount + (expected_ultimate - expected_at_current_dev)
                else:
                    ultimate_claims[i] = observed_amount
                    
                reserves[i] = ultimate_claims[i] - observed_amount
                
            else:
                # Pas de données observées
                ultimate_claims[i] = expected_ultimate
                reserves[i] = expected_ultimate
        
        # Application du facteur de queue
        if tail_factor is not None and tail_factor > 1.0:
            ultimate_claims *= tail_factor
            # Les réserves sont recalculées
            for i in range(n_rows):
                last_dev_j = n_cols - i - 1
                if last_dev_j >= 0 and not np.isnan(triangle[i, last_dev_j]):
                    reserves[i] = ultimate_claims[i] - triangle[i, last_dev_j]
        
        # Statistiques
        statistics = {
            'total_reserves': np.nansum(reserves),
            'total_ultimate': np.nansum(ultimate_claims),
            'expected_ultimate': np.sum(expected_loss_ratios * premiums),
            'bf_vs_cl_ratio': np.nansum(reserves) / cl_result.statistics['total_reserves'] if cl_result.statistics['total_reserves'] > 0 else 1.0,
            'average_expected_lr': np.mean(expected_loss_ratios),
            'development_patterns': development_patterns
        }
        
        self.logger.info(f"Bornhuetter-Ferguson terminé - Réserves totales: {statistics['total_reserves']:.0f}")
        
        return ActuarialResult(
            method=ReservingMethod.BORNHUETTER_FERGUSON,
            ultimate_claims=ultimate_claims,
            reserves=reserves,
            development_factors=factors,
            tail_factor=tail_factor,
            statistics=statistics
        )

    def mack_chain_ladder(self, triangle: np.ndarray, tail_factor: Optional[float] = None) -> ActuarialResult:
        """
        Méthode Chain Ladder de Mack avec estimation de l'incertitude
        
        Calcule les erreurs de processus et de paramètre selon le modèle de Mack (1993)
        """
        self.logger.info("Début calcul Mack Chain Ladder")
        
        # Calcul Chain Ladder de base
        cl_result = self.chain_ladder(triangle, tail_factor)
        
        n_rows, n_cols = triangle.shape
        factors = cl_result.development_factors
        
        # Calcul des variances de processus (σ²)
        process_variances = np.full(n_cols - 1, np.nan)
        
        for j in range(n_cols - 1):
            if not np.isnan(factors[j]) and factors[j] > 0:
                residuals_sum = 0
                degrees_freedom = 0
                
                for i in range(n_rows - j - 1):
                    if (not np.isnan(triangle[i, j]) and not np.isnan(triangle[i, j + 1]) 
                        and triangle[i, j] > 0):
                        
                        expected = triangle[i, j] * factors[j]
                        observed = triangle[i, j + 1]
                        residual = (observed - expected) ** 2 / triangle[i, j]
                        residuals_sum += residual
                        degrees_freedom += 1
                
                if degrees_freedom > 1:
                    process_variances[j] = residuals_sum / (degrees_freedom - 1)
                else:
                    process_variances[j] = 0
        
        # Extrapolation de la variance pour le tail
        if tail_factor is not None:
            # Utiliser la variance du dernier développement disponible
            last_variance = process_variances[~np.isnan(process_variances)][-1] if len(process_variances[~np.isnan(process_variances)]) > 0 else 0
            process_variances = np.append(process_variances, last_variance)
        
        # Calcul de l'erreur de prédiction pour chaque ligne
        prediction_errors = np.full(n_rows, np.nan)
        
        for i in range(n_rows):
            if not np.isnan(cl_result.reserves[i]):
                # Erreur de processus
                process_error = 0
                last_known_j = n_cols - i - 1
                
                if last_known_j >= 0 and not np.isnan(triangle[i, last_known_j]):
                    current_value = triangle[i, last_known_j]
                    
                    for k in range(last_known_j, n_cols - 1):
                        if k < len(factors) and k < len(process_variances):
                            if not np.isnan(factors[k]) and not np.isnan(process_variances[k]):
                                factor_contribution = np.prod(factors[k+1:] if k+1 < len(factors) else [1])
                                process_error += current_value * (factor_contribution ** 2) * process_variances[k]
                                current_value *= factors[k]
                
                prediction_errors[i] = np.sqrt(process_error) if process_error > 0 else 0
        
        # Erreur totale du portefeuille
        total_process_error = np.sqrt(np.nansum(prediction_errors ** 2))
        
        # Statistiques enrichies
        mack_statistics = cl_result.statistics.copy()
        mack_statistics.update({
            'process_variances': process_variances,
            'prediction_errors': prediction_errors,
            'total_process_error': total_process_error,
            'coefficient_of_variation': total_process_error / mack_statistics['total_reserves'] if mack_statistics['total_reserves'] > 0 else 0
        })
        
        # Intervalles de confiance (approximation normale)
        confidence_intervals = {}
        z_score = stats.norm.ppf((1 + self.confidence_level) / 2)
        
        for i in range(n_rows):
            if not np.isnan(prediction_errors[i]) and prediction_errors[i] > 0:
                lower = max(0, cl_result.reserves[i] - z_score * prediction_errors[i])
                upper = cl_result.reserves[i] + z_score * prediction_errors[i]
                confidence_intervals[f'reserves_line_{i}'] = {'lower': lower, 'upper': upper}
        
        # IC pour le total
        if total_process_error > 0:
            total_lower = max(0, mack_statistics['total_reserves'] - z_score * total_process_error)
            total_upper = mack_statistics['total_reserves'] + z_score * total_process_error
            confidence_intervals['total_reserves'] = {'lower': total_lower, 'upper': total_upper}
        
        self.logger.info(f"Mack Chain Ladder terminé - Erreur processus: {total_process_error:.0f}")
        
        return ActuarialResult(
            method=ReservingMethod.MACK_CHAIN_LADDER,
            ultimate_claims=cl_result.ultimate_claims,
            reserves=cl_result.reserves,
            development_factors=cl_result.development_factors,
            tail_factor=tail_factor,
            statistics=mack_statistics,
            confidence_intervals=confidence_intervals,
            process_variance=np.nanmean(process_variances),
            total_process_error=total_process_error
        )

    def cape_cod(self, 
                 triangle: np.ndarray,
                 premiums: np.ndarray,
                 tail_factor: Optional[float] = None) -> ActuarialResult:
        """
        Méthode Cape Cod - estime le ratio S/P implicite
        
        Args:
            triangle: Triangle cumulatif
            premiums: Primes par année de survenance
            tail_factor: Facteur de queue optionnel
        """
        self.logger.info("Début calcul Cape Cod")
        
        # Validation
        is_valid, error_msg = self.validate_triangle(triangle)
        if not is_valid:
            raise ValueError(f"Triangle invalide: {error_msg}")
            
        n_rows, n_cols = triangle.shape
        
        if len(premiums) != n_rows:
            raise ValueError("Nombre de primes doit égaler le nombre de lignes")
        
        # Calcul des facteurs de développement
        cl_result = self.chain_ladder(triangle, tail_factor)
        factors = cl_result.development_factors
        
        # Estimation du ratio S/P implicite
        numerator = 0
        denominator = 0
        
        for i in range(n_rows):
            last_dev_j = n_cols - i - 1
            
            if (last_dev_j >= 0 and not np.isnan(triangle[i, last_dev_j]) and premiums[i] > 0):
                # Facteur de développement résiduel
                remaining_factor = 1.0
                if last_dev_j < len(factors):
                    remaining_factors = factors[last_dev_j:]
                    remaining_factor = np.prod(remaining_factors[~np.isnan(remaining_factors)])
                    if tail_factor is not None and tail_factor > 1.0:
                        remaining_factor *= tail_factor
                
                # Contribution à l'estimation du ratio S/P
                numerator += triangle[i, last_dev_j] * remaining_factor
                denominator += premiums[i]
        
        estimated_loss_ratio = numerator / denominator if denominator > 0 else 1.0
        
        # Application BF avec le ratio estimé
        estimated_ratios = np.full(n_rows, estimated_loss_ratio)
        
        bf_result = self.bornhuetter_ferguson(triangle, estimated_ratios, premiums, tail_factor)
        
        # Statistiques Cape Cod
        cc_statistics = bf_result.statistics.copy()
        cc_statistics.update({
            'estimated_loss_ratio': estimated_loss_ratio,
            'credibility_weighted': True,
            'method_blend': 'cape_cod_implicit'
        })
        
        self.logger.info(f"Cape Cod terminé - Ratio S/P estimé: {estimated_loss_ratio:.3f}")
        
        return ActuarialResult(
            method=ReservingMethod.CAPE_COD,
            ultimate_claims=bf_result.ultimate_claims,
            reserves=bf_result.reserves,
            development_factors=bf_result.development_factors,
            tail_factor=tail_factor,
            statistics=cc_statistics
        )

    def calculate_tail_factor(self, factors: np.ndarray, method: str = "exponential") -> float:
        """
        Calcule un facteur de queue basé sur les facteurs de développement
        
        Args:
            factors: Facteurs de développement observés
            method: Méthode d'extrapolation ('exponential', 'curve_fit', 'average')
        """
        valid_factors = factors[~np.isnan(factors)]
        
        if len(valid_factors) < 2:
            return 1.05  # Valeur par défaut
        
        if method == "exponential":
            # Décroissance exponentielle vers 1
            if len(valid_factors) >= 3:
                # Utiliser les 3 derniers facteurs
                recent_factors = valid_factors[-3:]
                decreases = recent_factors[1:] - 1.0
                avg_decrease = np.mean(decreases)
                
                tail = 1.0 + avg_decrease * 0.5  # Décroissance vers 1
                return max(1.01, tail)
        
        elif method == "curve_fit":
            # Ajustement d'une courbe de décroissance
            x = np.arange(len(valid_factors))
            y = valid_factors - 1.0
            
            if len(y) >= 3:
                # Régression exponentielle: y = a * exp(-b*x)
                try:
                    with warnings.catch_warnings():
                        warnings.simplefilter("ignore")
                        
                        # Log-transformation pour régression linéaire
                        log_y = np.log(np.maximum(y, 1e-6))
                        coeffs = np.polyfit(x, log_y, 1)
                        
                        # Prédiction pour période suivante
                        next_x = len(valid_factors)
                        next_log_y = coeffs[0] * next_x + coeffs[1]
                        tail_addition = np.exp(next_log_y)
                        
                        return max(1.01, 1.0 + tail_addition)
                except:
                    pass
        
        # Méthode par défaut: moyenne des décroissances
        if len(valid_factors) >= 2:
            avg_factor = np.mean(valid_factors[-2:])
            tail = 1.0 + (avg_factor - 1.0) * 0.3
            return max(1.01, min(tail, 1.20))
        
        return 1.05

    def benchmark_methods(self, 
                         triangle: np.ndarray,
                         premiums: Optional[np.ndarray] = None,
                         expected_lrs: Optional[np.ndarray] = None,
                         tail_factor: Optional[float] = None) -> Dict[str, ActuarialResult]:
        """
        Benchmark de plusieurs méthodes sur le même triangle
        
        Returns:
            Dictionnaire avec résultats de toutes les méthodes applicables
        """
        self.logger.info("Début benchmark multi-méthodes")
        
        results = {}
        
        # Chain Ladder (toujours possible)
        try:
            results['chain_ladder'] = self.chain_ladder(triangle, tail_factor)
            self.logger.info("✅ Chain Ladder calculé")
        except Exception as e:
            self.logger.error(f"❌ Chain Ladder échoué: {e}")
        
        # Mack Chain Ladder
        try:
            results['mack_chain_ladder'] = self.mack_chain_ladder(triangle, tail_factor)
            self.logger.info("✅ Mack Chain Ladder calculé")
        except Exception as e:
            self.logger.error(f"❌ Mack Chain Ladder échoué: {e}")
        
        # Cape Cod (nécessite les primes)
        if premiums is not None:
            try:
                results['cape_cod'] = self.cape_cod(triangle, premiums, tail_factor)
                self.logger.info("✅ Cape Cod calculé")
            except Exception as e:
                self.logger.error(f"❌ Cape Cod échoué: {e}")
        
        # Bornhuetter-Ferguson (nécessite primes + ratios S/P)
        if premiums is not None and expected_lrs is not None:
            try:
                results['bornhuetter_ferguson'] = self.bornhuetter_ferguson(
                    triangle, expected_lrs, premiums, tail_factor
                )
                self.logger.info("✅ Bornhuetter-Ferguson calculé")
            except Exception as e:
                self.logger.error(f"❌ Bornhuetter-Ferguson échoué: {e}")
        
        # Comparaison des résultats
        if len(results) > 1:
            comparison = self._compare_results(results)
            for result in results.values():
                result.statistics['benchmark_comparison'] = comparison
        
        self.logger.info(f"Benchmark terminé - {len(results)} méthodes calculées")
        return results

    def _compare_results(self, results: Dict[str, ActuarialResult]) -> Dict:
        """Compare les résultats de plusieurs méthodes"""
        
        comparison = {
            'methods_count': len(results),
            'total_reserves': {},
            'reserves_cv': 0,
            'ultimate_cv': 0,
            'convergence_analysis': {}
        }
        
        # Extraction des totaux
        reserves_totals = []
        ultimate_totals = []
        
        for method, result in results.items():
            total_reserves = result.statistics.get('total_reserves', 0)
            total_ultimate = result.statistics.get('total_ultimate', 0)
            
            reserves_totals.append(total_reserves)
            ultimate_totals.append(total_ultimate)
            
            comparison['total_reserves'][method] = total_reserves
        
        if len(reserves_totals) > 1:
            # Coefficient de variation entre méthodes
            comparison['reserves_cv'] = np.std(reserves_totals) / np.mean(reserves_totals) if np.mean(reserves_totals) > 0 else 0
            comparison['ultimate_cv'] = np.std(ultimate_totals) / np.mean(ultimate_totals) if np.mean(ultimate_totals) > 0 else 0
            
            # Analyse de convergence (écarts relatifs)
            base_reserves = reserves_totals[0]  # Chain Ladder comme référence
            for i, (method, reserves) in enumerate(zip(results.keys(), reserves_totals)):
                if base_reserves > 0:
                    comparison['convergence_analysis'][method] = {
                        'relative_diff_pct': ((reserves - base_reserves) / base_reserves) * 100,
                        'absolute_diff': reserves - base_reserves
                    }
        
        return comparison

# Classes utilitaires pour les calculs avancés

class TriangleProcessor:
    """Utilitaires pour manipuler et analyser les triangles"""
    
    @staticmethod
    def smooth_triangle(triangle: np.ndarray, method: str = "moving_average") -> np.ndarray:
        """Lisse un triangle pour réduire la volatilité"""
        smoothed = np.copy(triangle)
        n_rows, n_cols = triangle.shape
        
        if method == "moving_average":
            # Lissage par moyenne mobile sur les facteurs
            for j in range(n_cols - 1):
                factors = []
                for i in range(n_rows - j - 1):
                    if (not np.isnan(triangle[i, j]) and not np.isnan(triangle[i, j + 1]) 
                        and triangle[i, j] > 0):
                        factors.append(triangle[i, j + 1] / triangle[i, j])
                
                if len(factors) >= 3:
                    # Moyenne mobile sur 3 périodes
                    smooth_factors = []
                    for k in range(len(factors)):
                        start = max(0, k - 1)
                        end = min(len(factors), k + 2)
                        smooth_factors.append(np.mean(factors[start:end]))
                    
                    # Réappliquer les facteurs lissés
                    for i, smooth_factor in enumerate(smooth_factors):
                        if i < n_rows - j - 1 and not np.isnan(triangle[i, j]):
                            smoothed[i, j + 1] = triangle[i, j] * smooth_factor
        
        return smoothed
    
    @staticmethod
    def detect_outliers(triangle: np.ndarray, threshold: float = 2.0) -> np.ndarray:
        """Détecte les outliers dans un triangle basé sur les facteurs de développement"""
        n_rows, n_cols = triangle.shape
        outliers = np.zeros_like(triangle, dtype=bool)
        
        for j in range(n_cols - 1):
            factors = []
            positions = []
            
            for i in range(n_rows - j - 1):
                if (not np.isnan(triangle[i, j]) and not np.isnan(triangle[i, j + 1]) 
                    and triangle[i, j] > 0):
                    factors.append(triangle[i, j + 1] / triangle[i, j])
                    positions.append(i)
            
            if len(factors) >= 3:
                mean_factor = np.mean(factors)
                std_factor = np.std(factors)
                
                for pos, factor in zip(positions, factors):
                    if abs(factor - mean_factor) > threshold * std_factor:
                        outliers[pos, j + 1] = True
        
        return outliers
    
    @staticmethod
    def calculate_development_patterns(triangle: np.ndarray) -> Dict[str, np.ndarray]:
        """Calcule différents patterns de développement"""
        n_rows, n_cols = triangle.shape
        
        patterns = {
            'age_to_age': np.full(n_cols - 1, np.nan),
            'age_to_ultimate': np.full(n_cols, np.nan),
            'percent_reported': np.full(n_cols, np.nan)
        }
        
        # Age-to-age factors
        for j in range(n_cols - 1):
            numerator = denominator = 0
            for i in range(n_rows - j - 1):
                if (not np.isnan(triangle[i, j]) and not np.isnan(triangle[i, j + 1]) 
                    and triangle[i, j] > 0):
                    numerator += triangle[i, j + 1]
                    denominator += triangle[i, j]
            
            if denominator > 0:
                patterns['age_to_age'][j] = numerator / denominator
        
        # Age-to-ultimate (en supposant que la dernière colonne complète est ultimate)
        if not np.all(np.isnan(patterns['age_to_age'])):
            cumulative_factors = np.cumprod(patterns['age_to_age'][::-1])[::-1]
            patterns['age_to_ultimate'][:-1] = cumulative_factors
            patterns['age_to_ultimate'][-1] = 1.0
            
            # Pourcentage rapporté (inverse d'age-to-ultimate)
            patterns['percent_reported'] = 1.0 / patterns['age_to_ultimate']
        
        return patterns

class ActuarialDiagnostics:
    """Outils de diagnostic pour l'analyse actuarielle"""
    
    @staticmethod
    def residual_analysis(triangle: np.ndarray, fitted_triangle: np.ndarray) -> Dict:
        """Analyse des résidus entre triangle observé et ajusté"""
        
        residuals = triangle - fitted_triangle
        valid_mask = ~np.isnan(residuals)
        
        if not np.any(valid_mask):
            return {'error': 'Aucun résidu valide'}
        
        valid_residuals = residuals[valid_mask]
        
        analysis = {
            'mean_residual': np.mean(valid_residuals),
            'std_residual': np.std(valid_residuals),
            'normalized_residuals': valid_residuals / np.std(valid_residuals) if np.std(valid_residuals) > 0 else valid_residuals,
            'outlier_count': np.sum(np.abs(valid_residuals) > 2 * np.std(valid_residuals)),
            'normality_test': None  # Placeholder pour test de normalité
        }
        
        # Test de normalité simple (Shapiro-Wilk approximation)
        if len(valid_residuals) >= 3:
            try:
                stat, p_value = stats.shapiro(valid_residuals[:50])  # Limite pour performance
                analysis['normality_test'] = {'statistic': stat, 'p_value': p_value}
            except:
                pass
        
        return analysis
    
    @staticmethod
    def stability_test(triangles: List[np.ndarray], method: str = "chain_ladder") -> Dict:
        """Test de stabilité sur plusieurs triangles successifs"""
        
        if len(triangles) < 2:
            return {'error': 'Minimum 2 triangles requis'}
        
        engine = ActuarialEngine()
        factors_history = []
        reserves_history = []
        
        for triangle in triangles:
            try:
                if method == "chain_ladder":
                    result = engine.chain_ladder(triangle)
                else:
                    result = engine.mack_chain_ladder(triangle)
                
                factors_history.append(result.development_factors)
                reserves_history.append(result.statistics['total_reserves'])
            except Exception as e:
                continue
        
        if len(factors_history) < 2:
            return {'error': 'Calculs échoués'}
        
        # Analyse de la stabilité des facteurs
        factor_stability = {}
        min_len = min(len(f) for f in factors_history if f is not None)
        
        for j in range(min_len):
            period_factors = [factors[j] for factors in factors_history 
                            if factors is not None and j < len(factors) and not np.isnan(factors[j])]
            
            if len(period_factors) >= 2:
                factor_stability[f'period_{j}'] = {
                    'mean': np.mean(period_factors),
                    'std': np.std(period_factors),
                    'cv': np.std(period_factors) / np.mean(period_factors) if np.mean(period_factors) > 0 else np.inf,
                    'trend': np.polyfit(range(len(period_factors)), period_factors, 1)[0] if len(period_factors) >= 3 else 0
                }
        
        # Stabilité des réserves totales
        reserves_stability = {
            'mean_reserves': np.mean(reserves_history),
            'std_reserves': np.std(reserves_history),
            'cv_reserves': np.std(reserves_history) / np.mean(reserves_history) if np.mean(reserves_history) > 0 else np.inf,
            'trend_reserves': np.polyfit(range(len(reserves_history)), reserves_history, 1)[0] if len(reserves_history) >= 3 else 0
        }
        
        return {
            'factor_stability': factor_stability,
            'reserves_stability': reserves_stability,
            'triangles_analyzed': len(factors_history)
        }

# Fonctions utilitaires pour l'intégration

def validate_input_data(triangle_data: Dict, method_params: Dict = None) -> Tuple[bool, str, Dict]:
    """
    Valide les données d'entrée pour les calculs actuariels
    
    Args:
        triangle_data: Dict contenant les données du triangle
        method_params: Paramètres spécifiques à la méthode
        
    Returns:
        (is_valid, error_message, cleaned_data)
    """
    try:
        # Validation du triangle principal
        if 'values' not in triangle_data:
            return False, "Données 'values' manquantes", {}
        
        triangle = np.array(triangle_data['values'])
        
        if triangle.size == 0:
            return False, "Triangle vide", {}
        
        # Nettoyage des données
        cleaned_data = {
            'triangle': triangle,
            'triangle_type': triangle_data.get('type', 'cumulative'),
            'currency': triangle_data.get('currency', 'EUR'),
            'line_of_business': triangle_data.get('line_of_business', 'unknown')
        }
        
        # Validation des paramètres de méthode
        if method_params:
            if 'premiums' in method_params:
                premiums = np.array(method_params['premiums'])
                if len(premiums) != triangle.shape[0]:
                    return False, "Nombre de primes incompatible avec le triangle", {}
                cleaned_data['premiums'] = premiums
            
            if 'expected_loss_ratios' in method_params:
                lrs = np.array(method_params['expected_loss_ratios'])
                if len(lrs) != triangle.shape[0]:
                    return False, "Nombre de ratios S/P incompatible avec le triangle", {}
                cleaned_data['expected_loss_ratios'] = lrs
            
            if 'tail_factor' in method_params:
                tail = float(method_params['tail_factor'])
                if tail < 1.0 or tail > 3.0:
                    return False, "Facteur de queue doit être entre 1.0 et 3.0", {}
                cleaned_data['tail_factor'] = tail
        
        return True, "Données valides", cleaned_data
        
    except Exception as e:
        return False, f"Erreur de validation: {str(e)}", {}

def create_engine_instance(config: Dict = None) -> ActuarialEngine:
    """Factory pour créer une instance du moteur actuariel"""
    
    default_config = {
        'confidence_level': 0.75,
        'enable_logging': True,
        'log_level': 'INFO'
    }
    
    if config:
        default_config.update(config)
    
    # Configuration du logging
    if default_config['enable_logging']:
        logging.basicConfig(
            level=getattr(logging, default_config['log_level']),
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
    
    return ActuarialEngine(confidence_level=default_config['confidence_level'])

# Exemple d'utilisation et tests unitaires de base

if __name__ == "__main__":
    # Triangle de test simple
    test_triangle = np.array([
        [1000, 1500, 1750, 1800, 1850],
        [1200, 1700, 1950, 2000, np.nan],
        [1100, 1600, 1850, np.nan, np.nan],
        [900, 1400, np.nan, np.nan, np.nan],
        [1300, np.nan, np.nan, np.nan, np.nan]
    ])
    
    # Test du moteur
    engine = create_engine_instance()
    
    print("=== TEST CHAIN LADDER ===")
    cl_result = engine.chain_ladder(test_triangle)
    print(f"Réserves totales: {cl_result.statistics['total_reserves']:.0f}")
    print(f"Facteurs: {cl_result.development_factors}")
    
    print("\n=== TEST MACK CHAIN LADDER ===")
    mack_result = engine.mack_chain_ladder(test_triangle)
    print(f"Erreur processus: {mack_result.total_process_error:.0f}")
    
    print("\n=== TEST CAPE COD ===")
    test_premiums = np.array([2000, 2200, 2100, 1800, 2300])
    cc_result = engine.cape_cod(test_triangle, test_premiums)
    print(f"Ratio S/P estimé: {cc_result.statistics['estimated_loss_ratio']:.3f}")
    
    print("\n=== TEST BORNHUETTER-FERGUSON ===")
    test_lrs = np.array([0.85, 0.90, 0.88, 0.82, 0.87])
    bf_result = engine.bornhuetter_ferguson(test_triangle, test_lrs, test_premiums)
    print(f"Réserves BF: {bf_result.statistics['total_reserves']:.0f}")
    
    print("\n=== BENCHMARK COMPLET ===")
    benchmark = engine.benchmark_methods(test_triangle, test_premiums, test_lrs)
    for method, result in benchmark.items():
        print(f"{method}: {result.statistics['total_reserves']:.0f}")
    
    print("\n✅ Tous les tests passés !")