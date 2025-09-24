"""
Configuration de la base de données PostgreSQL
Gestion des connexions, sessions et métadonnées SQLAlchemy
Version robuste pour le simulateur actuariel
"""

from sqlalchemy import create_engine, MetaData, event, text, inspect
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import QueuePool, NullPool
from sqlalchemy.engine import Engine
from sqlalchemy.exc import OperationalError
import sqlite3
import logging
import time
from typing import Generator, Dict, Any, Optional, List
from contextlib import contextmanager
from datetime import datetime, timedelta
import asyncio

from app.core.config import settings

# ================================
# LOGGING
# ================================
logger = logging.getLogger(__name__)

# ================================
# ENGINE CONFIGURATION
# ================================

def get_engine_kwargs() -> dict:
    """
    Retourne la configuration du moteur selon l'environnement
    """
    base_kwargs = {
        "pool_pre_ping": True,                     # Validation des connexions
        "echo": settings.LOG_SQL_QUERIES,          # Logging des requêtes SQL
        "echo_pool": settings.DEBUG,               # Logging du pool
        "future": True,                            # API 2.0
    }

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
                "options": "-c statement_timeout=30000"
            }
        })
    elif settings.TESTING:
        base_kwargs.update({
            "poolclass": NullPool,  # pas de pool en test
            "connect_args": {"check_same_thread": False} if "sqlite" in str(settings.TEST_DATABASE_URL) else {}
        })
    else:
        base_kwargs.update({
            "poolclass": QueuePool,
            "pool_size": 5,
            "max_overflow": 10,
            "pool_timeout": 30,
            "pool_recycle": 1800,
        })

    return base_kwargs


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

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    future=True,
    expire_on_commit=False,  # Important pour les calculs longs
)

# ================================
# METADATA & BASE
# ================================

naming_convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}
metadata = MetaData(naming_convention=naming_convention)
Base = declarative_base(metadata=metadata)

# ================================
# DATABASE EVENTS & MONITORING
# ================================

query_metrics: Dict[str, Any] = {
    "total_queries": 0,
    "slow_queries": [],
    "errors": [],
    "by_table": {},
}

@event.listens_for(Engine, "connect")
def set_database_pragma(dbapi_connection, connection_record):
    """Configuration par SGBD à l'ouverture de connexion."""
    # SQLite (tests)
    if isinstance(dbapi_connection, sqlite3.Connection):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA cache_size=10000")
        cursor.close()
        return

    # PostgreSQL
    if hasattr(dbapi_connection, "set_client_encoding"):
        with dbapi_connection.cursor() as cursor:
            # Mémoire pour opérations volumineuses (ajustez si nécessaire)
            cursor.execute("SET work_mem = '256MB'")
            cursor.execute("SET maintenance_work_mem = '512MB'")
            cursor.execute("SET random_page_cost = 1.1")
            # Désactiver seqscan seulement en debug (sinon peut dégrader)
            if settings.DEBUG:
                cursor.execute("SET enable_seqscan = off")
            # Timeouts en prod
            if settings.ENVIRONMENT == "production":
                cursor.execute("SET statement_timeout = '30s'")
                cursor.execute("SET lock_timeout = '10s'")


@event.listens_for(Engine, "before_cursor_execute")
def receive_before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    """Monitoring avant exécution des requêtes."""
    context._query_start_time = time.time()
    table_name = "unknown"
    stmt = statement.lower()
    for kw in (" from ", " into ", " update "):
        if kw in stmt:
            try:
                # naïf mais suffisant pour monitoring
                after = stmt.split(kw, 1)[1].strip()
                table_name = after.replace('"', "").split()[0]
            except Exception:
                table_name = "unknown"
            break
    context._table_name = table_name
    query_metrics["total_queries"] += 1

    if settings.DEBUG and settings.LOG_SQL_QUERIES:
        logger.debug(f"📊 SQL on {table_name}: {statement[:200]}...")
        if parameters:
            logger.debug(f"Parameters: {parameters}")


