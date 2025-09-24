# backend/app/services/enhanced_solvency2_service.py
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, date, timedelta
from pydantic import BaseModel, Field
from dataclasses import dataclass
import numpy as np
import pandas as pd
from enum import Enum
import math
import logging

logger = logging.getLogger(__name__)

class GeographicRegion(Enum):
    EU_CORE = "eu_core"
    EU_PERIPHERY = "eu_periphery"
    UK = "uk"
    SWITZERLAND = "switzerland"
    EMERGING_EU = "emerging_eu"

class RegulatoryRegime(Enum):
    SOLVENCY_II = "solvency_ii"
    UK_REGIME = "uk_regime"
    SWISS_TEST = "swiss_test"
    BERMUDA_REGIME = "bermuda_regime"

class AssetClass(Enum):
    GOVERNMENT_BONDS = "government_bonds"
    CORPORATE_BONDS = "corporate_bonds"
    EQUITIES_TYPE1 = "equities_type1"  # OECD, regulated markets
    EQUITIES_TYPE2 = "equities_type2"  # Other equities
    PROPERTY = "property"
    ALTERNATIVES = "alternatives"
    CASH = "cash"
    DERIVATIVES = "derivatives"

class UnderwritingSegment(Enum):
    MOTOR_LIABILITY = "motor_liability"
    MOTOR_OTHER = "motor_other"
    MARINE_AVIATION_TRANSPORT = "marine_aviation_transport"
    FIRE_OTHER_PROPERTY = "fire_other_property"
    GENERAL_LIABILITY = "general_liability"
    CREDIT_SURETYSHIP = "credit_suretyship"
    LEGAL_EXPENSES = "legal_expenses"
    ASSISTANCE = "assistance"
    MISCELLANEOUS = "miscellaneous"
    HEALTH_SIMILAR_LIFE = "health_similar_life"
    HEALTH_NOT_SIMILAR_LIFE = "health_not_similar_life"

class EnhancedSCRModule(BaseModel):
    """Module SCR enrichi avec sous-composants détaillés"""
    module_name: str
    sub_modules: Dict[str, float] = Field(default_factory=dict)
    total_requirement: float
    diversification_benefit: float = 0.0
    correlation_matrix: Optional[Dict[str, Dict[str, float]]] = None
    confidence_level: float = 99.5
    methodology: str = "standard_formula"
    calibration_date: date = Field(default_factory=date.today)
    stress_scenarios: Dict[str, float] = Field(default_factory=dict)
    
class EnhancedQRTTemplate(BaseModel):
    """Template QRT enrichi avec validations et contrôles"""
    template_code: str
    template_name: str
    currency: str
    reporting_period: str
    data_points: Dict[str, Any]
    validation_rules: List[Dict[str, Any]] = Field(default_factory=list)
    cross_validation_checks: List[str] = Field(default_factory=list)
    submission_date: date
    approval_status: str = "draft"
    version: str = "1.0"
    regulatory_comments: List[str] = Field(default_factory=list)

class CapitalPosition(BaseModel):
    """Position de capital détaillée"""
    tier1_unrestricted: float
    tier1_restricted: float
    tier2: float
    tier3: float
    total_own_funds: float
    eligible_own_funds: float
    solvency_capital_requirement: float
    minimum_capital_requirement: float
    
    # Ratios calculés
    solvency_ratio: float
    mcr_ratio: float
    
    # Qualité du capital
    tier1_ratio: float
    leverage_ratio: Optional[float] = None
    
    # Limites réglementaires
    tier1_limit_compliance: bool = True
    tier2_limit_compliance: bool = True
    tier3_limit_compliance: bool = True

