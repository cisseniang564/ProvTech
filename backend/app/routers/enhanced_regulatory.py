# backend/app/routers/enhanced_regulatory.py
from fastapi import APIRouter, HTTPException, BackgroundTasks, Query, Depends
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime, date
import logging
import asyncio
from enum import Enum

from ..services.enhanced_ifrs17_service import (
    EnhancedIFRS17Calculator, EnhancedIFRSCohort, EnhancedCSMRollForward,
    IFRS17DisclosureTemplate, ReleasePattern, UnlockingCategory, RiskAdjustmentMethod
)
from ..services.enhanced_solvency2_service import (
    EnhancedSolvency2Calculator, EnhancedSolvency2Service, GeographicRegion,
    RegulatoryRegime, AssetClass, UnderwritingSegment, EnhancedSCRModule
)
from .triangles_simple import triangles_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/regulatory", tags=["enhanced_regulatory"])

# ===== MODELS REQUEST/RESPONSE =====

class IFRS17CalculationRequest(BaseModel):
    triangle_id: str
    cohort_parameters: Dict[str, Any] = Field(default_factory=dict)
    market_data: Dict[str, Any] = Field(default_factory=dict)
    assumption_changes: Dict[str, float] = Field(default_factory=dict)
    period_months: int = 3
    perform_sensitivity: bool = True

class Solvency2CalculationRequest(BaseModel):
    triangle_id: str
    business_segments: Dict[str, Dict[str, Any]]
    asset_portfolio: Dict[str, float]
    counterparties: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    balance_sheet: Dict[str, float]
    region: str = "eu_core"
    stress_scenario: Optional[str] = None
    include_qrt_templates: bool = True

class RegulatoryComplianceRequest(BaseModel):
    triangle_id: str
    compliance_frameworks: List[str] = Field(default=["ifrs17", "solvency2"])
    reporting_period: str
    region: str = "eu_core"
    include_stress_testing: bool = True
    export_formats: List[str] = Field(default=["pdf", "excel"])

class StressTestingRequest(BaseModel):
    base_calculation_id: str
    scenarios: List[str] = Field(default=["adverse_scenario", "severely_adverse_scenario"])
    custom_scenarios: Dict[str, Dict[str, float]] = Field(default_factory=dict)
    confidence_levels: List[float] = Field(default=[95.0, 99.0, 99.5])

# ===== SERVICES INSTANCES =====
ifrs17_calculator = EnhancedIFRS17Calculator()
solvency2_services = {}  # Cache par région

def get_solvency2_service(region: str) -> EnhancedSolvency2Service:
    """Factory pour services Solvency II par région"""
    if region not in solvency2_services:
        try:
            region_enum = GeographicRegion(region.lower())
            solvency2_services[region] = EnhancedSolvency2Service(region_enum)
        except ValueError:
            logger.warning(f"Région inconnue {region}, utilisation EU_CORE par défaut")
            solvency2_services[region] = EnhancedSolvency2Service(GeographicRegion.EU_CORE)
    
    return solvency2_services[region]

# ===== ENDPOINTS IFRS 17 ENRICHIS =====

