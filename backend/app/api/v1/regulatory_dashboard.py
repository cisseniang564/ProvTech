from fastapi import APIRouter, Depends, HTTPException, Request
from datetime import datetime, timedelta
import random
from typing import List, Optional
import logging

# Import du système d'authentification depuis main.py
from app.main import verify_token

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/overview")
async def get_regulatory_dashboard_overview(current_user: dict = Depends(verify_token)):
    """Vue d'ensemble du dashboard réglementaire"""
    
    # Simulation de données réalistes
    compliance_score = random.uniform(82, 95)
    active_alerts = random.randint(0, 5)
    pending_approvals = random.randint(0, 8)
    
    # Détermination du statut système
    if active_alerts == 0 and compliance_score > 90:
        system_status = "healthy"
    elif active_alerts <= 2 and compliance_score > 80:
        system_status = "warning"
    elif active_alerts <= 4 and compliance_score > 70:
        system_status = "critical"
    else:
        system_status = "emergency"
    
    return {
        "data": {
            "overview": {
                "complianceScore": round(compliance_score, 1),
                "activeAlerts": active_alerts,
                "pendingApprovals": pending_approvals,
                "systemStatus": system_status,
                "lastUpdate": datetime.utcnow().isoformat()
            },
            "workflows": {
                "totalSubmissions": random.randint(15, 35),
                "pendingApprovals": pending_approvals,
                "approvalRate": round(random.uniform(88, 98), 1),
                "overdueSubmissions": max(0, random.randint(-1, 3))
            },
            "controls": {
                "totalExecutions": random.randint(120, 200),
                "averageScore": round(compliance_score, 1),
                "failureRate": round(random.uniform(1, 8), 1),
                "activeAlertsCount": max(0, active_alerts - 2)
            },
            "monitoring": {
                "solvencyRatio": round(random.uniform(145, 180), 1),
                "mcrCoverage": round(random.uniform(200, 280), 1),
                "liquidityRatio": round(random.uniform(18, 25), 1),
                "overallStatus": "healthy" if random.random() > 0.3 else "warning"
            },
            "qrt": {
                "lastSubmission": (datetime.utcnow() - timedelta(days=random.randint(5, 15))).isoformat(),
                "nextDeadline": (datetime.utcnow() + timedelta(days=random.randint(30, 90))).isoformat(),
                "templatesReady": random.randint(40, 50),
                "validationStatus": random.choice(["validated", "pending", "rejected"])
            },
            "documentation": {
                "documentsGenerated": random.randint(8, 18),
                "complianceRate": round(random.uniform(92, 99), 1),
                "lastGeneration": (datetime.utcnow() - timedelta(hours=random.randint(1, 48))).isoformat()
            }
        }
    }

@router.get("/alerts")
async def get_system_alerts(current_user: dict = Depends(verify_token)):
    """Récupérer les alertes système"""
    
    alerts = []
    
    # Génération d'alertes aléatoires réalistes
    alert_types = [
        {
            "type": "control",
            "severity": "warning",
            "title": "Contrôle de cohérence IFRS 17",
            "description": "Écart détecté entre les méthodes Chain Ladder et Bornhuetter-Ferguson supérieur à 5%"
        },
        {
            "type": "workflow", 
            "severity": "info",
            "title": "Approbation en attente",
            "description": "Validation des provisions Q4 2024 en attente d'approbation du Directeur Technique"
        },
        {
            "type": "monitoring",
            "severity": "critical", 
            "title": "Ratio de solvabilité",
            "description": "Le ratio SCR est passé sous le seuil d'alerte de 150%"
        },
        {
            "type": "qrt",
            "severity": "warning",
            "title": "Échéance QRT proche",
            "description": "Soumission des templates EIOPA dans moins de 15 jours"
        },
        {
            "type": "system",
            "severity": "blocking",
            "title": "Erreur de synchronisation",
            "description": "Échec de synchronisation avec le système comptable depuis 4 heures"
        }
    ]
    
    # Sélectionner aléatoirement 0-4 alertes
    num_alerts = random.randint(0, 4)
    selected_alerts = random.sample(alert_types, min(num_alerts, len(alert_types)))
    
    for i, alert_data in enumerate(selected_alerts):
        alerts.append({
            "id": str(i + 1),
            "type": alert_data["type"],
            "severity": alert_data["severity"],
            "title": alert_data["title"],
            "description": alert_data["description"],
            "timestamp": (datetime.utcnow() - timedelta(minutes=random.randint(10, 1440))).isoformat(),
            "acknowledged": random.random() < 0.3,  # 30% des alertes sont acquittées
            "actionRequired": "Vérification et validation requises" if alert_data["severity"] in ["critical", "blocking"] else None
        })
    
    return {"alerts": alerts}

@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str, current_user: dict = Depends(verify_token)):
    """Acquitter une alerte"""
    logger.info(f"Alerte {alert_id} acquittée par l'utilisateur {current_user.get('user_id')}")
    return {
        "success": True, 
        "message": f"Alerte {alert_id} acquittée avec succès",
        "timestamp": datetime.utcnow().isoformat()
    }

@router.post("/export-compliance")
async def export_compliance_report(current_user: dict = Depends(verify_token)):
    """Exporter le rapport de conformité"""
    logger.info(f"Export rapport de conformité demandé par l'utilisateur {current_user.get('user_id')}")
    
    # Simulation d'export
    return {
        "success": True,
        "message": "Rapport de conformité généré avec succès",
        "filename": f"compliance_report_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.pdf",
        "size": random.randint(1024, 5120),  # Taille en KB
        "generatedAt": datetime.utcnow().isoformat()
    }