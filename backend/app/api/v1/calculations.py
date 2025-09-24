"""
API endpoints pour les calculs actuariels
Gestion des calculs, exécution et résultats
"""

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Query
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, desc
from typing import List, Optional, Dict, Any, Union
from datetime import datetime, timedelta
import logging
from io import BytesIO

from app.core.database import get_db
from app.core.security import get_current_user_token, TokenData, Permission, require_permissions
from app.models.user import User
from app.models.triangle import Triangle
from app.models.calculation import (
    Calculation, CalculationStatus, CalculationPriority, ValidationLevel,
    create_calculation_from_parameters, get_calculation_statistics
)
from app.services.actuarial_engine import (
    actuarial_engine, CalculationMethod, CalculationParameters, 
    create_calculation_parameters, validate_triangle_for_calculation,
    recommend_calculation_method
)
from app.schemas.calculation import (
    CalculationCreate, CalculationUpdate, CalculationResponse,
    CalculationResultResponse, CalculationListResponse, CalculationExecuteRequest,
    CalculationComparisonRequest, CalculationStatisticsResponse
)
from app.tasks.calculation_tasks import execute_calculation_task
from app.utils.exceptions import CalculationError, ValidationError

# Configuration du logging
logger = logging.getLogger(__name__)

# Création du routeur
router = APIRouter()


# ================================
# ENDPOINTS DE GESTION DES CALCULS
# ================================

@router.get("/", response_model=CalculationListResponse)
async def get_calculations(
    skip: int = Query(0, ge=0, description="Nombre d'éléments à ignorer"),
    limit: int = Query(100, ge=1, le=1000, description="Nombre d'éléments à retourner"),
    triangle_id: Optional[int] = Query(None, description="Filtrer par triangle"),
    method: Optional[CalculationMethod] = Query(None, description="Filtrer par méthode"),
    status: Optional[CalculationStatus] = Query(None, description="Filtrer par statut"),
    user_id: Optional[int] = Query(None, description="Filtrer par utilisateur"),
    include_archived: bool = Query(False, description="Inclure les calculs archivés"),
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user_token)
):
    """
    Récupère la liste des calculs avec filtres et pagination
    """
    try:
        # Construction de la requête
        query = db.query(Calculation)
        
        # Filtres de sécurité - utilisateur voit seulement ses calculs sauf admin
        if not current_user.permissions or Permission.ADMIN_READ not in current_user.permissions:
            query = query.filter(Calculation.user_id == current_user.user_id)
        
        # Filtres optionnels
        if triangle_id:
            query = query.filter(Calculation.triangle_id == triangle_id)
        
        if method:
            query = query.filter(Calculation.method == method)
        
        if status:
            query = query.filter(Calculation.status == status)
        
        if user_id and Permission.ADMIN_READ in current_user.permissions:
            query = query.filter(Calculation.user_id == user_id)
        
        if not include_archived:
            query = query.filter(Calculation.is_archived == False)
        
        # Ordre par date de création décroissante
        query = query.order_by(desc(Calculation.created_at))
        
        # Pagination
        total = query.count()
        calculations = query.offset(skip).limit(limit).all()
        
        # Conversion en réponse
        items = [
            CalculationResponse.from_orm(calc) 
            for calc in calculations
        ]
        
        return CalculationListResponse(
            items=items,
            total=total,
            skip=skip,
            limit=limit
        )
        
    except Exception as e:
        logger.error(f"Erreur récupération calculs: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur lors de la récupération des calculs"
        )


@router.get("/{calculation_id}", response_model=CalculationResponse)
async def get_calculation(
    calculation_id: int,
    include_results: bool = Query(True, description="Inclure les résultats détaillés"),
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user_token)
):
    """
    Récupère un calcul spécifique par son ID
    """
    calculation = db.query(Calculation).filter(Calculation.id == calculation_id).first()
    
    if not calculation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calcul non trouvé"
        )
    
    # Vérification des permissions
    if (calculation.user_id != current_user.user_id and 
        Permission.ADMIN_READ not in current_user.permissions):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès non autorisé à ce calcul"
        )
    
    return CalculationResponse.from_orm(calculation)


