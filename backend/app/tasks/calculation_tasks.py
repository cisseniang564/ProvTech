"""
Tâches Celery pour l'exécution asynchrone des calculs actuariels
Gestion des calculs longs et parallélisation
"""

from celery import Celery, Task
from celery.utils.log import get_task_logger
from celery.signals import task_prerun, task_postrun, task_failure
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
import traceback
import json
import psutil
import time

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.calculation import Calculation, CalculationStatus
from app.models.triangle import Triangle
from app.services.actuarial_engine import (
    actuarial_engine, CalculationParameters, CalculationMethod, TailMethod
)
from app.utils.exceptions import CalculationError, ValidationError
from app.cache.redis_client import redis_client

# Configuration du logging
logger = get_task_logger(__name__)

# Configuration Celery
celery_app = Celery(
    "actuarial_calculations",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        'app.tasks.calculation_tasks',
        'app.tasks.export_tasks',
        'app.tasks.notification_tasks'
    ]
)

# Configuration Celery
celery_app.conf.update(
    task_serializer=settings.CELERY_TASK_SERIALIZER,
    result_serializer=settings.CELERY_RESULT_SERIALIZER,
    accept_content=settings.CELERY_ACCEPT_CONTENT,
    timezone=settings.CELERY_TIMEZONE,
    enable_utc=settings.CELERY_ENABLE_UTC,
    
    # Configuration des tâches
    task_routes={
        'app.tasks.calculation_tasks.*': {'queue': 'calculations'},
        'app.tasks.export_tasks.*': {'queue': 'exports'},
        'app.tasks.notification_tasks.*': {'queue': 'notifications'},
    },
    
    # Limites et timeouts
    task_time_limit=30 * 60,  # 30 minutes max
    task_soft_time_limit=25 * 60,  # 25 minutes warning
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    worker_disable_rate_limits=False,
    
    # Retry configuration
    task_default_retry_delay=60,  # 1 minute
    task_max_retries=3,
    
    # Monitoring
    worker_send_task_events=True,
    task_send_sent_event=True,
)

# ================================
# CLASSE DE BASE POUR LES TÂCHES
# ================================

class BaseCalculationTask(Task):
    """
    Classe de base pour toutes les tâches de calcul
    Gestion des erreurs, retry et monitoring
    """
    
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Appelé en cas d'échec de la tâche"""
        logger.error(f"Tâche {task_id} échouée: {exc}")
        logger.error(f"Traceback: {einfo}")
        
        # Mise à jour du calcul en base
        if args and len(args) > 0:
            calculation_id = args[0]
            try:
                with SessionLocal() as db:
                    calculation = db.query(Calculation).filter(
                        Calculation.id == calculation_id
                    ).first()
                    
                    if calculation:
                        calculation.fail_with_error(str(exc))
                        calculation.execution_log = f"Erreur: {exc}\n{einfo}"
                        db.commit()
                        
                        logger.info(f"Calcul {calculation_id} marqué comme échoué")
            except Exception as e:
                logger.error(f"Erreur mise à jour base après échec: {e}")
    
    def on_retry(self, exc, task_id, args, kwargs, einfo):
        """Appelé lors d'un retry"""
        logger.warning(f"Retry tâche {task_id}: {exc}")
        
        if args and len(args) > 0:
            calculation_id = args[0]
            try:
                with SessionLocal() as db:
                    calculation = db.query(Calculation).filter(
                        Calculation.id == calculation_id
                    ).first()
                    
                    if calculation:
                        calculation.execution_log = f"Retry: {exc}\n{calculation.execution_log or ''}"
                        db.commit()
            except Exception as e:
                logger.error(f"Erreur mise à jour base lors retry: {e}")
    
    def on_success(self, retval, task_id, args, kwargs):
        """Appelé en cas de succès"""
        logger.info(f"Tâche {task_id} terminée avec succès")


# ================================
# TÂCHES PRINCIPALES
# ================================

