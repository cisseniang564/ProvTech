# backend/app/routers/api_connectors.py
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from fastapi.responses import JSONResponse
from typing import List, Dict, Any, Optional
from datetime import datetime
import asyncio
import logging

from ..services.api_connectors import (
    APIConnectorManager, APIConnectorConfig, ConnectorFactory,
    connector_manager, initialize_default_connectors,
    DataSourceType, ConnectionStatus
)
from ..auth import verify_token  # Votre système d'auth existant

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/connectors", tags=["API Connectors"])

# Initialiser les connecteurs par défaut au démarrage
initialize_default_connectors()

# ===== MODÈLES PYDANTIC POUR LES ENDPOINTS =====
from pydantic import BaseModel

class ConnectorCreateRequest(BaseModel):
    name: str
    provider: str
    source_type: DataSourceType
    base_url: str
    api_key: Optional[str] = None
    endpoints_config: List[Dict[str, Any]]
    mappings_config: List[Dict[str, str]]
    refresh_rate: int = 3600
    enabled: bool = True

class DataSyncRequest(BaseModel):
    endpoint_name: str
    parameters: Dict[str, Any] = {}
    force_refresh: bool = False

class TriangleRequest(BaseModel):
    business_line: str
    accident_years: List[int]
    development_periods: Optional[List[int]] = None

# ===== ENDPOINTS DE GESTION DES CONNECTEURS =====

@router.get("/", summary="Liste des connecteurs")
async def list_connectors(current_user: dict = Depends(verify_token)):
    """Récupérer la liste de tous les connecteurs configurés"""
    try:
        connectors_info = []
        
        for connector_id, connector in connector_manager.connectors.items():
            config = connector.config
            connectors_info.append({
                "id": config.id,
                "name": config.name,
                "provider": config.provider,
                "source_type": config.source_type,
                "enabled": config.enabled,
                "last_sync": config.last_sync.isoformat() if config.last_sync else None,
                "endpoints_count": len(config.endpoints),
                "metrics": connector.metrics
            })
        
        return {
            "success": True,
            "connectors": connectors_info,
            "total": len(connectors_info)
        }
        
    except Exception as e:
        logger.error(f"Erreur liste connecteurs: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{connector_id}", summary="Détails d'un connecteur")