@router.post("/", response_model=CalculationResponse, status_code=status.HTTP_201_CREATED)
@require_permissions(Permission.CALCULATION_WRITE)
async def create_calculation(
    calculation_data: CalculationCreate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user_token)
):
    """
    Crée un nouveau calcul
    """
    try:
        # Vérification que le triangle existe et appartient à l'utilisateur
        triangle = db.query(Triangle).filter(Triangle.id == calculation_data.triangle_id).first()
        
        if not triangle:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Triangle non trouvé"
            )
        
        if (triangle.owner_id != current_user.user_id and 
            Permission.ADMIN_WRITE not in current_user.permissions):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Accès non autorisé à ce triangle"
            )
        
        # Validation du triangle pour calcul
        triangle_errors = validate_triangle_for_calculation(triangle)
        if triangle_errors:
            raise ValidationError(f"Triangle invalide: {'; '.join(triangle_errors)}")
        
        # Création des paramètres de calcul
        parameters = create_calculation_parameters(
            method=calculation_data.method,
            confidence_level=calculation_data.confidence_level,
            tail_method=calculation_data.tail_method,
            tail_factor=calculation_data.tail_factor,
            alpha=calculation_data.alpha,
            use_volume_weighted=calculation_data.use_volume_weighted,
            exclude_outliers=calculation_data.exclude_outliers,
            outlier_threshold=calculation_data.outlier_threshold,
            expected_loss_ratio=calculation_data.expected_loss_ratio,
            description=calculation_data.description or "",
            user_notes=calculation_data.user_notes or "",
            custom_parameters=calculation_data.custom_parameters or {}
        )
        
        # Validation des paramètres
        param_errors = parameters.validate()
        if param_errors:
            raise ValidationError(f"Paramètres invalides: {'; '.join(param_errors)}")
        
        # Création du calcul
        calculation = create_calculation_from_parameters(
            triangle_id=calculation_data.triangle_id,
            user_id=current_user.user_id,
            method=calculation_data.method,
            parameters=parameters,
            name=calculation_data.name,
            description=calculation_data.description
        )
        
        # Paramètres additionnels
        if calculation_data.priority:
            calculation.priority = calculation_data.priority
        
        # Sauvegarde
        db.add(calculation)
        db.commit()
        db.refresh(calculation)
        
        logger.info(f"Calcul créé: {calculation.id} par utilisateur {current_user.user_id}")
        
        return CalculationResponse.from_orm(calculation)
        
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Erreur création calcul: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur lors de la création du calcul"
        )


@router.post("/{calculation_id}/execute", response_model=CalculationResponse)
@require_permissions(Permission.CALCULATION_EXECUTE)
async def execute_calculation(
    calculation_id: int,
    execution_data: Optional[CalculationExecuteRequest] = None,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user_token)
):
    """
    Lance l'exécution d'un calcul
    """
    calculation = db.query(Calculation).filter(Calculation.id == calculation_id).first()
    
    if not calculation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calcul non trouvé"
        )
    
    # Vérification des permissions
    if (calculation.user_id != current_user.user_id and 
        Permission.ADMIN_WRITE not in current_user.permissions):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès non autorisé à ce calcul"
        )
    
    # Vérification du statut
    if calculation.status == CalculationStatus.RUNNING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Calcul déjà en cours d'exécution"
        )
    
    try:
        # Mise à jour des paramètres si fournis
        if execution_data and execution_data.override_parameters:
            # Merge des paramètres
            current_params = calculation.parameters.copy()
            current_params.update(execution_data.override_parameters)
            calculation.parameters = current_params
        
        # Validation finale
        validation_errors = calculation.validate_parameters()
        validation_errors.extend(calculation.validate_triangle_compatibility())
        
        if validation_errors:
            raise ValidationError(f"Validation échouée: {'; '.join(validation_errors)}")
        
        # Mise à jour du statut
        calculation.status = CalculationStatus.PENDING
        calculation.updated_at = datetime.utcnow()
        
        # Priorité d'exécution
        if execution_data and execution_data.priority:
            calculation.priority = execution_data.priority
        
        db.commit()
        
        # Lancement de la tâche en arrière-plan
        if execution_data and execution_data.run_synchronously:
            # Exécution synchrone pour les tests ou calculs rapides
            from app.tasks.calculation_tasks import execute_calculation_sync
            result = execute_calculation_sync(calculation.id)
            
            # Rechargement du calcul mis à jour
            db.refresh(calculation)
            
        else:
            # Exécution asynchrone (recommandée)
            task_id = execute_calculation_task.delay(calculation.id)
            calculation.execution_log = f"Tâche lancée: {task_id}"
            db.commit()
        
        logger.info(f"Exécution lancée pour calcul {calculation.id}")
        
        return CalculationResponse.from_orm(calculation)
        
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Erreur lancement calcul {calculation_id}: {e}")
        calculation.status = CalculationStatus.FAILED
        calculation.error_message = str(e)
        db.commit()
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur lors du lancement du calcul"
        )


