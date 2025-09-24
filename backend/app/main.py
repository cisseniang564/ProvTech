# backend/app/main.py - VERSION AVEC AUTHENTIFICATION HYBRIDE COMMENTÉE (Mode Développement)
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
# 🚫 AUTHENTIFICATION COMMENTÉE TEMPORAIREMENT
# from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime, timedelta
import uvicorn
import logging
import os
import uuid
from typing import Optional, List
from pydantic import BaseModel, EmailStr

# 🚫 IMPORTS D'AUTHENTIFICATION COMMENTÉS TEMPORAIREMENT
# try:
#     import jwt
#     import bcrypt
#     import qrcode
#     import pyotp
#     import io
#     import base64
#     JWT_AVAILABLE = True
# except ImportError as e:
#     print(f"Modules d'authentification non disponibles: {e}")
#     JWT_AVAILABLE = False

# ===== IMPORTS DES ROUTERS =====
from app.routers import triangles_simple, calculations_simple
from app.routers import results  # ✅ NOUVEAU ROUTER
from app.routers import approval_workflow
#from app.routers import api_management
#from app.routers import enhanced_ifrs17_service
#from .routers import actuarial_methods
#from app.api.v1 import branches as branches_router
#app.include_router(branches_router.router)

# ===== NOUVEAUX MODÈLES PYDANTIC POUR L'AUTHENTIFICATION (COMMENTÉS) =====
# class LoginRequest(BaseModel):
#     email: EmailStr
#     password: str
#     mfaToken: Optional[str] = None

# class UserCreate(BaseModel):
#     email: EmailStr
#     firstName: str
#     lastName: str
#     role: str = "ACTUAIRE"

# class TwoFAVerify(BaseModel):
#     token: str

# Configuration du logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("app.main")

# ===== CONFIGURATION JWT ET SÉCURITÉ (COMMENTÉE) =====
# 🚫 AUTHENTIFICATION COMMENTÉE TEMPORAIREMENT
# JWT_SECRET = "your-super-secret-jwt-key-change-in-production"
# JWT_ALGORITHM = "HS256"
# JWT_EXPIRE_HOURS = 1
# REFRESH_EXPIRE_DAYS = 7
# security = HTTPBearer()

# ===== UTILITAIRES D'AUTHENTIFICATION (COMMENTÉS) =====
# 🚫 TOUTES LES FONCTIONS D'AUTHENTIFICATION COMMENTÉES TEMPORAIREMENT

# def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
#     """Créer un token JWT d'accès"""
#     to_encode = data.copy()
#     if expires_delta:
#         expire = datetime.utcnow() + expires_delta
#     else:
#         expire = datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS)
#     
#     to_encode.update({"exp": expire, "type": "access"})
#     encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
#     return encoded_jwt

# def create_refresh_token(data: dict):
#     """Créer un token JWT de rafraîchissement"""
#     to_encode = data.copy()
#     expire = datetime.utcnow() + timedelta(days=REFRESH_EXPIRE_DAYS)
#     to_encode.update({"exp": expire, "type": "refresh"})
#     encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
#     return encoded_jwt

# def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
#     """Vérifier un token JWT"""
#     try:
#         payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
#         user_id: int = payload.get("user_id")
#         if user_id is None:
#             raise HTTPException(status_code=401, detail="Token invalide")
#         return payload
#     except jwt.PyJWTError:
#         raise HTTPException(status_code=401, detail="Token invalide")

# def hash_password(password: str) -> str:
#     """Hasher un mot de passe"""
#     return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

# def verify_password(password: str, hashed: str) -> bool:
#     """Vérifier un mot de passe"""
#     return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

# def generate_2fa_secret() -> str:
#     """Générer un secret 2FA"""
#     return pyotp.random_base32()

# def generate_qr_code(secret: str, user_email: str) -> str:
#     """Générer un QR code pour 2FA"""
#     totp_uri = pyotp.totp.TOTP(secret).provisioning_uri(
#         name=user_email,
#         issuer_name="ProvTech"
#     )
#     
#     qr = qrcode.QRCode(version=1, box_size=10, border=5)
#     qr.add_data(totp_uri)
#     qr.make(fit=True)
#     
#     img = qr.make_image(fill_color="black", back_color="white")
#     buffer = io.BytesIO()
#     img.save(buffer, format='PNG')
#     buffer.seek(0)
#     
#     img_str = base64.b64encode(buffer.getvalue()).decode()
#     return f"data:image/png;base64,{img_str}"

