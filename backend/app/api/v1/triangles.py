"""
API Endpoint - Gestion des triangles de développement
CRUD complet pour les triangles avec validation et cache
"""

from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
import pandas as pd
import numpy as np
import json
import io
import logging
from uuid import uuid4

# Import des schémas Pydantic
from app.schemas import (
    TriangleCreate, TriangleUpdate, TriangleResponse, TriangleStatistics,
    SuccessResponse, ErrorResponse, PaginatedResponse,
    TriangleType, InsuranceLine, Currency
)

# Import des modèles et services
from app.models.triangle import Triangle
from app.models.calculation import Calculation
from app.core.database import get_db
from app.api.v1.auth import get_current_active_user, get_current_user
from app.models.user import User
from app.cache.redis_client import RedisCache
from app.services.data_processor import DataProcessor
from app.services.validation_service import ValidationService
from app.services.audit_service import AuditService
from app.utils.formatters import format_triangle_for_export

# Configuration
logger = logging.getLogger(__name__)
router = APIRouter(prefix="/triangles", tags=["Triangles"])

# Instances des services
redis_cache = RedisCache()
data_processor = DataProcessor()
validation_service = ValidationService()
audit_service = AuditService()

# ============================================================================
# ENDPOINTS - CRUD TRIANGLES
# ============================================================================

