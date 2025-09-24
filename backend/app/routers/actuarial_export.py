# backend/app/routers/actuarial_export.py

"""
API endpoints pour l'export et la génération de rapports actuariels

Ce module expose les fonctionnalités d'export via une API REST :
- Export de résultats de calcul en multiple formats
- Génération de rapports de comparaison
- Templates de rapports réglementaires
- Export en masse et programmé
"""

from fastapi import APIRouter, HTTPException, Response, BackgroundTasks, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional, Union
from datetime import datetime
import io
import json
import zipfile
import tempfile

# Imports du système actuariel
from ..actuarial.methods import create_method, list_available_methods
from ..actuarial.base.method_interface import (
    TriangleData,
    CalculationResult, 
    create_triangle_data,
    compare_calculation_results
)
from ..actuarial.export import (
    export_manager,
    ExportOptions,
    ExportFormat,
    export_calculation_result,
    export_method_comparison,
    create_export_options
)
from ..actuarial.config import get_logger

router = APIRouter(prefix="/actuarial/export", tags=["Actuarial Export"])
logger = get_logger("export_api")

# ============================================================================
# Modèles Pydantic pour l'API
# ============================================================================

class ExportOptionsModel(BaseModel):
    """Modèle pour les options d'export"""
    format: str = Field(default="json", description="Format d'export")
    include_triangle: bool = Field(default=True, description="Inclure le triangle")
    include_factors: bool = Field(default=True, description="Inclure les facteurs")
    include_diagnostics: bool = Field(default=True, description="Inclure les diagnostics")
    include_warnings: bool = Field(default=True, description="Inclure les avertissements")
    include_metadata: bool = Field(default=False, description="Inclure les métadonnées")
    precision: int = Field(default=2, ge=0, le=6, description="Précision décimale")
    currency_symbol: str = Field(default="€", description="Symbole de devise")
    language: str = Field(default="fr", description="Langue du rapport")
    template: Optional[str] = Field(None, description="Template personnalisé")
    custom_fields: Dict[str, Any] = Field(default_factory=dict, description="Champs personnalisés")

class SingleExportRequest(BaseModel):
    """Requête pour exporter un seul résultat"""
    method_id: str = Field(..., description="Méthode actuarielle à utiliser")
    triangle_data: Dict[str, Any] = Field(..., description="Données du triangle")
    method_parameters: Dict[str, Any] = Field(default_factory=dict, description="Paramètres de calcul")
    export_options: ExportOptionsModel = Field(default_factory=ExportOptionsModel, description="Options d'export")

class ComparisonExportRequest(BaseModel):
    """Requête pour exporter une comparaison"""
    method_ids: List[str] = Field(..., description="Méthodes à comparer")
    triangle_data: Dict[str, Any] = Field(..., description="Données du triangle")
    method_parameters: Dict[str, Dict[str, Any]] = Field(default_factory=dict, description="Paramètres par méthode")
    export_options: ExportOptionsModel = Field(default_factory=ExportOptionsModel, description="Options d'export")

class BatchExportRequest(BaseModel):
    """Requête pour export en lot"""
    exports: List[Union[SingleExportRequest, ComparisonExportRequest]] = Field(..., description="Liste des exports")
    batch_name: str = Field(default="batch", description="Nom du lot")
    zip_results: bool = Field(default=True, description="Compresser les résultats")

class TemplateRequest(BaseModel):
    """Requête pour génération avec template"""
    template_id: str = Field(..., description="ID du template")
    data: Dict[str, Any] = Field(..., description="Données pour le template")
    export_options: ExportOptionsModel = Field(default_factory=ExportOptionsModel)

class ScheduledExportRequest(BaseModel):
    """Requête pour export programmé"""
    export_request: Union[SingleExportRequest, ComparisonExportRequest] = Field(..., description="Configuration d'export")
    schedule_expression: str = Field(..., description="Expression cron pour la programmation")
    email_recipients: List[str] = Field(default_factory=list, description="Destinataires email")
    active: bool = Field(default=True, description="Export actif")

# ============================================================================
# Endpoints d'export simple
# ============================================================================

