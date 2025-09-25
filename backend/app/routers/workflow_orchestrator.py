# backend/app/routers/workflow_orchestrator.py
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from fastapi.responses import JSONResponse
from typing import List, Dict, Any, Optional
from datetime import datetime
import logging

from ..services.workflow_orchestrator import (
    workflow_orchestrator, WorkflowOrchestrator,
    WorkflowDefinition, WorkflowExecution, WorkflowTask,
    WorkflowStatus, TaskType, TriggerType
)
from ..auth import verify_token

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/workflows", tags=["Workflow Orchestrator"])

# ===== MODÈLES PYDANTIC =====
from pydantic import BaseModel

class WorkflowExecutionRequest(BaseModel):
    workflow_id: str
    trigger_data: Dict[str, Any] = {}
    priority: str = "normal"

class WorkflowCreateRequest(BaseModel):
    name: str
    description: str
    tasks: List[Dict[str, Any]]
    triggers: List[Dict[str, Any]] = []
    max_parallel_tasks: int = 5
    timeout_minutes: int = 60
    tags: List[str] = []

class TaskExecutionOverride(BaseModel):
    task_id: str
    new_config: Dict[str, Any]

# ===== ENDPOINTS DE GESTION DES WORKFLOWS =====

@router.get("/", summary="Liste des workflows")
async def list_workflows(
    tag: Optional[str] = Query(None, description="Filtrer par tag"),
    current_user: dict = Depends(verify_token)
):
    """Récupérer la liste de tous les workflows disponibles"""
    try:
        workflows = workflow_orchestrator.list_workflows()
        
        # Filtrage par tag si spécifié
        if tag:
            workflows = [w for w in workflows if tag in w.tags]
        
        # Formatter pour la réponse
        workflows_data = []
        for workflow in workflows:
            # Compter les exécutions récentes
            recent_executions = [
                e for e in workflow_orchestrator.list_executions(workflow.id)
                if (datetime.now() - e.started_at).days <= 7
            ]
            
            workflows_data.append({
                "id": workflow.id,
                "name": workflow.name,
                "description": workflow.description,
                "task_count": len(workflow.tasks),
                "trigger_count": len(workflow.triggers),
                "tags": workflow.tags,
                "created_by": workflow.created_by,
                "version": workflow.version,
                "recent_executions": len(recent_executions),
                "last_execution": recent_executions[0].started_at.isoformat() if recent_executions else None
            })
        
        return {
            "success": True,
            "workflows": workflows_data,
            "total": len(workflows_data)
        }
        
    except Exception as e:
        logger.error(f"Erreur liste workflows: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{workflow_id}", summary="Détails d'un workflow")
async def get_workflow_details(
    workflow_id: str,
    current_user: dict = Depends(verify_token)
):
    """Récupérer les détails complets d'un workflow"""
    
    workflow = workflow_orchestrator.get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow non trouvé")
    
    # Récupérer historique des exécutions
    executions = workflow_orchestrator.list_executions(workflow_id)
    
    # Statistiques d'exécution
    total_executions = len(executions)
    successful_executions = len([e for e in executions if e.status == WorkflowStatus.COMPLETED])
    failed_executions = len([e for e in executions if e.status == WorkflowStatus.FAILED])
    
    success_rate = (successful_executions / total_executions * 100) if total_executions > 0 else 0
    
    # Temps d'exécution moyen
    completed_executions = [e for e in executions if e.completed_at]
    avg_duration = 0
    if completed_executions:
        total_duration = sum([
            (e.completed_at - e.started_at).total_seconds() 
            for e in completed_executions
        ])
        avg_duration = total_duration / len(completed_executions)
    
    return {
        "success": True,
        "workflow": {
            "id": workflow.id,
            "name": workflow.name,
            "description": workflow.description,
            "tasks": [
                {
                    "id": task.id,
                    "name": task.name,
                    "type": task.type.value,
                    "dependencies": task.dependencies,
                    "timeout_seconds": task.timeout_seconds,
                    "retry_count": task.retry_count
                }
                for task in workflow.tasks
            ],
            "triggers": workflow.triggers,
            "max_parallel_tasks": workflow.max_parallel_tasks,
            "timeout_minutes": workflow.timeout_minutes,
            "tags": workflow.tags,
            "created_by": workflow.created_by,
            "created_at": workflow.created_at.isoformat(),
            "version": workflow.version
        },
        "statistics": {
            "total_executions": total_executions,
            "successful_executions": successful_executions,
            "failed_executions": failed_executions,
            "success_rate": round(success_rate, 2),
            "average_duration_seconds": round(avg_duration, 2)
        },
        "recent_executions": [
            {
                "id": e.id,
                "status": e.status.value,
                "started_at": e.started_at.isoformat(),
                "completed_at": e.completed_at.isoformat() if e.completed_at else None,
                "trigger_type": e.trigger_type.value
            }
            for e in executions[:10]  # 10 plus récentes
        ]
    }

