"""
Configuration de la base de données PostgreSQL
Gestion des connexions, sessions et métadonnées SQLAlchemy
Version améliorée pour le système actuariel
"""

from sqlalchemy import create_engine, MetaData, event, text, inspect
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import QueuePool, NullPool
from sqlalchemy.engine import Engine
from sqlalchemy.exc import OperationalError, DatabaseError
import sqlite3
import logging
import time
import json
from typing import Generator, Dict, Any, Optional, List
from contextlib import contextmanager
from datetime import datetime, timedelta
import asyncio
from functools import wraps

from app.core.config import settings

# Configuration du logging
logger = logging.getLogger(__name__)

# ================================
# ENGINE CONFIGURATION
# ================================

# Configuration des paramètres de connexion
def get_engine_kwargs() -> dict:
    """
    Retourne la configuration du moteur selon l'environnement
    """
    base_kwargs = {
        "pool_pre_ping": True,  # Validation des connexions
        "echo": settings.LOG_SQL_QUERIES,  # Logging des requêtes SQL
        "echo_pool": settings.DEBUG,  # Logging du pool de connexions
        "future": True,  # SQLAlchemy 2.0 style
    }
    
    # Configuration spécifique pour production
    if settings.ENVIRONMENT == "production":
        base_kwargs.update({
            "poolclass": QueuePool,
            "pool_size": settings.DB_POOL_SIZE,
            "max_overflow": settings.DB_MAX_OVERFLOW,
            "pool_timeout": settings.DB_POOL_TIMEOUT,
            "pool_recycle": settings.DB_POOL_RECYCLE,
            "connect_args": {
                "connect_timeout": 10,
                "application_name": "actuarial_provisioning",
                "options": "-c statement_timeout=30000"  # 30 secondes max par requête
            }
        })
    # Configuration pour tests
    elif settings.TESTING:
        base_kwargs.update({
            "poolclass": NullPool,  # Pas de pool pour les tests
            "connect_args": {"check_same_thread": False} if "sqlite" in str(settings.TEST_DATABASE_URL) else {}
        })
    # Configuration développement
    else:
        base_kwargs.update({
            "poolclass": QueuePool,
            "pool_size": 5,
            "max_overflow": 10,
            "pool_timeout": 30,
            "pool_recycle": 1800,
        })
    
    return base_kwargs

# Création de l'engine
engine_kwargs = get_engine_kwargs()

if settings.TESTING and settings.TEST_DATABASE_URL:
    engine = create_engine(settings.TEST_DATABASE_URL, **engine_kwargs)
    logger.info("🧪 Configuration base de données de test")
else:
    engine = create_engine(str(settings.SQLALCHEMY_DATABASE_URI), **engine_kwargs)
    logger.info("📊 Configuration base de données principale")

# ================================
# SESSION CONFIGURATION
# ================================

# Factory pour créer des sessions
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    future=True,
    expire_on_commit=False  # Important pour les calculs longs
)

# ================================
# METADATA & BASE
# ================================

# Convention de nommage pour les contraintes
naming_convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s"
}

metadata = MetaData(naming_convention=naming_convention)

# Classe de base pour tous les modèles
Base = declarative_base(metadata=metadata)

# ================================
# DATABASE EVENTS & MONITORING
# ================================

# Stockage des métriques de requêtes
query_metrics = {
    "total_queries": 0,
    "slow_queries": [],
    "errors": [],
    "by_table": {}
}

@event.listens_for(Engine, "connect")
def set_database_pragma(dbapi_connection, connection_record):
    """
    Configuration à la connexion selon le type de base
    """
    # SQLite pour les tests
    if isinstance(dbapi_connection, sqlite3.Connection):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA cache_size=10000")
        cursor.close()
    
    # PostgreSQL
    elif hasattr(dbapi_connection, 'set_client_encoding'):
        with dbapi_connection.cursor() as cursor:
            # Configuration pour les calculs actuariels
            cursor.execute("SET work_mem = '256MB'")  # Plus de mémoire pour les calculs
            cursor.execute("SET maintenance_work_mem = '512MB'")
            cursor.execute("SET random_page_cost = 1.1")  # Optimisation SSD
            
            # Configuration pour JSONB
            cursor.execute("SET enable_seqscan = off")  # Forcer l'utilisation des index
            
            # Timeout pour éviter les blocages
            if settings.ENVIRONMENT == "production":
                cursor.execute("SET statement_timeout = '30s'")
                cursor.execute("SET lock_timeout = '10s'")