@router.post("/result", summary="Exporter un résultat de calcul")
async def export_single_result(request: SingleExportRequest):
    """
    Calculer avec une méthode et exporter le résultat dans le format spécifié
    
    Args:
        request: Configuration de calcul et d'export
        
    Returns:
        Contenu exporté selon le format demandé
    """
    try:
        logger.info(
            "Export single result démarré",
            method=request.method_id,
            format=request.export_options.format
        )
        
        # 1. Créer les données triangle
        triangle_data = create_triangle_data(**request.triangle_data)
        
        # 2. Calculer avec la méthode
        method = create_method(request.method_id)
        result = method.calculate(triangle_data, **request.method_parameters)
        
        # 3. Exporter
        export_options = create_export_options(
            format=request.export_options.format,
            precision=request.export_options.precision,
            currency_symbol=request.export_options.currency_symbol,
            language=request.export_options.language,
            include_triangle=request.export_options.include_triangle,
            include_factors=request.export_options.include_factors,
            include_diagnostics=request.export_options.include_diagnostics,
            include_warnings=request.export_options.include_warnings,
            include_metadata=request.export_options.include_metadata,
            template=request.export_options.template,
            **request.export_options.custom_fields
        )
        
        export_result = export_manager.export_result(result, triangle_data, export_options)
        
        # 4. Retourner selon le format
        if request.export_options.format in ["html", "csv", "markdown"]:
            return Response(
                content=export_result["content"],
                media_type=export_result["content_type"],
                headers={
                    "Content-Disposition": f"attachment; filename={export_result['filename']}"
                }
            )
        else:
            return {
                "success": True,
                "export_result": export_result,
                "calculation_summary": result.get_summary()
            }
            
    except Exception as e:
        logger.error(f"Erreur export single result", error=str(e))
        raise HTTPException(status_code=500, detail=f"Erreur d'export: {str(e)}")

