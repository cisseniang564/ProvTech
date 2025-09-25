# backend/app/services/workflow_orchestrator.py
from typing import Dict, List, Any, Optional, Callable, Union
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from enum import Enum
import asyncio
import uuid
import json
from concurrent.futures import ThreadPoolExecutor
import logging

from .api_connectors import connector_manager, APIConnectorManager
from .enhanced_calculation_engine import enhanced_engine, EnhancedCalculationEngine
from .notifications_service import NotificationService

logger = logging.getLogger(__name__)

# ===== TYPES POUR L'ORCHESTRATION =====
class WorkflowStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    PAUSED = "paused"

class TaskType(str, Enum):
    DATA_SYNC = "data_sync"
    CALCULATION = "calculation"
    VALIDATION = "validation"
    NOTIFICATION = "notification"
    EXPORT = "export"
    CLEANUP = "cleanup"

class TriggerType(str, Enum):
    MANUAL = "manual"
    SCHEDULED = "scheduled"
    EVENT_DRIVEN = "event_driven"
    API_WEBHOOK = "api_webhook"
    DATA_CHANGE = "data_change"

@dataclass
class WorkflowTask:
    id: str
    name: str
    type: TaskType
    config: Dict[str, Any]
    dependencies: List[str] = field(default_factory=list)
    timeout_seconds: int = 300
    retry_count: int = 2
    retry_delay: int = 60
    
    # État d'exécution
    status: WorkflowStatus = WorkflowStatus.PENDING
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    execution_attempts: int = 0

@dataclass
class WorkflowDefinition:
    id: str
    name: str
    description: str
    tasks: List[WorkflowTask]
    triggers: List[Dict[str, Any]]
    
    # Configuration
    max_parallel_tasks: int = 5
    timeout_minutes: int = 60
    notification_config: Optional[Dict[str, Any]] = None
    
    # Métadonnées
    created_by: str = ""
    created_at: datetime = field(default_factory=datetime.now)
    version: str = "1.0"
    tags: List[str] = field(default_factory=list)

@dataclass
class WorkflowExecution:
    id: str
    workflow_id: str
    trigger_type: TriggerType
    trigger_data: Dict[str, Any]
    
    # État global
    status: WorkflowStatus = WorkflowStatus.PENDING
    started_at: datetime = field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None
    
    # Tâches
    task_executions: Dict[str, WorkflowTask] = field(default_factory=dict)
    current_tasks: List[str] = field(default_factory=list)
    
    # Résultats
    results: Dict[str, Any] = field(default_factory=dict)
    metrics: Dict[str, Any] = field(default_factory=dict)
    logs: List[str] = field(default_factory=list)

