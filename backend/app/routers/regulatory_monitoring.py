# backend/app/routers/regulatory_monitoring.py
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
import json
from concurrent.futures import ThreadPoolExecutor

from ..main import verify_token, find_user_by_id, log_audit

router = APIRouter(prefix="/api/v1/regulatory-monitoring", tags=["Monitoring Réglementaire"])
logger = logging.getLogger("regulatory_monitoring")

# ===== MODÈLES PYDANTIC =====

class MonitoringRule(BaseModel):
    id: str
    name: str
    description: str
    metric_type: str  # scr_ratio, mcr_ratio, liquidity_ratio, technical_provisions_variation
    threshold_warning: float
    threshold_critical: float
    threshold_blocking: float
    evaluation_frequency: int  # en minutes
    is_active: bool = True
    escalation_rules: List[str] = []
    
class AlertSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"
    BLOCKING = "blocking"

class MonitoringAlert(BaseModel):
    id: str
    rule_id: str
    rule_name: str
    severity: AlertSeverity
    metric_value: float
    threshold_value: float
    deviation_percent: float
    calculation_id: str
    triangle_id: str
    created_at: datetime
    acknowledged: bool = False
    escalated: bool = False
    auto_resolved: bool = False

class MonitoringStatus(BaseModel):
    overall_status: str  # healthy, warning, critical, emergency
    active_alerts_count: int
    critical_alerts_count: int
    last_evaluation: datetime
    next_evaluation: datetime
    system_uptime_percent: float

class RegulatoryMetrics(BaseModel):
    solvency_ratio: float
    mcr_coverage: float
    liquidity_ratio: float
    technical_provisions: float
    own_funds: float
    scr: float
    mcr: float
    calculation_timestamp: datetime

# ===== BASE DE DONNÉES SIMULÉE =====

MONITORING_RULES = [
    {
        "id": "scr_ratio_monitoring",
        "name": "Surveillance Ratio de Solvabilité",
        "description": "Surveillance continue du ratio de solvabilité SCR",
        "metric_type": "solvency_ratio",
        "threshold_warning": 120.0,  # 120%
        "threshold_critical": 110.0,  # 110%
        "threshold_blocking": 100.0,  # 100% - minimum réglementaire
        "evaluation_frequency": 15,  # Évalué toutes les 15 minutes
        "is_active": True,
        "escalation_rules": ["email_chief_actuary", "sms_management", "regulatory_notification"]
    },
    {
        "id": "mcr_coverage_monitoring", 
        "name": "Surveillance Couverture MCR",
        "description": "Surveillance du ratio de couverture du capital minimum requis",
        "metric_type": "mcr_ratio",
        "threshold_warning": 140.0,
        "threshold_critical": 120.0,
        "threshold_blocking": 100.0,  # Minimum réglementaire absolu
        "evaluation_frequency": 10,
        "is_active": True,
        "escalation_rules": ["immediate_board_notification", "acpr_notification"]
    },
    {
        "id": "liquidity_monitoring",
        "name": "Surveillance Liquidité",
        "description": "Surveillance des ratios de liquidité",
        "metric_type": "liquidity_ratio",
        "threshold_warning": 15.0,  # 15% de liquidités minimum
        "threshold_critical": 10.0,
        "threshold_blocking": 5.0,
        "evaluation_frequency": 30,
        "is_active": True,
        "escalation_rules": ["treasury_alert", "asset_manager_notification"]
    },
    {
        "id": "provisions_variation_monitoring",
        "name": "Surveillance Variations Provisions",
        "description": "Détection de variations anormales des provisions techniques",
        "metric_type": "technical_provisions_variation",
        "threshold_warning": 10.0,  # 10% de variation
        "threshold_critical": 15.0,
        "threshold_blocking": 25.0,
        "evaluation_frequency": 60,
        "is_active": True,
        "escalation_rules": ["actuarial_review", "methodology_validation"]
    }
]

MONITORING_ALERTS = []
METRICS_HISTORY = []
ESCALATION_HISTORY = []
MONITORING_STATUS = {
    "overall_status": "healthy",
    "active_alerts_count": 0,
    "critical_alerts_count": 0,
    "last_evaluation": datetime.utcnow(),
    "next_evaluation": datetime.utcnow() + timedelta(minutes=10),
    "system_uptime_percent": 99.8
}