@router.post("/", response_model=TriangleResponse, status_code=status.HTTP_201_CREATED)
async def create_triangle(
    triangle: TriangleCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Créer un nouveau triangle de développement
    
    - **name**: Nom du triangle (obligatoire)
    - **triangle_type**: Type (PAID, INCURRED, etc.)
    - **data**: Matrice du triangle
    - **premiums**: Primes pour Bornhuetter-Ferguson (optionnel)
    """
    try:
        # Valider les données du triangle
        validation_result = validation_service.validate_triangle(triangle.data)
        if not validation_result["valid"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid triangle data: {validation_result['errors']}"
            )
        
        # Vérifier les quotas utilisateur
        user_triangles_count = db.query(Triangle).filter(
            Triangle.user_id == current_user.id
        ).count()
        
        quota_limit = get_triangle_quota(current_user.role)
        if user_triangles_count >= quota_limit:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Triangle quota exceeded. Limit: {quota_limit}"
            )
        
        # Calculer les statistiques du triangle
        stats = calculate_triangle_statistics(triangle.data)
        
        # Créer le triangle en base
        db_triangle = Triangle(
            name=triangle.name,
            description=triangle.description,
            triangle_type=triangle.triangle_type,
            insurance_line=triangle.insurance_line,
            currency=triangle.currency,
            unit=triangle.unit,
            user_id=current_user.id,
            data=json.dumps({
                "values": triangle.data,
                "accident_years": triangle.accident_years or list(range(len(triangle.data))),
                "development_periods": triangle.development_periods or list(range(len(triangle.data[0]))),
                "exposure": triangle.exposure,
                "premiums": triangle.premiums
            }),
            metadata=json.dumps({
                "statistics": stats,
                "validation": validation_result,
                "created_by": current_user.username,
                "version": 1
            }),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        db.add(db_triangle)
        db.commit()
        db.refresh(db_triangle)
        
        # Invalider le cache des triangles
        redis_cache.delete_pattern(f"triangles:user:{current_user.id}:*")
        
        # Logger l'action dans l'audit trail
        await audit_service.log_action(
            user_id=current_user.id,
            action="CREATE_TRIANGLE",
            resource_type="triangle",
            resource_id=db_triangle.id,
            details={"name": triangle.name, "type": triangle.triangle_type}
        )
        
        logger.info(f"Triangle created: {db_triangle.id} by user: {current_user.username}")
        
        # Préparer la réponse
        return format_triangle_response(db_triangle)
        
    except Exception as e:
        logger.error(f"Error creating triangle: {str(e)}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating triangle: {str(e)}"
        )

@router.get("/", response_model=PaginatedResponse)
async def get_triangles(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    triangle_type: Optional[TriangleType] = None,
    insurance_line: Optional[InsuranceLine] = None,
    search: Optional[str] = None,
    sort_by: str = Query("created_at", regex="^(name|created_at|updated_at)$"),
    sort_order: str = Query("desc", regex="^(asc|desc)$"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Récupérer la liste des triangles de l'utilisateur avec pagination et filtres
    """
    # Vérifier le cache
    cache_key = f"triangles:user:{current_user.id}:page:{page}:per_page:{per_page}:filters:{triangle_type}:{insurance_line}:{search}"
    cached_result = redis_cache.get(cache_key)
    
    if cached_result:
        return cached_result
    
    # Construire la requête de base
    query = db.query(Triangle).filter(Triangle.user_id == current_user.id)
    
    # Appliquer les filtres
    if triangle_type:
        query = query.filter(Triangle.triangle_type == triangle_type)
    
    if insurance_line:
        query = query.filter(Triangle.insurance_line == insurance_line)
    
    if search:
        query = query.filter(
            or_(
                Triangle.name.ilike(f"%{search}%"),
                Triangle.description.ilike(f"%{search}%")
            )
        )
    
    # Compter le total
    total = query.count()
    
    # Appliquer le tri
    if sort_order == "desc":
        query = query.order_by(getattr(Triangle, sort_by).desc())
    else:
        query = query.order_by(getattr(Triangle, sort_by))
    
    # Pagination
    triangles = query.offset((page - 1) * per_page).limit(per_page).all()
    
    # Formater les résultats
    items = [format_triangle_response(t) for t in triangles]
    
    result = {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page
    }
    
    # Mettre en cache
    redis_cache.set(cache_key, result, ttl=300)  # 5 minutes
    
    return result

@router.get("/{triangle_id}", response_model=TriangleResponse)
async def get_triangle(
    triangle_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Récupérer un triangle spécifique par ID
    """
    # Vérifier le cache
    cache_key = f"triangle:{triangle_id}"
    cached_triangle = redis_cache.get(cache_key)
    
    if cached_triangle:
        # Vérifier les permissions
        if cached_triangle["user_id"] != current_user.id and current_user.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to access this triangle"
            )
        return cached_triangle
    
    # Récupérer de la base de données
    triangle = db.query(Triangle).filter(Triangle.id == triangle_id).first()
    
    if not triangle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Triangle not found"
        )
    
    # Vérifier les permissions
    if triangle.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this triangle"
        )
    
    response = format_triangle_response(triangle)
    
    # Mettre en cache
    redis_cache.set(cache_key, response, ttl=600)  # 10 minutes
    
    return response

@router.put("/{triangle_id}", response_model=TriangleResponse)
async def update_triangle(
    triangle_id: int,
    triangle_update: TriangleUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Mettre à jour un triangle existant
    """
    # Récupérer le triangle
    triangle = db.query(Triangle).filter(Triangle.id == triangle_id).first()
    
    if not triangle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Triangle not found"
        )
    
    # Vérifier les permissions
    if triangle.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this triangle"
        )
    
    # Vérifier si le triangle est verrouillé
    if triangle.is_locked and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Triangle is locked and cannot be modified"
        )
    
    # Mettre à jour les champs
    update_data = triangle_update.dict(exclude_unset=True)
    
    if "data" in update_data and update_data["data"]:
        # Valider les nouvelles données
        validation_result = validation_service.validate_triangle(update_data["data"])
        if not validation_result["valid"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid triangle data: {validation_result['errors']}"
            )
        
        # Mettre à jour les données JSON
        current_data = json.loads(triangle.data)
        current_data["values"] = update_data["data"]
        triangle.data = json.dumps(current_data)
        
        # Recalculer les statistiques
        stats = calculate_triangle_statistics(update_data["data"])
        metadata = json.loads(triangle.metadata)
        metadata["statistics"] = stats
        metadata["version"] += 1
        triangle.metadata = json.dumps(metadata)
    
    # Mettre à jour les autres champs
    for field in ["name", "description"]:
        if field in update_data:
            setattr(triangle, field, update_data[field])
    
    triangle.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(triangle)
    
    # Invalider le cache
    redis_cache.delete(f"triangle:{triangle_id}")
    redis_cache.delete_pattern(f"triangles:user:{current_user.id}:*")
    
    # Logger l'action
    await audit_service.log_action(
        user_id=current_user.id,
        action="UPDATE_TRIANGLE",
        resource_type="triangle",
        resource_id=triangle_id,
        details={"updated_fields": list(update_data.keys())}
    )
    
    logger.info(f"Triangle updated: {triangle_id} by user: {current_user.username}")
    
    return format_triangle_response(triangle)

