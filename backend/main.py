"""
Point d'entrée principal de l'API FastAPI
Simulateur de Provisionnement Actuariel SaaS
"""

from fastapi import FastAPI, Request, status, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import logging
import time
from datetime import datetime, timedelta
from contextlib import asynccontextmanager
import jwt
import bcrypt
import uuid

# Import des routers existants
from app.api.v1 import auth, triangles, calculations, exports, compliance, benchmarking
from app.core.config import settings
from app.core.database import engine, db_manager, health_check_db
from app.api.v1 import triangles_simple, calculations_simple
from app.api.v1 import results

# ===== NOUVEAUX IMPORTS RÉGLEMENTAIRES =====
try:
    from app.api.v1 import regulatory_dashboard, workflow, regulatory_controls
    REGULATORY_MODULES_AVAILABLE = True
    logger.info("📋 Modules réglementaires disponibles")
except ImportError as e:
    REGULATORY_MODULES_AVAILABLE = False
    logger.warning(f"⚠️ Modules réglementaires non disponibles: {e}")

# Configuration du logging
logging.basicConfig(
    level=logging.INFO if settings.ENVIRONMENT == "production" else logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ===== CONFIGURATION AUTHENTIFICATION HYBRIDE =====
JWT_SECRET = "your-super-secret-jwt-key-change-in-production"
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 1
security = HTTPBearer()

# Base de données utilisateurs simulée (à remplacer par votre vraie DB)
USERS_DB = [
    {
        "id": 1,
        "email": "admin@provtech.com",
        "password": bcrypt.hashpw("Admin123!".encode('utf-8'), bcrypt.gensalt()).decode('utf-8'),
        "first_name": "Admin",
        "last_name": "ProvTech",
        "role": "ADMIN",
        "permissions": ["triangles:read", "triangles:write", "compliance:read", "governance:read", "modeling:read"],
        "created_at": datetime.utcnow().isoformat(),
    },
    {
        "id": 2,
        "email": "actuaire@provtech.com", 
        "password": bcrypt.hashpw("Actuaire123!".encode('utf-8'), bcrypt.gensalt()).decode('utf-8'),
        "first_name": "Jean",
        "last_name": "Dupont",
        "role": "ACTUAIRE_SENIOR",
        "permissions": ["triangles:read", "calculations:read", "compliance:read"],
        "created_at": datetime.utcnow().isoformat(),
    }
]

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Vérifier un token JWT pour les routes protégées"""
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id: int = payload.get("user_id")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Token invalide")
        return payload
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Token invalide")

# ============================================================================
# LIFESPAN EVENTS
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Gestion du cycle de vie de l'application
    """
    # Startup
    logger.info("🚀 Démarrage de l'application...")
    logger.info("📋 Système de Conformité Réglementaire IFRS 17 & Solvabilité II")
    
    # Vérifier la connexion DB
    db_status = health_check_db()
    if db_status["status"] == "healthy":
        logger.info("✅ Base de données connectée")
    else:
        logger.error("❌ Erreur connexion base de données")
    
    # Créer les tables si nécessaire (dev only)
    if settings.ENVIRONMENT == "development":
        try:
            db_manager.create_all_tables()
            logger.info("✅ Tables vérifiées/créées")
        except Exception as e:
            logger.error(f"❌ Erreur création tables: {e}")
    
    # Status des modules réglementaires
    if REGULATORY_MODULES_AVAILABLE:
        logger.info("✅ Modules réglementaires activés")
    else:
        logger.warning("⚠️ Modules réglementaires désactivés")
    
    yield
    
    # Shutdown
    logger.info("👋 Arrêt de l'application...")
    
    # Nettoyer les ressources
    engine.dispose()
    logger.info("✅ Connexions DB fermées")

# ============================================================================
# APPLICATION FASTAPI
# ============================================================================

app = FastAPI(
    title="Actuarial Provisioning SaaS - Conformité Réglementaire",
    description="API pour le calcul de provisions actuarielles avec support IFRS 17, Solvabilité II et conformité réglementaire complète",
    version="1.1.0",  # Version mise à jour
    docs_url="/docs" if settings.SHOW_DOCS else None,
    redoc_url="/redoc" if settings.SHOW_DOCS else None,
    lifespan=lifespan,
    openapi_tags=[
        {"name": "Authentication", "description": "Gestion de l'authentification"},
        {"name": "Triangles", "description": "Gestion des triangles de développement"},
        {"name": "Calculations", "description": "Calculs actuariels"},
        {"name": "Compliance", "description": "Conformité réglementaire"},
        {"name": "Regulatory Dashboard", "description": "Dashboard réglementaire unifié"},
        {"name": "Workflow", "description": "Workflows d'approbation multi-niveaux"},
        {"name": "Regulatory Controls", "description": "Contrôles réglementaires automatisés"},
        {"name": "Health", "description": "Endpoints de santé"},
        {"name": "Root", "description": "Endpoints racine"}
    ]
)

# ============================================================================
# MIDDLEWARES
# ============================================================================

# CORS - Cross-Origin Resource Sharing
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Compression GZIP
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Trusted Host (protection contre host header attacks)
if settings.ENVIRONMENT == "production":
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=settings.ALLOWED_HOSTS
    )