@router.post("/", summary="Créer un nouveau workflow")
async def create_workflow(
    request: WorkflowCreateRequest,
    current_user: dict = Depends(verify_token)
):
    """Créer et enregistrer un nouveau workflow"""
    
    # Vérifier permissions
    if "workflows:write" not in current_user.get("permissions", []):
        raise HTTPException(status_code=403, detail="Permissions insuffisantes")
    
    try:
        # Valider et construire les tâches
        tasks = []
        for i, task_data in enumerate(request.tasks):
            task = WorkflowTask(
                id=task_data.get("id", f"task_{i+1}"),
                name=task_data["name"],
                type=TaskType(task_data["type"]),
                config=task_data.get("config", {}),
                dependencies=task_data.get("dependencies", []),
                timeout_seconds=task_data.get("timeout_seconds", 300),
                retry_count=task_data.get("retry_count", 2),
                retry_delay=task_data.get("retry_delay", 60)
            )
            tasks.append(task)
        
        # Créer le workflow
        workflow_id = f"custom_{int(datetime.now().timestamp())}"
        workflow = WorkflowDefinition(
            id=workflow_id,
            name=request.name,
            description=request.description,
            tasks=tasks,
            triggers=request.triggers,
            max_parallel_tasks=request.max_parallel_tasks,
            timeout_minutes=request.timeout_minutes,
            created_by=current_user.get("email", "unknown"),
            tags=request.tags
        )
        
        # Enregistrer
        workflow_orchestrator.workflows[workflow_id] = workflow
        
        return {
            "success": True,
            "workflow_id": workflow_id,
            "message": f"Workflow '{request.name}' créé avec succès"
        }
        
    except Exception as e:
        logger.error(f"Erreur création workflow: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{workflow_id}", summary="Supprimer un workflow")
async def delete_workflow(
    workflow_id: str,
    current_user: dict = Depends(verify_token)
):
    """Supprimer un workflow (uniquement les workflows personnalisés)"""
    
    if "workflows:write" not in current_user.get("permissions", []):
        raise HTTPException(status_code=403, detail="Permissions insuffisantes")
    
    if workflow_id not in workflow_orchestrator.workflows:
        raise HTTPException(status_code=404, detail="Workflow non trouvé")
    
    # Empêcher la suppression des workflows système
    if not workflow_id.startswith("custom_"):
        raise HTTPException(status_code=400, detail="Impossible de supprimer un workflow système")
    
    # Vérifier qu'aucune exécution n'est en cours
    running_executions = [
        e for e in workflow_orchestrator.list_executions(workflow_id)
        if e.status in [WorkflowStatus.RUNNING, WorkflowStatus.PENDING]
    ]
    
    if running_executions:
        raise HTTPException(
            status_code=400, 
            detail=f"Impossible de supprimer: {len(running_executions)} exécution(s) en cours"
        )
    
    # Supprimer
    del workflow_orchestrator.workflows[workflow_id]
    
    return {
        "success": True,
        "message": f"Workflow {workflow_id} supprimé avec succès"
    }

# ===== ENDPOINTS D'EXÉCUTION =====

@router.post("/{workflow_id}/execute", summary="Exécuter un workflow")
async def execute_workflow(
    workflow_id: str,
    request: WorkflowExecutionRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(verify_token)
):
    """Démarrer l'exécution d'un workflow"""
    
    if "workflows:execute" not in current_user.get("permissions", []):
        raise HTTPException(status_code=403, detail="Permissions insuffisantes")
    
    if not workflow_orchestrator.get_workflow(workflow_id):
        raise HTTPException(status_code=404, detail="Workflow non trouvé")
    
    try:
        execution_id = await workflow_orchestrator.execute_workflow(
            workflow_id=workflow_id,
            trigger_type=TriggerType.MANUAL,
            trigger_data={
                **request.trigger_data,
                "executed_by": current_user.get("email", "unknown"),
                "priority": request.priority
            }
        )
        
        # Logger l'activité
        background_tasks.add_task(
            log_workflow_activity,
            current_user["user_id"],
            workflow_id,
            execution_id,
            "workflow_executed"
        )
        
        return {
            "success": True,
            "execution_id": execution_id,
            "workflow_id": workflow_id,
            "message": "Workflow démarré avec succès"
        }
        
    except Exception as e:
        logger.error(f"Erreur exécution workflow {workflow_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{workflow_id}/executions", summary="Historique des exécutions")
