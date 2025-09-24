-- Migration 001: Extension table users - Compatible MySQL 5.7+
-- Fichier: /Users/cisseniang/Documents/ProvTech/database/migrations/001_add_user_security_fields_compatible.sql

START TRANSACTION;

-- Créer la table users de base si elle n'existe pas
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    firstName VARCHAR(100),
    lastName VARCHAR(100),
    isActive BOOLEAN DEFAULT TRUE
) ENGINE=InnoDB;

-- Procédure pour ajouter une colonne seulement si elle n'existe pas
DELIMITER //
CREATE PROCEDURE AddColumnIfNotExists(
    IN table_name VARCHAR(64),
    IN column_name VARCHAR(64),
    IN column_definition TEXT
)
BEGIN
    DECLARE col_exists INT DEFAULT 0;
    
    SELECT COUNT(*) INTO col_exists 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = table_name 
    AND COLUMN_NAME = column_name;
    
    IF col_exists = 0 THEN
        SET @sql = CONCAT('ALTER TABLE ', table_name, ' ADD COLUMN ', column_name, ' ', column_definition);
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
        SELECT CONCAT('Colonne ', column_name, ' ajoutée à ', table_name) as message;
    ELSE
        SELECT CONCAT('Colonne ', column_name, ' existe déjà dans ', table_name) as message;
    END IF;
END //
DELIMITER ;

-- Ajouter les colonnes 2FA
CALL AddColumnIfNotExists('users', 'mfa_enabled', 'BOOLEAN DEFAULT FALSE COMMENT "Authentification 2FA activée"');
CALL AddColumnIfNotExists('users', 'mfa_secret', 'VARCHAR(255) NULL COMMENT "Secret TOTP pour 2FA"');
CALL AddColumnIfNotExists('users', 'temp_mfa_secret', 'VARCHAR(255) NULL COMMENT "Secret temporaire 2FA"');

-- Ajouter les colonnes rôles
CALL AddColumnIfNotExists('users', 'role', 'ENUM("ADMIN", "ACTUAIRE_SENIOR", "ACTUAIRE_JUNIOR", "VALIDATEUR", "AUDITEUR", "CONSULTANT_EXTERNE") DEFAULT "ACTUAIRE_JUNIOR" COMMENT "Rôle actuariel"');
CALL AddColumnIfNotExists('users', 'restrictions', 'JSON NULL COMMENT "Restrictions d\'accès"');
CALL AddColumnIfNotExists('users', 'department', 'VARCHAR(100) NULL COMMENT "Département"');

-- Ajouter les colonnes sécurité
CALL AddColumnIfNotExists('users', 'last_login', 'TIMESTAMP NULL COMMENT "Dernière connexion"');
CALL AddColumnIfNotExists('users', 'failed_login_attempts', 'INT DEFAULT 0 COMMENT "Tentatives échouées"');
CALL AddColumnIfNotExists('users', 'locked_until', 'TIMESTAMP NULL COMMENT "Verrouillé jusqu\'à"');
CALL AddColumnIfNotExists('users', 'password_changed_at', 'TIMESTAMP NULL COMMENT "Mot de passe modifié le"');
CALL AddColumnIfNotExists('users', 'must_change_password', 'BOOLEAN DEFAULT FALSE COMMENT "Doit changer mot de passe"');

-- Ajouter les colonnes migration
CALL AddColumnIfNotExists('users', 'migrated_to_secure', 'BOOLEAN DEFAULT FALSE COMMENT "Migré vers système sécurisé"');
CALL AddColumnIfNotExists('users', 'migration_date', 'TIMESTAMP NULL COMMENT "Date de migration"');
CALL AddColumnIfNotExists('users', 'legacy_auth_enabled', 'BOOLEAN DEFAULT TRUE COMMENT "Auth legacy active"');

-- Ajouter timestamps
CALL AddColumnIfNotExists('users', 'created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT "Date création"');
CALL AddColumnIfNotExists('users', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT "Dernière modification"');

-- Créer les index (ignorer si existent déjà)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_department ON users(department);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login);
CREATE INDEX IF NOT EXISTS idx_users_mfa_enabled ON users(mfa_enabled);
CREATE INDEX IF NOT EXISTS idx_users_migrated ON users(migrated_to_secure);

-- Nettoyer la procédure temporaire
DROP PROCEDURE AddColumnIfNotExists;

-- Vérification finale
SELECT 'Migration 001 terminée avec succès' as result;
SELECT CONCAT('Table users contient maintenant ', COUNT(*), ' colonnes') as summary
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'users' AND TABLE_SCHEMA = DATABASE();

COMMIT;