# ===== FONCTIONS DE CALCUL DES MÉTRIQUES =====

def fetch_current_regulatory_metrics(calculation_id: Optional[str] = None) -> RegulatoryMetrics:
    """Récupérer les métriques réglementaires actuelles depuis vos APIs"""
    
    # Si pas de calcul spécifique, utiliser les dernières données disponibles
    if not calculation_id:
        # Simulation basée sur vos structures existantes
        base_ultimate = 12650000  # Best estimate de votre exemple
        
        # Calcul Solvency II
        technical_provisions = base_ultimate * 1.08  # TP = BE + RM
        
        # SCR Components (formule standard simplifiée)
        scr_market = technical_provisions * 0.15
        scr_credit = technical_provisions * 0.05
        scr_underwriting = technical_provisions * 0.25
        scr_operational = technical_provisions * 0.03
        scr_total = (scr_market + scr_credit + scr_underwriting + scr_operational) * 0.8  # Diversification
        
        # MCR (25% du SCR, mais pas moins que les minimums absolus)
        mcr = max(scr_total * 0.25, 3700000)  # 3.7M€ minimum pour composite
        
        # Fonds propres (simulation d'une position saine mais surveillée)
        own_funds = scr_total * (1.15 + np.random.normal(0, 0.1))  # Ratio ~115% avec volatilité
        
        # Ratios calculés
        solvency_ratio = (own_funds / scr_total) * 100 if scr_total > 0 else 0
        mcr_coverage = (own_funds / mcr) * 100 if mcr > 0 else 0
        liquidity_ratio = max(12.0, 20.0 + np.random.normal(0, 5))  # 12-25% avec volatilité
        
    else:
        # Récupérer depuis vos APIs spécifiques
        # Ici vous feriez appel à vos vraies APIs de calcul
        pass
    
    return RegulatoryMetrics(
        solvency_ratio=solvency_ratio,
        mcr_coverage=mcr_coverage,
        liquidity_ratio=liquidity_ratio,
        technical_provisions=technical_provisions,
        own_funds=own_funds,
        scr=scr_total,
        mcr=mcr,
        calculation_timestamp=datetime.utcnow()
    )

def detect_statistical_anomalies(metrics: RegulatoryMetrics, historical_data: List[Dict]) -> List[Dict]:
    """Détecter des anomalies statistiques dans les métriques"""
    
    anomalies = []
    
    if len(historical_data) < 10:  # Pas assez de données historiques
        return anomalies
    
    # Analyse des ratios de solvabilité
    historical_ratios = [h["solvency_ratio"] for h in historical_data[-30:]]  # 30 dernières mesures
    mean_ratio = np.mean(historical_ratios)
    std_ratio = np.std(historical_ratios)
    
    # Détection d'outliers (3-sigma rule)
    z_score = abs(metrics.solvency_ratio - mean_ratio) / std_ratio if std_ratio > 0 else 0
    
    if z_score > 3:
        anomalies.append({
            "type": "statistical_outlier",
            "metric": "solvency_ratio",
            "current_value": metrics.solvency_ratio,
            "historical_mean": mean_ratio,
            "z_score": z_score,
            "severity": "critical" if z_score > 4 else "warning",
            "description": f"Ratio de solvabilité inhabituel: {metrics.solvency_ratio:.1f}% vs moyenne {mean_ratio:.1f}%"
        })
    
    # Analyse des tendances (régression linéaire simple)
    if len(historical_ratios) >= 5:
        x = np.arange(len(historical_ratios))
        coeffs = np.polyfit(x, historical_ratios, 1)
        trend_slope = coeffs[0]  # Pente de la tendance
        
        # Alerte si tendance baissière forte
        if trend_slope < -2:  # Baisse de plus de 2% par mesure
            anomalies.append({
                "type": "negative_trend",
                "metric": "solvency_ratio",
                "trend_slope": trend_slope,
                "severity": "warning",
                "description": f"Tendance baissière détectée: {trend_slope:.2f}% par période"
            })
    
    return anomalies

