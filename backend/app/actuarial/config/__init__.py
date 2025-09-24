# backend/app/actuarial/config/__init__.py

"""
Système de configuration et logging professionnel pour les méthodes actuarielles

Ce module gère :
- Configuration centralisée des méthodes
- Logging professionnel avec niveaux
- Métriques de performance
- Cache intelligent
- Gestion des environnements
"""

import os
import logging
import json
from typing import Dict, Any, Optional, Union
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
import time
from functools import wraps
from pathlib import Path

# ============================================================================
# Configuration principale
# ============================================================================

class Environment(Enum):
    """Environnements d'exécution"""
    DEVELOPMENT = "development"
    TESTING = "testing"
    STAGING = "staging"
    PRODUCTION = "production"

@dataclass
class ActuarialConfig:
    """Configuration principale du système actuariel"""
    
    # Environnement
    environment: Environment = Environment.DEVELOPMENT
    debug: bool = True
    
    # Logging
    log_level: str = "INFO"
    log_file: Optional[str] = None
    log_format: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    enable_performance_logging: bool = True
    
    # Cache
    enable_cache: bool = True
    cache_ttl_seconds: int = 3600  # 1 heure
    cache_max_size: int = 1000
    
    # Méthodes ML
    ml_default_timeout: int = 300  # 5 minutes
    ml_max_iterations: Dict[str, int] = field(default_factory=lambda: {
        "gradient_boosting": 100,
        "neural_network": 100,
        "random_forest": 100
    })
    ml_early_stopping: bool = True
    
    # Validation
    strict_validation: bool = False
    allow_negative_reserves: bool = False
    min_triangle_size: int = 2
    max_triangle_size: int = 50
    
    # Performance
    max_calculation_time: int = 600  # 10 minutes
    enable_parallel_processing: bool = True
    
    # Export
    default_export_format: str = "json"
    enable_export_cache: bool = True
    
    # Sécurité
    max_triangle_value: float = 1e12  # 1 trillion
    enable_audit_log: bool = False
    
    @classmethod
    def from_env(cls) -> 'ActuarialConfig':
        """Créer la configuration depuis les variables d'environnement"""
        
        env_str = os.getenv("ACTUARIAL_ENV", "development").lower()
        try:
            environment = Environment(env_str)
        except ValueError:
            environment = Environment.DEVELOPMENT
        
        return cls(
            environment=environment,
            debug=os.getenv("ACTUARIAL_DEBUG", "true").lower() == "true",
            log_level=os.getenv("ACTUARIAL_LOG_LEVEL", "INFO").upper(),
            log_file=os.getenv("ACTUARIAL_LOG_FILE"),
            enable_cache=os.getenv("ACTUARIAL_CACHE", "true").lower() == "true",
            cache_ttl_seconds=int(os.getenv("ACTUARIAL_CACHE_TTL", "3600")),
            strict_validation=os.getenv("ACTUARIAL_STRICT", "false").lower() == "true",
            enable_audit_log=os.getenv("ACTUARIAL_AUDIT", "false").lower() == "true"
        )
    
    @classmethod
    def from_file(cls, config_file: str) -> 'ActuarialConfig':
        """Charger la configuration depuis un fichier JSON"""
        
        with open(config_file, 'r') as f:
            config_data = json.load(f)
        
        # Convertir l'environnement
        if "environment" in config_data:
            config_data["environment"] = Environment(config_data["environment"])
        
        return cls(**config_data)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convertir en dictionnaire"""
        return {
            "environment": self.environment.value,
            "debug": self.debug,
            "log_level": self.log_level,
            "log_file": self.log_file,
            "enable_cache": self.enable_cache,
            "cache_ttl_seconds": self.cache_ttl_seconds,
            "ml_default_timeout": self.ml_default_timeout,
            "strict_validation": self.strict_validation,
            "max_calculation_time": self.max_calculation_time
        }
    
    def is_production(self) -> bool:
        """Vérifier si on est en production"""
        return self.environment == Environment.PRODUCTION
    
    def is_development(self) -> bool:
        """Vérifier si on est en développement"""
        return self.environment == Environment.DEVELOPMENT

# Instance globale de configuration
config = ActuarialConfig.from_env()

# ============================================================================
# Système de logging professionnel
# ============================================================================

class ActuarialLogger:
    """Logger professionnel pour le système actuariel"""
    
    def __init__(self, name: str, config: ActuarialConfig):
        self.name = name
        self.config = config
        self.logger = self._setup_logger()
        self._performance_data = {}
    
    def _setup_logger(self) -> logging.Logger:
        """Configurer le logger"""
        logger = logging.getLogger(f"actuarial.{self.name}")
        
        # Éviter la duplication des handlers
        if logger.handlers:
            return logger
        
        logger.setLevel(getattr(logging, self.config.log_level))
        
        # Formatter
        formatter = logging.Formatter(self.config.log_format)
        
        # Console handler
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)
        
        # File handler si spécifié
        if self.config.log_file:
            file_handler = logging.FileHandler(self.config.log_file)
            file_handler.setFormatter(formatter)
            logger.addHandler(file_handler)
        
        return logger
    
    def debug(self, message: str, **kwargs):
        """Log debug avec contexte"""
        self._log_with_context(logging.DEBUG, message, **kwargs)
    
    def info(self, message: str, **kwargs):
        """Log info avec contexte"""
        self._log_with_context(logging.INFO, message, **kwargs)
    
    def warning(self, message: str, **kwargs):
        """Log warning avec contexte"""
        self._log_with_context(logging.WARNING, message, **kwargs)
    
    def error(self, message: str, **kwargs):
        """Log error avec contexte"""
        self._log_with_context(logging.ERROR, message, **kwargs)
    
    def critical(self, message: str, **kwargs):
        """Log critical avec contexte"""
        self._log_with_context(logging.CRITICAL, message, **kwargs)
    
    def _log_with_context(self, level: int, message: str, **kwargs):
        """Logger avec contexte supplémentaire"""
        if kwargs:
            context_str = " | ".join(f"{k}={v}" for k, v in kwargs.items())
            full_message = f"{message} | {context_str}"
        else:
            full_message = message
        
        self.logger.log(level, full_message)
    
    def log_calculation_start(self, method_id: str, triangle_size: tuple, **params):
        """Logger le début d'un calcul"""
        self.info(
            f"🚀 Calcul démarré: {method_id}",
            triangle_rows=triangle_size[0],
            triangle_cols=triangle_size[1] if len(triangle_size) > 1 else "variable",
            params=str(params) if params else "default"
        )
    
    def log_calculation_end(self, method_id: str, ultimate: float, time_ms: float, warnings: int = 0):
        """Logger la fin d'un calcul"""
        self.info(
            f"✅ Calcul terminé: {method_id}",
            ultimate=f"{ultimate:,.0f}",
            time_ms=f"{time_ms:.3f}",
            warnings=warnings
        )
        
        # Enregistrer les métriques de performance
        if self.config.enable_performance_logging:
            self._record_performance(method_id, time_ms, ultimate, warnings)
    
    def log_calculation_error(self, method_id: str, error: Exception, **context):
        """Logger une erreur de calcul"""
        self.error(
            f"❌ Erreur calcul: {method_id}",
            error_type=type(error).__name__,
            error_msg=str(error),
            **context
        )
    
    def log_validation_warning(self, validation_type: str, message: str, **context):
        """Logger un avertissement de validation"""
        self.warning(
            f"⚠️ Validation {validation_type}: {message}",
            **context
        )
    
    def log_performance_metrics(self):
        """Logger les métriques de performance accumulées"""
        if not self._performance_data:
            return
        
        self.info("📊 Métriques de performance:")
        for method_id, metrics in self._performance_data.items():
            avg_time = sum(metrics["times"]) / len(metrics["times"])
            total_calls = len(metrics["times"])
            avg_ultimate = sum(metrics["ultimates"]) / len(metrics["ultimates"])
            
            self.info(
                f"  • {method_id}",
                calls=total_calls,
                avg_time_ms=f"{avg_time:.3f}",
                avg_ultimate=f"{avg_ultimate:,.0f}"
            )
    
    def _record_performance(self, method_id: str, time_ms: float, ultimate: float, warnings: int):
        """Enregistrer une métrique de performance"""
        if method_id not in self._performance_data:
            self._performance_data[method_id] = {
                "times": [],
                "ultimates": [], 
                "warnings": []
            }
        
        self._performance_data[method_id]["times"].append(time_ms)
        self._performance_data[method_id]["ultimates"].append(ultimate)
        self._performance_data[method_id]["warnings"].append(warnings)