# def verify_2fa_token(secret: str, token: str) -> bool:
#     """Vérifier un token 2FA"""
#     totp = pyotp.TOTP(secret)
#     return totp.verify(token, valid_window=2)

def load_workflow_router():
    """Charge le router de workflow d'approbation"""
    try:
        app.include_router(approval_workflow.router)
        logger.info("✅ Router Workflow d'Approbation chargé avec succès")
        return True
    except ImportError as e:
        logger.warning(f"⚠️ Router Workflow - Import Error: {e}")
        return False
    except AttributeError as e:
        logger.warning(f"⚠️ Router Workflow - Attribute Error: {e}")
        return False
    except Exception as e:
        logger.error(f"❌ Router Workflow - Erreur: {e}")
        return False

# ===== BASE DE DONNÉES SIMULÉE (COMMENTÉE - PAS BESOIN SANS AUTH) =====
# 🚫 BASE DE DONNÉES UTILISATEURS COMMENTÉE TEMPORAIREMENT
# USERS_DB = [
#     {
#         "id": 1,
#         "email": "admin@provtech.com",
#         "password": hash_password("Admin123!"),
#         "first_name": "Admin",
#         "last_name": "ProvTech",
#         "role": "ADMIN",
#         "has_2fa": True,
#         "is_migrated": True,
#         "mfa_secret": "JBSWY3DPEHPK3PXP",
#         "permissions": ["triangles:read", "triangles:write", "users:read", "users:write"],
#         "created_at": datetime.utcnow().isoformat(),
#     },
#     {
#         "id": 2,
#         "email": "actuaire@provtech.com", 
#         "password": hash_password("Actuaire123!"),
#         "first_name": "Jean",
#         "last_name": "Dupont",
#         "role": "ACTUAIRE_SENIOR",
#         "has_2fa": False,
#         "is_migrated": False,
#         "mfa_secret": None,
#         "permissions": ["triangles:read", "calculations:read"],
#         "created_at": datetime.utcnow().isoformat(),
#     },
#     {
#         "id": 3,
#         "email": "test@provtech.com",
#         "password": hash_password("Test123!"),
#         "first_name": "Test",
#         "last_name": "User", 
#         "role": "ACTUAIRE_JUNIOR",
#         "has_2fa": False,
#         "is_migrated": False,
#         "mfa_secret": None,
#         "permissions": ["triangles:read"],
#         "created_at": datetime.utcnow().isoformat(),
#     }
# ]

AUDIT_LOGS = []

# 🚫 FONCTIONS UTILISATEURS COMMENTÉES TEMPORAIREMENT
# def find_user_by_email(email: str):
#     """Trouver un utilisateur par email"""
#     return next((user for user in USERS_DB if user["email"] == email), None)

# def find_user_by_id(user_id: int):
#     """Trouver un utilisateur par ID"""
#     return next((user for user in USERS_DB if user["id"] == user_id), None)

def log_audit(user_id: int, action: str, details: str, ip_address: str = ""):
    """Logger une action d'audit"""
    AUDIT_LOGS.append({
        "id": len(AUDIT_LOGS) + 1,
        "user_id": user_id,
        "action": action,
        "details": details,
        "ip_address": ip_address,
        "timestamp": datetime.utcnow().isoformat()
    })

# ===== CRÉATION DE L'INSTANCE FASTAPI =====
app = FastAPI(
    title="Actuarial Provisioning SaaS - Mode Développement",
    description="API pour le calcul de provisions actuarielles avec support IFRS 17 et Solvabilité II (Authentification désactivée temporairement)",
    version="1.0.0-dev",
    openapi_tags=[
        {
            "name": "triangles",
            "description": "Gestion des triangles de développement"
        },
        {
            "name": "calculations", 
            "description": "Calculs actuariels (Chain Ladder, Bornhuetter-Ferguson, Mack, etc.)"
        },
        # 🚫 TAGS D'AUTHENTIFICATION COMMENTÉS TEMPORAIREMENT
        # {
        #     "name": "Hybrid Auth",
        #     "description": "Authentification hybride avec 2FA"
        # },
        # {
        #     "name": "User Management",
        #     "description": "Gestion des utilisateurs (Admin)"
        # },
        # {
        #     "name": "Audit",
        #     "description": "Logs d'audit et traçabilité"
        # },
        # {
        #     "name": "Migration",
        #     "description": "Migration progressive vers le système sécurisé"
        # },
        {
            "name": "health",
            "description": "Endpoints de santé et de debug"
        },
        {
            "name": "development",
            "description": "Endpoints mode développement sans authentification"
        }
    ]
)

