# backend/app/routers/realtime_monitoring.py
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Set
from pydantic import BaseModel, Field
from enum import Enum
import asyncio
import json
import uuid
import numpy as np
import logging
from concurrent.futures import ThreadPoolExecutor
import threading

from ..main import verify_token, find_user_by_id, log_audit

router = APIRouter(prefix="/api/v1/monitoring", tags=["Monitoring Temps Réel"])
logger = logging.getLogger("realtime_monitoring")

# ===== MODÈLES PYDANTIC =====

class MonitoringRuleType(str, Enum):
    SCR_MCR_THRESHOLD = "scr_mcr_threshold"
    LIQUIDITY_RATIO = "liquidity_ratio"
    TECHNICAL_PROVISIONS_VARIATION = "technical_provisions_variation"
    TRIANGLE_ANOMALY = "triangle_anomaly"
    CONCENTRATION_RISK = "concentration_risk"
    MARKET_SHOCK = "market_shock"
    OPERATIONAL_ALERT = "operational_alert"

class AlertSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class EscalationLevel(str, Enum):
    ACTUAIRE = "actuaire"
    CHEF_ACTUAIRE = "chef_actuaire"
    DIRECTION = "direction"
    CONSEIL = "conseil"
    AUTORITE = "autorite"  # ACPR/EIOPA