@router.delete("/{triangle_id}", response_model=SuccessResponse)
async def delete_triangle(
    triangle_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Supprimer un triangle
    """
    # Récupérer le triangle
    triangle = db.query(Triangle).filter(Triangle.id == triangle_id).first()
    
    if not triangle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Triangle not found"
        )
    
    # Vérifier les permissions
    if triangle.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this triangle"
        )
    
    # Vérifier si des calculs utilisent ce triangle
    calculations_count = db.query(Calculation).filter(
        Calculation.triangle_id == triangle_id
    ).count()
    
    if calculations_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete triangle: {calculations_count} calculations depend on it"
        )
    
    # Supprimer le triangle
    db.delete(triangle)
    db.commit()
    
    # Invalider le cache
    redis_cache.delete(f"triangle:{triangle_id}")
    redis_cache.delete_pattern(f"triangles:user:{current_user.id}:*")
    
    # Logger l'action
    await audit_service.log_action(
        user_id=current_user.id,
        action="DELETE_TRIANGLE",
        resource_type="triangle",
        resource_id=triangle_id,
        details={"name": triangle.name}
    )
    
    logger.info(f"Triangle deleted: {triangle_id} by user: {current_user.username}")
    
    return SuccessResponse(message="Triangle successfully deleted")

# ============================================================================
# ENDPOINTS - IMPORT/EXPORT
# ============================================================================

@router.post("/import", response_model=TriangleResponse)
async def import_triangle(
    file: UploadFile = File(...),
    name: Optional[str] = None,
    triangle_type: TriangleType = TriangleType.PAID,
    insurance_line: Optional[InsuranceLine] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Importer un triangle depuis un fichier CSV ou Excel
    """
    # Vérifier le type de fichier
    if not file.filename.endswith(('.csv', '.xlsx', '.xls')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be CSV or Excel format"
        )
    
    try:
        # Lire le fichier
        content = await file.read()
        
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(content))
        else:
            df = pd.read_excel(io.BytesIO(content))
        
        # Convertir en matrice
        triangle_data = df.values.tolist()
        
        # Créer le triangle
        triangle_create = TriangleCreate(
            name=name or f"Imported_{file.filename}",
            triangle_type=triangle_type,
            insurance_line=insurance_line,
            data=triangle_data,
            accident_years=df.index.tolist() if df.index.name else None,
            development_periods=df.columns.tolist() if df.columns.name else None
        )
        
        # Utiliser la fonction create_triangle existante
        return await create_triangle(triangle_create, current_user, db)
        
    except Exception as e:
        logger.error(f"Error importing triangle: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error importing file: {str(e)}"
        )