@event.listens_for(Engine, "before_cursor_execute")
def receive_before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    """
    Monitoring avant exécution des requêtes
    """
    context._query_start_time = time.time()
    
    # Extraction du nom de la table principale
    table_name = "unknown"
    statement_lower = statement.lower()
    for keyword in ["from", "into", "update"]:
        if keyword in statement_lower:
            parts = statement_lower.split(keyword)
            if len(parts) > 1:
                table_name = parts[1].strip().split()[0].replace('"', '')
                break
    
    context._table_name = table_name
    query_metrics["total_queries"] += 1
    
    if settings.DEBUG and settings.LOG_SQL_QUERIES:
        logger.debug(f"📊 SQL Query on {table_name}: {statement[:200]}...")
        if parameters:
            logger.debug(f"Parameters: {parameters}")

@event.listens_for(Engine, "after_cursor_execute")
def receive_after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    """
    Monitoring après exécution des requêtes
    """
    if hasattr(context, '_query_start_time'):
        duration = time.time() - context._query_start_time
        table_name = getattr(context, '_table_name', 'unknown')
        
        # Mise à jour des métriques par table
        if table_name not in query_metrics["by_table"]:
            query_metrics["by_table"][table_name] = {
                "count": 0,
                "total_time": 0,
                "avg_time": 0
            }
        
        query_metrics["by_table"][table_name]["count"] += 1
        query_metrics["by_table"][table_name]["total_time"] += duration
        query_metrics["by_table"][table_name]["avg_time"] = (
            query_metrics["by_table"][table_name]["total_time"] /
            query_metrics["by_table"][table_name]["count"]
        )
        
        # Log des requêtes lentes
        if duration > 1.0:
            slow_query = {
                "statement": statement[:500],
                "duration": round(duration, 3),
                "table": table_name,
                "timestamp": datetime.utcnow().isoformat()
            }
            query_metrics["slow_queries"].append(slow_query)
            
            # Garder seulement les 50 dernières requêtes lentes
            if len(query_metrics["slow_queries"]) > 50:
                query_metrics["slow_queries"].pop(0)
            
            logger.warning(f"⚠️ Slow query on {table_name}: {duration:.2f}s")

@event.listens_for(Engine, "handle_error")
def receive_handle_error(exception_context):
    """
    Gestion centralisée des erreurs DB
    """
    error_info = {
        "error": str(exception_context.original_exception),
        "statement": str(exception_context.statement)[:500] if exception_context.statement else None,
        "timestamp": datetime.utcnow().isoformat()
    }
    
    query_metrics["errors"].append(error_info)
    
    # Garder seulement les 20 dernières erreurs
    if len(query_metrics["errors"]) > 20:
        query_metrics["errors"].pop(0)
    
    logger.error(f"❌ Database error: {error_info['error']}")

# ================================
# SESSION MANAGEMENT
# ================================

def get_db() -> Generator[Session, None, None]:
    """
    Générateur de session de base de données
    Utilisé comme dépendance FastAPI
    """
    db = SessionLocal()
    try:
        yield db
    except Exception as e:
        logger.error(f"❌ Erreur session DB: {e}")
        db.rollback()
        raise
    finally:
        db.close()

async def get_db_async() -> Generator[Session, None, None]:
    """
    Version asynchrone du générateur de session
    """
    db = SessionLocal()
    try:
        yield db
    except Exception as e:
        logger.error(f"❌ Erreur session DB async: {e}")
        await asyncio.get_event_loop().run_in_executor(None, db.rollback)
        raise
    finally:
        await asyncio.get_event_loop().run_in_executor(None, db.close)