# ============================================================================
# Cache intelligent
# ============================================================================

from functools import lru_cache
from hashlib import md5
import pickle

class ActuarialCache:
    """Cache intelligent pour les calculs actuariels"""
    
    def __init__(self, config: ActuarialConfig):
        self.config = config
        self.enabled = config.enable_cache
        self._cache = {}
        self._access_times = {}
        self._logger = ActuarialLogger("cache", config)
        
        if not self.enabled:
            self._logger.info("Cache désactivé par configuration")
    
    def _generate_key(self, method_id: str, triangle_data: Any, **params) -> str:
        """Générer une clé de cache unique"""
        # Créer un hash des données et paramètres
        data_str = json.dumps(triangle_data, sort_keys=True, default=str)
        params_str = json.dumps(params, sort_keys=True, default=str)
        combined = f"{method_id}:{data_str}:{params_str}"
        
        return md5(combined.encode()).hexdigest()
    
    def get(self, method_id: str, triangle_data: Any, **params) -> Optional[Any]:
        """Récupérer du cache"""
        if not self.enabled:
            return None
        
        key = self._generate_key(method_id, triangle_data, **params)
        
        if key in self._cache:
            # Vérifier l'expiration
            cached_item = self._cache[key]
            if datetime.now() - cached_item["timestamp"] < timedelta(seconds=self.config.cache_ttl_seconds):
                self._access_times[key] = datetime.now()
                self._logger.debug(f"🎯 Cache hit: {method_id}", key=key[:8])
                return cached_item["result"]
            else:
                # Expiration
                del self._cache[key]
                if key in self._access_times:
                    del self._access_times[key]
                self._logger.debug(f"⏰ Cache expired: {method_id}", key=key[:8])
        
        self._logger.debug(f"💥 Cache miss: {method_id}", key=key[:8])
        return None
    
    def set(self, method_id: str, triangle_data: Any, result: Any, **params):
        """Stocker en cache"""
        if not self.enabled:
            return
        
        # Vérifier la taille du cache
        if len(self._cache) >= self.config.cache_max_size:
            self._evict_oldest()
        
        key = self._generate_key(method_id, triangle_data, **params)
        
        self._cache[key] = {
            "result": result,
            "timestamp": datetime.now(),
            "method_id": method_id
        }
        self._access_times[key] = datetime.now()
        
        self._logger.debug(f"💾 Cache set: {method_id}", key=key[:8])
    
    def _evict_oldest(self):
        """Éviction du plus ancien élément"""
        if not self._access_times:
            return
        
        oldest_key = min(self._access_times.keys(), key=lambda k: self._access_times[k])
        
        if oldest_key in self._cache:
            method_id = self._cache[oldest_key]["method_id"]
            del self._cache[oldest_key]
            self._logger.debug(f"🗑️ Cache eviction: {method_id}", key=oldest_key[:8])
        
        if oldest_key in self._access_times:
            del self._access_times[oldest_key]
    
    def clear(self):
        """Vider le cache"""
        self._cache.clear()
        self._access_times.clear()
        self._logger.info("🧹 Cache vidé")
    
    def get_stats(self) -> Dict[str, Any]:
        """Obtenir les statistiques du cache"""
        return {
            "enabled": self.enabled,
            "size": len(self._cache),
            "max_size": self.config.cache_max_size,
            "ttl_seconds": self.config.cache_ttl_seconds,
            "oldest_entry": min(
                (item["timestamp"] for item in self._cache.values()),
                default=None
            ),
            "newest_entry": max(
                (item["timestamp"] for item in self._cache.values()),
                default=None
            )
        }