@event.listens_for(Engine, "after_cursor_execute")
def receive_after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    """Monitoring après exécution des requêtes."""
    if hasattr(context, "_query_start_time"):
        duration = time.time() - context._query_start_time
        table_name = getattr(context, "_table_name", "unknown")

        # stats par table
        tstat = query_metrics["by_table"].setdefault(table_name, {"count": 0, "total_time": 0.0, "avg_time": 0.0})
        tstat["count"] += 1
        tstat["total_time"] += duration
        tstat["avg_time"] = tstat["total_time"] / tstat["count"]

        # requêtes lentes
        if duration > 1.0:
            slow_query = {
                "statement": statement[:500],
                "duration": round(duration, 3),
                "table": table_name,
                "timestamp": datetime.utcnow().isoformat(),
            }
            query_metrics["slow_queries"].append(slow_query)
            if len(query_metrics["slow_queries"]) > 50:
                query_metrics["slow_queries"].pop(0)
            logger.warning(f"⚠️ Slow query on {table_name}: {duration:.2f}s")


@event.listens_for(Engine, "handle_error")
def receive_handle_error(exception_context):
    """Gestion centralisée des erreurs DB."""
    error_info = {
        "error": str(exception_context.original_exception),
        "statement": (exception_context.statement[:500] if exception_context.statement else None),
        "timestamp": datetime.utcnow().isoformat(),
    }
    query_metrics["errors"].append(error_info)
    if len(query_metrics["errors"]) > 20:
        query_metrics["errors"].pop(0)
    logger.error(f"❌ Database error: {error_info['error']}")

# ================================
# SESSION MANAGEMENT
# ================================

