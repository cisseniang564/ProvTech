// ===== BACKEND API AUTHENTIFICATION ACTUARIELLE =====
// Technologies: Node.js + Express + JWT + 2FA (TOTP) + bcrypt + speakeasy

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();

// ===== CONFIGURATION SÉCURITÉ =====
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting pour prévenir brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 tentatives par IP
  message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' }
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secure-jwt-secret-key';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-super-secure-refresh-secret';

// ===== MODÈLES DE DONNÉES =====

// Énumération des rôles actuariels
const ACTUARIAL_ROLES = {
  ADMIN: 'ADMIN',
  ACTUAIRE_SENIOR: 'ACTUAIRE_SENIOR',
  ACTUAIRE_JUNIOR: 'ACTUAIRE_JUNIOR', 
  VALIDATEUR: 'VALIDATEUR',
  AUDITEUR: 'AUDITEUR',
  CONSULTANT_EXTERNE: 'CONSULTANT_EXTERNE'
};

// Permissions par ressource
const PERMISSIONS = {
  TRIANGLES: {
    READ: 'triangles:read',
    WRITE: 'triangles:write', 
    DELETE: 'triangles:delete',
    IMPORT: 'triangles:import'
  },
  CALCULATIONS: {
    READ: 'calculations:read',
    WRITE: 'calculations:write',
    DELETE: 'calculations:delete',
    VALIDATE: 'calculations:validate',
    RUN: 'calculations:run'
  },
  REPORTS: {
    READ: 'reports:read',
    GENERATE: 'reports:generate',
    EXPORT: 'reports:export',
    SIGN: 'reports:sign'
  },
  USERS: {
    READ: 'users:read',
    WRITE: 'users:write',
    DELETE: 'users:delete'
  },
  AUDIT: {
    READ: 'audit:read',
    EXPORT: 'audit:export'
  }
};

// Matrice rôles -> permissions
const ROLE_PERMISSIONS = {
  [ACTUARIAL_ROLES.ADMIN]: Object.values(PERMISSIONS).flatMap(p => Object.values(p)),
  [ACTUARIAL_ROLES.ACTUAIRE_SENIOR]: [
    ...Object.values(PERMISSIONS.TRIANGLES),
    ...Object.values(PERMISSIONS.CALCULATIONS),
    ...Object.values(PERMISSIONS.REPORTS),
    PERMISSIONS.USERS.READ,
    PERMISSIONS.AUDIT.READ
  ],
  [ACTUARIAL_ROLES.ACTUAIRE_JUNIOR]: [
    PERMISSIONS.TRIANGLES.READ,
    PERMISSIONS.TRIANGLES.WRITE,
    PERMISSIONS.CALCULATIONS.READ,
    PERMISSIONS.CALCULATIONS.WRITE,
    PERMISSIONS.CALCULATIONS.RUN,
    PERMISSIONS.REPORTS.READ,
    PERMISSIONS.REPORTS.GENERATE
  ],
  [ACTUARIAL_ROLES.VALIDATEUR]: [
    ...Object.values(PERMISSIONS.TRIANGLES),
    ...Object.values(PERMISSIONS.CALCULATIONS),
    PERMISSIONS.REPORTS.READ,
    PERMISSIONS.REPORTS.GENERATE,
    PERMISSIONS.REPORTS.SIGN,
    PERMISSIONS.AUDIT.READ
  ],
  [ACTUARIAL_ROLES.AUDITEUR]: [
    PERMISSIONS.TRIANGLES.READ,
    PERMISSIONS.CALCULATIONS.READ,
    PERMISSIONS.REPORTS.READ,
    ...Object.values(PERMISSIONS.AUDIT)
  ],
  [ACTUARIAL_ROLES.CONSULTANT_EXTERNE]: [
    PERMISSIONS.TRIANGLES.READ,
    PERMISSIONS.CALCULATIONS.READ,
    PERMISSIONS.REPORTS.READ
  ]
};