def evaluate_monitoring_rules(metrics: RegulatoryMetrics) -> List[Dict]:
    """Évaluer toutes les règles de monitoring"""
    
    triggered_alerts = []
    
    for rule in MONITORING_RULES:
        if not rule["is_active"]:
            continue
            
        # Récupérer la valeur de la métrique
        if rule["metric_type"] == "solvency_ratio":
            metric_value = metrics.solvency_ratio
        elif rule["metric_type"] == "mcr_ratio":
            metric_value = metrics.mcr_coverage
        elif rule["metric_type"] == "liquidity_ratio":
            metric_value = metrics.liquidity_ratio
        elif rule["metric_type"] == "technical_provisions_variation":
            # Calculer la variation vs période précédente
            if len(METRICS_HISTORY) > 0:
                last_tp = METRICS_HISTORY[-1].get("technical_provisions", metrics.technical_provisions)
                metric_value = abs((metrics.technical_provisions - last_tp) / last_tp * 100)
            else:
                metric_value = 0  # Pas de variation pour le premier calcul
        else:
            continue
        
        # Évaluer les seuils
        severity = None
        threshold_crossed = None
        
        if rule["metric_type"] in ["solvency_ratio", "mcr_ratio", "liquidity_ratio"]:
            # Seuils descendants (plus bas = plus grave)
            if metric_value <= rule["threshold_blocking"]:
                severity = AlertSeverity.BLOCKING
                threshold_crossed = rule["threshold_blocking"]
            elif metric_value <= rule["threshold_critical"]:
                severity = AlertSeverity.CRITICAL  
                threshold_crossed = rule["threshold_critical"]
            elif metric_value <= rule["threshold_warning"]:
                severity = AlertSeverity.WARNING
                threshold_crossed = rule["threshold_warning"]
        else:
            # Seuils ascendants (plus haut = plus grave)
            if metric_value >= rule["threshold_blocking"]:
                severity = AlertSeverity.BLOCKING
                threshold_crossed = rule["threshold_blocking"]
            elif metric_value >= rule["threshold_critical"]:
                severity = AlertSeverity.CRITICAL
                threshold_crossed = rule["threshold_critical"]  
            elif metric_value >= rule["threshold_warning"]:
                severity = AlertSeverity.WARNING
                threshold_crossed = rule["threshold_warning"]
        
        if severity:
            # Calculer l'écart
            if rule["metric_type"] in ["solvency_ratio", "mcr_ratio", "liquidity_ratio"]:
                deviation = ((threshold_crossed - metric_value) / threshold_crossed) * 100
            else:
                deviation = ((metric_value - threshold_crossed) / threshold_crossed) * 100
            
            triggered_alerts.append({
                "rule_id": rule["id"],
                "rule_name": rule["name"],
                "severity": severity,
                "metric_type": rule["metric_type"],
                "metric_value": metric_value,
                "threshold_value": threshold_crossed,
                "deviation_percent": abs(deviation),
                "description": f"{rule['description']} - Seuil {severity.value} franchi",
                "escalation_rules": rule["escalation_rules"]
            })
    
    return triggered_alerts

async def execute_escalation(alert_data: Dict, escalation_rules: List[str]):
    """Exécuter les règles d'escalade pour une alerte"""
    
    escalation_record = {
        "id": str(uuid.uuid4()),
        "alert_id": alert_data.get("id"),
        "escalation_rules": escalation_rules,
        "executed_at": datetime.utcnow().isoformat(),
        "results": []
    }
    
    for rule in escalation_rules:
        try:
            if rule == "email_chief_actuary":
                # Simulation d'envoi d'email
                result = await send_email_notification(
                    recipient="chief.actuary@company.com",
                    subject=f"ALERTE RÉGLEMENTAIRE: {alert_data['rule_name']}",
                    content=f"Alerte {alert_data['severity']}: {alert_data['description']}"
                )
                escalation_record["results"].append({"rule": rule, "status": "sent", "timestamp": datetime.utcnow().isoformat()})
                
            elif rule == "sms_management":
                # Simulation SMS
                result = await send_sms_notification(
                    recipient="+33123456789",
                    message=f"ALERTE {alert_data['severity'].upper()}: {alert_data['rule_name']}"
                )
                escalation_record["results"].append({"rule": rule, "status": "sent"})
                
            elif rule == "regulatory_notification":
                # Notification aux autorités (simulation)
                if alert_data["severity"] in [AlertSeverity.BLOCKING, AlertSeverity.CRITICAL]:
                    result = await prepare_regulatory_notification(alert_data)
                    escalation_record["results"].append({"rule": rule, "status": "prepared"})
                    
            elif rule == "immediate_board_notification":
                # Notification conseil d'administration
                result = await send_board_notification(alert_data)
                escalation_record["results"].append({"rule": rule, "status": "notified"})
                
            elif rule == "treasury_alert":
                # Alerte trésorerie
                result = await send_treasury_alert(alert_data)
                escalation_record["results"].append({"rule": rule, "status": "alerted"})
                
        except Exception as e:
            logger.error(f"Erreur escalade {rule}: {str(e)}")
            escalation_record["results"].append({"rule": rule, "status": "error", "error": str(e)})
    
    ESCALATION_HISTORY.append(escalation_record)
    return escalation_record

