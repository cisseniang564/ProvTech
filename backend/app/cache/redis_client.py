"""
Client Redis pour cache intelligent
Gestion des caches de calculs, sessions et métriques
"""

import redis.asyncio as redis
import json
import pickle
import hashlib
import logging
from typing import Any, Optional, Dict, List, Union
from datetime import datetime, timedelta

from app.core.config import settings

# Configuration du logging
logger = logging.getLogger(__name__)

# ================================
# CLIENT REDIS PRINCIPAL
# ================================

class RedisClient:
    """
    Client Redis avec fonctionnalités avancées de cache
    """
    
    def __init__(self):
        self.redis_url = settings.REDIS_URL
        self.prefix = settings.CACHE_PREFIX
        self.default_ttl = settings.CACHE_TTL
        self._client = None
    
    async def get_client(self) -> redis.Redis:
        """Récupère ou crée la connexion Redis"""
        if self._client is None:
            self._client = redis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=True,
                socket_keepalive=True,
                socket_keepalive_options={},
                health_check_interval=30
            )
        return self._client
    
    async def close(self):
        """Ferme la connexion Redis"""
        if self._client:
            await self._client.close()
            self._client = None
    
    def _make_key(self, key: str) -> str:
        """Génère une clé avec préfixe"""
        return f"{self.prefix}{key}"
    
    # ================================
    # OPÉRATIONS DE BASE
    # ================================
    
    async def set(
        self, 
        key: str, 
        value: Any, 
        ttl: Optional[int] = None,
        serialize: str = "json"
    ) -> bool:
        """
        Stocke une valeur dans Redis
        
        Args:
            key: Clé de stockage
            value: Valeur à stocker
            ttl: Durée de vie en secondes
            serialize: Mode de sérialisation ('json' ou 'pickle')
            
        Returns:
            bool: True si succès
        """
        try:
            client = await self.get_client()
            cache_key = self._make_key(key)
            
            # Sérialisation
            if serialize == "json":
                serialized_value = json.dumps(value, default=str)
            elif serialize == "pickle":
                serialized_value = pickle.dumps(value)
            else:
                serialized_value = str(value)
            
            # Stockage avec TTL
            if ttl is None:
                ttl = self.default_ttl
            
            result = await client.setex(cache_key, ttl, serialized_value)
            
            logger.debug(f"Cache SET: {key} (TTL: {ttl}s)")
            return result
            
        except Exception as e:
            logger.error(f"Erreur Redis SET {key}: {e}")
            return False
    
    async def get(
        self, 
        key: str, 
        default: Any = None,
        deserialize: str = "json"
    ) -> Any:
        """
        Récupère une valeur depuis Redis
        
        Args:
            key: Clé de récupération
            default: Valeur par défaut si non trouvée
            deserialize: Mode de désérialisation
            
        Returns:
            Any: Valeur récupérée ou default
        """
        try:
            client = await self.get_client()
            cache_key = self._make_key(key)
            
            result = await client.get(cache_key)
            
            if result is None:
                logger.debug(f"Cache MISS: {key}")
                return default
            
            # Désérialisation
            if deserialize == "json":
                value = json.loads(result)
            elif deserialize == "pickle":
                value = pickle.loads(result)
            else:
                value = result
            
            logger.debug(f"Cache HIT: {key}")
            return value
            
        except Exception as e:
            logger.error(f"Erreur Redis GET {key}: {e}")
            return default
    
    async def delete(self, key: str) -> bool:
        """Supprime une clé"""
        try:
            client = await self.get_client()
            cache_key = self._make_key(key)
            result = await client.delete(cache_key)
            
            logger.debug(f"Cache DELETE: {key}")
            return bool(result)
            
        except Exception as e:
            logger.error(f"Erreur Redis DELETE {key}: {e}")
            return False
    
    async def exists(self, key: str) -> bool:
        """Vérifie si une clé existe"""
        try:
            client = await self.get_client()
            cache_key = self._make_key(key)
            result = await client.exists(cache_key)
            return bool(result)
        except Exception as e:
            logger.error(f"Erreur Redis EXISTS {key}: {e}")
            return False
    
    async def expire(self, key: str, ttl: int) -> bool:
        """Définit un TTL pour une clé existante"""
        try:
            client = await self.get_client()
            cache_key = self._make_key(key)
            result = await client.expire(cache_key, ttl)
            return bool(result)
        except Exception as e:
            logger.error(f"Erreur Redis EXPIRE {key}: {e}")
            return False
    
    async def ping(self) -> bool:
        """Test de connectivité Redis"""
        try:
            client = await self.get_client()
            result = await client.ping()
            return result
        except Exception as e:
            logger.error(f"Erreur Redis PING: {e}")
            return False
    
    # ================================
    # OPÉRATIONS AVANCÉES
    # ================================
    
    async def setex(self, key: str, ttl: int, value: Any) -> bool:
        """Set avec expiration"""
        return await self.set(key, value, ttl)
    
    async def get_or_set(
        self,
        key: str,
        factory_func,
        ttl: Optional[int] = None,
        serialize: str = "json"
    ) -> Any:
        """
        Récupère depuis le cache ou exécute la fonction et cache le résultat
        
        Args:
            key: Clé de cache
            factory_func: Fonction à exécuter si cache miss
            ttl: Durée de vie
            serialize: Mode de sérialisation
            
        Returns:
            Any: Valeur depuis cache ou calculée
        """
        # Tentative de récupération depuis le cache
        cached_value = await self.get(key, serialize=serialize)
        
        if cached_value is not None:
            return cached_value
        
        # Cache miss - exécution de la fonction
        try:
            if callable(factory_func):
                value = factory_func()
            else:
                value = factory_func
            
            # Mise en cache du résultat
            await self.set(key, value, ttl, serialize)
            
            return value
            
        except Exception as e:
            logger.error(f"Erreur factory function pour {key}: {e}")
            return None
    
    async def mget(self, keys: List[str], deserialize: str = "json") -> Dict[str, Any]:
        """Récupération multiple"""
        try:
            client = await self.get_client()
            cache_keys = [self._make_key(key) for key in keys]
            
            results = await client.mget(cache_keys)
            
            output = {}
            for i, key in enumerate(keys):
                value = results[i]
                if value is not None:
                    try:
                        if deserialize == "json":
                            output[key] = json.loads(value)
                        elif deserialize == "pickle":
                            output[key] = pickle.loads(value)
                        else:
                            output[key] = value
                    except:
                        output[key] = None
                else:
                    output[key] = None
            
            return output
            
        except Exception as e:
            logger.error(f"Erreur Redis MGET: {e}")
            return {key: None for key in keys}
    
    async def delete_pattern(self, pattern: str) -> int:
        """Supprime toutes les clés correspondant au pattern"""
        try:
            client = await self.get_client()
            cache_pattern = self._make_key(pattern)
            
            keys = await client.keys(cache_pattern)
            if keys:
                deleted = await client.delete(*keys)
                logger.info(f"Supprimées {deleted} clés pour pattern: {pattern}")
                return deleted
            return 0
            
        except Exception as e:
            logger.error(f"Erreur Redis DELETE_PATTERN {pattern}: {e}")
            return 0
    
    # ================================
    # CACHE SPÉCIALISÉ POUR CALCULS
    # ================================
    
    async def cache_calculation_result(
        self,
        calculation_id: int,
        result: Dict[str, Any],
        ttl: int = 3600
    ) -> bool:
        """
        Cache le résultat d'un calcul
        
        Args:
            calculation_id: ID du calcul
            result: Résultats du calcul
            ttl: Durée de vie en secondes
            
        Returns:
            bool: True si succès
        """
        key = f"calculation:result:{calculation_id}"
        
        # Ajout de métadonnées
        cache_data = {
            "calculation_id": calculation_id,
            "result": result,
            "cached_at": datetime.utcnow().isoformat(),
            "cache_version": "1.0"
        }
        
        return await self.set(key, cache_data, ttl)
    
    async def get_cached_calculation_result(
        self,
        calculation_id: int
    ) -> Optional[Dict[str, Any]]:
        """Récupère le résultat d'un calcul depuis le cache"""
        key = f"calculation:result:{calculation_id}"
        cached_data = await self.get(key)
        
        if cached_data and isinstance(cached_data, dict):
            return cached_data.get("result")
        
        return None
    
    async def cache_triangle_data(
        self,
        triangle_id: int,
        processed_data: Dict[str, Any],
        ttl: int = 1800  # 30 minutes
    ) -> bool:
        """
        Cache les données traitées d'un triangle
        
        Args:
            triangle_id: ID du triangle
            processed_data: Données traitées
            ttl: Durée de vie
            
        Returns:
            bool: True si succès
        """
        key = f"triangle:processed:{triangle_id}"
        
        # Calcul d'un hash pour vérifier l'intégrité
        data_hash = hashlib.md5(
            json.dumps(processed_data, sort_keys=True).encode()
        ).hexdigest()
        
        cache_data = {
            "triangle_id": triangle_id,
            "data": processed_data,
            "data_hash": data_hash,
            "cached_at": datetime.utcnow().isoformat()
        }
        
        return await self.set(key, cache_data, ttl)
    
    async def get_cached_triangle_data(
        self,
        triangle_id: int
    ) -> Optional[Dict[str, Any]]:
        """Récupère les données traitées d'un triangle"""
        key = f"triangle:processed:{triangle_id}"
        cached_data = await self.get(key)
        
        if cached_data and isinstance(cached_data, dict):
            return cached_data.get("data")
        
        return None
    
    # ================================
    # CACHE DE SESSIONS
    # ================================
    
    async def store_user_session(
        self,
        session_id: str,
        user_data: Dict[str, Any],
        ttl: int = 3600
    ) -> bool:
        """
        Stocke une session utilisateur
        
        Args:
            session_id: ID de session
            user_data: Données utilisateur
            ttl: Durée de vie de la session
            
        Returns:
            bool: True si succès
        """
        key = f"session:{session_id}"
        
        session_data = {
            "session_id": session_id,
            "user_data": user_data,
            "created_at": datetime.utcnow().isoformat(),
            "expires_at": (datetime.utcnow() + timedelta(seconds=ttl)).isoformat()
        }
        
        return await self.set(key, session_data, ttl)
    
    async def get_user_session(
        self,
        session_id: str
    ) -> Optional[Dict[str, Any]]:
        """Récupère une session utilisateur"""
        key = f"session:{session_id}"
        session_data = await self.get(key)
        
        if session_data and isinstance(session_data, dict):
            return session_data.get("user_data")
        
        return None
    
    async def extend_user_session(
        self,
        session_id: str,
        additional_ttl: int = 3600
    ) -> bool:
        """Prolonge une session utilisateur"""
        key = f"session:{session_id}"
        return await self.expire(key, additional_ttl)
    
    async def invalidate_user_session(self, session_id: str) -> bool:
        """Invalide une session utilisateur"""
        key = f"session:{session_id}"
        return await self.delete(key)
    
    # ================================
    # CACHE DE MÉTRIQUES
    # ================================
    
    async def store_metrics(
        self,
        metric_type: str,
        period: str,
        metrics_data: Dict[str, Any],
        ttl: int = 3600
    ) -> bool:
        """
        Stocke des métriques
        
        Args:
            metric_type: Type de métrique (calculations, performance, etc.)
            period: Période (1h, 24h, 7d, etc.)
            metrics_data: Données de métriques
            ttl: Durée de vie
            
        Returns:
            bool: True si succès
        """
        key = f"metrics:{metric_type}:{period}"
        
        enhanced_data = {
            "metric_type": metric_type,
            "period": period,
            "data": metrics_data,
            "generated_at": datetime.utcnow().isoformat()
        }
        
        return await self.set(key, enhanced_data, ttl)
    
    async def get_metrics(
        self,
        metric_type: str,
        period: str
    ) -> Optional[Dict[str, Any]]:
        """Récupère des métriques"""
        key = f"metrics:{metric_type}:{period}"
        cached_data = await self.get(key)
        
        if cached_data and isinstance(cached_data, dict):
            return cached_data.get("data")
        
        return None
    
    # ================================
    # RATE LIMITING
    # ================================
    
    async def check_rate_limit(
        self,
        identifier: str,
        limit: int,
        window_seconds: int
    ) -> Dict[str, Any]:
        """
        Vérifie et applique les limites de taux
        
        Args:
            identifier: Identifiant (IP, user_id, etc.)
            limit: Nombre de requêtes autorisées
            window_seconds: Fenêtre de temps en secondes
            
        Returns:
            Dict: Informations sur le rate limiting
        """
        try:
            client = await self.get_client()
            key = self._make_key(f"rate_limit:{identifier}")
            
            # Utilisation d'une sliding window avec des timestamps
            now = datetime.utcnow().timestamp()
            
            # Pipeline pour l'atomicité
            pipe = client.pipeline()
            
            # Supprime les entrées expirées
            pipe.zremrangebyscore(key, 0, now - window_seconds)
            
            # Compte les requêtes actuelles
            pipe.zcard(key)
            
            # Ajoute la requête actuelle
            pipe.zadd(key, {str(now): now})
            
            # Définit l'expiration
            pipe.expire(key, window_seconds)
            
            results = await pipe.execute()
            
            current_count = results[1]  # Résultat du zcard
            
            # Vérification de la limite
            is_allowed = current_count < limit
            
            return {
                "allowed": is_allowed,
                "current_count": current_count,
                "limit": limit,
                "window_seconds": window_seconds,
                "reset_at": now + window_seconds
            }
            
        except Exception as e:
            logger.error(f"Erreur rate limiting {identifier}: {e}")
            # En cas d'erreur Redis, on autorise par défaut
            return {
                "allowed": True,
                "current_count": 0,
                "limit": limit,
                "window_seconds": window_seconds,
                "error": str(e)
            }
    
    # ================================
    # CACHE INTELLIGENT AVEC TAGS
    # ================================
    
    async def set_with_tags(
        self,
        key: str,
        value: Any,
        tags: List[str],
        ttl: Optional[int] = None
    ) -> bool:
        """
        Stocke une valeur avec des tags pour invalidation groupée
        
        Args:
            key: Clé de stockage
            value: Valeur
            tags: Liste de tags
            ttl: Durée de vie
            
        Returns:
            bool: True si succès
        """
        try:
            # Stockage de la valeur principale
            success = await self.set(key, value, ttl)
            
            if not success:
                return False
            
            # Association avec les tags
            client = await self.get_client()
            cache_key = self._make_key(key)
            
            for tag in tags:
                tag_key = self._make_key(f"tag:{tag}")
                await client.sadd(tag_key, cache_key)
                
                # TTL pour le tag (plus long que les données)
                tag_ttl = (ttl or self.default_ttl) + 300  # +5 minutes
                await client.expire(tag_key, tag_ttl)
            
            return True
            
        except Exception as e:
            logger.error(f"Erreur set_with_tags {key}: {e}")
            return False
    
    async def invalidate_by_tag(self, tag: str) -> int:
        """
        Invalide toutes les clés associées à un tag
        
        Args:
            tag: Tag à invalider
            
        Returns:
            int: Nombre de clés supprimées
        """
        try:
            client = await self.get_client()
            tag_key = self._make_key(f"tag:{tag}")
            
            # Récupération des clés associées au tag
            keys = await client.smembers(tag_key)
            
            if not keys:
                return 0
            
            # Suppression des clés
            deleted = await client.delete(*keys)
            
            # Suppression du tag lui-même
            await client.delete(tag_key)
            
            logger.info(f"Invalidation tag '{tag}': {deleted} clés supprimées")
            return deleted
            
        except Exception as e:
            logger.error(f"Erreur invalidate_by_tag {tag}: {e}")
            return 0
    
    # ================================
    # UTILITAIRES ET MONITORING
    # ================================
    
    async def get_cache_stats(self) -> Dict[str, Any]:
        """Récupère les statistiques du cache"""
        try:
            client = await self.get_client()
            
            # Informations générales
            info = await client.info()
            
            # Statistiques personnalisées
            stats = {
                "redis_version": info.get("redis_version"),
                "used_memory": info.get("used_memory_human"),
                "connected_clients": info.get("connected_clients"),
                "total_commands_processed": info.get("total_commands_processed"),
                "keyspace_hits": info.get("keyspace_hits", 0),
                "keyspace_misses": info.get("keyspace_misses", 0),
                "keys_count": 0,
                "prefix": self.prefix,
                "default_ttl": self.default_ttl
            }
            
            # Calcul du hit ratio
            hits = stats["keyspace_hits"]
            misses = stats["keyspace_misses"]
            total_requests = hits + misses
            
            if total_requests > 0:
                stats["hit_ratio"] = hits / total_requests
            else:
                stats["hit_ratio"] = 0
            
            # Compte des clés avec notre préfixe
            pattern = self._make_key("*")
            keys = await client.keys(pattern)
            stats["keys_count"] = len(keys)
            
            return stats
            
        except Exception as e:
            logger.error(f"Erreur get_cache_stats: {e}")
            return {"error": str(e)}
    
    async def flush_cache(self, pattern: Optional[str] = None) -> bool:
        """
        Vide le cache (attention en production!)
        
        Args:
            pattern: Pattern optionnel pour vider seulement certaines clés
            
        Returns:
            bool: True si succès
        """
        try:
            if pattern:
                # Suppression par pattern
                deleted = await self.delete_pattern(pattern)
                logger.warning(f"Cache flush pattern '{pattern}': {deleted} clés supprimées")
                return deleted > 0
            else:
                # Suppression complète de notre préfixe
                deleted = await self.delete_pattern("*")
                logger.warning(f"Cache flush complet: {deleted} clés supprimées")
                return True
                
        except Exception as e:
            logger.error(f"Erreur flush_cache: {e}")
            return False
    
    async def health_check(self) -> Dict[str, Any]:
        """Health check complet du cache"""
        try:
            start_time = datetime.utcnow()
            
            # Test de connectivité
            ping_result = await self.ping()
            
            # Test de lecture/écriture
            test_key = "health_check_test"
            test_value = {"timestamp": start_time.isoformat()}
            
            write_success = await self.set(test_key, test_value, 60)
            read_result = await self.get(test_key)
            delete_success = await self.delete(test_key)
            
            # Temps de réponse
            response_time = (datetime.utcnow() - start_time).total_seconds() * 1000
            
            # Statistiques
            stats = await self.get_cache_stats()
            
            return {
                "status": "healthy" if all([ping_result, write_success, read_result, delete_success]) else "unhealthy",
                "ping": ping_result,
                "read_write_test": write_success and read_result is not None and delete_success,
                "response_time_ms": response_time,
                "stats": stats,
                "timestamp": datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }


