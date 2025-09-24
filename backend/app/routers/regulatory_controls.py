# backend/app/routers/regulatory_controls.py
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, validator
from enum import Enum
import numpy as np
import logging
import uuid
import asyncio
from concurrent.futures import ThreadPoolExecutor
import json

from ..main import verify_token, find_user_by_id, log_audit

router = APIRouter(prefix="/api/v1/regulatory-controls", tags=["Contrôles Réglementaires"])
logger = logging.getLogger("regulatory_controls")

# ===== MODÈLES PYDANTIC =====

class ControlType(str, Enum):
    IFRS17_SOLVENCY2_RECONCILIATION = "ifrs17_solvency2_reconciliation"
    MARKET_BENCHMARK = "market_benchmark"
    BACKTEST_VALIDATION = "backtest_validation"
    CROSS_VALIDATION = "cross_validation"
    PLAUSIBILITY_CHECK = "plausibility_check"
    STATISTICAL_COHERENCE = "statistical_coherence"
    REGULATORY_THRESHOLD = "regulatory_threshold"

class AlertLevel(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"
    BLOCKING = "blocking"

class ControlRequest(BaseModel):
    calculationId: str
    triangleId: str
    controlTypes: List[ControlType]
    benchmarkData: Optional[Dict[str, Any]] = {}
    thresholds: Optional[Dict[str, float]] = {}

class ThresholdAlert(BaseModel):
    metric: str
    current_value: float
    threshold_value: float
    deviation_percent: float
    alert_level: AlertLevel
    description: str
    recommendations: List[str]

class ControlResult(BaseModel):
    controlType: ControlType
    status: str  # passed, warning, failed
    score: float  # 0-100
    details: Dict[str, Any]
    alerts: List[ThresholdAlert]
    execution_time: float

# ===== BASE DE DONNÉES SIMULÉE =====

CONTROL_EXECUTIONS = []
ALERT_HISTORY = []
BENCHMARK_DATA = {
    "rc_automobile": {
        "loss_ratio_range": [0.65, 0.85],
        "combined_ratio_range": [0.95, 1.10],
        "development_factors": {
            "12_24": [1.35, 1.55],
            "24_36": [1.15, 1.35],
            "36_48": [1.05, 1.15]
        },
        "ultimate_variation": [-0.05, 0.10],
        "market_data_source": "France Assureurs - Statistiques 2024"
    },
    "dab": {
        "loss_ratio_range": [0.55, 0.75],
        "combined_ratio_range": [0.85, 1.05],
        "development_factors": {
            "12_24": [1.25, 1.45],
            "24_36": [1.10, 1.25],
            "36_48": [1.02, 1.08]
        },
        "ultimate_variation": [-0.03, 0.08],
        "market_data_source": "ACPR - Bulletin Statistique"
    }
}

REGULATORY_THRESHOLDS = {
    "solvency_ratio_minimum": 100.0,
    "solvency_ratio_warning": 120.0,
    "mcr_coverage_minimum": 100.0,
    "technical_provisions_variation_max": 0.15,  # 15%
    "loss_ratio_ceiling": 1.20,
    "combined_ratio_ceiling": 1.30,
    "r2_minimum": 0.70,
    "mape_maximum": 0.25,
    "coefficient_variation_max": 0.30
}

# ===== UTILITAIRES DE CALCUL =====

def fetch_calculation_for_control(calculation_id: str) -> Dict[str, Any]:
    """Récupérer données de calcul pour contrôles (utilise vos APIs)"""
    # Simulation basée sur vos structures existantes
    return {
        "id": calculation_id,
        "triangle_id": f"triangle_{calculation_id}",
        "triangle_name": "RC Automobile 2024",
        "methods": [
            {
                "id": "chain_ladder",
                "name": "Chain Ladder",
                "ultimate": 12500000,
                "reserves": 3200000,
                "paid_to_date": 9300000,
                "development_factors": [1.45, 1.22, 1.08, 1.03, 1.01],
                "diagnostics": {"r2": 0.94, "mape": 0.08, "rmse": 0.15}
            },
            {
                "id": "bornhuetter_ferguson",
                "name": "Bornhuetter-Ferguson", 
                "ultimate": 12800000,
                "reserves": 3350000,
                "paid_to_date": 9450000,
                "development_factors": [1.42, 1.20, 1.07, 1.02, 1.01],
                "diagnostics": {"r2": 0.91, "mape": 0.12, "rmse": 0.18}
            }
        ],
        "summary": {
            "best_estimate": 12650000,
            "range": {"min": 11800000, "max": 13500000},
            "confidence": 92.5,
            "convergence": True
        },
        "metadata": {
            "currency": "EUR",
            "business_line": "rc_automobile",
            "data_points": 120,
            "calculation_date": "2024-12-01",
            "premiums_written": 15000000,
            "claims_paid": 9375000
        },
        "previous_calculation": {
            "id": f"prev_{calculation_id}",
            "best_estimate": 12100000,
            "calculation_date": "2024-09-01"
        }
    }

def calculate_ifrs17_solvency2_reconciliation(calculation_data: Dict) -> Dict[str, Any]:
    """Réconciliation IFRS 17 <-> Solvency II"""
    
    # IFRS 17 components
    best_estimate_ifrs17 = calculation_data["summary"]["best_estimate"]
    risk_adjustment = best_estimate_ifrs17 * 0.08  # 8% RA
    csm = 0  # Pour sinistres, CSM = 0
    
    # Solvency II components  
    best_estimate_s2 = best_estimate_ifrs17 * 0.98  # Légères différences méthodologiques
    risk_margin_s2 = best_estimate_s2 * 0.06  # 6% RM vs 8% RA
    
    # Calculs de réconciliation
    total_ifrs17 = best_estimate_ifrs17 + risk_adjustment + csm
    total_s2 = best_estimate_s2 + risk_margin_s2
    
    difference_absolute = abs(total_ifrs17 - total_s2)
    difference_relative = (difference_absolute / total_ifrs17) * 100
    
    # Analyse des écarts
    reconciliation_items = [
        {
            "item": "Best Estimate", 
            "ifrs17": best_estimate_ifrs17,
            "solvency2": best_estimate_s2,
            "difference": best_estimate_ifrs17 - best_estimate_s2,
            "explanation": "Différences de méthodologie d'actualisation"
        },
        {
            "item": "Risk Adjustment / Risk Margin",
            "ifrs17": risk_adjustment,
            "solvency2": risk_margin_s2,
            "difference": risk_adjustment - risk_margin_s2,
            "explanation": "RA niveau 75% vs RM coût du capital 6%"
        }
    ]
    
    # Status de conformité
    conformity_status = "passed" if difference_relative < 5.0 else "warning" if difference_relative < 10.0 else "failed"
    
    return {
        "total_ifrs17": total_ifrs17,
        "total_solvency2": total_s2,
        "difference_absolute": difference_absolute,
        "difference_relative": difference_relative,
        "conformity_status": conformity_status,
        "reconciliation_items": reconciliation_items,
        "recommendations": [
            "Harmoniser les courbes d'actualisation",
            "Documenter les écarts méthodologiques",
            "Validation croisée des ajustements pour risque"
        ] if difference_relative > 5.0 else ["Réconciliation satisfaisante"]
    }

def perform_market_benchmark(calculation_data: Dict) -> Dict[str, Any]:
    """Comparaison avec benchmarks marché"""
    
    business_line = calculation_data["metadata"]["business_line"]
    benchmark = BENCHMARK_DATA.get(business_line, BENCHMARK_DATA["rc_automobile"])
    
    # Métriques calculées
    premiums = calculation_data["metadata"]["premiums_written"]
    claims_paid = calculation_data["metadata"]["claims_paid"]
    ultimate = calculation_data["summary"]["best_estimate"]
    
    loss_ratio = claims_paid / premiums if premiums > 0 else 0
    ultimate_loss_ratio = ultimate / premiums if premiums > 0 else 0
    combined_ratio = ultimate_loss_ratio + 0.25  # 25% frais estimés
    
    # Facteurs de développement moyens
    dev_factors_12_24 = np.mean([m["development_factors"][0] for m in calculation_data["methods"]])
    dev_factors_24_36 = np.mean([m["development_factors"][1] for m in calculation_data["methods"]])
    
    # Comparaisons avec benchmarks
    comparisons = [
        {
            "metric": "Loss Ratio",
            "calculated_value": loss_ratio,
            "market_range": benchmark["loss_ratio_range"],
            "in_range": benchmark["loss_ratio_range"][0] <= loss_ratio <= benchmark["loss_ratio_range"][1],
            "deviation": ((loss_ratio - np.mean(benchmark["loss_ratio_range"])) / np.mean(benchmark["loss_ratio_range"])) * 100
        },
        {
            "metric": "Combined Ratio", 
            "calculated_value": combined_ratio,
            "market_range": benchmark["combined_ratio_range"],
            "in_range": benchmark["combined_ratio_range"][0] <= combined_ratio <= benchmark["combined_ratio_range"][1],
            "deviation": ((combined_ratio - np.mean(benchmark["combined_ratio_range"])) / np.mean(benchmark["combined_ratio_range"])) * 100
        },
        {
            "metric": "Facteur 12-24 mois",
            "calculated_value": dev_factors_12_24,
            "market_range": benchmark["development_factors"]["12_24"],
            "in_range": benchmark["development_factors"]["12_24"][0] <= dev_factors_12_24 <= benchmark["development_factors"]["12_24"][1],
            "deviation": ((dev_factors_12_24 - np.mean(benchmark["development_factors"]["12_24"])) / np.mean(benchmark["development_factors"]["12_24"])) * 100
        }
    ]
    
    # Score global de conformité marché
    in_range_count = sum(1 for comp in comparisons if comp["in_range"])
    market_conformity_score = (in_range_count / len(comparisons)) * 100
    
    return {
        "benchmark_source": benchmark["market_data_source"],
        "comparisons": comparisons,
        "market_conformity_score": market_conformity_score,
        "status": "passed" if market_conformity_score >= 80 else "warning" if market_conformity_score >= 60 else "failed",
        "outliers": [comp for comp in comparisons if not comp["in_range"]],
        "recommendations": [
            f"Investiguer l'écart sur {comp['metric']}: {comp['deviation']:.1f}% vs marché"
            for comp in comparisons if not comp["in_range"]
        ]
    }

def perform_backtest_validation(calculation_data: Dict) -> Dict[str, Any]:
    """Tests de back-testing sur données historiques"""
    
    # Simulation de données historiques
    historical_periods = []
    base_ultimate = calculation_data["summary"]["best_estimate"]
    
    for i in range(5):  # 5 périodes historiques
        period_date = datetime.now() - timedelta(days=90 * (i + 1))
        predicted_ultimate = base_ultimate * (1 + np.random.normal(0, 0.1))
        actual_ultimate = base_ultimate * (1 + np.random.normal(0, 0.08))
        
        historical_periods.append({
            "period": period_date.strftime("%Y-Q%d" % ((period_date.month - 1) // 3 + 1)),
            "predicted_ultimate": predicted_ultimate,
            "actual_ultimate": actual_ultimate,
            "prediction_error": abs(predicted_ultimate - actual_ultimate) / actual_ultimate * 100,
            "bias": (predicted_ultimate - actual_ultimate) / actual_ultimate * 100
        })
    
    # Analyse statistique
    errors = [p["prediction_error"] for p in historical_periods]
    biases = [p["bias"] for p in historical_periods]
    
    mean_error = np.mean(errors)
    mean_bias = np.mean(biases)
    std_error = np.std(errors)
    
    # Tests statistiques simulés
    statistical_tests = [
        {
            "test_name": "Test de biais (t-test)",
            "p_value": 0.15,
            "passed": True,
            "interpretation": "Pas de biais systématique détecté"
        },
        {
            "test_name": "Test de stabilité (Ljung-Box)", 
            "p_value": 0.08,
            "passed": True,
            "interpretation": "Erreurs non autocorrélées"
        },
        {
            "test_name": "Test de normalité (Shapiro-Wilk)",
            "p_value": 0.12,
            "passed": True,
            "interpretation": "Distribution des erreurs acceptable"
        }
    ]
    
    # Score de back-testing
    passed_tests = sum(1 for test in statistical_tests if test["passed"])
    backtest_score = (passed_tests / len(statistical_tests)) * 100
    
    if mean_error < 5.0:
        backtest_score *= 1.0
    elif mean_error < 10.0:
        backtest_score *= 0.8
    else:
        backtest_score *= 0.6
    
    return {
        "historical_periods": historical_periods,
        "summary_statistics": {
            "mean_error_percent": mean_error,
            "mean_bias_percent": mean_bias,
            "error_volatility": std_error,
            "periods_analyzed": len(historical_periods)
        },
        "statistical_tests": statistical_tests,
        "backtest_score": backtest_score,
        "status": "passed" if backtest_score >= 75 else "warning" if backtest_score >= 60 else "failed",
        "recommendations": [
            "Améliorer la calibration des modèles" if mean_error > 10 else "Précision satisfaisante",
            "Surveiller le biais positif" if mean_bias > 5 else "Biais acceptable",
            "Revoir la méthodologie" if backtest_score < 60 else "Validation historique satisfaisante"
        ]
    }

def check_regulatory_thresholds(calculation_data: Dict) -> List[ThresholdAlert]:
    """Vérification des seuils réglementaires"""
    
    alerts = []
    
    # Calculs des métriques
    ultimate = calculation_data["summary"]["best_estimate"]
    premiums = calculation_data["metadata"]["premiums_written"]
    previous_ultimate = calculation_data.get("previous_calculation", {}).get("best_estimate", ultimate)
    
    # Métriques calculées
    loss_ratio = ultimate / premiums if premiums > 0 else 0
    combined_ratio = loss_ratio + 0.25  # 25% frais estimés
    ultimate_variation = abs(ultimate - previous_ultimate) / previous_ultimate if previous_ultimate > 0 else 0
    
    # Qualité statistique moyenne
    avg_r2 = np.mean([m["diagnostics"]["r2"] for m in calculation_data["methods"]])
    avg_mape = np.mean([m["diagnostics"]["mape"] for m in calculation_data["methods"]])
    
    # Seuils à vérifier
    threshold_checks = [
        {
            "metric": "Loss Ratio",
            "current_value": loss_ratio,
            "threshold_value": REGULATORY_THRESHOLDS["loss_ratio_ceiling"],
            "comparison": "<=",
            "description": "Ratio sinistres/primes doit rester sous contrôle"
        },
        {
            "metric": "Combined Ratio",
            "current_value": combined_ratio,
            "threshold_value": REGULATORY_THRESHOLDS["combined_ratio_ceiling"],
            "comparison": "<=", 
            "description": "Ratio combiné incluant les frais"
        },
        {
            "metric": "Variation Ultimate",
            "current_value": ultimate_variation,
            "threshold_value": REGULATORY_THRESHOLDS["technical_provisions_variation_max"],
            "comparison": "<=",
            "description": "Variation des provisions techniques vs exercice précédent"
        },
        {
            "metric": "R² moyen",
            "current_value": avg_r2,
            "threshold_value": REGULATORY_THRESHOLDS["r2_minimum"],
            "comparison": ">=",
            "description": "Qualité d'ajustement des modèles"
        },
        {
            "metric": "MAPE moyen",
            "current_value": avg_mape,
            "threshold_value": REGULATORY_THRESHOLDS["mape_maximum"],
            "comparison": "<=",
            "description": "Erreur moyenne absolue des modèles"
        }
    ]
    
    for check in threshold_checks:
        current = check["current_value"]
        threshold = check["threshold_value"]
        
        if check["comparison"] == "<=":
            violation = current > threshold
            deviation = (current - threshold) / threshold * 100 if violation else 0
        else:  # ">="
            violation = current < threshold
            deviation = (threshold - current) / threshold * 100 if violation else 0
        
        if violation:
            # Déterminer niveau d'alerte
            if deviation > 50:
                level = AlertLevel.BLOCKING
            elif deviation > 20:
                level = AlertLevel.CRITICAL
            elif deviation > 5:
                level = AlertLevel.WARNING
            else:
                level = AlertLevel.INFO
            
            recommendations = []
            if check["metric"] == "Loss Ratio":
                recommendations = [
                    "Réviser les provisions pour sinistres",
                    "Analyser l'évolution de la sinistralité", 
                    "Considérer des mesures de souscription"
                ]
            elif check["metric"] == "R² moyen":
                recommendations = [
                    "Améliorer la qualité des données",
                    "Réviser le choix des méthodes",
                    "Considérer des modèles plus sophistiqués"
                ]
            elif check["metric"] == "Variation Ultimate":
                recommendations = [
                    "Documenter les raisons de la variation",
                    "Validation par expert indépendant",
                    "Communication aux autorités si nécessaire"
                ]
            
            alerts.append(ThresholdAlert(
                metric=check["metric"],
                current_value=current,
                threshold_value=threshold,
                deviation_percent=deviation,
                alert_level=level,
                description=f"{check['description']} - Seuil dépassé de {deviation:.1f}%",
                recommendations=recommendations
            ))
    
    return alerts

def perform_cross_validation(calculation_data: Dict) -> Dict[str, Any]:
    """Validation croisée triangle/comptabilité/actuariat"""
    
    # Données triangle
    triangle_ultimate = calculation_data["summary"]["best_estimate"]
    triangle_reserves = triangle_ultimate - calculation_data["metadata"]["claims_paid"]
    
    # Simulation données comptables
    accounting_reserves = triangle_reserves * (1 + np.random.normal(0, 0.05))
    accounting_paid = calculation_data["metadata"]["claims_paid"] * (1 + np.random.normal(0, 0.02))
    
    # Simulation données actuariales précédentes
    prior_ultimate = calculation_data.get("previous_calculation", {}).get("best_estimate", triangle_ultimate * 0.95)
    
    # Analyses de cohérence
    reconciliations = [
        {
            "source_1": "Triangle actuariel",
            "source_2": "Comptabilité",
            "metric": "Réserves",
            "value_1": triangle_reserves,
            "value_2": accounting_reserves,
            "difference_abs": abs(triangle_reserves - accounting_reserves),
            "difference_rel": abs(triangle_reserves - accounting_reserves) / triangle_reserves * 100,
            "tolerance": 3.0,  # 3% de tolérance
            "status": "passed" if abs(triangle_reserves - accounting_reserves) / triangle_reserves * 100 < 3.0 else "failed"
        },
        {
            "source_1": "Triangle actuariel",
            "source_2": "Comptabilité", 
            "metric": "Sinistres payés",
            "value_1": calculation_data["metadata"]["claims_paid"],
            "value_2": accounting_paid,
            "difference_abs": abs(calculation_data["metadata"]["claims_paid"] - accounting_paid),
            "difference_rel": abs(calculation_data["metadata"]["claims_paid"] - accounting_paid) / calculation_data["metadata"]["claims_paid"] * 100,
            "tolerance": 1.0,  # 1% de tolérance
            "status": "passed" if abs(calculation_data["metadata"]["claims_paid"] - accounting_paid) / calculation_data["metadata"]["claims_paid"] * 100 < 1.0 else "failed"
        },
        {
            "source_1": "Triangle actuel",
            "source_2": "Triangle précédent",
            "metric": "Ultimate",
            "value_1": triangle_ultimate,
            "value_2": prior_ultimate,
            "difference_abs": abs(triangle_ultimate - prior_ultimate),
            "difference_rel": abs(triangle_ultimate - prior_ultimate) / prior_ultimate * 100,
            "tolerance": 10.0,  # 10% de variation acceptable
            "status": "passed" if abs(triangle_ultimate - prior_ultimate) / prior_ultimate * 100 < 10.0 else "warning"
        }
    ]
    
    # Score de validation croisée
    passed_count = sum(1 for rec in reconciliations if rec["status"] == "passed")
    validation_score = (passed_count / len(reconciliations)) * 100
    
    return {
        "reconciliations": reconciliations,
        "validation_score": validation_score,
        "status": "passed" if validation_score >= 80 else "warning" if validation_score >= 60 else "failed",
        "issues": [rec for rec in reconciliations if rec["status"] != "passed"],
        "recommendations": [
            f"Investiguer écart {rec['metric']} entre {rec['source_1']} et {rec['source_2']}: {rec['difference_rel']:.1f}%"
            for rec in reconciliations if rec["status"] != "passed"
        ]
    }

# ===== ENDPOINTS =====

@router.post("/execute")
async def execute_controls(
    request: ControlRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(verify_token)
):
    """Exécuter une batterie de contrôles réglementaires"""
    
    user = find_user_by_id(current_user["user_id"])
    if not user or user["role"] not in ["ACTUAIRE_SENIOR", "CHEF_ACTUAIRE", "DIRECTION", "ADMIN"]:
        raise HTTPException(status_code=403, detail="Permissions insuffisantes")
    
    try:
        # Récupérer les données de calcul
        calculation_data = fetch_calculation_for_control(request.calculationId)
        
        execution_id = str(uuid.uuid4())
        start_time = datetime.utcnow()
        
        # Exécuter chaque contrôle
        control_results = []
        all_alerts = []
        
        for control_type in request.controlTypes:
            control_start = datetime.utcnow()
            
            try:
                if control_type == ControlType.IFRS17_SOLVENCY2_RECONCILIATION:
                    result_data = calculate_ifrs17_solvency2_reconciliation(calculation_data)
                elif control_type == ControlType.MARKET_BENCHMARK:
                    result_data = perform_market_benchmark(calculation_data)
                elif control_type == ControlType.BACKTEST_VALIDATION:
                    result_data = perform_backtest_validation(calculation_data)
                elif control_type == ControlType.CROSS_VALIDATION:
                    result_data = perform_cross_validation(calculation_data)
                elif control_type == ControlType.REGULATORY_THRESHOLD:
                    threshold_alerts = check_regulatory_thresholds(calculation_data)
                    result_data = {
                        "alerts_count": len(threshold_alerts),
                        "critical_alerts": len([a for a in threshold_alerts if a.alert_level in [AlertLevel.CRITICAL, AlertLevel.BLOCKING]]),
                        "status": "failed" if any(a.alert_level == AlertLevel.BLOCKING for a in threshold_alerts) else "warning" if threshold_alerts else "passed"
                    }
                    all_alerts.extend(threshold_alerts)
                else:
                    result_data = {"status": "not_implemented", "message": f"Contrôle {control_type} non implémenté"}
                
                control_end = datetime.utcnow()
                execution_time = (control_end - control_start).total_seconds()
                
                # Calculer le score
                if "status" in result_data:
                    if result_data["status"] == "passed":
                        score = 90 + np.random.uniform(0, 10)
                    elif result_data["status"] == "warning":
                        score = 60 + np.random.uniform(0, 30)
                    else:
                        score = np.random.uniform(0, 60)
                else:
                    score = 75.0
                
                control_result = ControlResult(
                    controlType=control_type,
                    status=result_data.get("status", "completed"),
                    score=min(score, 100.0),
                    details=result_data,
                    alerts=[],
                    execution_time=execution_time
                )
                
                control_results.append(control_result)
                
            except Exception as e:
                logger.error(f"Erreur contrôle {control_type}: {str(e)}")
                control_results.append(ControlResult(
                    controlType=control_type,
                    status="error",
                    score=0.0,
                    details={"error": str(e)},
                    alerts=[],
                    execution_time=0.0
                ))
        
        end_time = datetime.utcnow()
        total_execution_time = (end_time - start_time).total_seconds()
        
        # Score global
        if control_results:
            global_score = sum(r.score for r in control_results) / len(control_results)
        else:
            global_score = 0.0
        
        # Statut global
        failed_controls = [r for r in control_results if r.status == "failed"]
        warning_controls = [r for r in control_results if r.status == "warning"]
        
        if failed_controls or any(a.alert_level == AlertLevel.BLOCKING for a in all_alerts):
            global_status = "failed"
        elif warning_controls or any(a.alert_level in [AlertLevel.CRITICAL, AlertLevel.WARNING] for a in all_alerts):
            global_status = "warning"
        else:
            global_status = "passed"
        
        # Enregistrer l'exécution
        execution_record = {
            "id": execution_id,
            "calculationId": request.calculationId,
            "triangleId": request.triangleId,
            "executedBy": current_user["user_id"],
            "executedAt": start_time.isoformat(),
            "controlTypes": request.controlTypes,
            "globalStatus": global_status,
            "globalScore": global_score,
            "totalExecutionTime": total_execution_time,
            "controlResults": [r.dict() for r in control_results],
            "alerts": [a.dict() for a in all_alerts]
        }
        
        CONTROL_EXECUTIONS.append(execution_record)
        
        # Enregistrer les alertes
        for alert in all_alerts:
            alert_record = {
                "id": str(uuid.uuid4()),
                "executionId": execution_id,
                "calculationId": request.calculationId,
                "metric": alert.metric,
                "alertLevel": alert.alert_level,
                "currentValue": alert.current_value,
                "thresholdValue": alert.threshold_value,
                "deviationPercent": alert.deviation_percent,
                "description": alert.description,
                "recommendations": alert.recommendations,
                "createdAt": datetime.utcnow().isoformat(),
                "acknowledged": False
            }
            ALERT_HISTORY.append(alert_record)
        
        # Log d'audit
        log_audit(
            current_user["user_id"],
            "REGULATORY_CONTROLS_EXECUTED",
            f"Exécution contrôles pour calcul {request.calculationId}: {global_status}",
            ""
        )
        
        # Programmer des alertes en arrière-plan si critique
        if global_status == "failed":
            background_tasks.add_task(send_critical_alerts, execution_id, all_alerts)
        
        return {
            "success": True,
            "executionId": execution_id,
            "globalStatus": global_status,
            "globalScore": global_score,
            "totalExecutionTime": total_execution_time,
            "controlResults": control_results,
            "alerts": all_alerts,
            "summary": {
                "totalControls": len(control_results),
                "passedControls": len([r for r in control_results if r.status == "passed"]),
                "failedControls": len(failed_controls),
                "warningControls": len(warning_controls),
                "criticalAlerts": len([a for a in all_alerts if a.alert_level in [AlertLevel.CRITICAL, AlertLevel.BLOCKING]])
            }
        }
        
    except Exception as e:
        logger.error(f"Erreur exécution contrôles: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'exécution des contrôles: {str(e)}")

@router.get("/monitoring/alerts")
async def get_active_alerts(
    alert_level: Optional[AlertLevel] = None,
    acknowledged: Optional[bool] = None,
    limit: int = 50,
    current_user: dict = Depends(verify_token)
):
    """Récupérer les alertes actives de monitoring"""
    
    # Filtrer les alertes
    filtered_alerts = ALERT_HISTORY.copy()
    
    if alert_level:
        filtered_alerts = [a for a in filtered_alerts if a["alertLevel"] == alert_level]
    
    if acknowledged is not None:
        filtered_alerts = [a for a in filtered_alerts if a["acknowledged"] == acknowledged]
    
    # Trier par date décroissante et limiter
    filtered_alerts = sorted(filtered_alerts, key=lambda x: x["createdAt"], reverse=True)[:limit]
    
    # Enrichir avec informations supplémentaires
    for alert in filtered_alerts:
        alert["timeAgo"] = get_time_ago(alert["createdAt"])
        alert["severityColor"] = {
            AlertLevel.INFO: "blue",
            AlertLevel.WARNING: "yellow", 
            AlertLevel.CRITICAL: "red",
            AlertLevel.BLOCKING: "purple"
        }.get(alert["alertLevel"], "gray")
    
    return {
        "success": True,
        "alerts": filtered_alerts,
        "summary": {
            "total": len(ALERT_HISTORY),
            "unacknowledged": len([a for a in ALERT_HISTORY if not a["acknowledged"]]),
            "critical": len([a for a in ALERT_HISTORY if a["alertLevel"] in [AlertLevel.CRITICAL, AlertLevel.BLOCKING]]),
            "lastAlert": ALERT_HISTORY[-1]["createdAt"] if ALERT_HISTORY else None
        }
    }

@router.post("/monitoring/acknowledge-alert/{alert_id}")
async def acknowledge_alert(
    alert_id: str,
    current_user: dict = Depends(verify_token)
):
    """Acquitter une alerte"""
    
    alert = next((a for a in ALERT_HISTORY if a["id"] == alert_id), None)
    if not alert:
        raise HTTPException(status_code=404, detail="Alerte introuvable")
    
    alert["acknowledged"] = True
    alert["acknowledgedBy"] = current_user["user_id"]
    alert["acknowledgedAt"] = datetime.utcnow().isoformat()
    
    log_audit(current_user["user_id"], "ALERT_ACKNOWLEDGED", f"Acquittement alerte {alert_id}", "")
    
    return {
        "success": True,
        "message": "Alerte acquittée"
    }

@router.get("/executions/history")
async def get_control_executions_history(
    calculation_id: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: dict = Depends(verify_token)
):
    """Historique des exécutions de contrôles"""
    
    filtered_executions = CONTROL_EXECUTIONS.copy()
    
    if calculation_id:
        filtered_executions = [e for e in filtered_executions if e["calculationId"] == calculation_id]
    
    # Pagination
    start = offset
    end = offset + limit
    executions = filtered_executions[start:end] if start < len(filtered_executions) else []
    
    # Enrichir avec noms d'utilisateurs
    for execution in executions:
        user = find_user_by_id(execution["executedBy"])
        execution["executedByName"] = f"{user['first_name']} {user['last_name']}" if user else "Inconnu"
        execution["timeAgo"] = get_time_ago(execution["executedAt"])
    
    return {
        "success": True,
        "executions": sorted(executions, key=lambda x: x["executedAt"], reverse=True),
        "pagination": {
            "total": len(filtered_executions),
            "limit": limit,
            "offset": offset,
            "hasMore": end < len(filtered_executions)
        }
    }

@router.get("/dashboard")
async def get_controls_dashboard(current_user: dict = Depends(verify_token)):
    """Dashboard des contrôles réglementaires"""
    
    user = find_user_by_id(current_user["user_id"])
    if not user or user["role"] not in ["ACTUAIRE_SENIOR", "CHEF_ACTUAIRE", "DIRECTION", "ADMIN"]:
        raise HTTPException(status_code=403, detail="Permissions insuffisantes")
    
    # Statistiques des dernières 24h
    yesterday = datetime.utcnow() - timedelta(days=1)
    recent_executions = [e for e in CONTROL_EXECUTIONS if datetime.fromisoformat(e["executedAt"]) >= yesterday]
    recent_alerts = [a for a in ALERT_HISTORY if datetime.fromisoformat(a["createdAt"]) >= yesterday]
    
    # Métriques globales
    total_executions = len(CONTROL_EXECUTIONS)
    avg_score = np.mean([e["globalScore"] for e in CONTROL_EXECUTIONS]) if CONTROL_EXECUTIONS else 0
    failed_executions = len([e for e in CONTROL_EXECUTIONS if e["globalStatus"] == "failed"])
    
    # Alertes par niveau
    alerts_by_level = {
        AlertLevel.INFO: len([a for a in ALERT_HISTORY if a["alertLevel"] == AlertLevel.INFO]),
        AlertLevel.WARNING: len([a for a in ALERT_HISTORY if a["alertLevel"] == AlertLevel.WARNING]),
        AlertLevel.CRITICAL: len([a for a in ALERT_HISTORY if a["alertLevel"] == AlertLevel.CRITICAL]),
        AlertLevel.BLOCKING: len([a for a in ALERT_HISTORY if a["alertLevel"] == AlertLevel.BLOCKING])
    }
    
    # Contrôles par type
    controls_by_type = {}
    for execution in CONTROL_EXECUTIONS:
        for control_type in execution["controlTypes"]:
            controls_by_type[control_type] = controls_by_type.get(control_type, 0) + 1
    
    return {
        "success": True,
        "dashboard": {
            "summary": {
                "totalExecutions": total_executions,
                "averageScore": round(avg_score, 1),
                "failureRate": round((failed_executions / total_executions * 100), 1) if total_executions > 0 else 0,
                "activeAlertsCount": len([a for a in ALERT_HISTORY if not a["acknowledged"]]),
                "last24hExecutions": len(recent_executions),
                "last24hAlerts": len(recent_alerts)
            },
            "alertsByLevel": alerts_by_level,
            "controlsByType": controls_by_type,
            "recentActivity": {
                "executions": sorted(recent_executions, key=lambda x: x["executedAt"], reverse=True)[:5],
                "alerts": sorted(recent_alerts, key=lambda x: x["createdAt"], reverse=True)[:10]
            },
            "systemHealth": {
                "overallStatus": "healthy" if avg_score >= 80 else "warning" if avg_score >= 60 else "critical",
                "lastExecution": CONTROL_EXECUTIONS[-1]["executedAt"] if CONTROL_EXECUTIONS else None,
                "nextScheduledExecution": (datetime.utcnow() + timedelta(hours=24)).isoformat()
            }
        }
    }

# ===== FONCTIONS UTILITAIRES =====

def get_time_ago(timestamp_str: str) -> str:
    """Calculer le temps écoulé depuis un timestamp"""
    timestamp = datetime.fromisoformat(timestamp_str)
    now = datetime.utcnow()
    diff = now - timestamp
    
    if diff.days > 0:
        return f"Il y a {diff.days} jour{'s' if diff.days > 1 else ''}"
    elif diff.seconds > 3600:
        hours = diff.seconds // 3600
        return f"Il y a {hours} heure{'s' if hours > 1 else ''}"
    elif diff.seconds > 60:
        minutes = diff.seconds // 60
        return f"Il y a {minutes} minute{'s' if minutes > 1 else ''}"
    else:
        return "À l'instant"

async def send_critical_alerts(execution_id: str, alerts: List[ThresholdAlert]):
    """Envoyer des alertes critiques (fonction d'arrière-plan)"""
    critical_alerts = [a for a in alerts if a.alert_level in [AlertLevel.CRITICAL, AlertLevel.BLOCKING]]
    
    if critical_alerts:
        logger.warning(f"ALERTE CRITIQUE - Exécution {execution_id}: {len(critical_alerts)} alertes critiques détectées")
        
        # Ici vous pourriez intégrer avec un système de notification
        # (email, SMS, Slack, etc.)
        for alert in critical_alerts:
            logger.critical(f"Alerte {alert.alert_level}: {alert.metric} = {alert.current_value} (seuil: {alert.threshold_value})")

@router.post("/schedule-monitoring")
async def schedule_monitoring(
    calculation_id: str,
    frequency_hours: int = 24,
    current_user: dict = Depends(verify_token)
):
    """Programmer un monitoring automatique"""
    
    user = find_user_by_id(current_user["user_id"])
    if not user or user["role"] not in ["CHEF_ACTUAIRE", "DIRECTION", "ADMIN"]:
        raise HTTPException(status_code=403, detail="Permissions insuffisantes")
    
    # Simulation de programmation
    monitoring_id = str(uuid.uuid4())
    
    log_audit(
        current_user["user_id"],
        "MONITORING_SCHEDULED",
        f"Monitoring programmé pour calcul {calculation_id} (fréquence: {frequency_hours}h)",
        ""
    )
    
    return {
        "success": True,
        "monitoringId": monitoring_id,
        "scheduledFrequency": frequency_hours,
        "nextExecution": (datetime.utcnow() + timedelta(hours=frequency_hours)).isoformat(),
        "message": "Monitoring automatique programmé avec succès"
    }