@router.get("/{triangle_id}/export")
async def export_triangle(
    triangle_id: int,
    format: str = Query("csv", regex="^(csv|excel|json)$"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Exporter un triangle dans différents formats
    """
    # Récupérer le triangle
    triangle = db.query(Triangle).filter(Triangle.id == triangle_id).first()
    
    if not triangle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Triangle not found"
        )
    
    # Vérifier les permissions
    if triangle.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to export this triangle"
        )
    
    # Préparer les données
    data = json.loads(triangle.data)
    df = pd.DataFrame(
        data["values"],
        index=data.get("accident_years"),
        columns=data.get("development_periods")
    )
    
    # Générer le fichier selon le format
    if format == "csv":
        output = io.StringIO()
        df.to_csv(output)
        content = output.getvalue()
        media_type = "text/csv"
        filename = f"{triangle.name}.csv"
        
    elif format == "excel":
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
            df.to_excel(writer, sheet_name='Triangle Data')
            
            # Ajouter des métadonnées
            metadata_df = pd.DataFrame({
                'Property': ['Name', 'Type', 'Currency', 'Created At', 'Updated At'],
                'Value': [
                    triangle.name,
                    triangle.triangle_type,
                    triangle.currency,
                    triangle.created_at.isoformat(),
                    triangle.updated_at.isoformat()
                ]
            })
            metadata_df.to_excel(writer, sheet_name='Metadata', index=False)
        
        content = output.getvalue()
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = f"{triangle.name}.xlsx"
        
    else:  # json
        output_data = {
            "triangle": {
                "id": triangle.id,
                "name": triangle.name,
                "type": triangle.triangle_type,
                "currency": triangle.currency,
                "data": data["values"],
                "accident_years": data.get("accident_years"),
                "development_periods": data.get("development_periods"),
                "metadata": json.loads(triangle.metadata)
            }
        }
        content = json.dumps(output_data, indent=2)
        media_type = "application/json"
        filename = f"{triangle.name}.json"
    
    # Logger l'export
    await audit_service.log_action(
        user_id=current_user.id,
        action="EXPORT_TRIANGLE",
        resource_type="triangle",
        resource_id=triangle_id,
        details={"format": format}
    )
    
    # Retourner le fichier
    if format == "excel":
        return StreamingResponse(
            io.BytesIO(content),
            media_type=media_type,
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    else:
        return StreamingResponse(
            io.StringIO(content),
            media_type=media_type,
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

# ============================================================================
# ENDPOINTS - STATISTIQUES ET ANALYSE
# ============================================================================

@router.get("/{triangle_id}/statistics", response_model=TriangleStatistics)
async def get_triangle_statistics(
    triangle_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Récupérer les statistiques détaillées d'un triangle
    """
    # Récupérer le triangle
    triangle = db.query(Triangle).filter(Triangle.id == triangle_id).first()
    
    if not triangle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Triangle not found"
        )
    
    # Vérifier les permissions
    if triangle.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this triangle"
        )
    
    # Calculer les statistiques détaillées
    data = json.loads(triangle.data)
    triangle_array = np.array(data["values"])
    
    # Remplacer None par NaN pour les calculs
    triangle_array = np.where(triangle_array == None, np.nan, triangle_array)
    
    stats = {
        "triangle_id": triangle_id,
        "size": len(triangle_array),
        "total_paid": float(np.nansum(triangle_array)),
        "average_development": calculate_average_development_factors(triangle_array),
        "volatility": float(np.nanstd(triangle_array)),
        "completeness": calculate_completeness(triangle_array),
        "last_diagonal": get_last_diagonal(triangle_array).tolist()
    }
    
    # Ajouter les réserves estimées si disponibles
    latest_calculation = db.query(Calculation).filter(
        Calculation.triangle_id == triangle_id,
        Calculation.status == "completed"
    ).order_by(Calculation.completed_at.desc()).first()
    
    if latest_calculation and latest_calculation.results:
        results = json.loads(latest_calculation.results)
        stats["total_outstanding"] = sum(results.get("reserves", []))
    
    return stats