# ===== FONCTIONS D'ESCALADE (SIMULATIONS) =====

async def send_email_notification(recipient: str, subject: str, content: str) -> Dict:
    """Simulation d'envoi d'email"""
    await asyncio.sleep(0.1)  # Simulation latence
    logger.info(f"EMAIL envoyé à {recipient}: {subject}")
    return {"status": "sent", "recipient": recipient}

async def send_sms_notification(recipient: str, message: str) -> Dict:
    """Simulation d'envoi SMS"""
    await asyncio.sleep(0.1)
    logger.info(f"SMS envoyé à {recipient}: {message}")
    return {"status": "sent", "recipient": recipient}

async def prepare_regulatory_notification(alert_data: Dict) -> Dict:
    """Préparer notification réglementaire"""
    await asyncio.sleep(0.2)
    logger.warning(f"NOTIFICATION RÉGLEMENTAIRE préparée: {alert_data['rule_name']}")
    return {"status": "prepared", "authority": "ACPR"}

async def send_board_notification(alert_data: Dict) -> Dict:
    """Notification conseil d'administration"""
    await asyncio.sleep(0.1)
    logger.critical(f"CONSEIL D'ADMINISTRATION notifié: {alert_data['rule_name']}")
    return {"status": "notified", "board": True}

async def send_treasury_alert(alert_data: Dict) -> Dict:
    """Alerte trésorerie"""
    await asyncio.sleep(0.1)
    logger.info(f"TRÉSORERIE alertée: {alert_data['rule_name']}")
    return {"status": "alerted", "treasury": True}

# ===== ENDPOINTS =====

@router.get("/status")
async def get_monitoring_status(current_user: dict = Depends(verify_token)):
    """Statut global du monitoring réglementaire"""
    
    # Mettre à jour le statut
    active_alerts = [a for a in MONITORING_ALERTS if not a.get("acknowledged", False)]
    critical_alerts = [a for a in active_alerts if a.get("severity") in [AlertSeverity.CRITICAL, AlertSeverity.BLOCKING]]
    
    if len(critical_alerts) > 0:
        overall_status = "emergency"
    elif len([a for a in active_alerts if a.get("severity") == AlertSeverity.CRITICAL]) > 0:
        overall_status = "critical"
    elif len(active_alerts) > 0:
        overall_status = "warning"
    else:
        overall_status = "healthy"
    
    MONITORING_STATUS.update({
        "overall_status": overall_status,
        "active_alerts_count": len(active_alerts),
        "critical_alerts_count": len(critical_alerts),
        "last_evaluation": datetime.utcnow(),
        "next_evaluation": datetime.utcnow() + timedelta(minutes=10)
    })
    
    return {
        "success": True,
        "status": MONITORING_STATUS,
        "metrics_last_update": METRICS_HISTORY[-1]["timestamp"] if METRICS_HISTORY else None,
        "rules_active": len([r for r in MONITORING_RULES if r["is_active"]]),
        "escalations_today": len([e for e in ESCALATION_HISTORY if datetime.fromisoformat(e["executed_at"]).date() == datetime.now().date()])
    }

