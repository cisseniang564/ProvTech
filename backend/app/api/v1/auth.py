"""
API Endpoint - Authentification et gestion des utilisateurs
Gère login, logout, refresh tokens, et gestion du profil
"""

from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from jose import JWTError, jwt
import secrets
import logging

# Import des schémas Pydantic
from app.schemas import (
    UserCreate, UserResponse, UserUpdate,
    Token, TokenData, LoginRequest, PasswordReset,
    SuccessResponse, ErrorResponse
)

# Import des modèles et services
from app.models.user import User
from app.core.database import get_db
from app.core.security import SecurityManager
from app.core.config import settings
from app.cache.redis_client import RedisCache
from app.utils.validators import validate_email
from app.services.notification_service import NotificationService

# Configuration
logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Authentication"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

# Instances des services
security_manager = SecurityManager()
redis_cache = RedisCache()
notification_service = NotificationService()

# ============================================================================
# DÉPENDANCES
# ============================================================================

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """
    Récupère l'utilisateur actuel à partir du token JWT
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        # Vérifier si le token est dans la blacklist
        if redis_cache.get(f"blacklist_token:{token}"):
            raise credentials_exception
        
        # Décoder le token
        payload = jwt.decode(
            token, 
            settings.JWT_SECRET_KEY, 
            algorithms=[settings.JWT_ALGORITHM]
        )
        username: str = payload.get("sub")
        user_id: int = payload.get("user_id")
        
        if username is None or user_id is None:
            raise credentials_exception
            
        token_data = TokenData(username=username, user_id=user_id)
        
    except JWTError:
        raise credentials_exception
    
    # Récupérer l'utilisateur de la base de données
    user = db.query(User).filter(User.id == token_data.user_id).first()
    
    if user is None:
        raise credentials_exception
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled"
        )
    
    return user

async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """Vérifie que l'utilisateur est actif"""
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

async def require_admin(
    current_user: User = Depends(get_current_active_user)
) -> User:
    """Vérifie que l'utilisateur est admin"""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    return current_user