# Instance globale de cache
cache = ActuarialCache(config)

# ============================================================================
# Décorateurs pour logging et cache
# ============================================================================

def log_calculation(logger_name: str = "method"):
    """Décorateur pour logger automatiquement les calculs"""
    def decorator(func):
        @wraps(func)
        def wrapper(self, triangle_data, **kwargs):
            logger = ActuarialLogger(logger_name, config)
            
            # Calculer la taille du triangle
            triangle_size = (
                len(triangle_data.data), 
                max(len(row) for row in triangle_data.data) if triangle_data.data else 0
            )
            
            # Log début
            logger.log_calculation_start(self.method_id, triangle_size, **kwargs)
            
            try:
                start_time = time.time()
                result = func(self, triangle_data, **kwargs)
                end_time = time.time()
                
                calculation_time_ms = (end_time - start_time) * 1000
                warnings_count = len(result.warnings) if hasattr(result, 'warnings') else 0
                
                # Log fin
                logger.log_calculation_end(
                    self.method_id, 
                    result.ultimate_total if hasattr(result, 'ultimate_total') else 0, 
                    calculation_time_ms, 
                    warnings_count
                )
                
                return result
                
            except Exception as e:
                logger.log_calculation_error(self.method_id, e, triangle_size=triangle_size)
                raise
        
        return wrapper
    return decorator

