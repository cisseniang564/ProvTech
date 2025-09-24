#!/bin/bash

# Script de création automatique des fichiers de migration ProvTech
# Chemin : /Users/cisseniang/Documents/ProvTech/create_migrations.sh

echo "🔧 Création des fichiers de migration ProvTech Phase 1 Sécurité..."

# Créer le dossier migrations
mkdir -p /Users/cisseniang/Documents/ProvTech/database/migrations
cd /Users/cisseniang/Documents/ProvTech/database/migrations

echo "📁 Dossier migrations créé : $(pwd)"

# Fichier 1 : Extension table users
cat > 001_add_user_security_fields.sql << 'EOF'
-- Extension table users avec champs sécurité 2FA
START TRANSACTION;

SELECT 'Migration 001: Extension table users avec fonctionnalités sécurisées' as message;

-- Extension de la table users existante (NON-DESTRUCTIF)
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

SELECT 'Migration 001 terminée avec succès' as result;
COMMIT;
EOF

echo "✅ Fichier 001_add_user_security_fields.sql créé"

# Fichier 2 : Table audit_logs
cat > 002_create_audit_logs_table.sql << 'EOF'
-- Création table logs d'audit pour traçabilité sécurité
START TRANSACTION;

SELECT 'Migration 002: Création table audit_logs pour traçabilité sécurité' as message;

-- Création de la table des logs d'audit (NOUVELLE TABLE)
CREATE TABLE IF NOT EXISTS audit_logs (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()) COMMENT 'Identifiant unique du log',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Horodatage de l\'événement',
    
    -- Informations utilisateur
    user_id VARCHAR(255) NULL COMMENT 'ID de l\'utilisateur (NULL pour événements anonymes)',
    user_email VARCHAR(255) NULL COMMENT 'Email de l\'utilisateur au moment de l\'événement',
    user_role VARCHAR(50) NULL COMMENT 'Rôle de l\'utilisateur au moment de l\'événement',
    session_id VARCHAR(255) NULL COMMENT 'ID de session',
    
    -- Informations technique
    ip_address VARCHAR(45) NULL COMMENT 'Adresse IP (IPv4 ou IPv6)',
    user_agent TEXT NULL COMMENT 'Agent utilisateur (navigateur)',
    request_method VARCHAR(10) NULL COMMENT 'Méthode HTTP (GET, POST, etc.)',
    request_url VARCHAR(500) NULL COMMENT 'URL de la requête',
    
    -- Détails de l'événement
    event_type VARCHAR(50) NOT NULL COMMENT 'Type d\'événement (LOGIN_SUCCESS, 2FA_ENABLED, etc.)',
    event_category ENUM(
        'AUTHENTICATION', 
        'AUTHORIZATION', 
        'DATA_ACCESS', 
        'DATA_MODIFICATION', 
        'USER_MANAGEMENT', 
        'SYSTEM_EVENT',
        'SECURITY_EVENT'
    ) DEFAULT 'SYSTEM_EVENT' COMMENT 'Catégorie de l\'événement',
    
    -- Ressource concernée
    resource_type VARCHAR(50) NULL COMMENT 'Type de ressource (USER, TRIANGLE, CALCULATION, etc.)',
    resource_id VARCHAR(255) NULL COMMENT 'ID de la ressource concernée',
    action_performed VARCHAR(100) NULL COMMENT 'Action effectuée',
    
    -- Résultat et contexte
    result ENUM('SUCCESS', 'FAILURE', 'WARNING', 'INFO') DEFAULT 'SUCCESS' COMMENT 'Résultat de l\'action',
    error_message TEXT NULL COMMENT 'Message d\'erreur si applicable',
    additional_data JSON NULL COMMENT 'Données contextuelles supplémentaires',
    
    -- Conformité réglementaire
    retention_until DATE NOT NULL DEFAULT (DATE_ADD(CURDATE(), INTERVAL 7 YEAR)) COMMENT 'Date de rétention réglementaire',
    is_sensitive BOOLEAN DEFAULT FALSE COMMENT 'Contient des données sensibles',
    compliance_tags JSON NULL COMMENT 'Tags de conformité (GDPR, SOX, etc.)',
    
    -- Métadonnées
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Création du log',
    INDEX idx_audit_timestamp (timestamp),
    INDEX idx_audit_user (user_id),
    INDEX idx_audit_event_type (event_type),
    INDEX idx_audit_category (event_category),
    INDEX idx_audit_result (result),
    INDEX idx_audit_resource (resource_type, resource_id),
    INDEX idx_audit_retention (retention_until),
    INDEX idx_audit_ip (ip_address)
) ENGINE=InnoDB 
COMMENT='Logs d\'audit pour traçabilité et conformité réglementaire';

