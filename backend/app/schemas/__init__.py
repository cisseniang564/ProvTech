# app/schemas/__init__.py
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Any, Dict, List
from datetime import datetime

# ---------- Auth ----------
class UserBase(BaseModel):
    email: EmailStr

class UserCreate(UserBase):
    password: str = Field(min_length=8)
    full_name: Optional[str] = None
    role: Optional[str] = "user"

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    password: Optional[str] = Field(default=None, min_length=8)

class UserOut(UserBase):
    id: str
    is_active: bool
    full_name: Optional[str] = None
    role: Optional[str] = None
    created_at: datetime

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

# Alias attendu par certains routeurs
class UserResponse(UserOut):
    pass

class Token(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"

class TokenPayload(BaseModel):
    sub: str
    exp: int

# ---------- Triangles ----------
class TriangleBase(BaseModel):
    name: str
    description: Optional[str] = None

class TriangleCreate(TriangleBase):
    # ex: data: {"matrix":[[...],...], "meta": {...}}
    data: Dict[str, Any]

class TriangleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    data: Optional[Dict[str, Any]] = None

class TriangleOut(TriangleBase):
    id: str
    data: Dict[str, Any]
    created_at: datetime
    updated_at: Optional[datetime] = None

# Alias attendu par certains routeurs
class TriangleResponse(TriangleOut):
    pass

# ---------- Triangles Statistics ----------
class TriangleStatistics(BaseModel):
    size: Optional[int] = None                 # nb de cellules
    total: Optional[float] = None              # somme ou agrégat
    completeness: Optional[float] = None       # taux de complétude (0-1)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class TriangleStatisticsResponse(BaseModel):
    triangle_id: str
    statistics: TriangleStatistics

class TriangleListItem(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    triangles_ready: Optional[bool] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

class TriangleListResponse(BaseModel):
    items: List[TriangleListItem]
    total: int

# ---------- Calculations ----------
class CalculationCreateRequest(BaseModel):
    triangle_id: str
    method: str
    params: Optional[Dict[str, Any]] = {}
    requested_by: Optional[str] = None

class CalculationResponse(BaseModel):
    id: str
    triangle_id: str
    method: str
    status: str
    params: Dict[str, Any]
    result: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    ran_by: Optional[str] = None
    duration_ms: Optional[int] = None

class CalculationListResponse(BaseModel):
    items: List[CalculationResponse]
    total: int
# ---------- Auth (complément) ----------
class TokenData(BaseModel):
    """
    Données minimales extraites du JWT pour l'auth interne.
    Adapte si ton token contient d'autres champs (scopes, roles, etc.).
    """
    sub: Optional[str] = None      # user id / email
    exp: Optional[int] = None      # epoch seconds
    scopes: Optional[List[str]] = None
    role: Optional[str] = None


# ---------- Réponses génériques ----------
class SuccessResponse(BaseModel):
    ok: bool = True
    message: Optional[str] = None
    id: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


__all__ = [
    # Auth
    "UserBase", "UserCreate", "UserUpdate", "UserOut", "UserResponse",
    "LoginRequest", "Token", "TokenPayload",
    # Triangles
    "TriangleBase", "TriangleCreate", "TriangleUpdate",
    "TriangleOut", "TriangleResponse",
    # Triangles Statistics
    "TriangleStatistics", "TriangleStatisticsResponse",
    "TriangleListItem", "TriangleListResponse",
    # Calculations
    "CalculationCreateRequest", "CalculationResponse", "CalculationListResponse",
    "TokenData", "SuccessResponse",
]
