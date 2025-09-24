-- ================== FICHIER 4 ==================
-- Nom : 004_create_user_permissions_table.sql
-- Chemin : /Users/cisseniang/Documents/ProvTech/database/migrations/004_create_user_permissions_table.sql
-- Description : Système de permissions granulaires

START TRANSACTION;

SELECT 'Migration 004: Création système de permissions granulaires' as message;

-- Table des permissions disponibles
CREATE TABLE IF NOT EXISTS permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE COMMENT 'Nom de la permission (ex: triangles:read)',
    resource VARCHAR(50) NOT NULL COMMENT 'Ressource concernée (triangles, calculations, etc.)',
    action VARCHAR(50) NOT NULL COMMENT 'Action autorisée (read, write, delete, etc.)',
    description TEXT NULL COMMENT 'Description de la permission',
    is_active BOOLEAN DEFAULT TRUE COMMENT 'Permission active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_permissions_resource (resource),
    INDEX idx_permissions_action (action),
    INDEX idx_permissions_active (is_active)
) ENGINE=InnoDB 
COMMENT='Définition des permissions disponibles dans le système';

-- Table de liaison role -> permissions (matrice de permissions)
CREATE TABLE IF NOT EXISTS role_permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    role ENUM(
        'ADMIN',
        'ACTUAIRE_SENIOR', 
        'ACTUAIRE_JUNIOR',
        'VALIDATEUR',
        'AUDITEUR',
        'CONSULTANT_EXTERNE'
    ) NOT NULL COMMENT 'Rôle actuariel',
    permission_id INT NOT NULL COMMENT 'ID de la permission',
    granted BOOLEAN DEFAULT TRUE COMMENT 'Permission accordée',
    conditions JSON NULL COMMENT 'Conditions d\'application (restrictions)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE KEY unique_role_permission (role, permission_id),
    INDEX idx_role_perms_role (role),
    INDEX idx_role_perms_permission (permission_id),
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB 
COMMENT='Matrice des permissions par rôle';