@router.post("/evaluate")
async def evaluate_monitoring(
    calculation_id: Optional[str] = None,
    background_tasks: BackgroundTasks = None,
    current_user: dict = Depends(verify_token)
):
    """Évaluation manuelle du monitoring"""
    
    try:
        # Récupérer les métriques actuelles
        current_metrics = fetch_current_regulatory_metrics(calculation_id)
        
        # Enregistrer dans l'historique
        metrics_record = {
            "timestamp": current_metrics.calculation_timestamp.isoformat(),
            "solvency_ratio": current_metrics.solvency_ratio,
            "mcr_coverage": current_metrics.mcr_coverage,
            "liquidity_ratio": current_metrics.liquidity_ratio,
            "technical_provisions": current_metrics.technical_provisions,
            "own_funds": current_metrics.own_funds,
            "scr": current_metrics.scr,
            "mcr": current_metrics.mcr,
            "calculation_id": calculation_id
        }
        METRICS_HISTORY.append(metrics_record)
        
        # Évaluer les règles de monitoring
        triggered_alerts = evaluate_monitoring_rules(current_metrics)
        
        # Détecter les anomalies statistiques
        statistical_anomalies = detect_statistical_anomalies(current_metrics, METRICS_HISTORY[-30:])
        
        # Créer les alertes
        new_alerts = []
        for alert_data in triggered_alerts:
            alert = {
                "id": str(uuid.uuid4()),
                "rule_id": alert_data["rule_id"],
                "rule_name": alert_data["rule_name"],
                "severity": alert_data["severity"],
                "metric_type": alert_data["metric_type"],
                "metric_value": alert_data["metric_value"],
                "threshold_value": alert_data["threshold_value"],
                "deviation_percent": alert_data["deviation_percent"],
                "description": alert_data["description"],
                "calculation_id": calculation_id or "monitoring",
                "triangle_id": "monitoring",
                "created_at": datetime.utcnow().isoformat(),
                "acknowledged": False,
                "escalated": False,
                "escalation_rules": alert_data["escalation_rules"]
            }
            
            MONITORING_ALERTS.append(alert)
            new_alerts.append(alert)
            
            # Programmer l'escalade en arrière-plan
            if alert["severity"] in [AlertSeverity.CRITICAL, AlertSeverity.BLOCKING]:
                if background_tasks:
                    background_tasks.add_task(execute_escalation, alert, alert_data["escalation_rules"])
        
        # Log d'audit
        log_audit(
            current_user["user_id"],
            "REGULATORY_MONITORING_EVALUATED",
            f"Évaluation monitoring: {len(new_alerts)} nouvelles alertes",
            ""
        )
        
        return {
            "success": True,
            "evaluation_timestamp": current_metrics.calculation_timestamp.isoformat(),
            "current_metrics": current_metrics.dict(),
            "new_alerts": new_alerts,
            "statistical_anomalies": statistical_anomalies,
            "summary": {
                "solvency_status": "healthy" if current_metrics.solvency_ratio > 150 else "warning" if current_metrics.solvency_ratio > 120 else "critical",
                "mcr_status": "healthy" if current_metrics.mcr_coverage > 200 else "warning" if current_metrics.mcr_coverage > 140 else "critical",
                "liquidity_status": "healthy" if current_metrics.liquidity_ratio > 20 else "warning" if current_metrics.liquidity_ratio > 15 else "critical"
            }
        }
        
    except Exception as e:
        logger.error(f"Erreur évaluation monitoring: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'évaluation: {str(e)}")