async def get_workflow_executions(
    workflow_id: str,
    limit: int = Query(50, le=200),
    status: Optional[WorkflowStatus] = Query(None),
    current_user: dict = Depends(verify_token)
):
    """Récupérer l'historique des exécutions d'un workflow"""
    
    if not workflow_orchestrator.get_workflow(workflow_id):
        raise HTTPException(status_code=404, detail="Workflow non trouvé")
    
    executions = workflow_orchestrator.list_executions(workflow_id)
    
    # Filtrer par statut si spécifié
    if status:
        executions = [e for e in executions if e.status == status]
    
    # Limiter le nombre de résultats
    executions = executions[:limit]
    
    # Formatter pour la réponse
    executions_data = []
    for execution in executions:
        duration = None
        if execution.completed_at:
            duration = (execution.completed_at - execution.started_at).total_seconds()
        
        # Compter tâches par statut
        task_stats = {
            "total": len(execution.task_executions),
            "completed": len([t for t in execution.task_executions.values() if t.status == WorkflowStatus.COMPLETED]),
            "failed": len([t for t in execution.task_executions.values() if t.status == WorkflowStatus.FAILED]),
            "running": len([t for t in execution.task_executions.values() if t.status == WorkflowStatus.RUNNING])
        }
        
        executions_data.append({
            "id": execution.id,
            "workflow_id": execution.workflow_id,
            "status": execution.status.value,
            "trigger_type": execution.trigger_type.value,
            "started_at": execution.started_at.isoformat(),
            "completed_at": execution.completed_at.isoformat() if execution.completed_at else None,
            "duration_seconds": duration,
            "task_statistics": task_stats,
            "logs_count": len(execution.logs)
        })
    
    return {
        "success": True,
        "executions": executions_data,
        "total": len(executions_data)
    }

@router.get("/executions/{execution_id}", summary="Détails d'une exécution")
async def get_execution_details(
    execution_id: str,
    current_user: dict = Depends(verify_token)
):
    """Récupérer les détails complets d'une exécution"""
    
    execution = workflow_orchestrator.get_execution(execution_id)
    if not execution:
        raise HTTPException(status_code=404, detail="Exécution non trouvée")
    
    workflow = workflow_orchestrator.get_workflow(execution.workflow_id)
    
    # Détails des tâches
    tasks_details = []
    for task_id, task in execution.task_executions.items():
        duration = None
        if task.completed_at and task.started_at:
            duration = (task.completed_at - task.started_at).total_seconds()
        
        tasks_details.append({
            "id": task.id,
            "name": task.name,
            "type": task.type.value,
            "status": task.status.value,
            "dependencies": task.dependencies,
            "started_at": task.started_at.isoformat() if task.started_at else None,
            "completed_at": task.completed_at.isoformat() if task.completed_at else None,
            "duration_seconds": duration,
            "execution_attempts": task.execution_attempts,
            "error": task.error,
            "result_summary": str(task.result)[:200] if task.result else None  # Limiter la taille
        })
    
    # Métriques globales
    total_duration = None
    if execution.completed_at:
        total_duration = (execution.completed_at - execution.started_at).total_seconds()
    
    return {
        "success": True,
        "execution": {
            "id": execution.id,
            "workflow_id": execution.workflow_id,
            "workflow_name": workflow.name if workflow else "Unknown",
            "status": execution.status.value,
            "trigger_type": execution.trigger_type.value,
            "trigger_data": execution.trigger_data,
            "started_at": execution.started_at.isoformat(),
            "completed_at": execution.completed_at.isoformat() if execution.completed_at else None,
            "total_duration_seconds": total_duration,
            "current_tasks": execution.current_tasks,
            "logs": execution.logs,
            "results": execution.results,
            "metrics": execution.metrics
        },
        "tasks": tasks_details
    }

@router.post("/executions/{execution_id}/cancel", summary="Annuler une exécution")
async def cancel_execution(
    execution_id: str,
    current_user: dict = Depends(verify_token)
):
    """Annuler une exécution en cours"""
    
    if "workflows:execute" not in current_user.get("permissions", []):
        raise HTTPException(status_code=403, detail="Permissions insuffisantes")
    
    execution = workflow_orchestrator.get_execution(execution_id)
    if not execution:
        raise HTTPException(status_code=404, detail="Exécution non trouvée")
    
    if execution.status not in [WorkflowStatus.RUNNING, WorkflowStatus.PENDING]:
        raise HTTPException(
            status_code=400, 
            detail=f"Impossible d'annuler: exécution en statut {execution.status.value}"
        )
    
    success = await workflow_orchestrator.cancel_execution(execution_id)
    
    if success:
        return {
            "success": True,
            "message": f"Exécution {execution_id} annulée avec succès"
        }
    else:
        raise HTTPException(status_code=500, detail="Échec de l'annulation")