class MonitoringRule(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str
    rule_type: MonitoringRuleType
    is_active: bool = True
    
    # Seuils et paramètres
    warning_threshold: float
    critical_threshold: float
    blocking_threshold: Optional[float] = None
    
    # Configuration d'escalade
    escalation_delays: Dict[AlertSeverity, int] = Field(default_factory=lambda: {
        AlertSeverity.LOW: 60,      # 1 heure
        AlertSeverity.MEDIUM: 30,   # 30 minutes
        AlertSeverity.HIGH: 15,     # 15 minutes
        AlertSeverity.CRITICAL: 5   # 5 minutes
    })
    
    # Destinataires par niveau
    escalation_targets: Dict[EscalationLevel, List[str]] = Field(default_factory=dict)
    
    # Métadonnées
    created_by: Optional[int] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_triggered: Optional[datetime] = None

class RealTimeAlert(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    rule_id: str
    rule_name: str
    severity: AlertSeverity
    current_value: float
    threshold_value: float
    deviation_percent: float
    
    # Contexte
    calculation_id: Optional[str] = None
    triangle_id: Optional[str] = None
    business_line: Optional[str] = None
    
    # Timing et escalade
    triggered_at: datetime = Field(default_factory=datetime.utcnow)
    acknowledged_at: Optional[datetime] = None
    acknowledged_by: Optional[int] = None
    escalated_at: Optional[datetime] = None
    escalation_level: EscalationLevel = EscalationLevel.ACTUAIRE
    
    # Actions prises
    actions_taken: List[str] = Field(default_factory=list)
    resolution_notes: Optional[str] = None
    resolved_at: Optional[datetime] = None

class MarketData(BaseModel):
    """Données de marché pour surveillance"""
    date: datetime
    risk_free_rates: Dict[str, float]  # EUR, USD, etc.
    equity_indices: Dict[str, float]   # EURO STOXX 50, etc.
    credit_spreads: Dict[str, float]   # AAA, BBB, etc.
    fx_rates: Dict[str, float]         # EUR/USD, etc.
    volatilities: Dict[str, float]     # Implied vol indices

class SystemHealth(BaseModel):
    overall_status: str  # healthy, warning, critical
    active_alerts_count: int
    critical_alerts_count: int
    last_calculation_time: Optional[datetime] = None
    system_load: float
    database_health: str
    api_response_time: float

# ===== STORAGE SIMULÉ =====

MONITORING_RULES: List[MonitoringRule] = []
REALTIME_ALERTS: List[RealTimeAlert] = []
MARKET_DATA_HISTORY: List[MarketData] = []
CONNECTED_WEBSOCKETS: Set[WebSocket] = set()
SYSTEM_METRICS = {
    "last_health_check": datetime.utcnow(),
    "alerts_sent_today": 0,
    "escalations_today": 0,
    "avg_response_time": 0.0
}

# Surveillance en arrière-plan
monitoring_active = False
monitoring_task = None

# ===== RÈGLES DE SURVEILLANCE PAR DÉFAUT =====

DEFAULT_MONITORING_RULES = [
    {
        "name": "Ratio de Solvabilité SCR",
        "description": "Surveillance du ratio SCR en temps réel",
        "rule_type": MonitoringRuleType.SCR_MCR_THRESHOLD,
        "warning_threshold": 120.0,  # 120%
        "critical_threshold": 110.0,  # 110%
        "blocking_threshold": 100.0,   # 100%
        "escalation_targets": {
            EscalationLevel.ACTUAIRE: ["actuaire@company.com"],
            EscalationLevel.DIRECTION: ["direction@company.com"],
            EscalationLevel.CONSEIL: ["conseil@company.com"]
        }
    },
    {
        "name": "Ratio MCR",
        "description": "Surveillance du ratio MCR",
        "rule_type": MonitoringRuleType.SCR_MCR_THRESHOLD,
        "warning_threshold": 130.0,
        "critical_threshold": 110.0,
        "blocking_threshold": 100.0,
        "escalation_targets": {
            EscalationLevel.DIRECTION: ["direction@company.com"],
            EscalationLevel.AUTORITE: ["acpr@banque-france.fr"]
        }
    },
    {
        "name": "Variation Provisions Techniques",
        "description": "Alerte sur variations importantes des provisions",
        "rule_type": MonitoringRuleType.TECHNICAL_PROVISIONS_VARIATION,
        "warning_threshold": 10.0,   # 10%
        "critical_threshold": 20.0,  # 20%
        "blocking_threshold": 30.0,  # 30%
        "escalation_targets": {
            EscalationLevel.CHEF_ACTUAIRE: ["chef.actuaire@company.com"],
            EscalationLevel.DIRECTION: ["direction@company.com"]
        }
    },
    {
        "name": "Anomalies Triangle",
        "description": "Détection d'anomalies statistiques dans les triangles",
        "rule_type": MonitoringRuleType.TRIANGLE_ANOMALY,
        "warning_threshold": 2.0,    # 2 écarts-types
        "critical_threshold": 3.0,   # 3 écarts-types
        "escalation_targets": {
            EscalationLevel.ACTUAIRE: ["actuaire@company.com"]
        }
    },
    {
        "name": "Ratio de Liquidité",
        "description": "Surveillance du ratio de liquidité",
        "rule_type": MonitoringRuleType.LIQUIDITY_RATIO,
        "warning_threshold": 120.0,
        "critical_threshold": 110.0,
        "blocking_threshold": 100.0,
        "escalation_targets": {
            EscalationLevel.DIRECTION: ["direction@company.com"]
        }
    }
]

# ===== FONCTIONS DE SURVEILLANCE =====

def init_default_rules():
    """Initialiser les règles par défaut"""
    global MONITORING_RULES
    if not MONITORING_RULES:
        for rule_data in DEFAULT_MONITORING_RULES:
            rule = MonitoringRule(**rule_data)
            MONITORING_RULES.append(rule)
        logger.info(f"Initialized {len(MONITORING_RULES)} default monitoring rules")

def simulate_market_data() -> MarketData:
    """Simuler des données de marché temps réel"""
    base_date = datetime.utcnow()
    
    # Simulation réaliste avec tendances
    return MarketData(
        date=base_date,
        risk_free_rates={
            "EUR": 0.025 + np.random.normal(0, 0.001),  # 2.5% +/- volatilité
            "USD": 0.045 + np.random.normal(0, 0.002),
            "GBP": 0.040 + np.random.normal(0, 0.0015)
        },
        equity_indices={
            "EURO_STOXX_50": 4200 + np.random.normal(0, 50),
            "CAC_40": 7500 + np.random.normal(0, 100),
            "DAX": 16000 + np.random.normal(0, 200)
        },
        credit_spreads={
            "AAA": 0.005 + np.random.normal(0, 0.0005),
            "BBB": 0.015 + np.random.normal(0, 0.002),
            "HIGH_YIELD": 0.045 + np.random.normal(0, 0.005)
        },
        fx_rates={
            "EUR_USD": 1.08 + np.random.normal(0, 0.01),
            "EUR_GBP": 0.85 + np.random.normal(0, 0.005),
            "EUR_JPY": 160 + np.random.normal(0, 2)
        },
        volatilities={
            "VIX": 18 + np.random.normal(0, 2),
            "VSTOXX": 16 + np.random.normal(0, 1.5)
        }
    )

def calculate_solvency_ratios() -> Dict[str, float]:
    """Calculer les ratios de solvabilité actuels (simulation)"""
    # En réalité, ceci ferait appel à vos APIs de calcul
    base_scr_ratio = 180.0  # 180% de base
    base_mcr_ratio = 220.0  # 220% de base
    
    # Ajouter de la volatilité réaliste
    scr_variation = np.random.normal(0, 5)  # Volatilité de 5%
    mcr_variation = np.random.normal(0, 8)  # Volatilité de 8%
    
    return {
        "scr_ratio": max(90, base_scr_ratio + scr_variation),
        "mcr_ratio": max(100, base_mcr_ratio + mcr_variation),
        "tier1_ratio": 85.0 + np.random.normal(0, 3),
        "liquidity_ratio": 150.0 + np.random.normal(0, 10)
    }

def detect_triangle_anomalies() -> List[Dict[str, Any]]:
    """Détecter des anomalies dans les triangles"""
    anomalies = []
    
    # Simulation d'anomalies possibles
    if np.random.random() < 0.1:  # 10% de chance d'anomalie
        anomalies.append({
            "triangle_id": f"triangle_{uuid.uuid4().hex[:8]}",
            "anomaly_type": "outlier_detection",
            "affected_cell": (np.random.randint(1, 10), np.random.randint(1, 10)),
            "z_score": np.random.uniform(2.5, 4.0),
            "description": "Valeur aberrante détectée dans le triangle",
            "severity": "medium" if np.random.random() > 0.3 else "high"
        })
    
    if np.random.random() < 0.05:  # 5% de chance d'anomalie critique
        anomalies.append({
            "triangle_id": f"triangle_{uuid.uuid4().hex[:8]}",
            "anomaly_type": "development_pattern_break",
            "affected_period": np.random.randint(1, 5),
            "deviation_percent": np.random.uniform(25, 50),
            "description": "Rupture dans le pattern de développement",
            "severity": "critical"
        })
    
    return anomalies

def evaluate_monitoring_rules() -> List[RealTimeAlert]:
    """Évaluer toutes les règles de surveillance"""
    new_alerts = []
    current_time = datetime.utcnow()
    
    # Obtenir les métriques actuelles
    solvency_ratios = calculate_solvency_ratios()
    market_data = simulate_market_data()
    triangle_anomalies = detect_triangle_anomalies()
    
    # Évaluer chaque règle active
    for rule in MONITORING_RULES:
        if not rule.is_active:
            continue
            
        alerts = []
        
        if rule.rule_type == MonitoringRuleType.SCR_MCR_THRESHOLD:
            if "scr" in rule.name.lower():
                current_value = solvency_ratios["scr_ratio"]
                alerts.extend(check_threshold_rule(rule, current_value, "SCR Ratio"))
            elif "mcr" in rule.name.lower():
                current_value = solvency_ratios["mcr_ratio"]
                alerts.extend(check_threshold_rule(rule, current_value, "MCR Ratio"))
                
        elif rule.rule_type == MonitoringRuleType.LIQUIDITY_RATIO:
            current_value = solvency_ratios["liquidity_ratio"]
            alerts.extend(check_threshold_rule(rule, current_value, "Liquidity Ratio"))
            
        elif rule.rule_type == MonitoringRuleType.TRIANGLE_ANOMALY:
            for anomaly in triangle_anomalies:
                if anomaly["severity"] == "critical" and anomaly["z_score"] > rule.critical_threshold:
                    alert = RealTimeAlert(
                        rule_id=rule.id,
                        rule_name=rule.name,
                        severity=AlertSeverity.CRITICAL,
                        current_value=anomaly["z_score"],
                        threshold_value=rule.critical_threshold,
                        deviation_percent=((anomaly["z_score"] - rule.critical_threshold) / rule.critical_threshold) * 100,
                        triangle_id=anomaly["triangle_id"],
                        business_line="simulation"
                    )
                    alerts.append(alert)
                    
        elif rule.rule_type == MonitoringRuleType.TECHNICAL_PROVISIONS_VARIATION:
            # Simulation d'une variation de provisions
            if np.random.random() < 0.15:  # 15% de chance
                variation = np.random.uniform(5, 35)  # 5% à 35% de variation
                if variation > rule.warning_threshold:
                    severity = AlertSeverity.CRITICAL if variation > rule.critical_threshold else AlertSeverity.MEDIUM
                    alert = RealTimeAlert(
                        rule_id=rule.id,
                        rule_name=rule.name,
                        severity=severity,
                        current_value=variation,
                        threshold_value=rule.warning_threshold,
                        deviation_percent=((variation - rule.warning_threshold) / rule.warning_threshold) * 100,
                        business_line="RC_Auto"
                    )
                    alerts.append(alert)
        
        # Ajouter les nouvelles alertes
        for alert in alerts:
            rule.last_triggered = current_time
            new_alerts.append(alert)
            REALTIME_ALERTS.append(alert)
    
    return new_alerts

def check_threshold_rule(rule: MonitoringRule, current_value: float, metric_name: str) -> List[RealTimeAlert]:
    """Vérifier une règle de seuil"""
    alerts = []
    
    # Déterminer la sévérité
    severity = None
    threshold_value = None
    
    if rule.blocking_threshold and current_value <= rule.blocking_threshold:
        severity = AlertSeverity.CRITICAL
        threshold_value = rule.blocking_threshold
    elif current_value <= rule.critical_threshold:
        severity = AlertSeverity.HIGH
        threshold_value = rule.critical_threshold
    elif current_value <= rule.warning_threshold:
        severity = AlertSeverity.MEDIUM
        threshold_value = rule.warning_threshold
    
    if severity:
        deviation = ((threshold_value - current_value) / threshold_value) * 100
        alert = RealTimeAlert(
            rule_id=rule.id,
            rule_name=rule.name,
            severity=severity,
            current_value=current_value,
            threshold_value=threshold_value,
            deviation_percent=deviation
        )
        alerts.append(alert)
    
    return alerts

async def send_alert_notifications(alerts: List[RealTimeAlert]):
    """Envoyer les notifications d'alerte"""
    for alert in alerts:
        # Trouver la règle correspondante
        rule = next((r for r in MONITORING_RULES if r.id == alert.rule_id), None)
        if not rule:
            continue
            
        # Déterminer les destinataires selon le niveau d'escalade
        targets = rule.escalation_targets.get(alert.escalation_level, [])
        
        # Simulation d'envoi de notifications
        notification_data = {
            "alert_id": alert.id,
            "severity": alert.severity,
            "message": f"ALERTE {alert.severity.upper()}: {alert.rule_name}",
            "details": f"Valeur: {alert.current_value:.2f}, Seuil: {alert.threshold_value:.2f}",
            "targets": targets,
            "timestamp": alert.triggered_at.isoformat()
        }
        
        logger.warning(f"ALERT SENT: {notification_data}")
        
        # Broadcast WebSocket pour interface temps réel
        await broadcast_alert(alert)
        
        SYSTEM_METRICS["alerts_sent_today"] += 1

async def broadcast_alert(alert: RealTimeAlert):
    """Diffuser une alerte via WebSocket"""
    message = {
        "type": "realtime_alert",
        "data": {
            "id": alert.id,
            "severity": alert.severity,
            "rule_name": alert.rule_name,
            "current_value": alert.current_value,
            "threshold_value": alert.threshold_value,
            "deviation_percent": alert.deviation_percent,
            "triggered_at": alert.triggered_at.isoformat(),
            "business_line": alert.business_line
        }
    }
    
    # Envoyer à tous les WebSockets connectés
    disconnected = set()
    for websocket in CONNECTED_WEBSOCKETS:
        try:
            await websocket.send_text(json.dumps(message))
        except:
            disconnected.add(websocket)
    
    # Nettoyer les connexions fermées
    CONNECTED_WEBSOCKETS -= disconnected

async def monitoring_loop():
    """Boucle principale de surveillance"""
    global monitoring_active
    monitoring_active = True
    
    logger.info("Starting real-time monitoring loop")
    
    while monitoring_active:
        try:
            # Évaluer les règles de surveillance
            new_alerts = evaluate_monitoring_rules()
            
            if new_alerts:
                await send_alert_notifications(new_alerts)
                logger.info(f"Generated {len(new_alerts)} new alerts")
            
            # Mettre à jour les données de marché
            market_data = simulate_market_data()
            MARKET_DATA_HISTORY.append(market_data)
            
            # Garder seulement les 1000 derniers points
            if len(MARKET_DATA_HISTORY) > 1000:
                MARKET_DATA_HISTORY.pop(0)
            
            # Broadcast des métriques système
            await broadcast_system_health()
            
            # Attendre avant la prochaine évaluation
            await asyncio.sleep(30)  # Vérification toutes les 30 secondes
            
        except Exception as e:
            logger.error(f"Error in monitoring loop: {str(e)}")
            await asyncio.sleep(60)  # Attendre plus longtemps en cas d'erreur

async def broadcast_system_health():
    """Diffuser l'état de santé du système"""
    active_alerts = len([a for a in REALTIME_ALERTS if not a.resolved_at])
    critical_alerts = len([a for a in REALTIME_ALERTS if a.severity == AlertSeverity.CRITICAL and not a.resolved_at])
    
    health = SystemHealth(
        overall_status="critical" if critical_alerts > 0 else "warning" if active_alerts > 5 else "healthy",
        active_alerts_count=active_alerts,
        critical_alerts_count=critical_alerts,
        last_calculation_time=datetime.utcnow() - timedelta(minutes=np.random.randint(5, 60)),
        system_load=np.random.uniform(0.3, 0.8),
        database_health="healthy",
        api_response_time=np.random.uniform(50, 200)
    )
    
    message = {
        "type": "system_health",
        "data": health.dict()
    }
    
    # Broadcast à tous les clients connectés
    disconnected = set()
    for websocket in CONNECTED_WEBSOCKETS:
        try:
            await websocket.send_text(json.dumps(message))
        except:
            disconnected.add(websocket)
    
    CONNECTED_WEBSOCKETS -= disconnected

# ===== ENDPOINTS REST =====

@router.on_event("startup")
async def startup_monitoring():
    """Démarrer le monitoring au démarrage"""
    init_default_rules()
    
    # Démarrer la surveillance en arrière-plan
    global monitoring_task
    monitoring_task = asyncio.create_task(monitoring_loop())

@router.on_event("shutdown")
async def shutdown_monitoring():
    """Arrêter le monitoring"""
    global monitoring_active, monitoring_task
    monitoring_active = False
    if monitoring_task:
        monitoring_task.cancel()

@router.get("/dashboard")
async def get_monitoring_dashboard(current_user: dict = Depends(verify_token)):
    """Dashboard de monitoring temps réel"""
    
    # Statistiques des alertes
    active_alerts = [a for a in REALTIME_ALERTS if not a.resolved_at]
    alerts_last_24h = [a for a in REALTIME_ALERTS if a.triggered_at >= datetime.utcnow() - timedelta(days=1)]
    
    # Métriques par sévérité
    alerts_by_severity = {
        AlertSeverity.LOW: len([a for a in active_alerts if a.severity == AlertSeverity.LOW]),
        AlertSeverity.MEDIUM: len([a for a in active_alerts if a.severity == AlertSeverity.MEDIUM]),
        AlertSeverity.HIGH: len([a for a in active_alerts if a.severity == AlertSeverity.HIGH]),
        AlertSeverity.CRITICAL: len([a for a in active_alerts if a.severity == AlertSeverity.CRITICAL])
    }
    
    # Règles actives
    active_rules = [r for r in MONITORING_RULES if r.is_active]
    
    # Données de marché récentes
    latest_market_data = MARKET_DATA_HISTORY[-1] if MARKET_DATA_HISTORY else None
    
    # Ratios actuels
    current_ratios = calculate_solvency_ratios()
    
    return {
        "success": True,
        "dashboard": {
            "summary": {
                "active_alerts": len(active_alerts),
                "critical_alerts": alerts_by_severity[AlertSeverity.CRITICAL],
                "alerts_last_24h": len(alerts_last_24h),
                "active_rules": len(active_rules),
                "monitoring_status": "active" if monitoring_active else "inactive",
                "last_evaluation": datetime.utcnow().isoformat()
            },
            "alerts_by_severity": alerts_by_severity,
            "current_ratios": current_ratios,
            "market_data": latest_market_data.dict() if latest_market_data else None,
            "recent_alerts": sorted(active_alerts, key=lambda x: x.triggered_at, reverse=True)[:10],
            "system_metrics": SYSTEM_METRICS
        }
    }

@router.get("/rules")
async def get_monitoring_rules(current_user: dict = Depends(verify_token)):
    """Récupérer les règles de surveillance"""
    return {
        "success": True,
        "rules": [rule.dict() for rule in MONITORING_RULES],
        "total": len(MONITORING_RULES)
    }

@router.post("/rules")
async def create_monitoring_rule(
    rule: MonitoringRule,
    current_user: dict = Depends(verify_token)
):
    """Créer une nouvelle règle de surveillance"""
    
    user = find_user_by_id(current_user["user_id"])
    if not user or user["role"] not in ["CHEF_ACTUAIRE", "DIRECTION", "ADMIN"]:
        raise HTTPException(status_code=403, detail="Permissions insuffisantes")
    
    rule.created_by = current_user["user_id"]
    rule.created_at = datetime.utcnow()
    
    MONITORING_RULES.append(rule)
    
    log_audit(current_user["user_id"], "MONITORING_RULE_CREATED", f"Règle créée: {rule.name}", "")
    
    return {
        "success": True,
        "rule_id": rule.id,
        "message": "Règle de surveillance créée"
    }

@router.put("/rules/{rule_id}")
async def update_monitoring_rule(
    rule_id: str,
    rule_update: Dict[str, Any],
    current_user: dict = Depends(verify_token)
):
    """Mettre à jour une règle de surveillance"""
    
    user = find_user_by_id(current_user["user_id"])
    if not user or user["role"] not in ["CHEF_ACTUAIRE", "DIRECTION", "ADMIN"]:
        raise HTTPException(status_code=403, detail="Permissions insuffisantes")
    
    rule = next((r for r in MONITORING_RULES if r.id == rule_id), None)
    if not rule:
        raise HTTPException(status_code=404, detail="Règle introuvable")
    
    # Mettre à jour les champs autorisés
    allowed_fields = ["name", "description", "is_active", "warning_threshold", "critical_threshold", "blocking_threshold"]
    for field, value in rule_update.items():
        if field in allowed_fields:
            setattr(rule, field, value)
    
    log_audit(current_user["user_id"], "MONITORING_RULE_UPDATED", f"Règle mise à jour: {rule.name}", "")
    
    return {
        "success": True,
        "message": "Règle mise à jour"
    }

@router.get("/alerts/active")
async def get_active_alerts(
    severity: Optional[AlertSeverity] = None,
    limit: int = 100,
    current_user: dict = Depends(verify_token)
):
    """Récupérer les alertes actives"""
    
    active_alerts = [a for a in REALTIME_ALERTS if not a.resolved_at]
    
    if severity:
        active_alerts = [a for a in active_alerts if a.severity == severity]
    
    # Trier par sévérité puis par date
    severity_order = {AlertSeverity.CRITICAL: 0, AlertSeverity.HIGH: 1, AlertSeverity.MEDIUM: 2, AlertSeverity.LOW: 3}
    active_alerts.sort(key=lambda x: (severity_order[x.severity], x.triggered_at), reverse=True)
    
    return {
        "success": True,
        "alerts": [alert.dict() for alert in active_alerts[:limit]],
        "total": len(active_alerts)
    }

@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: str,
    current_user: dict = Depends(verify_token)
):
    """Acquitter une alerte"""
    
    alert = next((a for a in REALTIME_ALERTS if a.id == alert_id), None)
    if not alert:
        raise HTTPException(status_code=404, detail="Alerte introuvable")
    
    if alert.acknowledged_at:
        raise HTTPException(status_code=400, detail="Alerte déjà acquittée")
    
    alert.acknowledged_at = datetime.utcnow()
    alert.acknowledged_by = current_user["user_id"]
    
    log_audit(current_user["user_id"], "ALERT_ACKNOWLEDGED", f"Alerte acquittée: {alert.rule_name}", "")
    
    return {
        "success": True,
        "message": "Alerte acquittée"
    }

@router.post("/alerts/{alert_id}/resolve")
async def resolve_alert(
    alert_id: str,
    resolution_notes: str,
    current_user: dict = Depends(verify_token)
):
    """Résoudre une alerte"""
    
    alert = next((a for a in REALTIME_ALERTS if a.id == alert_id), None)
    if not alert:
        raise HTTPException(status_code=404, detail="Alerte introuvable")
    
    alert.resolved_at = datetime.utcnow()
    alert.resolution_notes = resolution_notes
    alert.actions_taken.append(f"Résolu par {find_user_by_id(current_user['user_id'])['first_name']}")
    
    log_audit(current_user["user_id"], "ALERT_RESOLVED", f"Alerte résolue: {alert.rule_name}", "")
    
    return {
        "success": True,
        "message": "Alerte résolue"
    }

@router.get("/market-data/current")
async def get_current_market_data(current_user: dict = Depends(verify_token)):
    """Récupérer les données de marché actuelles"""
    
    latest_data = MARKET_DATA_HISTORY[-1] if MARKET_DATA_HISTORY else None
    
    if not latest_data:
        # Générer des données si aucune n'existe
        latest_data = simulate_market_data()
        MARKET_DATA_HISTORY.append(latest_data)
    
    return {
        "success": True,
        "market_data": latest_data.dict(),
        "timestamp": latest_data.date.isoformat()
    }

@router.get("/market-data/history")
async def get_market_data_history(
    hours: int = 24,
    current_user: dict = Depends(verify_token)
):
    """Récupérer l'historique des données de marché"""
    
    cutoff_time = datetime.utcnow() - timedelta(hours=hours)
    recent_data = [data for data in MARKET_DATA_HISTORY if data.date >= cutoff_time]
    
    return {
        "success": True,
        "market_data": [data.dict() for data in recent_data],
        "period_hours": hours,
        "data_points": len(recent_data)
    }

# ===== WEBSOCKET POUR TEMPS RÉEL =====

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket pour mises à jour temps réel"""
    await websocket.accept()
    CONNECTED_WEBSOCKETS.add(websocket)
    
    try:
        # Envoyer l'état initial
        initial_data = {
            "type": "connection_established",
            "data": {
                "connected_at": datetime.utcnow().isoformat(),
                "monitoring_active": monitoring_active,
                "active_alerts": len([a for a in REALTIME_ALERTS if not a.resolved_at])
            }
        }
        await websocket.send_text(json.dumps(initial_data))
        
        # Maintenir la connexion ouverte
        while True:
            # Ping/keepalive
            await websocket.receive_text()
            
    except WebSocketDisconnect:
        CONNECTED_WEBSOCKETS.discard(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
        CONNECTED_WEBSOCKETS.discard(websocket)

@router.post("/test-alert")
async def trigger_test_alert(current_user: dict = Depends(verify_token)):
    """Déclencher une alerte de test"""
    
    user = find_user_by_id(current_user["user_id"])
    if not user or user["role"] not in ["ADMIN", "CHEF_ACTUAIRE"]:
        raise HTTPException(status_code=403, detail="Permissions insuffisantes")
    
    # Créer une alerte de test
    test_alert = RealTimeAlert(
        rule_id="test_rule",
        rule_name="Test Alert",
        severity=AlertSeverity.MEDIUM,
        current_value=95.0,
        threshold_value=100.0,
        deviation_percent=5.0,
        business_line="Test"
    )
    
    REALTIME_ALERTS.append(test_alert)
    
    # Diffuser l'alerte
    await broadcast_alert(test_alert)
    
    log_audit(current_user["user_id"], "TEST_ALERT_TRIGGERED", "Alerte de test déclenchée", "")
    
    return {
        "success": True,
        "alert_id": test_alert.id,
        "message": "Alerte de test déclenchée"
    }