// Base de données simulée (à remplacer par PostgreSQL/MongoDB en production)
let users = [
  {
    id: '1',
    email: 'marie.dupont@actuarial.com',
    password: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewRuZg3p4Wq2k6yO', // password123
    firstName: 'Marie',
    lastName: 'Dupont',
    role: ACTUARIAL_ROLES.ACTUAIRE_SENIOR,
    department: 'Vie',
    isActive: true,
    mfaEnabled: false,
    mfaSecret: null,
    lastLogin: null,
    createdAt: new Date(),
    restrictions: {
      portfolios: ['VIE_INDIVIDUELLE', 'VIE_GROUPE'],
      branches: ['20', '21', '22'],
      validationLevel: 2
    }
  },
  {
    id: '2',
    email: 'jean.martin@actuarial.com',
    password: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewRuZg3p4Wq2k6yO', // password123
    firstName: 'Jean',
    lastName: 'Martin',
    role: ACTUARIAL_ROLES.VALIDATEUR,
    department: 'Non-Vie',
    isActive: true,
    mfaEnabled: false,
    mfaSecret: null,
    lastLogin: null,
    createdAt: new Date(),
    restrictions: {
      portfolios: ['AUTO', 'HABITATION', 'RC'],
      validationLevel: 3
    }
  }
];

let refreshTokens = []; // À stocker en Redis en production
let auditLogs = [];

// ===== FONCTIONS UTILITAIRES =====

// Génération des tokens JWT
function generateTokens(user) {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    permissions: ROLE_PERMISSIONS[user.role] || [],
    restrictions: user.restrictions
  };

  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ id: user.id }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
  
  return { accessToken, refreshToken };
}

// Logging des événements de sécurité
function auditLog(eventType, userId, details, request) {
  const log = {
    id: uuidv4(),
    timestamp: new Date(),
    eventType,
    userId: userId || 'ANONYMOUS',
    sessionId: request.sessionID || null,
    ipAddress: request.ip,
    userAgent: request.get('User-Agent'),
    details,
    result: details.result || 'SUCCESS'
  };
  
  auditLogs.push(log);
  console.log(`[AUDIT] ${eventType}:`, log);
}

// Middleware d'authentification
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Token d\'accès requis' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      auditLog('TOKEN_VALIDATION_FAILED', null, { error: err.message }, req);
      return res.status(403).json({ error: 'Token invalide ou expiré' });
    }
    req.user = user;
    next();
  });
}

// Middleware de vérification des permissions
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user.permissions.includes(permission)) {
      auditLog('PERMISSION_DENIED', req.user.id, { 
        permission, 
        userPermissions: req.user.permissions 
      }, req);
      return res.status(403).json({ 
        error: 'Permission insuffisante',
        required: permission 
      });
    }
    next();
  };
}

// ===== ROUTES D'AUTHENTIFICATION =====

// POST /api/auth/login - Connexion avec email/password
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password, mfaToken } = req.body;

    if (!email || !password) {
      auditLog('LOGIN_FAILED', null, { reason: 'MISSING_CREDENTIALS', email }, req);
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    // Vérification utilisateur
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.isActive);
    if (!user) {
      auditLog('LOGIN_FAILED', null, { reason: 'USER_NOT_FOUND', email }, req);
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    // Vérification mot de passe
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      auditLog('LOGIN_FAILED', user.id, { reason: 'INVALID_PASSWORD' }, req);
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    // Vérification 2FA si activé
    if (user.mfaEnabled) {
      if (!mfaToken) {
        auditLog('LOGIN_FAILED', user.id, { reason: 'MFA_REQUIRED' }, req);
        return res.status(200).json({ 
          mfaRequired: true,
          message: 'Code 2FA requis' 
        });
      }

      const verified = speakeasy.totp.verify({
        secret: user.mfaSecret,
        encoding: 'ascii',
        token: mfaToken,
        window: 2 // Tolérance ±2 périodes (60s)
      });

      if (!verified) {
        auditLog('LOGIN_FAILED', user.id, { reason: 'INVALID_MFA_TOKEN' }, req);
        return res.status(401).json({ error: 'Code 2FA invalide' });
      }
    }

    // Génération des tokens
    const { accessToken, refreshToken } = generateTokens(user);
    refreshTokens.push(refreshToken);

    // Mise à jour last login
    user.lastLogin = new Date();

    auditLog('LOGIN_SUCCESS', user.id, { 
      role: user.role,
      department: user.department,
      mfaUsed: user.mfaEnabled 
    }, req);

    res.json({
      message: 'Connexion réussie',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        department: user.department,
        permissions: ROLE_PERMISSIONS[user.role] || [],
        restrictions: user.restrictions,
        mfaEnabled: user.mfaEnabled
      },
      accessToken,
      refreshToken
    });

  } catch (error) {
    console.error('Erreur login:', error);
    auditLog('LOGIN_ERROR', null, { error: error.message }, req);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/refresh - Renouvellement token
app.post('/api/auth/refresh', (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token requis' });
  }

  if (!refreshTokens.includes(refreshToken)) {
    auditLog('REFRESH_FAILED', null, { reason: 'TOKEN_NOT_FOUND' }, req);
    return res.status(403).json({ error: 'Refresh token invalide' });
  }

  jwt.verify(refreshToken, JWT_REFRESH_SECRET, (err, decoded) => {
    if (err) {
      auditLog('REFRESH_FAILED', decoded?.id, { error: err.message }, req);
      return res.status(403).json({ error: 'Refresh token expiré' });
    }

    const user = users.find(u => u.id === decoded.id && u.isActive);
    if (!user) {
      return res.status(403).json({ error: 'Utilisateur introuvable' });
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);
    
    // Remplacement de l'ancien refresh token
    const tokenIndex = refreshTokens.indexOf(refreshToken);
    refreshTokens[tokenIndex] = newRefreshToken;

    auditLog('TOKEN_REFRESHED', user.id, {}, req);

    res.json({
      accessToken,
      refreshToken: newRefreshToken
    });
  });
});

