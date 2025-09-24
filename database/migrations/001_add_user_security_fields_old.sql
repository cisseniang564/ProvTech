-- ====================================================================
-- MIGRATION PROVTECH - PHASE 1 SÉCURITÉ
-- Fichiers à créer dans : /Users/cisseniang/Documents/ProvTech/database/migrations/
-- ====================================================================

-- ================== FICHIER 1 ==================
-- Nom : 001_add_user_security_fields.sql
-- Chemin : /Users/cisseniang/Documents/ProvTech/database/migrations/001_add_user_security_fields.sql
-- Description : Extension table users existante avec champs sécurité 2FA

-- Début de la migration
START TRANSACTION;

-- Vérification de l'existence de la table users
SELECT 'Migration 001: Extension table users avec fonctionnalités sécurisées' as message;

-- Extension de la table users existante (NON-DESTRUCTIF)
-- Ajout des colonnes pour l'authentification 2FA
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE COMMENT 'Authentification 2FA activée',
ADD COLUMN IF NOT EXISTS mfa_secret VARCHAR(255) NULL COMMENT 'Secret TOTP pour 2FA',
ADD COLUMN IF NOT EXISTS temp_mfa_secret VARCHAR(255) NULL COMMENT 'Secret temporaire lors de la configuration 2FA',
ADD COLUMN IF NOT EXISTS backup_codes JSON NULL COMMENT 'Codes de backup 2FA';

-- Ajout des colonnes pour le système de rôles actuariels
ALTER TABLE users
ADD COLUMN IF NOT EXISTS role ENUM(
    'ADMIN', 
    'ACTUAIRE_SENIOR', 
    'ACTUAIRE_JUNIOR', 
    'VALIDATEUR', 
    'AUDITEUR', 
    'CONSULTANT_EXTERNE'
) DEFAULT 'ACTUAIRE_JUNIOR' COMMENT 'Rôle actuariel de l\'utilisateur',
ADD COLUMN IF NOT EXISTS restrictions JSON NULL COMMENT 'Restrictions d\'accès (portefeuilles, branches, etc.)',
ADD COLUMN IF NOT EXISTS department VARCHAR(100) NULL COMMENT 'Département de l\'utilisateur';

-- Ajout des colonnes pour la traçabilité et sécurité
ALTER TABLE users
ADD COLUMN IF NOT EXISTS last_login TIMESTAMP NULL COMMENT 'Dernière connexion réussie',
ADD COLUMN IF NOT EXISTS failed_login_attempts INT DEFAULT 0 COMMENT 'Tentatives de connexion échouées',
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP NULL COMMENT 'Compte verrouillé jusqu\'à cette date',
ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP NULL COMMENT 'Dernière modification du mot de passe',
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE COMMENT 'Doit changer son mot de passe à la prochaine connexion';

-- Ajout des colonnes pour la migration
ALTER TABLE users
ADD COLUMN IF NOT EXISTS migrated_to_secure BOOLEAN DEFAULT FALSE COMMENT 'Utilisateur migré vers le système sécurisé',
ADD COLUMN IF NOT EXISTS migration_date TIMESTAMP NULL COMMENT 'Date de migration vers le système sécurisé',
ADD COLUMN IF NOT EXISTS legacy_auth_enabled BOOLEAN DEFAULT TRUE COMMENT 'Authentification legacy encore active';

-- Ajout des timestamps si pas déjà présents
ALTER TABLE users
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Date de création du compte',
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Dernière modification';

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_department ON users(department);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login);
CREATE INDEX IF NOT EXISTS idx_users_mfa_enabled ON users(mfa_enabled);
CREATE INDEX IF NOT EXISTS idx_users_migrated ON users(migrated_to_secure);

-- Validation : vérifier que les colonnes ont été ajoutées
SELECT 
    COLUMN_NAME, 
    DATA_TYPE, 
    IS_NULLABLE, 
    COLUMN_DEFAULT,
    COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'users' 
    AND COLUMN_NAME IN ('mfa_enabled', 'role', 'restrictions', 'last_login', 'migrated_to_secure')
ORDER BY COLUMN_NAME;

COMMIT;