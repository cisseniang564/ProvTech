"""
Gestion de la sécurité et de l'authentification
JWT, hashing des mots de passe, validation
"""

from datetime import datetime, timedelta
from typing import Any, Union, Optional, Dict
import secrets
import re
from passlib.context import CryptContext
from jose import JWTError, jwt
from fastapi import HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, validator
import logging

from app.core.config import settings

# Configuration du logging
logger = logging.getLogger(__name__)

# ================================
# PASSWORD HASHING
# ================================

# Configuration du contexte de chiffrement des mots de passe
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=12,  # Niveau de sécurité élevé
)


def create_password_hash(password: str) -> str:
    """
    Crée un hash sécurisé du mot de passe
    
    Args:
        password: Mot de passe en clair
        
    Returns:
        str: Hash du mot de passe
    """
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Vérifie si un mot de passe correspond à son hash
    
    Args:
        plain_password: Mot de passe en clair
        hashed_password: Hash stocké
        
    Returns:
        bool: True si le mot de passe est correct
    """
    return pwd_context.verify(plain_password, hashed_password)


def validate_password_strength(password: str) -> bool:
    """
    Valide la force d'un mot de passe selon les règles définies
    
    Args:
        password: Mot de passe à valider
        
    Returns:
        bool: True si le mot de passe respecte les critères
        
    Raises:
        ValueError: Si le mot de passe ne respecte pas les critères
    """
    errors = []
    
    # Longueur minimale
    if len(password) < settings.PASSWORD_MIN_LENGTH:
        errors.append(f"Le mot de passe doit contenir au moins {settings.PASSWORD_MIN_LENGTH} caractères")
    
    # Caractères requis
    if settings.PASSWORD_REQUIRE_UPPERCASE and not re.search(r'[A-Z]', password):
        errors.append("Le mot de passe doit contenir au moins une majuscule")
    
    if settings.PASSWORD_REQUIRE_LOWERCASE and not re.search(r'[a-z]', password):
        errors.append("Le mot de passe doit contenir au moins une minuscule")
    
    if settings.PASSWORD_REQUIRE_DIGITS and not re.search(r'\d', password):
        errors.append("Le mot de passe doit contenir au moins un chiffre")
    
    if settings.PASSWORD_REQUIRE_SPECIAL and not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
        errors.append("Le mot de passe doit contenir au moins un caractère spécial")
    
    # Vérifications additionnelles
    if password.lower() in ['password', 'admin', 'user', '123456', 'qwerty']:
        errors.append("Le mot de passe est trop commun")
    
    if errors:
        raise ValueError(". ".join(errors))
    
    return True


# ================================
# JWT TOKEN MANAGEMENT
# ================================

class TokenData(BaseModel):
    """
    Modèle pour les données contenues dans un token JWT
    """
    user_id: Optional[int] = None
    email: Optional[EmailStr] = None
    permissions: Optional[list] = []
    token_type: str = "access"


def create_access_token(
    subject: Union[str, Any], 
    expires_delta: Optional[timedelta] = None,
    additional_claims: Optional[Dict[str, Any]] = None
) -> str:
    """
    Crée un token d'accès JWT
    
    Args:
        subject: Identifiant de l'utilisateur (généralement l'email ou l'ID)
        expires_delta: Durée de validité personnalisée
        additional_claims: Claims additionnels à inclure
        
    Returns:
        str: Token JWT encodé
    """
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    # Claims de base
    to_encode = {
        "exp": expire,
        "iat": datetime.utcnow(),
        "sub": str(subject),
        "type": "access",
        "jti": secrets.token_hex(16)  # Unique token ID
    }
    
    # Ajout des claims additionnels
    if additional_claims:
        to_encode.update(additional_claims)
    
    # Encodage du token
    encoded_jwt = jwt.encode(
        to_encode, 
        settings.SECRET_KEY, 
        algorithm=settings.ALGORITHM
    )
    
    logger.debug(f"Token d'accès créé pour: {subject}")
    return encoded_jwt


def create_refresh_token(subject: Union[str, Any]) -> str:
    """
    Crée un token de rafraîchissement
    
    Args:
        subject: Identifiant de l'utilisateur
        
    Returns:
        str: Token de rafraîchissement JWT
    """
    expire = datetime.utcnow() + timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES)
    
    to_encode = {
        "exp": expire,
        "iat": datetime.utcnow(),
        "sub": str(subject),
        "type": "refresh",
        "jti": secrets.token_hex(16)
    }
    
    encoded_jwt = jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM
    )
    
    logger.debug(f"Token de rafraîchissement créé pour: {subject}")
    return encoded_jwt


def verify_token(token: str, token_type: str = "access") -> TokenData:
    """
    Vérifie et décode un token JWT
    
    Args:
        token: Token JWT à vérifier
        token_type: Type de token attendu ("access" ou "refresh")
        
    Returns:
        TokenData: Données extraites du token
        
    Raises:
        HTTPException: Si le token est invalide
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )
        
        # Vérification du type de token
        if payload.get("type") != token_type:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Type de token invalide. Attendu: {token_type}"
            )
        
        # Extraction des données
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token invalide: identifiant manquant"
            )
        
        return TokenData(
            user_id=int(user_id) if user_id.isdigit() else None,
            email=payload.get("email"),
            permissions=payload.get("permissions", []),
            token_type=token_type
        )
        
    except JWTError as e:
        logger.warning(f"Erreur de validation token: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide ou expiré"
        )