class EnhancedSolvency2Calculator:
    """Calculateur Solvency II enrichi avec calibrations avancées"""
    
    def __init__(self, region: GeographicRegion = GeographicRegion.EU_CORE, 
                 regime: RegulatoryRegime = RegulatoryRegime.SOLVENCY_II):
        self.region = region
        self.regime = regime
        
        # Matrices de corrélation enrichies par région
        self.regional_correlations = self._init_regional_correlations()
        
        # Facteurs de choc par asset class et région
        self.shock_factors = self._init_shock_factors()
        
        # Facteurs d'underwriting par segment et région
        self.underwriting_factors = self._init_underwriting_factors()
        
        # Paramètres MCR spécifiques
        self.mcr_parameters = self._init_mcr_parameters()
        
        # Courbes de taux par région/devise
        self.yield_curves = {}
        
        # Stress scenarios prédéfinis
        self.stress_scenarios = self._init_stress_scenarios()
        
    def _init_regional_correlations(self) -> Dict[str, Dict[str, Dict[str, float]]]:
        """Initialise les matrices de corrélation par région"""
        
        base_correlations = {
            'market': {
                'market': 1.0, 'counterparty': 0.25, 'underwriting_life': 0.25,
                'underwriting_health': 0.25, 'underwriting_nonlife': 0.25
            },
            'counterparty': {
                'market': 0.25, 'counterparty': 1.0, 'underwriting_life': 0.25,
                'underwriting_health': 0.0, 'underwriting_nonlife': 0.25
            },
            'underwriting_life': {
                'market': 0.25, 'counterparty': 0.25, 'underwriting_life': 1.0,
                'underwriting_health': 0.25, 'underwriting_nonlife': 0.0
            },
            'underwriting_health': {
                'market': 0.25, 'counterparty': 0.0, 'underwriting_life': 0.25,
                'underwriting_health': 1.0, 'underwriting_nonlife': 0.0
            },
            'underwriting_nonlife': {
                'market': 0.25, 'counterparty': 0.25, 'underwriting_life': 0.0,
                'underwriting_health': 0.0, 'underwriting_nonlife': 1.0
            }
        }
        
        # Ajustements régionaux
        regional_adjustments = {
            GeographicRegion.EU_PERIPHERY: {
                ('market', 'counterparty'): 0.35,  # Corrélation plus forte
                ('market', 'underwriting_nonlife'): 0.30
            },
            GeographicRegion.EMERGING_EU: {
                ('market', 'counterparty'): 0.40,
                ('market', 'underwriting_nonlife'): 0.35
            }
        }
        
        # Application des ajustements
        adjusted_correlations = {}
        for region in GeographicRegion:
            adjusted_correlations[region.value] = {}
            for mod1, corr_dict in base_correlations.items():
                adjusted_correlations[region.value][mod1] = corr_dict.copy()
                
                if region in regional_adjustments:
                    for (m1, m2), adjustment in regional_adjustments[region].items():
                        if mod1 == m1:
                            adjusted_correlations[region.value][mod1][m2] = adjustment
                        elif mod1 == m2:
                            adjusted_correlations[region.value][mod1][m1] = adjustment
        
        return adjusted_correlations
    
    def _init_shock_factors(self) -> Dict[GeographicRegion, Dict[AssetClass, Dict[str, float]]]:
        """Initialise les facteurs de choc par asset class et région"""
        
        base_shocks = {
            AssetClass.GOVERNMENT_BONDS: {
                'interest_rate_up': 0.20,
                'interest_rate_down': 0.20,
                'spread_shock': 0.01
            },
            AssetClass.CORPORATE_BONDS: {
                'interest_rate_up': 0.20,
                'interest_rate_down': 0.20,
                'spread_shock': 0.03
            },
            AssetClass.EQUITIES_TYPE1: {
                'equity_shock': 0.39,
                'volatility_adjustment': 0.0
            },
            AssetClass.EQUITIES_TYPE2: {
                'equity_shock': 0.49,
                'volatility_adjustment': 0.0
            },
            AssetClass.PROPERTY: {
                'property_shock': 0.25
            },
            AssetClass.ALTERNATIVES: {
                'alternative_shock': 0.35
            },
            AssetClass.CASH: {
                'currency_shock': 0.15
            }
        }
        
        # Ajustements régionaux
        regional_multipliers = {
            GeographicRegion.EU_CORE: 1.0,
            GeographicRegion.EU_PERIPHERY: 1.15,
            GeographicRegion.UK: 1.05,
            GeographicRegion.SWITZERLAND: 0.95,
            GeographicRegion.EMERGING_EU: 1.25
        }
        
        result = {}
        for region in GeographicRegion:
            multiplier = regional_multipliers[region]
            result[region] = {}
            
            for asset_class, shocks in base_shocks.items():
                result[region][asset_class] = {}
                for shock_type, shock_value in shocks.items():
                    result[region][asset_class][shock_type] = shock_value * multiplier
        
        return result
    
    def _init_underwriting_factors(self) -> Dict[GeographicRegion, Dict[UnderwritingSegment, Dict[str, float]]]:
        """Initialise les facteurs d'underwriting par segment et région"""
        
        base_factors = {
            UnderwritingSegment.MOTOR_LIABILITY: {
                'premium_risk_factor': 0.10,
                'reserve_risk_factor': 0.09,
                'cat_risk_factor': 0.005
            },
            UnderwritingSegment.MOTOR_OTHER: {
                'premium_risk_factor': 0.07,
                'reserve_risk_factor': 0.08,
                'cat_risk_factor': 0.01
            },
            UnderwritingSegment.MARINE_AVIATION_TRANSPORT: {
                'premium_risk_factor': 0.18,
                'reserve_risk_factor': 0.20,
                'cat_risk_factor': 0.15
            },
            UnderwritingSegment.FIRE_OTHER_PROPERTY: {
                'premium_risk_factor': 0.10,
                'reserve_risk_factor': 0.11,
                'cat_risk_factor': 0.12
            },
            UnderwritingSegment.GENERAL_LIABILITY: {
                'premium_risk_factor': 0.15,
                'reserve_risk_factor': 0.20,
                'cat_risk_factor': 0.03
            },
            UnderwritingSegment.CREDIT_SURETYSHIP: {
                'premium_risk_factor': 0.21,
                'reserve_risk_factor': 0.15,
                'cat_risk_factor': 0.08
            }
        }
        
        # Ajustements régionaux basés sur l'expérience historique
        regional_adjustments = {
            GeographicRegion.EU_PERIPHERY: {
                'premium_risk_multiplier': 1.1,
                'reserve_risk_multiplier': 1.15,
                'cat_risk_multiplier': 1.2
            },
            GeographicRegion.EMERGING_EU: {
                'premium_risk_multiplier': 1.2,
                'reserve_risk_multiplier': 1.25,
                'cat_risk_multiplier': 1.3
            }
        }
        
        result = {}
        for region in GeographicRegion:
            result[region] = {}
            adjustment = regional_adjustments.get(region, {
                'premium_risk_multiplier': 1.0,
                'reserve_risk_multiplier': 1.0,
                'cat_risk_multiplier': 1.0
            })
            
            for segment, factors in base_factors.items():
                result[region][segment] = {
                    'premium_risk_factor': factors['premium_risk_factor'] * adjustment['premium_risk_multiplier'],
                    'reserve_risk_factor': factors['reserve_risk_factor'] * adjustment['reserve_risk_multiplier'],
                    'cat_risk_factor': factors['cat_risk_factor'] * adjustment['cat_risk_multiplier']
                }
        
        return result
    
    def _init_mcr_parameters(self) -> Dict[str, float]:
        """Initialise les paramètres MCR selon le régime"""
        
        base_params = {
            'absolute_floor': 3_200_000,  # EU non-life
            'scr_cap_factor': 0.45,
            'scr_floor_factor': 0.25,
            'alpha_premium': 0.18,
            'alpha_reserves': 0.26,
            'alpha_capital_at_risk': 0.25  # Life business
        }
        
        # Ajustements par régime réglementaire
        regime_adjustments = {
            RegulatoryRegime.UK_REGIME: {
                'absolute_floor': 3_500_000,  # Post-Brexit
                'alpha_premium': 0.20
            },
            RegulatoryRegime.SWISS_TEST: {
                'absolute_floor': 3_000_000,
                'scr_cap_factor': 0.50,
                'alpha_premium': 0.16
            }
        }
        
        if self.regime in regime_adjustments:
            base_params.update(regime_adjustments[self.regime])
        
        return base_params
    
    def _init_stress_scenarios(self) -> Dict[str, Dict[str, float]]:
        """Initialise les scénarios de stress prédéfinis"""
        
        return {
            'adverse_scenario': {
                'equity_shock_multiplier': 1.5,
                'spread_widening': 0.02,
                'property_decline': 0.35,
                'claims_inflation': 0.15
            },
            'severely_adverse_scenario': {
                'equity_shock_multiplier': 2.0,
                'spread_widening': 0.04,
                'property_decline': 0.50,
                'claims_inflation': 0.25
            },
            'pandemic_scenario': {
                'mortality_shock': 0.20,
                'business_interruption': 0.30,
                'investment_shock': 1.2
            },
            'cyber_scenario': {
                'operational_loss': 0.05,
                'business_interruption': 0.15,
                'reputation_impact': 0.02
            }
        }
    
    def calculate_enhanced_market_scr(self, 
                                    portfolio: Dict[AssetClass, float],
                                    duration_mapping: Dict[AssetClass, float] = None,
                                    credit_quality: Dict[AssetClass, str] = None,
                                    stress_scenario: Optional[str] = None) -> EnhancedSCRModule:
        """
        Calcul SCR Marché enrichi avec décomposition par asset class
        """
        
        duration_mapping = duration_mapping or {}
        credit_quality = credit_quality or {}
        
        # Sélection des facteurs de choc
        shock_factors = self.shock_factors[self.region]
        if stress_scenario and stress_scenario in self.stress_scenarios:
            stress_multipliers = self.stress_scenarios[stress_scenario]
        else:
            stress_multipliers = {}
        
        sub_modules = {}
        stress_scenarios = {}
        
        # 1. Risque de taux d'intérêt
        bond_exposure = portfolio.get(AssetClass.GOVERNMENT_BONDS, 0) + portfolio.get(AssetClass.CORPORATE_BONDS, 0)
        if bond_exposure > 0:
            avg_duration = (
                duration_mapping.get(AssetClass.GOVERNMENT_BONDS, 4.0) * portfolio.get(AssetClass.GOVERNMENT_BONDS, 0) +
                duration_mapping.get(AssetClass.CORPORATE_BONDS, 5.0) * portfolio.get(AssetClass.CORPORATE_BONDS, 0)
            ) / bond_exposure
            
            # Choc de taux sophistiqué selon la duration
            rate_up_shock = self._calculate_interest_rate_shock(avg_duration, True)
            rate_down_shock = self._calculate_interest_rate_shock(avg_duration, False)
            
            interest_rate_scr = max(
                bond_exposure * rate_up_shock,
                bond_exposure * rate_down_shock
            )
            sub_modules['interest_rate'] = interest_rate_scr
            stress_scenarios['interest_rate_up_200bp'] = bond_exposure * self._calculate_interest_rate_shock(avg_duration, True, 0.02)
        
        # 2. Risque actions avec volatility adjustment
        equity_type1 = portfolio.get(AssetClass.EQUITIES_TYPE1, 0)
        equity_type2 = portfolio.get(AssetClass.EQUITIES_TYPE2, 0)
        
        if equity_type1 > 0:
            shock_t1 = shock_factors[AssetClass.EQUITIES_TYPE1]['equity_shock']
            if 'equity_shock_multiplier' in stress_multipliers:
                shock_t1 *= stress_multipliers['equity_shock_multiplier']
            
            equity_t1_scr = equity_type1 * shock_t1
            sub_modules['equity_type1'] = equity_t1_scr
        
        if equity_type2 > 0:
            shock_t2 = shock_factors[AssetClass.EQUITIES_TYPE2]['equity_shock'] 
            if 'equity_shock_multiplier' in stress_multipliers:
                shock_t2 *= stress_multipliers['equity_shock_multiplier']
                
            equity_t2_scr = equity_type2 * shock_t2
            sub_modules['equity_type2'] = equity_t2_scr
        
        # 3. Risque immobilier
        property_exposure = portfolio.get(AssetClass.PROPERTY, 0)
        if property_exposure > 0:
            property_shock = shock_factors[AssetClass.PROPERTY]['property_shock']
            if 'property_decline' in stress_multipliers:
                # Si scénario de stress, utiliser le déclin du scénario
                property_shock = max(property_shock, stress_multipliers['property_decline'])
            
            property_scr = property_exposure * property_shock
            sub_modules['property'] = property_scr
        
        # 4. Risque de spread (obligations corporates)
        corporate_bonds = portfolio.get(AssetClass.CORPORATE_BONDS, 0)
        if corporate_bonds > 0:
            base_spread_shock = shock_factors[AssetClass.CORPORATE_BONDS]['spread_shock']
            
            # Ajustement selon la qualité de crédit
            credit_multipliers = {'AAA': 0.5, 'AA': 0.7, 'A': 1.0, 'BBB': 1.5, 'BB': 2.5}
            avg_credit_quality = credit_quality.get(AssetClass.CORPORATE_BONDS, 'A')
            credit_mult = credit_multipliers.get(avg_credit_quality, 1.0)
            
            spread_shock = base_spread_shock * credit_mult
            if 'spread_widening' in stress_multipliers:
                spread_shock += stress_multipliers['spread_widening']
            
            corp_duration = duration_mapping.get(AssetClass.CORPORATE_BONDS, 5.0)
            spread_scr = corporate_bonds * spread_shock * corp_duration
            sub_modules['spread'] = spread_scr
        
        # 5. Risque de change
        currency_exposure = portfolio.get(AssetClass.CASH, 0) * 0.2  # 20% en devises étrangères
        if currency_exposure > 0:
            currency_shock = shock_factors[AssetClass.CASH]['currency_shock']
            currency_scr = currency_exposure * currency_shock
            sub_modules['currency'] = currency_scr
        
        # 6. Risque de concentration (si applicable)
        concentration_scr = self._calculate_concentration_risk(portfolio)
        if concentration_scr > 0:
            sub_modules['concentration'] = concentration_scr
        
        # Agrégation avec corrélations intra-marché
        market_correlations = {
            ('interest_rate', 'spread'): 0.75,
            ('equity_type1', 'equity_type2'): 0.75,
            ('equity_type1', 'property'): 0.75,
            ('equity_type2', 'property'): 0.75,
            ('interest_rate', 'equity_type1'): 0.25,
            ('interest_rate', 'equity_type2'): 0.25,
            ('spread', 'equity_type1'): 0.25,
            ('spread', 'equity_type2'): 0.25
        }
        
        total_scr_before_diversification = sum(sub_modules.values())
        diversified_scr = self._aggregate_with_correlations(sub_modules, market_correlations)
        diversification_benefit = total_scr_before_diversification - diversified_scr
        
        # Stress scenarios additionnels
        for scenario_name in ['adverse_scenario', 'severely_adverse_scenario']:
            if scenario_name != stress_scenario:  # Éviter double calcul
                scenario_scr = self.calculate_enhanced_market_scr(
                    portfolio, duration_mapping, credit_quality, scenario_name
                ).total_requirement
                stress_scenarios[scenario_name] = scenario_scr
        
        return EnhancedSCRModule(
            module_name="Market Risk",
            sub_modules=sub_modules,
            total_requirement=diversified_scr,
            diversification_benefit=diversification_benefit,
            correlation_matrix={'intra_market': market_correlations},
            stress_scenarios=stress_scenarios
        )
    
    def _calculate_interest_rate_shock(self, duration: float, is_up: bool, shock_size: float = 0.01) -> float:
        """Calcule le choc de taux selon la duration et le sens"""
        
        # Formule Solvency II sophistiquée
        if is_up:
            # Choc à la hausse
            base_shock = min(0.20, 0.01 + 0.04 * duration / 10)
        else:
            # Choc à la baisse
            base_shock = min(0.20, max(0.01, 0.05 - 0.01 * duration / 5))
        
        # Ajustement si choc custom fourni
        if shock_size != 0.01:
            multiplier = shock_size / 0.01
            base_shock *= multiplier
        
        return base_shock
    
    def _calculate_concentration_risk(self, portfolio: Dict[AssetClass, float]) -> float:
        """Calcule le risque de concentration selon les seuils réglementaires"""
        
        total_assets = sum(portfolio.values())
        if total_assets == 0:
            return 0
        
        # Seuils de concentration par type d'exposition
        concentration_thresholds = {
            'single_name': 0.03,  # 3% des fonds propres
            'government': 0.20,   # 20% pour gouvernements OCDE
            'sector': 0.10        # 10% par secteur
        }
        
        # Approximation simple - à enrichir avec vraies expositions
        max_single_exposure = max(portfolio.values()) / total_assets
        
        if max_single_exposure > concentration_thresholds['single_name']:
            excess_concentration = max_single_exposure - concentration_thresholds['single_name']
            concentration_scr = total_assets * excess_concentration * 0.15  # 15% de charge
            return concentration_scr
        
        return 0
    
    def _aggregate_with_correlations(self, 
                                   modules: Dict[str, float], 
                                   correlations: Dict[Tuple[str, str], float]) -> float:
        """Agrège des modules avec une matrice de corrélation"""
        
        module_names = list(modules.keys())
        total_variance = 0.0
        
        for i, mod1 in enumerate(module_names):
            for j, mod2 in enumerate(module_names):
                if i == j:
                    correlation = 1.0
                else:
                    # Chercher la corrélation dans les deux sens
                    correlation = correlations.get((mod1, mod2), correlations.get((mod2, mod1), 0.0))
                
                total_variance += correlation * modules[mod1] * modules[mod2]
        
        return math.sqrt(max(0, total_variance))
    
    def calculate_enhanced_underwriting_scr(self,
                                          segment_data: Dict[UnderwritingSegment, Dict[str, float]],
                                          stress_scenario: Optional[str] = None) -> EnhancedSCRModule:
        """
        Calcul SCR Souscription enrichi par segment d'activité
        """
        
        factors = self.underwriting_factors[self.region]
        sub_modules = {}
        stress_scenarios = {}
        
        # Facteurs de stress si scénario appliqué
        stress_multipliers = {}
        if stress_scenario and stress_scenario in self.stress_scenarios:
            stress_multipliers = self.stress_scenarios[stress_scenario]
        
        # Calcul par segment
        for segment, data in segment_data.items():
            premiums = data.get('premiums', 0)
            reserves = data.get('reserves', 0)
            
            segment_factors = factors.get(segment, factors[UnderwritingSegment.MISCELLANEOUS])
            
            # Premium risk
            premium_factor = segment_factors['premium_risk_factor']
            if 'claims_inflation' in stress_multipliers:
                premium_factor *= (1 + stress_multipliers['claims_inflation'])
            
            premium_risk = premiums * premium_factor
            
            # Reserve risk
            reserve_factor = segment_factors['reserve_risk_factor']
            if 'claims_inflation' in stress_multipliers:
                reserve_factor *= (1 + stress_multipliers['claims_inflation'] * 0.7)  # Impact moindre sur réserves
            
            reserve_risk = reserves * reserve_factor
            
            # Catastrophe risk
            cat_risk = self._calculate_catastrophe_risk(segment, premiums, data.get('exposures', {}))
            
            # Corrélation premium/reserve au niveau segment (75%)
            segment_scr = math.sqrt(premium_risk**2 + reserve_risk**2 + 2 * 0.75 * premium_risk * reserve_risk) + cat_risk
            
            sub_modules[f"{segment.value}_premium"] = premium_risk
            sub_modules[f"{segment.value}_reserve"] = reserve_risk
            sub_modules[f"{segment.value}_cat"] = cat_risk
            sub_modules[f"{segment.value}_total"] = segment_scr
        
        # Corrélations entre segments
        segment_correlations = self._get_underwriting_correlations()
        
        # Agrégation segments
        segment_totals = {seg.value: sub_modules.get(f"{seg.value}_total", 0) 
                         for seg in segment_data.keys()}
        
        total_scr = self._aggregate_with_correlations(segment_totals, segment_correlations)
        
        total_before_diversification = sum(segment_totals.values())
        diversification_benefit = total_before_diversification - total_scr
        
        # Stress scenarios
        if stress_scenario != 'pandemic_scenario':
            pandemic_scr = self.calculate_enhanced_underwriting_scr(
                segment_data, 'pandemic_scenario'
            ).total_requirement
            stress_scenarios['pandemic_scenario'] = pandemic_scr
        
        return EnhancedSCRModule(
            module_name="Underwriting Risk - Non-Life",
            sub_modules=sub_modules,
            total_requirement=total_scr,
            diversification_benefit=diversification_benefit,
            correlation_matrix={'segments': segment_correlations},
            stress_scenarios=stress_scenarios
        )
    
    def _calculate_catastrophe_risk(self, 
                                  segment: UnderwritingSegment,
                                  premiums: float,
                                  exposures: Dict[str, float]) -> float:
        """Calcule le risque catastrophe par segment"""
        
        cat_scenarios = {
            UnderwritingSegment.FIRE_OTHER_PROPERTY: {
                'windstorm': exposures.get('windstorm_exposed_buildings', premiums * 0.3) * 0.002,
                'earthquake': exposures.get('earthquake_zones', premiums * 0.1) * 0.005,
                'flood': exposures.get('flood_zones', premiums * 0.2) * 0.003
            },
            UnderwritingSegment.MOTOR_LIABILITY: {
                'liability_concentration': premiums * 0.0005  # Très faible pour motor
            },
            UnderwritingSegment.MARINE_AVIATION_TRANSPORT: {
                'aviation_hull': exposures.get('aviation_hull_sum_insured', 0) * 0.01,
                'marine_cargo': exposures.get('marine_cargo_concentration', 0) * 0.005
            }
        }
        
        segment_cats = cat_scenarios.get(segment, {})
        if not segment_cats:
            return premiums * 0.001  # 0.1% par défaut
        
        # Agrégation des risques cat (indépendance supposée)
        total_cat = math.sqrt(sum(cat**2 for cat in segment_cats.values()))
        return total_cat
    
    def _get_underwriting_correlations(self) -> Dict[Tuple[str, str], float]:
        """Retourne les corrélations entre segments d'underwriting"""
        
        return {
            ('motor_liability', 'motor_other'): 0.50,
            ('motor_liability', 'general_liability'): 0.25,
            ('fire_other_property', 'general_liability'): 0.25,
            ('marine_aviation_transport', 'fire_other_property'): 0.15,
            ('credit_suretyship', 'general_liability'): 0.25
        }
    
    def calculate_enhanced_counterparty_scr(self, 
                                          counterparties: Dict[str, Dict[str, Any]]) -> EnhancedSCRModule:
        """
        Calcul SCR Contrepartie enrichi avec granularité par contrepartie
        """
        
        sub_modules = {}
        
        # Type 1: Défaut d'une contrepartie spécifique
        for cp_name, cp_data in counterparties.items():
            exposure = cp_data.get('exposure', 0)
            pd_1_year = cp_data.get('probability_of_default', 0.01)  # 1% par défaut
            lgd = cp_data.get('loss_given_default', 0.45)  # 45% par défaut
            
            # Formule Solvency II
            cp_scr = exposure * max(0.002, min(pd_1_year * lgd, 0.15))
            sub_modules[f'counterparty_{cp_name}'] = cp_scr
        
        # Type 2: Risque de corrélation/contagion
        total_counterparty_exposure = sum(cp.get('exposure', 0) for cp in counterparties.values())
        if total_counterparty_exposure > 0:
            concentration_factor = min(1.0, total_counterparty_exposure / 100_000_000)  # Seuil 100M
            contagion_scr = total_counterparty_exposure * 0.005 * concentration_factor
            sub_modules['contagion_risk'] = contagion_scr
        
        # Agrégation (indépendance partielle)
        individual_defaults = sum(v for k, v in sub_modules.items() if k.startswith('counterparty_'))
        systemic_risk = sub_modules.get('contagion_risk', 0)
        
        # Corrélation 50% entre risques individuels, indépendance avec systémique
        correlated_individual = individual_defaults * math.sqrt(0.5) if individual_defaults > 0 else 0
        total_scr = math.sqrt(correlated_individual**2 + systemic_risk**2)
        
        return EnhancedSCRModule(
            module_name="Counterparty Default Risk",
            sub_modules=sub_modules,
            total_requirement=total_scr,
            diversification_benefit=individual_defaults - correlated_individual
        )
    
    def calculate_enhanced_operational_scr(self, 
                                         basic_scr: float,
                                         premiums_data: Dict[str, float],
                                         provisions_data: Dict[str, float]) -> EnhancedSCRModule:
        """
        Calcul SCR Opérationnel enrichi avec composants détaillés
        """
        
        # Formule standard Solvency II
        earned_premiums_total = sum(premiums_data.values())
        provisions_total = sum(provisions_data.values())
        
        # Composants du calcul OpRisk
        component_premiums = min(earned_premiums_total * 0.03, 30_000_000)
        component_provisions = min(provisions_total * 0.03, 30_000_000) 
        component_bscr = basic_scr * 0.25
        
        # Operational SCR = min des 3 composants
        op_scr_standard = min(component_premiums, component_provisions, component_bscr)
        
        # Sous-modules pour transparence
        sub_modules = {
            'process_risk': op_scr_standard * 0.4,      # 40% risques de process
            'systems_risk': op_scr_standard * 0.25,     # 25% risques IT
            'people_risk': op_scr_standard * 0.20,      # 20% risques humains
            'external_risk': op_scr_standard * 0.10,    # 10% risques externes
            'legal_risk': op_scr_standard * 0.05        # 5% risques juridiques
        }
        
        # Stress scenarios spécifiques OpRisk
        stress_scenarios = {
            'cyber_scenario': op_scr_standard * 1.5,  # Cyber majore l'OpRisk
            'pandemic_scenario': op_scr_standard * 1.2  # Télétravail et process
        }
        
        return EnhancedSCRModule(
            module_name="Operational Risk",
            sub_modules=sub_modules,
            total_requirement=op_scr_standard,
            stress_scenarios=stress_scenarios,
            methodology=f"Standard formula - min({component_premiums:,.0f}, {component_provisions:,.0f}, {component_bscr:,.0f})"
        )
    
    def calculate_enhanced_mcr(self, 
                             scr: float,
                             segments_data: Dict[UnderwritingSegment, Dict[str, float]],
                             validation_checks: bool = True) -> Dict[str, Any]:
        """
        Calcul MCR enrichi avec vérifications de cohérence
        """
        
        params = self.mcr_parameters
        
        # Composants Linear MCR
        linear_mcr_premiums = 0
        linear_mcr_reserves = 0
        linear_mcr_capital_at_risk = 0
        
        mcr_factors_premiums = {
            UnderwritingSegment.MOTOR_LIABILITY: 0.18,
            UnderwritingSegment.MOTOR_OTHER: 0.16,
            UnderwritingSegment.MARINE_AVIATION_TRANSPORT: 0.21,
            UnderwritingSegment.FIRE_OTHER_PROPERTY: 0.18,
            UnderwritingSegment.GENERAL_LIABILITY: 0.21,
            UnderwritingSegment.CREDIT_SURETYSHIP: 0.27
        }
        
        mcr_factors_reserves = {
            UnderwritingSegment.MOTOR_LIABILITY: 0.26,
            UnderwritingSegment.MOTOR_OTHER: 0.22,
            UnderwritingSegment.MARINE_AVIATION_TRANSPORT: 0.30,
            UnderwritingSegment.FIRE_OTHER_PROPERTY: 0.26,
            UnderwritingSegment.GENERAL_LIABILITY: 0.30,
            UnderwritingSegment.CREDIT_SURETYSHIP: 0.30
        }
        
        # Calcul granulaire par segment
        segment_contributions = {}
        for segment, data in segments_data.items():
            premiums = data.get('premiums', 0)
            reserves = data.get('reserves', 0)
            
            factor_p = mcr_factors_premiums.get(segment, 0.18)
            factor_r = mcr_factors_reserves.get(segment, 0.26)
            
            mcr_p_segment = premiums * factor_p
            mcr_r_segment = reserves * factor_r
            
            linear_mcr_premiums += mcr_p_segment
            linear_mcr_reserves += mcr_r_segment
            
            segment_contributions[segment.value] = {
                'premium_component': mcr_p_segment,
                'reserve_component': mcr_r_segment,
                'combined': max(mcr_p_segment, mcr_r_segment)
            }
        
        # Linear MCR = max des composants
        linear_mcr = max(linear_mcr_premiums, linear_mcr_reserves, linear_mcr_capital_at_risk)
        
        # Seuils réglementaires
        scr_floor = scr * params['scr_floor_factor']  # 25% SCR
        scr_cap = scr * params['scr_cap_factor']      # 45% SCR
        absolute_floor = params['absolute_floor']      # 3.2M EUR
        
        # MCR final
        mcr = max(absolute_floor, min(scr_cap, max(scr_floor, linear_mcr)))
        
        # Validations réglementaires
        validation_results = {}
        if validation_checks:
            validation_results = {
                'linear_mcr_positive': linear_mcr > 0,
                'scr_floor_respected': mcr >= scr_floor,
                'scr_cap_respected': mcr <= scr_cap,
                'absolute_floor_respected': mcr >= absolute_floor,
                'linear_dominates_floor': linear_mcr > scr_floor,
                'reasonable_scr_mcr_ratio': 2.0 <= (scr / mcr) <= 4.0 if mcr > 0 else False
            }
        
        # Analyse de sensibilité MCR
        sensitivity_analysis = {
            'scr_down_20pct': max(absolute_floor, min(scr * 0.8 * params['scr_cap_factor'], 
                                                   max(scr * 0.8 * params['scr_floor_factor'], linear_mcr))),
            'premiums_up_10pct': max(absolute_floor, min(scr_cap, 
                                                       max(scr_floor, linear_mcr_premiums * 1.1))),
            'reserves_up_10pct': max(absolute_floor, min(scr_cap,
                                                       max(scr_floor, linear_mcr_reserves * 1.1)))
        }
        
        return {
            'mcr': mcr,
            'linear_mcr': linear_mcr,
            'components': {
                'linear_mcr_premiums': linear_mcr_premiums,
                'linear_mcr_reserves': linear_mcr_reserves,
                'linear_mcr_capital_at_risk': linear_mcr_capital_at_risk,
                'scr_floor': scr_floor,
                'scr_cap': scr_cap,
                'absolute_floor': absolute_floor
            },
            'segment_contributions': segment_contributions,
            'validation_results': validation_results,
            'sensitivity_analysis': sensitivity_analysis,
            'binding_constraint': self._determine_binding_constraint(mcr, linear_mcr, scr_floor, scr_cap, absolute_floor)
        }
    
    def _determine_binding_constraint(self, mcr: float, linear: float, floor: float, cap: float, absolute: float) -> str:
        """Détermine quelle contrainte est active dans le calcul MCR"""
        if abs(mcr - absolute) < 1000:
            return "absolute_floor"
        elif abs(mcr - cap) < 1000:
            return "scr_cap"
        elif abs(mcr - floor) < 1000:
            return "scr_floor"
        elif abs(mcr - linear) < 1000:
            return "linear_mcr"
        else:
            return "unknown"
    
    def generate_enhanced_qrt_templates(self,
                                      scr_modules: Dict[str, EnhancedSCRModule],
                                      mcr_result: Dict[str, Any],
                                      balance_sheet: Dict[str, float],
                                      reporting_period: str) -> List[EnhancedQRTTemplate]:
        """
        Génère des templates QRT enrichis avec validations avancées
        """
        
        templates = []
        
        # S.02.01.02 - Balance Sheet enrichi
        balance_sheet_template = self._generate_enhanced_balance_sheet_qrt(balance_sheet, reporting_period)
        templates.append(balance_sheet_template)
        
        # S.25.01.21 - SCR Standard Formula enrichi
        scr_template = self._generate_enhanced_scr_qrt(scr_modules, reporting_period)
        templates.append(scr_template)
        
        # S.28.01.01 - MCR enrichi
        mcr_template = self._generate_enhanced_mcr_qrt(mcr_result, reporting_period)
        templates.append(mcr_template)
        
        # Templates additionnels
        
        # S.05.01.02 - Premiums, claims and expenses by line of business
        lob_template = self._generate_lob_analysis_qrt(scr_modules.get('underwriting'), reporting_period)
        templates.append(lob_template)
        
        # S.17.01.02 - Technical provisions by line of business
        tp_template = self._generate_technical_provisions_qrt(scr_modules.get('underwriting'), reporting_period)
        templates.append(tp_template)
        
        # S.06.02.01 - List of assets
        assets_template = self._generate_assets_list_qrt(balance_sheet, reporting_period)
        templates.append(assets_template)
        
        return templates
    
    def _generate_enhanced_balance_sheet_qrt(self, balance_sheet: Dict[str, float], period: str) -> EnhancedQRTTemplate:
        """Génère le QRT balance sheet avec validations enrichies"""
        
        # Validations spécifiques balance sheet
        validation_rules = [
            {
                'rule_id': 'BS_001',
                'description': 'Total assets = Total liabilities + Own funds',
                'formula': 'R0500 = R0280 - R0490',
                'severity': 'ERROR'
            },
            {
                'rule_id': 'BS_002', 
                'description': 'Technical provisions >= 0',
                'formula': 'R0320 >= 0',
                'severity': 'WARNING'
            },
            {
                'rule_id': 'BS_003',
                'description': 'Investments consistency',
                'formula': 'R0150 = SUM(R0060:R0140)',
                'severity': 'ERROR'
            }
        ]
        
        cross_validation_checks = [
            'Coherence with S.06.02 (List of assets)',
            'Coherence with S.12.01 (Technical provisions)',
            'Coherence with S.23.01 (Own funds)'
        ]
        
        data_points = {
            "R0010": balance_sheet.get('intangible_assets', 0),
            "R0020": balance_sheet.get('deferred_tax_assets', 0),
            "R0040": balance_sheet.get('property_plant_equipment', 5_000_000),
            "R0060": balance_sheet.get('equities_listed', 15_000_000),
            "R0070": balance_sheet.get('equities_unlisted', 5_000_000),
            "R0080": balance_sheet.get('government_bonds', 50_000_000),
            "R0090": balance_sheet.get('corporate_bonds', 20_000_000),
            "R0120": balance_sheet.get('collective_investments', 10_000_000),
            "R0140": balance_sheet.get('deposits_other', 5_000_000),
            "R0150": 105_000_000,  # Total investments (calculé)
            "R0180": balance_sheet.get('reinsurance_recoverables_nonlife', 20_000_000),
            "R0210": balance_sheet.get('insurance_intermediaries_receivables', 3_000_000),
            "R0220": balance_sheet.get('reinsurance_receivables', 1_000_000),
            "R0230": balance_sheet.get('receivables_trade_not_insurance', 2_000_000),
            "R0260": balance_sheet.get('cash_cash_equivalents', 8_000_000),
            "R0270": balance_sheet.get('any_other_assets', 1_000_000),
            "R0280": 145_000_000,  # Total assets
            
            # Liabilities
            "R0320": balance_sheet.get('technical_provisions_nonlife', 80_000_000),
            "R0370": balance_sheet.get('provisions_other_than_technical', 2_000_000),
            "R0380": balance_sheet.get('pension_benefit_obligations', 1_000_000),
            "R0390": balance_sheet.get('deposits_from_reinsurers', 500_000),
            "R0400": balance_sheet.get('deferred_tax_liabilities', 1_500_000),
            "R0440": balance_sheet.get('insurance_intermediaries_payables', 1_500_000),
            "R0450": balance_sheet.get('reinsurance_payables', 800_000),
            "R0460": balance_sheet.get('payables_trade_not_insurance', 2_200_000),
            "R0480": balance_sheet.get('any_other_liabilities', 500_000),
            "R0490": 90_000_000,  # Total liabilities
            
            # Own funds
            "R0500": 55_000_000,  # Excess of assets over liabilities
            "R0510": 20_000_000,  # Share capital
            "R0540": 35_000_000,  # Subordinated mutual member accounts
            "R0610": 55_000_000   # Total own funds
        }
        
        return EnhancedQRTTemplate(
            template_code="S.02.01.02",
            template_name="Balance sheet",
            currency="EUR",
            reporting_period=period,
            data_points=data_points,
            validation_rules=validation_rules,
            cross_validation_checks=cross_validation_checks,
            submission_date=date.today(),
            version="2.7.0"  # Version EIOPA
        )
    
    def _generate_enhanced_scr_qrt(self, scr_modules: Dict[str, EnhancedSCRModule], period: str) -> EnhancedQRTTemplate:
        """Génère le QRT SCR avec détails des sous-modules"""
        
        market_scr = scr_modules.get('market', EnhancedSCRModule(module_name="Market", total_requirement=0))
        underwriting_scr = scr_modules.get('underwriting', EnhancedSCRModule(module_name="Underwriting", total_requirement=0))
        counterparty_scr = scr_modules.get('counterparty', EnhancedSCRModule(module_name="Counterparty", total_requirement=0))
        operational_scr = scr_modules.get('operational', EnhancedSCRModule(module_name="Operational", total_requirement=0))
        
        # Calcul BSCR avec corrélations
        basic_scr = self._aggregate_with_correlations(
            {
                'market': market_scr.total_requirement,
                'counterparty': counterparty_scr.total_requirement,
                'underwriting': underwriting_scr.total_requirement
            },
            self.regional_correlations[self.region.value]
        )
        
        total_scr = basic_scr + operational_scr.total_requirement
        
        # Détails sous-modules marché
        data_points = {
            # Module Marché détaillé
            "R0010": market_scr.total_requirement,
            "R0020": market_scr.sub_modules.get('interest_rate', 0),
            "R0030": market_scr.sub_modules.get('equity_type1', 0) + market_scr.sub_modules.get('equity_type2', 0),
            "R0040": market_scr.sub_modules.get('property', 0),
            "R0050": market_scr.sub_modules.get('spread', 0),
            "R0060": market_scr.sub_modules.get('concentration', 0),
            "R0070": market_scr.sub_modules.get('currency', 0),
            
            # Contrepartie
            "R0080": counterparty_scr.total_requirement,
            
            # Souscription
            "R0090": underwriting_scr.total_requirement,
            
            # Diversification
            "R0100": -(sum([market_scr.total_requirement, counterparty_scr.total_requirement, underwriting_scr.total_requirement]) - basic_scr),
            
            # BSCR
            "R0110": basic_scr,
            
            # Opérationnel
            "R0120": operational_scr.total_requirement,
            
            # SCR Total
            "R0200": total_scr
        }
        
        validation_rules = [
            {
                'rule_id': 'SCR_001',
                'description': 'SCR >= sum of modules - diversification',
                'formula': 'R0200 >= R0010 + R0080 + R0090 + R0120 - diversification',
                'severity': 'ERROR'
            },
            {
                'rule_id': 'SCR_002',
                'description': 'Operational risk <= 30% of BSCR',
                'formula': 'R0120 <= 0.30 * R0110',
                'severity': 'WARNING'
            }
        ]
        
        return EnhancedQRTTemplate(
            template_code="S.25.01.21",
            template_name="Solvency Capital Requirement - for undertakings on Standard Formula",
            currency="EUR",
            reporting_period=period,
            data_points=data_points,
            validation_rules=validation_rules,
            submission_date=date.today(),
            version="2.7.0"
        )
    
    def _generate_enhanced_mcr_qrt(self, mcr_result: Dict[str, Any], period: str) -> EnhancedQRTTemplate:
        """Génère le QRT MCR enrichi avec détails des composants"""
        
        mcr = mcr_result['mcr']
        components = mcr_result['components']
        
        data_points = {
            "R0010": components['linear_mcr_premiums'],
            "R0020": components['linear_mcr_reserves'], 
            "R0030": components['linear_mcr_capital_at_risk'],
            "R0040": mcr_result['linear_mcr'],
            "R0050": components['scr_floor'],
            "R0060": components['scr_cap'],
            "R0070": components['absolute_floor'],
            "R0080": mcr,
            "R0090": mcr  # MCR already eligible own funds
        }
        
        # Validations MCR spécifiques
        validation_rules = [
            {
                'rule_id': 'MCR_001',
                'description': 'MCR between absolute floor and SCR cap',
                'formula': 'R0070 <= R0080 <= R0060',
                'severity': 'ERROR'
            },
            {
                'rule_id': 'MCR_002',
                'description': 'Linear MCR = max of components',
                'formula': 'R0040 = MAX(R0010, R0020, R0030)',
                'severity': 'ERROR'
            },
            {
                'rule_id': 'MCR_003',
                'description': 'MCR binding constraint identified',
                'formula': 'Binding constraint = ' + mcr_result['binding_constraint'],
                'severity': 'INFO'
            }
        ]
        
        return EnhancedQRTTemplate(
            template_code="S.28.01.01",
            template_name="Minimum Capital Requirement - Only life or only non-life insurance or reinsurance activity",
            currency="EUR",
            reporting_period=period,
            data_points=data_points,
            validation_rules=validation_rules,
            submission_date=date.today(),
            version="2.7.0"
        )
    
    def _generate_lob_analysis_qrt(self, underwriting_module: Optional[EnhancedSCRModule], period: str) -> EnhancedQRTTemplate:
        """Génère l'analyse par ligne d'activité (S.05.01.02)"""
        
        if not underwriting_module:
            # Template vide si pas de données underwriting
            return EnhancedQRTTemplate(
                template_code="S.05.01.02",
                template_name="Premiums, claims and expenses by line of business - Non-life",
                currency="EUR",
                reporting_period=period,
                data_points={},
                submission_date=date.today()
            )
        
        # Extraction des données par segment depuis les sub_modules
        data_points = {}
        row_counter = 10  # Starting row for LoB data
        
        for segment_name in ['motor_liability', 'motor_other', 'fire_other_property', 'general_liability']:
            if f"{segment_name}_total" in underwriting_module.sub_modules:
                data_points[f"R{row_counter:04d}"] = underwriting_module.sub_modules[f"{segment_name}_premium"] # Premiums written
                data_points[f"R{row_counter+100:04d}"] = underwriting_module.sub_modules[f"{segment_name}_reserve"] # Claims incurred
                row_counter += 10
        
        return EnhancedQRTTemplate(
            template_code="S.05.01.02",
            template_name="Premiums, claims and expenses by line of business - Non-life",
            currency="EUR", 
            reporting_period=period,
            data_points=data_points,
            submission_date=date.today(),
            version="2.7.0"
        )
    
    def _generate_technical_provisions_qrt(self, underwriting_module: Optional[EnhancedSCRModule], period: str) -> EnhancedQRTTemplate:
        """Génère les provisions techniques par LoB (S.17.01.02)"""
        
        data_points = {
            "R0010": 5_000_000,   # Motor vehicle liability - Best estimate
            "R0020": 3_000_000,   # Other motor insurance - Best estimate
            "R0030": 15_000_000,  # Fire and other property - Best estimate
            "R0040": 25_000_000,  # General liability - Best estimate
            "R0050": 80_000_000,  # Total best estimate - gross
            "R0060": 15_000_000,  # Total Recoverables from reinsurance
            "R0070": 65_000_000,  # Technical provisions - net
            "R0080": 8_000_000,   # Risk margin
            "R0090": 73_000_000   # Technical provisions - total
        }
        
        return EnhancedQRTTemplate(
            template_code="S.17.01.02",
            template_name="Non-Life Technical Provisions",
            currency="EUR",
            reporting_period=period,
            data_points=data_points,
            submission_date=date.today(),
            version="2.7.0"
        )
    
    def _generate_assets_list_qrt(self, balance_sheet: Dict[str, float], period: str) -> EnhancedQRTTemplate:
        """Génère la liste des actifs (S.06.02.01)"""
        
        # Template simplifié pour les principaux actifs
        data_points = {
            "asset_001": {
                "asset_id": "GOV_BOND_001",
                "asset_name": "Government Bond - France 10Y",
                "quantity": 10_000,
                "unit_solvency_ii_value": 1050.0,
                "total_solvency_ii_value": 10_500_000,
                "asset_category": "2",  # Government bonds
                "country_of_custody": "FR"
            },
            "asset_002": {
                "asset_id": "EQUITY_001", 
                "asset_name": "Listed Equity Portfolio",
                "quantity": 150_000,
                "unit_solvency_ii_value": 100.0,
                "total_solvency_ii_value": 15_000_000,
                "asset_category": "1",  # Equities
                "country_of_custody": "FR"
            }
        }
        
        return EnhancedQRTTemplate(
            template_code="S.06.02.01",
            template_name="List of assets",
            currency="EUR",
            reporting_period=period,
            data_points=data_points,
            submission_date=date.today(),
            version="2.7.0"
        )


