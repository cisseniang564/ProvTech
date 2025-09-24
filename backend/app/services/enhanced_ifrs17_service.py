# backend/app/services/enhanced_ifrs17_service.py
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, date, timedelta
from pydantic import BaseModel, Field
from dataclasses import dataclass
import numpy as np
import pandas as pd
from enum import Enum
import logging

logger = logging.getLogger(__name__)

class ReleasePattern(Enum):
    """Patterns de libération CSM selon le type de contrat"""
    STRAIGHT_LINE = "straight_line"
    COVERAGE_UNITS = "coverage_units"
    PREMIUM_ALLOCATION = "premium_allocation"
    CLAIMS_EMERGENCE = "claims_emergence"
    HYBRID = "hybrid"

class UnlockingCategory(Enum):
    """Catégories d'unlocking avec impacts différenciés"""
    ECONOMIC_ASSUMPTIONS = "economic"  # Taux, inflation
    BIOMETRIC_ASSUMPTIONS = "biometric"  # Mortalité, morbidité
    EXPENSE_ASSUMPTIONS = "expense"  # Frais de gestion
    BEHAVIORAL_ASSUMPTIONS = "behavioral"  # Rachat, arbitrage
    CATASTROPHE_ASSUMPTIONS = "catastrophe"  # Risques extrêmes

class RiskAdjustmentMethod(Enum):
    """Méthodes de calcul Risk Adjustment"""
    COST_OF_CAPITAL = "cost_of_capital"
    PERCENTILE = "percentile"
    CONDITIONAL_TAIL_EXPECTATION = "cte"
    EQUIVALENT_MARGIN = "equivalent_margin"

class EnhancedIFRSCohort(BaseModel):
    """Cohorte IFRS 17 enrichie avec plus de granularité"""
    cohort_id: str
    inception_date: date
    measurement_date: date
    contract_boundary_months: int
    
    # CSM détaillé
    initial_csm: float
    current_csm: float
    csm_by_component: Dict[str, float] = Field(default_factory=dict)
    
    # Risk Adjustment sophistiqué  
    risk_adjustment: float
    ra_by_risk_type: Dict[str, float] = Field(default_factory=dict)
    ra_method: RiskAdjustmentMethod = RiskAdjustmentMethod.COST_OF_CAPITAL
    confidence_level: float = 75.0  # Percentile pour RA
    
    # Fulfillment Cash Flows détaillés
    fulfillment_cashflows: float
    fcf_claims: float = 0.0
    fcf_expenses: float = 0.0
    fcf_commissions: float = 0.0
    fcf_taxes: float = 0.0
    
    # Unités de couverture avancées
    coverage_units_issued: int
    coverage_units_remaining: int
    release_pattern: ReleasePattern = ReleasePattern.COVERAGE_UNITS
    seasonal_pattern: Optional[List[float]] = None  # 12 coefficients mensuels
    
    # Métadonnées de gestion
    currency: str = "EUR"
    line_of_business: str
    profitability_flag: bool = True  # Onerous contracts si False
    last_updated: datetime = Field(default_factory=datetime.utcnow)

class EnhancedCSMRollForward(BaseModel):
    """Roll-forward CSM avec décomposition détaillée"""
    cohort_id: str
    period_start: date
    period_end: date
    
    # Mouvements CSM principaux
    opening_csm: float
    csm_interest_accretion: float
    csm_experience_adjustments: float
    csm_assumption_changes: float
    csm_release_for_services: float
    closing_csm: float
    
    # Détail par catégorie d'unlocking
    unlocking_breakdown: Dict[UnlockingCategory, float] = Field(default_factory=dict)
    
    # Analyse de sensibilité
    sensitivity_analysis: Dict[str, float] = Field(default_factory=dict)
    
    # Contrôles de cohérence
    validation_checks: List[str] = Field(default_factory=list)
    materiality_threshold: float = 1000000  # Seuil de matérialité
    
    # Taux appliqués
    discount_rates: Dict[str, float] = Field(default_factory=dict)
    fx_rates: Dict[str, float] = Field(default_factory=dict)