# ================================
# DÉCORATEURS DE CACHE
# ================================

def cache_result(
    ttl: int = 3600,
    key_prefix: str = "func",
    serialize: str = "json",
    tags: Optional[List[str]] = None
):
    """
    Décorateur pour mettre en cache les résultats de fonction
    
    Args:
        ttl: Durée de vie du cache
        key_prefix: Préfixe de la clé de cache
        serialize: Mode de sérialisation
        tags: Tags pour invalidation groupée
    """
    def decorator(func):
        async def wrapper(*args, **kwargs):
            # Génération de la clé de cache basée sur les arguments
            args_str = str(args) + str(sorted(kwargs.items()))
            cache_key = f"{key_prefix}:{func.__name__}:{hashlib.md5(args_str.encode()).hexdigest()}"
            
            # Tentative de récupération depuis le cache
            cached_result = await redis_client.get(cache_key, deserialize=serialize)
            
            if cached_result is not None:
                logger.debug(f"Cache hit pour {func.__name__}")
                return cached_result
            
            # Exécution de la fonction
            result = await func(*args, **kwargs) if callable(getattr(func, '__call__', None)) else func(*args, **kwargs)
            
            # Mise en cache du résultat
            if tags:
                await redis_client.set_with_tags(cache_key, result, tags, ttl)
            else:
                await redis_client.set(cache_key, result, ttl, serialize)
            
            logger.debug(f"Cache miss pour {func.__name__} - résultat mis en cache")
            return result
        
        return wrapper
    return decorator


