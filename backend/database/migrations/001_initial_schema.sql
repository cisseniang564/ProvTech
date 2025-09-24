-- ============================================================================
-- ACTUARIAL PROVISIONING SAAS - DATABASE SCHEMA (FIXED)
-- Version: 1.0.1 - Avec vérifications d'existence
-- Database: PostgreSQL 15+
-- ============================================================================

-- Nettoyer d'abord si nécessaire (optionnel - décommenter si besoin de reset complet)
-- DROP SCHEMA IF EXISTS public CASCADE;
-- CREATE SCHEMA public;

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- SCHEMAS
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS actuarial;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS compliance;

-- ============================================================================
-- TYPES & ENUMS (avec vérification d'existence)
-- ============================================================================

-- Fonction helper pour créer un type s'il n'existe pas
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'actuary', 'analyst', 'viewer', 'auditor');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE triangle_type AS ENUM ('paid', 'incurred', 'frequency', 'severity', 'rbns', 'ibnr');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE calculation_method AS ENUM ('chain_ladder', 'bornhuetter_ferguson', 'mack', 'cape_cod', 'munich_chain_ladder', 'bootstrap', 'glm');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE calculation_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE insurance_line AS ENUM ('auto_liability', 'auto_physical', 'property', 'casualty', 'workers_comp', 'professional_liability', 'general_liability', 'marine', 'health');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE currency_code AS ENUM ('EUR', 'USD', 'GBP', 'CHF', 'CAD', 'JPY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE tail_factor_type AS ENUM ('none', 'constant', 'exponential', 'curve_fitting', 'manual');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- TABLE USERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    company VARCHAR(255),
    department VARCHAR(100),
    role user_role DEFAULT 'viewer' NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    is_verified BOOLEAN DEFAULT false NOT NULL,
    
    -- Quotas
    quota_triangles INTEGER DEFAULT 10,
    quota_calculations INTEGER DEFAULT 100,
    quota_storage_mb INTEGER DEFAULT 1000,
    
    -- Timestamps
    last_login TIMESTAMP,
    password_changed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP,
    
    CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'),
    CONSTRAINT username_format CHECK (username ~* '^[a-zA-Z0-9_-]{3,50}$')
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_company ON users(company);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active) WHERE is_active = true;

-- ============================================================================
-- TABLE USER_SESSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    refresh_token_hash VARCHAR(255) UNIQUE,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);

-- ============================================================================
-- TABLE USER_PERMISSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_permissions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    resource VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    granted_by INTEGER REFERENCES users(id),
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at TIMESTAMP,
    UNIQUE(user_id, resource, action)
);

CREATE INDEX IF NOT EXISTS idx_permissions_user ON user_permissions(user_id);