def cached_calculation(cache_instance: ActuarialCache = None):
    """Décorateur pour cache automatique des calculs"""
    if cache_instance is None:
        cache_instance = cache
    
    def decorator(func):
        @wraps(func)
        def wrapper(self, triangle_data, **kwargs):
            # Tentative de récupération depuis le cache
            cached_result = cache_instance.get(self.method_id, triangle_data.data, **kwargs)
            if cached_result is not None:
                return cached_result
            
            # Calcul si pas en cache
            result = func(self, triangle_data, **kwargs)
            
            # Stockage en cache
            cache_instance.set(self.method_id, triangle_data.data, result, **kwargs)
            
            return result
        
        return wrapper
    return decorator

def performance_monitor(timeout_seconds: Optional[int] = None):
    """Décorateur pour monitoring des performances"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            logger = ActuarialLogger("performance", config)
            
            timeout = timeout_seconds or config.max_calculation_time
            
            start_time = time.time()
            start_memory = _get_memory_usage()
            
            try:
                result = func(*args, **kwargs)
                
                end_time = time.time()
                end_memory = _get_memory_usage()
                
                duration = end_time - start_time
                memory_delta = end_memory - start_memory
                
                # Vérifier le timeout
                if duration > timeout:
                    logger.warning(
                        f"⏰ Calcul lent détecté",
                        function=func.__name__,
                        duration_s=f"{duration:.3f}",
                        timeout_s=timeout
                    )
                
                # Logger les métriques
                if config.enable_performance_logging:
                    logger.debug(
                        f"📊 Métriques performance",
                        function=func.__name__,
                        duration_ms=f"{duration * 1000:.3f}",
                        memory_delta_mb=f"{memory_delta:.2f}"
                    )
                
                return result
                
            except Exception as e:
                end_time = time.time()
                logger.error(
                    f"💥 Erreur performance",
                    function=func.__name__,
                    duration_s=f"{end_time - start_time:.3f}",
                    error=str(e)
                )
                raise
        
        return wrapper
    return decorator

def _get_memory_usage() -> float:
    """Obtenir l'usage mémoire actuel en MB"""
    try:
        import psutil
        process = psutil.Process()
        return process.memory_info().rss / 1024 / 1024  # MB
    except ImportError:
        return 0.0  # psutil pas disponible