@router.post("/{triangle_id}/validate")
async def validate_triangle(
    triangle_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Valider la qualité et la cohérence d'un triangle
    """
    # Récupérer le triangle
    triangle = db.query(Triangle).filter(Triangle.id == triangle_id).first()
    
    if not triangle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Triangle not found"
        )
    
    # Vérifier les permissions
    if triangle.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to validate this triangle"
        )
    
    # Effectuer la validation complète
    data = json.loads(triangle.data)
    validation_result = validation_service.validate_triangle_comprehensive(
        data["values"],
        triangle_type=triangle.triangle_type
    )
    
    # Mettre à jour les métadonnées avec les résultats de validation
    metadata = json.loads(triangle.metadata)
    metadata["last_validation"] = {
        "timestamp": datetime.utcnow().isoformat(),
        "result": validation_result,
        "validated_by": current_user.username
    }
    triangle.metadata = json.dumps(metadata)
    
    db.commit()
    
    # Logger la validation
    await audit_service.log_action(
        user_id=current_user.id,
        action="VALIDATE_TRIANGLE",
        resource_type="triangle",
        resource_id=triangle_id,
        details=validation_result
    )
    
    return validation_result

@router.post("/{triangle_id}/duplicate", response_model=TriangleResponse)
async def duplicate_triangle(
    triangle_id: int,
    new_name: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Dupliquer un triangle existant
    """
    # Récupérer le triangle original
    original = db.query(Triangle).filter(Triangle.id == triangle_id).first()
    
    if not original:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Triangle not found"
        )
    
    # Vérifier les permissions
    if original.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to duplicate this triangle"
        )
    
    # Créer la copie
    data = json.loads(original.data)
    
    new_triangle = Triangle(
        name=new_name,
        description=f"Copy of {original.name}",
        triangle_type=original.triangle_type,
        insurance_line=original.insurance_line,
        currency=original.currency,
        unit=original.unit,
        user_id=current_user.id,
        data=original.data,
        metadata=json.dumps({
            "duplicated_from": triangle_id,
            "duplicated_at": datetime.utcnow().isoformat(),
            "version": 1
        }),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    
    db.add(new_triangle)
    db.commit()
    db.refresh(new_triangle)
    
    # Logger l'action
    await audit_service.log_action(
        user_id=current_user.id,
        action="DUPLICATE_TRIANGLE",
        resource_type="triangle",
        resource_id=new_triangle.id,
        details={"original_id": triangle_id, "new_name": new_name}
    )
    
    logger.info(f"Triangle duplicated: {triangle_id} -> {new_triangle.id} by user: {current_user.username}")
    
    return format_triangle_response(new_triangle)

@router.post("/{triangle_id}/lock", response_model=SuccessResponse)
async def lock_triangle(
    triangle_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Verrouiller un triangle pour empêcher les modifications
    """
    # Récupérer le triangle
    triangle = db.query(Triangle).filter(Triangle.id == triangle_id).first()
    
    if not triangle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Triangle not found"
        )
    
    # Seuls le propriétaire et les admins peuvent verrouiller
    if triangle.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to lock this triangle"
        )
    
    triangle.is_locked = True
    triangle.updated_at = datetime.utcnow()
    
    # Mettre à jour les métadonnées
    metadata = json.loads(triangle.metadata)
    metadata["locked_by"] = current_user.username
    metadata["locked_at"] = datetime.utcnow().isoformat()
    triangle.metadata = json.dumps(metadata)
    
    db.commit()
    
    # Invalider le cache
    redis_cache.delete(f"triangle:{triangle_id}")
    
    # Logger l'action
    await audit_service.log_action(
        user_id=current_user.id,
        action="LOCK_TRIANGLE",
        resource_type="triangle",
        resource_id=triangle_id
    )
    
    return SuccessResponse(message="Triangle successfully locked")

@router.post("/{triangle_id}/unlock", response_model=SuccessResponse)
async def unlock_triangle(
    triangle_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Déverrouiller un triangle pour permettre les modifications
    """
    # Récupérer le triangle
    triangle = db.query(Triangle).filter(Triangle.id == triangle_id).first()
    
    if not triangle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Triangle not found"
        )
    
    # Seuls les admins peuvent déverrouiller
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can unlock triangles"
        )
    
    triangle.is_locked = False
    triangle.updated_at = datetime.utcnow()
    
    # Mettre à jour les métadonnées
    metadata = json.loads(triangle.metadata)
    metadata["unlocked_by"] = current_user.username
    metadata["unlocked_at"] = datetime.utcnow().isoformat()
    triangle.metadata = json.dumps(metadata)
    
    db.commit()
    
    # Invalider le cache
    redis_cache.delete(f"triangle:{triangle_id}")
    
    # Logger l'action
    await audit_service.log_action(
        user_id=current_user.id,
        action="UNLOCK_TRIANGLE",
        resource_type="triangle",
        resource_id=triangle_id
    )
    
    return SuccessResponse(message="Triangle successfully unlocked")

