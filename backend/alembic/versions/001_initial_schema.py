"""
Migration Alembic - Création initiale de la base de données
alembic/versions/001_initial_schema.py
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from datetime import datetime

# revision identifiers
revision = '001_initial_schema'
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    """
    Créer toutes les tables et structures de la base de données
    """
    
    # ============================================================================
    # CRÉATION DES TYPES ENUM
    # ============================================================================
    
    # User roles
    user_role_enum = postgresql.ENUM(
        'admin', 'actuary', 'analyst', 'viewer', 'auditor',
        name='user_role'
    )
    user_role_enum.create(op.get_bind())
    
    # Triangle types
    triangle_type_enum = postgresql.ENUM(
        'paid', 'incurred', 'frequency', 'severity', 'rbns', 'ibnr',
        name='triangle_type'
    )
    triangle_type_enum.create(op.get_bind())
    
    # Calculation methods
    calculation_method_enum = postgresql.ENUM(
        'chain_ladder', 'bornhuetter_ferguson', 'mack', 'cape_cod',
        'munich_chain_ladder', 'bootstrap', 'glm',
        name='calculation_method'
    )
    calculation_method_enum.create(op.get_bind())
    
    # Calculation status
    calculation_status_enum = postgresql.ENUM(
        'pending', 'processing', 'completed', 'failed', 'cancelled',
        name='calculation_status'
    )
    calculation_status_enum.create(op.get_bind())
    
    # Insurance lines
    insurance_line_enum = postgresql.ENUM(
        'auto_liability', 'auto_physical', 'property', 'casualty',
        'workers_comp', 'professional_liability', 'general_liability',
        'marine', 'health',
        name='insurance_line'
    )
    insurance_line_enum.create(op.get_bind())
    
    # Currency codes
    currency_code_enum = postgresql.ENUM(
        'EUR', 'USD', 'GBP', 'CHF', 'CAD', 'JPY',
        name='currency_code'
    )
    currency_code_enum.create(op.get_bind())
    
    # Tail factor types
    tail_factor_type_enum = postgresql.ENUM(
        'none', 'constant', 'exponential', 'curve_fitting', 'manual',
        name='tail_factor_type'
    )
    tail_factor_type_enum.create(op.get_bind())
    
    # ============================================================================
    # TABLE USERS
    # ============================================================================
    
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('uuid', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('username', sa.String(50), nullable=False),
        sa.Column('hashed_password', sa.String(255), nullable=False),
        sa.Column('full_name', sa.String(255), nullable=True),
        sa.Column('company', sa.String(255), nullable=True),
        sa.Column('department', sa.String(100), nullable=True),
        sa.Column('role', sa.Enum('admin', 'actuary', 'analyst', 'viewer', 'auditor', 
                                  name='user_role'), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, default=True),
        sa.Column('is_verified', sa.Boolean(), nullable=False, default=False),
        
        # Quotas
        sa.Column('quota_triangles', sa.Integer(), default=10),
        sa.Column('quota_calculations', sa.Integer(), default=100),
        sa.Column('quota_storage_mb', sa.Integer(), default=1000),
        
        # Timestamps
        sa.Column('last_login', sa.DateTime(), nullable=True),
        sa.Column('password_changed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, default=datetime.utcnow),
        sa.Column('updated_at', sa.DateTime(), nullable=False, default=datetime.utcnow),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('uuid'),
        sa.UniqueConstraint('email'),
        sa.UniqueConstraint('username')
    )
    
    # Indexes pour users
    op.create_index('idx_users_email', 'users', ['email'])
    op.create_index('idx_users_username', 'users', ['username'])
    op.create_index('idx_users_company', 'users', ['company'])
    op.create_index('idx_users_role', 'users', ['role'])
    op.create_index('idx_users_active', 'users', ['is_active'], 
                    postgresql_where=sa.text('is_active = true'))
    
    # ============================================================================
    # TABLE USER_SESSIONS
    # ============================================================================
    
    op.create_table(
        'user_sessions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('token_hash', sa.String(255), nullable=False),
        sa.Column('refresh_token_hash', sa.String(255), nullable=True),
        sa.Column('ip_address', postgresql.INET(), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, default=datetime.utcnow),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
        
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('token_hash'),
        sa.UniqueConstraint('refresh_token_hash'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE')
    )
    
    op.create_index('idx_sessions_user', 'user_sessions', ['user_id'])
    op.create_index('idx_sessions_token', 'user_sessions', ['token_hash'])
    op.create_index('idx_sessions_expires', 'user_sessions', ['expires_at'])
    
    # ============================================================================
    # TABLE USER_PERMISSIONS
    # ============================================================================
    
    op.create_table(
        'user_permissions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('resource', sa.String(50), nullable=False),
        sa.Column('action', sa.String(50), nullable=False),
        sa.Column('granted_by', sa.Integer(), nullable=True),
        sa.Column('granted_at', sa.DateTime(), nullable=False, default=datetime.utcnow),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'resource', 'action'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['granted_by'], ['users.id'])
    )
    
    op.create_index('idx_permissions_user', 'user_permissions', ['user_id'])
    
    # ============================================================================
    # TABLE TRIANGLES
    # ============================================================================
    
    op.create_table(
        'triangles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('uuid', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        
        # Informations de base
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('triangle_type', sa.Enum('paid', 'incurred', 'frequency', 'severity', 
                                           'rbns', 'ibnr', name='triangle_type'), nullable=False),
        sa.Column('insurance_line', sa.Enum('auto_liability', 'auto_physical', 'property', 
                                            'casualty', 'workers_comp', 'professional_liability',
                                            'general_liability', 'marine', 'health',
                                            name='insurance_line'), nullable=True),
        sa.Column('currency', sa.Enum('EUR', 'USD', 'GBP', 'CHF', 'CAD', 'JPY',
                                      name='currency_code'), nullable=False, default='EUR'),
        sa.Column('unit', sa.String(20), default='thousands'),
        
        # Données JSON
        sa.Column('data', postgresql.JSONB(), nullable=False),
        sa.Column('metadata', postgresql.JSONB(), default={}),
        
        # Contrôles
        sa.Column('is_locked', sa.Boolean(), default=False),
        sa.Column('locked_by', sa.Integer(), nullable=True),
        sa.Column('locked_at', sa.DateTime(), nullable=True),
        sa.Column('version', sa.Integer(), default=1),
        
        # Timestamps
        sa.Column('created_at', sa.DateTime(), nullable=False, default=datetime.utcnow),
        sa.Column('updated_at', sa.DateTime(), nullable=False, default=datetime.utcnow),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('uuid'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['locked_by'], ['users.id'])
    )
    
    # Indexes pour triangles
    op.create_index('idx_triangles_user', 'triangles', ['user_id'])
    op.create_index('idx_triangles_type', 'triangles', ['triangle_type'])
    op.create_index('idx_triangles_line', 'triangles', ['insurance_line'])
    op.create_index('idx_triangles_created', 'triangles', ['created_at'])
    op.create_index('idx_triangles_data_gin', 'triangles', ['data'], postgresql_using='gin')
    
    # ============================================================================
    # TABLE CALCULATIONS
    # ============================================================================
    
    op.create_table(
        'calculations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('uuid', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('triangle_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        
        # Configuration
        sa.Column('name', sa.String(255), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('method', sa.Enum('chain_ladder', 'bornhuetter_ferguson', 'mack', 
                                    'cape_cod', 'munich_chain_ladder', 'bootstrap', 'glm',
                                    name='calculation_method'), nullable=False),
        sa.Column('parameters', postgresql.JSONB(), default={}),
        
        # Statut et résultats
        sa.Column('status', sa.Enum('pending', 'processing', 'completed', 'failed', 'cancelled',
                                    name='calculation_status'), nullable=False, default='pending'),
        sa.Column('progress', sa.Integer(), default=0),
        sa.Column('results', postgresql.JSONB(), nullable=True),
        
        # Erreurs
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('warnings', postgresql.JSONB(), default=[]),
        
        # Performance
        sa.Column('calculation_time_ms', sa.Integer(), nullable=True),
        sa.Column('memory_used_mb', sa.Integer(), nullable=True),
        
        # Timestamps
        sa.Column('created_at', sa.DateTime(), nullable=False, default=datetime.utcnow),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('uuid'),
        sa.ForeignKeyConstraint(['triangle_id'], ['triangles.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.CheckConstraint('progress >= 0 AND progress <= 100')
    )
    
    # Indexes pour calculations
    op.create_index('idx_calculations_triangle', 'calculations', ['triangle_id'])
    op.create_index('idx_calculations_user', 'calculations', ['user_id'])
    op.create_index('idx_calculations_status', 'calculations', ['status'])
    op.create_index('idx_calculations_method', 'calculations', ['method'])
    op.create_index('idx_calculations_created', 'calculations', ['created_at'])
    op.create_index('idx_calculations_params_gin', 'calculations', ['parameters'], 
                    postgresql_using='gin')
    op.create_index('idx_calculations_results_gin', 'calculations', ['results'], 
                    postgresql_using='gin')
    
    # ============================================================================
    # TABLE METHOD_COMPARISONS
    # ============================================================================
    
    op.create_table(
        'method_comparisons',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('uuid', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('triangle_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(255), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('calculation_ids', postgresql.ARRAY(sa.Integer()), nullable=False),
        sa.Column('comparison_results', postgresql.JSONB(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, default=datetime.utcnow),
        
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('uuid'),
        sa.ForeignKeyConstraint(['triangle_id'], ['triangles.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE')
    )
    
    op.create_index('idx_comparisons_triangle', 'method_comparisons', ['triangle_id'])
    op.create_index('idx_comparisons_user', 'method_comparisons', ['user_id'])
    
    # ============================================================================
    # TABLE BENCHMARK_DATA
    # ============================================================================
    
    op.create_table(
        'benchmark_data',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('insurance_line', sa.Enum('auto_liability', 'auto_physical', 'property', 
                                            'casualty', 'workers_comp', 'professional_liability',
                                            'general_liability', 'marine', 'health',
                                            name='insurance_line'), nullable=False),
        sa.Column('region', sa.String(50), nullable=True),
        sa.Column('period_year', sa.Integer(), nullable=False),
        sa.Column('period_quarter', sa.Integer(), nullable=True),
        sa.Column('metrics', postgresql.JSONB(), nullable=False),
        sa.Column('source', sa.String(100), nullable=True),
        sa.Column('confidence_level', sa.Numeric(3, 2), nullable=True),
        sa.Column('sample_size', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, default=datetime.utcnow),
        sa.Column('updated_at', sa.DateTime(), nullable=False, default=datetime.utcnow),
        
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('insurance_line', 'region', 'period_year', 'period_quarter'),
        sa.CheckConstraint('period_quarter BETWEEN 1 AND 4')
    )
    
    op.create_index('idx_benchmark_line', 'benchmark_data', ['insurance_line'])
    op.create_index('idx_benchmark_period', 'benchmark_data', ['period_year', 'period_quarter'])
    
    # ============================================================================
    # TABLE NOTIFICATIONS
    # ============================================================================
    
    op.create_table(
        'notifications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('type', sa.String(50), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('message', sa.Text(), nullable=True),
        sa.Column('data', postgresql.JSONB(), nullable=True),
        sa.Column('is_read', sa.Boolean(), default=False),
        sa.Column('read_at', sa.DateTime(), nullable=True),
        sa.Column('priority', sa.String(20), default='normal'),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, default=datetime.utcnow),
        
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE')
    )
    
    op.create_index('idx_notifications_user', 'notifications', ['user_id'])
    op.create_index('idx_notifications_unread', 'notifications', ['user_id', 'is_read'],
                    postgresql_where=sa.text('is_read = false'))
    op.create_index('idx_notifications_created', 'notifications', ['created_at'])
    
    # ============================================================================
    # CRÉATION DES SCHÉMAS
    # ============================================================================
    
    op.execute('CREATE SCHEMA IF NOT EXISTS audit')
    op.execute('CREATE SCHEMA IF NOT EXISTS compliance')
    
    # ============================================================================
    # TABLE AUDIT_LOGS (avec partitioning)
    # ============================================================================
    
    op.execute("""
        CREATE TABLE audit.audit_logs (
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
        ) PARTITION BY RANGE (created_at)
    """)
    
    # Créer les partitions pour les prochains mois
    from dateutil.relativedelta import relativedelta
    current_date = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    for i in range(12):  # Créer 12 mois de partitions
        start_date = current_date + relativedelta(months=i)
        end_date = start_date + relativedelta(months=1)
        partition_name = f"audit_logs_{start_date.year}_{start_date.month:02d}"
        
        op.execute(f"""
            CREATE TABLE audit.{partition_name} PARTITION OF audit.audit_logs
            FOR VALUES FROM ('{start_date.isoformat()}') TO ('{end_date.isoformat()}')
        """)
    
    # Indexes pour audit_logs
    op.execute('CREATE INDEX idx_audit_user ON audit.audit_logs (user_id)')
    op.execute('CREATE INDEX idx_audit_resource ON audit.audit_logs (resource_type, resource_id)')
    op.execute('CREATE INDEX idx_audit_action ON audit.audit_logs (action)')
    op.execute('CREATE INDEX idx_audit_created ON audit.audit_logs (created_at DESC)')
    
    # ============================================================================
    # TABLE SENSITIVE_DATA_ACCESS
    # ============================================================================
    
    op.create_table(
        'sensitive_data_access',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('data_type', sa.String(50), nullable=False),
        sa.Column('data_id', sa.Integer(), nullable=True),
        sa.Column('action', sa.String(20), nullable=False),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('ip_address', postgresql.INET(), nullable=True),
        sa.Column('accessed_at', sa.DateTime(), nullable=False, default=datetime.utcnow),
        
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        schema='audit'
    )
    
    op.create_index('idx_sensitive_user', 'sensitive_data_access', ['user_id'], schema='audit')
    op.create_index('idx_sensitive_type', 'sensitive_data_access', ['data_type'], schema='audit')
    op.create_index('idx_sensitive_accessed', 'sensitive_data_access', ['accessed_at'], schema='audit')
    
    # ============================================================================
    # TABLES COMPLIANCE
    # ============================================================================
    
    op.create_table(
        'regulatory_templates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('code', sa.String(50), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('regulation', sa.String(50), nullable=False),
        sa.Column('version', sa.String(20), nullable=False),
        sa.Column('template_structure', postgresql.JSONB(), nullable=False),
        sa.Column('validation_rules', postgresql.JSONB(), nullable=True),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, default=datetime.utcnow),
        sa.Column('updated_at', sa.DateTime(), nullable=False, default=datetime.utcnow),
        
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code'),
        schema='compliance'
    )
    
    op.create_table(
        'reports',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('uuid', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('template_id', sa.Integer(), nullable=True),
        sa.Column('calculation_id', sa.Integer(), nullable=True),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('report_type', sa.String(50), nullable=False),
        sa.Column('period_start', sa.Date(), nullable=False),
        sa.Column('period_end', sa.Date(), nullable=False),
        sa.Column('report_data', postgresql.JSONB(), nullable=False),
        sa.Column('validation_status', sa.String(20), default='draft'),
        sa.Column('validation_errors', postgresql.JSONB(), nullable=True),
        sa.Column('submitted_by', sa.Integer(), nullable=True),
        sa.Column('submitted_at', sa.DateTime(), nullable=True),
        sa.Column('approved_by', sa.Integer(), nullable=True),
        sa.Column('approved_at', sa.DateTime(), nullable=True),
        sa.Column('file_path', sa.Text(), nullable=True),
        sa.Column('file_size_bytes', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, default=datetime.utcnow),
        
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('uuid'),
        sa.ForeignKeyConstraint(['template_id'], ['compliance.regulatory_templates.id']),
        sa.ForeignKeyConstraint(['calculation_id'], ['calculations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['submitted_by'], ['users.id']),
        sa.ForeignKeyConstraint(['approved_by'], ['users.id']),
        schema='compliance'
    )
    
    op.create_index('idx_compliance_reports_user', 'reports', ['user_id'], schema='compliance')
    op.create_index('idx_compliance_reports_period', 'reports', ['period_start', 'period_end'], 
                    schema='compliance')
    
    print("✅ Migration appliquée avec succès")

def downgrade():
    """
    Supprimer toutes les tables et structures
    """
    # Supprimer les tables dans l'ordre inverse des dépendances
    op.drop_table('reports', schema='compliance')
    op.drop_table('regulatory_templates', schema='compliance')
    op.drop_table('sensitive_data_access', schema='audit')
    
    # Supprimer les partitions d'audit_logs
    op.execute('DROP TABLE IF EXISTS audit.audit_logs CASCADE')
    
    # Supprimer les tables principales
    op.drop_table('notifications')
    op.drop_table('benchmark_data')
    op.drop_table('method_comparisons')
    op.drop_table('calculations')
    op.drop_table('triangles')
    op.drop_table('user_permissions')
    op.drop_table('user_sessions')
    op.drop_table('users')
    
    # Supprimer les schémas
    op.execute('DROP SCHEMA IF EXISTS compliance CASCADE')
    op.execute('DROP SCHEMA IF EXISTS audit CASCADE')
    
    # Supprimer les types ENUM
    op.execute('DROP TYPE IF EXISTS user_role CASCADE')
    op.execute('DROP TYPE IF EXISTS triangle_type CASCADE')
    op.execute('DROP TYPE IF EXISTS calculation_method CASCADE')
    op.execute('DROP TYPE IF EXISTS calculation_status CASCADE')
    op.execute('DROP TYPE IF EXISTS insurance_line CASCADE')
    op.execute('DROP TYPE IF EXISTS currency_code CASCADE')
    op.execute('DROP TYPE IF EXISTS tail_factor_type CASCADE')
    
    print("✅ Migration annulée avec succès")