-- ================== FICHIER 5 ==================
-- Nom : 005_create_data_lineage_table.sql
-- Chemin : /Users/cisseniang/Documents/ProvTech/database/migrations/005_create_data_lineage_table.sql
-- Description : Traçabilité des sources de données (gouvernance)

START TRANSACTION;

SELECT 'Migration 005: Création tables pour traçabilité des données (data lineage)' as message;

-- Table principale de lignage des données
CREATE TABLE IF NOT EXISTS data_lineage (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    
    -- Source des données
    source_type ENUM(
        'MANUAL_ENTRY',
        'FILE_IMPORT', 
        'API_CALL',
        'DATABASE_QUERY',
        'CALCULATION_RESULT',
        'EXTERNAL_SYSTEM'
    ) NOT NULL COMMENT 'Type de source des données',
    source_identifier VARCHAR(500) NOT NULL COMMENT 'Identifiant de la source (nom fichier, URL API, etc.)',
    source_checksum VARCHAR(64) NULL COMMENT 'Empreinte SHA-256 des données source',
    
    -- Destination
    target_resource_type VARCHAR(50) NOT NULL COMMENT 'Type de ressource cible (triangle, calculation, etc.)',
    target_resource_id VARCHAR(255) NOT NULL COMMENT 'ID de la ressource cible',
    
    -- Métadonnées
    user_id VARCHAR(255) NOT NULL COMMENT 'Utilisateur ayant effectué l\'opération',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Date/heure de création du lineage',
    file_name VARCHAR(255) NULL COMMENT 'Nom du fichier source si applicable',
    file_size BIGINT NULL COMMENT 'Taille du fichier en octets',
    mime_type VARCHAR(100) NULL COMMENT 'Type MIME du fichier',
    
    -- Transformation appliquée
    transformation_applied TEXT NULL COMMENT 'Description de la transformation',
    validation_status ENUM('PENDING', 'VALIDATED', 'REJECTED', 'WARNING') DEFAULT 'PENDING',
    validation_errors JSON NULL COMMENT 'Erreurs de validation détectées',
    
    -- Métadonnées contextuelles
    business_context JSON NULL COMMENT 'Contexte métier (portefeuille, branche, période, etc.)',
    technical_metadata JSON NULL COMMENT 'Métadonnées techniques supplémentaires',
    
    -- Index
    INDEX idx_lineage_source_type (source_type),
    INDEX idx_lineage_target (target_resource_type, target_resource_id),
    INDEX idx_lineage_user (user_id),
    INDEX idx_lineage_created (created_at),
    INDEX idx_lineage_checksum (source_checksum),
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB 
COMMENT='Traçabilité des sources de données pour gouvernance et audit';

-- Table des étapes de transformation détaillées
CREATE TABLE IF NOT EXISTS data_transformations (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    lineage_id CHAR(36) NOT NULL COMMENT 'Référence vers le lineage parent',
    step_order INT NOT NULL COMMENT 'Ordre de l\'étape dans la chaîne',
    
    -- Détails de la transformation
    transformation_type VARCHAR(100) NOT NULL COMMENT 'Type de transformation appliquée',
    transformation_description TEXT NULL COMMENT 'Description détaillée',
    
    -- Schémas d'entrée et sortie
    input_schema JSON NULL COMMENT 'Schéma des données d\'entrée',
    output_schema JSON NULL COMMENT 'Schéma des données de sortie',
    
    -- Code/règles de transformation
    transformation_code TEXT NULL COMMENT 'Code ou règles de transformation',
    parameters JSON NULL COMMENT 'Paramètres utilisés',
    
    -- Résultat
    records_input INT NULL COMMENT 'Nombre d\'enregistrements en entrée',
    records_output INT NULL COMMENT 'Nombre d\'enregistrements en sortie',
    records_rejected INT DEFAULT 0 COMMENT 'Nombre d\'enregistrements rejetés',
    execution_time_ms INT NULL COMMENT 'Temps d\'exécution en millisecondes',
    
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_transforms_lineage (lineage_id),
    INDEX idx_transforms_order (lineage_id, step_order),
    INDEX idx_transforms_type (transformation_type),
    
    FOREIGN KEY (lineage_id) REFERENCES data_lineage(id) ON DELETE CASCADE
) ENGINE=InnoDB 
COMMENT='Étapes détaillées des transformations de données';

-- Table des contrôles qualité automatisés
CREATE TABLE IF NOT EXISTS data_quality_checks (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    lineage_id CHAR(36) NOT NULL COMMENT 'Référence vers le lineage',
    
    -- Type de contrôle
    check_type ENUM(
        'COMPLETENESS',
        'CONSISTENCY', 
        'VALIDITY',
        'ACCURACY',
        'UNIQUENESS',
        'INTEGRITY',
        'BUSINESS_RULES'
    ) NOT NULL COMMENT 'Type de contrôle qualité',
    
    check_name VARCHAR(100) NOT NULL COMMENT 'Nom du contrôle',
    check_description TEXT NULL COMMENT 'Description du contrôle',
    
    -- Résultats
    status ENUM('PASSED', 'FAILED', 'WARNING', 'SKIPPED') NOT NULL,
    score DECIMAL(5,2) NULL COMMENT 'Score qualité (0-100%)',
    
    -- Détails des anomalies
    records_checked INT NULL COMMENT 'Nombre d\'enregistrements vérifiés',
    records_failed INT NULL COMMENT 'Nombre d\'échecs',
    failure_details JSON NULL COMMENT 'Détails des échecs',
    
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    execution_time_ms INT NULL COMMENT 'Temps d\'exécution du contrôle',
    
    INDEX idx_quality_lineage (lineage_id),
    INDEX idx_quality_type (check_type),
    INDEX idx_quality_status (status),
    INDEX idx_quality_executed (executed_at),
    
    FOREIGN KEY (lineage_id) REFERENCES data_lineage(id) ON DELETE CASCADE
) ENGINE=InnoDB 
COMMENT='Contrôles qualité automatisés sur les données';

-- Vue pour le reporting de qualité des données
CREATE OR REPLACE VIEW data_quality_summary AS
SELECT 
    dl.id as lineage_id,
    dl.source_type,
    dl.target_resource_type,
    dl.target_resource_id,
    dl.created_at,
    u.email as user_email,
    
    COUNT(dqc.id) as total_checks,
    SUM(CASE WHEN dqc.status = 'PASSED' THEN 1 ELSE 0 END) as checks_passed,
    SUM(CASE WHEN dqc.status = 'FAILED' THEN 1 ELSE 0 END) as checks_failed,
    SUM(CASE WHEN dqc.status = 'WARNING' THEN 1 ELSE 0 END) as checks_warning,
    
    ROUND(AVG(dqc.score), 2) as avg_quality_score,
    
    CASE 
        WHEN COUNT(dqc.id) = 0 THEN 'NOT_CHECKED'
        WHEN SUM(CASE WHEN dqc.status = 'FAILED' THEN 1 ELSE 0 END) > 0 THEN 'FAILED'
        WHEN SUM(CASE WHEN dqc.status = 'WARNING' THEN 1 ELSE 0 END) > 0 THEN 'WARNING'
        ELSE 'PASSED'
    END as overall_status
    
FROM data_lineage dl
JOIN users u ON dl.user_id = u.id
LEFT JOIN data_quality_checks dqc ON dl.id = dqc.lineage_id
GROUP BY dl.id, dl.source_type, dl.target_resource_type, dl.target_resource_id, dl.created_at, u.email;

COMMIT;