-- Table pour permissions utilisateur spécifiques (surcharges)
CREATE TABLE IF NOT EXISTS user_permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL COMMENT 'ID utilisateur',
    permission_id INT NOT NULL COMMENT 'ID permission',
    granted BOOLEAN NOT NULL COMMENT 'Permission accordée (TRUE) ou refusée (FALSE)',
    reason TEXT NULL COMMENT 'Raison de la surcharge',
    granted_by VARCHAR(255) NULL COMMENT 'ID utilisateur qui a accordé',
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL COMMENT 'Expiration de la permission temporaire',
    
    UNIQUE KEY unique_user_permission (user_id, permission_id),
    INDEX idx_user_perms_user (user_id),
    INDEX idx_user_perms_permission (permission_id),
    INDEX idx_user_perms_expires (expires_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB 
COMMENT='Permissions spécifiques par utilisateur (surcharges du rôle)';

-- Vue pour obtenir toutes les permissions effectives d'un utilisateur
CREATE OR REPLACE VIEW user_effective_permissions AS
SELECT DISTINCT
    u.id as user_id,
    u.email,
    u.role,
    p.id as permission_id,
    p.name as permission_name,
    p.resource,
    p.action,
    COALESCE(up.granted, rp.granted, FALSE) as granted,
    CASE 
        WHEN up.id IS NOT NULL THEN 'USER_OVERRIDE'
        WHEN rp.id IS NOT NULL THEN 'ROLE_BASED'
        ELSE 'NONE'
    END as source,
    up.expires_at,
    CASE 
        WHEN up.expires_at IS NOT NULL AND up.expires_at < NOW() THEN FALSE
        ELSE COALESCE(up.granted, rp.granted, FALSE)
    END as is_currently_granted
FROM users u
CROSS JOIN permissions p
LEFT JOIN role_permissions rp ON u.role = rp.role AND p.id = rp.permission_id
LEFT JOIN user_permissions up ON u.id = up.user_id AND p.id = up.permission_id
WHERE u.migrated_to_secure = TRUE
AND p.is_active = TRUE;

-- Insertion des permissions de base
INSERT IGNORE INTO permissions (name, resource, action, description) VALUES
-- Permissions Triangles
('triangles:read', 'triangles', 'read', 'Consulter les triangles de développement'),
('triangles:write', 'triangles', 'write', 'Créer et modifier les triangles'),
('triangles:delete', 'triangles', 'delete', 'Supprimer les triangles'),
('triangles:import', 'triangles', 'import', 'Importer des triangles depuis fichiers externes'),
('triangles:export', 'triangles', 'export', 'Exporter les triangles'),

-- Permissions Calculs
('calculations:read', 'calculations', 'read', 'Consulter les calculs actuariels'),
('calculations:write', 'calculations', 'write', 'Créer et modifier les calculs'),
('calculations:delete', 'calculations', 'delete', 'Supprimer les calculs'),
('calculations:run', 'calculations', 'run', 'Exécuter les calculs actuariels'),
('calculations:validate', 'calculations', 'validate', 'Valider les calculs'),

-- Permissions Rapports
('reports:read', 'reports', 'read', 'Consulter les rapports'),
('reports:generate', 'reports', 'generate', 'Générer de nouveaux rapports'),
('reports:export', 'reports', 'export', 'Exporter les rapports'),
('reports:sign', 'reports', 'sign', 'Signer électroniquement les rapports'),

-- Permissions Utilisateurs
('users:read', 'users', 'read', 'Consulter les utilisateurs'),
('users:write', 'users', 'write', 'Créer et modifier les utilisateurs'),
('users:delete', 'users', 'delete', 'Supprimer les utilisateurs'),

-- Permissions Audit
('audit:read', 'audit', 'read', 'Consulter les logs d\'audit'),
('audit:export', 'audit', 'export', 'Exporter les logs d\'audit');

-- Configuration des permissions par rôle
INSERT IGNORE INTO role_permissions (role, permission_id, granted) 
SELECT 'ADMIN', id, TRUE FROM permissions; -- Admin a toutes les permissions

INSERT IGNORE INTO role_permissions (role, permission_id, granted)
SELECT 'ACTUAIRE_SENIOR', p.id, TRUE FROM permissions p
WHERE p.name IN (
    'triangles:read', 'triangles:write', 'triangles:delete', 'triangles:import', 'triangles:export',
    'calculations:read', 'calculations:write', 'calculations:delete', 'calculations:run', 'calculations:validate',
    'reports:read', 'reports:generate', 'reports:export',
    'users:read', 'audit:read'
);

INSERT IGNORE INTO role_permissions (role, permission_id, granted)
SELECT 'ACTUAIRE_JUNIOR', p.id, TRUE FROM permissions p
WHERE p.name IN (
    'triangles:read', 'triangles:write',
    'calculations:read', 'calculations:write', 'calculations:run',
    'reports:read', 'reports:generate'
);

INSERT IGNORE INTO role_permissions (role, permission_id, granted)
SELECT 'VALIDATEUR', p.id, TRUE FROM permissions p
WHERE p.name IN (
    'triangles:read', 'triangles:write', 'triangles:delete', 'triangles:export',
    'calculations:read', 'calculations:write', 'calculations:run', 'calculations:validate',
    'reports:read', 'reports:generate', 'reports:export', 'reports:sign',
    'audit:read'
);

INSERT IGNORE INTO role_permissions (role, permission_id, granted)
SELECT 'AUDITEUR', p.id, TRUE FROM permissions p
WHERE p.name IN (
    'triangles:read', 'calculations:read', 'reports:read',
    'audit:read', 'audit:export'
);

INSERT IGNORE INTO role_permissions (role, permission_id, granted)
SELECT 'CONSULTANT_EXTERNE', p.id, TRUE FROM permissions p
WHERE p.name IN ('triangles:read', 'calculations:read', 'reports:read');

COMMIT;
