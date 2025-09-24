# backend/app/actuarial/methods/expected_loss_ratio.py

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
    calculate_triangle_statistics
)

class ExpectedLossRatioMethod(DeterministicMethod):
    """
    Implémentation de la méthode Expected Loss Ratio (ELR)
    
    La méthode ELR utilise une estimation a priori du taux de charge
    pour calculer directement les ultimates, sans référence aux développements historiques.
    """
    
    def __init__(self):
        config = MethodConfig(
            id="expected_loss_ratio",
            name="Expected Loss Ratio (ELR)",
            description="Méthode basée uniquement sur l'estimation a priori du taux de charge",
            category="deterministic",
            recommended=False,  # Méthode simple, souvent utilisée en complément
            processing_time="< 1s",
            accuracy=70,  # Plus faible car pas de données historiques
            parameters={
                "expected_loss_ratio": 0.75,  # Taux de charge a priori
                "premium_data": None,  # Primes par année d'accident
                "auto_estimate_lr": True,  # Estimer le LR des données
                "lr_by_year": None,  # LR différenciés par année
                "trend_adjustment": 0.0,  # Ajustement de tendance annuel
                "inflation_rate": 0.0,  # Taux d'inflation
                "minimum_ultimate_ratio": 1.0  # Ultimate min = ratio * sinistres payés
            }
        )
        super().__init__(config)
    
    @property
    def method_id(self) -> str:
        return "expected_loss_ratio"
    
    @property
    def method_name(self) -> str:
        return "Expected Loss Ratio (ELR)"
    
    def validate_input(self, triangle_data: TriangleData, **kwargs) -> List[str]:
        """Valider les données pour ELR"""
        errors = validate_triangle_data(triangle_data.data)
        
        if not errors:
            # ELR peut fonctionner avec une seule année
            if len(triangle_data.data) < 1:
                errors.append("ELR nécessite au moins une année d'accident")
            
            # Vérifier les primes
            premium_data = kwargs.get("premium_data")
            if premium_data:
                if len(premium_data) != len(triangle_data.data):
                    errors.append("Les primes doivent correspondre aux années d'accident")
                if any(p <= 0 for p in premium_data):
                    errors.append("Toutes les primes doivent être positives")
            
            # Vérifier le taux de charge
            expected_lr = kwargs.get("expected_loss_ratio")
            if expected_lr is not None and (expected_lr <= 0 or expected_lr > 2.0):
                errors.append("Le taux de charge doit être entre 0 et 200%")
        
        return errors
    
    def calculate(self, triangle_data: TriangleData, **kwargs) -> CalculationResult:
        """
        Calcul Expected Loss Ratio
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
        
        # 2. Obtenir les primes
        premium_data = params.get("premium_data") or self._estimate_premiums(triangle_data.data)
        print(f"💰 Primes: {[f'{p:,.0f}' for p in premium_data]}")
        
        # 3. Obtenir le(s) taux de charge
        if params.get("lr_by_year"):
            loss_ratios = params["lr_by_year"]
            if len(loss_ratios) != len(triangle_data.data):
                # Répéter le dernier LR pour les années manquantes
                loss_ratios = loss_ratios + [loss_ratios[-1]] * (len(triangle_data.data) - len(loss_ratios))
        else:
            base_lr = self._get_expected_loss_ratio(triangle_data, premium_data, params)
            loss_ratios = self._apply_trends_and_inflation(base_lr, triangle_data, params)
        
        print(f"📊 Taux de charge par année: {[f'{lr:.1%}' for lr in loss_ratios]}")
        
        # 4. Calculer les ultimates ELR
        ultimates_by_year = []
        for i, (premium, lr) in enumerate(zip(premium_data, loss_ratios)):
            elr_ultimate = premium * lr
            
            # S'assurer que l'ultimate >= montant payé (si disponible)
            if triangle_data.data[i]:
                paid = triangle_data.data[i][0]
                min_ultimate = paid * params.get("minimum_ultimate_ratio", 1.0)
                elr_ultimate = max(elr_ultimate, min_ultimate)
            
            ultimates_by_year.append(elr_ultimate)
        
        ultimate_total = sum(ultimates_by_year)
        
        # 5. "Triangle complété" (ELR ne fait pas de développement)
        completed_triangle = self._create_elr_triangle(triangle_data.data, ultimates_by_year)
        
        # 6. Calculs de synthèse
        paid_to_date = sum(row[0] if row else 0 for row in triangle_data.data)
        reserves = ultimate_total - paid_to_date
        
        # 7. Statistiques et diagnostics
        triangle_stats = calculate_triangle_statistics(triangle_data.data)
        diagnostics = self._calculate_elr_diagnostics(
            triangle_data.data, ultimates_by_year, premium_data, loss_ratios
        )
        
        # 8. Avertissements
        warnings = self._generate_elr_warnings(
            triangle_data, triangle_stats, loss_ratios, premium_data
        )
        
        # 9. Métadonnées
        metadata = {
            "currency": triangle_data.currency,
            "business_line": triangle_data.business_line,
            "parameters_used": params,
            "triangle_statistics": triangle_stats,
            "premium_data": premium_data,
            "loss_ratios_by_year": loss_ratios,
            "elr_statistics": self._calculate_elr_statistics(
                ultimates_by_year, premium_data, loss_ratios
            ),
            "market_assumptions": self._get_market_assumptions(params)
        }
        
        calculation_time = self._stop_timing()
        
        result = CalculationResult(
            method_id=self.method_id,
            method_name=self.method_name,
            ultimate_total=ultimate_total,
            paid_to_date=paid_to_date,
            reserves=reserves,
            ultimates_by_year=ultimates_by_year,
            development_factors=[],  # ELR n'utilise pas de facteurs
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
        """Estimer les primes pour ELR"""
        premiums = []
        
        for row in triangle_data:
            if row:
                # ELR: estimation prudente basée sur les payés
                paid = row[0]
                estimated_premium = paid / 0.6  # Supposer 60% payé à ce stade
                premiums.append(max(estimated_premium, 50000))
            else:
                premiums.append(100000)
        
        return premiums
    
    def _get_expected_loss_ratio(self, triangle_data: TriangleData,
                               premium_data: List[float], params: Dict) -> float:
        """Obtenir le taux de charge de base"""
        
        if params.get("expected_loss_ratio") is not None:
            return params["expected_loss_ratio"]
        
        if not params.get("auto_estimate_lr", True):
            return 0.75
        
        # Estimation basée sur les données observées
        total_paid = sum(row[0] if row else 0 for row in triangle_data.data)
        total_premium = sum(premium_data)
        
        if total_premium > 0:
            observed_lr = total_paid / total_premium
            # Ajuster pour le développement futur (ELR conservateur)
            estimated_lr = observed_lr * 1.4  # Facteur d'ajustement plus élevé pour ELR
            return min(1.5, max(0.3, estimated_lr))
        
        return 0.75
    
    def _apply_trends_and_inflation(self, base_lr: float, 
                                  triangle_data: TriangleData, 
                                  params: Dict) -> List[float]:
        """Appliquer les tendances et l'inflation"""
        
        trend_rate = params.get("trend_adjustment", 0.0)
        inflation_rate = params.get("inflation_rate", 0.0)
        
        loss_ratios = []
        n_years = len(triangle_data.data)
        
        for i in range(n_years):
            # Année 0 = la plus récente, année n-1 = la plus ancienne
            years_from_base = n_years - 1 - i
            
            # Appliquer tendance (croissance du LR dans le temps)
            lr_with_trend = base_lr * ((1 + trend_rate) ** years_from_base)
            
            # Appliquer inflation (impact sur les coûts)
            lr_adjusted = lr_with_trend * ((1 + inflation_rate) ** years_from_base)
            
            loss_ratios.append(max(0.1, min(2.0, lr_adjusted)))  # Borner
        
        return loss_ratios
    
    def _create_elr_triangle(self, triangle_data: List[List[float]], 
                           ultimates: List[float]) -> List[List[float]]:
        """Créer un 'triangle' ELR (en fait juste première colonne + ultimate)"""
        
        completed = []
        
        for i, (row, ultimate) in enumerate(zip(triangle_data, ultimates)):
            if row:
                # Garder les données observées et ajouter l'ultimate
                completed_row = list(row) + [ultimate]
            else:
                # Pas de données: juste l'ultimate
                completed_row = [0.0, ultimate]
            
            completed.append(completed_row)
        
        return completed
    
    def _calculate_elr_diagnostics(self, observed: List[List[float]],
                                 ultimates: List[float],
                                 premium_data: List[float],
                                 loss_ratios: List[float]) -> Dict[str, float]:
        """Diagnostics ELR"""
        
        total_premium = sum(premium_data)
        total_ultimate = sum(ultimates)
        weighted_avg_lr = total_ultimate / total_premium if total_premium > 0 else 0
        
        # Variance des taux de charge
        lr_variance = 0
        if len(loss_ratios) > 1:
            mean_lr = sum(loss_ratios) / len(loss_ratios)
            lr_variance = sum((lr - mean_lr) ** 2 for lr in loss_ratios) / (len(loss_ratios) - 1)
        
        lr_cv = (lr_variance ** 0.5) / weighted_avg_lr if weighted_avg_lr > 0 else 0
        
        # Adequacy ratio (payé vs attendu)
        total_paid = sum(row[0] if row else 0 for row in observed)
        adequacy_ratio = total_paid / (total_premium * weighted_avg_lr) if total_premium * weighted_avg_lr > 0 else 0
        
        return {
            "weighted_avg_loss_ratio": round(weighted_avg_lr, 4),
            "loss_ratio_cv": round(lr_cv, 4),
            "premium_adequacy": round(adequacy_ratio, 4),
            "elr_stability": round(1.0 / (1.0 + lr_cv), 4),
            "method_simplicity": 1.0,  # ELR est très simple
            "convergence": 1.0
        }
    
    def _calculate_elr_statistics(self, ultimates: List[float],
                                premium_data: List[float],
                                loss_ratios: List[float]) -> Dict[str, float]:
        """Statistiques détaillées ELR"""
        
        total_premium = sum(premium_data)
        total_ultimate = sum(ultimates)
        
        return {
            "total_premium": round(total_premium, 2),
            "weighted_loss_ratio": round(total_ultimate / total_premium if total_premium > 0 else 0, 4),
            "loss_ratio_range": {
                "min": round(min(loss_ratios), 4),
                "max": round(max(loss_ratios), 4),
                "spread": round(max(loss_ratios) - min(loss_ratios), 4)
            },
            "premium_leverage": round(total_ultimate / total_premium if total_premium > 0 else 1, 4),
            "elr_consistency": round(1.0 - (max(loss_ratios) - min(loss_ratios)) / (sum(loss_ratios) / len(loss_ratios)) if loss_ratios else 1.0, 4)
        }
    
    def _get_market_assumptions(self, params: Dict) -> Dict[str, Any]:
        """Hypothèses de marché utilisées"""
        return {
            "base_loss_ratio": params.get("expected_loss_ratio", "auto-estimated"),
            "trend_adjustment": params.get("trend_adjustment", 0.0),
            "inflation_rate": params.get("inflation_rate", 0.0),
            "minimum_ultimate_ratio": params.get("minimum_ultimate_ratio", 1.0),
            "estimation_basis": "a_priori_only",
            "market_conditions": "stable" if params.get("trend_adjustment", 0) == 0 else "trending"
        }
    
    def _generate_elr_warnings(self, triangle_data: TriangleData,
                             stats: Dict[str, float],
                             loss_ratios: List[float],
                             premium_data: List[float]) -> List[str]:
        """Avertissements ELR"""
        warnings = []
        
        # Taux de charge extrêmes
        max_lr = max(loss_ratios)
        min_lr = min(loss_ratios)
        
        if max_lr > 1.2:
            warnings.append(f"Taux de charge très élevé ({max_lr:.1%}) - ligne non rentable?")
        if min_lr < 0.3:
            warnings.append(f"Taux de charge très bas ({min_lr:.1%}) - vérifier les hypothèses")
        
        # Variabilité élevée
        if len(loss_ratios) > 1:
            lr_range = max_lr - min_lr
            avg_lr = sum(loss_ratios) / len(loss_ratios)
            if lr_range / avg_lr > 0.3:
                warnings.append("Forte variabilité des taux de charge entre années")
        
        # Manque de données historiques
        if stats.get("data_points", 0) < 5:
            warnings.append("ELR avec peu de données - résultats entièrement a priori")
        
        # Primes estimées
        total_premium = sum(premium_data)
        total_paid = sum(row[0] if row else 0 for row in triangle_data.data)
        if total_premium < total_paid * 2:
            warnings.append("Primes potentiellement sous-estimées - revoir les hypothèses")
        
        # Méthode simpliste
        warnings.append("ELR ignore complètement les patterns de développement historiques")
        
        return warnings
    
    def get_method_info(self) -> Dict[str, Any]:
        """Informations détaillées sur ELR"""
        return {
            "method_id": self.method_id,
            "method_name": self.method_name,
            "category": self.config.category,
            "description": self.config.description,
            "advantages": [
                "Très simple à comprendre et calculer",
                "Peut fonctionner sans données historiques",
                "Stable et prévisible",
                "Bon pour nouvelles lignes de business"
            ],
            "limitations": [
                "Ignore complètement l'historique de développement",
                "Dépend entièrement de la qualité de l'a priori",
                "Pas d'apprentissage des données",
                "Peut être inadéquat pour lignes matures"
            ],
            "best_use_cases": [
                "Nouvelles lignes sans historique",
                "Benchmark et validation d'autres méthodes",
                "Estimation rapide et simple",
                "Situations avec données très limitées"
            ],
            "assumptions": [
                "Taux de charge a priori fiable",
                "Pas de pattern de développement significatif",
                "Stabilité des conditions de marché",
                "Primes représentatives du risque"
            ],
            "parameters": self.config.parameters
        }

def create_expected_loss_ratio_method() -> ExpectedLossRatioMethod:
    """Factory pour créer une instance ELR"""
    return ExpectedLossRatioMethod()