@router.put("/{calculation_id}", response_model=CalculationResponse)
@require_permissions(Permission.CALCULATION_WRITE)
async def update_calculation(
    calculation_id: int,
    calculation_update: CalculationUpdate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user_token)
):
    """
    Met à jour un calcul existant
    """
    calculation = db.query(Calculation).filter(Calculation.id == calculation_id).first()
    
    if not calculation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calcul non trouvé"
        )
    
    # Vérification des permissions
    if (calculation.user_id != current_user.user_id and 
        Permission.ADMIN_WRITE not in current_user.permissions):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès non autorisé à ce calcul"
        )
    
    # Vérification que le calcul n'est pas en cours
    if calculation.status == CalculationStatus.RUNNING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Impossible de modifier un calcul en cours"
        )
    
    try:
        # Mise à jour des champs autorisés
        update_data = calculation_update.dict(exclude_unset=True)
        
        for field, value in update_data.items():
            if hasattr(calculation, field):
                setattr(calculation, field, value)
        
        calculation.updated_at = datetime.utcnow()
        
        # Reset du statut si les paramètres ont changé
        if 'parameters' in update_data:
            calculation.status = CalculationStatus.PENDING
            calculation.results = None
            calculation.error_message = None
        
        db.commit()
        db.refresh(calculation)
        
        logger.info(f"Calcul {calculation_id} mis à jour par utilisateur {current_user.user_id}")
        
        return CalculationResponse.from_orm(calculation)
        
    except Exception as e:
        logger.error(f"Erreur mise à jour calcul {calculation_id}: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur lors de la mise à jour"
        )


@router.delete("/{calculation_id}", status_code=status.HTTP_204_NO_CONTENT)
@require_permissions(Permission.CALCULATION_WRITE)
async def delete_calculation(
    calculation_id: int,
    force_delete: bool = Query(False, description="Forcer la suppression même si en cours"),
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user_token)
):
    """
    Supprime un calcul
    """
    calculation = db.query(Calculation).filter(Calculation.id == calculation_id).first()
    
    if not calculation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calcul non trouvé"
        )
    
    # Vérification des permissions
    if (calculation.user_id != current_user.user_id and 
        Permission.ADMIN_WRITE not in current_user.permissions):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès non autorisé à ce calcul"
        )
    
    # Vérification du statut
    if calculation.status == CalculationStatus.RUNNING and not force_delete:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Impossible de supprimer un calcul en cours. Utilisez force_delete=true"
        )
    
    try:
        # Annulation si en cours
        if calculation.status == CalculationStatus.RUNNING:
            calculation.cancel("Suppression demandée")
            db.commit()
        
        # Suppression
        db.delete(calculation)
        db.commit()
        
        logger.info(f"Calcul {calculation_id} supprimé par utilisateur {current_user.user_id}")
        
    except Exception as e:
        logger.error(f"Erreur suppression calcul {calculation_id}: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur lors de la suppression"
        )


# ================================
# ENDPOINTS DE GESTION DES RÉSULTATS
# ================================

@router.get("/{calculation_id}/results", response_model=CalculationResultResponse)
async def get_calculation_results(
    calculation_id: int,
    format_results: bool = Query(True, description="Formater les résultats pour l'affichage"),
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user_token)
):
    """
    Récupère les résultats détaillés d'un calcul
    """
    calculation = db.query(Calculation).filter(Calculation.id == calculation_id).first()
    
    if not calculation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calcul non trouvé"
        )
    
    # Vérification des permissions
    if (calculation.user_id != current_user.user_id and 
        Permission.CALCULATION_READ not in current_user.permissions):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès non autorisé à ce calcul"
        )
    
    if not calculation.has_results:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aucun résultat disponible pour ce calcul"
        )
    
    try:
        response_data = {
            "calculation_id": calculation.id,
            "calculation_name": calculation.name,
            "method": calculation.method.value,
            "status": calculation.status.value,
            "results": calculation.results,
            "summary": calculation.get_summary_statistics(),
            "triangle": {
                "id": calculation.triangle.id,
                "name": calculation.triangle.name,
                "dimensions": calculation.triangle.dimensions
            },
            "computed_at": calculation.completed_at.isoformat() if calculation.completed_at else None,
            "computation_time_ms": calculation.computation_time_ms
        }
        
        # Formatage des résultats si demandé
        if format_results:
            response_data["formatted_results"] = _format_calculation_results(calculation.results)
        
        return CalculationResultResponse(**response_data)
        
    except Exception as e:
        logger.error(f"Erreur récupération résultats {calculation_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur lors de la récupération des résultats"
        )


