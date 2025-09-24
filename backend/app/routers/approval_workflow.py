# backend/app/routers/approval_workflow.py
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, EmailStr
from enum import Enum
import uuid
import hashlib
import logging

# Import from the auth module instead of main
from ..auth import verify_token, find_user_by_id, log_audit, USERS_DB

router = APIRouter(prefix="/api/v1/workflow", tags=["Workflow Approbation"])
logger = logging.getLogger("workflow")

# ===== MODÈLES PYDANTIC =====

class ApprovalStatus(str, Enum):
    DRAFT = "draft"
    PENDING_ACTUAIRE = "pending_actuaire"
    PENDING_DIRECTION = "pending_direction" 
    PENDING_CONSEIL = "pending_conseil"
    APPROVED = "approved"
    REJECTED = "rejected"
    LOCKED = "locked"

class ApprovalLevel(str, Enum):
    ACTUAIRE_JUNIOR = "actuaire_junior"
    ACTUAIRE_SENIOR = "actuaire_senior"
    CHEF_ACTUAIRE = "chef_actuaire"
    DIRECTION = "direction"
    CONSEIL = "conseil"

class WorkflowType(str, Enum):
    CALCULATION_RESULT = "calculation_result"
    METHODOLOGY_CHANGE = "methodology_change"
    PARAMETER_UPDATE = "parameter_update"
    MANUAL_ADJUSTMENT = "manual_adjustment"

class ApprovalRequest(BaseModel):
    calculationId: str
    triangleId: str
    workflowType: WorkflowType
    businessJustification: str
    technicalJustification: str
    expectedImpact: str
    urgencyLevel: str = "normal"  # normal, high, critical
    attachments: Optional[List[str]] = []

class ApprovalAction(BaseModel):
    action: str  # approve, reject, request_changes
    comments: str
    conditions: Optional[str] = None
    nextApprover: Optional[str] = None

class VersioningData(BaseModel):
    previousVersion: str
    changes: List[Dict[str, Any]]
    migrationNotes: str

# ===== BASE DE DONNÉES SIMULÉE (à remplacer par votre vraie DB) =====

WORKFLOW_SUBMISSIONS = []
APPROVAL_HISTORY = []
ELECTRONIC_SIGNATURES = []
WORKFLOW_TEMPLATES = {
    WorkflowType.CALCULATION_RESULT: {
        "levels": [ApprovalLevel.CHEF_ACTUAIRE, ApprovalLevel.DIRECTION],
        "timeout_days": 5,
        "requires_signature": True
    },
    WorkflowType.METHODOLOGY_CHANGE: {
        "levels": [ApprovalLevel.CHEF_ACTUAIRE, ApprovalLevel.DIRECTION, ApprovalLevel.CONSEIL],
        "timeout_days": 10,
        "requires_signature": True
    },
    WorkflowType.PARAMETER_UPDATE: {
        "levels": [ApprovalLevel.CHEF_ACTUAIRE],
        "timeout_days": 3,
        "requires_signature": False
    },
    WorkflowType.MANUAL_ADJUSTMENT: {
        "levels": [ApprovalLevel.CHEF_ACTUAIRE, ApprovalLevel.DIRECTION],
        "timeout_days": 7,
        "requires_signature": True
    }
}

# ===== UTILITAIRES =====

def generate_electronic_signature(user_id: int, document_hash: str, timestamp: str) -> str:
    """Générer une signature électronique"""
    data = f"{user_id}:{document_hash}:{timestamp}:provtech_signature_key"
    return hashlib.sha256(data.encode()).hexdigest()

def get_next_approver_level(current_level: ApprovalLevel, workflow_type: WorkflowType) -> Optional[ApprovalLevel]:
    """Déterminer le prochain niveau d'approbation"""
    template = WORKFLOW_TEMPLATES.get(workflow_type)
    if not template:
        return None
    
    levels = template["levels"]
    try:
        current_index = levels.index(current_level)
        if current_index + 1 < len(levels):
            return levels[current_index + 1]
    except ValueError:
        pass
    return None