# ================================
# INSTANCE GLOBALE
# ================================

# Instance principale du client Redis
redis_client = RedisClient()


# ================================
# FONCTIONS UTILITAIRES
# ================================

async def get_or_create_cache(
    key: str,
    factory_func,
    ttl: Optional[int] = None,
    force_refresh: bool = False
) -> Any:
    """
    Fonction utilitaire pour get_or_set
    
    Args:
        key: Clé de cache
        factory_func: Fonction de création
        ttl: Durée de vie
        force_refresh: Forcer le refresh
        
    Returns:
        Any: Valeur récupérée ou créée
    """
    if force_refresh:
        await redis_client.delete(key)
    
    return await redis_client.get_or_set(key, factory_func, ttl)


async def cache_calculation_metadata(
    calculation_id: int,
    triangle_id: int,
    method: str,
    parameters_hash: str,
    ttl: int = 7200  # 2 heures
) -> bool:
    """
    Cache les métadonnées d'un calcul pour optimisation
    
    Args:
        calculation_id: ID du calcul
        triangle_id: ID du triangle
        method: Méthode utilisée
        parameters_hash: Hash des paramètres
        ttl: Durée de vie
        
    Returns:
        bool: True si succès
    """
    metadata = {
        "calculation_id": calculation_id,
        "triangle_id": triangle_id,
        "method": method,
        "parameters_hash": parameters_hash,
        "created_at": datetime.utcnow().isoformat()
    }
    
    key = f"calculation:metadata:{calculation_id}"
    tags = [f"triangle:{triangle_id}", f"method:{method}"]
    
    return await redis_client.set_with_tags(key, metadata, tags, ttl)


async def find_similar_cached_calculations(
    triangle_id: int,
    method: str,
    parameters_hash: str
) -> List[int]:
    """
    Trouve des calculs similaires en cache
    
    Args:
        triangle_id: ID du triangle
        method: Méthode
        parameters_hash: Hash des paramètres
        
    Returns:
        List[int]: IDs des calculs similaires
    """
    try:
        client = await redis_client.get_client()
        
        # Recherche par triangle et méthode
        pattern = redis_client._make_key(f"calculation:metadata:*")
        keys = await client.keys(pattern)
        
        similar_calculations = []
        
        for key in keys:
            metadata = await redis_client.get(key.replace(redis_client.prefix, ""))
            
            if (metadata and 
                metadata.get("triangle_id") == triangle_id and
                metadata.get("method") == method and
                metadata.get("parameters_hash") == parameters_hash):
                
                similar_calculations.append(metadata["calculation_id"])
        
        return similar_calculations
        
    except Exception as e:
        logger.error(f"Erreur recherche calculs similaires: {e}")
        return []


# ================================
# EXPORTS
# ================================

__all__ = [
    "RedisClient",
    "redis_client",
    "cache_result",
    "get_or_create_cache",
    "cache_calculation_metadata",
    "find_similar_cached_calculations"
]