@router.post("/compare", response_model=Dict[str, Any])
@require_permissions(Permission.CALCULATION_READ)
async def compare_calculations(
    comparison_request: CalculationComparisonRequest,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user_token)
):
    """
    Compare plusieurs calculs entre eux
    """
    try:
        # Récupération des calculs
        calculations = db.query(Calculation).filter(
            Calculation.id.in_(comparison_request.calculation_ids)
        ).all()
        
        if len(calculations) != len(comparison_request.calculation_ids):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Un ou plusieurs calculs non trouvés"
            )
        
        # Vérification des permissions
        for calc in calculations:
            if (calc.user_id != current_user.user_id and 
                Permission.ADMIN_READ not in current_user.permissions):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Accès non autorisé au calcul {calc.id}"
                )
        
        # Vérification que tous les calculs ont des résultats
        incomplete_calcs = [c for c in calculations if not c.has_results]
        if incomplete_calcs:
            incomplete_ids = [str(c.id) for c in incomplete_calcs]
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Calculs sans résultats: {', '.join(incomplete_ids)}"
            )
        
        # Analyse comparative
        comparison_result = _perform_calculation_comparison(
            calculations, 
            comparison_request.comparison_type,
            comparison_request.metrics_to_compare
        )
        
        logger.info(f"Comparaison effectuée pour {len(calculations)} calculs")
        
        return comparison_result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur comparaison calculs: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur lors de la comparaison"
        )


# ================================
# ENDPOINTS UTILITAIRES
# ================================

@router.get("/statistics/summary", response_model=CalculationStatisticsResponse)
@require_permissions(Permission.CALCULATION_READ)
async def get_calculations_statistics(
    triangle_id: Optional[int] = Query(None, description="Filtrer par triangle"),
    period_days: int = Query(30, ge=1, le=365, description="Période d'analyse en jours"),
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user_token)
):
    """
    Statistiques sur les calculs
    """
    try:
        # Construction de la requête
        query = db.query(Calculation)
        
        # Filtres de sécurité
        if Permission.ADMIN_READ not in current_user.permissions:
            query = query.filter(Calculation.user_id == current_user.user_id)
        
        # Filtres optionnels
        if triangle_id:
            query = query.filter(Calculation.triangle_id == triangle_id)
        
        # Période
        date_limit = datetime.utcnow() - timedelta(days=period_days)
        query = query.filter(Calculation.created_at >= date_limit)
        
        calculations = query.all()
        
        # Calcul des statistiques
        stats = get_calculation_statistics(calculations)
        
        return CalculationStatisticsResponse(
            period_days=period_days,
            triangle_id=triangle_id,
            statistics=stats
        )
        
    except Exception as e:
        logger.error(f"Erreur statistiques calculs: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur lors du calcul des statistiques"
        )


@router.get("/methods/available")
async def get_available_methods():
    """
    Liste des méthodes de calcul disponibles
    """
    try:
        methods = actuarial_engine.get_available_methods()
        return {
            "methods": methods,
            "total": len(methods)
        }
    except Exception as e:
        logger.error(f"Erreur récupération méthodes: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur lors de la récupération des méthodes"
        )


@router.get("/triangles/{triangle_id}/recommendations")
@require_permissions(Permission.CALCULATION_READ)
async def get_method_recommendations(
    triangle_id: int,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user_token)
):
    """
    Recommandations de méthodes pour un triangle donné
    """
    triangle = db.query(Triangle).filter(Triangle.id == triangle_id).first()
    
    if not triangle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Triangle non trouvé"
        )
    
    # Vérification des permissions
    if (triangle.owner_id != current_user.user_id and 
        Permission.ADMIN_READ not in current_user.permissions):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès non autorisé à ce triangle"
        )
    
    try:
        recommendations = recommend_calculation_method(triangle)
        return recommendations
        
    except Exception as e:
        logger.error(f"Erreur recommandations triangle {triangle_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur lors du calcul des recommandations"
        )


