// ====================================================================
// MIDDLEWARE DE COMPATIBILITÉ PROVTECH - AUTHENTIFICATION HYBRIDE
// Fichier: /Users/cisseniang/Documents/ProvTech/backend/middleware/CompatibilityAuth.js
// ====================================================================

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secure-jwt-secret-key';
const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root', 
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'provtech'
};

// Pool de connexions MySQL
let dbPool = null;

async function initializeDatabase() {
    if (!dbPool) {
        dbPool = mysql.createPool({
            ...DB_CONFIG,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });
    }
    return dbPool;
}

// Service d'audit logging
async function auditLog(eventType, userId, details, request) {
    try {
        const db = await initializeDatabase();
        
        const log = {
            id: generateUUID(),
            timestamp: new Date(),
            user_id: userId || null,
            session_id: request.sessionID || null,
            ip_address: getClientIP(request),
            user_agent: request.get('User-Agent') || null,
            request_method: request.method || null,
            request_url: request.originalUrl || null,
            event_type: eventType,
            event_category: 'AUTHENTICATION',
            result: details.result || 'SUCCESS',
            additional_data: JSON.stringify(details)
        };

        await db.execute(`
            INSERT INTO audit_logs (
                id, timestamp, user_id, session_id, ip_address, 
                user_agent, request_method, request_url, event_type, 
                event_category, result, additional_data
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            log.id, log.timestamp, log.user_id, log.session_id,
            log.ip_address, log.user_agent, log.request_method,
            log.request_url, log.event_type, log.event_category,
            log.result, log.additional_data
        ]);

    } catch (error) {
        console.error('[AUDIT ERROR]', error);
        // Ne pas faire échouer la requête si l'audit échoue
    }
}

// Utilitaires
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function getClientIP(request) {
    return request.ip || 
           request.connection.remoteAddress || 
           request.socket.remoteAddress ||
           (request.connection.socket ? request.connection.socket.remoteAddress : null);
}

// ====================================================================
// AUTHENTIFICATION LEGACY PROVTECH
// ====================================================================

class LegacyAuthService {
    
    static async validateLegacyToken(token) {
        try {
            // Remplacez cette logique par celle de votre système actuel
            // Exemple générique - adaptez selon votre implémentation ProvTech
            
            if (token.startsWith('legacy_')) {
                // Exemple de token legacy simple
                const userId = token.replace('legacy_', '');
                return await this.getUserById(userId);
            }
            
            // Si vous utilisez JWT pour le legacy, essayez de le décoder
            try {
                const decoded = jwt.verify(token, process.env.LEGACY_JWT_SECRET || 'legacy-secret');
                return await this.getUserById(decoded.userId || decoded.id);
            } catch (jwtError) {
                // Pas un JWT legacy valide
            }
            
            // Si vous utilisez des sessions, vérifiez en base
            return await this.validateSessionToken(token);
            
        } catch (error) {
            console.error('[LEGACY AUTH ERROR]', error);
            return null;
        }
    }
    
    static async getUserById(userId) {
        try {
            const db = await initializeDatabase();
            const [rows] = await db.execute(
                'SELECT * FROM users WHERE id = ? AND isActive = true', 
                [userId]
            );
            
            if (rows.length > 0) {
                const user = rows[0];
                return {
                    id: user.id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    role: user.role || 'ACTUAIRE_JUNIOR',
                    department: user.department,
                    authMode: 'legacy',
                    migratedToSecure: user.migrated_to_secure || false,
                    mfaEnabled: user.mfa_enabled || false
                };
            }
            return null;
        } catch (error) {
            console.error('[USER LOOKUP ERROR]', error);
            return null;
        }
    }
    
    static async validateSessionToken(token) {
        try {
            // Adaptez cette logique selon votre système de sessions actuel
            const db = await initializeDatabase();
            
            // Si vous avez une table sessions legacy
            const [rows] = await db.execute(
                'SELECT user_id FROM legacy_sessions WHERE token = ? AND expires_at > NOW()', 
                [token]
            );
            
            if (rows.length > 0) {
                return await this.getUserById(rows[0].user_id);
            }
            
            return null;
        } catch (error) {
            // Table legacy_sessions n'existe peut-être pas
            return null;
        }
    }
}

// ====================================================================
// AUTHENTIFICATION SÉCURISÉE (JWT + 2FA)
// ====================================================================

class SecureAuthService {
    
    static async validateSecureToken(token) {
        try {
            // Vérification JWT sécurisé
            const decoded = jwt.verify(token, JWT_SECRET);
            
            // Vérifier que l'utilisateur existe toujours et est actif
            const db = await initializeDatabase();
            const [rows] = await db.execute(
                'SELECT * FROM users WHERE id = ? AND isActive = true', 
                [decoded.id]
            );
            
            if (rows.length > 0) {
                const user = rows[0];
                
                return {
                    id: user.id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    role: user.role,
                    department: user.department,
                    permissions: decoded.permissions || [],
                    restrictions: user.restrictions ? JSON.parse(user.restrictions) : {},
                    authMode: 'secure',
                    migratedToSecure: true,
                    mfaEnabled: user.mfa_enabled || false,
                    tokenPayload: decoded
                };
            }
            
            return null;
            
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw new Error('TOKEN_EXPIRED');
            } else if (error.name === 'JsonWebTokenError') {
                throw new Error('TOKEN_INVALID');
            }
            throw error;
        }
    }
}

// ====================================================================
// MIDDLEWARE PRINCIPAL DE COMPATIBILITÉ
// ====================================================================

const compatibilityAuth = async (req, res, next) => {
    try {
        // Récupération du token d'authentification
        const authHeader = req.headers['authorization'];
        let token = null;
        
        if (authHeader) {
            if (authHeader.startsWith('Bearer ')) {
                token = authHeader.substring(7);
            } else {
                token = authHeader;
            }
        }
        
        // Vérifier aussi les cookies pour compatibilité legacy
        if (!token && req.cookies && req.cookies.authToken) {
            token = req.cookies.authToken;
        }
        
        // Vérifier les sessions express si utilisées
        if (!token && req.session && req.session.userId) {
            token = `session_${req.session.userId}`;
        }
        
        if (!token) {
            await auditLog('ACCESS_DENIED', null, { 
                reason: 'NO_TOKEN',
                url: req.originalUrl 
            }, req);
            
            return res.status(401).json({ 
                error: 'Token d\'authentification requis',
                authRequired: true 
            });
        }
        
        let user = null;
        let authMode = null;
        
        // ÉTAPE 1: Essayer l'authentification sécurisée en premier
        try {
            user = await SecureAuthService.validateSecureToken(token);
            if (user) {
                authMode = 'secure';
                req.user = user;
                req.authMode = authMode;
                
                await auditLog('ACCESS_GRANTED', user.id, {
                    authMode: 'secure',
                    role: user.role,
                    mfaEnabled: user.mfaEnabled,
                    url: req.originalUrl
                }, req);
                
                return next();
            }
        } catch (secureError) {
            // Log mais continue avec l'auth legacy
            if (secureError.message !== 'TOKEN_INVALID') {
                console.log('[SECURE AUTH]', secureError.message);
            }
        }
        
        // ÉTAPE 2: Essayer l'authentification legacy
        try {
            user = await LegacyAuthService.validateLegacyToken(token);
            if (user) {
                authMode = 'legacy';
                req.user = user;
                req.authMode = authMode;
                
                await auditLog('ACCESS_GRANTED', user.id, {
                    authMode: 'legacy',
                    role: user.role,
                    migrationAvailable: !user.migratedToSecure,
                    url: req.originalUrl
                }, req);
                
                // Ajouter un header pour indiquer que la migration est disponible
                if (!user.migratedToSecure) {
                    res.set('X-Migration-Available', 'true');
                }
                
                return next();
            }
        } catch (legacyError) {
            console.log('[LEGACY AUTH]', legacyError.message);
        }
        
        // ÉTAPE 3: Aucune authentification valide
        await auditLog('ACCESS_DENIED', null, {
            reason: 'INVALID_TOKEN',
            tokenType: token.substring(0, 10) + '...',
            url: req.originalUrl
        }, req);
        
        return res.status(403).json({ 
            error: 'Token invalide ou expiré',
            authRequired: true 
        });
        
    } catch (error) {
        console.error('[COMPATIBILITY AUTH ERROR]', error);
        
        await auditLog('AUTH_ERROR', null, {
            error: error.message,
            url: req.originalUrl
        }, req);
        
        return res.status(500).json({ 
            error: 'Erreur d\'authentification interne' 
        });
    }
};

// ====================================================================
// MIDDLEWARE DE VÉRIFICATION DES PERMISSIONS
// ====================================================================

const requirePermission = (permission) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Authentification requise' });
            }
            
            let hasPermission = false;
            
            if (req.authMode === 'secure') {
                // Système de permissions granulaires
                hasPermission = req.user.permissions && req.user.permissions.includes(permission);
            } else if (req.authMode === 'legacy') {
                // Système de permissions legacy basique
                hasPermission = await checkLegacyPermission(req.user, permission);
            }
            
            if (!hasPermission) {
                await auditLog('PERMISSION_DENIED', req.user.id, {
                    permission,
                    userRole: req.user.role,
                    authMode: req.authMode,
                    url: req.originalUrl
                }, req);
                
                return res.status(403).json({ 
                    error: 'Permission insuffisante',
                    required: permission,
                    migrationSuggested: req.authMode === 'legacy'
                });
            }
            
            next();
            
        } catch (error) {
            console.error('[PERMISSION CHECK ERROR]', error);
            res.status(500).json({ error: 'Erreur de vérification des permissions' });
        }
    };
};

// Permissions legacy simplifiées
async function checkLegacyPermission(user, permission) {
    // Mappings basiques pour compatibilité
    const legacyPermissions = {
        'ADMIN': ['triangles:read', 'triangles:write', 'calculations:read', 'calculations:write', 'users:read', 'users:write', 'audit:read'],
        'ACTUAIRE_SENIOR': ['triangles:read', 'triangles:write', 'calculations:read', 'calculations:write', 'calculations:validate'],
        'ACTUAIRE_JUNIOR': ['triangles:read', 'calculations:read', 'calculations:write'],
        'VALIDATEUR': ['triangles:read', 'calculations:read', 'calculations:validate'],
        'AUDITEUR': ['triangles:read', 'calculations:read', 'audit:read']
    };
    
    const userRole = user.role || 'ACTUAIRE_JUNIOR';
    const allowedPermissions = legacyPermissions[userRole] || [];
    
    return allowedPermissions.includes(permission);
}

// ====================================================================
// MIDDLEWARE DE MIGRATION SUGGESTION
// ====================================================================

const migrationSuggestion = (req, res, next) => {
    if (req.authMode === 'legacy' && !req.user.migratedToSecure) {
        res.set('X-Migration-Available', 'true');
        res.set('X-Migration-Benefits', 'Enhanced security with 2FA, granular permissions, audit trail');
    }
    next();
};

// ====================================================================
// ROUTES DE MIGRATION
// ====================================================================

const express = require('express');
const migrationRouter = express.Router();

// POST /api/migration/upgrade-user - Migrer utilisateur vers système sécurisé
migrationRouter.post('/upgrade-user', compatibilityAuth, async (req, res) => {
    try {
        if (req.authMode === 'secure') {
            return res.json({ 
                message: 'Utilisateur déjà migré vers le système sécurisé',
                currentMode: 'secure' 
            });
        }
        
        const { currentPassword } = req.body;
        if (!currentPassword) {
            return res.status(400).json({ error: 'Mot de passe actuel requis pour la migration' });
        }
        
        const db = await initializeDatabase();
        
        // Vérifier le mot de passe actuel
        const [rows] = await db.execute('SELECT password FROM users WHERE id = ?', [req.user.id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Utilisateur introuvable' });
        }
        
        const validPassword = await bcrypt.compare(currentPassword, rows[0].password);
        if (!validPassword) {
            await auditLog('MIGRATION_FAILED', req.user.id, { reason: 'INVALID_PASSWORD' }, req);
            return res.status(401).json({ error: 'Mot de passe incorrect' });
        }
        
        // Marquer comme migré
        await db.execute(`
            UPDATE users SET 
                migrated_to_secure = true, 
                migration_date = NOW(),
                legacy_auth_enabled = true
            WHERE id = ?
        `, [req.user.id]);
        
        await auditLog('USER_MIGRATED', req.user.id, {
            from: 'legacy',
            to: 'secure',
            role: req.user.role
        }, req);
        
        res.json({
            success: true,
            message: 'Migration vers le système sécurisé réussie',
            nextSteps: {
                twoFactorAuth: 'Configurez l\'authentification 2FA pour une sécurité maximale',
                newFeatures: ['Permissions granulaires', 'Audit trail', 'Sessions sécurisées']
            }
        });
        
    } catch (error) {
        console.error('[MIGRATION ERROR]', error);
        await auditLog('MIGRATION_ERROR', req.user?.id, { error: error.message }, req);
        res.status(500).json({ error: 'Erreur lors de la migration' });
    }
});

// GET /api/migration/status - Statut de migration utilisateur
migrationRouter.get('/status', compatibilityAuth, async (req, res) => {
    res.json({
        userId: req.user.id,
        email: req.user.email,
        currentAuthMode: req.authMode,
        migratedToSecure: req.user.migratedToSecure,
        mfaEnabled: req.user.mfaEnabled,
        availableFeatures: {
            legacy: ['Authentification basique', 'Permissions par rôle'],
            secure: ['Authentification 2FA', 'Permissions granulaires', 'Audit complet', 'Sessions sécurisées']
        },
        migrationRecommended: req.authMode === 'legacy'
    });
});

// ====================================================================
// EXPORTS
// ====================================================================

module.exports = {
    compatibilityAuth,
    requirePermission,
    migrationSuggestion,
    migrationRouter,
    initializeDatabase,
    LegacyAuthService,
    SecureAuthService
};