# ================================
# SECURITY UTILITIES
# ================================

def generate_password_reset_token(email: str) -> str:
    """
    Génère un token pour la réinitialisation de mot de passe
    
    Args:
        email: Email de l'utilisateur
        
    Returns:
        str: Token de réinitialisation
    """
    delta = timedelta(hours=settings.EMAIL_RESET_TOKEN_EXPIRE_HOURS)
    now = datetime.utcnow()
    expires = now + delta
    
    to_encode = {
        "exp": expires,
        "iat": now,
        "sub": email,
        "type": "password_reset",
        "jti": secrets.token_hex(16)
    }
    
    return jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM
    )


def verify_password_reset_token(token: str) -> Optional[str]:
    """
    Vérifie un token de réinitialisation de mot de passe
    
    Args:
        token: Token à vérifier
        
    Returns:
        Optional[str]: Email de l'utilisateur si le token est valide
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )
        
        if payload.get("type") != "password_reset":
            return None
            
        return payload.get("sub")
        
    except JWTError:
        return None


def generate_api_key() -> str:
    """
    Génère une clé API sécurisée
    
    Returns:
        str: Clé API
    """
    return f"ask_{secrets.token_urlsafe(32)}"


def hash_api_key(api_key: str) -> str:
    """
    Hash une clé API pour le stockage
    
    Args:
        api_key: Clé API en clair
        
    Returns:
        str: Hash de la clé API
    """
    return create_password_hash(api_key)


def verify_api_key(plain_api_key: str, hashed_api_key: str) -> bool:
    """
    Vérifie une clé API
    
    Args:
        plain_api_key: Clé API en clair
        hashed_api_key: Hash stocké
        
    Returns:
        bool: True si la clé est valide
    """
    return verify_password(plain_api_key, hashed_api_key)


# ================================
# RATE LIMITING UTILITIES
# ================================

class SecurityLimiter:
    """
    Gestionnaire de limitation de sécurité
    """
    
    def __init__(self):
        self.failed_attempts = {}
        self.blocked_ips = {}
    
    def record_failed_attempt(self, identifier: str):
        """
        Enregistre une tentative de connexion échouée
        
        Args:
            identifier: IP ou identifiant utilisateur
        """
        now = datetime.utcnow()
        
        if identifier not in self.failed_attempts:
            self.failed_attempts[identifier] = []
        
        self.failed_attempts[identifier].append(now)
        
        # Nettoie les anciennes tentatives (>15 minutes)
        cutoff = now - timedelta(minutes=settings.LOGIN_LOCKOUT_MINUTES)
        self.failed_attempts[identifier] = [
            attempt for attempt in self.failed_attempts[identifier]
            if attempt > cutoff
        ]
        
        # Bloque si trop de tentatives
        if len(self.failed_attempts[identifier]) >= settings.MAX_LOGIN_ATTEMPTS:
            self.blocked_ips[identifier] = now + timedelta(minutes=settings.LOGIN_LOCKOUT_MINUTES)
            logger.warning(f"IP/User bloqué pour tentatives répétées: {identifier}")
    
    def is_blocked(self, identifier: str) -> bool:
        """
        Vérifie si un identifiant est bloqué
        
        Args:
            identifier: IP ou identifiant utilisateur
            
        Returns:
            bool: True si bloqué
        """
        if identifier in self.blocked_ips:
            if datetime.utcnow() < self.blocked_ips[identifier]:
                return True
            else:
                # Déblocage automatique
                del self.blocked_ips[identifier]
                if identifier in self.failed_attempts:
                    del self.failed_attempts[identifier]
        
        return False
    
    def reset_attempts(self, identifier: str):
        """
        Remet à zéro les tentatives pour un identifiant
        
        Args:
            identifier: IP ou identifiant utilisateur
        """
        if identifier in self.failed_attempts:
            del self.failed_attempts[identifier]
        if identifier in self.blocked_ips:
            del self.blocked_ips[identifier]


# Instance globale du limiteur de sécurité
security_limiter = SecurityLimiter()

# ================================
# AUTHENTICATION DEPENDENCIES
# ================================

# Schéma d'authentification Bearer
security_scheme = HTTPBearer(auto_error=False)


async def get_current_user_token(
    credentials: Optional[HTTPAuthorizationCredentials] = None
) -> TokenData:
    """
    Dépendance FastAPI pour extraire et valider le token de l'utilisateur actuel
    
    Args:
        credentials: Credentials HTTP Bearer
        
    Returns:
        TokenData: Données du token validé
        
    Raises:
        HTTPException: Si le token est manquant ou invalide
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token d'authentification requis",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return verify_token(credentials.credentials, "access")