-- ============================================================================
-- TABLE TRIANGLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS triangles (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    triangle_type triangle_type NOT NULL,
    insurance_line insurance_line,
    currency currency_code DEFAULT 'EUR' NOT NULL,
    unit VARCHAR(20) DEFAULT 'thousands',
    data JSONB NOT NULL,
    metadata JSONB DEFAULT '{}',
    is_locked BOOLEAN DEFAULT false,
    locked_by INTEGER REFERENCES users(id),
    locked_at TIMESTAMP,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_triangles_user ON triangles(user_id);
CREATE INDEX IF NOT EXISTS idx_triangles_type ON triangles(triangle_type);
CREATE INDEX IF NOT EXISTS idx_triangles_line ON triangles(insurance_line);
CREATE INDEX IF NOT EXISTS idx_triangles_created ON triangles(created_at);
CREATE INDEX IF NOT EXISTS idx_triangles_data_gin ON triangles USING gin(data);
CREATE INDEX IF NOT EXISTS idx_triangles_name_trgm ON triangles USING gin(name gin_trgm_ops);

-- ============================================================================
-- TABLE CALCULATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS calculations (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    triangle_id INTEGER REFERENCES triangles(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255),
    description TEXT,
    method calculation_method NOT NULL,
    parameters JSONB DEFAULT '{}',
    status calculation_status DEFAULT 'pending' NOT NULL,
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    results JSONB,
    error_message TEXT,
    warnings JSONB DEFAULT '[]',
    calculation_time_ms INTEGER,
    memory_used_mb INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    expires_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_calculations_triangle ON calculations(triangle_id);
CREATE INDEX IF NOT EXISTS idx_calculations_user ON calculations(user_id);
CREATE INDEX IF NOT EXISTS idx_calculations_status ON calculations(status);
CREATE INDEX IF NOT EXISTS idx_calculations_method ON calculations(method);
CREATE INDEX IF NOT EXISTS idx_calculations_created ON calculations(created_at);
CREATE INDEX IF NOT EXISTS idx_calculations_params_gin ON calculations USING gin(parameters);
CREATE INDEX IF NOT EXISTS idx_calculations_results_gin ON calculations USING gin(results);

-- ============================================================================
-- TABLE METHOD_COMPARISONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS method_comparisons (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    triangle_id INTEGER REFERENCES triangles(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255),
    description TEXT,
    calculation_ids INTEGER[] NOT NULL,
    comparison_results JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comparisons_triangle ON method_comparisons(triangle_id);
CREATE INDEX IF NOT EXISTS idx_comparisons_user ON method_comparisons(user_id);

-- ============================================================================
-- TABLE BENCHMARK_DATA
-- ============================================================================

CREATE TABLE IF NOT EXISTS benchmark_data (
    id SERIAL PRIMARY KEY,
    insurance_line insurance_line NOT NULL,
    region VARCHAR(50),
    period_year INTEGER NOT NULL,
    period_quarter INTEGER CHECK (period_quarter BETWEEN 1 AND 4),
    metrics JSONB NOT NULL,
    source VARCHAR(100),
    confidence_level DECIMAL(3,2),
    sample_size INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(insurance_line, region, period_year, period_quarter)
);

CREATE INDEX IF NOT EXISTS idx_benchmark_line ON benchmark_data(insurance_line);
CREATE INDEX IF NOT EXISTS idx_benchmark_period ON benchmark_data(period_year, period_quarter);

-- ============================================================================
-- TABLE NOTIFICATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    data JSONB,
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP,
    priority VARCHAR(20) DEFAULT 'normal',
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

-- ============================================================================
-- TABLES COMPLIANCE
-- ============================================================================

CREATE TABLE IF NOT EXISTS compliance.regulatory_templates (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    regulation VARCHAR(50) NOT NULL,
    version VARCHAR(20) NOT NULL,
    template_structure JSONB NOT NULL,
    validation_rules JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS compliance.reports (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    template_id INTEGER REFERENCES compliance.regulatory_templates(id),
    calculation_id INTEGER REFERENCES calculations(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    report_type VARCHAR(50) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    report_data JSONB NOT NULL,
    validation_status VARCHAR(20) DEFAULT 'draft',
    validation_errors JSONB,
    submitted_by INTEGER REFERENCES users(id),
    submitted_at TIMESTAMP,
    approved_by INTEGER REFERENCES users(id),
    approved_at TIMESTAMP,
    file_path TEXT,
    file_size_bytes INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_compliance_reports_user ON compliance.reports(user_id);
CREATE INDEX IF NOT EXISTS idx_compliance_reports_period ON compliance.reports(period_start, period_end);

-- ============================================================================
-- TABLES AUDIT (avec partitioning)
-- ============================================================================

-- Table principale d'audit avec partitioning
CREATE TABLE IF NOT EXISTS audit.audit_logs (
    id BIGSERIAL,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id INTEGER,
    resource_uuid UUID,
    details JSONB,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(255),
    request_id UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Créer les partitions pour les prochains mois (si elles n'existent pas)
DO $$
DECLARE
    start_date DATE;
    end_date DATE;
    partition_name TEXT;
BEGIN
    FOR i IN 0..11 LOOP
        start_date := DATE_TRUNC('month', CURRENT_DATE) + (i || ' months')::INTERVAL;
        end_date := start_date + INTERVAL '1 month';
        partition_name := 'audit_logs_' || TO_CHAR(start_date, 'YYYY_MM');
        
        IF NOT EXISTS (
            SELECT 1 FROM pg_tables 
            WHERE schemaname = 'audit' 
            AND tablename = partition_name
        ) THEN
            EXECUTE format('CREATE TABLE audit.%I PARTITION OF audit.audit_logs FOR VALUES FROM (%L) TO (%L)',
                partition_name, start_date, end_date);
        END IF;
    END LOOP;
END $$;

-- Indexes pour audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit.audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit.audit_logs(created_at);

-- Table des accès aux données sensibles
CREATE TABLE IF NOT EXISTS audit.sensitive_data_access (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    data_type VARCHAR(50) NOT NULL,
    data_id INTEGER,
    action VARCHAR(20) NOT NULL,
    reason TEXT,
    ip_address INET,
    accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sensitive_user ON audit.sensitive_data_access(user_id);
CREATE INDEX IF NOT EXISTS idx_sensitive_type ON audit.sensitive_data_access(data_type);
CREATE INDEX IF NOT EXISTS idx_sensitive_accessed ON audit.sensitive_data_access(accessed_at);

-- ============================================================================
-- VUES (Views)
-- ============================================================================

-- Vue pour les statistiques utilisateur
CREATE OR REPLACE VIEW user_statistics AS
SELECT 
    u.id,
    u.username,
    u.role,
    COUNT(DISTINCT t.id) as triangle_count,
    COUNT(DISTINCT c.id) as calculation_count,
    MAX(c.created_at) as last_calculation,
    COALESCE(SUM(CASE WHEN c.status = 'completed' THEN 1 ELSE 0 END), 0) as successful_calculations,
    COALESCE(AVG(c.calculation_time_ms), 0) as avg_calculation_time_ms
FROM users u
LEFT JOIN triangles t ON u.id = t.user_id AND t.deleted_at IS NULL
LEFT JOIN calculations c ON u.id = c.user_id
WHERE u.is_active = true
GROUP BY u.id, u.username, u.role;

-- Vue pour le tableau de bord des triangles
CREATE OR REPLACE VIEW triangle_dashboard AS
SELECT 
    t.id,
    t.name,
    t.triangle_type,
    t.insurance_line,
    t.currency,
    t.created_at,
    t.updated_at,
    u.username as owner,
    COUNT(DISTINCT c.id) as calculation_count,
    MAX(c.created_at) as last_calculation_date,
    t.is_locked
FROM triangles t
JOIN users u ON t.user_id = u.id
LEFT JOIN calculations c ON t.id = c.triangle_id
WHERE t.deleted_at IS NULL
GROUP BY t.id, t.name, t.triangle_type, t.insurance_line, t.currency, 
         t.created_at, t.updated_at, u.username, t.is_locked;

-- Vue pour les calculs récents
CREATE OR REPLACE VIEW recent_calculations AS
SELECT 
    c.id,
    c.name,
    c.method,
    c.status,
    c.created_at,
    c.completed_at,
    c.calculation_time_ms,
    t.name as triangle_name,
    u.username as user_name
FROM calculations c
JOIN triangles t ON c.triangle_id = t.id
JOIN users u ON c.user_id = u.id
WHERE c.created_at > CURRENT_DATE - INTERVAL '30 days'
ORDER BY c.created_at DESC;

-- ============================================================================
-- FONCTIONS STOCKÉES
-- ============================================================================

-- Fonction pour mettre à jour automatiquement updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour vérifier les quotas utilisateur
CREATE OR REPLACE FUNCTION check_user_quota()
RETURNS TRIGGER AS $$
DECLARE
    current_count INTEGER;
    user_quota INTEGER;
BEGIN
    SELECT quota_triangles INTO user_quota
    FROM users WHERE id = NEW.user_id;
    
    SELECT COUNT(*) INTO current_count
    FROM triangles 
    WHERE user_id = NEW.user_id AND deleted_at IS NULL;
    
    IF current_count >= user_quota THEN
        RAISE EXCEPTION 'User quota exceeded. Current: %, Limit: %', 
                        current_count, user_quota;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Triggers pour updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_triangles_updated_at ON triangles;
CREATE TRIGGER update_triangles_updated_at BEFORE UPDATE ON triangles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger pour vérifier les quotas
DROP TRIGGER IF EXISTS check_triangle_quota ON triangles;
CREATE TRIGGER check_triangle_quota BEFORE INSERT ON triangles
    FOR EACH ROW EXECUTE FUNCTION check_user_quota();

-- ============================================================================
-- PERMISSIONS & SÉCURITÉ
-- ============================================================================

-- Créer des rôles pour l'application
DO $$ BEGIN
    CREATE ROLE app_read;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE ROLE app_write;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE ROLE app_admin;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Permissions
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_read;
GRANT SELECT ON ALL TABLES IN SCHEMA actuarial TO app_read;
GRANT SELECT ON ALL TABLES IN SCHEMA audit TO app_read;
GRANT SELECT ON ALL TABLES IN SCHEMA compliance TO app_read;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_write;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA actuarial TO app_write;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA audit TO app_write;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA compliance TO app_write;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA actuarial TO app_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA audit TO app_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA compliance TO app_admin;

-- ============================================================================
-- DONNÉES INITIALES
-- ============================================================================

-- Insérer un utilisateur admin par défaut (si n'existe pas)
INSERT INTO users (email, username, hashed_password, full_name, role, is_active, is_verified)
VALUES (
    'admin@actuarial-saas.com',
    'admin',
    '$2b$12$LQmY5p3BhGBJqL5V3x8Nhe8Ms5Y0vJDhnCZv0K9hLJZ.eXHFqKJYK', -- password: Admin123!
    'System Administrator',
    'admin',
    true,
    true
) ON CONFLICT (email) DO NOTHING;

-- Insérer des templates réglementaires de base
INSERT INTO compliance.regulatory_templates (code, name, regulation, version, template_structure)
VALUES 
    ('IFRS17_BBA', 'IFRS 17 Building Block Approach', 'IFRS17', '2023.1', '{}'),
    ('S2_QRT_S1901', 'Solvency 2 - Non-life Claims Development', 'Solvency2', '2023.1', '{}'),
    ('S2_QRT_S2801', 'Solvency 2 - MCR Calculation', 'Solvency2', '2023.1', '{}')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- MESSAGE FINAL
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Schéma de base de données créé/mis à jour avec succès!';
    RAISE NOTICE '📊 Tables principales: users, triangles, calculations';
    RAISE NOTICE '🔒 Schémas: public, audit, compliance';
    RAISE NOTICE '👤 Admin par défaut: admin@actuarial-saas.com / Admin123!';
END $$;