# ===== CONFIGURATION CORS =====
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "https://yourdomain.com"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===== ÉVÉNEMENTS DE CYCLE DE VIE =====
@app.on_event("startup")
async def startup_event():
    """Événement exécuté au démarrage"""
    logger.info("🚀 Démarrage de l'application Actuarial Provisioning SaaS...")
    logger.info("🔧 MODE DÉVELOPPEMENT: Authentification hybride DÉSACTIVÉE temporairement")
    logger.info("📍 Environnement: development")
    logger.info("🔧 Debug: True")
    logger.info("⚠️ Pour réactiver l'authentification: décommentez les sections dans main.py")

@app.on_event("shutdown") 
async def shutdown_event():
    """Événement exécuté à l'arrêt"""
    logger.info("🛑 Arrêt de l'application...")

# ===== ENDPOINTS D'AUTHENTIFICATION COMMENTÉS =====
# 🚫 TOUS LES ENDPOINTS D'AUTHENTIFICATION COMMENTÉS TEMPORAIREMENT

# @app.post("/api/auth/login", tags=["Hybrid Auth"])
# async def hybrid_login(request: LoginRequest, req: Request):
#     """Connexion hybride avec support 2FA"""
#     
#     # Trouver l'utilisateur
#     user = find_user_by_email(request.email)
#     if not user or not verify_password(request.password, user["password"]):
#         log_audit(0, "LOGIN_FAILED", f"Échec connexion pour {request.email}", req.client.host)
#         raise HTTPException(status_code=401, detail="Identifiants incorrects")
#     
#     # Vérifier 2FA si activé
#     if user["has_2fa"]:
#         if not request.mfaToken:
#             return JSONResponse(
#                 status_code=200,
#                 content={
#                     "success": False,
#                     "mfaRequired": True,
#                     "message": "Code 2FA requis"
#                 }
#             )
#         
#         if not verify_2fa_token(user["mfa_secret"], request.mfaToken):
#             log_audit(user["id"], "MFA_FAILED", "Code 2FA incorrect", req.client.host)
#             raise HTTPException(status_code=401, detail="Code 2FA incorrect")
#     
#     # Créer les tokens
#     access_token = create_access_token(data={"user_id": user["id"], "email": user["email"]})
#     refresh_token = create_refresh_token(data={"user_id": user["id"]})
#     
#     # Log de succès
#     log_audit(user["id"], "LOGIN_SUCCESS", f"Connexion réussie", req.client.host)
#     
#     # Réponse
#     return {
#         "success": True,
#         "user": {
#             "id": user["id"],
#             "email": user["email"],
#             "first_name": user["first_name"],
#             "last_name": user["last_name"],
#             "role": user["role"],
#             "has_2fa": user["has_2fa"],
#             "is_migrated": user["is_migrated"],
#             "permissions": user["permissions"]
#         },
#         "tokens": {
#             "accessToken": access_token,
#             "refreshToken": refresh_token
#         }
#     }

# @app.post("/api/auth/enable-2fa", tags=["Hybrid Auth"])
# async def enable_2fa(current_user: dict = Depends(verify_token)):
#     """Activer 2FA pour l'utilisateur connecté"""
#     
#     user = find_user_by_id(current_user["user_id"])
#     if not user:
#         raise HTTPException(status_code=404, detail="Utilisateur introuvable")
#     
#     # Générer secret 2FA
#     secret = generate_2fa_secret()
#     qr_code_url = generate_qr_code(secret, user["email"])
#     
#     # Stocker temporairement le secret (en attendant validation)
#     user["temp_mfa_secret"] = secret
#     
#     manual_entry_key = " ".join([secret[i:i+4] for i in range(0, len(secret), 4)])
#     
#     return {
#         "success": True,
#         "qrCodeUrl": qr_code_url,
#         "secret": secret,
#         "manualEntryKey": manual_entry_key
#     }

