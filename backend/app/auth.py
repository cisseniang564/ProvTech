# backend/app/auth.py
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime, timedelta
from typing import Optional
import logging

# Import conditionally to avoid missing dependency errors
try:
    import jwt
    import bcrypt
    import pyotp
    JWT_AVAILABLE = True
except ImportError as e:
    print(f"Auth modules not available: {e}")
    JWT_AVAILABLE = False

# Configuration
JWT_SECRET = "your-super-secret-jwt-key-change-in-production"
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 1
REFRESH_EXPIRE_DAYS = 7

security = HTTPBearer()
logger = logging.getLogger("app.auth")

# ===== SIMULATED DATABASE (move to separate database module later) =====
USERS_DB = [
    {
        "id": 1,
        "email": "admin@provtech.com",
        "password": "$2b$12$example_hash_admin",  # You'll need to regenerate these
        "first_name": "Admin",
        "last_name": "ProvTech",
        "role": "ADMIN",
        "has_2fa": True,
        "is_migrated": True,
        "mfa_secret": "JBSWY3DPEHPK3PXP",
        "permissions": ["triangles:read", "triangles:write", "users:read", "users:write"],
        "created_at": datetime.utcnow().isoformat(),
    },
    {
        "id": 2,
        "email": "actuaire@provtech.com", 
        "password": "$2b$12$example_hash_actuaire",
        "first_name": "Jean",
        "last_name": "Dupont",
        "role": "ACTUAIRE_SENIOR",
        "has_2fa": False,
        "is_migrated": False,
        "mfa_secret": None,
        "permissions": ["triangles:read", "calculations:read"],
        "created_at": datetime.utcnow().isoformat(),
    },
    {
        "id": 3,
        "email": "test@provtech.com",
        "password": "$2b$12$example_hash_test",
        "first_name": "Test",
        "last_name": "User", 
        "role": "ACTUAIRE_JUNIOR",
        "has_2fa": False,
        "is_migrated": False,
        "mfa_secret": None,
        "permissions": ["triangles:read"],
        "created_at": datetime.utcnow().isoformat(),
    }
]

AUDIT_LOGS = []

# ===== UTILITY FUNCTIONS =====

def hash_password(password: str) -> str:
    """Hash a password"""
    if not JWT_AVAILABLE:
        return f"hashed_{password}"  # Fallback for development
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    """Verify a password"""
    if not JWT_AVAILABLE:
        return hashed == f"hashed_{password}"  # Fallback for development
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create a JWT access token"""
    if not JWT_AVAILABLE:
        return f"fake_token_{data.get('user_id', 'unknown')}"
    
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS)
    
    to_encode.update({"exp": expire, "type": "access"})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return encoded_jwt

def create_refresh_token(data: dict):
    """Create a JWT refresh token"""
    if not JWT_AVAILABLE:
        return f"fake_refresh_token_{data.get('user_id', 'unknown')}"
    
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=REFRESH_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return encoded_jwt

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify a JWT token"""
    if not JWT_AVAILABLE:
        # Fallback for development - extract user_id from fake token
        token = credentials.credentials
        if token.startswith("fake_token_"):
            try:
                user_id = int(token.split("_")[-1])
                return {"user_id": user_id, "email": f"user{user_id}@test.com"}
            except:
                pass
        raise HTTPException(status_code=401, detail="Invalid token")
    
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id: int = payload.get("user_id")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return payload
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

def find_user_by_email(email: str):
    """Find user by email"""
    return next((user for user in USERS_DB if user["email"] == email), None)

def find_user_by_id(user_id: int):
    """Find user by ID"""
    return next((user for user in USERS_DB if user["id"] == user_id), None)

def log_audit(user_id: int, action: str, details: str, ip_address: str = ""):
    """Log an audit action"""
    AUDIT_LOGS.append({
        "id": len(AUDIT_LOGS) + 1,
        "user_id": user_id,
        "action": action,
        "details": details,
        "ip_address": ip_address,
        "timestamp": datetime.utcnow().isoformat()
    })
    logger.info(f"Audit: User {user_id} - {action} - {details}")

def generate_2fa_secret() -> str:
    """Generate 2FA secret"""
    if not JWT_AVAILABLE:
        return "FAKE2FASECRET12345"
    return pyotp.random_base32()

def verify_2fa_token(secret: str, token: str) -> bool:
    """Verify 2FA token"""
    if not JWT_AVAILABLE:
        return token == "123456"  # Fallback for development
    totp = pyotp.TOTP(secret)
    return totp.verify(token, valid_window=2)