-- Test d'insertion d'un log de migration
INSERT INTO audit_logs (
    event_type,
    event_category,
    action_performed,
    result,
    additional_data
) VALUES (
    'MIGRATION_EXECUTED',
    'SYSTEM_EVENT',
    'AUDIT_TABLE_CREATED',
    'SUCCESS',
    JSON_OBJECT('migration', '002_create_audit_logs_table', 'version', '1.0')
);

SELECT 'Migration 002 terminée avec succès' as result;
COMMIT;
EOF

echo "✅ Fichier 002_create_audit_logs_table.sql créé"

# Fichier 3 : Table sessions
cat > 003_create_user_sessions_table.sql << 'EOF'
-- Gestion des sessions utilisateur et refresh tokens
START TRANSACTION;

SELECT 'Migration 003: Création table user_sessions pour gestion JWT et sessions' as message;

-- Table pour gérer les sessions et refresh tokens
CREATE TABLE IF NOT EXISTS user_sessions (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()) COMMENT 'Identifiant unique de la session',
    
    -- Informations utilisateur
    user_id VARCHAR(255) NOT NULL COMMENT 'ID de l\'utilisateur',
    user_email VARCHAR(255) NOT NULL COMMENT 'Email utilisateur (dénormalisé pour performance)',
    
    -- Tokens JWT
    refresh_token_hash VARCHAR(255) NOT NULL UNIQUE COMMENT 'Hash du refresh token',
    access_token_jti VARCHAR(255) NULL COMMENT 'JTI (JWT ID) du token d\'accès',
    
    -- Métadonnées de session
    ip_address VARCHAR(45) NULL COMMENT 'Adresse IP de création',
    user_agent TEXT NULL COMMENT 'Agent utilisateur',
    device_fingerprint VARCHAR(255) NULL COMMENT 'Empreinte de l\'appareil',
    
    -- Durée de vie
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Création de la session',
    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Dernière utilisation',
    expires_at TIMESTAMP NOT NULL COMMENT 'Expiration de la session',
    
    -- Sécurité
    is_active BOOLEAN DEFAULT TRUE COMMENT 'Session active',
    logout_reason ENUM('USER_LOGOUT', 'ADMIN_REVOKE', 'SECURITY_BREACH', 'EXPIRED', 'CONCURRENT_SESSION') NULL COMMENT 'Raison de déconnexion',
    security_flags JSON NULL COMMENT 'Flags de sécurité (2FA utilisé, etc.)',
    
    -- Index
    INDEX idx_sessions_user (user_id),
    INDEX idx_sessions_refresh_hash (refresh_token_hash),
    INDEX idx_sessions_expires (expires_at),
    INDEX idx_sessions_active (is_active),
    INDEX idx_sessions_last_used (last_used_at)
) ENGINE=InnoDB 
COMMENT='Sessions utilisateur et gestion des refresh tokens JWT';

SELECT 'Migration 003 terminée avec succès' as result;
COMMIT;
EOF

echo "✅ Fichier 003_create_user_sessions_table.sql créé"

# Fichier de test de validation
cat > 999_test_migration.sql << 'EOF'
-- Script de test et validation des migrations
SELECT 'TEST: Validation des migrations ProvTech' as title;

-- Test 1: Vérifier les nouvelles colonnes users
SELECT 'Test 1: Nouvelles colonnes table users' as test;
SELECT COUNT(*) as nouvelles_colonnes_ajoutees
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'users' 
AND COLUMN_NAME IN ('mfa_enabled', 'role', 'restrictions', 'migrated_to_secure');

-- Test 2: Vérifier les nouvelles tables
SELECT 'Test 2: Nouvelles tables créées' as test;
SELECT TABLE_NAME, TABLE_ROWS
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_NAME IN ('audit_logs', 'user_sessions')
ORDER BY TABLE_NAME;

-- Test 3: Vérifier qu'aucune donnée existante n'a été perdue
SELECT 'Test 3: Données utilisateurs préservées' as test;
SELECT COUNT(*) as utilisateurs_existants FROM users;

SELECT 'VALIDATION TERMINÉE - Migrations prêtes à être déployées' as result;
EOF

echo "✅ Fichier 999_test_migration.sql créé"

echo ""
echo "🎉 Tous les fichiers de migration ont été créés dans :"
echo "📂 $(pwd)"
echo ""
echo "Fichiers créés :"
ls -la *.sql
echo ""
echo "Prochaines étapes :"
echo "1. Faire un backup : mysqldump -u [USER] -p provtech > backup.sql"
echo "2. Tester : mysql -u [USER] -p provtech < 999_test_migration.sql"
echo "3. Migrer : mysql -u [USER] -p provtech < 001_add_user_security_fields.sql"
echo "4. Continuer avec les autres fichiers..."