@router.get("/alerts")
async def get_monitoring_alerts(
    severity: Optional[AlertSeverity] = None,
    acknowledged: Optional[bool] = None,
    limit: int = 100,
    current_user: dict = Depends(verify_token)
):
    """Récupérer les alertes de monitoring"""
    
    filtered_alerts = MONITORING_ALERTS.copy()
    
    if severity:
        filtered_alerts = [a for a in filtered_alerts if a.get("severity") == severity]
    
    if acknowledged is not None:
        filtered_alerts = [a for a in filtered_alerts if a.get("acknowledged", False) == acknowledged]
    
    # Trier par date décroissante
    filtered_alerts = sorted(filtered_alerts, key=lambda x: x["created_at"], reverse=True)[:limit]
    
    # Enrichir avec informations supplémentaires
    for alert in filtered_alerts:
        alert["time_ago"] = get_time_ago(alert["created_at"])
        alert["is_recent"] = datetime.fromisoformat(alert["created_at"]) > (datetime.utcnow() - timedelta(hours=1))
    
    return {
        "success": True,
        "alerts": filtered_alerts,
        "summary": {
            "total": len(MONITORING_ALERTS),
            "unacknowledged": len([a for a in MONITORING_ALERTS if not a.get("acknowledged", False)]),
            "critical": len([a for a in MONITORING_ALERTS if a.get("severity") in [AlertSeverity.CRITICAL, AlertSeverity.BLOCKING]]),
            "last_24h": len([a for a in MONITORING_ALERTS if datetime.fromisoformat(a["created_at"]) > (datetime.utcnow() - timedelta(days=1))])
        }
    }

@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_monitoring_alert(
    alert_id: str,
    current_user: dict = Depends(verify_token)
):
    """Acquitter une alerte de monitoring"""
    
    alert = next((a for a in MONITORING_ALERTS if a["id"] == alert_id), None)
    if not alert:
        raise HTTPException(status_code=404, detail="Alerte introuvable")
    
    alert["acknowledged"] = True
    alert["acknowledged_by"] = current_user["user_id"]
    alert["acknowledged_at"] = datetime.utcnow().isoformat()
    
    log_audit(current_user["user_id"], "MONITORING_ALERT_ACKNOWLEDGED", f"Acquittement alerte monitoring {alert_id}", "")
    
    return {
        "success": True,
        "message": "Alerte acquittée"
    }

@router.get("/metrics/history")
async def get_metrics_history(
    metric_type: Optional[str] = None,
    hours_back: int = 24,
    current_user: dict = Depends(verify_token)
):
    """Historique des métriques réglementaires"""
    
    cutoff_time = datetime.utcnow() - timedelta(hours=hours_back)
    
    filtered_metrics = [
        m for m in METRICS_HISTORY 
        if datetime.fromisoformat(m["timestamp"]) >= cutoff_time
    ]
    
    if metric_type:
        # Extraire seulement la métrique demandée
        metric_data = [
            {
                "timestamp": m["timestamp"],
                "value": m.get(metric_type, 0)
            }
            for m in filtered_metrics
        ]
    else:
        metric_data = filtered_metrics
    
    return {
        "success": True,
        "metrics": sorted(metric_data, key=lambda x: x["timestamp"]),
        "period": f"{hours_back} heures",
        "data_points": len(metric_data)
    }

@router.get("/dashboard")
async def get_monitoring_dashboard(current_user: dict = Depends(verify_token)):
    """Dashboard du monitoring réglementaire"""
    
    user = find_user_by_id(current_user["user_id"])
    if not user or user["role"] not in ["ACTUAIRE_SENIOR", "CHEF_ACTUAIRE", "DIRECTION", "ADMIN"]:
        raise HTTPException(status_code=403, detail="Permissions insuffisantes")
    
    # Métriques actuelles
    current_metrics = fetch_current_regulatory_metrics()
    
    # Alertes actives
    active_alerts = [a for a in MONITORING_ALERTS if not a.get("acknowledged", False)]
    critical_alerts = [a for a in active_alerts if a.get("severity") in [AlertSeverity.CRITICAL, AlertSeverity.BLOCKING]]
    
    # Tendances (dernières 24h)
    recent_metrics = [m for m in METRICS_HISTORY if datetime.fromisoformat(m["timestamp"]) > (datetime.utcnow() - timedelta(hours=24))]
    
    # Calcul des tendances
    trends = {}
    for metric_name in ["solvency_ratio", "mcr_coverage", "liquidity_ratio"]:
        values = [m[metric_name] for m in recent_metrics if metric_name in m]
        if len(values) >= 2:
            trend = (values[-1] - values[0]) / values[0] * 100 if values[0] != 0 else 0
            trends[metric_name] = {
                "current": values[-1],
                "trend_percent": trend,
                "direction": "up" if trend > 1 else "down" if trend < -1 else "stable"
            }
        else:
            trends[metric_name] = {
                "current": getattr(current_metrics, metric_name),
                "trend_percent": 0,
                "direction": "stable"
            }
    
    # Règles actives
    active_rules = [r for r in MONITORING_RULES if r["is_active"]]
    
    return {
        "success": True,
        "dashboard": {
            "current_metrics": current_metrics.dict(),
            "alert_summary": {
                "active_count": len(active_alerts),
                "critical_count": len(critical_alerts),
                "resolved_today": len([a for a in MONITORING_ALERTS if a.get("acknowledged") and datetime.fromisoformat(a.get("acknowledged_at", "2020-01-01")).date() == datetime.now().date()])
            },
            "trends": trends,
            "system_health": {
                "overall_status": MONITORING_STATUS["overall_status"],
                "uptime_percent": MONITORING_STATUS["system_uptime_percent"],
                "rules_active": len(active_rules),
                "last_evaluation": MONITORING_STATUS["last_evaluation"].isoformat(),
                "next_evaluation": MONITORING_STATUS["next_evaluation"].isoformat()
            },
            "recent_activity": {
                "alerts": sorted(MONITORING_ALERTS[-10:], key=lambda x: x["created_at"], reverse=True),
                "escalations": sorted(ESCALATION_HISTORY[-5:], key=lambda x: x["executed_at"], reverse=True)
            }
        }
    }