# Middleware de logging des requêtes
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """
    Log toutes les requêtes HTTP
    """
    start_time = time.time()
    
    # Générer un ID de requête unique
    request_id = f"{int(time.time() * 1000)}"
    
    # Logger la requête entrante
    logger.info(f"📥 {request_id} - {request.method} {request.url.path}")
    
    # Traiter la requête
    response = await call_next(request)
    
    # Calculer le temps de traitement
    process_time = (time.time() - start_time) * 1000
    
    # Logger la réponse
    logger.info(
        f"📤 {request_id} - Status: {response.status_code} - Time: {process_time:.2f}ms"
    )
    
    # Ajouter des headers custom
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Process-Time"] = f"{process_time:.2f}ms"
    
    return response

# ============================================================================
# EXCEPTION HANDLERS
# ============================================================================

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """
    Gestionnaire d'exceptions HTTP
    """
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "status_code": exc.status_code,
            "timestamp": datetime.utcnow().isoformat()
        }
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Gestionnaire d'erreurs de validation
    """
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": "Validation error",
            "details": exc.errors(),
            "body": exc.body,
            "timestamp": datetime.utcnow().isoformat()
        }
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """
    Gestionnaire d'exceptions générales
    """
    logger.error(f"Erreur non gérée: {exc}", exc_info=True)
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "Internal server error",
            "message": str(exc) if settings.DEBUG else "An error occurred",
            "timestamp": datetime.utcnow().isoformat()
        }
    )

# ============================================================================
# ROUTES DE BASE
# ============================================================================

@app.get("/", tags=["Root"])
async def root():
    """
    Point d'entrée racine de l'API
    """
    return {
        "message": "Actuarial Provisioning SaaS API - Conformité Réglementaire",
        "version": "1.1.0",
        "status": "online",
        "documentation": "/docs",
        "regulatory_compliance": {
            "ifrs17_support": True,
            "solvency2_support": True,
            "workflows_enabled": REGULATORY_MODULES_AVAILABLE,
            "real_time_monitoring": REGULATORY_MODULES_AVAILABLE
        },
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/health", tags=["Health"])
async def health_check():
    """
    Health check de l'application
    """
    db_status = health_check_db()
    
    return {
        "status": "healthy" if db_status["status"] == "healthy" else "degraded",
        "version": "1.1.0",
        "timestamp": datetime.utcnow().isoformat(),
        "database": db_status["status"] == "healthy",
        "environment": settings.ENVIRONMENT,
        "regulatory_modules": REGULATORY_MODULES_AVAILABLE,
        "details": {
            "database": db_status,
            "regulatory_compliance": {
                "dashboard": REGULATORY_MODULES_AVAILABLE,
                "workflows": REGULATORY_MODULES_AVAILABLE,
                "controls": REGULATORY_MODULES_AVAILABLE
            }
        }
    }

@app.get("/info", tags=["Info"])
async def app_info():
    """
    Informations sur l'application (version étendue avec conformité)
    """
    return {
        "app_name": "Actuarial Provisioning SaaS - Conformité Réglementaire",
        "version": "1.1.0",
        "environment": settings.ENVIRONMENT,
        "features": {
            "actuarial_methods": [
                "chain_ladder",
                "bornhuetter_ferguson",
                "mack",
                "cape_cod",
                "bootstrap"
            ],
            "compliance": ["IFRS 17", "Solvency II", "ACPR", "EIOPA"],
            "regulatory_features": [
                "Real-time monitoring",
                "Multi-level approval workflows", 
                "Automated regulatory controls",
                "QRT template generation",
                "Documentation automation"
            ] if REGULATORY_MODULES_AVAILABLE else [],
            "formats": ["CSV", "Excel", "JSON"],
            "languages": ["fr", "en"]
        },
        "endpoints": {
            "actuarial": {
                "triangles": "/api/v1/triangles",
                "calculations": "/api/v1/calculations",
                "results": "/api/v1/results"
            },
            "regulatory": {
                "dashboard": "/api/v1/regulatory-dashboard" if REGULATORY_MODULES_AVAILABLE else None,
                "workflows": "/api/v1/workflow" if REGULATORY_MODULES_AVAILABLE else None,
                "controls": "/api/v1/regulatory-controls" if REGULATORY_MODULES_AVAILABLE else None
            },
            "core": {
                "auth": "/api/v1/auth",
                "health": "/health",
                "docs": "/docs"
            }
        },
        "limits": {
            "max_triangle_size": 50,
            "max_calculations_per_day": 100,
            "max_file_size_mb": 10,
            "max_workflow_levels": 5
        },
        "contact": {
            "email": "support@actuarial-saas.com",
            "documentation": "https://docs.actuarial-saas.com"
        }
    }

# ============================================================================
# INCLUSION DES ROUTERS EXISTANTS
# ============================================================================

# Router d'authentification
app.include_router(
    auth.router,
    prefix="/api/v1",
    tags=["Authentication"]
)



# Router des triangles
app.include_router(
    triangles.router,
    prefix="/api/v1",
    tags=["Triangles"]
)

# Router des calculs
app.include_router(
    calculations.router,
    prefix="/api/v1",
    tags=["Calculations"]
)

# Router des exports
app.include_router(
    exports.router,
    prefix="/api/v1",
    tags=["Exports"]
)

# Router conformité IFRS17 / Solvency II
app.include_router(
    compliance.router,
    prefix="/api/v1",
    tags=["Compliance"]
)

# Router de benchmarking des méthodes
app.include_router(
    benchmarking.router,
    prefix="/api/v1",
    tags=["Benchmarking"]
)

# Routers simplifiés
app.include_router(triangles_simple.router, prefix="/api/v1", tags=["Triangles Simple"])
app.include_router(calculations_simple.router, prefix="/api/v1", tags=["Calculations Simple"])
app.include_router(results.router, prefix="/api/v1", tags=["Results"])

# ============================================================================
# INCLUSION DES NOUVEAUX ROUTERS RÉGLEMENTAIRES
# ============================================================================

if REGULATORY_MODULES_AVAILABLE:
    logger.info("🔄 Chargement des routers réglementaires...")
    
    # Router Dashboard Réglementaire
    try:
        app.include_router(
            regulatory_dashboard.router,
            prefix="/api/v1/regulatory-dashboard",
            tags=["Regulatory Dashboard"]
        )
        logger.info("✅ Router Dashboard Réglementaire chargé")
    except Exception as e:
        logger.error(f"❌ Erreur Router Dashboard Réglementaire: {e}")
    
    # Router Workflows
    try:
        app.include_router(
            workflow.router,
            prefix="/api/v1/workflow", 
            tags=["Workflow"]
        )
        logger.info("✅ Router Workflows chargé")
    except Exception as e:
        logger.error(f"❌ Erreur Router Workflows: {e}")
    
    # Router Contrôles Réglementaires
    try:
        app.include_router(
            regulatory_controls.router,
            prefix="/api/v1/regulatory-controls",
            tags=["Regulatory Controls"]
        )
        logger.info("✅ Router Contrôles Réglementaires chargé")
    except Exception as e:
        logger.error(f"❌ Erreur Router Contrôles Réglementaires: {e}")
        
    logger.info("🎯 Tous les modules réglementaires chargés avec succès")
else:
    logger.warning("⚠️ Modules réglementaires désactivés - fonctionnalités de base uniquement")

# ============================================================================
# ROUTES DE MONITORING
# ============================================================================

@app.get("/api/v1/monitoring/metrics", tags=["Monitoring"])
async def get_metrics():
    """
    Métriques de performance de l'application
    """
    from app.core.database import get_performance_metrics
    metrics = get_performance_metrics()
    
    # Ajouter métriques réglementaires si disponibles
    if REGULATORY_MODULES_AVAILABLE:
        metrics["regulatory"] = {
            "workflows_active": True,
            "controls_running": True,
            "compliance_monitoring": True
        }
    
    return metrics

@app.get("/api/v1/monitoring/database", tags=["Monitoring"])
async def database_status():
    """
    Status détaillé de la base de données
    """
    return health_check_db()

@app.get("/api/v1/monitoring/regulatory", tags=["Monitoring"])
async def regulatory_status():
    """
    Status des modules réglementaires
    """
    if not REGULATORY_MODULES_AVAILABLE:
        return {"status": "disabled", "message": "Modules réglementaires non disponibles"}
    
    return {
        "status": "active",
        "modules": {
            "regulatory_dashboard": True,
            "workflow_system": True,
            "regulatory_controls": True
        },
        "last_check": datetime.utcnow().isoformat(),
        "compliance_score": 87.5,  # Simulation
        "active_workflows": 3,     # Simulation
        "pending_approvals": 2     # Simulation
    }

# ============================================================================
# ROUTES DEBUG (développement uniquement)
# ============================================================================

if settings.ENVIRONMENT == "development":
    @app.get("/api/debug/routes", tags=["Debug"])
    async def debug_routes():
        """
        Debug des routes disponibles (développement uniquement)
        """
        routes = []
        regulatory_routes = []
        
        for route in app.routes:
            if hasattr(route, 'methods') and hasattr(route, 'path'):
                route_info = {
                    "path": route.path,
                    "methods": list(route.methods) if route.methods else [],
                    "name": getattr(route, 'name', 'unnamed')
                }
                routes.append(route_info)
                
                # Identifier les routes réglementaires
                if any(keyword in route.path for keyword in ["/regulatory-dashboard", "/workflow", "/regulatory-controls"]):
                    regulatory_routes.append(route_info)
        
        return {
            "total_routes": len(routes),
            "regulatory_routes_count": len(regulatory_routes),
            "regulatory_modules_available": REGULATORY_MODULES_AVAILABLE,
            "regulatory_routes": regulatory_routes,
            "all_routes": routes
        }

# ============================================================================
# CONFIGURATION POUR DÉVELOPPEMENT
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    
    logger.info("🚀 Lancement du serveur en mode développement")
    logger.info("📋 Conformité Réglementaire IFRS 17 & Solvabilité II")
    
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="debug" if settings.DEBUG else "info"
    )