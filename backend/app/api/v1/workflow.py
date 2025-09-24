from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timedelta
import random
from typing import List

from app.main import verify_token

router = APIRouter()

@router.get("/dashboard")
async def get_workflow_dashboard(current_user: dict = Depends(verify_token)):
    """Dashboard des workflows d'approbation"""
    
    # Simulation de données de workflow
    total_workflows = random.randint(20, 50)
    pending_approvals = random.randint(2, 8)
    approved = random.randint(15, 30)
    rejected = max(0, total_workflows - pending_approvals - approved)
    
    workflows = []
    
    # Génération de workflows simulés
    workflow_templates = [
        "Validation Calculs Provisions Q4 2024",
        "Approbation Méthode IFRS 17 - Automobile", 
        "Révision Paramètres Chain Ladder",
        "Validation Stress Tests Solvabilité II",
        "Approbation Nouveaux Triangles - Construction",
        "Modification Taux d'Actualisation"
    ]
    
    for i in range(min(pending_approvals, 6)):
        workflows.append({
            "id": str(i + 1),
            "title": random.choice(workflow_templates),
            "status": "pending_approval",
            "currentLevel": random.randint(1, 3),
            "maxLevel": 3,
            "submittedBy": random.choice(["Jean Dupont", "Marie Martin", "Pierre Durant", "Sophie Moreau"]),
            "submittedDate": (datetime.utcnow() - timedelta(days=random.randint(1, 15))).isoformat(),
            "priority": random.choice(["low", "medium", "high"]),
            "approvers": [
                {
                    "level": 1,
                    "name": "Chef Actuaire",
                    "status": "approved" if i > 0 else "pending",
                    "date": (datetime.utcnow() - timedelta(days=random.randint(0, 5))).isoformat() if i > 0 else None
                },
                {
                    "level": 2,
                    "name": "Directeur Technique", 
                    "status": "pending",
                    "date": None
                },
                {
                    "level": 3,
                    "name": "Direction Générale",
                    "status": "pending", 
                    "date": None
                }
            ]
        })
    
    return {
        "dashboard": {
            "summary": {
                "totalWorkflows": total_workflows,
                "pendingApprovals": pending_approvals,
                "approvedThisMonth": approved,
                "rejectedThisMonth": rejected,
                "averageApprovalTime": round(random.uniform(2.5, 7.8), 1),  # en jours
                "approvalRate": round((approved / max(total_workflows, 1)) * 100, 1)
            },
            "workflows": workflows,
            "statistics": {
                "byPriority": {
                    "high": max(1, pending_approvals // 3),
                    "medium": max(1, pending_approvals // 2), 
                    "low": max(0, pending_approvals - (pending_approvals // 3) - (pending_approvals // 2))
                },
                "byLevel": {
                    "level1": max(1, pending_approvals // 3),
                    "level2": max(1, pending_approvals // 2),
                    "level3": max(0, pending_approvals - (pending_approvals // 3) - (pending_approvals // 2))
                },
                "overdueCount": max(0, random.randint(-1, 2))
            }
        }
    }

@router.get("/list")
async def get_workflows(
    status: str = None,
    priority: str = None,
    current_user: dict = Depends(verify_token)
):
    """Liste des workflows avec filtres optionnels"""
    
    # Simulation de liste complète
    workflows = []
    for i in range(random.randint(15, 25)):
        workflow_status = random.choice(["pending_approval", "approved", "rejected", "draft"])
        workflows.append({
            "id": str(i + 1),
            "title": f"Workflow {i + 1}",
            "status": workflow_status,
            "priority": random.choice(["low", "medium", "high"]),
            "submittedDate": (datetime.utcnow() - timedelta(days=random.randint(1, 30))).isoformat(),
            "lastActivity": (datetime.utcnow() - timedelta(hours=random.randint(1, 48))).isoformat()
        })
    
    # Appliquer filtres
    if status:
        workflows = [w for w in workflows if w["status"] == status]
    if priority:
        workflows = [w for w in workflows if w["priority"] == priority]
    
    return {
        "workflows": workflows,
        "total": len(workflows),
        "filters": {
            "status": status,
            "priority": priority
        }
    }

@router.post("/submit")
async def submit_workflow(workflow_data: dict, current_user: dict = Depends(verify_token)):
    """Soumettre un nouveau workflow"""
    
    return {
        "success": True,
        "workflowId": f"WF_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}",
        "message": "Workflow soumis avec succès pour approbation",
        "submittedAt": datetime.utcnow().isoformat()
    }

@router.post("/{workflow_id}/approve")
async def approve_workflow(workflow_id: str, approval_data: dict, current_user: dict = Depends(verify_token)):
    """Approuver un workflow"""
    
    return {
        "success": True,
        "workflowId": workflow_id,
        "message": "Workflow approuvé avec succès",
        "approvedBy": current_user.get("email"),
        "approvedAt": datetime.utcnow().isoformat()
    }

@router.post("/{workflow_id}/reject")  
async def reject_workflow(workflow_id: str, rejection_data: dict, current_user: dict = Depends(verify_token)):
    """Rejeter un workflow"""
    
    return {
        "success": True,
        "workflowId": workflow_id,
        "message": "Workflow rejeté",
        "rejectedBy": current_user.get("email"),
        "rejectedAt": datetime.utcnow().isoformat(),
        "reason": rejection_data.get("reason", "Aucune raison spécifiée")
    }