@router.post("/rules")
async def create_monitoring_rule(
    rule: MonitoringRule,
    current_user: dict = Depends(verify_token)
):
    """Créer une nouvelle règle de monitoring"""
    
    user = find_user_by_id(current_user["user_id"])
    if not user or user["role"] not in ["CHEF_ACTUAIRE", "DIRECTION", "ADMIN"]:
        raise HTTPException(status_code=403, detail="Permissions insuffisantes")
    
    # Vérifier que la règle n'existe pas déjà
    if any(r["id"] == rule.id for r in MONITORING_RULES):
        raise HTTPException(status_code=400, detail="Règle avec cet ID existe déjà")
    
    rule_dict = rule.dict()
    rule_dict["created_by"] = current_user["user_id"]
    rule_dict["created_at"] = datetime.utcnow().isoformat()
    
    MONITORING_RULES.append(rule_dict)
    
    log_audit(current_user["user_id"], "MONITORING_RULE_CREATED", f"Création règle monitoring {rule.id}", "")
    
    return {
        "success": True,
        "rule": rule_dict,
        "message": "Règle de monitoring créée"
    }

@router.get("/rules")
async def get_monitoring_rules(current_user: dict = Depends(verify_token)):
    """Récupérer les règles de monitoring"""
    
    return {
        "success": True,
        "rules": MONITORING_RULES,
        "total": len(MONITORING_RULES),
        "active": len([r for r in MONITORING_RULES if r["is_active"]])
    }

@router.put("/rules/{rule_id}")
async def update_monitoring_rule(
    rule_id: str,
    updates: Dict[str, Any],
    current_user: dict = Depends(verify_token)
):
    """Mettre à jour une règle de monitoring"""
    
    user = find_user_by_id(current_user["user_id"])
    if not user or user["role"] not in ["CHEF_ACTUAIRE", "DIRECTION", "ADMIN"]:
        raise HTTPException(status_code=403, detail="Permissions insuffisantes")
    
    rule = next((r for r in MONITORING_RULES if r["id"] == rule_id), None)
    if not rule:
        raise HTTPException(status_code=404, detail="Règle introuvable")
    
    # Mettre à jour les champs autorisés
    allowed_updates = ["name", "description", "threshold_warning", "threshold_critical", "threshold_blocking", "evaluation_frequency", "is_active", "escalation_rules"]
    
    for key, value in updates.items():
        if key in allowed_updates:
            rule[key] = value
    
    rule["updated_by"] = current_user["user_id"]
    rule["updated_at"] = datetime.utcnow().isoformat()
    
    log_audit(current_user["user_id"], "MONITORING_RULE_UPDATED", f"Modification règle {rule_id}", "")
    
    return {
        "success": True,
        "rule": rule,
        "message": "Règle mise à jour"
    }

# ===== FONCTION UTILITAIRE =====

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