# @app.post("/api/auth/verify-2fa", tags=["Hybrid Auth"])
# async def verify_2fa_endpoint(request: TwoFAVerify, current_user: dict = Depends(verify_token)):
#     """Vérifier et activer définitivement le 2FA"""
#     
#     user = find_user_by_id(current_user["user_id"])
#     if not user or not user.get("temp_mfa_secret"):
#         raise HTTPException(status_code=400, detail="Configuration 2FA non initiée")
#     
#     # Vérifier le token
#     if not verify_2fa_token(user["temp_mfa_secret"], request.token):
#         raise HTTPException(status_code=400, detail="Code de vérification incorrect")
#     
#     # Activer définitivement le 2FA
#     user["mfa_secret"] = user["temp_mfa_secret"]
#     user["has_2fa"] = True
#     user["is_migrated"] = True
#     del user["temp_mfa_secret"]
#     
#     # Générer codes de récupération
#     backup_codes = [str(uuid.uuid4()).replace('-', '')[:8].upper() for _ in range(8)]
#     user["backup_codes"] = backup_codes
#     
#     log_audit(user["id"], "2FA_ENABLED", "2FA activé avec succès", "")
#     
#     return {
#         "success": True,
#         "backupCodes": backup_codes
#     }

# ===== GESTION DES UTILISATEURS (COMMENTÉE) =====

# @app.get("/api/users", tags=["User Management"])
# async def get_users(current_user: dict = Depends(verify_token)):
#     """Liste des utilisateurs (Admin seulement)"""
#     
#     user = find_user_by_id(current_user["user_id"])
#     if not user or user["role"] != "ADMIN":
#         raise HTTPException(status_code=403, detail="Permissions insuffisantes")
#     
#     # Retirer les données sensibles
#     safe_users = []
#     for u in USERS_DB:
#         safe_users.append({
#             "id": u["id"],
#             "email": u["email"],
#             "first_name": u["first_name"],
#             "last_name": u["last_name"],
#             "role": u["role"],
#             "has_2fa": u["has_2fa"],
#             "is_migrated": u["is_migrated"],
#             "created_at": u["created_at"]
#         })
#     
#     return {
#         "success": True,
#         "users": safe_users,
#         "total": len(safe_users)
#     }

# @app.post("/api/users", tags=["User Management"])
# async def create_user(request: UserCreate, current_user: dict = Depends(verify_token)):
#     """Créer un utilisateur (Admin seulement)"""
#     
#     user = find_user_by_id(current_user["user_id"])
#     if not user or user["role"] != "ADMIN":
#         raise HTTPException(status_code=403, detail="Permissions insuffisantes")
#     
#     # Vérifier que l'email n'existe pas
#     if find_user_by_email(request.email):
#         raise HTTPException(status_code=400, detail="Email déjà utilisé")
#     
#     # Générer mot de passe temporaire
#     temp_password = f"Temp{uuid.uuid4().hex[:8]}!"
#     
#     # Créer l'utilisateur
#     new_user = {
#         "id": max([u["id"] for u in USERS_DB]) + 1,
#         "email": request.email,
#         "password": hash_password(temp_password),
#         "first_name": request.firstName,
#         "last_name": request.lastName,
#         "role": request.role,
#         "has_2fa": False,
#         "is_migrated": False,
#         "mfa_secret": None,
#         "permissions": ["triangles:read"] if request.role == "ACTUAIRE_JUNIOR" else ["triangles:read", "calculations:read"],
#         "created_at": datetime.utcnow().isoformat()
#     }
#     
#     USERS_DB.append(new_user)
#     
#     log_audit(current_user["user_id"], "USER_CREATED", f"Utilisateur créé: {request.email}", "")
#     
#     return {
#         "success": True,
#         "user": {
#             "id": new_user["id"],
#             "email": new_user["email"],
#             "temporaryPassword": temp_password
#         },
#         "message": "Utilisateur créé. Mot de passe temporaire généré."
#     }