# ============================================================================
# ENDPOINTS - AUTHENTIFICATION
# ============================================================================

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    user: UserCreate,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Créer un nouveau compte utilisateur
    """
    # Vérifier si l'email existe déjà
    if db.query(User).filter(User.email == user.email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Vérifier si le username existe déjà
    if db.query(User).filter(User.username == user.username).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken"
        )
    
    # Créer l'utilisateur
    db_user = User(
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        company=user.company,
        department=user.department,
        role=user.role,
        hashed_password=security_manager.hash_password(user.password),
        is_active=True,
        created_at=datetime.utcnow()
    )
    
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    # Log l'action
    logger.info(f"New user registered: {user.username} from IP: {request.client.host}")
    
    # Envoyer un email de bienvenue (async)
    await notification_service.send_welcome_email(db_user.email, db_user.username)
    
    return db_user

@router.post("/login", response_model=Token)
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """
    Connexion utilisateur et génération du token JWT
    """
    # Vérifier le rate limiting
    client_ip = request.client.host
    attempts_key = f"login_attempts:{client_ip}"
    attempts = redis_cache.get(attempts_key) or 0
    
    if attempts >= settings.MAX_LOGIN_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please try again later."
        )
    
    # Authentifier l'utilisateur
    user = db.query(User).filter(User.username == form_data.username).first()
    
    if not user or not security_manager.verify_password(form_data.password, user.hashed_password):
        # Incrémenter les tentatives échouées
        redis_cache.set(attempts_key, attempts + 1, ttl=300)  # 5 minutes
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled"
        )
    
    # Réinitialiser les tentatives de connexion
    redis_cache.delete(attempts_key)
    
    # Créer les tokens
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    refresh_token_expires = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    
    access_token = security_manager.create_access_token(
        data={"sub": user.username, "user_id": user.id, "role": user.role},
        expires_delta=access_token_expires
    )
    
    refresh_token = security_manager.create_refresh_token(
        data={"sub": user.username, "user_id": user.id},
        expires_delta=refresh_token_expires
    )
    
    # Mettre à jour la dernière connexion
    user.last_login = datetime.utcnow()
    db.commit()
    
    # Stocker le refresh token dans Redis
    redis_cache.set(
        f"refresh_token:{user.id}",
        refresh_token,
        ttl=int(refresh_token_expires.total_seconds())
    )
    
    # Log la connexion
    logger.info(f"User {user.username} logged in from IP: {client_ip}")
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": int(access_token_expires.total_seconds())
    }

@router.post("/logout", response_model=SuccessResponse)
async def logout(
    request: Request,
    current_user: User = Depends(get_current_active_user),
    token: str = Depends(oauth2_scheme)
):
    """
    Déconnexion utilisateur - invalide le token
    """
    # Ajouter le token à la blacklist
    redis_cache.set(
        f"blacklist_token:{token}",
        True,
        ttl=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )
    
    # Supprimer le refresh token
    redis_cache.delete(f"refresh_token:{current_user.id}")
    
    logger.info(f"User {current_user.username} logged out")
    
    return SuccessResponse(message="Successfully logged out")

@router.post("/refresh", response_model=Token)
async def refresh_token(
    refresh_token: str,
    db: Session = Depends(get_db)
):
    """
    Rafraîchir le token d'accès avec le refresh token
    """
    try:
        # Décoder le refresh token
        payload = jwt.decode(
            refresh_token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )
        username: str = payload.get("sub")
        user_id: int = payload.get("user_id")
        
        if not username or not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token"
            )
        
        # Vérifier que le refresh token est valide dans Redis
        stored_token = redis_cache.get(f"refresh_token:{user_id}")
        if stored_token != refresh_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token"
            )
        
        # Récupérer l'utilisateur
        user = db.query(User).filter(User.id == user_id).first()
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or inactive"
            )
        
        # Créer un nouveau access token
        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        new_access_token = security_manager.create_access_token(
            data={"sub": user.username, "user_id": user.id, "role": user.role},
            expires_delta=access_token_expires
        )
        
        return {
            "access_token": new_access_token,
            "refresh_token": refresh_token,  # Le refresh token reste le même
            "token_type": "bearer",
            "expires_in": int(access_token_expires.total_seconds())
        }
        
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )

@router.post("/password/reset-request", response_model=SuccessResponse)
async def request_password_reset(
    email: str,
    db: Session = Depends(get_db)
):
    """
    Demander une réinitialisation de mot de passe
    """
    user = db.query(User).filter(User.email == email).first()
    
    # Ne pas révéler si l'email existe ou non (sécurité)
    if user:
        # Générer un token de réinitialisation
        reset_token = secrets.token_urlsafe(32)
        
        # Stocker le token dans Redis avec expiration
        redis_cache.set(
            f"password_reset:{reset_token}",
            user.id,
            ttl=3600  # 1 heure
        )
        
        # Envoyer l'email de réinitialisation
        await notification_service.send_password_reset_email(
            user.email,
            user.username,
            reset_token
        )
        
        logger.info(f"Password reset requested for user: {user.username}")
    
    return SuccessResponse(
        message="If the email exists, a password reset link has been sent"
    )

@router.post("/password/reset", response_model=SuccessResponse)
async def reset_password(
    reset_data: PasswordReset,
    db: Session = Depends(get_db)
):
    """
    Réinitialiser le mot de passe avec le token
    """
    # Vérifier le token
    user_id = redis_cache.get(f"password_reset:{reset_data.token}")
    
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )
    
    # Récupérer l'utilisateur
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Mettre à jour le mot de passe
    user.hashed_password = security_manager.hash_password(reset_data.new_password)
    user.updated_at = datetime.utcnow()
    
    # Invalider le token
    redis_cache.delete(f"password_reset:{reset_data.token}")
    
    # Invalider tous les tokens d'accès de l'utilisateur
    redis_cache.delete(f"refresh_token:{user.id}")
    
    db.commit()
    
    logger.info(f"Password reset successful for user: {user.username}")
    
    return SuccessResponse(message="Password successfully reset")

# ============================================================================
# ENDPOINTS - GESTION DU PROFIL
# ============================================================================

@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: User = Depends(get_current_active_user)
):
    """
    Récupérer le profil de l'utilisateur connecté
    """
    # Ajouter les permissions basées sur le rôle
    permissions = get_user_permissions(current_user.role)
    
    response = UserResponse.from_orm(current_user)
    response.permissions = permissions
    
    # Récupérer les statistiques d'utilisation depuis le cache
    stats_key = f"user_stats:{current_user.id}"
    stats = redis_cache.get(stats_key)
    
    if stats:
        response.quota_used = stats.get("calculations_count", 0)
        response.quota_limit = get_quota_limit(current_user.role)
    
    return response

@router.put("/me", response_model=UserResponse)
async def update_current_user_profile(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Mettre à jour le profil de l'utilisateur connecté
    """
    # Mettre à jour les champs fournis
    update_data = user_update.dict(exclude_unset=True)
    
    for field, value in update_data.items():
        if field == "role" and current_user.role != "admin":
            # Seuls les admins peuvent changer les rôles
            continue
        setattr(current_user, field, value)
    
    current_user.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(current_user)
    
    logger.info(f"User profile updated: {current_user.username}")
    
    return current_user