@contextmanager
def db_transaction():
    """
    Context manager pour les transactions avec retry automatique
    """
    max_retries = 3
    retry_count = 0
    
    while retry_count < max_retries:
        db = SessionLocal()
        try:
            logger.debug("🔄 Début transaction")
            yield db
            db.commit()
            logger.debug("✅ Transaction committée")
            return
        except OperationalError as e:
            logger.warning(f"⚠️ Erreur opérationnelle, retry {retry_count + 1}/{max_retries}: {e}")
            db.rollback()
            retry_count += 1
            if retry_count >= max_retries:
                raise
            time.sleep(0.5 * retry_count)  # Backoff exponentiel
        except Exception as e:
            logger.error(f"❌ Erreur transaction: {e}")
            db.rollback()
            raise
        finally:
            db.close()

# ================================
# DATABASE MANAGER ACTUARIEL
# ================================

class ActuarialDatabaseManager:
    """
    Gestionnaire de base de données spécialisé pour l'actuariat
    """
    
    @staticmethod
    def create_all_tables():
        """Crée toutes les tables avec les extensions PostgreSQL nécessaires"""
        try:
            with engine.begin() as conn:
                # Extensions PostgreSQL pour l'actuariat
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS 'uuid-ossp'"))
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS 'pgcrypto'"))
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS 'pg_trgm'"))
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS 'tablefunc'"))  # Pour les crosstab
                
                # Création des schémas
                conn.execute(text("CREATE SCHEMA IF NOT EXISTS actuarial"))
                conn.execute(text("CREATE SCHEMA IF NOT EXISTS audit"))
                conn.execute(text("CREATE SCHEMA IF NOT EXISTS compliance"))
                
            Base.metadata.create_all(bind=engine)
            logger.info("✅ Tables et schémas créés avec succès")
        except Exception as e:
            logger.error(f"❌ Erreur création tables: {e}")
            raise
    
    @staticmethod
    def get_triangle_statistics(triangle_id: int) -> Dict[str, Any]:
        """
        Calcule les statistiques d'un triangle directement en SQL
        """
        with engine.begin() as conn:
            result = conn.execute(text("""
                SELECT 
                    jsonb_array_length(data->'values') as size,
                    jsonb_extract_path_text(metadata, 'statistics', 'total') as total,
                    jsonb_extract_path_text(metadata, 'statistics', 'completeness') as completeness,
                    created_at,
                    updated_at
                FROM triangles 
                WHERE id = :triangle_id
            """), {"triangle_id": triangle_id})
            
            row = result.fetchone()
            if row:
                return {
                    "size": row.size,
                    "total": float(row.total) if row.total else 0,
                    "completeness": float(row.completeness) if row.completeness else 0,
                    "created_at": row.created_at,
                    "updated_at": row.updated_at
                }
            return {}
    
    @staticmethod
    def get_user_activity_report(user_id: int, days: int = 30) -> Dict[str, Any]:
        """
        Rapport d'activité utilisateur pour les X derniers jours
        """
        with engine.begin() as conn:
            since_date = datetime.utcnow() - timedelta(days=days)
            
            # Statistiques des triangles
            triangles_stats = conn.execute(text("""
                SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN created_at > :since_date THEN 1 END) as recent,
                    AVG(jsonb_array_length(data->'values')) as avg_size
                FROM triangles 
                WHERE user_id = :user_id AND deleted_at IS NULL
            """), {"user_id": user_id, "since_date": since_date}).fetchone()
            
            # Statistiques des calculs
            calculations_stats = conn.execute(text("""
                SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
                    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
                    AVG(calculation_time_ms) as avg_time_ms
                FROM calculations 
                WHERE user_id = :user_id AND created_at > :since_date
            """), {"user_id": user_id, "since_date": since_date}).fetchone()
            
            # Méthodes les plus utilisées
            top_methods = conn.execute(text("""
                SELECT method, COUNT(*) as count
                FROM calculations 
                WHERE user_id = :user_id
                GROUP BY method
                ORDER BY count DESC
                LIMIT 5
            """), {"user_id": user_id}).fetchall()
            
            return {
                "period_days": days,
                "triangles": {
                    "total": triangles_stats.total,
                    "recent": triangles_stats.recent,
                    "average_size": float(triangles_stats.avg_size) if triangles_stats.avg_size else 0
                },
                "calculations": {
                    "total": calculations_stats.total,
                    "completed": calculations_stats.completed,
                    "failed": calculations_stats.failed,
                    "average_time_ms": float(calculations_stats.avg_time_ms) if calculations_stats.avg_time_ms else 0
                },
                "top_methods": [{"method": m.method, "count": m.count} for m in top_methods]
            }
    
    @staticmethod
    def cleanup_old_data(days_to_keep: int = 90):
        """
        Nettoie les anciennes données (audit logs, calculs expirés, etc.)
        """
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=days_to_keep)
            
            with engine.begin() as conn:
                # Supprimer les calculs expirés
                deleted_calcs = conn.execute(text("""
                    DELETE FROM calculations 
                    WHERE expires_at < :cutoff_date
                    RETURNING id
                """), {"cutoff_date": cutoff_date})
                
                calc_count = deleted_calcs.rowcount
                
                # Supprimer les vieilles notifications lues
                deleted_notifs = conn.execute(text("""
                    DELETE FROM notifications 
                    WHERE is_read = true AND created_at < :cutoff_date
                    RETURNING id
                """), {"cutoff_date": cutoff_date})
                
                notif_count = deleted_notifs.rowcount
                
                # Archiver les vieux audit logs
                conn.execute(text("""
                    INSERT INTO audit.audit_logs_archive 
                    SELECT * FROM audit.audit_logs 
                    WHERE created_at < :cutoff_date
                """), {"cutoff_date": cutoff_date})
                
                logger.info(f"✅ Nettoyage terminé: {calc_count} calculs, {notif_count} notifications")
                
                return {
                    "calculations_deleted": calc_count,
                    "notifications_deleted": notif_count,
                    "cutoff_date": cutoff_date.isoformat()
                }
                
        except Exception as e:
            logger.error(f"❌ Erreur nettoyage: {e}")
            raise
    
    @staticmethod
    def optimize_tables():
        """
        Optimise les tables PostgreSQL (VACUUM, ANALYZE, REINDEX)
        """
        try:
            with engine.begin() as conn:
                # Liste des tables principales à optimiser
                tables = ['users', 'triangles', 'calculations', 'method_comparisons']
                
                for table in tables:
                    logger.info(f"🔧 Optimisation table {table}...")
                    
                    # VACUUM et ANALYZE
                    conn.execute(text(f"VACUUM ANALYZE {table}"))
                    
                    # REINDEX pour les tables avec JSONB
                    if table in ['triangles', 'calculations']:
                        conn.execute(text(f"REINDEX TABLE {table}"))
                
                # Mise à jour des statistiques
                conn.execute(text("ANALYZE"))
                
                logger.info("✅ Optimisation terminée")
                
        except Exception as e:
            logger.error(f"❌ Erreur optimisation: {e}")
            raise

