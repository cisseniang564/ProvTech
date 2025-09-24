# backend/app/actuarial/methods/bornhuetter_ferguson.py

from typing import List, Dict, Any
from datetime import datetime

from ..base.method_interface import (
    DeterministicMethod, 
    TriangleData, 
    CalculationResult,
    MethodConfig
)
from ..base.triangle_utils import (
    validate_triangle_data,
    calculate_development_factors,
    calculate_triangle_statistics
)

class BornhuetterFergusonMethod(DeterministicMethod):
    """
    Implémentation de la méthode Bornhuetter-Ferguson
    
    La méthode Bornhuetter-Ferguson utilise une estimation a priori de l'ultimate
    et pondère avec les développements observés selon la maturité de chaque année.
    """
    
    def __init__(self):
        config = MethodConfig(
            id="bornhuetter_ferguson",
            name="Bornhuetter-Ferguson",
            description="Méthode combinant estimation a priori et développements observés",
            category="deterministic", 
            recommended=True,
            processing_time="< 2s",
            accuracy=87,
            parameters={
                "expected_loss_ratio": None,  # Taux de charge a priori
                "premium_data": None,  # Primes par année
                "maturity_method": "cumulative_payment_ratio",  # ou "development_pattern"
                "factor_method": "simple_average",
                "tail_factor": None,
                "auto_estimate_lr": True
            }
        )
        super().__init__(config)
    
    @property
    def method_id(self) -> str:
        return "bornhuetter_ferguson"
    
    @property  
    def method_name(self) -> str:
        return "Bornhuetter-Ferguson"
    
    def validate_input(self, triangle_data: TriangleData, **kwargs) -> List[str]:
        """Valider les données pour Bornhuetter-Ferguson"""
        errors = validate_triangle_data(triangle_data.data)
        
        if not errors:
            if len(triangle_data.data) < 2:
                errors.append("Bornhuetter-Ferguson nécessite au moins 2 années d'accident")
            
            # Vérifier les primes si fournies
            premium_data = kwargs.get("premium_data")
            if premium_data:
                if len(premium_data) != len(triangle_data.data):
                    errors.append("Les primes doivent correspondre aux années d'accident")
                if any(p <= 0 for p in premium_data):
                    errors.append("Toutes les primes doivent être positives")
        
        return errors
    
    def calculate(self, triangle_data: TriangleData, **kwargs) -> CalculationResult:
        """
        Calcul Bornhuetter-Ferguson complet
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
        
        # 3. Obtenir primes et taux de charge a priori
        premium_data = params.get("premium_data") or self._estimate_premiums(triangle_data.data)
        expected_lr = self._get_expected_loss_ratio(triangle_data, premium_data, params)
        
        print(f"📊 Taux de charge a priori: {expected_lr:.1%}")
        print(f"💰 Primes: {[f'{p:,.0f}' for p in premium_data]}")
        
        # 4. Calculer les pourcentages de paiement cumulés (maturité)
        cumulative_payment_ratios = self._calculate_cumulative_payment_ratios(development_factors)
        print(f"📈 Ratios de paiement cumulés: {[f'{r:.1%}' for r in cumulative_payment_ratios]}")
        
        # 5. Calculer les ultimates Bornhuetter-Ferguson
        ultimates_by_year = self._calculate_bf_ultimates(
            triangle_data.data, premium_data, expected_lr, cumulative_payment_ratios
        )
        
        ultimate_total = sum(ultimates_by_year)
        
        # 6. Triangle complété
        completed_triangle = self._complete_triangle_bf(
            triangle_data.data, development_factors, ultimates_by_year
        )
        
        # 7. Calculs de synthèse
        paid_to_date = sum(row[0] if row else 0 for row in triangle_data.data)
        reserves = ultimate_total - paid_to_date
        
        # 8. Diagnostics et statistiques
        triangle_stats = calculate_triangle_statistics(triangle_data.data)
        diagnostics = self._calculate_diagnostics(
            triangle_data.data, completed_triangle, ultimates_by_year,
            premium_data, expected_lr, cumulative_payment_ratios
        )
        
        # 9. Avertissements
        warnings = self._generate_warnings(
            triangle_data, development_factors, triangle_stats,
            expected_lr, cumulative_payment_ratios
        )
        
        # 10. Métadonnées
        metadata = {
            "currency": triangle_data.currency,
            "business_line": triangle_data.business_line,
            "parameters_used": params,
            "triangle_statistics": triangle_stats,
            "expected_loss_ratio": expected_lr,
            "premium_data": premium_data,
            "cumulative_payment_ratios": cumulative_payment_ratios,
            "bf_statistics": self._calculate_bf_statistics(
                ultimates_by_year, premium_data, expected_lr
            )
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
    
    def _estimate_premiums(self, triangle_data: List[List[float]]) -> List[float]:
        """Estimer les primes basées sur les sinistres"""
        premiums = []
        
        for row in triangle_data:
            if row:
                # Estimation : ultimate estimé / taux de charge typique
                max_cumul = max(row)
                estimated_premium = max_cumul / 0.65  # LR typique de 65%
                premiums.append(max(estimated_premium, 50000))
            else:
                premiums.append(100000)
        
        return premiums
    
    def _get_expected_loss_ratio(self, triangle_data: TriangleData,
                               premium_data: List[float], params: Dict) -> float:
        """Obtenir le taux de charge a priori"""
        
        if params.get("expected_loss_ratio") is not None:
            return params["expected_loss_ratio"]
        
        if not params.get("auto_estimate_lr", True):
            return 0.70  # Valeur par défaut BF
        
        # Estimation basée sur l'historique
        total_observed = sum(row[0] if row else 0 for row in triangle_data.data)
        total_premiums = sum(premium_data)
        
        if total_premiums > 0:
            observed_lr = total_observed / total_premiums
            # Ajuster pour le développement futur (BF plus conservateur)
            estimated_lr = observed_lr * 1.25
            return min(1.0, max(0.4, estimated_lr))
        
        return 0.70
    
    def _calculate_cumulative_payment_ratios(self, development_factors: List[float]) -> List[float]:
        """
        Calculer les pourcentages de paiement cumulés basés sur les facteurs
        
        Le ratio de paiement cumulé à la période n = 1 / (produit des facteurs restants)
        """
        if not development_factors:
            return [1.0]
        
        ratios = []
        
        # Pour chaque période de développement
        for period in range(len(development_factors) + 1):
            if period == 0:
                # Période 0: ratio initial basé sur tous les facteurs
                remaining_factors = development_factors[:]
            else:
                # Période n: facteurs restants après n périodes
                remaining_factors = development_factors[period:]
            
            # Calculer le facteur cumulé restant
            cumulative_factor = 1.0
            for factor in remaining_factors:
                cumulative_factor *= factor
            
            # Le ratio de paiement = 1 / facteur_cumulé_restant
            payment_ratio = 1.0 / cumulative_factor if cumulative_factor > 0 else 1.0
            ratios.append(min(1.0, payment_ratio))  # Plafonner à 100%
        
        return ratios
    
    def _calculate_bf_ultimates(self, triangle_data: List[List[float]],
                              premium_data: List[float],
                              expected_lr: float,
                              payment_ratios: List[float]) -> List[float]:
        """
        Calculer les ultimates Bornhuetter-Ferguson
        
        Formule BF: Ultimate = Payé + (Ultimate_a_priori - Payé) × (1 - %_payé)
        """
        ultimates = []
        
        for i, (row, premium) in enumerate(zip(triangle_data, premium_data)):
            # Ultimate a priori
            ultimate_prior = premium * expected_lr
            
            if not row or len(row) == 0:
                # Pas de données observées: utiliser l'a priori
                ultimate_bf = ultimate_prior
            else:
                # Dernière valeur observée (cumul payé à la dernière période)
                paid_to_date = row[-1]
                
                # Période de développement (âge de l'année d'accident)
                development_period = len(row) - 1
                
                # Pourcentage payé à cette période
                if development_period < len(payment_ratios):
                    percent_paid = payment_ratios[development_period]
                else:
                    percent_paid = payment_ratios[-1]  # Utiliser le dernier ratio
                
                # Formule Bornhuetter-Ferguson
                if percent_paid > 0:
                    # BF = Payé + (Ultimate_prior - Payé/(%payé)) × (1-%payé)
                    expected_paid_at_maturity = ultimate_prior * percent_paid
                    
                    # Si on a payé plus que prévu, ajuster l'ultimate
                    if paid_to_date > expected_paid_at_maturity:
                        ultimate_bf = paid_to_date / percent_paid
                    else:
                        ultimate_bf = paid_to_date + (ultimate_prior - paid_to_date) * (1 - percent_paid) / (1 - percent_paid + 0.001)
                else:
                    ultimate_bf = ultimate_prior
            
            # S'assurer que l'ultimate >= payé
            ultimate_bf = max(ultimate_bf, row[0] if row else 0)
            ultimates.append(ultimate_bf)
        
        return ultimates
    
    def _complete_triangle_bf(self, triangle_data: List[List[float]],
                            development_factors: List[float],
                            ultimates: List[float]) -> List[List[float]]:
        """Compléter le triangle avec les ultimates BF"""
        
        completed = []
        max_periods = max(len(row) for row in triangle_data) + len(development_factors)
        
        for i, (row, ultimate) in enumerate(zip(triangle_data, ultimates)):
            completed_row = list(row) if row else [0]
            
            # Étendre la ligne jusqu'à la maturité finale
            current_value = completed_row[-1] if completed_row else 0
            
            for period in range(len(completed_row), max_periods + 1):
                if period == max_periods:
                    # Dernière période = ultimate BF
                    completed_row.append(ultimate)
                    break
                elif period - 1 < len(development_factors):
                    # Appliquer les facteurs de développement
                    factor = development_factors[period - 1] if period > 0 else 1.0
                    current_value *= factor
                    completed_row.append(current_value)
                else:
                    # Au-delà des facteurs disponibles
                    completed_row.append(ultimate)
                    break
            
            # Ajustement final pour coller à l'ultimate BF
            if completed_row:
                completed_row[-1] = ultimate
            
            completed.append(completed_row)
        
        return completed
    
    def _calculate_diagnostics(self, observed: List[List[float]],
                             completed: List[List[float]],
                             ultimates: List[float],
                             premium_data: List[float],
                             expected_lr: float,
                             payment_ratios: List[float]) -> Dict[str, float]:
        """Diagnostics spécifiques Bornhuetter-Ferguson"""
        
        total_premium = sum(premium_data)
        total_ultimate = sum(ultimates)
        actual_lr = total_ultimate / total_premium if total_premium > 0 else 0
        
        # Écart vs a priori
        lr_deviation = abs(actual_lr - expected_lr) / expected_lr if expected_lr > 0 else 0
        
        # Coefficient de variation
        mean_ult = sum(ultimates) / len(ultimates) if ultimates else 0
        ultimate_cv = 0
        if mean_ult > 0 and len(ultimates) > 1:
            variance = sum((ult - mean_ult) ** 2 for ult in ultimates) / (len(ultimates) - 1)
            ultimate_cv = (variance ** 0.5) / mean_ult
        
        # Maturité moyenne pondérée
        weighted_maturity = 0
        total_weight = sum(ultimates)
        if total_weight > 0:
            for i, (row, ultimate) in enumerate(zip(observed, ultimates)):
                periods_observed = len(row) if row else 0
                maturity = payment_ratios[min(periods_observed, len(payment_ratios) - 1)]
                weighted_maturity += maturity * ultimate / total_weight
        
        return {
            "actual_loss_ratio": round(actual_lr, 4),
            "expected_loss_ratio": round(expected_lr, 4), 
            "lr_deviation": round(lr_deviation, 4),
            "ultimate_cv": round(ultimate_cv, 4),
            "weighted_maturity": round(weighted_maturity, 4),
            "prior_influence": round(1 - weighted_maturity, 4),  # Plus la maturité est faible, plus l'a priori influence
            "convergence": 1.0
        }
    
    def _calculate_bf_statistics(self, ultimates: List[float],
                               premium_data: List[float],
                               expected_lr: float) -> Dict[str, float]:
        """Statistiques spécifiques BF"""
        
        total_premium = sum(premium_data)
        total_ultimate = sum(ultimates)
        
        return {
            "total_premium": round(total_premium, 2),
            "actual_loss_ratio": round(total_ultimate / total_premium if total_premium > 0 else 0, 4),
            "expected_loss_ratio": round(expected_lr, 4),
            "bf_adjustment": round((total_ultimate - total_premium * expected_lr) / (total_premium * expected_lr) if total_premium * expected_lr > 0 else 0, 4),
            "ultimate_stability": round(1.0 / (1.0 + (max(ultimates) - min(ultimates)) / (sum(ultimates) / len(ultimates))) if ultimates else 1.0, 4)
        }
    
    def _generate_warnings(self, triangle_data: TriangleData,
                          factors: List[float],
                          stats: Dict[str, float],
                          expected_lr: float,
                          payment_ratios: List[float]) -> List[str]:
        """Avertissements BF"""
        warnings = []
        
        # Taux de charge
        if expected_lr < 0.3:
            warnings.append(f"Taux de charge très bas ({expected_lr:.1%}) - vérifier les hypothèses")
        elif expected_lr > 1.2:
            warnings.append(f"Taux de charge très élevé ({expected_lr:.1%}) - ligne non rentable?")
        
        # Maturité des données
        avg_periods = sum(len(row) for row in triangle_data.data) / len(triangle_data.data)
        if avg_periods < 2:
            warnings.append("Données très immatures - forte influence de l'a priori")
        
        # Qualité des ratios de paiement
        if len(payment_ratios) < 3:
            warnings.append("Pattern de développement court - extrapolation incertaine")
        
        # Cohérence des facteurs
        if len(factors) > 1 and any(f < 1.0 for f in factors):
            warnings.append("Facteurs de développement < 1.0 détectés - vérifier les données")
        
        return warnings
    
    def get_method_info(self) -> Dict[str, Any]:
        """Informations détaillées sur Bornhuetter-Ferguson"""
        return {
            "method_id": self.method_id,
            "method_name": self.method_name,
            "category": self.config.category,
            "description": self.config.description,
            "advantages": [
                "Stable pour les années immatures",
                "Intègre expertise a priori de façon équilibrée",
                "Moins volatile que Chain Ladder",
                "Bon compromis données/expertise"
            ],
            "limitations": [
                "Dépend fortement de la qualité de l'a priori",
                "Complexité de calcul des ratios de maturité",
                "Peut masquer les tendances émergentes",
                "Sensible aux erreurs de primes"
            ],
            "best_use_cases": [
                "Données immatures ou incomplètes",
                "Lignes avec forte expertise a priori",
                "Stabilisation des réserves volatiles",
                "Complémentation d'autres méthodes"
            ],
            "parameters": self.config.parameters
        }

def create_bornhuetter_ferguson_method() -> BornhuetterFergusonMethod:
    """Factory pour créer une instance Bornhuetter-Ferguson"""
    return BornhuetterFergusonMethod()