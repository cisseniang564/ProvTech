-- ================== FICHIER 2 ==================
-- Nom : 002_create_audit_logs_table.sql
-- Chemin : /Users/cisseniang/Documents/ProvTech/database/migrations/002_create_audit_logs_table.sql
-- Description : Création table logs d'audit pour traçabilité sécurité

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

-- Création d'une vue pour les événements récents (facilite les requêtes)
CREATE OR REPLACE VIEW recent_audit_events AS
SELECT 
    id,
    timestamp,
    user_email,
    user_role,
    event_type,
    event_category,
    resource_type,
    action_performed,
    result,
    ip_address,
    CASE 
        WHEN additional_data IS NOT NULL 
        THEN JSON_PRETTY(additional_data) 
        ELSE NULL 
    END as formatted_details
FROM audit_logs 
WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY)
ORDER BY timestamp DESC;

-- Procédure pour nettoyer les logs expirés (conformité GDPR)
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS CleanExpiredAuditLogs()
BEGIN
    DECLARE deleted_count INT DEFAULT 0;
    
    DELETE FROM audit_logs 
    WHERE retention_until < CURDATE() 
    AND is_sensitive = FALSE;
    
    SET deleted_count = ROW_COUNT();
    
    INSERT INTO audit_logs (
        event_type, 
        event_category, 
        action_performed, 
        result, 
        additional_data
    ) VALUES (
        'AUDIT_CLEANUP',
        'SYSTEM_EVENT',
        'EXPIRED_LOGS_DELETED',
        'SUCCESS',
        JSON_OBJECT('deleted_count', deleted_count)
    );
    
    SELECT CONCAT('Nettoyage terminé: ', deleted_count, ' logs supprimés') as message;
END //
DELIMITER ;

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

COMMIT;