# ===== AUDIT ET LOGS (COMMENTÉS PARTIELLEMENT) =====

# @app.get("/api/audit", tags=["Audit"])
# async def get_audit_logs(
#     limit: int = 50, 
#     offset: int = 0,
#     current_user: dict = Depends(verify_token)
# ):
#     """Récupérer les logs d'audit"""
#     
#     user = find_user_by_id(current_user["user_id"])
#     if not user or user["role"] not in ["ADMIN", "AUDITEUR"]:
#         raise HTTPException(status_code=403, detail="Permissions insuffisantes")
#     
#     # Pagination
#     start = offset
#     end = offset + limit
#     logs = AUDIT_LOGS[start:end] if start < len(AUDIT_LOGS) else []
#     
#     return {
#         "success": True,
#         "logs": logs,
#         "total": len(AUDIT_LOGS),
#         "pagination": {
#             "limit": limit,
#             "offset": offset,
#             "hasMore": end < len(AUDIT_LOGS)
#         }
#     }

# ===== MIGRATION PROGRESSIVE (COMMENTÉE) =====

# @app.get("/api/migration/stats", tags=["Migration"])
# async def migration_stats(current_user: dict = Depends(verify_token)):
#     """Statistiques de migration"""
#     
#     user = find_user_by_id(current_user["user_id"])
#     if not user or user["role"] != "ADMIN":
#         raise HTTPException(status_code=403, detail="Permissions insuffisantes")
#     
#     total_users = len(USERS_DB)
#     migrated_users = len([u for u in USERS_DB if u["is_migrated"]])
#     legacy_users = total_users - migrated_users
#     users_2fa = len([u for u in USERS_DB if u["has_2fa"]])
#     
#     return {
#         "success": True,
#         "stats": {
#             "totalUsers": total_users,
#             "migratedUsers": migrated_users,
#             "legacyUsers": legacy_users,
#             "users2FA": users_2fa,
#             "migrationProgress": round((migrated_users / total_users) * 100, 1) if total_users > 0 else 0
#         }
#     }

# @app.post("/api/migration/start", tags=["Migration"])
# async def start_migration(
#     request: Request,
#     current_user: dict = Depends(verify_token)
# ):
#     """Démarrer une migration batch"""
#     
#     user = find_user_by_id(current_user["user_id"])
#     if not user or user["role"] != "ADMIN":
#         raise HTTPException(status_code=403, detail="Permissions insuffisantes")
#     
#     # Récupérer le body (dryRun)
#     body = await request.json()
#     dry_run = body.get("dryRun", False)
#     
#     # Simuler un job de migration
#     job_id = f"migration_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
#     
#     legacy_users = [u for u in USERS_DB if not u["is_migrated"]]
#     
#     log_audit(current_user["user_id"], "MIGRATION_STARTED", f"Migration batch démarrée (dry-run: {dry_run})", "")
#     
#     return {
#         "success": True,
#         "jobId": job_id,
#         "estimatedDuration": len(legacy_users) * 30,  # 30 secondes par utilisateur
#         "affectedUsers": len(legacy_users)
#     }

# ===== NOUVEAUX ENDPOINTS MODE DÉVELOPPEMENT =====

@app.get("/api/dev/status", tags=["development"])
async def dev_status():
    """Statut du mode développement"""
    return {
        "development_mode": True,
        "authentication": "disabled",
        "message": "Mode développement - Authentification désactivée temporairement",
        "to_enable_auth": "Décommentez les sections d'authentification dans main.py",
        "features": {
            "triangles": "enabled",
            "calculations": "enabled", 
            "workflows": "enabled",
            "api_management": "enabled (sans auth)",
            "user_management": "disabled",
            "audit": "basic_only"
        },
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }

@app.get("/api/dev/mock-user", tags=["development"])
async def get_mock_user():
    """Utilisateur simulé pour le développement"""
    return {
        "success": True,
        "user": {
            "id": 999,
            "email": "dev@provtech.com",
            "first_name": "Développeur",
            "last_name": "Mode",
            "role": "ADMIN",
            "permissions": ["all"],
            "development_mode": True
        },
        "note": "Utilisateur simulé pour le développement - Ne pas utiliser en production"
    }

# ===== ENDPOINTS DE BASE (MODIFIÉS) =====