# ================================
# HEALTH CHECK & MONITORING
# ================================

def health_check_db() -> Dict[str, Any]:
    """
    Health check complet avec métriques actuarielles
    """
    start_time = time.time()
    
    try:
        with engine.begin() as conn:
            # Test de connexion
            conn.execute(text("SELECT 1"))
            
            # Statistiques générales
            stats = conn.execute(text("""
                SELECT 
                    (SELECT COUNT(*) FROM users WHERE is_active = true) as active_users,
                    (SELECT COUNT(*) FROM triangles WHERE deleted_at IS NULL) as total_triangles,
                    (SELECT COUNT(*) FROM calculations WHERE status = 'processing') as running_calculations,
                    (SELECT COUNT(*) FROM calculations WHERE created_at > NOW() - INTERVAL '1 hour') as recent_calculations
            """)).fetchone()
            
            # Taille de la base
            if "postgresql" in str(settings.SQLALCHEMY_DATABASE_URI):
                db_size = conn.execute(text("""
                    SELECT pg_size_pretty(pg_database_size(current_database())) as size,
                           pg_size_pretty(pg_total_relation_size('triangles')) as triangles_size,
                           pg_size_pretty(pg_total_relation_size('calculations')) as calculations_size
                """)).fetchone()
                
                size_info = {
                    "total": db_size.size,
                    "triangles_table": db_size.triangles_size,
                    "calculations_table": db_size.calculations_size
                }
            else:
                size_info = {"total": "N/A"}
            
            response_time = (time.time() - start_time) * 1000
            
            return {
                "status": "healthy",
                "response_time_ms": round(response_time, 2),
                "database": {
                    "connected": True,
                    "size": size_info,
                    "pool": {
                        "size": engine.pool.size(),
                        "checked_in": engine.pool.checkedin(),
                        "checked_out": engine.pool.checkedout(),
                        "overflow": engine.pool.overflow(),
                        "total": engine.pool.size() + engine.pool.overflow()
                    }
                },
                "statistics": {
                    "active_users": stats.active_users,
                    "total_triangles": stats.total_triangles,
                    "running_calculations": stats.running_calculations,
                    "recent_calculations": stats.recent_calculations
                },
                "query_metrics": {
                    "total_queries": query_metrics["total_queries"],
                    "slow_queries_count": len(query_metrics["slow_queries"]),
                    "recent_errors": len(query_metrics["errors"]),
                    "tables_accessed": list(query_metrics["by_table"].keys())
                }
            }
            
    except Exception as e:
        logger.error(f"❌ Health check failed: {e}")
        return {
            "status": "unhealthy",
            "error": str(e),
            "response_time_ms": (time.time() - start_time) * 1000
        }