def get_db() -> Generator[Session, None, None]:
    """Dépendance FastAPI : session DB."""
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
    """Version async (si besoin)."""
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
    """Context manager transactionnel avec retry auto (OperationalError)."""
    max_retries = 3
    retry = 0
    while retry < max_retries:
        db = SessionLocal()
        try:
            logger.debug("🔄 Début transaction")
            yield db
            db.commit()
            logger.debug("✅ Transaction committée")
            return
        except OperationalError as e:
            retry += 1
            logger.warning(f"⚠️ OperationalError, retry {retry}/{max_retries}: {e}")
            db.rollback()
            if retry >= max_retries:
                raise
            time.sleep(0.5 * retry)
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
    """Gestionnaire spécialisé pour l'actuariat."""

    @staticmethod
    def create_all_tables():
        """Crée tables/schémas + extensions PostgreSQL nécessaires."""
        try:
            with engine.begin() as conn:
                # ⚠️ Extensions: guillemets doubles pour uuid-ossp/pgcrypto/pg_trgm/tablefunc
                conn.execute(text('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'))
                conn.execute(text('CREATE EXTENSION IF NOT EXISTS "pgcrypto"'))
                conn.execute(text('CREATE EXTENSION IF NOT EXISTS "pg_trgm"'))
                conn.execute(text('CREATE EXTENSION IF NOT EXISTS "tablefunc"'))
                # Schémas
                conn.execute(text("CREATE SCHEMA IF NOT EXISTS actuarial"))
                conn.execute(text("CREATE SCHEMA IF NOT EXISTS audit"))
                conn.execute(text("CREATE SCHEMA IF NOT EXISTS compliance"))
            Base.metadata.create_all(bind=engine)
            logger.info("✅ Tables et schémas créés avec succès")
        except Exception as e:
            logger.error(f"❌ Erreur création tables: {e}", exc_info=True)
            raise

    @staticmethod
    def get_triangle_statistics(triangle_id: int) -> Dict[str, Any]:
        """Statistiques d'un triangle en SQL (adapter les colonnes selon votre modèle)."""
        with engine.begin() as conn:
            result = conn.execute(text("""
                SELECT 
                    jsonb_array_length(data->'values') AS size,
                    jsonb_extract_path_text(metadata, 'statistics', 'total') AS total,
                    jsonb_extract_path_text(metadata, 'statistics', 'completeness') AS completeness,
                    created_at, updated_at
                FROM triangles 
                WHERE id = :triangle_id
            """), {"triangle_id": triangle_id}).mappings().first()

        if result:
            return {
                "size": result.get("size"),
                "total": float(result["total"]) if result.get("total") else 0.0,
                "completeness": float(result["completeness"]) if result.get("completeness") else 0.0,
                "created_at": result.get("created_at"),
                "updated_at": result.get("updated_at"),
            }
        return {}

    @staticmethod
    def get_user_activity_report(user_id: int, days: int = 30) -> Dict[str, Any]:
        """Rapport d'activité utilisateur."""
        since_date = datetime.utcnow() - timedelta(days=days)
        with engine.begin() as conn:
            triangles_stats = conn.execute(text("""
                SELECT 
                    COUNT(*) AS total,
                    COUNT(CASE WHEN created_at > :since_date THEN 1 END) AS recent,
                    AVG(jsonb_array_length(data->'values')) AS avg_size
                FROM triangles 
                WHERE user_id = :user_id AND deleted_at IS NULL
            """), {"user_id": user_id, "since_date": since_date}).mappings().first()

            calculations_stats = conn.execute(text("""
                SELECT 
                    COUNT(*) AS total,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed,
                    COUNT(CASE WHEN status = 'failed' THEN 1 END) AS failed,
                    AVG(calculation_time_ms) AS avg_time_ms
                FROM calculations 
                WHERE user_id = :user_id AND created_at > :since_date
            """), {"user_id": user_id, "since_date": since_date}).mappings().first()

            top_methods = conn.execute(text("""
                SELECT method, COUNT(*) AS count
                FROM calculations 
                WHERE user_id = :user_id
                GROUP BY method
                ORDER BY count DESC
                LIMIT 5
            """), {"user_id": user_id}).mappings().all()

        return {
            "period_days": days,
            "triangles": {
                "total": triangles_stats.get("total", 0),
                "recent": triangles_stats.get("recent", 0),
                "average_size": float(triangles_stats.get("avg_size") or 0.0),
            },
            "calculations": {
                "total": calculations_stats.get("total", 0),
                "completed": calculations_stats.get("completed", 0),
                "failed": calculations_stats.get("failed", 0),
                "average_time_ms": float(calculations_stats.get("avg_time_ms") or 0.0),
            },
            "top_methods": [{"method": m["method"], "count": m["count"]} for m in top_methods],
        }

    @staticmethod
    def cleanup_old_data(days_to_keep: int = 90) -> Dict[str, Any]:
        """Purge des données anciennes (ex: calculs expirés, notifications lues…)."""
        cutoff_date = datetime.utcnow() - timedelta(days=days_to_keep)
        try:
            with engine.begin() as conn:
                deleted_calcs = conn.execute(text("""
                    DELETE FROM calculations 
                    WHERE expires_at < :cutoff_date
                    RETURNING id
                """), {"cutoff_date": cutoff_date})
                calc_count = deleted_calcs.rowcount

                deleted_notifs = conn.execute(text("""
                    DELETE FROM notifications 
                    WHERE is_read = true AND created_at < :cutoff_date
                    RETURNING id
                """), {"cutoff_date": cutoff_date})
                notif_count = deleted_notifs.rowcount

                conn.execute(text("""
                    INSERT INTO audit.audit_logs_archive 
                    SELECT * FROM audit.audit_logs 
                    WHERE created_at < :cutoff_date
                """), {"cutoff_date": cutoff_date})

            logger.info(f"✅ Nettoyage terminé: {calc_count} calculs, {notif_count} notifications")
            return {
                "calculations_deleted": calc_count,
                "notifications_deleted": notif_count,
                "cutoff_date": cutoff_date.isoformat(),
            }
        except Exception as e:
            logger.error(f"❌ Erreur nettoyage: {e}", exc_info=True)
            raise

    @staticmethod
    def optimize_tables():
        """Maintenance PostgreSQL : VACUUM/ANALYZE/REINDEX sur tables clés."""
        try:
            with engine.begin() as conn:
                tables = ["users", "triangles", "calculations", "method_comparisons"]
                for table in tables:
                    logger.info(f"🔧 Optimisation table {table}...")
                    conn.execute(text(f"VACUUM ANALYZE {table}"))
                    if table in ("triangles", "calculations"):
                        conn.execute(text(f"REINDEX TABLE {table}"))
                conn.execute(text("ANALYZE"))
            logger.info("✅ Optimisation terminée")
        except Exception as e:
            logger.error(f"❌ Erreur optimisation: {e}", exc_info=True)
            raise