@app.get("/", tags=["health"])
async def root():
    """Endpoint racine"""
    return {
        "message": "Actuarial Provisioning SaaS API - Mode Développement",
        "version": "1.0.0-dev",
        "status": "running",
        "documentation": "/docs",
        "development_mode": True,
        "features": {
            "hybrid_auth": False,  # 🔧 Désactivé temporairement
            "2fa_enabled": False,  # 🔧 Désactivé temporairement
            "progressive_migration": False,  # 🔧 Désactivé temporairement
            "triangles": True,
            "calculations": True,
            "workflows": True
        },
        "warning": "🔧 Authentification désactivée - Mode développement uniquement",
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }

@app.get("/health", tags=["health"])
async def health_check():
    """Health check étendu avec mode développement"""
    
    # Import conditionnel pour éviter les erreurs
    workflow_stats = {"enabled": False}
    try:
        from app.routers.approval_workflow import WORKFLOW_SUBMISSIONS
        workflow_stats = {
            "enabled": True,
            "total_submissions": len(WORKFLOW_SUBMISSIONS),
            "pending_approvals": len([s for s in WORKFLOW_SUBMISSIONS if s["status"] not in ["approved", "rejected", "locked"]])
        }
    except ImportError:
        pass
    
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "version": "1.0.0-dev",
        "development_mode": True,
        "services": {
            "api": "running",
            "triangles": "available",
            "calculations": "available",
            "hybrid_auth": "disabled_temporarily",  # 🔧 Modifié
            "database": "simulated (dev mode)"
        },
        "dev_stats": {
            "authentication": "disabled",
            "audit_logs": len(AUDIT_LOGS),
            "workflow_stats": workflow_stats
        },
        "endpoints": {
            # 🚫 ENDPOINTS D'AUTHENTIFICATION COMMENTÉS
            # "login": "/api/auth/login",
            # "users": "/api/users",
            # "audit": "/api/audit", 
            # "migration": "/api/migration/stats",
            "triangles": "/api/v1/triangles/*",
            "calculations": "/api/v1/calculations/*",
            "workflow": "/api/v1/workflow/dashboard",
            "dev_status": "/api/dev/status"
        },
        "warning": "🔧 Mode développement - Authentification désactivée"
    }

# ===== ENDPOINT DE DEBUG DES ROUTES (MODIFIÉ) =====

@app.get("/api/routes-debug", tags=["health"])
async def debug_routes():
    """Debug des routes disponibles avec focus sur le mode développement"""
    routes = []
    dev_routes = []
    
    for route in app.routes:
        if hasattr(route, 'methods') and hasattr(route, 'path'):
            route_info = {
                "path": route.path,
                "methods": list(route.methods) if route.methods else [],
                "name": getattr(route, 'name', 'unnamed')
            }
            routes.append(route_info)
            
            # Identifier les routes de développement
            if "/api/dev/" in route.path or "/api/v1/" in route.path:
                dev_routes.append(route_info)
    
    return {
        "routes": routes, 
        "total": len(routes),
        "development_system": {
            "enabled": True,
            "routes_count": len(dev_routes),
            "routes": dev_routes
        },
        "authentication_status": "disabled_temporarily",
        "active_endpoints": [
            "GET /api/dev/status",
            "GET /api/dev/mock-user", 
            "GET /api/v1/triangles/*",
            "GET /api/v1/calculations/*",
            "GET /api/v1/workflow/*"
        ],
        # 🚫 ENDPOINTS D'AUTHENTIFICATION COMMENTÉS
        "disabled_endpoints": [
            "POST /api/auth/login",
            "GET /api/users",
            "GET /api/migration/stats",
            "GET /api/audit"
        ]
    }