# ===== ENDPOINTS DE MONITORING =====

@router.get("/orchestrator/status", summary="Statut de l'orchestrateur")
async def get_orchestrator_status(current_user: dict = Depends(verify_token)):
    """Récupérer le statut global de l'orchestrateur"""
    
    # Compter exécutions par statut
    all_executions = []
    for workflow_id in workflow_orchestrator.workflows.keys():
        all_executions.extend(workflow_orchestrator.list_executions(workflow_id))
    
    status_counts = {
        "running": len([e for e in all_executions if e.status == WorkflowStatus.RUNNING]),
        "pending": len([e for e in all_executions if e.status == WorkflowStatus.PENDING]),
        "completed": len([e for e in all_executions if e.status == WorkflowStatus.COMPLETED]),
        "failed": len([e for e in all_executions if e.status == WorkflowStatus.FAILED]),
        "cancelled": len([e for e in all_executions if e.status == WorkflowStatus.CANCELLED])
    }
    
    # Exécutions récentes (24h)
    recent_cutoff = datetime.now() - timedelta(hours=24)
    recent_executions = [e for e in all_executions if e.started_at >= recent_cutoff]
    
    # Tâches actives
    active_tasks_count = len(workflow_orchestrator.active_tasks)
    
    return {
        "success": True,
        "orchestrator_status": {
            "is_running": workflow_orchestrator.is_running,
            "total_workflows": len(workflow_orchestrator.workflows),
            "active_tasks": active_tasks_count,
            "execution_statistics": status_counts,
            "recent_executions_24h": len(recent_executions),
            "memory_usage": {
                "total_executions_in_memory": len(workflow_orchestrator.executions),
                "active_tasks_in_memory": len(workflow_orchestrator.active_tasks)
            }
        },
        "system_health": {
            "api_connectors": len(workflow_orchestrator.connector_manager.connectors),
            "calculation_engine": "operational" if workflow_orchestrator.calculation_engine else "unavailable"
        }
    }

@router.get("/orchestrator/metrics", summary="Métriques détaillées")
async def get_orchestrator_metrics(
    time_period: str = Query("7d", regex="^(1h|24h|7d|30d)$"),
    current_user: dict = Depends(verify_token)
):
    """Récupérer les métriques détaillées de l'orchestrateur"""
    
    # Définir la période
    if time_period == "1h":
        cutoff = datetime.now() - timedelta(hours=1)
    elif time_period == "24h":
        cutoff = datetime.now() - timedelta(hours=24)
    elif time_period == "7d":
        cutoff = datetime.now() - timedelta(days=7)
    else:  # 30d
        cutoff = datetime.now() - timedelta(days=30)
    
    # Récupérer toutes les exécutions dans la période
    all_executions = []
    for workflow_id in workflow_orchestrator.workflows.keys():
        workflow_executions = workflow_orchestrator.list_executions(workflow_id)
        period_executions = [e for e in workflow_executions if e.started_at >= cutoff]
        all_executions.extend(period_executions)
    
    # Calculer métriques
    total_executions = len(all_executions)
    successful_executions = len([e for e in all_executions if e.status == WorkflowStatus.COMPLETED])
    failed_executions = len([e for e in all_executions if e.status == WorkflowStatus.FAILED])
    
    success_rate = (successful_executions / total_executions * 100) if total_executions > 0 else 0
    
    # Temps d'exécution moyen
    completed_executions = [e for e in all_executions if e.completed_at]
    avg_execution_time = 0
    if completed_executions:
        total_time = sum([
            (e.completed_at - e.started_at).total_seconds() 
            for e in completed_executions
        ])
        avg_execution_time = total_time / len(completed_executions)
    
    # Workflows les plus utilisés
    workflow_usage = {}
    for execution in all_executions:
        workflow_id = execution.workflow_id
        if workflow_id not in workflow_usage:
            workflow_usage[workflow_id] = {"count": 0, "success": 0, "failed": 0}
        
        workflow_usage[workflow_id]["count"] += 1
        if execution.status == WorkflowStatus.COMPLETED:
            workflow_usage[workflow_id]["success"] += 1
        elif execution.status == WorkflowStatus.FAILED:
            workflow_usage[workflow_id]["failed"] += 1
    
    most_used_workflows = sorted(
        workflow_usage.items(), 
        key=lambda x: x[1]["count"], 
        reverse=True
    )[:5]
    
    return {
        "success": True,
        "time_period": time_period,
        "metrics": {
            "execution_summary": {
                "total_executions": total_executions,
                "successful_executions": successful_executions,
                "failed_executions": failed_executions,
                "success_rate_percent": round(success_rate, 2),
                "average_execution_time_seconds": round(avg_execution_time, 2)
            },
            "workflow_usage": [
                {
                    "workflow_id": wf_id,
                    "workflow_name": workflow_orchestrator.get_workflow(wf_id).name if workflow_orchestrator.get_workflow(wf_id) else "Unknown",
                    "execution_count": stats["count"],
                    "success_count": stats["success"],
                    "failure_count": stats["failed"],
                    "success_rate": round((stats["success"] / stats["count"] * 100), 2) if stats["count"] > 0 else 0
                }
                for wf_id, stats in most_used_workflows
            ]
        }
    }