def get_performance_metrics() -> Dict[str, Any]:
    """
    Métriques de performance détaillées
    """
    # Top 5 tables par nombre de requêtes
    top_tables = sorted(
        query_metrics["by_table"].items(),
        key=lambda x: x[1]["count"],
        reverse=True
    )[:5]
    
    # Top 5 requêtes lentes
    recent_slow = query_metrics["slow_queries"][-5:] if query_metrics["slow_queries"] else []
    
    return {
        "summary": {
            "total_queries": query_metrics["total_queries"],
            "slow_queries": len(query_metrics["slow_queries"]),
            "errors": len(query_metrics["errors"])
        },
        "top_tables": [
            {
                "table": table,
                "queries": stats["count"],
                "avg_time_ms": round(stats["avg_time"] * 1000, 2)
            }
            for table, stats in top_tables
        ],
        "recent_slow_queries": recent_slow,
        "recent_errors": query_metrics["errors"][-5:] if query_metrics["errors"] else []
    }

# ================================
# BACKUP & RESTORE UTILITIES
# ================================

class BackupManager:
    """
    Gestionnaire de sauvegarde pour PostgreSQL
    """
    
    @staticmethod
    def create_backup(backup_name: str = None) -> str:
        """
        Crée une sauvegarde de la base
        """
        if not backup_name:
            backup_name = f"backup_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
        
        # Commande pg_dump (à adapter selon votre configuration)
        # Cette méthode nécessite pg_dump installé et configuré
        
        logger.info(f"📦 Création backup: {backup_name}")
        # Implementation selon votre infrastructure
        
        return backup_name
    
    @staticmethod
    def list_backups() -> List[str]:
        """
        Liste les sauvegardes disponibles
        """
        # Implementation selon votre infrastructure
        return []

# ================================
# EXPORTS
# ================================

# Instance du gestionnaire DB actuariel
db_manager = ActuarialDatabaseManager()

# Instance du gestionnaire de backup
backup_manager = BackupManager()

# Export des principales fonctions et classes
__all__ = [
    "engine",
    "SessionLocal",
    "Base",
    "get_db",
    "get_db_async",
    "db_transaction",
    "db_manager",
    "health_check_db",
    "get_performance_metrics",
    "query_metrics",
    "backup_manager"
]