@app.get("/info", tags=["health"])
async def app_info():
    """Informations sur l'application (version mode développement)"""
    return {
        "name": "Actuarial Provisioning SaaS - Mode Développement",
        "version": "1.0.0-dev",
        "description": "API pour le calcul de provisions actuarielles (authentification désactivée temporairement)",
        "development_mode": True,
        "features": [
            "Gestion des triangles de développement",
            "Calculs actuariels (Chain Ladder, Bornhuetter-Ferguson, Mack)",
            "Workflow d'approbation",
            # 🚫 FONCTIONNALITÉS D'AUTHENTIFICATION COMMENTÉES
            # "Authentification hybride avec 2FA",
            # "Migration progressive des utilisateurs", 
            # "Audit et traçabilité complète",
            # "Gestion des rôles et permissions"
        ],
        "endpoints": {
            "triangles": "/api/v1/triangles",
            "calculations": "/api/v1/calculations",
            "results": "/api/v1/results",
            "workflow": "/api/v1/workflow/*",
            # 🚫 ENDPOINTS D'AUTHENTIFICATION COMMENTÉS
            # "auth": "/api/auth/*",
            # "users": "/api/users",
            # "migration": "/api/migration/*",
            "dev": "/api/dev/*",
            "documentation": "/docs"
        },
        "security": {
            "jwt_enabled": False,  # 🔧 Désactivé temporairement
            "2fa_support": False,  # 🔧 Désactivé temporairement
            "role_based_access": False,  # 🔧 Désactivé temporairement
            "audit_logging": "basic",
            "development_mode": True
        },
        "warning": "🔧 ATTENTION: Authentification désactivée - Utilisation en développement uniquement"
    }

# 🚫 ENDPOINTS ADMIN WORKFLOW COMMENTÉS (NÉCESSITENT AUTHENTIFICATION)
# @app.get("/api/admin/workflow/stats", tags=["Admin Workflow"])
# async def get_workflow_admin_stats(current_user: dict = Depends(verify_token)):
#     """Statistiques admin pour les workflows"""
#     user = find_user_by_id(current_user["user_id"])
#     if not user or user["role"] != "ADMIN":
#         raise HTTPException(status_code=403, detail="Permissions insuffisantes")
#     
#     try:
#         from app.routers.approval_workflow import WORKFLOW_SUBMISSIONS, ELECTRONIC_SIGNATURES, ApprovalStatus
#         
#         # Calculs statistiques
#         total = len(WORKFLOW_SUBMISSIONS)
#         by_status = {}
#         for status in ApprovalStatus:
#             by_status[status] = len([s for s in WORKFLOW_SUBMISSIONS if s["status"] == status])
#         
#         # Temps moyen d'approbation
#         approved_submissions = [s for s in WORKFLOW_SUBMISSIONS if s["status"] == ApprovalStatus.APPROVED and "approvedAt" in s]
#         avg_approval_time = 0
#         if approved_submissions:
#             times = []
#             for s in approved_submissions:
#                 submitted = datetime.fromisoformat(s["submittedAt"])
#                 approved = datetime.fromisoformat(s["approvedAt"])
#                 times.append((approved - submitted).total_seconds() / 3600)  # en heures
#             avg_approval_time = sum(times) / len(times)
#         
#         return {
#             "success": True,
#             "stats": {
#                 "totalSubmissions": total,
#                 "byStatus": by_status,
#                 "avgApprovalTimeHours": round(avg_approval_time, 2),
#                 "totalSignatures": len(ELECTRONIC_SIGNATURES),
#                 "activeWorkflows": len([s for s in WORKFLOW_SUBMISSIONS if s["status"] not in [ApprovalStatus.APPROVED, ApprovalStatus.REJECTED, ApprovalStatus.LOCKED]])
#             }
#         }
#     except ImportError:
#         raise HTTPException(status_code=503, detail="Module workflow non disponible")

# @app.post("/api/admin/workflow/emergency-approve/{submission_id}", tags=["Admin Workflow"])
# async def emergency_approve_workflow(
#     submission_id: str,
#     current_user: dict = Depends(verify_token)
# ):
#     """Approbation d'urgence (Admin uniquement)"""
#     user = find_user_by_id(current_user["user_id"])
#     if not user or user["role"] != "ADMIN":
#         raise HTTPException(status_code=403, detail="Permissions insuffisantes")
#     
#     try:
#         from app.routers.approval_workflow import WORKFLOW_SUBMISSIONS, ApprovalStatus
#         
#         submission = next((s for s in WORKFLOW_SUBMISSIONS if s["id"] == submission_id), None)
#         if not submission:
#             raise HTTPException(status_code=404, detail="Soumission introuvable")
#         
#         # Approbation d'urgence
#         submission["status"] = ApprovalStatus.APPROVED
#         submission["approvedAt"] = datetime.utcnow().isoformat()
#         submission["emergencyApproval"] = True
#         submission["emergencyApprover"] = current_user["user_id"]
#         
#         # Log d'audit critique
#         log_audit(
#             current_user["user_id"],
#             "EMERGENCY_WORKFLOW_APPROVAL",
#             f"Approbation d'urgence pour {submission_id}",
#             ""
#         )
#         
#         return {
#             "success": True,
#             "message": "Approbation d'urgence accordée",
#             "submissionId": submission_id
#         }
#         
#     except ImportError:
#         raise HTTPException(status_code=503, detail="Module workflow non disponible")