# ===== ENDPOINTS D'ADMINISTRATION =====

@router.post("/orchestrator/start", summary="Démarrer l'orchestrateur")
async def start_orchestrator(current_user: dict = Depends(verify_token)):
    """Démarrer l'orchestrateur de workflows"""
    
    if current_user.get("role") != "ADMIN":
        raise HTTPException(status_code=403, detail="Permissions administrateur requises")
    
    if workflow_orchestrator.is_running:
        return {"success": True, "message": "Orchestrateur déjà en cours d'exécution"}
    
    await workflow_orchestrator.start_orchestrator()
    
    return {
        "success": True,
        "message": "Orchestrateur démarré avec succès"
    }

@router.post("/orchestrator/stop", summary="Arrêter l'orchestrateur")
async def stop_orchestrator(current_user: dict = Depends(verify_token)):
    """Arrêter l'orchestrateur de workflows"""
    
    if current_user.get("role") != "ADMIN":
        raise HTTPException(status_code=403, detail="Permissions administrateur requises")
    
    if not workflow_orchestrator.is_running:
        return {"success": True, "message": "Orchestrateur déjà arrêté"}
    
    await workflow_orchestrator.stop_orchestrator()
    
    return {
        "success": True,
        "message": "Orchestrateur arrêté avec succès"
    }

@router.get("/templates", summary="Templates de workflows")
async def get_workflow_templates(current_user: dict = Depends(verify_token)):
    """Récupérer les templates de workflows prédéfinis"""
    
    templates = [
        {
            "id": "daily_sync_template",
            "name": "Synchronisation Quotidienne",
            "description": "Template pour synchronisation quotidienne des données de marché",
            "category": "data_sync",
            "tasks": [
                {"type": "data_sync", "name": "Sync données marché"},
                {"type": "calculation", "name": "Mise à jour calculs"},
                {"type": "notification", "name": "Notification équipe"}
            ],
            "estimated_duration": "10-15 minutes",
            "complexity": "simple"
        },
        {
            "id": "regulatory_calc_template", 
            "name": "Calcul Réglementaire",
            "description": "Template pour calculs IFRS 17 et Solvency II complets",
            "category": "calculation",
            "tasks": [
                {"type": "data_sync", "name": "Récupération données réglementaires"},
                {"type": "calculation", "name": "Calcul IFRS 17"},
                {"type": "calculation", "name": "Calcul Solvency II"},
                {"type": "validation", "name": "Validation conformité"},
                {"type": "export", "name": "Export rapports"}
            ],
            "estimated_duration": "30-45 minutes",
            "complexity": "complex"
        },
        {
            "id": "api_monitoring_template",
            "name": "Monitoring APIs",
            "description": "Template pour surveillance continue des APIs",
            "category": "monitoring",
            "tasks": [
                {"type": "validation", "name": "Test connexions"},
                {"type": "validation", "name": "Vérification fraîcheur"},
                {"type": "notification", "name": "Alertes si problèmes"}
            ],
            "estimated_duration": "2-5 minutes",
            "complexity": "simple"
        }
    ]
    
    return {
        "success": True,
        "templates": templates,
        "categories": ["data_sync", "calculation", "monitoring", "export", "validation"]
    }

# ===== FONCTIONS UTILITAIRES =====

async def log_workflow_activity(user_id: int, workflow_id: str, execution_id: str, activity: str):
    """Logger l'activité de workflow"""
    logger.info(f"User {user_id} - {activity} - Workflow {workflow_id} - Execution {execution_id}")

from datetime import timedelta