# ================================
# HEALTH CHECK & METRICS
# ================================

def health_check_db() -> Dict[str, Any]:
    """
    Health check ROBUSTE : ne touche pas aux tables applicatives.
    Les métriques plus lourdes restent accessibles via /api/v1/monitoring/metrics.
    """
    start_time = time.time()
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            server_version = conn.execute(text("SHOW server_version")).scalar()
            in_recovery = None
            if "postgresql" in str(settings.SQLALCHEMY_DATABASE_URI):
                in_recovery = conn.execute(text("SELECT pg_is_in_recovery()")).scalar()

        # Best-effort pour métriques détaillées (ne doit jamais faire échouer)
        metrics = {}
        try:
            metrics = get_performance_metrics()
        except Exception as e:
            logger.warning(f"⚠️ Metrics degraded in health_check: {e}")

        response_time = (time.time() - start_time) * 1000.0
        return {
            "status": "healthy",
            "response_time_ms": round(response_time, 2),
            "database": {
                "connected": True,
                "server_version": server_version,
                "pg_is_in_recovery": bool(in_recovery) if in_recovery is not None else None,
                "pool": {
                    "size": engine.pool.size(),
                    "checked_in": engine.pool.checkedin(),
                    "checked_out": engine.pool.checkedout(),
                    "overflow": engine.pool.overflow(),
                    "total": engine.pool.size() + engine.pool.overflow(),
                },
            },
            "query_metrics": {
                "total_queries": query_metrics["total_queries"],
                "slow_queries_count": len(query_metrics["slow_queries"]),
                "recent_errors": len(query_metrics["errors"]),
            },
            "metrics": metrics,
        }
    except Exception as e:
        logger.error(f"❌ Health check failed: {e}", exc_info=True)
        return {
            "status": "unhealthy",
            "error": str(e),
            "response_time_ms": round((time.time() - start_time) * 1000.0, 2),
        }


def get_performance_metrics() -> Dict[str, Any]:
    """Métriques de performance détaillées (best-effort)."""
    top_tables = sorted(
        query_metrics["by_table"].items(), key=lambda x: x[1]["count"], reverse=True
    )[:5]
    recent_slow = query_metrics["slow_queries"][-5:] if query_metrics["slow_queries"] else []

    return {
        "summary": {
            "total_queries": query_metrics["total_queries"],
            "slow_queries": len(query_metrics["slow_queries"]),
            "errors": len(query_metrics["errors"]),
        },
        "top_tables": [
            {
                "table": table,
                "queries": stats["count"],
                "avg_time_ms": round(stats["avg_time"] * 1000, 2),
            }
            for table, stats in top_tables
        ],
        "recent_slow_queries": recent_slow,
        "recent_errors": query_metrics["errors"][-5:] if query_metrics["errors"] else [],
    }

# ================================
# BACKUP (placeholders)
# ================================

class BackupManager:
    """Gestionnaire de sauvegardes (implémentation à adapter à l’infra)."""

    @staticmethod
    def create_backup(backup_name: Optional[str] = None) -> str:
        backup_name = backup_name or f"backup_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
        logger.info(f"📦 Création backup: {backup_name}")
        return backup_name

    @staticmethod
    def list_backups() -> List[str]:
        return []

# ================================
# EXPORTS
# ================================

db_manager = ActuarialDatabaseManager()
backup_manager = BackupManager()

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
    "backup_manager",
]