def get_users_by_level(level: ApprovalLevel) -> List[Dict]:
    """Récupérer les utilisateurs par niveau d'approbation"""
    level_role_mapping = {
        ApprovalLevel.ACTUAIRE_JUNIOR: ["ACTUAIRE_JUNIOR"],
        ApprovalLevel.ACTUAIRE_SENIOR: ["ACTUAIRE_SENIOR"],
        ApprovalLevel.CHEF_ACTUAIRE: ["CHEF_ACTUAIRE", "ADMIN"],
        ApprovalLevel.DIRECTION: ["DIRECTEUR", "ADMIN"],
        ApprovalLevel.CONSEIL: ["CONSEIL", "ADMIN"]
    }
    
    target_roles = level_role_mapping.get(level, [])
    return [user for user in USERS_DB if user["role"] in target_roles]

def create_document_hash(calculation_data: Dict) -> str:
    """Créer un hash du document pour signature"""
    content = f"{calculation_data.get('id', '')}:{calculation_data.get('summary', {}).get('bestEstimate', 0)}:{datetime.utcnow().isoformat()}"
    return hashlib.md5(content.encode()).hexdigest()

# ===== ENDPOINTS =====

@router.post("/submit")
async def submit_for_approval(
    request: ApprovalRequest,
    current_user: dict = Depends(verify_token)
):
    """Soumettre un calcul pour approbation"""
    
    # Récupérer les données du calcul depuis votre API existante
    try:
        # Simulation d'appel à votre API de calculs existante
        calculation_data = {
            "id": request.calculationId,
            "triangleId": request.triangleId,
            "summary": {"bestEstimate": 1500000},  # Remplacez par vos vraies données
            "methods": [],
            "metadata": {}
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Calcul introuvable: {str(e)}")
    
    # Créer la soumission de workflow
    submission_id = str(uuid.uuid4())
    workflow_template = WORKFLOW_TEMPLATES.get(request.workflowType)
    
    if not workflow_template:
        raise HTTPException(status_code=400, detail="Type de workflow invalide")
    
    first_level = workflow_template["levels"][0]
    approvers = get_users_by_level(first_level)
    
    if not approvers:
        raise HTTPException(status_code=400, detail=f"Aucun approbateur trouvé pour le niveau {first_level}")
    
    # Créer hash du document
    document_hash = create_document_hash(calculation_data)
    
    submission = {
        "id": submission_id,
        "calculationId": request.calculationId,
        "triangleId": request.triangleId,
        "workflowType": request.workflowType,
        "status": ApprovalStatus.PENDING_ACTUAIRE,
        "currentLevel": first_level,
        "submittedBy": current_user["user_id"],
        "submittedAt": datetime.utcnow().isoformat(),
        "businessJustification": request.businessJustification,
        "technicalJustification": request.technicalJustification,
        "expectedImpact": request.expectedImpact,
        "urgencyLevel": request.urgencyLevel,
        "attachments": request.attachments or [],
        "documentHash": document_hash,
        "timeoutDate": (datetime.utcnow() + timedelta(days=workflow_template["timeout_days"])).isoformat(),
        "currentApprovers": [user["id"] for user in approvers],
        "approvalHistory": [],
        "version": "1.0"
    }
    
    WORKFLOW_SUBMISSIONS.append(submission)
    
    # Log d'audit
    log_audit(
        current_user["user_id"],
        "WORKFLOW_SUBMITTED",
        f"Soumission workflow {request.workflowType} pour calcul {request.calculationId}",
        ""
    )
    
    # Notifications (simulation)
    for approver in approvers:
        logger.info(f"Notification envoyée à {approver['email']} pour approbation {submission_id}")
    
    return {
        "success": True,
        "submissionId": submission_id,
        "status": submission["status"],
        "currentApprovers": [{"id": user["id"], "email": user["email"], "name": f"{user['first_name']} {user['last_name']}"} for user in approvers],
        "timeoutDate": submission["timeoutDate"]
    }

@router.get("/pending")
async def get_pending_approvals(current_user: dict = Depends(verify_token)):
    """Récupérer les approbations en attente pour l'utilisateur"""
    
    user_id = current_user["user_id"]
    
    # Filtrer les soumissions où l'utilisateur est approbateur
    pending = [
        {
            **submission,
            "submittedByName": find_user_by_id(submission["submittedBy"])["first_name"] if find_user_by_id(submission["submittedBy"]) else "Inconnu",
            "daysSinceSubmission": (datetime.utcnow() - datetime.fromisoformat(submission["submittedAt"])).days,
            "isUrgent": submission["urgencyLevel"] in ["high", "critical"]
        }
        for submission in WORKFLOW_SUBMISSIONS 
        if user_id in submission["currentApprovers"] and submission["status"] not in [ApprovalStatus.APPROVED, ApprovalStatus.REJECTED, ApprovalStatus.LOCKED]
    ]
    
    return {
        "success": True,
        "pendingApprovals": sorted(pending, key=lambda x: (x["isUrgent"], x["daysSinceSubmission"]), reverse=True),
        "count": len(pending)
    }

@router.post("/approve/{submission_id}")
async def approve_submission(
    submission_id: str,
    action: ApprovalAction,
    current_user: dict = Depends(verify_token)
):
    """Approuver ou rejeter une soumission"""
    
    # Trouver la soumission
    submission = next((s for s in WORKFLOW_SUBMISSIONS if s["id"] == submission_id), None)
    if not submission:
        raise HTTPException(status_code=404, detail="Soumission introuvable")
    
    user_id = current_user["user_id"]
    user = find_user_by_id(user_id)
    
    # Vérifier que l'utilisateur peut approuver
    if user_id not in submission["currentApprovers"]:
        raise HTTPException(status_code=403, detail="Non autorisé à approuver cette soumission")
    
    # Créer signature électronique
    signature = generate_electronic_signature(
        user_id, 
        submission["documentHash"], 
        datetime.utcnow().isoformat()
    )
    
    # Enregistrer l'action d'approbation
    approval_entry = {
        "approver": user_id,
        "approverName": f"{user['first_name']} {user['last_name']}",
        "approverRole": user["role"],
        "level": submission["currentLevel"],
        "action": action.action,
        "comments": action.comments,
        "conditions": action.conditions,
        "timestamp": datetime.utcnow().isoformat(),
        "signature": signature
    }
    
    submission["approvalHistory"].append(approval_entry)
    
    # Enregistrer la signature
    ELECTRONIC_SIGNATURES.append({
        "id": str(uuid.uuid4()),
        "submissionId": submission_id,
        "userId": user_id,
        "signature": signature,
        "documentHash": submission["documentHash"],
        "timestamp": datetime.utcnow().isoformat(),
        "ipAddress": "127.0.0.1"  # Remplacez par la vraie IP
    })
    
    if action.action == "reject":
        submission["status"] = ApprovalStatus.REJECTED
        submission["currentApprovers"] = []
        
        log_audit(user_id, "WORKFLOW_REJECTED", f"Rejet soumission {submission_id}: {action.comments}", "")
        
        return {
            "success": True,
            "status": "rejected",
            "message": "Soumission rejetée"
        }
    
    elif action.action == "request_changes":
        # Retourner au soumetteur
        submission["status"] = ApprovalStatus.DRAFT
        submission["currentApprovers"] = [submission["submittedBy"]]
        
        log_audit(user_id, "WORKFLOW_CHANGES_REQUESTED", f"Modifications demandées pour {submission_id}", "")
        
        return {
            "success": True,
            "status": "changes_requested",
            "message": "Modifications demandées"
        }
    
    elif action.action == "approve":
        # Passer au niveau suivant
        next_level = get_next_approver_level(submission["currentLevel"], submission["workflowType"])
        
        if next_level:
            # Niveau suivant
            next_approvers = get_users_by_level(next_level)
            submission["currentLevel"] = next_level
            submission["currentApprovers"] = [user["id"] for user in next_approvers]
            
            # Mise à jour du statut
            status_mapping = {
                ApprovalLevel.CHEF_ACTUAIRE: ApprovalStatus.PENDING_ACTUAIRE,
                ApprovalLevel.DIRECTION: ApprovalStatus.PENDING_DIRECTION,
                ApprovalLevel.CONSEIL: ApprovalStatus.PENDING_CONSEIL
            }
            submission["status"] = status_mapping.get(next_level, ApprovalStatus.PENDING_ACTUAIRE)
            
            log_audit(user_id, "WORKFLOW_APPROVED_NEXT_LEVEL", f"Approbation niveau {submission['currentLevel']} pour {submission_id}", "")
            
            return {
                "success": True,
                "status": "approved_next_level",
                "nextLevel": next_level,
                "nextApprovers": [{"id": user["id"], "name": f"{user['first_name']} {user['last_name']}"} for user in next_approvers]
            }
        else:
            # Approbation finale
            submission["status"] = ApprovalStatus.APPROVED
            submission["currentApprovers"] = []
            submission["approvedAt"] = datetime.utcnow().isoformat()
            
            log_audit(user_id, "WORKFLOW_FINAL_APPROVAL", f"Approbation finale pour {submission_id}", "")
            
            return {
                "success": True,
                "status": "final_approval",
                "message": "Soumission approuvée définitivement"
            }

@router.get("/dashboard")
async def get_workflow_dashboard(current_user: dict = Depends(verify_token)):
    """Dashboard des workflows pour les gestionnaires"""
    
    user = find_user_by_id(current_user["user_id"])
    if not user or user["role"] not in ["ADMIN", "CHEF_ACTUAIRE", "DIRECTEUR", "CONSEIL"]:
        raise HTTPException(status_code=403, detail="Permissions insuffisantes")
    
    total_submissions = len(WORKFLOW_SUBMISSIONS)
    pending_count = len([s for s in WORKFLOW_SUBMISSIONS if s["status"] not in [ApprovalStatus.APPROVED, ApprovalStatus.REJECTED, ApprovalStatus.LOCKED]])
    overdue_count = len([s for s in WORKFLOW_SUBMISSIONS if datetime.utcnow() > datetime.fromisoformat(s["timeoutDate"]) and s["status"] not in [ApprovalStatus.APPROVED, ApprovalStatus.REJECTED]])
    
    # Statistiques par type
    type_stats = {}
    for workflow_type in WorkflowType:
        submissions = [s for s in WORKFLOW_SUBMISSIONS if s["workflowType"] == workflow_type]
        type_stats[workflow_type] = {
            "total": len(submissions),
            "pending": len([s for s in submissions if s["status"] not in [ApprovalStatus.APPROVED, ApprovalStatus.REJECTED, ApprovalStatus.LOCKED]]),
            "approved": len([s for s in submissions if s["status"] == ApprovalStatus.APPROVED]),
            "rejected": len([s for s in submissions if s["status"] == ApprovalStatus.REJECTED])
        }
    
    return {
        "success": True,
        "dashboard": {
            "summary": {
                "totalSubmissions": total_submissions,
                "pendingApprovals": pending_count,
                "overdueSubmissions": overdue_count,
                "approvalRate": round((len([s for s in WORKFLOW_SUBMISSIONS if s["status"] == ApprovalStatus.APPROVED]) / total_submissions * 100), 1) if total_submissions > 0 else 0
            },
            "typeStatistics": type_stats,
            "recentActivity": sorted(WORKFLOW_SUBMISSIONS[-10:], key=lambda x: x["submittedAt"], reverse=True)
        }
    }