@router.post("/comparison", summary="Exporter une comparaison de méthodes")
async def export_comparison_result(request: ComparisonExportRequest):
    """
    Comparer plusieurs méthodes et exporter les résultats
    """
    try:
        logger.info(
            "Export comparison démarré",
            methods=request.method_ids,
            format=request.export_options.format
        )
        
        # 1. Créer les données triangle
        triangle_data = create_triangle_data(**request.triangle_data)
        
        # 2. Calculer avec toutes les méthodes
        results = []
        calculation_errors = []
        
        for method_id in request.method_ids:
            try:
                method = create_method(method_id)
                method_params = request.method_parameters.get(method_id, {})
                result = method.calculate(triangle_data, **method_params)
                results.append(result)
            except Exception as e:
                calculation_errors.append({
                    "method_id": method_id,
                    "error": str(e)
                })
                logger.warning(f"Échec calcul pour {method_id}", error=str(e))
        
        if not results:
            raise HTTPException(status_code=400, detail="Aucun calcul n'a réussi")
        
        # 3. Calculer la comparaison
        comparison = compare_calculation_results(results)
        
        # 4. Exporter
        export_options = create_export_options(**request.export_options.dict())
        export_result = export_manager.export_comparison(results, triangle_data, comparison, export_options)
        
        # 5. Retourner selon le format
        if request.export_options.format in ["html", "csv", "markdown"]:
            return Response(
                content=export_result["content"],
                media_type=export_result["content_type"],
                headers={
                    "Content-Disposition": f"attachment; filename={export_result['filename']}"
                }
            )
        else:
            return {
                "success": True,
                "export_result": export_result,
                "comparison_summary": comparison,
                "calculation_errors": calculation_errors,
                "methods_successful": len(results)
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur export comparison", error=str(e))
        raise HTTPException(status_code=500, detail=f"Erreur d'export: {str(e)}")

# ============================================================================
# Endpoints d'export avancé
# ============================================================================

@router.post("/batch", summary="Export en lot")
async def export_batch(request: BatchExportRequest, background_tasks: BackgroundTasks):
    """
    Effectuer plusieurs exports en une seule requête
    """
    try:
        logger.info(f"Export batch démarré", batch_name=request.batch_name, exports_count=len(request.exports))
        
        # Traiter tous les exports
        export_results = []
        errors = []
        
        for i, export_request in enumerate(request.exports):
            try:
                if isinstance(export_request, SingleExportRequest):
                    # Export simple
                    triangle_data = create_triangle_data(**export_request.triangle_data)
                    method = create_method(export_request.method_id)
                    result = method.calculate(triangle_data, **export_request.method_parameters)
                    
                    export_options = create_export_options(**export_request.export_options.dict())
                    export_result = export_manager.export_result(result, triangle_data, export_options)
                    
                else:
                    # Export de comparaison
                    triangle_data = create_triangle_data(**export_request.triangle_data)
                    results = []
                    
                    for method_id in export_request.method_ids:
                        method = create_method(method_id)
                        method_params = export_request.method_parameters.get(method_id, {})
                        result = method.calculate(triangle_data, **method_params)
                        results.append(result)
                    
                    comparison = compare_calculation_results(results)
                    export_options = create_export_options(**export_request.export_options.dict())
                    export_result = export_manager.export_comparison(results, triangle_data, comparison, export_options)
                
                export_results.append({
                    "index": i,
                    "success": True,
                    "result": export_result
                })
                
            except Exception as e:
                errors.append({
                    "index": i,
                    "error": str(e)
                })
                logger.warning(f"Échec export batch item {i}", error=str(e))
        
        # Créer un ZIP si demandé et plusieurs exports
        if request.zip_results and len(export_results) > 1:
            zip_content = create_zip_from_exports(export_results, request.batch_name)
            
            return Response(
                content=zip_content,
                media_type="application/zip",
                headers={
                    "Content-Disposition": f"attachment; filename={request.batch_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
                }
            )
        else:
            return {
                "success": True,
                "batch_name": request.batch_name,
                "total_exports": len(request.exports),
                "successful_exports": len(export_results),
                "failed_exports": len(errors),
                "results": export_results,
                "errors": errors
            }
            
    except Exception as e:
        logger.error(f"Erreur export batch", error=str(e))
        raise HTTPException(status_code=500, detail=f"Erreur d'export batch: {str(e)}")

@router.post("/template/{template_id}", summary="Export avec template personnalisé")
async def export_with_template(template_id: str, request: TemplateRequest):
    """
    Exporter en utilisant un template personnalisé
    """
    try:
        logger.info(f"Export template démarré", template_id=template_id)
        
        # Templates disponibles (extensible)
        available_templates = {
            "solvency2_qrt": generate_solvency2_qrt_template,
            "regulatory_summary": generate_regulatory_summary_template,
            "executive_dashboard": generate_executive_dashboard_template,
            "technical_appendix": generate_technical_appendix_template
        }
        
        if template_id not in available_templates:
            raise HTTPException(status_code=404, detail=f"Template '{template_id}' non trouvé")
        
        # Générer avec le template
        template_function = available_templates[template_id]
        export_result = template_function(request.data, request.export_options)
        
        return {
            "success": True,
            "template_id": template_id,
            "export_result": export_result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur export template", template_id=template_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Erreur template: {str(e)}")

# ============================================================================
# Endpoints d'information et configuration
# ============================================================================

@router.get("/formats", summary="Lister les formats d'export disponibles")
async def get_export_formats():
    """Obtenir la liste des formats d'export supportés"""
    try:
        formats = export_manager.get_supported_formats()
        
        format_details = []
        for fmt in formats:
            if fmt == ExportFormat.JSON:
                details = {
                    "format": fmt,
                    "name": "JSON",
                    "description": "Format JSON structuré, idéal pour APIs",
                    "mime_type": "application/json",
                    "extension": "json",
                    "supports_comparison": True,
                    "best_for": ["API", "intégration", "données structurées"]
                }
            elif fmt == ExportFormat.CSV:
                details = {
                    "format": fmt,
                    "name": "CSV", 
                    "description": "Format CSV pour Excel et tableurs",
                    "mime_type": "text/csv",
                    "extension": "csv",
                    "supports_comparison": True,
                    "best_for": ["Excel", "analyse", "tableurs"]
                }
            elif fmt == ExportFormat.HTML:
                details = {
                    "format": fmt,
                    "name": "HTML",
                    "description": "Rapport HTML avec styling, prêt pour impression",
                    "mime_type": "text/html",
                    "extension": "html",
                    "supports_comparison": True,
                    "best_for": ["rapports", "présentation", "impression"]
                }
            elif fmt == ExportFormat.MARKDOWN:
                details = {
                    "format": fmt,
                    "name": "Markdown",
                    "description": "Format Markdown pour documentation",
                    "mime_type": "text/markdown", 
                    "extension": "md",
                    "supports_comparison": True,
                    "best_for": ["documentation", "GitHub", "wikis"]
                }
            else:
                details = {
                    "format": fmt,
                    "name": fmt.upper(),
                    "description": "Format personnalisé",
                    "supports_comparison": True
                }
            
            format_details.append(details)
        
        return {
            "success": True,
            "supported_formats": format_details,
            "total_formats": len(formats)
        }
        
    except Exception as e:
        logger.error(f"Erreur get formats", error=str(e))
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@router.get("/templates", summary="Lister les templates disponibles")
async def get_export_templates():
    """Obtenir la liste des templates disponibles"""
    try:
        templates = [
            {
                "id": "solvency2_qrt",
                "name": "Solvency II QRT",
                "description": "Template pour rapports QRT Solvabilité II",
                "category": "regulatory",
                "required_data": ["calculation_results", "triangle_data", "company_info"]
            },
            {
                "id": "regulatory_summary", 
                "name": "Résumé Réglementaire",
                "description": "Résumé pour régulateurs et autorités",
                "category": "regulatory",
                "required_data": ["calculation_results", "validation_info"]
            },
            {
                "id": "executive_dashboard",
                "name": "Dashboard Exécutif", 
                "description": "Résumé pour direction générale",
                "category": "executive",
                "required_data": ["calculation_results", "comparison_data", "kpis"]
            },
            {
                "id": "technical_appendix",
                "name": "Annexe Technique",
                "description": "Détails techniques pour actuaires",
                "category": "technical",
                "required_data": ["calculation_results", "methodology", "assumptions"]
            }
        ]
        
        return {
            "success": True,
            "available_templates": templates,
            "categories": list(set(t["category"] for t in templates))
        }
        
    except Exception as e:
        logger.error(f"Erreur get templates", error=str(e))
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@router.get("/preview/{format}", summary="Aperçu d'un format d'export")
async def preview_export_format(format: str):
    """
    Obtenir un aperçu de ce à quoi ressemble un format d'export
    avec des données d'exemple
    """
    try:
        if format not in export_manager.get_supported_formats():
            raise HTTPException(status_code=404, detail=f"Format '{format}' non supporté")
        
        # Créer des données d'exemple
        sample_triangle = [
            [1000000, 1400000, 1650000, 1750000],
            [1100000, 1600000, 1900000],
            [1200000, 1800000],
            [1300000]
        ]
        
        triangle_data = create_triangle_data(sample_triangle, currency="EUR", business_line="Sample Line")
        
        # Calcul d'exemple avec Chain Ladder
        method = create_method("chain_ladder")
        result = method.calculate(triangle_data)
        
        # Export d'exemple
        export_options = create_export_options(format=format, precision=0)
        export_result = export_manager.export_result(result, triangle_data, export_options)
        
        # Tronquer le contenu si trop long pour prévisualisation
        content = export_result["content"]
        if len(content) > 2000:
            content = content[:2000] + "\n... [contenu tronqué pour prévisualisation] ..."
        
        return {
            "success": True,
            "format": format,
            "preview_content": content,
            "full_size": export_result["size"],
            "content_type": export_result["content_type"],
            "sample_filename": export_result["filename"]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur preview format", format=format, error=str(e))
        raise HTTPException(status_code=500, detail=f"Erreur preview: {str(e)}")

# ============================================================================
# Fonctions utilitaires
# ============================================================================

def create_zip_from_exports(export_results: List[Dict], batch_name: str) -> bytes:
    """Créer un fichier ZIP à partir de plusieurs exports"""
    
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for export_data in export_results:
            if export_data["success"]:
                result = export_data["result"]
                filename = result["filename"]
                content = result["content"]
                
                # Ajouter au ZIP
                if isinstance(content, str):
                    zip_file.writestr(filename, content.encode('utf-8'))
                else:
                    zip_file.writestr(filename, content)
    
    return zip_buffer.getvalue()

# ============================================================================
# Templates spécialisés
# ============================================================================

def generate_solvency2_qrt_template(data: Dict[str, Any], options: ExportOptionsModel) -> Dict[str, Any]:
    """Générer un template Solvency II QRT"""
    
    # Template simplifié pour Solvabilité II
    qrt_content = f"""
# SOLVENCY II - Quantitative Reporting Template
# Technical Provisions - Non-Life

## Company Information
- Entity: {data.get('company_name', 'Insurance Company')}
- Reporting Date: {datetime.now().strftime('%Y-%m-%d')}
- Currency: {data.get('currency', 'EUR')}

## Technical Provisions Summary
- Best Estimate Liabilities: {data.get('reserves', 0):,.2f}
- Risk Margin: {data.get('risk_margin', 0):,.2f} 
- Technical Provisions: {data.get('total_tp', 0):,.2f}

## Methods Used
{chr(10).join(f"- {method}" for method in data.get('methods_used', ['Chain Ladder']))}

## Validation
- Independent Review: {'Yes' if data.get('independent_review') else 'No'}
- Management Validation: {'Yes' if data.get('management_validation') else 'No'}
    """
    
    return {
        "content": qrt_content,
        "content_type": "text/markdown",
        "filename": f"solvency2_qrt_{datetime.now().strftime('%Y%m%d')}.md",
        "template_id": "solvency2_qrt"
    }

def generate_regulatory_summary_template(data: Dict[str, Any], options: ExportOptionsModel) -> Dict[str, Any]:
    """Générer un résumé réglementaire"""
    
    summary_content = f"""
# RÉSUMÉ RÉGLEMENTAIRE - PROVISIONS TECHNIQUES

## Synthèse Exécutive
- Montant Total des Réserves: {data.get('total_reserves', 0):,.2f} EUR
- Variation vs Période Précédente: {data.get('variation_pct', 0):.1%}
- Méthodes Utilisées: {', '.join(data.get('methods', []))}

## Conformité Réglementaire
✅ Méthodes conformes aux standards actuariels
✅ Validation indépendante effectuée
✅ Documentation complète disponible

## Recommandations
{chr(10).join(f"• {rec}" for rec in data.get('recommendations', ['Aucune recommandation spécifique']))}
    """
    
    return {
        "content": summary_content,
        "content_type": "text/markdown", 
        "filename": f"regulatory_summary_{datetime.now().strftime('%Y%m%d')}.md",
        "template_id": "regulatory_summary"
    }

def generate_executive_dashboard_template(data: Dict[str, Any], options: ExportOptionsModel) -> Dict[str, Any]:
    """Générer un dashboard exécutif"""
    
    dashboard_content = f"""
# DASHBOARD EXÉCUTIF - RÉSERVES ACTUARIELLES

## KPIs Clés 📊
- **Réserves Totales**: {data.get('total_reserves', 0):,.0f} EUR
- **Évolution**: {data.get('evolution', 0):+.1%} vs trimestre précédent
- **Couverture**: {data.get('coverage_ratio', 100):.1f}%
- **Confiance**: {data.get('confidence_level', 95):.0f}%

## Tendances 📈
- Stabilité des réserves: {'Stable' if abs(data.get('evolution', 0)) < 0.05 else 'Variable'}
- Qualité des données: {'Excellent' if data.get('data_quality', 0.8) > 0.9 else 'Bon'}

## Actions Requises ⚡
{chr(10).join(f"• {action}" for action in data.get('actions', ['Aucune action immédiate requise']))}
    """
    
    return {
        "content": dashboard_content,
        "content_type": "text/markdown",
        "filename": f"executive_dashboard_{datetime.now().strftime('%Y%m%d')}.md", 
        "template_id": "executive_dashboard"
    }

def generate_technical_appendix_template(data: Dict[str, Any], options: ExportOptionsModel) -> Dict[str, Any]:
    """Générer une annexe technique détaillée"""
    
    technical_content = f"""
# ANNEXE TECHNIQUE - DÉTAILS MÉTHODOLOGIQUES

## Méthodes Actuarielles Employées

### Chain Ladder
- Facteurs de développement: {data.get('chain_ladder_factors', [])}
- R²: {data.get('chain_ladder_r2', 0):.3f}
- Avertissements: {len(data.get('chain_ladder_warnings', []))}

### Cape Cod  
- Taux de charge a priori: {data.get('cape_cod_lr', 0):.1%}
- Crédibilité moyenne: {data.get('cape_cod_credibility', 0):.3f}

### Validation Croisée
- RMSE moyen: {data.get('avg_rmse', 0):.2f}
- Stabilité: {data.get('stability_score', 0):.3f}

## Hypothèses Clés
{chr(10).join(f"• {assumption}" for assumption in data.get('key_assumptions', ['Hypothèses standard']))}

## Limitations et Incertitudes
{chr(10).join(f"• {limitation}" for limitation in data.get('limitations', ['Limitations standard']))}
    """
    
    return {
        "content": technical_content,
        "content_type": "text/markdown",
        "filename": f"technical_appendix_{datetime.now().strftime('%Y%m%d')}.md",
        "template_id": "technical_appendix"
    }