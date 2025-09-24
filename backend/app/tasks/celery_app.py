import os
from celery import Celery

BROKER_URL = os.getenv("REDIS_URL") or os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
BACKEND_URL = os.getenv("CELERY_RESULT_BACKEND", BROKER_URL)

CELERY_ENABLED = os.getenv("CELERY_ENABLED", "false").lower() in {"1","true","yes","on"}

celery_app = Celery("provtech", broker=BROKER_URL, backend=BACKEND_URL)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)
