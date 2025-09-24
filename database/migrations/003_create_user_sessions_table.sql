-- ================== FICHIER 3 ==================
-- Nom : 003_create_user_sessions_table.sql  
-- Chemin : /Users/cisseniang/Documents/ProvTech/database/migrations/003_create_user_sessions_table.sql
-- Description : Gestion des sessions utilisateur et refresh tokens

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
    INDEX idx_sessions_last_used (last_used_at),
    
    -- Contraintes
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB 
COMMENT='Sessions utilisateur et gestion des refresh tokens JWT';

-- Vue pour sessions actives
CREATE OR REPLACE VIEW active_user_sessions AS
SELECT 
    s.id,
    s.user_id,
    s.user_email,
    s.ip_address,
    s.created_at,
    s.last_used_at,
    s.expires_at,
    s.security_flags,
    u.role,
    u.department,
    u.mfa_enabled,
    TIMESTAMPDIFF(MINUTE, s.last_used_at, NOW()) as minutes_since_last_use,
    TIMESTAMPDIFF(HOUR, s.expires_at, NOW()) as hours_until_expiry
FROM user_sessions s
JOIN users u ON s.user_id = u.id
WHERE s.is_active = TRUE 
AND s.expires_at > NOW()
ORDER BY s.last_used_at DESC;

-- Procédure pour nettoyer les sessions expirées
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS CleanExpiredSessions()
BEGIN
    DECLARE expired_count INT DEFAULT 0;
    
    -- Marquer les sessions expirées comme inactives
    UPDATE user_sessions 
    SET is_active = FALSE, 
        logout_reason = 'EXPIRED'
    WHERE expires_at < NOW() 
    AND is_active = TRUE;
    
    SET expired_count = ROW_COUNT();
    
    -- Supprimer les sessions expirées depuis plus de 30 jours
    DELETE FROM user_sessions 
    WHERE expires_at < DATE_SUB(NOW(), INTERVAL 30 DAY);
    
    -- Logger l'opération
    INSERT INTO audit_logs (
        event_type,
        event_category,
        action_performed,
        result,
        additional_data
    ) VALUES (
        'SESSION_CLEANUP',
        'SYSTEM_EVENT',
        'EXPIRED_SESSIONS_CLEANED',
        'SUCCESS',
        JSON_OBJECT('expired_count', expired_count)
    );
    
    SELECT CONCAT('Nettoyage sessions: ', expired_count, ' sessions expirées traitées') as message;
END //
DELIMITER ;

COMMIT;