# ============================================================================
# FONCTIONS UTILITAIRES
# ============================================================================

def format_triangle_response(triangle: Triangle) -> Dict[str, Any]:
    """
    Formater un triangle pour la réponse API
    """
    data = json.loads(triangle.data)
    metadata = json.loads(triangle.metadata)
    
    return {
        "id": triangle.id,
        "user_id": triangle.user_id,
        "name": triangle.name,
        "description": triangle.description,
        "triangle_type": triangle.triangle_type,
        "insurance_line": triangle.insurance_line,
        "currency": triangle.currency,
        "unit": triangle.unit,
        "data": data["values"],
        "accident_years": data.get("accident_years", []),
        "development_periods": data.get("development_periods", []),
        "statistics": metadata.get("statistics"),
        "created_at": triangle.created_at,
        "updated_at": triangle.updated_at,
        "is_locked": triangle.is_locked,
        "version": metadata.get("version", 1)
    }

def calculate_triangle_statistics(data: List[List[float]]) -> Dict[str, Any]:
    """
    Calculer les statistiques de base d'un triangle
    """
    arr = np.array(data, dtype=float)
    arr = np.where(arr == None, np.nan, arr)
    
    return {
        "size": len(arr),
        "total": float(np.nansum(arr)),
        "mean": float(np.nanmean(arr)),
        "std": float(np.nanstd(arr)),
        "min": float(np.nanmin(arr)),
        "max": float(np.nanmax(arr)),
        "completeness": calculate_completeness(arr),
        "cv": float(np.nanstd(arr) / np.nanmean(arr)) if np.nanmean(arr) != 0 else 0
    }

def calculate_completeness(triangle_array: np.ndarray) -> float:
    """
    Calculer le pourcentage de cellules remplies dans le triangle
    """
    n = len(triangle_array)
    expected_cells = n * (n + 1) / 2
    filled_cells = np.count_nonzero(~np.isnan(triangle_array))
    return filled_cells / expected_cells if expected_cells > 0 else 0

def calculate_average_development_factors(triangle_array: np.ndarray) -> List[float]:
    """
    Calculer les facteurs de développement moyens
    """
    factors = []
    n = len(triangle_array)
    
    for j in range(n - 1):
        col_factors = []
        for i in range(n - j - 1):
            if not np.isnan(triangle_array[i, j]) and not np.isnan(triangle_array[i, j + 1]):
                if triangle_array[i, j] != 0:
                    factor = triangle_array[i, j + 1] / triangle_array[i, j]
                    col_factors.append(factor)
        
        if col_factors:
            factors.append(float(np.mean(col_factors)))
        else:
            factors.append(1.0)
    
    return factors

def get_last_diagonal(triangle_array: np.ndarray) -> np.ndarray:
    """
    Extraire la dernière diagonale du triangle
    """
    n = len(triangle_array)
    diagonal = []
    
    for i in range(n):
        j = n - i - 1
        if j >= 0 and j < n:
            diagonal.append(triangle_array[i, j])
    
    return np.array(diagonal)

def get_triangle_quota(role: str) -> int:
    """
    Retourner le quota de triangles basé sur le rôle
    """
    quota_map = {
        "admin": 1000,
        "actuary": 100,
        "analyst": 50,
        "viewer": 10,
        "auditor": 20
    }
    
    return quota_map.get(role, 10)