@router.post("/{calculation_id}/cancel", response_model=CalculationResponse)
@require_permissions(Permission.CALCULATION_WRITE)
async def cancel_calculation(
    calculation_id: int,
    reason: str = Query("Cancelled by user", description="Raison de l'annulation"),
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user_token)
):
    """
    Annule un calcul en cours
    """
    calculation = db.query(Calculation).filter(Calculation.id == calculation_id).first()
    
    if not calculation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calcul non trouvé"
        )
    
    # Vérification des permissions
    if (calculation.user_id != current_user.user_id and 
        Permission.ADMIN_WRITE not in current_user.permissions):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès non autorisé à ce calcul"
        )
    
    if calculation.status != CalculationStatus.RUNNING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Seuls les calculs en cours peuvent être annulés"
        )
    
    try:
        calculation.cancel(reason)
        db.commit()
        
        # TODO: Annuler la tâche Celery si possible
        
        logger.info(f"Calcul {calculation_id} annulé par utilisateur {current_user.user_id}")
        
        return CalculationResponse.from_orm(calculation)
        
    except Exception as e:
        logger.error(f"Erreur annulation calcul {calculation_id}: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur lors de l'annulation"
        )


# ================================
# FONCTIONS UTILITAIRES
# ================================

def _format_calculation_results(results: Dict[str, Any]) -> Dict[str, Any]:
    """
    Formate les résultats pour l'affichage
    
    Args:
        results: Résultats bruts du calcul
        
    Returns:
        Dict: Résultats formatés
    """
    formatted = {
        "summary": {
            "total_ultimate": f"{results.get('total_ultimate', 0):,.0f}",
            "total_reserves": f"{results.get('total_reserves', 0):,.0f}",
            "total_paid": f"{results.get('total_paid', 0):,.0f}",
        },
        "quality_metrics": {
            "r_squared": f"{results.get('r_squared', 0):.3f}" if results.get('r_squared') else "N/A",
            "mse": f"{results.get('mean_squared_error', 0):.0f}" if results.get('mean_squared_error') else "N/A"
        }
    }
    
    # Formatage des arrays
    if 'ultimate_claims' in results and results['ultimate_claims']:
        formatted["ultimate_claims"] = [
            f"{val:,.0f}" for val in results['ultimate_claims']
        ]
    
    if 'reserves' in results and results['reserves']:
        formatted["reserves"] = [
            f"{val:,.0f}" for val in results['reserves']
        ]
    
    if 'development_factors' in results and results['development_factors']:
        formatted["development_factors"] = [
            f"{val:.4f}" for val in results['development_factors']
        ]
    
    return formatted


def _perform_calculation_comparison(
    calculations: List[Calculation],
    comparison_type: str,
    metrics: List[str]
) -> Dict[str, Any]:
    """
    Effectue la comparaison entre calculs
    
    Args:
        calculations: Liste des calculs à comparer
        comparison_type: Type de comparaison
        metrics: Métriques à comparer
        
    Returns:
        Dict: Résultats de la comparaison
    """
    comparison = {
        "calculations": [
            {
                "id": calc.id,
                "name": calc.name,
                "method": calc.method.value
            }
            for calc in calculations
        ],
        "comparison_type": comparison_type,
        "metrics_compared": metrics,
        "results": {}
    }
    
    # Extraction des métriques
    for metric in metrics:
        values = []
        for calc in calculations:
            if metric in calc.results:
                values.append(calc.results[metric])
        
        if values:
            comparison["results"][metric] = {
                "values": values,
                "min": min(values),
                "max": max(values),
                "mean": sum(values) / len(values),
                "range": max(values) - min(values),
                "coefficient_of_variation": np.std(values) / np.mean(values) if np.mean(values) > 0 else 0
            }
    
    # Analyse globale
    if "total_ultimate" in comparison["results"]:
        ultimate_values = comparison["results"]["total_ultimate"]["values"]
        cv = comparison["results"]["total_ultimate"]["coefficient_of_variation"]
        
        if cv < 0.05:
            comparison["conclusion"] = "Convergence excellente entre les méthodes"
        elif cv < 0.15:
            comparison["conclusion"] = "Convergence acceptable"
        else:
            comparison["conclusion"] = "Divergence significative - Analyser les hypothèses"
    
    return comparison


# ================================
# VALIDATION DES SCHÉMAS
# ================================

# Import des schémas manquants (à créer)
# Ces schémas doivent être définis dans app/schemas/calculation.py

import numpy as np
from datetime import timedelta

__all__ = ["router"]