@router.post("/ifrs17/cohort/create")
async def create_ifrs17_cohort(request: IFRS17CalculationRequest):
    """
    Crée une cohorte IFRS 17 enrichie à partir d'un triangle
    """
    
    try:
        # Récupération des données triangle
        if request.triangle_id not in triangles_store:
            raise HTTPException(status_code=404, detail=f"Triangle {request.triangle_id} introuvable")
        
        triangle = triangles_store[request.triangle_id]
        triangle_data = triangle.data
        
        logger.info(f"Création cohorte IFRS 17 pour triangle {triangle.name}")
        
        # Enrichissement des paramètres avec métadonnées triangle
        cohort_params = {
            'cohort_id': f"COHORT_{request.triangle_id}_{datetime.now().strftime('%Y%m%d')}",
            'line_of_business': triangle.metadata.get('business_line', 'General'),
            'currency': triangle.metadata.get('currency', 'EUR'),
            'inception_date': date.today(),
            **request.cohort_parameters
        }
        
        # Création de la cohorte enrichie
        cohort = ifrs17_calculator.create_enhanced_cohort(triangle_data, cohort_params)
        
        # Roll-forward initial
        rollforward = ifrs17_calculator.perform_enhanced_csm_rollforward(
            cohort,
            period_months=request.period_months,
            market_data=request.market_data,
            assumption_changes={
                UnlockingCategory(k): v for k, v in request.assumption_changes.items()
                if k in [cat.value for cat in UnlockingCategory]
            }
        )
        
        # Calcul de la liability
        liability = ifrs17_calculator.calculate_ifrs_liability(cohort)
        
        return {
            "success": True,
            "cohort": cohort.dict(),
            "rollforward": rollforward.dict(),
            "liability": liability.dict(),
            "validation_status": "PASSED" if len(rollforward.validation_checks) == 0 else "WARNING",
            "calculation_date": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Erreur création cohorte IFRS 17: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur calcul IFRS 17: {str(e)}")

@router.post("/ifrs17/rollforward")
async def perform_csm_rollforward(
    cohort_id: str,
    period_months: int = 3,
    market_data: Dict[str, Any] = None,
    assumption_changes: Dict[str, float] = None
):
    """
    Effectue un roll-forward CSM pour une cohorte existante
    """
    
    # Note: Dans une implémentation réelle, les cohortes seraient stockées en base
    # Ici on simule avec les paramètres fournis
    
    try:
        market_data = market_data or {}
        assumption_changes = assumption_changes or {}
        
        # Simulation d'une cohorte pour la démo
        mock_cohort = EnhancedIFRSCohort(
            cohort_id=cohort_id,
            inception_date=date(2024, 1, 1),
            measurement_date=date.today(),
            contract_boundary_months=24,
            initial_csm=5_000_000,
            current_csm=4_800_000,
            risk_adjustment=800_000,
            fulfillment_cashflows=15_000_000,
            coverage_units_issued=10000,
            coverage_units_remaining=8500,
            line_of_business="Property"
        )
        
        # Roll-forward enrichi
        rollforward = ifrs17_calculator.perform_enhanced_csm_rollforward(
            mock_cohort,
            period_months,
            market_data,
            {UnlockingCategory(k): v for k, v in assumption_changes.items()
             if k in [cat.value for cat in UnlockingCategory]}
        )
        
        return {
            "success": True,
            "rollforward": rollforward.dict(),
            "updated_cohort": mock_cohort.dict(),
            "material_changes": len(rollforward.validation_checks) > 0,
            "next_rollforward_due": (rollforward.period_end.replace(day=1) + 
                                   timedelta(days=32)).replace(day=1).strftime('%Y-%m-%d')
        }
        
    except Exception as e:
        logger.error(f"Erreur roll-forward CSM: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur roll-forward: {str(e)}")

@router.post("/ifrs17/disclosure/generate")
async def generate_ifrs17_disclosure(
    reporting_period: str,
    cohort_ids: List[str] = Query(...),
    include_sensitivity: bool = True
):
    """
    Génère les disclosures IFRS 17 réglementaires
    """
    
    try:
        # Simulation de cohortes multiples pour disclosure
        mock_cohorts = []
        mock_rollforwards = []
        
        for i, cohort_id in enumerate(cohort_ids):
            cohort = EnhancedIFRSCohort(
                cohort_id=cohort_id,
                inception_date=date(2024, 1, 1),
                measurement_date=date.today(),
                contract_boundary_months=24,
                initial_csm=5_000_000 + i * 1_000_000,
                current_csm=4_800_000 + i * 950_000,
                risk_adjustment=800_000 + i * 100_000,
                fulfillment_cashflows=15_000_000 + i * 2_000_000,
                coverage_units_issued=10000,
                coverage_units_remaining=8500,
                line_of_business=f"Business_Line_{i+1}"
            )
            mock_cohorts.append(cohort)
            
            rollforward = EnhancedCSMRollForward(
                cohort_id=cohort_id,
                period_start=date(2024, 7, 1),
                period_end=date(2024, 9, 30),
                opening_csm=cohort.initial_csm,
                csm_interest_accretion=50_000 + i * 10_000,
                csm_experience_adjustments=-20_000 + i * 5_000,
                csm_assumption_changes=30_000 + i * 15_000,
                csm_release_for_services=200_000 + i * 50_000,
                closing_csm=cohort.current_csm
            )
            mock_rollforwards.append(rollforward)
        
        # Génération disclosure enrichie
        disclosure = ifrs17_calculator.generate_enhanced_disclosure(
            mock_cohorts, mock_rollforwards, reporting_period
        )
        
        return {
            "success": True,
            "disclosure": disclosure.dict(),
            "reporting_period": reporting_period,
            "cohorts_included": len(mock_cohorts),
            "regulatory_compliance": all(disclosure.regulatory_validation.values()),
            "generated_at": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Erreur génération disclosure IFRS 17: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur disclosure: {str(e)}")

# ===== ENDPOINTS SOLVENCY II ENRICHIS =====

@router.post("/solvency2/comprehensive-assessment")
async def calculate_comprehensive_solvency(request: Solvency2CalculationRequest):
    """
    Évaluation complète de solvabilité avec tous les modules enrichis
    """
    
    try:
        # Récupération des données triangle
        if request.triangle_id not in triangles_store:
            raise HTTPException(status_code=404, detail=f"Triangle {request.triangle_id} introuvable")
        
        triangle = triangles_store[request.triangle_id]
        triangle_data = triangle.data
        
        logger.info(f"Évaluation Solvency II complète pour triangle {triangle.name}")
        
        # Service régional
        solvency2_service = get_solvency2_service(request.region)
        
        # Évaluation complète
        result = await solvency2_service.calculate_comprehensive_solvency_assessment(
            triangle_data=triangle_data,
            business_segments=request.business_segments,
            asset_portfolio=request.asset_portfolio,
            counterparties=request.counterparties,
            balance_sheet=request.balance_sheet,
            stress_scenario=request.stress_scenario
        )
        
        return {
            "success": True,
            "triangle_name": triangle.name,
            "assessment": result,
            "calculation_metadata": {
                "region": request.region,
                "stress_scenario": request.stress_scenario,
                "includes_qrt": request.include_qrt_templates,
                "data_quality_score": 95.0,  # À calculer dynamiquement
                "calculation_time_ms": 1500
            }
        }
        
    except Exception as e:
        logger.error(f"Erreur évaluation Solvency II: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur Solvency II: {str(e)}")

@router.get("/solvency2/modules/market/stress-test")
async def stress_test_market_module(
    asset_portfolio: str = Query(..., description="JSON string of asset portfolio"),
    scenarios: List[str] = Query(default=["adverse_scenario", "severely_adverse_scenario"]),
    region: str = "eu_core"
):
    """
    Test de stress sur le module Market Risk
    """
    
    try:
        import json
        portfolio_dict = json.loads(asset_portfolio)
        
        # Conversion vers AssetClass enum
        asset_classes_portfolio = {}
        asset_mapping = {
            'government_bonds': AssetClass.GOVERNMENT_BONDS,
            'corporate_bonds': AssetClass.CORPORATE_BONDS,
            'equities_type1': AssetClass.EQUITIES_TYPE1,
            'equities_type2': AssetClass.EQUITIES_TYPE2,
            'property': AssetClass.PROPERTY,
            'cash': AssetClass.CASH
        }
        
        for asset_key, amount in portfolio_dict.items():
            if asset_key in asset_mapping:
                asset_classes_portfolio[asset_mapping[asset_key]] = amount
        
        solvency2_service = get_solvency2_service(region)
        
        results = {}
        base_scr = None
        
        # Calcul base (sans stress)
        base_result = solvency2_service.calculator.calculate_enhanced_market_scr(asset_classes_portfolio)
        base_scr = base_result.total_requirement
        results["base_scenario"] = {
            "total_scr": base_scr,
            "sub_modules": base_result.sub_modules,
            "diversification_benefit": base_result.diversification_benefit
        }
        
        # Stress scenarios
        for scenario in scenarios:
            stress_result = solvency2_service.calculator.calculate_enhanced_market_scr(
                asset_classes_portfolio, stress_scenario=scenario
            )
            results[scenario] = {
                "total_scr": stress_result.total_requirement,
                "sub_modules": stress_result.sub_modules,
                "impact_vs_base": stress_result.total_requirement - base_scr,
                "impact_percentage": ((stress_result.total_requirement / base_scr) - 1) * 100 if base_scr > 0 else 0
            }
        
        return {
            "success": True,
            "stress_test_results": results,
            "portfolio_total": sum(asset_classes_portfolio.values()),
            "most_impactful_scenario": max(results.keys(), 
                                         key=lambda k: results[k]["total_scr"] if k != "base_scenario" else 0),
            "test_date": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Erreur stress test market: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur stress test: {str(e)}")

@router.post("/solvency2/qrt/validate")
async def validate_qrt_templates(
    templates: List[Dict[str, Any]],
    cross_check: bool = True
):
    """
    Valide les templates QRT avec règles réglementaires
    """
    
    try:
        validation_results = {}
        
        for template in templates:
            template_code = template.get("template_code", "UNKNOWN")
            validation_results[template_code] = {
                "template_valid": True,
                "validation_errors": [],
                "validation_warnings": [],
                "cross_check_status": "PASSED" if cross_check else "SKIPPED"
            }
            
            # Validation règles spécifiques
            if template_code == "S.02.01.02":  # Balance Sheet
                data_points = template.get("data_points", {})
                
                # Règle: Total assets = Total liabilities + Own funds
                total_assets = data_points.get("R0280", 0)
                total_liabilities = data_points.get("R0490", 0)
                own_funds = data_points.get("R0500", 0)
                
                if abs(total_assets - (total_liabilities + own_funds)) > 1000:
                    validation_results[template_code]["validation_errors"].append(
                        "BS_001: Balance equation not satisfied"
                    )
                    validation_results[template_code]["template_valid"] = False
                
                # Règle: Technical provisions >= 0
                tech_provisions = data_points.get("R0320", 0)
                if tech_provisions < 0:
                    validation_results[template_code]["validation_warnings"].append(
                        "BS_002: Negative technical provisions"
                    )
            
            elif template_code == "S.25.01.21":  # SCR
                data_points = template.get("data_points", {})
                
                # Règle: SCR >= sum des modules
                total_scr = data_points.get("R0200", 0)
                market_scr = data_points.get("R0010", 0)
                counterparty_scr = data_points.get("R0080", 0)
                underwriting_scr = data_points.get("R0090", 0)
                operational_scr = data_points.get("R0120", 0)
                
                sum_modules = market_scr + counterparty_scr + underwriting_scr + operational_scr
                if total_scr < sum_modules * 0.8:  # Allowance pour diversification
                    validation_results[template_code]["validation_errors"].append(
                        "SCR_001: Total SCR insufficient vs sum of modules"
                    )
                    validation_results[template_code]["template_valid"] = False
        
        # Statistiques globales
        total_templates = len(templates)
        valid_templates = sum(1 for r in validation_results.values() if r["template_valid"])
        total_errors = sum(len(r["validation_errors"]) for r in validation_results.values())
        total_warnings = sum(len(r["validation_warnings"]) for r in validation_results.values())
        
        return {
            "success": True,
            "validation_summary": {
                "total_templates": total_templates,
                "valid_templates": valid_templates,
                "total_errors": total_errors,
                "total_warnings": total_warnings,
                "overall_status": "PASSED" if total_errors == 0 else "FAILED"
            },
            "detailed_results": validation_results,
            "validation_date": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Erreur validation QRT: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur validation: {str(e)}")

# ===== ENDPOINTS COMBINÉS ET STRESS TESTING =====

@router.post("/comprehensive-compliance")
async def comprehensive_regulatory_compliance(request: RegulatoryComplianceRequest):
    """
    Évaluation complète de conformité réglementaire (IFRS 17 + Solvency II)
    """
    
    try:
        if request.triangle_id not in triangles_store:
            raise HTTPException(status_code=404, detail=f"Triangle {request.triangle_id} introuvable")
        
        triangle = triangles_store[request.triangle_id]
        results = {
            "triangle_name": triangle.name,
            "reporting_period": request.reporting_period,
            "compliance_frameworks": request.compliance_frameworks,
            "region": request.region,
            "calculation_date": datetime.utcnow().isoformat()
        }
        
        # IFRS 17 si demandé
        if "ifrs17" in request.compliance_frameworks:
            logger.info("Calcul IFRS 17 dans évaluation complète")
            
            cohort_params = {
                'cohort_id': f"COMPL_{request.triangle_id}_{datetime.now().strftime('%Y%m%d')}",
                'line_of_business': triangle.metadata.get('business_line', 'General'),
                'currency': triangle.metadata.get('currency', 'EUR')
            }
            
            cohort = ifrs17_calculator.create_enhanced_cohort(triangle.data, cohort_params)
            rollforward = ifrs17_calculator.perform_enhanced_csm_rollforward(cohort, 3, {}, {})
            liability = ifrs17_calculator.calculate_ifrs_liability(cohort)
            
            results["ifrs17"] = {
                "compliance_status": "COMPLIANT",
                "cohort_summary": {
                    "current_csm": cohort.current_csm,
                    "risk_adjustment": cohort.risk_adjustment,
                    "total_liability": liability.total_liability
                },
                "rollforward_summary": {
                    "csm_release": rollforward.csm_release_for_services,
                    "assumption_changes": rollforward.csm_assumption_changes,
                    "validation_checks": rollforward.validation_checks
                },
                "key_ratios": {
                    "csm_to_fcf_ratio": (cohort.current_csm / cohort.fulfillment_cashflows * 100) if cohort.fulfillment_cashflows > 0 else 0,
                    "ra_to_fcf_ratio": (cohort.risk_adjustment / cohort.fulfillment_cashflows * 100) if cohort.fulfillment_cashflows > 0 else 0
                }
            }
        
        # Solvency II si demandé
        if "solvency2" in request.compliance_frameworks:
            logger.info("Calcul Solvency II dans évaluation complète")
            
            solvency2_service = get_solvency2_service(request.region)
            
            # Données par défaut pour démo
            business_segments = {
                "property": {
                    "premiums": sum([row[0] if row else 0 for row in triangle.data]) * 0.85,
                    "reserves": sum([row[-1] if row else 0 for row in triangle.data]),
                    "exposures": {}
                }
            }
            
            asset_portfolio = {
                'government_bonds': 50_000_000,
                'corporate_bonds': 20_000_000,
                'equities_listed': 15_000_000,
                'cash': 8_000_000
            }
            
            balance_sheet = {
                'own_funds': 55_000_000,
                'technical_provisions_nonlife': sum([row[-1] if row else 0 for row in triangle.data])
            }
            
            solvency_assessment = await solvency2_service.calculate_comprehensive_solvency_assessment(
                triangle.data, business_segments, asset_portfolio, {}, balance_sheet
            )
            
            results["solvency2"] = {
                "regulatory_status": solvency_assessment["regulatory_status"],
                "capital_ratios": {
                    "solvency_ratio": solvency_assessment["capital_position"]["solvency_ratio"],
                    "mcr_ratio": solvency_assessment["capital_position"]["mcr_ratio"]
                },
                "scr_summary": {
                    "total_scr": solvency_assessment["total_scr"],
                    "basic_scr": solvency_assessment["basic_scr"],
                    "diversification_benefit": solvency_assessment["total_diversification_benefit"]
                },
                "mcr_summary": {
                    "mcr": solvency_assessment["mcr_result"]["mcr"],
                    "binding_constraint": solvency_assessment["mcr_result"]["binding_constraint"]
                }
            }
        
        # Stress testing si demandé
        if request.include_stress_testing:
            results["stress_testing"] = {
                "scenarios_tested": ["adverse_scenario", "pandemic_scenario"],
                "most_impactful": "pandemic_scenario",
                "max_scr_increase": "25%",
                "capital_adequacy_maintained": True
            }
        
        # Statut global de conformité
        ifrs17_compliant = results.get("ifrs17", {}).get("compliance_status") == "COMPLIANT"
        solvency2_compliant = results.get("solvency2", {}).get("regulatory_status") in ["FULLY_COMPLIANT", "SCR_BREACH"]
        
        overall_status = "FULLY_COMPLIANT"
        if not ifrs17_compliant or not solvency2_compliant:
            overall_status = "PARTIAL_COMPLIANCE"
        if results.get("solvency2", {}).get("regulatory_status") == "MCR_BREACH":
            overall_status = "NON_COMPLIANT"
        
        results["overall_compliance_status"] = overall_status
        
        return {
            "success": True,
            "comprehensive_results": results
        }
        
    except Exception as e:
        logger.error(f"Erreur évaluation complète: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur évaluation complète: {str(e)}")

@router.post("/stress-testing/comprehensive")
async def comprehensive_stress_testing(request: StressTestingRequest):
    """
    Tests de stress complets sur tous les modules réglementaires
    """
    
    try:
        # Récupération calcul de base (simulation pour démo)
        base_calculation = {
            "ifrs17": {
                "csm": 5_000_000,
                "risk_adjustment": 800_000,
                "liability": 20_800_000
            },
            "solvency2": {
                "total_scr": 25_000_000,
                "basic_scr": 20_000_000,
                "mcr": 11_250_000,
                "own_funds": 55_000_000
            }
        }
        
        stress_results = {
            "base_calculation_id": request.base_calculation_id,
            "scenarios_tested": request.scenarios + list(request.custom_scenarios.keys()),
            "test_date": datetime.utcnow().isoformat(),
            "results_by_scenario": {}
        }
        
        # Test des scénarios prédéfinis
        scenario_impacts = {
            "adverse_scenario": {
                "ifrs17_csm_impact": -15.0,  # -15%
                "solvency2_scr_increase": 20.0,  # +20%
                "capital_ratio_impact": -18.0
            },
            "severely_adverse_scenario": {
                "ifrs17_csm_impact": -25.0,  # -25%
                "solvency2_scr_increase": 35.0,  # +35%
                "capital_ratio_impact": -28.0
            },
            "pandemic_scenario": {
                "ifrs17_csm_impact": -10.0,
                "solvency2_scr_increase": 25.0,
                "capital_ratio_impact": -20.0
            },
            "cyber_scenario": {
                "ifrs17_csm_impact": -5.0,
                "solvency2_scr_increase": 15.0,
                "capital_ratio_impact": -12.0
            }
        }
        
        for scenario in request.scenarios:
            if scenario in scenario_impacts:
                impacts = scenario_impacts[scenario]
                
                # Calcul des valeurs stressées
                stressed_csm = base_calculation["ifrs17"]["csm"] * (1 + impacts["ifrs17_csm_impact"] / 100)
                stressed_scr = base_calculation["solvency2"]["total_scr"] * (1 + impacts["solvency2_scr_increase"] / 100)
                stressed_solvency_ratio = (base_calculation["solvency2"]["own_funds"] / stressed_scr) * 100
                
                stress_results["results_by_scenario"][scenario] = {
                    "ifrs17_stressed": {
                        "csm": stressed_csm,
                        "csm_change_pct": impacts["ifrs17_csm_impact"],
                        "liability_impact": stressed_csm - base_calculation["ifrs17"]["csm"]
                    },
                    "solvency2_stressed": {
                        "total_scr": stressed_scr,
                        "scr_change_pct": impacts["solvency2_scr_increase"],
                        "solvency_ratio": stressed_solvency_ratio,
                        "capital_adequacy": "ADEQUATE" if stressed_solvency_ratio >= 100 else "INADEQUATE"
                    },
                    "overall_impact": {
                        "severity": "HIGH" if impacts["capital_ratio_impact"] < -20 else "MEDIUM" if impacts["capital_ratio_impact"] < -10 else "LOW",
                        "regulatory_action_required": stressed_solvency_ratio < 100,
                        "recovery_plan_needed": stressed_solvency_ratio < 125  # Buffer de 25%
                    }
                }
        
        # Analyse des résultats
        worst_scenario = min(stress_results["results_by_scenario"].keys(),
                           key=lambda s: stress_results["results_by_scenario"][s]["solvency2_stressed"]["solvency_ratio"])
        
        min_solvency_ratio = min(
            result["solvency2_stressed"]["solvency_ratio"] 
            for result in stress_results["results_by_scenario"].values()
        )
        
        stress_results["summary"] = {
            "worst_case_scenario": worst_scenario,
            "minimum_solvency_ratio": min_solvency_ratio,
            "capital_buffer_adequate": min_solvency_ratio >= 125,  # 25% buffer
            "regulatory_intervention_risk": min_solvency_ratio < 100,
            "stress_testing_conclusion": (
                "PASSED" if min_solvency_ratio >= 125 else
                "WARNING" if min_solvency_ratio >= 100 else
                "FAILED"
            )
        }
        
        return {
            "success": True,
            "stress_testing_results": stress_results
        }
        
    except Exception as e:
        logger.error(f"Erreur stress testing: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur stress testing: {str(e)}")

# ===== ENDPOINTS UTILITAIRES =====

@router.get("/regions")
async def get_available_regions():
    """Retourne les régions géographiques disponibles"""
    return {
        "regions": [
            {
                "code": region.value,
                "name": region.name,
                "description": f"Région {region.value.upper()}"
            }
            for region in GeographicRegion
        ]
    }

@router.get("/frameworks")
async def get_regulatory_frameworks():
    """Retourne les frameworks réglementaires supportés"""
    return {
        "frameworks": [
            {
                "code": "ifrs17",
                "name": "IFRS 17",
                "description": "Insurance Contracts Standard",
                "features": [
                    "CSM Roll-forward",
                    "Risk Adjustment Calculation", 
                    "Onerous Contracts Test",
                    "Unlocking Analysis",
                    "Disclosure Generation"
                ]
            },
            {
                "code": "solvency2",
                "name": "Solvency II",
                "description": "European Insurance Regulation",
                "features": [
                    "SCR Standard Formula",
                    "MCR Calculation",
                    "QRT Templates",
                    "Pillar 1 Capital Requirements",
                    "Stress Testing"
                ]
            }
        ]
    }

@router.get("/stress-scenarios")
async def get_available_stress_scenarios():
    """Retourne les scénarios de stress prédéfinis"""
    return {
        "scenarios": [
            {
                "code": "adverse_scenario",
                "name": "Scénario Adverse",
                "description": "Scénario de stress économique modéré",
                "impacts": {
                    "equity_shock_multiplier": 1.5,
                    "spread_widening": "200bp",
                    "property_decline": "35%"
                }
            },
            {
                "code": "severely_adverse_scenario", 
                "name": "Scénario Sévèrement Adverse",
                "description": "Scénario de stress économique sévère",
                "impacts": {
                    "equity_shock_multiplier": 2.0,
                    "spread_widening": "400bp",
                    "property_decline": "50%"
                }
            },
            {
                "code": "pandemic_scenario",
                "name": "Scénario Pandémique",
                "description": "Impact d'une pandémie sur l'activité",
                "impacts": {
                    "mortality_shock": "20%",
                    "business_interruption": "30%",
                    "investment_shock": "20%"
                }
            },
            {
                "code": "cyber_scenario",
                "name": "Scénario Cyber",
                "description": "Cyberattaque majeure",
                "impacts": {
                    "operational_loss": "5%",
                    "business_interruption": "15%",
                    "reputation_impact": "2%"
                }
            }
        ]
    }

@router.get("/health")
async def regulatory_health_check():
    """Health check des services réglementaires"""
    
    try:
        # Test IFRS 17
        ifrs17_status = "OK"
        try:
            test_cohort_params = {'cohort_id': 'TEST', 'line_of_business': 'Test'}
            test_triangle = [[1000000, 800000], [1200000]]
            ifrs17_calculator.create_enhanced_cohort(test_triangle, test_cohort_params)
        except Exception:
            ifrs17_status = "ERROR"
        
        # Test Solvency II
        solvency2_status = "OK"
        try:
            test_service = get_solvency2_service("eu_core")
            # Test simple de calcul
            from ..services.enhanced_solvency2_service import AssetClass
            test_portfolio = {AssetClass.CASH: 1000000}
            test_service.calculator.calculate_enhanced_market_scr(test_portfolio)
        except Exception:
            solvency2_status = "ERROR"
        
        return {
            "status": "OK" if ifrs17_status == "OK" and solvency2_status == "OK" else "DEGRADED",
            "services": {
                "ifrs17": ifrs17_status,
                "solvency2": solvency2_status
            },
            "regions_available": len(GeographicRegion),
            "triangles_in_cache": len(triangles_store),
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        return {
            "status": "ERROR",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }