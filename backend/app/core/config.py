"""
Configuration centrale de l'application (Pydantic v2)
Gestion des paramètres d'environnement avec pydantic-settings
"""

import secrets
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from pydantic import AnyHttpUrl, EmailStr, HttpUrl, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Configuration principale de l'application
    Utilise Pydantic Settings (v2) pour la validation et le typage
    """

    # ================================
    # APPLICATION SETTINGS
    # ================================
    PROJECT_NAME: str = "Actuarial Provisioning SaaS"
    PROJECT_VERSION: str = "1.0.0"
    PROJECT_DESCRIPTION: str = "Simulateur de provisionnement automatisé pour l'assurance"

    ENVIRONMENT: str = "development"  # development, testing, staging, production
    DEBUG: bool = True

    API_V1_STR: str = "/api/v1"
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    WORKERS_COUNT: int = 1

    # ================================
    # SECURITY SETTINGS
    # ================================
    SECRET_KEY: str = secrets.token_urlsafe(32)

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 jours
    ALGORITHM: str = "HS256"

    PASSWORD_MIN_LENGTH: int = 8
    PASSWORD_REQUIRE_UPPERCASE: bool = True
    PASSWORD_REQUIRE_LOWERCASE: bool = True
    PASSWORD_REQUIRE_DIGITS: bool = True
    PASSWORD_REQUIRE_SPECIAL: bool = True

    SESSION_TIMEOUT_MINUTES: int = 60
    MAX_LOGIN_ATTEMPTS: int = 5
    LOGIN_LOCKOUT_MINUTES: int = 15

    ALLOWED_HOSTS: List[str] = ["localhost", "127.0.0.1", "0.0.0.0"]

    # ================================
    # CORS SETTINGS
    # ================================
    BACKEND_CORS_ORIGINS: List[AnyHttpUrl] = [
        "http://localhost:3000",
        "http://localhost:8080",
        "https://app.actuarial-saas.com",
    ]

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> Union[List[str], str]:
        if isinstance(v, str) and not v.startswith("["):
            # ex: "http://localhost:3000, http://127.0.0.1:5173"
            return [i.strip() for i in v.split(",") if i.strip()]
        elif isinstance(v, (list, str)):
            return v
        raise ValueError("Valeur CORS invalide")

    # ================================
    # DATABASE SETTINGS
    # ================================
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_USER: str = "actuarial_user"
    POSTGRES_PASSWORD: str = "actuarial_password"
    POSTGRES_DB: str = "actuarial_provisioning"
    POSTGRES_PORT: int = 5432

    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_TIMEOUT: int = 30
    DB_POOL_RECYCLE: int = 3600

    # Remarque Pydantic v2 : on garde une URI str (plus simple que PostgresDsn)
    SQLALCHEMY_DATABASE_URI: Optional[str] = None

    # ================================
    # REDIS SETTINGS
    # ================================
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_PASSWORD: Optional[str] = None
    REDIS_DB: int = 0
    REDIS_SSL: bool = False

    CACHE_TTL: int = 3600
    CACHE_PREFIX: str = "actuarial_saas:"

    REDIS_URL: Optional[str] = None

    # ================================
    # CELERY SETTINGS
    # ================================
    CELERY_BROKER_URL: Optional[str] = None
    CELERY_RESULT_BACKEND: Optional[str] = None

    CELERY_TASK_SERIALIZER: str = "json"
    CELERY_RESULT_SERIALIZER: str = "json"
    CELERY_ACCEPT_CONTENT: List[str] = ["json"]
    CELERY_TIMEZONE: str = "UTC"
    CELERY_ENABLE_UTC: bool = True

    # ================================
    # EMAIL SETTINGS
    # ================================
    SMTP_TLS: bool = True
    SMTP_PORT: Optional[int] = 587
    SMTP_HOST: Optional[str] = None
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None

    EMAILS_FROM_EMAIL: Optional[EmailStr] = "noreply@actuarial-saas.com"
    EMAILS_FROM_NAME: Optional[str] = "Actuarial Provisioning SaaS"

    EMAIL_RESET_TOKEN_EXPIRE_HOURS: int = 48
    EMAIL_TEMPLATES_DIR: str = "app/email-templates/build"

    # ================================
    # LOGGING SETTINGS
    # ================================
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    LOG_FILE: Optional[str] = None
    LOG_ROTATION: str = "1 day"
    LOG_RETENTION: str = "30 days"

    LOG_SQL_QUERIES: bool = False
    LOG_AUDIT_EVENTS: bool = True
    LOG_BUSINESS_EVENTS: bool = True

    # ================================
    # FILE STORAGE SETTINGS
    # ================================
    STORAGE_TYPE: str = "local"  # local, s3, minio

    UPLOAD_FOLDER: str = "uploads"
    MAX_UPLOAD_SIZE: int = 50 * 1024 * 1024
    ALLOWED_EXTENSIONS: List[str] = [".csv", ".xlsx", ".xls", ".json"]

    S3_BUCKET: Optional[str] = None
    S3_REGION: Optional[str] = None
    S3_ACCESS_KEY: Optional[str] = None
    S3_SECRET_KEY: Optional[str] = None
    S3_ENDPOINT_URL: Optional[str] = None

    # ================================
    # ACTUARIAL SETTINGS
    # ================================
    AVAILABLE_METHODS: List[str] = [
        "chain_ladder",
        "bornhuetter_ferguson",
        "mack",
        "cape_cod",
        "expected_loss_ratio",
    ]

    DEFAULT_CONFIDENCE_LEVEL: float = 0.75
    DEFAULT_TAIL_FACTOR: float = 1.0
    MIN_DEVELOPMENT_PERIODS: int = 3
    MAX_DEVELOPMENT_PERIODS: int = 20

    MAX_TRIANGLE_SIZE: int = 50
    MIN_DATA_POINTS: int = 6
    MAX_CALCULATION_TIME: int = 300

    # ================================
    # COMPLIANCE SETTINGS
    # ================================
    IFRS17_ENABLED: bool = True
    IFRS17_DISCOUNT_CURVES: List[str] = ["EUR", "USD", "GBP"]
    IFRS17_RISK_ADJUSTMENT_METHODS: List[str] = [
        "cost_of_capital",
        "percentile",
        "conditional_tail_expectation",
    ]

    SOLVENCY2_ENABLED: bool = True
    SOLVENCY2_QRT_TEMPLATES: List[str] = ["S.02.01", "S.19.01", "S.28.01"]

    AUDIT_RETENTION_DAYS: int = 2555
    AUDIT_DETAILED_LOGGING: bool = True

    # ================================
    # RATE LIMITING SETTINGS
    # ================================
    RATE_LIMIT_REQUESTS_PER_MINUTE: int = 60
    RATE_LIMIT_BURST: int = 10
    CALCULATION_RATE_LIMIT: int = 10
    EXPORT_RATE_LIMIT: int = 5
    UPLOAD_RATE_LIMIT: int = 3

    # ================================
    # MONITORING SETTINGS
    # ================================
    ENABLE_METRICS: bool = True
    METRICS_PORT: int = 9090

    HEALTH_CHECK_INTERVAL: int = 30

    ALERT_EMAIL_RECIPIENTS: List[EmailStr] = []
    ALERT_WEBHOOK_URL: Optional[HttpUrl] = None

    # ================================
    # FEATURE FLAGS
    # ================================
    ENABLE_ML_PREDICTIONS: bool = False
    ENABLE_REAL_TIME_CALCULATIONS: bool = True
    ENABLE_ADVANCED_CHARTS: bool = True
    ENABLE_BENCHMARKING: bool = False

    ENABLE_QUERY_OPTIMIZATION: bool = True
    ENABLE_RESPONSE_COMPRESSION: bool = True
    PRELOAD_CACHE: bool = False
    ENABLE_PERIODIC_TASKS: bool = True

    # ================================
    # TESTING & SUPERUSER
    # ================================
    TESTING: bool = False
    TEST_DATABASE_URL: Optional[str] = None

    FIRST_SUPERUSER_EMAIL: Optional[EmailStr] = "admin@actuarial-saas.com"
    FIRST_SUPERUSER_PASSWORD: Optional[str] = "admin123"

    # ----------------
    # Pydantic v2 config
    # ----------------
    model_config = SettingsConfigDict(
        case_sensitive=True,
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",           # ignore unknown env vars
        validate_default=True,    # valide les valeurs par défaut
    )

    # Post-validation : construire les URLs dépendantes d'autres champs
    @model_validator(mode="after")
    def build_derived_urls(self) -> "Settings":
        # SQLALCHEMY_DATABASE_URI
        if not self.SQLALCHEMY_DATABASE_URI:
            # driver SQLAlchemy moderne : psycopg (plutôt que psycopg2)
            self.SQLALCHEMY_DATABASE_URI = (
                f"postgresql+psycopg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
                f"@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
            )

        # REDIS_URL
        if not self.REDIS_URL:
            scheme = "rediss" if self.REDIS_SSL else "redis"
            auth = f":{self.REDIS_PASSWORD}@" if self.REDIS_PASSWORD else ""
            self.REDIS_URL = f"{scheme}://{auth}{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

        # Celery broker/backend
        if not self.CELERY_BROKER_URL:
            self.CELERY_BROKER_URL = self.REDIS_URL
        if not self.CELERY_RESULT_BACKEND:
            self.CELERY_RESULT_BACKEND = self.REDIS_URL

        return self


# Instance globale des settings
settings = Settings()


def get_settings() -> Settings:
    """Factory pour obtenir l'instance des settings (tests / DI)."""
    return settings


# ================================
# VALIDATION FUNCTIONS
# ================================
def validate_environment():
    """Valide la configuration pour l'environnement courant."""
    errors = []

    # Production
    if settings.ENVIRONMENT == "production":
        if settings.DEBUG:
            errors.append("DEBUG ne doit pas être activé en production")

        if not settings.SECRET_KEY or len(settings.SECRET_KEY) < 32:
            errors.append("SECRET_KEY doit être définie et sécurisée en production")

        if not settings.ALLOWED_HOSTS or "localhost" in settings.ALLOWED_HOSTS:
            errors.append("ALLOWED_HOSTS doit être configuré pour la production")

        if not settings.SMTP_HOST:
            errors.append("Configuration SMTP manquante en production")

    # Base de données / Redis
    if not settings.SQLALCHEMY_DATABASE_URI:
        errors.append("URL de base de données manquante")
    if not settings.REDIS_URL:
        errors.append("URL Redis manquante")

    if errors:
        raise ValueError(f"Erreurs de configuration: {'; '.join(errors)}")


# Validation automatique (sauf en tests)
if not settings.TESTING:
    try:
        validate_environment()
    except ValueError as e:
        print(f"⚠️  Avertissement de configuration: {e}")


# ================================
# DERIVED SETTINGS (chemins)
# ================================
BASE_DIR = Path(__file__).resolve().parent.parent.parent
UPLOAD_DIR = BASE_DIR / settings.UPLOAD_FOLDER
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

UPLOAD_DIR.mkdir(exist_ok=True)

__all__ = ["settings", "get_settings", "validate_environment"]