# ===== MIDDLEWARE DE LOGGING (MODIFIÉ) =====
@app.middleware("http")
async def log_requests(request, call_next):
    """Logger les requêtes avec notification mode développement"""
    start_time = datetime.utcnow()
    request_id = int(start_time.timestamp() * 1000000)
    
    # 🔧 Log spécial pour mode développement
    auth_status = "🔧 DEV MODE" if not request.url.path.startswith("/api/auth/") else "❌ AUTH DISABLED"
    logger.info(f"📥 {request_id} - {request.method} {request.url.path} - {auth_status}")
    
    response = await call_next(request)
    
    end_time = datetime.utcnow()
    process_time = (end_time - start_time).total_seconds() * 1000
    logger.info(f"📤 {request_id} - Status: {response.status_code} - Time: {process_time:.2f}ms")
    
    return response

# ===== CHARGEMENT SÉCURISÉ DES ROUTERS =====
logger.info("🔄 Chargement des routers...")

# Fonction helper pour charger les routers
def load_router(module_path: str, router_name: str, description: str):
    """Charge un router de manière sécurisée"""
    try:
        module = __import__(module_path, fromlist=[router_name])
        router = getattr(module, router_name)
        app.include_router(router)
        logger.info(f"✅ {description} chargé avec succès")
        return True
    except ImportError as e:
        logger.warning(f"⚠️ {description} - Import Error: {e}")
        return False
    except AttributeError as e:
        logger.warning(f"⚠️ {description} - Attribute Error: {e}")
        return False
    except Exception as e:
        logger.error(f"❌ {description} - Erreur: {e}")
        return False

# Charger les routers simples (priorité)
triangles_loaded = load_router("app.routers.triangles_simple", "router", "Router Triangles Simple")
calculations_loaded = load_router("app.routers.calculations_simple", "router", "Router Calculations Simple")
workflow_loaded = load_workflow_router()
api_management_loaded = load_router("app.routers.api_management", "router", "Router API Management")

# Si les routers simples ne se chargent pas, essayer les anciens (avec gestion d'erreur)
if not triangles_loaded:
    logger.info("🔄 Tentative de chargement de l'ancien router Triangles...")
    triangles_loaded = load_router("app.routers.triangles", "router", "Router Triangles (ancien)")

if not calculations_loaded:
    logger.info("🔄 Tentative de chargement de l'ancien router Calculations...")
    calculations_loaded = load_router("app.routers.calculations", "router", "Router Calculations (ancien)")

# Résumé du chargement
logger.info(f"✨ Chargement terminé - Triangles: {'✅' if triangles_loaded else '❌'} | Calculations: {'✅' if calculations_loaded else '❌'} | API Management: {'✅' if api_management_loaded else '❌'}")
logger.info("🔧 MODE DÉVELOPPEMENT: Système d'authentification hybride désactivé temporairement")

# ===== GESTION D'ERREURS =====
@app.exception_handler(404)
async def not_found_handler(request, exc):
    return JSONResponse(
        status_code=404,
        content={
            "error": "Not Found",
            "message": f"Endpoint {request.url.path} introuvable",
            "suggestion": "Consultez /docs pour voir tous les endpoints",
            "development_mode": True,
            "note": "Certains endpoints d'authentification sont désactivés en mode développement",
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
    )

@app.exception_handler(500)
async def internal_error_handler(request, exc):
    logger.error(f"Erreur 500: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error",
            "message": "Erreur interne du serveur",
            "development_mode": True,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
    )

# ===== POINT D'ENTRÉE =====
if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0", 
        port=8000,
        reload=True,
        log_level="info"
    )