@router.post("/me/change-password", response_model=SuccessResponse)
async def change_password(
    current_password: str,
    new_password: str,
    confirm_password: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Changer le mot de passe de l'utilisateur connecté
    """
    # Vérifier le mot de passe actuel
    if not security_manager.verify_password(current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )
    
    # Vérifier que les nouveaux mots de passe correspondent
    if new_password != confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New passwords do not match"
        )
    
    # Valider la force du nouveau mot de passe
    if len(new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters long"
        )
    
    # Mettre à jour le mot de passe
    current_user.hashed_password = security_manager.hash_password(new_password)
    current_user.updated_at = datetime.utcnow()
    
    db.commit()
    
    # Invalider tous les tokens
    redis_cache.delete(f"refresh_token:{current_user.id}")
    
    logger.info(f"Password changed for user: {current_user.username}")
    
    return SuccessResponse(message="Password successfully changed")

@router.delete("/me", response_model=SuccessResponse)
async def delete_account(
    password: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Supprimer le compte de l'utilisateur connecté
    """
    # Vérifier le mot de passe
    if not security_manager.verify_password(password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect password"
        )
    
    # Soft delete - marquer comme inactif
    current_user.is_active = False
    current_user.deleted_at = datetime.utcnow()
    
    # Invalider tous les tokens
    redis_cache.delete(f"refresh_token:{current_user.id}")
    
    db.commit()
    
    logger.info(f"Account deleted for user: {current_user.username}")
    
    return SuccessResponse(message="Account successfully deleted")

# ============================================================================
# ENDPOINTS - ADMINISTRATION (Admin only)
# ============================================================================

@router.get("/users", response_model=List[UserResponse])
async def get_all_users(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Récupérer tous les utilisateurs (Admin seulement)
    """
    users = db.query(User).offset(skip).limit(limit).all()
    return users

@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user_by_id(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Récupérer un utilisateur par ID (Admin seulement)
    """
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return user

@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_update: UserUpdate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Mettre à jour un utilisateur (Admin seulement)
    """
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    update_data = user_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)
    
    user.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(user)
    
    logger.info(f"User {user.username} updated by admin {current_user.username}")
    
    return user

@router.post("/users/{user_id}/activate", response_model=SuccessResponse)
async def activate_user(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Activer un compte utilisateur (Admin seulement)
    """
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    user.is_active = True
    user.updated_at = datetime.utcnow()
    
    db.commit()
    
    logger.info(f"User {user.username} activated by admin {current_user.username}")
    
    return SuccessResponse(message=f"User {user.username} successfully activated")

@router.post("/users/{user_id}/deactivate", response_model=SuccessResponse)
async def deactivate_user(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Désactiver un compte utilisateur (Admin seulement)
    """
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own account"
        )
    
    user.is_active = False
    user.updated_at = datetime.utcnow()
    
    # Invalider les tokens de l'utilisateur
    redis_cache.delete(f"refresh_token:{user.id}")
    
    db.commit()
    
    logger.info(f"User {user.username} deactivated by admin {current_user.username}")
    
    return SuccessResponse(message=f"User {user.username} successfully deactivated")

# ============================================================================
# FONCTIONS UTILITAIRES
# ============================================================================

def get_user_permissions(role: str) -> List[str]:
    """
    Retourne les permissions basées sur le rôle
    """
    permissions_map = {
        "admin": [
            "users:read", "users:write", "users:delete",
            "triangles:read", "triangles:write", "triangles:delete",
            "calculations:read", "calculations:write", "calculations:delete",
            "audit:read", "settings:write"
        ],
        "actuary": [
            "triangles:read", "triangles:write",
            "calculations:read", "calculations:write",
            "audit:read"
        ],
        "analyst": [
            "triangles:read", "triangles:write",
            "calculations:read", "calculations:write"
        ],
        "viewer": [
            "triangles:read",
            "calculations:read"
        ],
        "auditor": [
            "triangles:read",
            "calculations:read",
            "audit:read"
        ]
    }
    
    return permissions_map.get(role, [])

def get_quota_limit(role: str) -> int:
    """
    Retourne la limite de quota basée sur le rôle
    """
    quota_map = {
        "admin": 10000,
        "actuary": 1000,
        "analyst": 500,
        "viewer": 100,
        "auditor": 200
    }
    
    return quota_map.get(role, 100)