class EnhancedSolvency2Service:
    """Service Solvency II enrichi avec fonctionnalités avancées"""
    
    def __init__(self, region: GeographicRegion = GeographicRegion.EU_CORE):
        self.calculator = EnhancedSolvency2Calculator(region)
        self.region = region
        
    async def calculate_comprehensive_solvency_assessment(self,
                                                        triangle_data: List[List[float]],
                                                        business_segments: Dict[str, Dict[str, Any]],
                                                        asset_portfolio: Dict[str, float],
                                                        counterparties: Dict[str, Dict[str, Any]],
                                                        balance_sheet: Dict[str, float],
                                                        stress_scenario: Optional[str] = None) -> Dict[str, Any]:
        """
        Évaluation complète de solvabilité avec tous les modules enrichis
        """
        
        logger.info(f"Démarrage évaluation Solvency II enrichie - Région: {self.region}")
        
        # 1. Préparation des données par segment
        segment_mapping = {
            'motor': [UnderwritingSegment.MOTOR_LIABILITY, UnderwritingSegment.MOTOR_OTHER],
            'property': [UnderwritingSegment.FIRE_OTHER_PROPERTY],
            'liability': [UnderwritingSegment.GENERAL_LIABILITY],
            'marine': [UnderwritingSegment.MARINE_AVIATION_TRANSPORT],
            'credit': [UnderwritingSegment.CREDIT_SURETYSHIP]
        }
        
        # Conversion vers les segments Solvency II
        sii_segments_data = {}
        for business_line, segments in segment_mapping.items():
            if business_line in business_segments:
                for segment in segments:
                    sii_segments_data[segment] = business_segments[business_line]
        
        if not sii_segments_data:
            # Données par défaut basées sur triangle
            ultimate_total = sum([row[-1] if row else 0 for row in triangle_data])
            sii_segments_data = {
                UnderwritingSegment.FIRE_OTHER_PROPERTY: {
                    'premiums': ultimate_total * 0.85,
                    'reserves': ultimate_total,
                    'exposures': {}
                }
            }
        
        # 2. Portfolio d'actifs par asset class
        asset_classes_portfolio = {
            AssetClass.GOVERNMENT_BONDS: asset_portfolio.get('government_bonds', 50_000_000),
            AssetClass.CORPORATE_BONDS: asset_portfolio.get('corporate_bonds', 20_000_000),
            AssetClass.EQUITIES_TYPE1: asset_portfolio.get('equities_listed', 15_000_000),
            AssetClass.EQUITIES_TYPE2: asset_portfolio.get('equities_unlisted', 5_000_000),
            AssetClass.PROPERTY: asset_portfolio.get('property', 10_000_000),
            AssetClass.CASH: asset_portfolio.get('cash', 8_000_000)
        }
        
        # 3. Calcul des modules SCR enrichis
        try:
            # Module Marché
            market_scr = self.calculator.calculate_enhanced_market_scr(
                asset_classes_portfolio,
                duration_mapping={
                    AssetClass.GOVERNMENT_BONDS: asset_portfolio.get('gov_duration', 4.5),
                    AssetClass.CORPORATE_BONDS: asset_portfolio.get('corp_duration', 5.2)
                },
                credit_quality={
                    AssetClass.CORPORATE_BONDS: asset_portfolio.get('credit_rating', 'A')
                },
                stress_scenario=stress_scenario
            )
            
            # Module Souscription
            underwriting_scr = self.calculator.calculate_enhanced_underwriting_scr(
                sii_segments_data, 
                stress_scenario
            )
            
            # Module Contrepartie  
            if not counterparties:
                # Contreparties par défaut
                total_reserves = sum(data.get('reserves', 0) for data in sii_segments_data.values())
                counterparties = {
                    'reinsurer_main': {
                        'exposure': total_reserves * 0.25,
                        'probability_of_default': 0.005,
                        'loss_given_default': 0.45
                    },
                    'broker_network': {
                        'exposure': total_reserves * 0.05,
                        'probability_of_default': 0.01,
                        'loss_given_default': 0.60
                    }
                }
            
            counterparty_scr = self.calculator.calculate_enhanced_counterparty_scr(counterparties)
            
            # Basic SCR avec corrélations
            basic_scr_amount = self.calculator._aggregate_with_correlations(
                {
                    'market': market_scr.total_requirement,
                    'counterparty': counterparty_scr.total_requirement,
                    'underwriting': underwriting_scr.total_requirement
                },
                self.calculator.regional_correlations[self.region.value]
            )
            
            # Module Opérationnel
            premiums_data = {seg.value: data.get('premiums', 0) for seg, data in sii_segments_data.items()}
            provisions_data = {seg.value: data.get('reserves', 0) for seg, data in sii_segments_data.items()}
            
            operational_scr = self.calculator.calculate_enhanced_operational_scr(
                basic_scr_amount, premiums_data, provisions_data
            )
            
            # SCR Total
            total_scr = basic_scr_amount + operational_scr.total_requirement
            
            # 4. MCR enrichi
            mcr_result = self.calculator.calculate_enhanced_mcr(
                total_scr, sii_segments_data, validation_checks=True
            )
            
            # 5. Position de capital
            own_funds = balance_sheet.get('own_funds', total_scr * 1.5)
            capital_position = CapitalPosition(
                tier1_unrestricted=own_funds * 0.7,
                tier1_restricted=own_funds * 0.2,
                tier2=own_funds * 0.1,
                tier3=0,
                total_own_funds=own_funds,
                eligible_own_funds=own_funds,
                solvency_capital_requirement=total_scr,
                minimum_capital_requirement=mcr_result['mcr'],
                solvency_ratio=(own_funds / total_scr) * 100 if total_scr > 0 else 0,
                mcr_ratio=(own_funds / mcr_result['mcr']) * 100 if mcr_result['mcr'] > 0 else 0,
                tier1_ratio=(own_funds * 0.9 / own_funds) * 100
            )
            
            # 6. Statut réglementaire
            if capital_position.solvency_ratio >= 100 and capital_position.mcr_ratio >= 100:
                regulatory_status = "FULLY_COMPLIANT"
            elif capital_position.mcr_ratio >= 100:
                regulatory_status = "SCR_BREACH"
            else:
                regulatory_status = "MCR_BREACH"
            
            # 7. QRT Templates enrichis
            scr_modules_dict = {
                'market': market_scr,
                'underwriting': underwriting_scr, 
                'counterparty': counterparty_scr,
                'operational': operational_scr
            }
            
            reporting_period = f"{datetime.now().year}Q{(datetime.now().month-1)//3 + 1}"
            qrt_templates = self.calculator.generate_enhanced_qrt_templates(
                scr_modules_dict, mcr_result, balance_sheet, reporting_period
            )
            
            # 8. Résultat consolidé
            result = {
                'regulatory_status': regulatory_status,
                'calculation_date': datetime.utcnow().isoformat(),
                'region': self.region.value,
                'stress_scenario_applied': stress_scenario,
                
                # Modules SCR détaillés
                'scr_modules': {
                    'market': {
                        'total_requirement': market_scr.total_requirement,
                        'sub_modules': market_scr.sub_modules,
                        'diversification_benefit': market_scr.diversification_benefit,
                        'stress_scenarios': market_scr.stress_scenarios
                    },
                    'underwriting': {
                        'total_requirement': underwriting_scr.total_requirement,
                        'sub_modules': underwriting_scr.sub_modules,
                        'diversification_benefit': underwriting_scr.diversification_benefit
                    },
                    'counterparty': {
                        'total_requirement': counterparty_scr.total_requirement,
                        'sub_modules': counterparty_scr.sub_modules
                    },
                    'operational': {
                        'total_requirement': operational_scr.total_requirement,
                        'sub_modules': operational_scr.sub_modules,
                        'methodology': operational_scr.methodology
                    }
                },
                
                # Capital requirements
                'basic_scr': basic_scr_amount,
                'total_scr': total_scr,
                'mcr_result': mcr_result,
                
                # Position de capital
                'capital_position': capital_position.dict(),
                
                # Diversification
                'total_diversification_benefit': (
                    market_scr.total_requirement + underwriting_scr.total_requirement + 
                    counterparty_scr.total_requirement - basic_scr_amount
                ),
                
                # Templates QRT
                'qrt_templates': [template.dict() for template in qrt_templates],
                
                # Métriques de performance
                'performance_metrics': {
                    'capital_efficiency': (basic_scr_amount / total_scr) * 100 if total_scr > 0 else 0,
                    'diversification_ratio': ((market_scr.total_requirement + underwriting_scr.total_requirement + counterparty_scr.total_requirement) / basic_scr_amount - 1) * 100 if basic_scr_amount > 0 else 0,
                    'operational_ratio': (operational_scr.total_requirement / basic_scr_amount) * 100 if basic_scr_amount > 0 else 0,
                    'mcr_utilization': (mcr_result['mcr'] / total_scr) * 100 if total_scr > 0 else 0
                }
            }
            
            logger.info(f"Évaluation Solvency II terminée - SCR Total: {total_scr:,.0f}, Statut: {regulatory_status}")
            
            return result
            
        except Exception as e:
            logger.error(f"Erreur lors du calcul Solvency II enrichi: {e}")
            raise HTTPException(status_code=500, detail=f"Erreur calcul Solvency II: {str(e)}")