@celery_app.task(bind=True, base=BaseCalculationTask, name="execute_calculation")
def execute_calculation_task(self, calculation_id: int) -> Dict[str, Any]:
    """
    Tâche principale pour exécuter un calcul actuariel
    
    Args:
        calculation_id: ID du calcul à exécuter
        
    Returns:
        Dict: Résultats du calcul
    """
    start_time = time.time()
    process = psutil.Process()
    initial_memory = process.memory_info().rss / 1024 / 1024  # MB
    
    logger.info(f"Démarrage calcul {calculation_id}")
    
    db = SessionLocal()
    
    try:
        # Récupération du calcul
        calculation = db.query(Calculation).filter(
            Calculation.id == calculation_id
        ).first()
        
        if not calculation:
            raise CalculationError(f"Calcul {calculation_id} non trouvé")
        
        # Vérification du statut
        if calculation.status == CalculationStatus.RUNNING:
            logger.warning(f"Calcul {calculation_id} déjà en cours")
            return {"status": "already_running"}
        
        if calculation.status == CalculationStatus.CANCELLED:
            logger.info(f"Calcul {calculation_id} annulé")
            return {"status": "cancelled"}
        
        # Marquer comme démarré
        calculation.start_execution()
        db.commit()
        
        # Mise à jour du cache
        await _update_calculation_cache(calculation_id, "running")
        
        # Récupération du triangle
        triangle = db.query(Triangle).filter(
            Triangle.id == calculation.triangle_id
        ).first()
        
        if not triangle:
            raise CalculationError(f"Triangle {calculation.triangle_id} non trouvé")
        
        # Reconstruction des paramètres
        parameters = _reconstruct_calculation_parameters(calculation.parameters)
        
        # Validation finale
        validation_errors = []
        validation_errors.extend(parameters.validate())
        validation_errors.extend(triangle.validate_data_structure())
        
        if validation_errors:
            raise ValidationError(f"Validation échouée: {'; '.join(validation_errors)}")
        
        # Exécution du calcul
        logger.info(f"Lancement calcul {parameters.method.value} pour triangle {triangle.name}")
        
        result = actuarial_engine.calculate(triangle, parameters)
        
        # Calcul des métriques de performance
        end_time = time.time()
        execution_time = (end_time - start_time) * 1000  # ms
        final_memory = process.memory_info().rss / 1024 / 1024  # MB
        memory_usage = final_memory - initial_memory
        
        # Mise à jour du résultat
        result.computation_time_ms = execution_time
        
        # Sauvegarde des résultats
        calculation.complete_successfully(result)
        calculation.memory_usage_mb = memory_usage
        db.commit()
        
        # Mise à jour du cache
        await _update_calculation_cache(calculation_id, "completed", result.to_dict())
        
        # Notification de fin (si configurée)
        if calculation.user and hasattr(calculation.user, 'notification_preferences'):
            from app.tasks.notification_tasks import send_calculation_completion_notification
            send_calculation_completion_notification.delay(calculation_id)
        
        logger.info(f"Calcul {calculation_id} terminé en {execution_time:.1f}ms")
        
        return {
            "status": "completed",
            "calculation_id": calculation_id,
            "execution_time_ms": execution_time,
            "memory_usage_mb": memory_usage,
            "total_ultimate": result.total_ultimate,
            "total_reserves": result.total_reserves,
            "warnings": result.warnings
        }
        
    except Exception as e:
        logger.error(f"Erreur calcul {calculation_id}: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        
        # Mise à jour de l'erreur
        if 'calculation' in locals():
            calculation.fail_with_error(str(e))
            calculation.execution_log = traceback.format_exc()
            db.commit()
        
        # Mise à jour du cache
        await _update_calculation_cache(calculation_id, "failed", {"error": str(e)})
        
        # Re-raise pour que Celery gère le retry
        raise
        
    finally:
        db.close()


@celery_app.task(bind=True, base=BaseCalculationTask, name="execute_multiple_calculations")
def execute_multiple_calculations_task(
    self, 
    calculation_ids: List[int],
    parallel: bool = True
) -> Dict[str, Any]:
    """
    Exécute plusieurs calculs en parallèle ou séquentiellement
    
    Args:
        calculation_ids: Liste des IDs de calculs
        parallel: Exécution en parallèle ou séquentielle
        
    Returns:
        Dict: Résultats de tous les calculs
    """
    logger.info(f"Exécution multiple: {len(calculation_ids)} calculs")
    
    results = {
        "total": len(calculation_ids),
        "completed": 0,
        "failed": 0,
        "results": {}
    }
    
    if parallel:
        # Exécution en parallèle avec Celery group
        from celery import group
        
        job = group(
            execute_calculation_task.s(calc_id) 
            for calc_id in calculation_ids
        )
        
        group_result = job.apply_async()
        
        # Attente des résultats
        for i, result in enumerate(group_result.get()):
            calc_id = calculation_ids[i]
            results["results"][str(calc_id)] = result
            
            if result.get("status") == "completed":
                results["completed"] += 1
            else:
                results["failed"] += 1
    
    else:
        # Exécution séquentielle
        for calc_id in calculation_ids:
            try:
                result = execute_calculation_task(calc_id)
                results["results"][str(calc_id)] = result
                
                if result.get("status") == "completed":
                    results["completed"] += 1
                else:
                    results["failed"] += 1
                    
            except Exception as e:
                logger.error(f"Erreur calcul {calc_id}: {e}")
                results["results"][str(calc_id)] = {
                    "status": "failed",
                    "error": str(e)
                }
                results["failed"] += 1
    
    logger.info(f"Exécution multiple terminée: {results['completed']} succès, {results['failed']} échecs")
    
    return results


@celery_app.task(bind=True, name="cancel_calculation")
def cancel_calculation_task(self, calculation_id: int, reason: str = "Cancelled") -> Dict[str, Any]:
    """
    Annule un calcul en cours
    
    Args:
        calculation_id: ID du calcul à annuler
        reason: Raison de l'annulation
        
    Returns:
        Dict: Statut de l'annulation
    """
    logger.info(f"Annulation calcul {calculation_id}: {reason}")
    
    db = SessionLocal()
    
    try:
        calculation = db.query(Calculation).filter(
            Calculation.id == calculation_id
        ).first()
        
        if not calculation:
            return {"status": "not_found"}
        
        if calculation.status != CalculationStatus.RUNNING:
            return {"status": "not_running"}
        
        # Marquer comme annulé
        calculation.cancel(reason)
        db.commit()
        
        # Mise à jour du cache
        await _update_calculation_cache(calculation_id, "cancelled")
        
        # TODO: Essayer d'interrompre la tâche Celery si possible
        # celery_app.control.revoke(task_id, terminate=True)
        
        logger.info(f"Calcul {calculation_id} annulé")
        
        return {"status": "cancelled"}
        
    except Exception as e:
        logger.error(f"Erreur annulation calcul {calculation_id}: {e}")
        return {"status": "error", "message": str(e)}
        
    finally:
        db.close()


# ================================
# TÂCHES DE MAINTENANCE
# ================================

@celery_app.task(name="cleanup_old_calculations")
def cleanup_old_calculations_task(days_old: int = 90) -> Dict[str, Any]:
    """
    Nettoie les anciens calculs échoués ou annulés
    
    Args:
        days_old: Âge en jours pour la suppression
        
    Returns:
        Dict: Statistiques de nettoyage
    """
    logger.info(f"Nettoyage des calculs > {days_old} jours")
    
    db = SessionLocal()
    
    try:
        cutoff_date = datetime.utcnow() - timedelta(days=days_old)
        
        # Requête pour les calculs à nettoyer
        old_calculations = db.query(Calculation).filter(
            Calculation.created_at < cutoff_date,
            Calculation.status.in_([
                CalculationStatus.FAILED,
                CalculationStatus.CANCELLED
            ]),
            Calculation.is_archived == True
        ).all()
        
        deleted_count = 0
        for calc in old_calculations:
            # Suppression du cache associé
            try:
                await redis_client.delete(f"calculation:{calc.id}")
            except:
                pass
            
            # Suppression de la base
            db.delete(calc)
            deleted_count += 1
        
        db.commit()
        
        logger.info(f"Nettoyage terminé: {deleted_count} calculs supprimés")
        
        return {
            "deleted_count": deleted_count,
            "cutoff_date": cutoff_date.isoformat()
        }
        
    except Exception as e:
        logger.error(f"Erreur nettoyage: {e}")
        db.rollback()
        return {"error": str(e)}
        
    finally:
        db.close()


@celery_app.task(name="health_check_calculations")
def health_check_calculations_task() -> Dict[str, Any]:
    """
    Vérifie la santé des calculs en cours
    Détecte les calculs bloqués ou orphelins
    
    Returns:
        Dict: État de santé
    """
    logger.info("Vérification santé des calculs")
    
    db = SessionLocal()
    
    try:
        # Calculs en cours depuis plus de 1 heure
        timeout_threshold = datetime.utcnow() - timedelta(hours=1)
        
        stuck_calculations = db.query(Calculation).filter(
            Calculation.status == CalculationStatus.RUNNING,
            Calculation.started_at < timeout_threshold
        ).all()
        
        # Marquer comme échoués
        recovered_count = 0
        for calc in stuck_calculations:
            calc.fail_with_error("Timeout - calcul bloqué")
            calc.execution_log = "Récupéré par health check - timeout"
            recovered_count += 1
        
        if recovered_count > 0:
            db.commit()
            logger.warning(f"{recovered_count} calculs bloqués récupérés")
        
        # Statistiques générales
        total_running = db.query(Calculation).filter(
            Calculation.status == CalculationStatus.RUNNING
        ).count()
        
        total_pending = db.query(Calculation).filter(
            Calculation.status == CalculationStatus.PENDING
        ).count()
        
        return {
            "status": "healthy",
            "running_calculations": total_running,
            "pending_calculations": total_pending,
            "recovered_calculations": recovered_count,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Erreur health check: {e}")
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }
        
    finally:
        db.close()


# ================================
# TÂCHES DE MONITORING
# ================================

@celery_app.task(name="generate_calculation_metrics")
def generate_calculation_metrics_task(period_hours: int = 24) -> Dict[str, Any]:
    """
    Génère des métriques sur les performances des calculs
    
    Args:
        period_hours: Période d'analyse en heures
        
    Returns:
        Dict: Métriques de performance
    """
    logger.info(f"Génération métriques calculs ({period_hours}h)")
    
    db = SessionLocal()
    
    try:
        since_date = datetime.utcnow() - timedelta(hours=period_hours)
        
        # Requête pour les calculs de la période
        calculations = db.query(Calculation).filter(
            Calculation.created_at >= since_date,
            Calculation.status == CalculationStatus.COMPLETED
        ).all()
        
        if not calculations:
            return {"period_hours": period_hours, "calculations_count": 0}
        
        # Calculs des métriques
        execution_times = [c.computation_time_ms for c in calculations if c.computation_time_ms]
        memory_usages = [c.memory_usage_mb for c in calculations if c.memory_usage_mb]
        
        metrics = {
            "period_hours": period_hours,
            "calculations_count": len(calculations),
            "methods_distribution": {},
            "performance": {
                "avg_execution_time_ms": sum(execution_times) / len(execution_times) if execution_times else 0,
                "min_execution_time_ms": min(execution_times) if execution_times else 0,
                "max_execution_time_ms": max(execution_times) if execution_times else 0,
                "avg_memory_usage_mb": sum(memory_usages) / len(memory_usages) if memory_usages else 0
            },
            "quality": {
                "avg_quality_score": 0,
                "high_quality_count": 0
            }
        }
        
        # Distribution par méthode
        for calc in calculations:
            method = calc.method.value
            metrics["methods_distribution"][method] = metrics["methods_distribution"].get(method, 0) + 1
        
        # Métriques de qualité
        quality_scores = [c.quality_score for c in calculations if c.quality_score is not None]
        if quality_scores:
            metrics["quality"]["avg_quality_score"] = sum(quality_scores) / len(quality_scores)
            metrics["quality"]["high_quality_count"] = sum(1 for s in quality_scores if s > 0.8)
        
        # Sauvegarde des métriques dans le cache
        await redis_client.setex(
            f"metrics:calculations:{period_hours}h",
            3600,  # 1 heure TTL
            json.dumps(metrics)
        )
        
        logger.info(f"Métriques générées: {len(calculations)} calculs analysés")
        
        return metrics
        
    except Exception as e:
        logger.error(f"Erreur génération métriques: {e}")
        return {"error": str(e)}
        
    finally:
        db.close()


# ================================
# FONCTIONS UTILITAIRES
# ================================

def _reconstruct_calculation_parameters(params_dict: Dict[str, Any]) -> CalculationParameters:
    """
    Reconstruit les paramètres de calcul depuis un dictionnaire
    
    Args:
        params_dict: Paramètres sérialisés
        
    Returns:
        CalculationParameters: Paramètres reconstruits
    """
    try:
        # Conversion des enums
        method = CalculationMethod(params_dict.get("method", "chain_ladder"))
        tail_method = TailMethod(params_dict.get("tail_method", "constant"))
        
        # Construction des paramètres
        parameters = CalculationParameters(
            method=method,
            confidence_level=params_dict.get("confidence_level", 0.75),
            tail_method=tail_method,
            tail_factor=params_dict.get("tail_factor", 1.0),
            alpha=params_dict.get("alpha", 1.0),
            use_volume_weighted=params_dict.get("use_volume_weighted", False),
            exclude_outliers=params_dict.get("exclude_outliers", False),
            outlier_threshold=params_dict.get("outlier_threshold", 3.0),
            expected_loss_ratio=params_dict.get("expected_loss_ratio"),
            description=params_dict.get("description", ""),
            user_notes=params_dict.get("user_notes", ""),
            custom_parameters=params_dict.get("custom_parameters", {})
        )
        
        # Reconstruction des arrays numpy si présents
        if params_dict.get("premium_data"):
            import numpy as np
            parameters.premium_data = np.array(params_dict["premium_data"])
        
        if params_dict.get("exposure_data"):
            import numpy as np
            parameters.exposure_data = np.array(params_dict["exposure_data"])
        
        return parameters
        
    except Exception as e:
        raise ValidationError(f"Erreur reconstruction paramètres: {e}")


async def _update_calculation_cache(
    calculation_id: int, 
    status: str, 
    data: Optional[Dict[str, Any]] = None
):
    """
    Met à jour le cache pour un calcul
    
    Args:
        calculation_id: ID du calcul
        status: Nouveau statut
        data: Données additionnelles
    """
    try:
        cache_key = f"calculation:{calculation_id}"
        cache_data = {
            "status": status,
            "updated_at": datetime.utcnow().isoformat()
        }
        
        if data:
            cache_data.update(data)
        
        await redis_client.setex(
            cache_key,
            3600,  # 1 heure TTL
            json.dumps(cache_data)
        )
        
    except Exception as e:
        logger.warning(f"Erreur mise à jour cache {calculation_id}: {e}")


def execute_calculation_sync(calculation_id: int) -> Dict[str, Any]:
    """
    Version synchrone pour tests et développement
    
    Args:
        calculation_id: ID du calcul
        
    Returns:
        Dict: Résultats du calcul
    """
    logger.info(f"Exécution synchrone calcul {calculation_id}")
    
    # Appel direct sans Celery
    return execute_calculation_task(calculation_id)


# ================================
# SIGNAUX CELERY
# ================================

@task_prerun.connect
def task_prerun_handler(sender=None, task_id=None, task=None, args=None, kwargs=None, **kwds):
    """Signal avant exécution des tâches"""
    logger.info(f"Démarrage tâche {task.name} ({task_id})")


@task_postrun.connect
def task_postrun_handler(sender=None, task_id=None, task=None, args=None, kwargs=None, retval=None, state=None, **kwds):
    """Signal après exécution des tâches"""
    logger.info(f"Fin tâche {task.name} ({task_id}) - État: {state}")


@task_failure.connect
def task_failure_handler(sender=None, task_id=None, exception=None, traceback=None, einfo=None, **kwds):
    """Signal en cas d'échec des tâches"""
    logger.error(f"Échec tâche {sender.name} ({task_id}): {exception}")


# ================================
# TÂCHES PÉRIODIQUES
# ================================

# Configuration Celery Beat pour les tâches périodiques
celery_app.conf.beat_schedule = {
    # Nettoyage quotidien
    'cleanup-old-calculations': {
        'task': 'cleanup_old_calculations',
        'schedule': 86400.0,  # 24 heures
        'kwargs': {'days_old': 90}
    },
    
    # Health check toutes les 10 minutes
    'health-check-calculations': {
        'task': 'health_check_calculations',
        'schedule': 600.0,  # 10 minutes
    },
    
    # Métriques toutes les heures
    'generate-calculation-metrics': {
        'task': 'generate_calculation_metrics',
        'schedule': 3600.0,  # 1 heure
        'kwargs': {'period_hours': 24}
    },
}

# ================================
# EXPORTS
# ================================

__all__ = [
    "celery_app",
    "execute_calculation_task",
    "execute_multiple_calculations_task",
    "cancel_calculation_task",
    "cleanup_old_calculations_task",
    "health_check_calculations_task",
    "generate_calculation_metrics_task",
    "execute_calculation_sync"
]