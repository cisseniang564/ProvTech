# backend/app/routers/actuarial_methods.py

"""
API endpoints pour les méthodes actuarielles avancées

Cette API expose toutes les méthodes actuarielles (traditionnelles et ML)
avec leurs paramètres, validation, et comparaison multi-méthodes.
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime
import asyncio

# Imports des méthodes actuarielles
from ..actuarial.methods import (
    method_registry,
    create_method,
    list_available_methods,
    get_method_details,
    search_methods,
    get_methods_by_category,
    validate_parameters,
    compare_methods
)
from ..actuarial.base.method_interface import (
    TriangleData,
    CalculationResult,
    create_triangle_data,
    compare_calculation_results
)
from ..actuarial.base.triangle_utils import (
    validate_triangle_data,
    quick_triangle_analysis
)

router = APIRouter(prefix="/actuarial", tags=["Actuarial Methods"])

# ============================================================================
# Modèles Pydantic pour l'API
# ============================================================================

class TriangleDataModel(BaseModel):
    """Modèle pour les données triangle en entrée"""
    data: List[List[float]] = Field(..., description="Triangle de développement (liste de listes)")
    currency: str = Field(default="EUR", description="Devise des montants")
    business_line: str = Field(default="General", description="Ligne de business")
    accident_years: Optional[List[int]] = Field(None, description="Années d'accident (auto-générées si None)")
    development_periods: Optional[List[int]] = Field(None, description="Périodes de développement (auto-générées si None)")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Métadonnées additionnelles")

class MethodCalculationRequest(BaseModel):
    """Requête pour calculer avec une méthode spécifique"""
    method_id: str = Field(..., description="Identifiant de la méthode")
    triangle_data: TriangleDataModel = Field(..., description="Données du triangle")
    parameters: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Paramètres spécifiques à la méthode")
    save_result: bool = Field(default=True, description="Sauvegarder le résultat")

class MultiMethodRequest(BaseModel):
    """Requête pour calculer avec plusieurs méthodes"""
    method_ids: List[str] = Field(..., description="Liste des méthodes à utiliser")
    triangle_data: TriangleDataModel = Field(..., description="Données du triangle")
    method_parameters: Optional[Dict[str, Dict[str, Any]]] = Field(
        default_factory=dict, 
        description="Paramètres par méthode {method_id: {param: value}}"
    )
    comparison_enabled: bool = Field(default=True, description="Activer la comparaison des résultats")

class MethodSearchRequest(BaseModel):
    """Requête de recherche de méthodes"""
    query: Optional[str] = Field(None, description="Terme de recherche")
    category: Optional[str] = Field(None, description="Filtrer par catégorie")
    recommended_only: bool = Field(default=False, description="Seulement les méthodes recommandées")
    min_accuracy: Optional[int] = Field(None, description="Accuracy minimum (0-100)")

# ============================================================================
# Endpoints d'information sur les méthodes
# ============================================================================

@router.get("/methods", summary="Lister toutes les méthodes disponibles")
async def get_available_methods(
    category: Optional[str] = None,
    recommended_only: bool = False
):
    """
    Obtenir la liste de toutes les méthodes actuarielles disponibles
    
    Args:
        category: Filtrer par catégorie ('deterministic', 'stochastic', 'machine_learning')
        recommended_only: Ne retourner que les méthodes recommandées
        
    Returns:
        Liste des méthodes avec leurs informations de base
    """
    try:
        methods = list_available_methods(category=category, recommended_only=recommended_only)
        
        return {
            "success": True,
            "methods": methods,
            "total_methods": len(methods),
            "categories_available": ["deterministic", "stochastic", "machine_learning", "hybrid"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la récupération des méthodes: {str(e)}")

@router.get("/methods/by-category", summary="Méthodes groupées par catégorie")
async def get_methods_grouped_by_category():
    """Obtenir toutes les méthodes organisées par catégorie"""
    try:
        methods_by_category = get_methods_by_category()
        
        return {
            "success": True,
            "methods_by_category": methods_by_category,
            "total_categories": len(methods_by_category),
            "registry_stats": method_registry.get_registry_stats()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@router.get("/methods/{method_id}", summary="Détails d'une méthode spécifique")
async def get_method_info(method_id: str):
    """
    Obtenir les informations détaillées d'une méthode
    
    Args:
        method_id: Identifiant de la méthode
        
    Returns:
        Informations complètes de la méthode
    """
    try:
        method_info = get_method_details(method_id)
        
        # Créer une instance pour obtenir les infos détaillées
        method_instance = create_method(method_id)
        detailed_info = method_instance.get_method_info()
        
        return {
            "success": True,
            "method_info": method_info,
            "detailed_info": detailed_info
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@router.post("/methods/search", summary="Rechercher des méthodes")
async def search_available_methods(request: MethodSearchRequest):
    """
    Rechercher des méthodes par critères
    
    Args:
        request: Critères de recherche
        
    Returns:
        Méthodes correspondant aux critères
    """
    try:
        if request.query:
            methods = search_methods(request.query)
        else:
            methods = list_available_methods(
                category=request.category,
                recommended_only=request.recommended_only
            )
        
        # Filtrer par accuracy si spécifié
        if request.min_accuracy is not None:
            methods = [m for m in methods if m.get("accuracy", 0) >= request.min_accuracy]
        
        return {
            "success": True,
            "methods": methods,
            "total_results": len(methods),
            "search_criteria": request.dict()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur de recherche: {str(e)}")

@router.post("/methods/compare", summary="Comparer plusieurs méthodes")
async def compare_method_specs(method_ids: List[str]):
    """
    Comparer les spécifications de plusieurs méthodes
    
    Args:
        method_ids: Liste des identifiants de méthodes à comparer
        
    Returns:
        Comparaison détaillée des méthodes
    """
    try:
        comparison = compare_methods(method_ids)
        
        return {
            "success": True,
            "comparison": comparison,
            "method_ids": method_ids
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur de comparaison: {str(e)}")

# ============================================================================
# Endpoints de calcul
# ============================================================================

@router.post("/calculate", summary="Calculer avec une méthode spécifique")
async def calculate_single_method(request: MethodCalculationRequest):
    """
    Effectuer un calcul avec une méthode actuarielle spécifique
    
    Args:
        request: Données et paramètres de calcul
        
    Returns:
        Résultat du calcul actuariel
    """
    try:
        # Validation des paramètres
        param_validation = validate_parameters(request.method_id, request.parameters)
        if not param_validation.get("valid", True):
            raise HTTPException(
                status_code=400, 
                detail=f"Paramètres invalides: {param_validation.get('errors', [])}"
            )
        
        # Créer les données triangle
        triangle_data = create_triangle_data(
            data=request.triangle_data.data,
            currency=request.triangle_data.currency,
            business_line=request.triangle_data.business_line,
            accident_years=request.triangle_data.accident_years,
            development_periods=request.triangle_data.development_periods,
            metadata=request.triangle_data.metadata
        )
        
        # Créer la méthode et calculer
        method = create_method(request.method_id)
        result = method.calculate(triangle_data, **param_validation["sanitized_parameters"])
        
        # Sauvegarder si demandé (optionnel - à implémenter selon le système de stockage)
        if request.save_result:
            # TODO: Intégrer avec le système de sauvegarde existant
            pass
        
        return {
            "success": True,
            "result": result.to_dict(),
            "summary": result.get_summary(),
            "parameter_warnings": param_validation.get("warnings", [])
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur de calcul: {str(e)}")

@router.post("/calculate/multi-method", summary="Calculer avec plusieurs méthodes")
async def calculate_multiple_methods(request: MultiMethodRequest):
    """
    Effectuer des calculs avec plusieurs méthodes actuarielles
    
    Args:
        request: Données et méthodes à utiliser
        
    Returns:
        Résultats de tous les calculs et comparaison
    """
    try:
        # Validation des méthodes
        for method_id in request.method_ids:
            try:
                get_method_details(method_id)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Méthode inconnue: {method_id}")
        
        # Créer les données triangle
        triangle_data = create_triangle_data(
            data=request.triangle_data.data,
            currency=request.triangle_data.currency,
            business_line=request.triangle_data.business_line,
            accident_years=request.triangle_data.accident_years,
            development_periods=request.triangle_data.development_periods,
            metadata=request.triangle_data.metadata
        )
        
        # Calculer avec chaque méthode
        results = []
        calculation_errors = []
        
        for method_id in request.method_ids:
            try:
                # Paramètres spécifiques à cette méthode
                method_params = request.method_parameters.get(method_id, {})
                
                # Validation des paramètres
                param_validation = validate_parameters(method_id, method_params)
                
                # Calcul
                method = create_method(method_id)
                result = method.calculate(triangle_data, **param_validation["sanitized_parameters"])
                results.append(result)
                
            except Exception as e:
                calculation_errors.append({
                    "method_id": method_id,
                    "error": str(e)
                })
        
        # Comparaison des résultats
        comparison = None
        if request.comparison_enabled and len(results) > 1:
            comparison = compare_calculation_results(results)
        
        return {
            "success": True,
            "results": [r.to_dict() for r in results],
            "summaries": [r.get_summary() for r in results],
            "comparison": comparison,
            "calculation_errors": calculation_errors,
            "methods_calculated": len(results),
            "methods_failed": len(calculation_errors)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur de calcul multi-méthodes: {str(e)}")

# ============================================================================
# Endpoints d'analyse et validation
# ============================================================================

@router.post("/triangle/validate", summary="Valider un triangle de développement")
async def validate_triangle(triangle_data: TriangleDataModel):
    """
    Valider la structure et la qualité d'un triangle de développement
    
    Args:
        triangle_data: Données du triangle à valider
        
    Returns:
        Résultats de validation et suggestions
    """
    try:
        # Validation structurelle
        validation_errors = validate_triangle_data(triangle_data.data)
        
        # Analyse complète si pas d'erreurs structurelles
        analysis = None
        if not validation_errors:
            analysis = quick_triangle_analysis(triangle_data.data)
        
        # Suggestions d'amélioration
        suggestions = []
        if validation_errors:
            suggestions.append("Corriger les erreurs structurelles avant d'utiliser le triangle")
        elif analysis:
            stats = analysis.get("basic_stats", {})
            if stats.get("density", 1) < 0.6:
                suggestions.append("Triangle peu dense - considérer des méthodes robustes aux données manquantes")
            if len(analysis.get("outliers_iqr", [])) > 0:
                suggestions.append("Outliers détectés - considérer un lissage ou investigation des valeurs")
            if stats.get("coefficient_of_variation", 0) > 1.0:
                suggestions.append("Forte variabilité - méthodes stochastiques recommandées")
        
        return {
            "success": True,
            "validation_errors": validation_errors,
            "is_valid": len(validation_errors) == 0,
            "analysis": analysis,
            "suggestions": suggestions
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur de validation: {str(e)}")

@router.post("/triangle/analyze", summary="Analyse complète d'un triangle")
async def analyze_triangle(triangle_data: TriangleDataModel):
    """
    Effectuer une analyse statistique complète d'un triangle
    
    Args:
        triangle_data: Données du triangle à analyser
        
    Returns:
        Analyse statistique détaillée
    """
    try:
        # Validation préliminaire
        validation_errors = validate_triangle_data(triangle_data.data)
        if validation_errors:
            raise HTTPException(
                status_code=400, 
                detail=f"Triangle invalide: {', '.join(validation_errors)}"
            )
        
        # Analyse complète
        analysis = quick_triangle_analysis(triangle_data.data)
        
        # Recommandations de méthodes basées sur l'analyse
        recommendations = _recommend_methods_for_triangle(analysis)
        
        return {
            "success": True,
            "analysis": analysis,
            "method_recommendations": recommendations,
            "data_quality_score": _calculate_data_quality_score(analysis)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur d'analyse: {str(e)}")

@router.post("/parameters/validate", summary="Valider des paramètres de méthode")
async def validate_method_parameters(method_id: str, parameters: Dict[str, Any]):
    """
    Valider les paramètres pour une méthode spécifique
    
    Args:
        method_id: Identifiant de la méthode
        parameters: Paramètres à valider
        
    Returns:
        Résultats de validation
    """
    try:
        validation = validate_parameters(method_id, parameters)
        
        return {
            "success": True,
            "validation": validation
        }
        
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur de validation: {str(e)}")

# ============================================================================
# Endpoints de monitoring et statistiques
# ============================================================================

@router.get("/stats", summary="Statistiques du système actuariel")
async def get_actuarial_stats():
    """Obtenir les statistiques du système actuariel"""
    try:
        registry_stats = method_registry.get_registry_stats()
        
        return {
            "success": True,
            "registry_stats": registry_stats,
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

# ============================================================================
# Fonctions utilitaires privées
# ============================================================================

def _recommend_methods_for_triangle(analysis: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Recommander des méthodes basées sur l'analyse du triangle"""
    recommendations = []
    
    stats = analysis.get("basic_stats", {})
    outliers = analysis.get("outliers_iqr", [])
    
    # Critères de recommandation
    data_points = stats.get("data_points", 0)
    density = stats.get("density", 0)
    cv = stats.get("coefficient_of_variation", 0)
    
    # Chain Ladder - toujours recommandé comme base
    recommendations.append({
        "method_id": "chain_ladder",
        "reason": "Méthode de référence actuarielle",
        "priority": 1,
        "confidence": "high"
    })
    
    # Cape Cod - si données limitées
    if data_points < 15 or density < 0.6:
        recommendations.append({
            "method_id": "cape_cod",
            "reason": "Bon pour données limitées avec expertise a priori",
            "priority": 2,
            "confidence": "medium"
        })
    
    # Mack - si besoin d'intervalles de confiance
    if data_points >= 12:
        recommendations.append({
            "method_id": "mack_method",
            "reason": "Quantification de l'incertitude avec intervalles de confiance",
            "priority": 3,
            "confidence": "medium"
        })
    
    # ML methods - si beaucoup de données et patterns complexes
    if data_points >= 20 and cv > 0.3:
        recommendations.append({
            "method_id": "random_forest",
            "reason": "Données riches avec patterns complexes potentiels",
            "priority": 4,
            "confidence": "low"
        })
    
    # Expected Loss Ratio - si très peu de données
    if data_points < 10:
        recommendations.append({
            "method_id": "expected_loss_ratio",
            "reason": "Méthode simple pour données très limitées",
            "priority": 5,
            "confidence": "low"
        })
    
    return recommendations

def _calculate_data_quality_score(analysis: Dict[str, Any]) -> float:
    """Calculer un score de qualité des données (0-1)"""
    stats = analysis.get("basic_stats", {})
    outliers = analysis.get("outliers_iqr", [])
    
    score = 1.0
    
    # Pénaliser la faible densité
    density = stats.get("density", 0)
    if density < 0.8:
        score *= (0.5 + 0.5 * density)
    
    # Pénaliser les outliers
    data_points = stats.get("data_points", 1)
    outlier_ratio = len(outliers) / data_points
    if outlier_ratio > 0.1:
        score *= (1 - outlier_ratio * 0.5)
    
    # Bonifier si beaucoup de données
    if data_points > 20:
        score = min(1.0, score * 1.1)
    
    return round(max(0.0, min(1.0, score)), 3)