// POST /api/auth/logout - Déconnexion
app.post('/api/auth/logout', authenticateToken, (req, res) => {
  const { refreshToken } = req.body;
  
  // Suppression du refresh token
  if (refreshToken) {
    const tokenIndex = refreshTokens.indexOf(refreshToken);
    if (tokenIndex > -1) {
      refreshTokens.splice(tokenIndex, 1);
    }
  }

  auditLog('LOGOUT', req.user.id, {}, req);
  res.json({ message: 'Déconnexion réussie' });
});

// ===== ROUTES 2FA =====

// POST /api/auth/setup-2fa - Configuration 2FA
app.post('/api/auth/setup-2fa', authenticateToken, (req, res) => {
  try {
    const user = users.find(u => u.id === req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    // Génération secret 2FA
    const secret = speakeasy.generateSecret({
      name: `Actuarial Platform (${user.email})`,
      issuer: 'Actuarial Platform'
    });

    // Génération QR Code
    QRCode.toDataURL(secret.otpauth_url, (err, dataUrl) => {
      if (err) {
        console.error('Erreur QR Code:', err);
        return res.status(500).json({ error: 'Erreur génération QR Code' });
      }

      // Stockage temporaire du secret (sera confirmé lors de la vérification)
      user.tempMfaSecret = secret.ascii;

      auditLog('2FA_SETUP_INITIATED', user.id, {}, req);

      res.json({
        secret: secret.ascii,
        qrCode: dataUrl,
        backupCodes: [] // TODO: Générer codes de backup
      });
    });

  } catch (error) {
    console.error('Erreur setup 2FA:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/verify-2fa - Vérification et activation 2FA
app.post('/api/auth/verify-2fa', authenticateToken, (req, res) => {
  try {
    const { token } = req.body;
    const user = users.find(u => u.id === req.user.id);
    
    if (!user || !user.tempMfaSecret) {
      return res.status(400).json({ error: 'Configuration 2FA non initiée' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.tempMfaSecret,
      encoding: 'ascii',
      token: token,
      window: 2
    });

    if (!verified) {
      auditLog('2FA_VERIFICATION_FAILED', user.id, {}, req);
      return res.status(400).json({ error: 'Code 2FA invalide' });
    }

    // Activation 2FA
    user.mfaEnabled = true;
    user.mfaSecret = user.tempMfaSecret;
    delete user.tempMfaSecret;

    auditLog('2FA_ENABLED', user.id, {}, req);

    res.json({
      message: '2FA activé avec succès',
      mfaEnabled: true
    });

  } catch (error) {
    console.error('Erreur vérification 2FA:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/disable-2fa - Désactivation 2FA
app.post('/api/auth/disable-2fa', authenticateToken, (req, res) => {
  try {
    const { password } = req.body;
    const user = users.find(u => u.id === req.user.id);
    
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    // Vérification mot de passe pour sécurité
    bcrypt.compare(password, user.password, (err, valid) => {
      if (err || !valid) {
        auditLog('2FA_DISABLE_FAILED', user.id, { reason: 'INVALID_PASSWORD' }, req);
        return res.status(401).json({ error: 'Mot de passe invalide' });
      }

      // Désactivation 2FA
      user.mfaEnabled = false;
      user.mfaSecret = null;

      auditLog('2FA_DISABLED', user.id, {}, req);

      res.json({
        message: '2FA désactivé',
        mfaEnabled: false
      });
    });

  } catch (error) {
    console.error('Erreur désactivation 2FA:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ===== ROUTES GESTION UTILISATEURS =====

// GET /api/users - Liste utilisateurs (Admin + Validateur)
app.get('/api/users', 
  authenticateToken, 
  requirePermission(PERMISSIONS.USERS.READ),
  (req, res) => {
    const userList = users
      .filter(u => u.isActive)
      .map(u => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        department: u.department,
        mfaEnabled: u.mfaEnabled,
        lastLogin: u.lastLogin,
        restrictions: u.restrictions
      }));

    auditLog('USERS_LIST_ACCESSED', req.user.id, { count: userList.length }, req);
    res.json(userList);
  }
);

// POST /api/users - Création utilisateur (Admin seulement)
app.post('/api/users',
  authenticateToken,
  requirePermission(PERMISSIONS.USERS.WRITE),
  async (req, res) => {
    try {
      const { email, firstName, lastName, role, department, restrictions, temporaryPassword } = req.body;

      // Validation
      if (!email || !firstName || !lastName || !role) {
        return res.status(400).json({ error: 'Champs obligatoires manquants' });
      }

      // Vérification email unique
      if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
        return res.status(409).json({ error: 'Email déjà utilisé' });
      }

      // Validation rôle
      if (!Object.values(ACTUARIAL_ROLES).includes(role)) {
        return res.status(400).json({ error: 'Rôle invalide' });
      }

      // Génération mot de passe temporaire
      const tempPassword = temporaryPassword || Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(tempPassword, 12);

      const newUser = {
        id: uuidv4(),
        email: email.toLowerCase(),
        password: hashedPassword,
        firstName,
        lastName,
        role,
        department,
        isActive: true,
        mfaEnabled: false,
        mfaSecret: null,
        lastLogin: null,
        createdAt: new Date(),
        restrictions: restrictions || {},
        mustChangePassword: true
      };

      users.push(newUser);

      auditLog('USER_CREATED', req.user.id, { 
        newUserId: newUser.id, 
        email: newUser.email, 
        role: newUser.role 
      }, req);

      // TODO: Envoyer email avec mot de passe temporaire
      console.log(`Mot de passe temporaire pour ${email}: ${tempPassword}`);

      res.status(201).json({
        message: 'Utilisateur créé avec succès',
        user: {
          id: newUser.id,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          role: newUser.role,
          department: newUser.department
        },
        temporaryPassword: tempPassword // À supprimer en production
      });

    } catch (error) {
      console.error('Erreur création utilisateur:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

// ===== ROUTES AUDIT =====

// GET /api/audit - Logs d'audit
app.get('/api/audit',
  authenticateToken,
  requirePermission(PERMISSIONS.AUDIT.READ),
  (req, res) => {
    const { limit = 100, offset = 0, userId, eventType, startDate, endDate } = req.query;

    let filteredLogs = [...auditLogs];

    // Filtres
    if (userId) {
      filteredLogs = filteredLogs.filter(log => log.userId === userId);
    }
    if (eventType) {
      filteredLogs = filteredLogs.filter(log => log.eventType === eventType);
    }
    if (startDate) {
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= new Date(startDate));
    }
    if (endDate) {
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) <= new Date(endDate));
    }

    // Tri et pagination
    filteredLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const paginatedLogs = filteredLogs.slice(offset, offset + parseInt(limit));

    res.json({
      logs: paginatedLogs,
      total: filteredLogs.length,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  }
);

// ===== ROUTE DE SANTÉ =====

// GET /api/health - Vérification santé API
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date(),
    uptime: process.uptime(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// ===== DÉMARRAGE SERVEUR =====

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Serveur d'authentification actuarielle démarré sur le port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔐 JWT Secret: ${JWT_SECRET.substring(0, 10)}...`);
  console.log(`👥 Utilisateurs de test: ${users.length}`);
  console.log('\n📋 Comptes de test:');
  users.forEach(user => {
    console.log(`  - ${user.email} (${user.role}) - mot de passe: password123`);
  });
});

// Export pour les tests
module.exports = { app, users, ACTUARIAL_ROLES, PERMISSIONS, ROLE_PERMISSIONS };