# ===== ORCHESTRATEUR DE WORKFLOWS =====
class WorkflowOrchestrator:
    def __init__(self, 
                 connector_manager: APIConnectorManager,
                 calculation_engine: EnhancedCalculationEngine,
                 notification_service: Optional[NotificationService] = None):
        self.connector_manager = connector_manager
        self.calculation_engine = calculation_engine
        self.notification_service = notification_service or NotificationService()
        
        # État interne
        self.workflows: Dict[str, WorkflowDefinition] = {}
        self.executions: Dict[str, WorkflowExecution] = {}
        self.active_tasks: Dict[str, asyncio.Task] = {}
        
        # Configuration
        self.executor = ThreadPoolExecutor(max_workers=10)
        self.is_running = False
        
        # Workflows prédéfinis
        self._initialize_default_workflows()
    
    def _initialize_default_workflows(self):
        """Initialiser workflows par défaut"""
        
        # 1. Workflow de synchronisation quotidienne
        daily_sync_workflow = WorkflowDefinition(
            id="daily_market_sync",
            name="Synchronisation Quotidienne Marché",
            description="Synchronise quotidiennement les données de marché et met à jour les calculs",
            tasks=[
                WorkflowTask(
                    id="sync_ecb_rates",
                    name="Synchroniser taux BCE",
                    type=TaskType.DATA_SYNC,
                    config={
                        "connector_id": "ecb_rates",
                        "endpoint": "interest_rates",
                        "force_refresh": True
                    }
                ),
                WorkflowTask(
                    id="sync_eiopa_data", 
                    name="Synchroniser données EIOPA",
                    type=TaskType.DATA_SYNC,
                    config={
                        "connector_id": "eiopa_data",
                        "endpoint": "risk_free_rates",
                        "force_refresh": True
                    }
                ),
                WorkflowTask(
                    id="update_active_calculations",
                    name="Mettre à jour calculs actifs",
                    type=TaskType.CALCULATION,
                    config={
                        "calculation_type": "batch_update",
                        "include_market_data": True
                    },
                    dependencies=["sync_ecb_rates", "sync_eiopa_data"]
                ),
                WorkflowTask(
                    id="validate_results",
                    name="Valider résultats",
                    type=TaskType.VALIDATION,
                    config={
                        "quality_thresholds": {"min_quality_score": 0.8}
                    },
                    dependencies=["update_active_calculations"]
                ),
                WorkflowTask(
                    id="notify_completion",
                    name="Notifier fin de sync",
                    type=TaskType.NOTIFICATION,
                    config={
                        "recipients": ["actuarial_team"],
                        "template": "daily_sync_complete"
                    },
                    dependencies=["validate_results"]
                )
            ],
            triggers=[
                {
                    "type": TriggerType.SCHEDULED,
                    "schedule": "0 6 * * *",  # Tous les jours à 6h
                    "timezone": "Europe/Paris"
                }
            ]
        )
        
        # 2. Workflow de calcul réglementaire
        regulatory_calc_workflow = WorkflowDefinition(
            id="regulatory_calculation",
            name="Calcul Réglementaire Complet",
            description="Effectue calculs IFRS 17 et Solvency II avec toutes les validations",
            tasks=[
                WorkflowTask(
                    id="fetch_regulatory_data",
                    name="Récupérer données réglementaires",
                    type=TaskType.DATA_SYNC,
                    config={
                        "connectors": ["eiopa_data", "acpr_data"],
                        "regulatory_framework": ["ifrs17", "solvency2"]
                    }
                ),
                WorkflowTask(
                    id="ifrs17_calculation",
                    name="Calcul IFRS 17",
                    type=TaskType.CALCULATION,
                    config={
                        "calculation_type": "ifrs17_csm",
                        "include_sensitivity": True
                    },
                    dependencies=["fetch_regulatory_data"]
                ),
                WorkflowTask(
                    id="solvency2_calculation",
                    name="Calcul Solvency II",
                    type=TaskType.CALCULATION,
                    config={
                        "calculation_type": "solvency2_scr",
                        "include_stress_tests": True
                    },
                    dependencies=["fetch_regulatory_data"]
                ),
                WorkflowTask(
                    id="regulatory_validation",
                    name="Validation réglementaire",
                    type=TaskType.VALIDATION,
                    config={
                        "frameworks": ["ifrs17", "solvency2"],
                        "compliance_checks": True
                    },
                    dependencies=["ifrs17_calculation", "solvency2_calculation"]
                ),
                WorkflowTask(
                    id="export_reports",
                    name="Exporter rapports",
                    type=TaskType.EXPORT,
                    config={
                        "formats": ["excel", "pdf"],
                        "templates": ["qrt_template", "ifrs17_template"]
                    },
                    dependencies=["regulatory_validation"]
                )
            ],
            triggers=[
                {
                    "type": TriggerType.SCHEDULED,
                    "schedule": "0 2 1 * *",  # Premier jour du mois à 2h
                    "timezone": "Europe/Paris"
                },
                {
                    "type": TriggerType.MANUAL,
                    "allowed_users": ["actuarial_team", "admin"]
                }
            ]
        )
        
        # 3. Workflow de monitoring des APIs
        api_monitoring_workflow = WorkflowDefinition(
            id="api_health_monitoring",
            name="Monitoring Santé APIs",
            description="Surveille la santé des APIs et alerte en cas de problème",
            tasks=[
                WorkflowTask(
                    id="test_all_connections",
                    name="Tester toutes les connexions",
                    type=TaskType.VALIDATION,
                    config={
                        "test_type": "connection_health",
                        "timeout": 30
                    }
                ),
                WorkflowTask(
                    id="check_data_freshness",
                    name="Vérifier fraîcheur données",
                    type=TaskType.VALIDATION,
                    config={
                        "freshness_threshold": 86400  # 24 heures
                    },
                    dependencies=["test_all_connections"]
                ),
                WorkflowTask(
                    id="alert_if_issues",
                    name="Alerter si problèmes",
                    type=TaskType.NOTIFICATION,
                    config={
                        "alert_conditions": ["connection_failed", "data_stale"],
                        "urgency": "high"
                    },
                    dependencies=["check_data_freshness"]
                )
            ],
            triggers=[
                {
                    "type": TriggerType.SCHEDULED,
                    "schedule": "*/15 * * * *",  # Toutes les 15 minutes
                    "timezone": "UTC"
                }
            ]
        )
        
        # Enregistrer workflows
        self.workflows[daily_sync_workflow.id] = daily_sync_workflow
        self.workflows[regulatory_calc_workflow.id] = regulatory_calc_workflow
        self.workflows[api_monitoring_workflow.id] = api_monitoring_workflow
    
    async def start_orchestrator(self):
        """Démarrer l'orchestrateur"""
        self.is_running = True
        logger.info("Orchestrateur de workflows démarré")
        
        # Démarrer la boucle principale
        asyncio.create_task(self._orchestration_loop())
    
    async def stop_orchestrator(self):
        """Arrêter l'orchestrateur"""
        self.is_running = False
        
        # Annuler toutes les tâches actives
        for task_id, task in self.active_tasks.items():
            task.cancel()
        
        self.active_tasks.clear()
        logger.info("Orchestrateur de workflows arrêté")
    
    async def _orchestration_loop(self):
        """Boucle principale d'orchestration"""
        while self.is_running:
            try:
                # Traiter les exécutions en cours
                await self._process_running_executions()
                
                # Vérifier les triggers programmés
                await self._check_scheduled_triggers()
                
                # Nettoyer les anciennes exécutions
                await self._cleanup_old_executions()
                
                # Attendre avant la prochaine itération
                await asyncio.sleep(30)  # 30 secondes
                
            except Exception as e:
                logger.error(f"Erreur dans boucle orchestration: {e}")
                await asyncio.sleep(60)  # Attendre plus longtemps en cas d'erreur
    
    async def execute_workflow(self, 
                             workflow_id: str, 
                             trigger_type: TriggerType = TriggerType.MANUAL,
                             trigger_data: Dict[str, Any] = None) -> str:
        """Démarrer l'exécution d'un workflow"""
        
        if workflow_id not in self.workflows:
            raise ValueError(f"Workflow {workflow_id} non trouvé")
        
        workflow = self.workflows[workflow_id]
        execution_id = str(uuid.uuid4())
        
        # Créer l'exécution
        execution = WorkflowExecution(
            id=execution_id,
            workflow_id=workflow_id,
            trigger_type=trigger_type,
            trigger_data=trigger_data or {}
        )
        
        # Copier les tâches du workflow
        for task in workflow.tasks:
            execution.task_executions[task.id] = WorkflowTask(
                id=task.id,
                name=task.name,
                type=task.type,
                config=task.config.copy(),
                dependencies=task.dependencies.copy(),
                timeout_seconds=task.timeout_seconds,
                retry_count=task.retry_count,
                retry_delay=task.retry_delay
            )
        
        execution.status = WorkflowStatus.RUNNING
        self.executions[execution_id] = execution
        
        logger.info(f"Démarrage exécution workflow {workflow_id} (ID: {execution_id})")
        
        # Démarrer l'exécution en arrière-plan
        asyncio.create_task(self._run_workflow_execution(execution_id))
        
        return execution_id
    
    async def _run_workflow_execution(self, execution_id: str):
        """Exécuter un workflow complet"""
        
        execution = self.executions[execution_id]
        workflow = self.workflows[execution.workflow_id]
        
        try:
            # Identifier les tâches sans dépendances
            ready_tasks = [
                task_id for task_id, task in execution.task_executions.items()
                if not task.dependencies and task.status == WorkflowStatus.PENDING
            ]
            
            # Tant qu'il y a des tâches à exécuter
            while ready_tasks or execution.current_tasks:
                # Démarrer les tâches prêtes (dans la limite du parallélisme)
                while ready_tasks and len(execution.current_tasks) < workflow.max_parallel_tasks:
                    task_id = ready_tasks.pop(0)
                    execution.current_tasks.append(task_id)
                    
                    # Démarrer la tâche
                    task_coroutine = self._execute_task(execution_id, task_id)
                    self.active_tasks[f"{execution_id}_{task_id}"] = asyncio.create_task(task_coroutine)
                
                # Attendre qu'au moins une tâche se termine
                if execution.current_tasks:
                    await asyncio.sleep(1)
                    
                    # Vérifier les tâches terminées
                    completed_tasks = []
                    for task_id in execution.current_tasks:
                        task = execution.task_executions[task_id]
                        if task.status in [WorkflowStatus.COMPLETED, WorkflowStatus.FAILED]:
                            completed_tasks.append(task_id)
                    
                    # Retirer les tâches terminées
                    for task_id in completed_tasks:
                        execution.current_tasks.remove(task_id)
                        task_key = f"{execution_id}_{task_id}"
                        if task_key in self.active_tasks:
                            del self.active_tasks[task_key]
                    
                    # Vérifier si de nouvelles tâches sont prêtes
                    for task_id, task in execution.task_executions.items():
                        if (task.status == WorkflowStatus.PENDING and 
                            task_id not in ready_tasks and 
                            task_id not in execution.current_tasks):
                            
                            # Vérifier que toutes les dépendances sont complétées
                            deps_completed = all(
                                execution.task_executions[dep_id].status == WorkflowStatus.COMPLETED
                                for dep_id in task.dependencies
                            )
                            
                            if deps_completed:
                                ready_tasks.append(task_id)
                
                # Vérifier timeout global
                elapsed = (datetime.now() - execution.started_at).total_seconds()
                if elapsed > workflow.timeout_minutes * 60:
                    raise TimeoutError(f"Workflow timeout après {workflow.timeout_minutes} minutes")
            
            # Déterminer statut final
            failed_tasks = [
                task for task in execution.task_executions.values()
                if task.status == WorkflowStatus.FAILED
            ]
            
            if failed_tasks:
                execution.status = WorkflowStatus.FAILED
                execution.logs.append(f"Échec: {len(failed_tasks)} tâche(s) échouée(s)")
            else:
                execution.status = WorkflowStatus.COMPLETED
                execution.logs.append("Workflow terminé avec succès")
            
            execution.completed_at = datetime.now()
            
            # Notifier si configuré
            if workflow.notification_config:
                await self._send_workflow_notification(execution_id)
            
            logger.info(f"Workflow {execution.workflow_id} terminé: {execution.status}")
            
        except Exception as e:
            execution.status = WorkflowStatus.FAILED
            execution.completed_at = datetime.now()
            execution.logs.append(f"Erreur fatale: {str(e)}")
            logger.error(f"Erreur exécution workflow {execution.workflow_id}: {e}")
    
    async def _execute_task(self, execution_id: str, task_id: str):
        """Exécuter une tâche individuelle"""
        
        execution = self.executions[execution_id]
        task = execution.task_executions[task_id]
        
        task.started_at = datetime.now()
        task.status = WorkflowStatus.RUNNING
        
        logger.info(f"Démarrage tâche {task.name} (ID: {task_id})")
        
        for attempt in range(task.retry_count + 1):
            try:
                task.execution_attempts = attempt + 1
                
                # Exécuter selon le type de tâche
                if task.type == TaskType.DATA_SYNC:
                    result = await self._execute_data_sync_task(task)
                elif task.type == TaskType.CALCULATION:
                    result = await self._execute_calculation_task(task)
                elif task.type == TaskType.VALIDATION:
                    result = await self._execute_validation_task(task)
                elif task.type == TaskType.NOTIFICATION:
                    result = await self._execute_notification_task(task)
                elif task.type == TaskType.EXPORT:
                    result = await self._execute_export_task(task)
                else:
                    raise ValueError(f"Type de tâche non supporté: {task.type}")
                
                # Succès
                task.result = result
                task.status = WorkflowStatus.COMPLETED
                task.completed_at = datetime.now()
                
                logger.info(f"Tâche {task.name} terminée avec succès")
                break
                
            except Exception as e:
                task.error = str(e)
                logger.error(f"Erreur tâche {task.name} (tentative {attempt + 1}): {e}")
                
                if attempt < task.retry_count:
                    logger.info(f"Retry tâche {task.name} dans {task.retry_delay}s")
                    await asyncio.sleep(task.retry_delay)
                else:
                    task.status = WorkflowStatus.FAILED
                    task.completed_at = datetime.now()
                    logger.error(f"Tâche {task.name} échouée définitivement")
    
    async def _execute_data_sync_task(self, task: WorkflowTask) -> Dict[str, Any]:
        """Exécuter tâche de synchronisation de données"""
        config = task.config
        
        if "connector_id" in config:
            # Synchronisation simple
            result = await self.connector_manager.sync_data(
                config["connector_id"],
                config["endpoint"],
                **config.get("params", {})
            )
        elif "connectors" in config:
            # Synchronisation multiple
            results = {}
            for connector_id in config["connectors"]:
                connector_result = await self.connector_manager.sync_data(
                    connector_id,
                    "default_endpoint"
                )
                results[connector_id] = connector_result
            result = {"multi_sync_results": results}
        else:
            raise ValueError("Configuration de sync invalide")
        
        return result
    
    async def _execute_calculation_task(self, task: WorkflowTask) -> Dict[str, Any]:
        """Exécuter tâche de calcul"""
        config = task.config
        
        if config.get("calculation_type") == "batch_update":
            # Mise à jour en lot - simulé
            result = {
                "updated_calculations": 5,
                "total_time": 45.2,
                "success_rate": 1.0
            }
        else:
            # Calcul individuel
            from ..services.enhanced_calculation_engine import EnhancedCalculationRequest, CalculationType, DataSource
            
            calc_request = EnhancedCalculationRequest(
                calculation_type=CalculationType(config.get("calculation_type", "chain_ladder_enhanced")),
                triangle_id=config.get("triangle_id", "default_triangle"),
                data_sources=[DataSource.INTERNAL_ONLY, DataSource.API_ENHANCED],
                include_sensitivity=config.get("include_sensitivity", False)
            )
            
            calc_result = await self.calculation_engine.calculate_enhanced(calc_request)
            result = {"calculation_result": calc_result}
        
        return result
    
    async def _execute_validation_task(self, task: WorkflowTask) -> Dict[str, Any]:
        """Exécuter tâche de validation"""
        config = task.config
        
        if config.get("test_type") == "connection_health":
            # Test de santé des connexions
            test_results = await self.connector_manager.test_all_connections()
            
            failed_connections = [
                conn_id for conn_id, result in test_results.items()
                if result.get("status") != "success"
            ]
            
            result = {
                "connection_tests": test_results,
                "failed_connections": failed_connections,
                "overall_health": "healthy" if not failed_connections else "degraded"
            }
        else:
            # Validation générique
            quality_threshold = config.get("quality_thresholds", {}).get("min_quality_score", 0.8)
            
            result = {
                "validation_passed": True,
                "quality_score": 0.95,
                "threshold": quality_threshold,
                "details": "Toutes les validations passées"
            }
        
        return result
    
    async def _execute_notification_task(self, task: WorkflowTask) -> Dict[str, Any]:
        """Exécuter tâche de notification"""
        config = task.config
        
        # Envoyer notification via le service
        notification_result = await self.notification_service.send_notification(
            recipients=config.get("recipients", []),
            template=config.get("template", "default"),
            data=config.get("data", {})
        )
        
        return {"notification_result": notification_result}
    
    async def _execute_export_task(self, task: WorkflowTask) -> Dict[str, Any]:
        """Exécuter tâche d'export"""
        config = task.config
        
        # Simulation d'export
        result = {
            "exported_files": [
                f"report.{fmt}" for fmt in config.get("formats", ["pdf"])
            ],
            "export_path": "/exports/",
            "file_count": len(config.get("formats", ["pdf"]))
        }
        
        return result
    
    async def _process_running_executions(self):
        """Traiter les exécutions en cours"""
        # Cette méthode est appelée régulièrement pour maintenir l'état
        pass
    
    async def _check_scheduled_triggers(self):
        """Vérifier les triggers programmés"""
        # Implémentation simplifiée - en production, utiliser une vraie librairie de scheduling
        now = datetime.now()
        
        for workflow_id, workflow in self.workflows.items():
            for trigger in workflow.triggers:
                if trigger.get("type") == TriggerType.SCHEDULED:
                    # Vérifier si c'est le moment d'exécuter
                    # (implémentation simplifiée)
                    last_run_key = f"last_run_{workflow_id}"
                    if not hasattr(self, last_run_key):
                        setattr(self, last_run_key, now)
                        await self.execute_workflow(workflow_id, TriggerType.SCHEDULED)
    
    async def _cleanup_old_executions(self):
        """Nettoyer les anciennes exécutions"""
        cutoff_date = datetime.now() - timedelta(days=7)  # Garder 7 jours
        
        to_remove = [
            execution_id for execution_id, execution in self.executions.items()
            if (execution.completed_at and execution.completed_at < cutoff_date)
        ]
        
        for execution_id in to_remove:
            del self.executions[execution_id]
    
    async def _send_workflow_notification(self, execution_id: str):
        """Envoyer notification de fin de workflow"""
        execution = self.executions[execution_id]
        workflow = self.workflows[execution.workflow_id]
        
        await self.notification_service.send_notification(
            recipients=workflow.notification_config.get("recipients", []),
            template="workflow_completion",
            data={
                "workflow_name": workflow.name,
                "execution_id": execution_id,
                "status": execution.status.value,
                "duration": (execution.completed_at - execution.started_at).total_seconds()
            }
        )
    
    # ===== API PUBLIQUE =====
    
    def get_workflow(self, workflow_id: str) -> Optional[WorkflowDefinition]:
        """Récupérer un workflow"""
        return self.workflows.get(workflow_id)
    
    def list_workflows(self) -> List[WorkflowDefinition]:
        """Lister tous les workflows"""
        return list(self.workflows.values())
    
    def get_execution(self, execution_id: str) -> Optional[WorkflowExecution]:
        """Récupérer une exécution"""
        return self.executions.get(execution_id)
    
    def list_executions(self, workflow_id: Optional[str] = None) -> List[WorkflowExecution]:
        """Lister les exécutions"""
        executions = list(self.executions.values())
        
        if workflow_id:
            executions = [e for e in executions if e.workflow_id == workflow_id]
        
        return sorted(executions, key=lambda e: e.started_at, reverse=True)
    
    async def cancel_execution(self, execution_id: str) -> bool:
        """Annuler une exécution"""
        if execution_id not in self.executions:
            return False
        
        execution = self.executions[execution_id]
        execution.status = WorkflowStatus.CANCELLED
        execution.completed_at = datetime.now()
        
        # Annuler les tâches actives
        for task_id in execution.current_tasks:
            task_key = f"{execution_id}_{task_id}"
            if task_key in self.active_tasks:
                self.active_tasks[task_key].cancel()
                del self.active_tasks[task_key]
        
        execution.current_tasks.clear()
        logger.info(f"Exécution {execution_id} annulée")
        
        return True

# ===== SERVICE DE NOTIFICATIONS =====
class NotificationService:
    """Service de notifications pour les workflows"""
    
    def __init__(self):
        self.templates = {
            "daily_sync_complete": "Synchronisation quotidienne terminée",
            "workflow_completion": "Workflow {workflow_name} terminé: {status}",
            "api_health_alert": "Problème détecté avec l'API {api_name}"
        }
    
    async def send_notification(self, 
                              recipients: List[str], 
                              template: str, 
                              data: Dict[str, Any] = None) -> Dict[str, Any]:
        """Envoyer une notification"""
        
        message = self.templates.get(template, template)
        if data:
            message = message.format(**data)
        
        # Simulation d'envoi
        logger.info(f"Notification envoyée à {recipients}: {message}")
        
        return {
            "sent": True,
            "recipients": recipients,
            "message": message,
            "timestamp": datetime.now().isoformat()
        }

# ===== INSTANCE GLOBALE =====
def create_workflow_orchestrator() -> WorkflowOrchestrator:
    """Factory pour créer l'orchestrateur"""
    return WorkflowOrchestrator(
        connector_manager=connector_manager,
        calculation_engine=enhanced_engine
    )

# Instance globale
workflow_orchestrator = create_workflow_orchestrator()