# ================================
# PERMISSION SYSTEM
# ================================

class Permission:
    """
    Définition des permissions système
    """
    # Permissions utilisateur
    USER_READ = "user:read"
    USER_WRITE = "user:write"
    USER_DELETE = "user:delete"
    
    # Permissions calculs
    CALCULATION_READ = "calculation:read"
    CALCULATION_WRITE = "calculation:write"
    CALCULATION_EXECUTE = "calculation:execute"
    
    # Permissions exports
    EXPORT_READ = "export:read"
    EXPORT_GENERATE = "export:generate"
    
    # Permissions audit
    AUDIT_READ = "audit:read"
    AUDIT_WRITE = "audit:write"
    
    # Permissions admin
    ADMIN_READ = "admin:read"
    ADMIN_WRITE = "admin:write"
    
    @classmethod
    def get_all_permissions(cls) -> list:
        """Retourne toutes les permissions disponibles"""
        return [
            value for name, value in cls.__dict__.items()
            if not name.startswith('_') and isinstance(value, str) and ':' in value
        ]


def check_permissions(required_permissions: list, user_permissions: list) -> bool:
    """
    Vérifie si l'utilisateur a les permissions requises
    
    Args:
        required_permissions: Permissions requises
        user_permissions: Permissions de l'utilisateur
        
    Returns:
        bool: True si l'utilisateur a les permissions
    """
    return all(perm in user_permissions for perm in required_permissions)


def require_permissions(*permissions):
    """
    Décorateur pour vérifier les permissions
    
    Args:
        *permissions: Permissions requises
        
    Returns:
        Décorateur de fonction
    """
    def decorator(func):
        async def wrapper(*args, **kwargs):
            # Extraction du token depuis les kwargs
            token_data = kwargs.get('current_user')
            if not token_data:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentification requise"
                )
            
            if not check_permissions(list(permissions), token_data.permissions):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Permissions insuffisantes"
                )
            
            return await func(*args, **kwargs)
        return wrapper
    return decorator


# ================================
# DATA VALIDATION
# ================================

def sanitize_input(input_string: str) -> str:
    """
    Nettoie et sécurise une chaîne d'entrée
    
    Args:
        input_string: Chaîne à nettoyer
        
    Returns:
        str: Chaîne nettoyée
    """
    if not input_string:
        return ""
    
    # Supprime les caractères dangereux
    dangerous_chars = ['<', '>', '"', "'", '&', '\x00', '\r', '\n']
    cleaned = input_string
    
    for char in dangerous_chars:
        cleaned = cleaned.replace(char, '')
    
    # Limite la longueur
    return cleaned[:1000].strip()


def validate_email_format(email: str) -> bool:
    """
    Valide le format d'un email
    
    Args:
        email: Email à valider
        
    Returns:
        bool: True si le format est valide
    """
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None


# ================================
# EXPORTS
# ================================

__all__ = [
    "pwd_context",
    "create_password_hash",
    "verify_password",
    "validate_password_strength",
    "create_access_token",
    "create_refresh_token",
    "verify_token",
    "generate_password_reset_token",
    "verify_password_reset_token",
    "generate_api_key",
    "hash_api_key",
    "verify_api_key",
    "security_limiter",
    "get_current_user_token",
    "Permission",
    "check_permissions",
    "require_permissions",
    "sanitize_input",
    "validate_email_format",
    "TokenData"
]