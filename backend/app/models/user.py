"""
Modèle utilisateur avec gestion des rôles et permissions
Système complet d'authentification et autorisation
"""

from sqlalchemy import Boolean, Column, Integer, String, DateTime, Text, ForeignKey, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID, ARRAY
import uuid
from datetime import datetime
from typing import List, Optional
from enum import Enum as PyEnum

from app.core.database import Base

# ================================
# TABLES D'ASSOCIATION
# ================================

# Table d'association many-to-many entre utilisateurs et rôles
user_roles = Table(
    'user_roles',
    Base.metadata,
    Column('user_id', Integer, ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
    Column('role_id', Integer, ForeignKey('roles.id', ondelete='CASCADE'), primary_key=True)
)

# Table d'association many-to-many entre rôles et permissions
role_permissions = Table(
    'role_permissions',
    Base.metadata,
    Column('role_id', Integer, ForeignKey('roles.id', ondelete='CASCADE'), primary_key=True),
    Column('permission_id', Integer, ForeignKey('permissions.id', ondelete='CASCADE'), primary_key=True)
)

# ================================
# ENUMS
# ================================

class UserStatus(PyEnum):
    """Statuts possibles d'un utilisateur"""
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"
    PENDING = "pending"
    DELETED = "deleted"


class AccountType(PyEnum):
    """Types de compte utilisateur"""
    INDIVIDUAL = "individual"
    COMPANY = "company"
    TRIAL = "trial"
    ENTERPRISE = "enterprise"


class AuthProvider(PyEnum):
    """Fournisseurs d'authentification"""
    LOCAL = "local"
    GOOGLE = "google"
    MICROSOFT = "microsoft"
    LDAP = "ldap"
    SSO = "sso"


# ================================
# MODÈLES PRINCIPAUX
# ================================

class Permission(Base):
    """
    Modèle des permissions système
    Définit les actions autorisées dans l'application
    """
    __tablename__ = "permissions"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    resource = Column(String(50), nullable=False)  # ex: "user", "calculation", "export"
    action = Column(String(50), nullable=False)    # ex: "read", "write", "delete"
    
    # Métadonnées
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relations
    roles = relationship("Role", secondary=role_permissions, back_populates="permissions")
    
    def __repr__(self):
        return f"<Permission(name='{self.name}', resource='{self.resource}', action='{self.action}')>"
    
    @property
    def full_name(self) -> str:
        """Nom complet de la permission (resource:action)"""
        return f"{self.resource}:{self.action}"


class Role(Base):
    """
    Modèle des rôles utilisateur
    Groupe logique de permissions
    """
    __tablename__ = "roles"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    is_system_role = Column(Boolean, default=False, nullable=False)  # Rôle système non modifiable
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Métadonnées
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    created_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    
    # Relations
    users = relationship("User", secondary=user_roles, back_populates="roles")
    permissions = relationship("Permission", secondary=role_permissions, back_populates="roles")
    creator = relationship("User", foreign_keys=[created_by])
    
    def __repr__(self):
        return f"<Role(name='{self.name}', active={self.is_active})>"
    
    def has_permission(self, permission_name: str) -> bool:
        """Vérifie si le rôle a une permission spécifique"""
        return any(perm.full_name == permission_name for perm in self.permissions)
    
    def get_permission_names(self) -> List[str]:
        """Retourne la liste des noms de permissions"""
        return [perm.full_name for perm in self.permissions]


class User(Base):
    """
    Modèle utilisateur principal
    Gestion complète des utilisateurs avec authentification et autorisation
    """
    __tablename__ = "users"
    
    # Identifiants
    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(UUID(as_uuid=True), default=uuid.uuid4, unique=True, nullable=False, index=True)
    
    # Informations personnelles
    email = Column(String(255), unique=True, index=True, nullable=False)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    company_name = Column(String(200), nullable=True)
    phone = Column(String(20), nullable=True)
    
    # Authentification
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)
    is_superuser = Column(Boolean, default=False, nullable=False)
    
    # Statut et type de compte
    status = Column(String(20), default=UserStatus.PENDING.value, nullable=False)
    account_type = Column(String(20), default=AccountType.TRIAL.value, nullable=False)
    auth_provider = Column(String(20), default=AuthProvider.LOCAL.value, nullable=False)
    
    # Sécurité
    failed_login_attempts = Column(Integer, default=0, nullable=False)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    password_changed_at = Column(DateTime(timezone=True), nullable=True)
    must_change_password = Column(Boolean, default=False, nullable=False)
    
    # Sessions et tokens
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    last_login_ip = Column(String(45), nullable=True)  # Support IPv6
    current_session_id = Column(String(255), nullable=True)
    api_key_hash = Column(String(255), nullable=True)
    
    # Préférences
    timezone = Column(String(50), default="UTC", nullable=False)
    language = Column(String(10), default="fr", nullable=False)
    date_format = Column(String(20), default="DD/MM/YYYY", nullable=False)
    number_format = Column(String(20), default="fr-FR", nullable=False)
    
    # Configuration métier
    default_currency = Column(String(3), default="EUR", nullable=False)
    default_calculation_method = Column(String(50), nullable=True)
    notification_preferences = Column(Text, nullable=True)  # JSON string
    
    # Limites et quotas
    max_triangles = Column(Integer, default=10, nullable=False)
    max_calculations_per_day = Column(Integer, default=100, nullable=False)
    storage_quota_mb = Column(Integer, default=100, nullable=False)
    
    # Métadonnées
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    deleted_at = Column(DateTime(timezone=True), nullable=True)  # Soft delete
    
    # Relations
    roles = relationship("Role", secondary=user_roles, back_populates="users")
    triangles = relationship("Triangle", back_populates="owner", cascade="all, delete-orphan")
    calculations = relationship("Calculation", back_populates="user", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="user")
    login_attempts = relationship("LoginAttempt", back_populates="user", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<User(email='{self.email}', name='{self.full_name}', active={self.is_active})>"
    
    # ================================
    # PROPRIÉTÉS CALCULÉES
    # ================================
    
    @property
    def full_name(self) -> str:
        """Nom complet de l'utilisateur"""
        return f"{self.first_name} {self.last_name}".strip()
    
    @property
    def display_name(self) -> str:
        """Nom d'affichage (avec entreprise si applicable)"""
        name = self.full_name
        if self.company_name:
            name += f" ({self.company_name})"
        return name
    
    @property
    def is_locked(self) -> bool:
        """Vérifie si le compte est verrouillé"""
        if self.locked_until:
            return datetime.utcnow() < self.locked_until.replace(tzinfo=None)
        return False
    
    @property
    def is_trial_expired(self) -> bool:
        """Vérifie si la période d'essai est expirée"""
        if self.account_type != AccountType.TRIAL.value:
            return False
        
        # Essai de 30 jours par défaut
        trial_duration = 30
        trial_end = self.created_at + timedelta(days=trial_duration)
        return datetime.utcnow() > trial_end.replace(tzinfo=None)
    
    # ================================
    # MÉTHODES DE GESTION DES RÔLES
    # ================================
    
    def has_role(self, role_name: str) -> bool:
        """Vérifie si l'utilisateur a un rôle spécifique"""
        return any(role.name == role_name for role in self.roles)
    
    def has_permission(self, permission_name: str) -> bool:
        """Vérifie si l'utilisateur a une permission spécifique"""
        if self.is_superuser:
            return True
        
        for role in self.roles:
            if role.has_permission(permission_name):
                return True
        return False
    
    def get_permissions(self) -> List[str]:
        """Retourne toutes les permissions de l'utilisateur"""
        if self.is_superuser:
            from app.core.security import Permission
            return Permission.get_all_permissions()
        
        permissions = set()
        for role in self.roles:
            permissions.update(role.get_permission_names())
        return list(permissions)
    
    def add_role(self, role: Role):
        """Ajoute un rôle à l'utilisateur"""
        if role not in self.roles:
            self.roles.append(role)
    
    def remove_role(self, role: Role):
        """Supprime un rôle de l'utilisateur"""
        if role in self.roles:
            self.roles.remove(role)
    
    # ================================
    # MÉTHODES DE SÉCURITÉ
    # ================================
    
    def record_failed_login(self):
        """Enregistre une tentative de connexion échouée"""
        self.failed_login_attempts += 1
        
        # Verrouillage après 5 tentatives
        if self.failed_login_attempts >= 5:
            from app.core.config import settings
            lockout_duration = timedelta(minutes=settings.LOGIN_LOCKOUT_MINUTES)
            self.locked_until = datetime.utcnow() + lockout_duration
    
    def reset_failed_logins(self):
        """Remet à zéro les tentatives de connexion échouées"""
        self.failed_login_attempts = 0
        self.locked_until = None
    
    def record_successful_login(self, ip_address: str, session_id: str):
        """Enregistre une connexion réussie"""
        self.last_login_at = datetime.utcnow()
        self.last_login_ip = ip_address
        self.current_session_id = session_id
        self.reset_failed_logins()
    
    def logout(self):
        """Déconnecte l'utilisateur"""
        self.current_session_id = None
    
    def change_password(self, new_password_hash: str):
        """Change le mot de passe de l'utilisateur"""
        self.hashed_password = new_password_hash
        self.password_changed_at = datetime.utcnow()
        self.must_change_password = False
    
    def force_password_change(self):
        """Force l'utilisateur à changer son mot de passe"""
        self.must_change_password = True
    
    # ================================
    # MÉTHODES DE GESTION DU COMPTE
    # ================================
    
    def activate(self):
        """Active le compte utilisateur"""
        self.is_active = True
        self.status = UserStatus.ACTIVE.value
    
    def deactivate(self):
        """Désactive le compte utilisateur"""
        self.is_active = False
        self.status = UserStatus.INACTIVE.value
        self.logout()
    
    def suspend(self, reason: str = None):
        """Suspend le compte utilisateur"""
        self.is_active = False
        self.status = UserStatus.SUSPENDED.value
        self.logout()
    
    def verify_email(self):
        """Marque l'email comme vérifié"""
        self.is_verified = True
        if self.status == UserStatus.PENDING.value:
            self.activate()
    
    def soft_delete(self):
        """Suppression logique de l'utilisateur"""
        self.is_active = False
        self.status = UserStatus.DELETED.value
        self.deleted_at = datetime.utcnow()
        self.logout()
    
    # ================================
    # MÉTHODES DE VALIDATION
    # ================================
    
    def can_create_triangle(self) -> bool:
        """Vérifie si l'utilisateur peut créer un nouveau triangle"""
        if self.is_superuser:
            return True
        
        current_count = len(self.triangles)
        return current_count < self.max_triangles
    
    def can_run_calculation(self) -> bool:
        """Vérifie si l'utilisateur peut lancer un calcul"""
        if self.is_superuser:
            return True
        
        # Vérifier le quota quotidien
        from datetime import date
        today = date.today()
        daily_calculations = sum(
            1 for calc in self.calculations
            if calc.created_at.date() == today
        )
        
        return daily_calculations < self.max_calculations_per_day
    
    def get_storage_usage_mb(self) -> float:
        """Retourne l'utilisation du stockage en MB"""
        # TODO: Calculer la taille réelle des fichiers
        return 0.0
    
    def can_upload_file(self, file_size_mb: float) -> bool:
        """Vérifie si l'utilisateur peut uploader un fichier"""
        current_usage = self.get_storage_usage_mb()
        return (current_usage + file_size_mb) <= self.storage_quota_mb


# ================================
# MODÈLES AUXILIAIRES
# ================================

class LoginAttempt(Base):
    """
    Historique des tentatives de connexion
    Pour audit et sécurité
    """
    __tablename__ = "login_attempts"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    email = Column(String(255), nullable=False, index=True)
    ip_address = Column(String(45), nullable=False)
    user_agent = Column(Text, nullable=True)
    success = Column(Boolean, nullable=False)
    failure_reason = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relations
    user = relationship("User", back_populates="login_attempts")
    
    def __repr__(self):
        status = "SUCCESS" if self.success else "FAILED"
        return f"<LoginAttempt(email='{self.email}', status='{status}', ip='{self.ip_address}')>"


class UserSession(Base):
    """
    Sessions utilisateur actives
    Gestion des sessions multiples et révocation
    """
    __tablename__ = "user_sessions"
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(255), unique=True, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    ip_address = Column(String(45), nullable=False)
    user_agent = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    last_activity = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    
    # Relations
    user = relationship("User")
    
    def __repr__(self):
        return f"<UserSession(user_id={self.user_id}, active={self.is_active})>"
    
    @property
    def is_expired(self) -> bool:
        """Vérifie si la session a expiré"""
        return datetime.utcnow() > self.expires_at.replace(tzinfo=None)
    
    def extend_session(self, minutes: int = 60):
        """Prolonge la session"""
        self.expires_at = datetime.utcnow() + timedelta(minutes=minutes)
        self.last_activity = datetime.utcnow()
    
    def revoke(self):
        """Révoque la session"""
        self.is_active = False


# ================================
# FONCTIONS UTILITAIRES
# ================================

def create_default_roles():
    """
    Crée les rôles par défaut du système
    À appeler lors de l'initialisation de la base de données
    """
    from app.db.session import SessionLocal
    from app.core.security import Permission as SecurityPermission
    
    db = SessionLocal()
    
    try:
        # Créer les permissions de base
        permissions_data = [
            ("user:read", "Lecture des utilisateurs", "user", "read"),
            ("user:write", "Écriture des utilisateurs", "user", "write"),
            ("user:delete", "Suppression des utilisateurs", "user", "delete"),
            ("calculation:read", "Lecture des calculs", "calculation", "read"),
            ("calculation:write", "Écriture des calculs", "calculation", "write"),
            ("calculation:execute", "Exécution des calculs", "calculation", "execute"),
            ("export:read", "Lecture des exports", "export", "read"),
            ("export:generate", "Génération des exports", "export", "generate"),
            ("audit:read", "Lecture des audits", "audit", "read"),
            ("admin:read", "Lecture admin", "admin", "read"),
            ("admin:write", "Écriture admin", "admin", "write"),
        ]
        
        permissions = {}
        for name, desc, resource, action in permissions_data:
            perm = db.query(Permission).filter(Permission.name == name).first()
            if not perm:
                perm = Permission(
                    name=name,
                    description=desc,
                    resource=resource,
                    action=action
                )
                db.add(perm)
            permissions[name] = perm
        
        db.commit()
        
        # Créer les rôles par défaut
        roles_data = [
            ("admin", "Administrateur système", [
                "user:read", "user:write", "user:delete",
                "calculation:read", "calculation:write", "calculation:execute",
                "export:read", "export:generate",
                "audit:read", "admin:read", "admin:write"
            ]),
            ("actuaire", "Actuaire", [
                "calculation:read", "calculation:write", "calculation:execute",
                "export:read", "export:generate"
            ]),
            ("analyste", "Analyste", [
                "calculation:read", "export:read"
            ]),
            ("utilisateur", "Utilisateur standard", [
                "calculation:read"
            ])
        ]
        
        for role_name, role_desc, role_permissions in roles_data:
            role = db.query(Role).filter(Role.name == role_name).first()
            if not role:
                role = Role(
                    name=role_name,
                    description=role_desc,
                    is_system_role=True
                )
                db.add(role)
                
                # Ajouter les permissions
                for perm_name in role_permissions:
                    if perm_name in permissions:
                        role.permissions.append(permissions[perm_name])
        
        db.commit()
        
    except Exception as e:
        db.rollback()
        raise
    finally:
        db.close()


# ================================
# EXPORTS
# ================================

__all__ = [
    "User",
    "Role", 
    "Permission",
    "LoginAttempt",
    "UserSession",
    "UserStatus",
    "AccountType",
    "AuthProvider",
    "user_roles",
    "role_permissions",
    "create_default_roles"
]