async def get_connector(
    connector_id: str,
    current_user: dict = Depends(verify_token)
):
    """Récupérer les détails d'un connecteur spécifique"""
    connector = connector_manager.get_connector(connector_id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connecteur non trouvé")
    
    config = connector.config
    return {
        "success": True,
        "connector": {
            "id": config.id,
            "name": config.name,
            "provider": config.provider,
            "source_type": config.source_type,
            "base_url": config.base_url,
            "enabled": config.enabled,
            "refresh_rate": config.refresh_rate,
            "cache_ttl": config.cache_ttl,
            "last_sync": config.last_sync.isoformat() if config.last_sync else None,
            "endpoints": [
                {
                    "name": ep.name,
                    "url": ep.url,
                    "method": ep.method,
                    "timeout": ep.timeout
                } for ep in config.endpoints
            ],
            "metrics": connector.metrics,
            "last_error": connector.last_error
        }
    }

@router.post("/", summary="Créer un nouveau connecteur")
async def create_connector(
    request: ConnectorCreateRequest,
    current_user: dict = Depends(verify_token)
):
    """Créer et configurer un nouveau connecteur API"""
    try:
        # Vérifier que l'ID n'existe pas déjà
        connector_id = f"{request.provider.lower()}_{request.source_type}"
        if connector_manager.get_connector(connector_id):
            raise HTTPException(status_code=400, detail="Connecteur déjà existant")
        
        # Construire la configuration
        from ..services.api_connectors import APICredentials, APIEndpoint, DataMapping
        
        credentials = APICredentials(api_key=request.api_key)
        
        endpoints = []
        for ep_config in request.endpoints_config:
            endpoints.append(APIEndpoint(
                name=ep_config["name"],
                url=ep_config["url"],
                method=ep_config.get("method", "GET"),
                timeout=ep_config.get("timeout", 30)
            ))
        
        mappings = []
        for mapping_config in request.mappings_config:
            mappings.append(DataMapping(
                source_field=mapping_config["source_field"],
                target_field=mapping_config["target_field"],
                transformation=mapping_config.get("transformation")
            ))
        
        config = APIConnectorConfig(
            id=connector_id,
            name=request.name,
            provider=request.provider,
            source_type=request.source_type,
            base_url=request.base_url,
            credentials=credentials,
            endpoints=endpoints,
            data_mappings=mappings,
            refresh_rate=request.refresh_rate,
            enabled=request.enabled
        )
        
        # Créer et enregistrer le connecteur
        connector = ConnectorFactory.create_connector(config)
        connector_manager.register_connector(connector)
        
        return {
            "success": True,
            "connector_id": connector_id,
            "message": f"Connecteur {request.name} créé avec succès"
        }
        
    except Exception as e:
        logger.error(f"Erreur création connecteur: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{connector_id}/toggle", summary="Activer/désactiver connecteur")
async def toggle_connector(
    connector_id: str,
    current_user: dict = Depends(verify_token)
):
    """Activer ou désactiver un connecteur"""
    connector = connector_manager.get_connector(connector_id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connecteur non trouvé")
    
    connector.config.enabled = not connector.config.enabled
    status = "activé" if connector.config.enabled else "désactivé"
    
    if connector.config.enabled:
        # Démarrer auto-sync si activé
        await connector_manager.start_auto_sync(connector_id)
    else:
        # Arrêter auto-sync si désactivé
        await connector_manager.stop_auto_sync(connector_id)
    
    return {
        "success": True,
        "message": f"Connecteur {status}",
        "enabled": connector.config.enabled
    }

@router.delete("/{connector_id}", summary="Supprimer connecteur")
async def delete_connector(
    connector_id: str,
    current_user: dict = Depends(verify_token)
):
    """Supprimer un connecteur"""
    connector = connector_manager.get_connector(connector_id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connecteur non trouvé")
    
    # Arrêter auto-sync
    await connector_manager.stop_auto_sync(connector_id)
    
    # Fermer connexion
    await connector.disconnect()
    
    # Supprimer du manager
    del connector_manager.connectors[connector_id]
    
    return {
        "success": True,
        "message": "Connecteur supprimé avec succès"
    }

# ===== ENDPOINTS DE TEST ET MONITORING =====

@router.post("/{connector_id}/test", summary="Tester connexion")
async def test_connector_connection(
    connector_id: str,
    current_user: dict = Depends(verify_token)
):
    """Tester la connexion d'un connecteur"""
    connector = connector_manager.get_connector(connector_id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connecteur non trouvé")
    
    result = await connector.test_connection()
    return {
        "success": True,
        "test_result": result,
        "connector_name": connector.config.name
    }

@router.post("/test-all", summary="Tester toutes les connexions")
async def test_all_connections(current_user: dict = Depends(verify_token)):
    """Tester toutes les connexions de connecteurs"""
    results = await connector_manager.test_all_connections()
    
    summary = {
        "total": len(results),
        "success": len([r for r in results.values() if r.get("status") == "success"]),
        "errors": len([r for r in results.values() if r.get("status") == "error"])
    }
    
    return {
        "success": True,
        "results": results,
        "summary": summary
    }

@router.get("/metrics", summary="Métriques des connecteurs")
async def get_connectors_metrics(current_user: dict = Depends(verify_token)):
    """Récupérer les métriques de performance de tous les connecteurs"""
    metrics = connector_manager.get_metrics()
    
    # Calculer des métriques globales
    global_metrics = {
        "total_connectors": len(metrics),
        "active_connectors": len([m for m in metrics.values() if m["status"] == "active"]),
        "total_requests": sum(m["metrics"]["requests_count"] for m in metrics.values()),
        "total_errors": sum(m["metrics"]["error_count"] for m in metrics.values()),
        "cache_entries": sum(m["cache_entries"] for m in metrics.values())
    }
    
    return {
        "success": True,
        "global_metrics": global_metrics,
        "connector_metrics": metrics
    }

# ===== ENDPOINTS DE SYNCHRONISATION DES DONNÉES =====

@router.post("/{connector_id}/sync", summary="Synchroniser données")
async def sync_connector_data(
    connector_id: str,
    request: DataSyncRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(verify_token)
):
    """Synchroniser les données d'un connecteur"""
    connector = connector_manager.get_connector(connector_id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connecteur non trouvé")
    
    # Si force_refresh, nettoyer le cache
    if request.force_refresh:
        cache_keys = [k for k in connector_manager.cache.keys() if k.startswith(connector_id)]
        for key in cache_keys:
            del connector_manager.cache[key]
    
    try:
        result = await connector_manager.sync_data(
            connector_id, 
            request.endpoint_name, 
            **request.parameters
        )
        
        return {
            "success": True,
            "sync_result": result,
            "cached": not request.force_refresh
        }
        
    except Exception as e:
        logger.error(f"Erreur sync données {connector_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{connector_id}/auto-sync/start", summary="Démarrer auto-sync")
async def start_auto_sync(
    connector_id: str,
    current_user: dict = Depends(verify_token)
):
    """Démarrer la synchronisation automatique d'un connecteur"""
    connector = connector_manager.get_connector(connector_id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connecteur non trouvé")
    
    await connector_manager.start_auto_sync(connector_id)
    
    return {
        "success": True,
        "message": f"Auto-sync démarré pour {connector.config.name}",
        "refresh_rate": f"{connector.config.refresh_rate}s"
    }

@router.post("/{connector_id}/auto-sync/stop", summary="Arrêter auto-sync")
async def stop_auto_sync(
    connector_id: str,
    current_user: dict = Depends(verify_token)
):
    """Arrêter la synchronisation automatique d'un connecteur"""
    await connector_manager.stop_auto_sync(connector_id)
    
    return {
        "success": True,
        "message": "Auto-sync arrêté"
    }

# ===== ENDPOINTS SPÉCIALISÉS POUR TRIANGLES =====

@router.post("/{connector_id}/triangles", summary="Récupérer triangles")
async def fetch_triangles(
    connector_id: str,
    request: TriangleRequest,
    current_user: dict = Depends(verify_token)
):
    """Récupérer des triangles de développement depuis un connecteur"""
    connector = connector_manager.get_connector(connector_id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connecteur non trouvé")
    
    # Vérifier que c'est un connecteur de triangles
    from ..services.api_connectors import TriangleDataConnector
    if not isinstance(connector, TriangleDataConnector):
        raise HTTPException(
            status_code=400, 
            detail="Ce connecteur ne supporte pas la récupération de triangles"
        )
    
    try:
        result = await connector.fetch_triangles(
            business_line=request.business_line,
            accident_years=request.accident_years,
            development_periods=request.development_periods
        )
        
        if result["success"]:
            # Transformer les données si nécessaire
            if "data" in result:
                df = await connector.transform_data(result["data"])
                result["transformed_data"] = df.to_dict('records')
                result["triangle_info"] = {
                    "accident_years": sorted(df['accident_year'].unique().tolist()) if 'accident_year' in df.columns else [],
                    "development_periods": sorted(df['development_period'].unique().tolist()) if 'development_period' in df.columns else [],
                    "business_lines": df['business_line'].unique().tolist() if 'business_line' in df.columns else []
                }
        
        return {
            "success": True,
            "triangle_result": result,
            "connector_name": connector.config.name
        }
        
    except Exception as e:
        logger.error(f"Erreur récupération triangles {connector_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ===== ENDPOINTS DE DONNÉES DE MARCHÉ =====

@router.get("/{connector_id}/market-data/rates", summary="Récupérer taux d'intérêt")
async def get_interest_rates(
    connector_id: str,
    date_from: Optional[str] = Query(None, description="Date début (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="Date fin (YYYY-MM-DD)"),
    currency: Optional[str] = Query("EUR", description="Devise"),
    current_user: dict = Depends(verify_token)
):
    """Récupérer les taux d'intérêt depuis un connecteur de données de marché"""
    connector = connector_manager.get_connector(connector_id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connecteur non trouvé")
    
    # Paramètres pour l'API
    params = {"currency": currency}
    if date_from:
        params["startDate"] = date_from
    if date_to:
        params["endDate"] = date_to
    
    try:
        result = await connector_manager.sync_data(
            connector_id, 
            "interest_rates", 
            **params
        )
        
        return {
            "success": True,
            "rates_data": result,
            "parameters": params
        }
        
    except Exception as e:
        logger.error(f"Erreur récupération taux {connector_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ===== ENDPOINTS D'IMPORT/EXPORT DE CONFIGURATION =====

@router.get("/export/config", summary="Exporter configurations")
async def export_connectors_config(current_user: dict = Depends(verify_token)):
    """Exporter les configurations de tous les connecteurs"""
    configs = []
    
    for connector_id, connector in connector_manager.connectors.items():
        config = connector.config
        # Exporter sans les credentials sensibles
        export_config = {
            "id": config.id,
            "name": config.name,
            "provider": config.provider,
            "source_type": config.source_type,
            "base_url": config.base_url,
            "endpoints": [
                {
                    "name": ep.name,
                    "url": ep.url,
                    "method": ep.method,
                    "params": ep.params,
                    "timeout": ep.timeout
                } for ep in config.endpoints
            ],
            "data_mappings": [
                {
                    "source_field": dm.source_field,
                    "target_field": dm.target_field,
                    "transformation": dm.transformation
                } for dm in config.data_mappings
            ],
            "refresh_rate": config.refresh_rate,
            "cache_ttl": config.cache_ttl,
            "enabled": config.enabled
        }
        configs.append(export_config)
    
    return {
        "success": True,
        "connectors": configs,
        "exported_at": datetime.now().isoformat(),
        "total": len(configs)
    }

# ===== ENDPOINT DE SANTÉ =====

@router.get("/health", summary="Santé des connecteurs")
async def connectors_health():
    """Vérifier la santé de tous les connecteurs"""
    health_status = {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "connectors": {}
    }
    
    overall_healthy = True
    
    for connector_id, connector in connector_manager.connectors.items():
        connector_health = {
            "name": connector.config.name,
            "enabled": connector.config.enabled,
            "last_sync": connector.config.last_sync.isoformat() if connector.config.last_sync else None,
            "error_rate": 0,
            "status": "unknown"
        }
        
        # Calculer taux d'erreur
        if connector.metrics["requests_count"] > 0:
            connector_health["error_rate"] = (
                connector.metrics["error_count"] / connector.metrics["requests_count"]
            ) * 100
        
        # Déterminer statut
        if not connector.config.enabled:
            connector_health["status"] = "disabled"
        elif connector.last_error:
            connector_health["status"] = "error"
            overall_healthy = False
        elif connector_health["error_rate"] > 20:  # Plus de 20% d'erreurs
            connector_health["status"] = "degraded"
        else:
            connector_health["status"] = "healthy"
        
        health_status["connectors"][connector_id] = connector_health
    
    health_status["status"] = "healthy" if overall_healthy else "degraded"
    
    return health_status