# ============================================================================
# Factory pour logger et configuration
# ============================================================================

def get_logger(name: str) -> ActuarialLogger:
    """Factory pour obtenir un logger configuré"""
    return ActuarialLogger(name, config)

def update_config(new_config: Dict[str, Any]):
    """Mettre à jour la configuration globale"""
    global config
    
    for key, value in new_config.items():
        if hasattr(config, key):
            setattr(config, key, value)

def reload_config_from_file(config_file: str):
    """Recharger la configuration depuis un fichier"""
    global config
    config = ActuarialConfig.from_file(config_file)

# ============================================================================
# Configuration par défaut pour différents environnements
# ============================================================================

DEFAULT_CONFIGS = {
    Environment.DEVELOPMENT: {
        "debug": True,
        "log_level": "DEBUG",
        "enable_cache": True,
        "cache_ttl_seconds": 600,  # 10 minutes
        "strict_validation": False,
        "ml_default_timeout": 60,  # 1 minute
        "enable_performance_logging": True
    },
    
    Environment.TESTING: {
        "debug": True,
        "log_level": "WARNING",
        "enable_cache": False,  # Pas de cache en test
        "strict_validation": True,
        "ml_default_timeout": 30,  # 30 secondes
        "enable_performance_logging": False
    },
    
    Environment.STAGING: {
        "debug": False,
        "log_level": "INFO", 
        "enable_cache": True,
        "cache_ttl_seconds": 1800,  # 30 minutes
        "strict_validation": True,
        "ml_default_timeout": 180,  # 3 minutes
        "enable_performance_logging": True
    },
    
    Environment.PRODUCTION: {
        "debug": False,
        "log_level": "WARNING",
        "enable_cache": True,
        "cache_ttl_seconds": 3600,  # 1 heure
        "strict_validation": True,
        "ml_default_timeout": 300,  # 5 minutes
        "enable_performance_logging": True,
        "enable_audit_log": True
    }
}

def setup_environment_config(env: Environment) -> ActuarialConfig:
    """Configurer selon l'environnement"""
    base_config = ActuarialConfig()
    env_overrides = DEFAULT_CONFIGS.get(env, {})
    
    for key, value in env_overrides.items():
        setattr(base_config, key, value)
    
    base_config.environment = env
    return base_config

# ============================================================================
# Exemple de fichier de configuration JSON
# ============================================================================

EXAMPLE_CONFIG_JSON = """
{
  "environment": "production",
  "debug": false,
  "log_level": "INFO",
  "log_file": "/var/log/actuarial/methods.log",
  "enable_cache": true,
  "cache_ttl_seconds": 3600,
  "cache_max_size": 1000,
  "ml_default_timeout": 300,
  "ml_max_iterations": {
    "gradient_boosting": 100,
    "neural_network": 50,
    "random_forest": 200
  },
  "ml_early_stopping": true,
  "strict_validation": true,
  "allow_negative_reserves": false,
  "min_triangle_size": 3,
  "max_triangle_size": 25,
  "max_calculation_time": 600,
  "enable_parallel_processing": true,
  "default_export_format": "json",
  "max_triangle_value": 1000000000000,
  "enable_audit_log": true
}
"""

def create_example_config_file(filename: str = "actuarial_config.json"):
    """Créer un fichier de configuration d'exemple"""
    with open(filename, 'w') as f:
        f.write(EXAMPLE_CONFIG_JSON)
    print(f"📄 Fichier de configuration d'exemple créé: {filename}")

# ============================================================================
# Initialisation automatique
# ============================================================================

# Logger principal du système
main_logger = get_logger("main")

# Log de démarrage
main_logger.info(
    f"🚀 Système actuariel initialisé",
    environment=config.environment.value,
    debug=config.debug,
    cache_enabled=config.enable_cache,
    log_level=config.log_level
)

if config.is_development():
    main_logger.debug("🔧 Mode développement activé")
elif config.is_production():
    main_logger.info("🏭 Mode production activé")