class IFRS17DisclosureTemplate(BaseModel):
    """Template de disclosure enrichi"""
    reporting_period: str
    currency: str
    
    # Réconciliation CSM détaillée
    csm_reconciliation: Dict[str, Any]
    
    # Analyse de sensibilité réglementaire
    sensitivity_disclosure: Dict[str, Any]
    
    # Maturity analysis
    maturity_analysis: Dict[str, List[float]]
    
    # P&L attribution granulaire
    pnl_attribution_detailed: Dict[str, Any]
    
    # Key assumptions avec ranges
    key_assumptions_ranges: Dict[str, Any]
    
    # Validation réglementaire
    regulatory_validation: Dict[str, bool]

class EnhancedIFRS17Calculator:
    """Calculateur IFRS 17 enrichi avec fonctionnalités avancées"""
    
    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}
        self.discount_curves = {}
        self.risk_adjustment_params = {
            'cost_of_capital_rate': 0.06,
            'beta_factors': {
                'market_risk': 1.0,
                'credit_risk': 0.8,
                'underwriting_risk': 0.6,
                'operational_risk': 0.5
            },
            'confidence_levels': {
                'low': 65.0,
                'medium': 75.0,
                'high': 85.0
            }
        }
        self.seasonal_patterns = {
            'uniform': [1.0] * 12,
            'q4_heavy': [0.8, 0.8, 0.9, 0.9, 1.0, 1.0, 1.0, 1.0, 1.1, 1.1, 1.2, 1.4],
            'summer_low': [1.0, 1.0, 1.1, 1.2, 1.3, 0.7, 0.6, 0.7, 1.1, 1.2, 1.1, 1.0]
        }
        
    def create_enhanced_cohort(self, 
                             triangle_data: List[List[float]], 
                             cohort_params: Dict[str, Any]) -> EnhancedIFRSCohort:
        """
        Crée une cohorte IFRS 17 enrichie avec analyse granulaire
        """
        
        logger.info(f"Création cohorte enrichie {cohort_params.get('cohort_id', 'UNKNOWN')}")
        
        # Analyse du triangle pour estimer les composants FCF
        ultimate_claims = sum([row[-1] if row else 0 for row in triangle_data])
        
        # Estimation sophistiquée des cash flows
        claims_component = ultimate_claims
        expense_ratio = cohort_params.get('expense_ratio', 0.25)
        commission_ratio = cohort_params.get('commission_ratio', 0.10)
        tax_rate = cohort_params.get('tax_rate', 0.25)
        
        premiums_estimate = claims_component / cohort_params.get('loss_ratio', 0.65)
        expenses_component = premiums_estimate * expense_ratio
        commissions_component = premiums_estimate * commission_ratio
        tax_component = (premiums_estimate - claims_component - expenses_component) * tax_rate
        
        total_fcf = claims_component + expenses_component + commissions_component + tax_component
        
        # Risk Adjustment multi-méthodes
        ra_method = RiskAdjustmentMethod(cohort_params.get('ra_method', 'cost_of_capital'))
        confidence_level = cohort_params.get('confidence_level', 75.0)
        
        if ra_method == RiskAdjustmentMethod.COST_OF_CAPITAL:
            # Décomposition par type de risque
            market_ra = self._calculate_market_risk_adjustment(ultimate_claims, cohort_params)
            credit_ra = self._calculate_credit_risk_adjustment(ultimate_claims, cohort_params)
            underwriting_ra = self._calculate_underwriting_risk_adjustment(ultimate_claims, cohort_params)
            operational_ra = self._calculate_operational_risk_adjustment(ultimate_claims, cohort_params)
            
            total_ra = market_ra + credit_ra + underwriting_ra + operational_ra
            ra_breakdown = {
                'market': market_ra,
                'credit': credit_ra, 
                'underwriting': underwriting_ra,
                'operational': operational_ra
            }
            
        elif ra_method == RiskAdjustmentMethod.PERCENTILE:
            # Monte Carlo pour percentile RA
            total_ra, ra_breakdown = self._calculate_percentile_ra(ultimate_claims, confidence_level, cohort_params)
        else:
            total_ra = ultimate_claims * 0.05  # Fallback
            ra_breakdown = {'total': total_ra}
        
        # CSM initial avec test de profitabilité
        csm_before_ra = premiums_estimate - total_fcf - total_ra
        is_profitable = csm_before_ra > 0
        initial_csm = max(0, csm_before_ra) if is_profitable else 0
        
        if not is_profitable:
            logger.warning(f"Contrats déficitaires détectés pour cohorte {cohort_params.get('cohort_id')}: CSM={csm_before_ra:,.0f}")
        
        # Pattern de libération saisonnier
        pattern_type = cohort_params.get('seasonal_pattern', 'uniform')
        seasonal_pattern = self.seasonal_patterns.get(pattern_type, self.seasonal_patterns['uniform'])
        
        return EnhancedIFRSCohort(
            cohort_id=cohort_params.get('cohort_id', f"ENH_COHORT_{datetime.now().strftime('%Y_%m_%d')}"),
            inception_date=cohort_params.get('inception_date', date.today()),
            measurement_date=date.today(),
            contract_boundary_months=cohort_params.get('contract_boundary_months', 24),
            
            initial_csm=initial_csm,
            current_csm=initial_csm,
            csm_by_component={'initial': initial_csm, 'onerous_provision': min(0, csm_before_ra)},
            
            risk_adjustment=total_ra,
            ra_by_risk_type=ra_breakdown,
            ra_method=ra_method,
            confidence_level=confidence_level,
            
            fulfillment_cashflows=total_fcf,
            fcf_claims=claims_component,
            fcf_expenses=expenses_component,
            fcf_commissions=commissions_component,
            fcf_taxes=tax_component,
            
            coverage_units_issued=cohort_params.get('coverage_units', 100000),
            coverage_units_remaining=cohort_params.get('coverage_units', 100000),
            release_pattern=ReleasePattern(cohort_params.get('release_pattern', 'coverage_units')),
            seasonal_pattern=seasonal_pattern,
            
            currency=cohort_params.get('currency', 'EUR'),
            line_of_business=cohort_params.get('line_of_business', 'General'),
            profitability_flag=is_profitable
        )
    
    def _calculate_market_risk_adjustment(self, ultimate: float, params: Dict) -> float:
        """Calcul RA pour risque de marché (taux, actions, immobilier)"""
        duration = params.get('duration', 5.0)
        market_exposure = params.get('market_exposure', 0.3)
        coc_rate = self.risk_adjustment_params['cost_of_capital_rate']
        beta = self.risk_adjustment_params['beta_factors']['market_risk']
        
        # VAR marché approximative
        market_var = ultimate * market_exposure * 0.15 * np.sqrt(duration)  # 15% volatilité annuelle
        return market_var * coc_rate * beta * duration
    
    def _calculate_credit_risk_adjustment(self, ultimate: float, params: Dict) -> float:
        """Calcul RA pour risque de crédit (contrepartie, spread)"""
        credit_exposure = params.get('credit_exposure', 0.2)
        credit_quality = params.get('credit_quality', 'BBB')  # AAA, AA, A, BBB, BB, etc.
        
        credit_factors = {'AAA': 0.001, 'AA': 0.002, 'A': 0.005, 'BBB': 0.01, 'BB': 0.025, 'B': 0.05}
        credit_factor = credit_factors.get(credit_quality, 0.01)
        
        coc_rate = self.risk_adjustment_params['cost_of_capital_rate']
        beta = self.risk_adjustment_params['beta_factors']['credit_risk']
        
        credit_var = ultimate * credit_exposure * credit_factor
        return credit_var * coc_rate * beta * 3.0  # Duration moyenne crédit
    
    def _calculate_underwriting_risk_adjustment(self, ultimate: float, params: Dict) -> float:
        """Calcul RA pour risque de souscription (réserves, primes)"""
        volatility_factor = params.get('underwriting_volatility', 0.10)  # 10% par défaut
        tail_risk_factor = params.get('tail_risk', 1.2)  # Facteur queue de distribution
        
        coc_rate = self.risk_adjustment_params['cost_of_capital_rate']
        beta = self.risk_adjustment_params['beta_factors']['underwriting_risk']
        
        underwriting_var = ultimate * volatility_factor * tail_risk_factor
        return underwriting_var * coc_rate * beta * 2.0  # Duration moyenne sinistres
    
    def _calculate_operational_risk_adjustment(self, ultimate: float, params: Dict) -> float:
        """Calcul RA pour risque opérationnel"""
        operational_factor = params.get('operational_factor', 0.03)  # 3% des réserves
        coc_rate = self.risk_adjustment_params['cost_of_capital_rate']
        beta = self.risk_adjustment_params['beta_factors']['operational_risk']
        
        operational_var = ultimate * operational_factor
        return operational_var * coc_rate * beta * 1.0
    
    def _calculate_percentile_ra(self, ultimate: float, confidence: float, params: Dict) -> Tuple[float, Dict[str, float]]:
        """Calcul RA par méthode percentile avec simulation Monte Carlo"""
        
        n_simulations = params.get('mc_simulations', 10000)
        volatility = params.get('total_volatility', 0.12)  # 12% volatilité totale
        
        # Génération scenarios Monte Carlo
        np.random.seed(42)  # Reproductibilité
        scenarios = np.random.lognormal(
            mean=np.log(ultimate) - 0.5 * volatility**2,
            sigma=volatility,
            size=n_simulations
        )
        
        # Percentile de la distribution
        percentile_value = np.percentile(scenarios, confidence)
        ra_percentile = percentile_value - ultimate
        
        # Décomposition approximative par source de risque
        breakdown = {
            'market': ra_percentile * 0.3,
            'credit': ra_percentile * 0.2,
            'underwriting': ra_percentile * 0.4,
            'operational': ra_percentile * 0.1
        }
        
        return max(0, ra_percentile), breakdown
    
    def perform_enhanced_csm_rollforward(self, 
                                       cohort: EnhancedIFRSCohort,
                                       period_months: int = 3,
                                       market_data: Dict[str, Any] = None,
                                       assumption_changes: Dict[UnlockingCategory, float] = None) -> EnhancedCSMRollForward:
        """
        Roll-forward CSM enrichi avec analyse granulaire des mouvements
        """
        
        market_data = market_data or {}
        assumption_changes = assumption_changes or {}
        
        period_start = cohort.measurement_date
        period_end = period_start + timedelta(days=period_months * 30)
        
        opening_csm = cohort.current_csm
        
        # 1. Accroissement d'intérêt sophistiqué avec courbe des taux
        discount_rates = market_data.get('discount_rates', {'EUR': 0.02, 'USD': 0.025, 'GBP': 0.03})
        base_rate = discount_rates.get(cohort.currency, 0.02)
        
        # Ajustement pour duration et credit spread
        duration = market_data.get('liability_duration', 4.0)
        credit_spread = market_data.get('credit_spread', 0.005)  # 50bps
        effective_rate = base_rate + credit_spread
        
        csm_interest = opening_csm * effective_rate * (period_months / 12)
        
        # 2. Ajustements d'expérience granulaires
        experience_categories = market_data.get('experience_adjustments', {})
        total_experience = sum(experience_categories.values())
        
        # 3. Unlocking par catégorie avec règles sophistiquées
        unlocking_breakdown = {}
        total_unlocking = 0
        
        for category, change in assumption_changes.items():
            if category == UnlockingCategory.ECONOMIC_ASSUMPTIONS:
                # Impact seulement sur cash flows futurs (50% des CF)
                future_cf_ratio = 0.5
                unlocking_impact = change * cohort.fulfillment_cashflows * future_cf_ratio
            elif category == UnlockingCategory.BIOMETRIC_ASSUMPTIONS:
                # Impact graduel sur la durée restante
                remaining_duration = max(1, cohort.contract_boundary_months - period_months) / cohort.contract_boundary_months
                unlocking_impact = change * cohort.fulfillment_cashflows * remaining_duration
            elif category == UnlockingCategory.EXPENSE_ASSUMPTIONS:
                # Impact immédiat sur les frais futurs
                unlocking_impact = change * cohort.fcf_expenses
            elif category == UnlockingCategory.BEHAVIORAL_ASSUMPTIONS:
                # Impact sur pattern de libération
                unlocking_impact = change * opening_csm * 0.1  # 10% du CSM
            else:  # CATASTROPHE_ASSUMPTIONS
                # Impact exceptionnel
                unlocking_impact = change * cohort.fulfillment_cashflows * 0.05
            
            unlocking_breakdown[category] = unlocking_impact
            total_unlocking += unlocking_impact
        
        # 4. Libération CSM avec pattern saisonnier sophistiqué
        base_release_rate = period_months / cohort.contract_boundary_months
        
        # Application pattern saisonnier
        current_month = period_end.month - 1  # Index 0-11
        seasonal_factor = 1.0
        if cohort.seasonal_pattern:
            # Moyenne des mois de la période
            month_factors = []
            for i in range(period_months):
                month_idx = (current_month - period_months + i + 1) % 12
                month_factors.append(cohort.seasonal_pattern[month_idx])
            seasonal_factor = sum(month_factors) / len(month_factors)
        
        # Calcul selon le pattern de libération
        if cohort.release_pattern == ReleasePattern.COVERAGE_UNITS:
            units_consumed = cohort.coverage_units_issued * base_release_rate * seasonal_factor
            release_ratio = units_consumed / max(1, cohort.coverage_units_remaining)
            csm_release = opening_csm * min(release_ratio, 1.0)
        elif cohort.release_pattern == ReleasePattern.STRAIGHT_LINE:
            csm_release = opening_csm * base_release_rate * seasonal_factor
        else:  # Autres patterns
            csm_release = opening_csm * base_release_rate * seasonal_factor
        
        # Limitation: pas plus que le CSM disponible
        csm_release = min(csm_release, opening_csm + csm_interest + total_experience + total_unlocking)
        
        # CSM final
        closing_csm = max(0, opening_csm + csm_interest + total_experience + total_unlocking - csm_release)
        
        # Analyse de sensibilité automatique
        sensitivity_analysis = {}
        if market_data.get('perform_sensitivity', True):
            rate_shock_up = self._calculate_rate_sensitivity(cohort, 0.01)  # +100bps
            rate_shock_down = self._calculate_rate_sensitivity(cohort, -0.01)  # -100bps
            expense_shock = self._calculate_expense_sensitivity(cohort, 0.10)  # +10%
            
            sensitivity_analysis = {
                'rate_up_100bp': rate_shock_up,
                'rate_down_100bp': rate_shock_down,
                'expense_up_10pct': expense_shock
            }
        
        # Contrôles de cohérence
        validation_checks = []
        materiality_threshold = market_data.get('materiality_threshold', 1000000)
        
        if abs(total_unlocking) > materiality_threshold:
            validation_checks.append(f"MATERIAL_UNLOCKING: {total_unlocking:,.0f} > {materiality_threshold:,.0f}")
        
        if csm_release > opening_csm * 0.5:  # Plus de 50% libéré en une période
            validation_checks.append(f"HIGH_RELEASE_RATIO: {csm_release/opening_csm:.1%}")
        
        if closing_csm < 0.01 * cohort.initial_csm:  # CSM quasi épuisé
            validation_checks.append("CSM_NEAR_DEPLETION")
        
        # Mise à jour cohorte
        cohort.current_csm = closing_csm
        cohort.measurement_date = period_end
        
        if cohort.release_pattern == ReleasePattern.COVERAGE_UNITS:
            units_consumed = int(cohort.coverage_units_issued * base_release_rate * seasonal_factor)
            cohort.coverage_units_remaining = max(0, cohort.coverage_units_remaining - units_consumed)
        
        return EnhancedCSMRollForward(
            cohort_id=cohort.cohort_id,
            period_start=period_start,
            period_end=period_end,
            opening_csm=opening_csm,
            csm_interest_accretion=csm_interest,
            csm_experience_adjustments=total_experience,
            csm_assumption_changes=total_unlocking,
            csm_release_for_services=csm_release,
            closing_csm=closing_csm,
            unlocking_breakdown=unlocking_breakdown,
            sensitivity_analysis=sensitivity_analysis,
            validation_checks=validation_checks,
            materiality_threshold=materiality_threshold,
            discount_rates=discount_rates,
            fx_rates=market_data.get('fx_rates', {})
        )
    
    def _calculate_rate_sensitivity(self, cohort: EnhancedIFRSCohort, rate_shock: float) -> float:
        """Calcule la sensibilité du CSM à un choc de taux"""
        duration_estimate = 4.0  # Duration approximative des passifs
        csm_sensitivity = -cohort.current_csm * duration_estimate * rate_shock
        return csm_sensitivity
    
    def _calculate_expense_sensitivity(self, cohort: EnhancedIFRSCohort, expense_shock: float) -> float:
        """Calcule la sensibilité du CSM à un choc d'inflation des frais"""
        future_expense_ratio = 0.6  # 60% des frais sont futurs
        expense_impact = cohort.fcf_expenses * expense_shock * future_expense_ratio
        return -expense_impact  # Impact négatif sur CSM
    
    def generate_enhanced_disclosure(self, 
                                   cohorts: List[EnhancedIFRSCohort],
                                   rollforwards: List[EnhancedCSMRollForward],
                                   reporting_period: str) -> IFRS17DisclosureTemplate:
        """
        Génère des disclosures IFRS 17 enrichies conformes aux exigences réglementaires
        """
        
        # Agrégations sophistiquées
        total_liability = sum(c.fulfillment_cashflows + c.risk_adjustment + c.current_csm for c in cohorts)
        total_csm = sum(c.current_csm for c in cohorts)
        total_ra = sum(c.risk_adjustment for c in cohorts)
        
        # Réconciliation CSM avec granularité par mouvement
        csm_reconciliation = {
            "opening_balance": sum(rf.opening_csm for rf in rollforwards),
            "interest_accretion": {
                "total": sum(rf.csm_interest_accretion for rf in rollforwards),
                "by_currency": self._aggregate_by_currency(rollforwards, 'csm_interest_accretion', cohorts)
            },
            "experience_adjustments": {
                "total": sum(rf.csm_experience_adjustments for rf in rollforwards),
                "favorable": sum(max(0, rf.csm_experience_adjustments) for rf in rollforwards),
                "unfavorable": sum(min(0, rf.csm_experience_adjustments) for rf in rollforwards)
            },
            "assumption_changes": {
                "total": sum(rf.csm_assumption_changes for rf in rollforwards),
                "by_category": self._aggregate_unlocking_by_category(rollforwards)
            },
            "release_for_services": {
                "total": sum(rf.csm_release_for_services for rf in rollforwards),
                "by_lob": self._aggregate_by_lob(rollforwards, cohorts)
            },
            "closing_balance": sum(rf.closing_csm for rf in rollforwards)
        }
        
        # Analyse de maturité détaillée
        maturity_buckets = ["0-1Y", "1-2Y", "2-5Y", "5-10Y", "10Y+"]
        maturity_analysis = {
            "csm_by_maturity": self._calculate_maturity_analysis(cohorts, "csm"),
            "ra_by_maturity": self._calculate_maturity_analysis(cohorts, "ra"),
            "fcf_by_maturity": self._calculate_maturity_analysis(cohorts, "fcf")
        }
        
        # Analyse de sensibilité réglementaire (IFRS 17.B128)
        aggregated_sensitivities = {}
        for rf in rollforwards:
            for sensitivity, impact in rf.sensitivity_analysis.items():
                if sensitivity not in aggregated_sensitivities:
                    aggregated_sensitivities[sensitivity] = 0
                aggregated_sensitivities[sensitivity] += impact
        
        sensitivity_disclosure = {
            "interest_rate_risk": {
                "up_100bp": aggregated_sensitivities.get('rate_up_100bp', 0),
                "down_100bp": aggregated_sensitivities.get('rate_down_100bp', 0)
            },
            "expense_inflation": {
                "up_10pct": aggregated_sensitivities.get('expense_up_10pct', 0)
            },
            "currency_risk": self._calculate_currency_sensitivity(cohorts),
            "credit_risk": self._calculate_credit_sensitivity(cohorts)
        }
        
        # P&L attribution granulaire avec réconciliation
        total_revenue = sum(rf.csm_release_for_services for rf in rollforwards)
        finance_income = sum(rf.csm_interest_accretion for rf in rollforwards)
        
        pnl_attribution_detailed = {
            "insurance_revenue": {
                "csm_release": total_revenue,
                "ra_release": total_ra * 0.05,  # 5% annual release estimate
                "experience_adjustments": sum(rf.csm_experience_adjustments for rf in rollforwards)
            },
            "insurance_service_expenses": {
                "claims_incurred": sum(c.fcf_claims * 0.25 for c in cohorts),  # Quarterly incurred
                "amortization_acquisition": sum(c.fcf_commissions * 0.25 for c in cohorts),
                "other_expenses": sum(c.fcf_expenses * 0.25 for c in cohorts)
            },
            "insurance_finance_income": {
                "interest_accretion": finance_income,
                "fx_impact": sum(rf.fx_rates.get('impact', 0) for rf in rollforwards)
            },
            "net_result": total_revenue + finance_income - sum(c.fcf_claims + c.fcf_expenses for c in cohorts) * 0.25
        }
        
        # Assumptions clés avec ranges et benchmarks
        key_assumptions_ranges = {
            "discount_rates": {
                "range": self._get_rate_ranges(rollforwards),
                "weighted_average": self._get_weighted_average_rates(rollforwards, cohorts),
                "benchmark": "Risk-free rate + credit spread adjustment"
            },
            "risk_adjustment": {
                "cost_of_capital": f"{self.risk_adjustment_params['cost_of_capital_rate']:.1%}",
                "confidence_level": f"{np.mean([c.confidence_level for c in cohorts]):.0f}th percentile",
                "by_risk_type": self._aggregate_ra_by_type(cohorts)
            },
            "coverage_unit_patterns": {
                "straight_line": len([c for c in cohorts if c.release_pattern == ReleasePattern.STRAIGHT_LINE]),
                "coverage_units": len([c for c in cohorts if c.release_pattern == ReleasePattern.COVERAGE_UNITS]),
                "other": len([c for c in cohorts if c.release_pattern not in [ReleasePattern.STRAIGHT_LINE, ReleasePattern.COVERAGE_UNITS]])
            }
        }
        
        # Validation réglementaire automatique
        regulatory_validation = {
            "csm_reconciliation_balanced": abs(csm_reconciliation["closing_balance"] - total_csm) < 1000,
            "no_negative_csm": all(c.current_csm >= 0 for c in cohorts),
            "materiality_checks_passed": all(len(rf.validation_checks) == 0 for rf in rollforwards),
            "ra_methodology_consistent": len(set(c.ra_method for c in cohorts)) <= 1,
            "currency_consistency": len(set(c.currency for c in cohorts)) <= 3  # Max 3 currencies
        }
        
        return IFRS17DisclosureTemplate(
            reporting_period=reporting_period,
            currency="EUR",  # Reporting currency
            csm_reconciliation=csm_reconciliation,
            sensitivity_disclosure=sensitivity_disclosure,
            maturity_analysis=maturity_analysis,
            pnl_attribution_detailed=pnl_attribution_detailed,
            key_assumptions_ranges=key_assumptions_ranges,
            regulatory_validation=regulatory_validation
        )
    
    def _aggregate_by_currency(self, rollforwards: List[EnhancedCSMRollForward], field: str, cohorts: List[EnhancedIFRSCohort]) -> Dict[str, float]:
        """Agrège un champ par devise"""
        result = {}
        for i, rf in enumerate(rollforwards):
            currency = cohorts[i].currency if i < len(cohorts) else 'EUR'
            value = getattr(rf, field, 0)
            result[currency] = result.get(currency, 0) + value
        return result
    
    def _aggregate_unlocking_by_category(self, rollforwards: List[EnhancedCSMRollForward]) -> Dict[str, float]:
        """Agrège l'unlocking par catégorie"""
        result = {}
        for rf in rollforwards:
            for category, amount in rf.unlocking_breakdown.items():
                cat_name = category.value if hasattr(category, 'value') else str(category)
                result[cat_name] = result.get(cat_name, 0) + amount
        return result
    
    def _aggregate_by_lob(self, rollforwards: List[EnhancedCSMRollForward], cohorts: List[EnhancedIFRSCohort]) -> Dict[str, float]:
        """Agrège par ligne d'activité"""
        result = {}
        for i, rf in enumerate(rollforwards):
            lob = cohorts[i].line_of_business if i < len(cohorts) else 'General'
            result[lob] = result.get(lob, 0) + rf.csm_release_for_services
        return result
    
    def _calculate_maturity_analysis(self, cohorts: List[EnhancedIFRSCohort], component: str) -> List[float]:
        """Calcule l'analyse de maturité par composant"""
        # Approximation basée sur contract boundary
        buckets = [0, 0, 0, 0, 0]  # 0-1Y, 1-2Y, 2-5Y, 5-10Y, 10Y+
        
        for cohort in cohorts:
            remaining_months = max(0, cohort.contract_boundary_months - 
                                 (date.today() - cohort.inception_date).days // 30)
            
            if component == "csm":
                value = cohort.current_csm
            elif component == "ra":
                value = cohort.risk_adjustment
            else:  # fcf
                value = cohort.fulfillment_cashflows
            
            # Distribution par bucket
            if remaining_months <= 12:
                buckets[0] += value
            elif remaining_months <= 24:
                buckets[1] += value
            elif remaining_months <= 60:
                buckets[2] += value
            elif remaining_months <= 120:
                buckets[3] += value
            else:
                buckets[4] += value
        
        return buckets
    
    def _get_rate_ranges(self, rollforwards: List[EnhancedCSMRollForward]) -> Dict[str, float]:
        """Obtient les ranges de taux utilisés"""
        all_rates = []
        for rf in rollforwards:
            all_rates.extend(rf.discount_rates.values())
        
        if all_rates:
            return {
                "min": min(all_rates),
                "max": max(all_rates),
                "average": sum(all_rates) / len(all_rates)
            }
        return {"min": 0, "max": 0, "average": 0}
    
    def _get_weighted_average_rates(self, rollforwards: List[EnhancedCSMRollForward], cohorts: List[EnhancedIFRSCohort]) -> Dict[str, float]:
        """Calcule les taux moyens pondérés par CSM"""
        currency_weights = {}
        currency_rates = {}
        
        for i, (rf, cohort) in enumerate(zip(rollforwards, cohorts)):
            currency = cohort.currency
            weight = cohort.current_csm
            rate = rf.discount_rates.get(currency, 0.02)
            
            if currency not in currency_weights:
                currency_weights[currency] = 0
                currency_rates[currency] = 0
            
            currency_weights[currency] += weight
            currency_rates[currency] += rate * weight
        
        # Moyennes pondérées
        result = {}
        for currency, total_weight in currency_weights.items():
            if total_weight > 0:
                result[currency] = currency_rates[currency] / total_weight
        
        return result
    
    def _aggregate_ra_by_type(self, cohorts: List[EnhancedIFRSCohort]) -> Dict[str, float]:
        """Agrège le Risk Adjustment par type de risque"""
        result = {}
        for cohort in cohorts:
            for risk_type, amount in cohort.ra_by_risk_type.items():
                result[risk_type] = result.get(risk_type, 0) + amount
        return result
    
    def _calculate_currency_sensitivity(self, cohorts: List[EnhancedIFRSCohort]) -> Dict[str, float]:
        """Calcule la sensibilité aux devises (approximation)"""
        fx_sensitivity = {}
        for cohort in cohorts:
            if cohort.currency != 'EUR':  # Devise de reporting assumée EUR
                # Approximation: 10% de choc FX sur 20% d'exposition
                exposure_ratio = 0.20
                fx_shock = 0.10
                sensitivity = cohort.current_csm * exposure_ratio * fx_shock
                fx_sensitivity[cohort.currency] = fx_sensitivity.get(cohort.currency, 0) + sensitivity
        return fx_sensitivity
    
    def _calculate_credit_sensitivity(self, cohorts: List[EnhancedIFRSCohort]) -> float:
        """Calcule la sensibilité au risque de crédit"""
        # Approximation basée sur l'exposition crédit totale
        total_credit_exposure = sum(cohort.ra_by_risk_type.get('credit', 0) for cohort in cohorts)
        credit_shock = 0.05  # 5% de choc sur les expositions crédit
        return total_credit_exposure * credit_shock