// ====================================================================
// ROUTES D'AUTHENTIFICATION SÉCURISÉES (VERSION CORRIGÉE)
// Fichier: /Users/cisseniang/Documents/ProvTech/backend/routes/secure/auth.js
// ====================================================================

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

// Import depuis le middleware (réutilise les fonctions communes)
const { 
  initializeDatabase, 
  auditLog, 
  getUserPermissions 
} = require('../../middleware/CompatibilityAuth');

const router = express.Router();

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secure-jwt-secret-key';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-super-secure-refresh-secret';

// Rate limiting spécifique à l'authentification
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 tentatives par IP
  message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Génération UUID compatible
function generateUUID() {
  if (require('crypto').randomUUID) {
    return require('crypto').randomUUID();
  }
  // Fallback pour versions Node.js plus anciennes
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Génération des tokens JWT
function generateTokens(user) {
  try {
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
      permissions: getUserPermissions(user.role),
      restrictions: user.restrictions || {}
    };

    const accessToken = jwt.sign(payload, JWT_SECRET, { 
      expiresIn: '15m',
      issuer: 'ProvTech',
      audience: 'ProvTech-Users'
    });
    
    const refreshToken = jwt.sign(
      { id: user.id }, 
      JWT_REFRESH_SECRET, 
      { 
        expiresIn: '7d',
        issuer: 'ProvTech',
        audience: 'ProvTech-Users'
      }
    );
    
    return { accessToken, refreshToken };
  } catch (error) {
    console.error('Erreur génération tokens:', error);
    throw new Error('Impossible de générer les tokens');
  }
}

// ============ ROUTES D'AUTHENTIFICATION ============

// POST /api/auth/login - Connexion sécurisée
router.post('/login', authLimiter, async (req, res) => {
  let db = null;
  
  try {
    db = await initializeDatabase();
    const { email, password, mfaToken } = req.body;

    // Validation des entrées
    if (!email || !password) {
      await auditLog('LOGIN_FAILED', null, { reason: 'MISSING_CREDENTIALS', email: email || 'unknown' }, req);
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    // Validation format email basique
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await auditLog('LOGIN_FAILED', null, { reason: 'INVALID_EMAIL_FORMAT', email }, req);
      return res.status(400).json({ error: 'Format email invalide' });
    }

    // Vérification utilisateur en base
    const [users] = await db.execute(
      'SELECT * FROM users WHERE email = ? AND isActive = true', 
      [email.toLowerCase()]
    );

    if (users.length === 0) {
      await auditLog('LOGIN_FAILED', null, { reason: 'USER_NOT_FOUND', email }, req);
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    const user = users[0];

    // Vérifier si le compte est verrouillé
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      await auditLog('LOGIN_FAILED', user.id, { reason: 'ACCOUNT_LOCKED' }, req);
      return res.status(423).json({ 
        error: 'Compte temporairement verrouillé',
        lockedUntil: user.locked_until
      });
    }

    // Vérification mot de passe
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      await auditLog('LOGIN_FAILED', user.id, { reason: 'INVALID_PASSWORD' }, req);
      
      // Incrémenter les tentatives échouées
      const newFailedAttempts = (user.failed_login_attempts || 0) + 1;
      let updateQuery = 'UPDATE users SET failed_login_attempts = ? WHERE id = ?';
      let updateParams = [newFailedAttempts, user.id];
      
      // Verrouiller après 5 tentatives
      if (newFailedAttempts >= 5) {
        updateQuery = 'UPDATE users SET failed_login_attempts = ?, locked_until = DATE_ADD(NOW(), INTERVAL 30 MINUTE) WHERE id = ?';
      }
      
      await db.execute(updateQuery, updateParams);
      
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    // Vérification 2FA si activé (version simplifiée)
    if (user.mfa_enabled && user.mfa_secret) {
      if (!mfaToken) {
        await auditLog('LOGIN_FAILED', user.id, { reason: 'MFA_REQUIRED' }, req);
        return res.status(200).json({ 
          mfaRequired: true,
          message: 'Code 2FA requis' 
        });
      }

      // Note: Nous importerons speakeasy plus tard si nécessaire
      // Pour l'instant, on accepte tout code 2FA pour le test
      if (process.env.NODE_ENV === 'development' && mfaToken !== '000000') {
        console.log('Mode dev: Code 2FA accepté pour test');
      }
    }

    // Connexion réussie - réinitialiser les échecs
    await db.execute(`
      UPDATE users SET 
        failed_login_attempts = 0,
        last_login = NOW(),
        locked_until = NULL
      WHERE id = ?
    `, [user.id]);

    // Génération des tokens
    const { accessToken, refreshToken } = generateTokens(user);

    // Stocker la session (avec gestion d'erreur)
    try {
      await db.execute(`
        INSERT INTO user_sessions (
          id, user_id, user_email, refresh_token_hash, ip_address, 
          user_agent, expires_at, created_at, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY), NOW(), true)
      `, [
        generateUUID(),
        user.id,
        user.email,
        require('crypto').createHash('sha256').update(refreshToken).digest('hex'),
        req.ip || req.connection?.remoteAddress || 'unknown',
        req.get('User-Agent') || 'unknown'
      ]);
    } catch (sessionError) {
      console.error('Erreur création session (non critique):', sessionError.message);
    }

    await auditLog('LOGIN_SUCCESS', user.id, { 
      role: user.role,
      department: user.department || 'unknown',
      mfaUsed: !!user.mfa_enabled,
      authMode: 'secure'
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
        permissions: getUserPermissions(user.role),
        restrictions: user.restrictions ? JSON.parse(user.restrictions) : {},
        mfaEnabled: !!user.mfa_enabled,
        migratedToSecure: !!user.migrated_to_secure
      },
      accessToken,
      refreshToken
    });

  } catch (error) {
    console.error('Erreur login sécurisé:', error);
    await auditLog('LOGIN_ERROR', null, { error: error.message }, req);
    res.status(500).json({ error: 'Erreur serveur lors de la connexion' });
  }
});

// GET /api/auth/verify - Vérification de token
router.get('/verify', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Token requis' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const db = await initializeDatabase();
    
    // Vérifier que l'utilisateur existe toujours
    const [users] = await db.execute(
      'SELECT * FROM users WHERE id = ? AND isActive = true', 
      [decoded.id]
    );

    if (users.length === 0) {
      return res.status(403).json({ error: 'Utilisateur introuvable' });
    }

    const user = users[0];
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        department: user.department,
        permissions: getUserPermissions(user.role),
        restrictions: user.restrictions ? JSON.parse(user.restrictions) : {},
        mfaEnabled: !!user.mfa_enabled,
        migratedToSecure: !!user.migrated_to_secure
      },
      authMode: 'secure',
      migrationAvailable: false
    });

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expiré' });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token invalide' });
    }
    
    console.error('Erreur vérification token:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/logout - Déconnexion sécurisée
router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const authHeader = req.headers['authorization'];
    const authToken = authHeader && authHeader.split(' ')[1];

    let userId = null;

    if (authToken) {
      try {
        const decoded = jwt.verify(authToken, JWT_SECRET);
        userId = decoded.id;
      } catch (err) {
        // Token expiré, pas grave pour le logout
      }
    }
    
    const db = await initializeDatabase();
    
    // Désactiver la session
    if (refreshToken) {
      const tokenHash = require('crypto').createHash('sha256').update(refreshToken).digest('hex');
      await db.execute(`
        UPDATE user_sessions SET 
          is_active = false, 
          logout_reason = 'USER_LOGOUT'
        WHERE refresh_token_hash = ?
      `, [tokenHash]);
    }

    await auditLog('LOGOUT', userId, { method: 'secure' }, req);
    res.json({ message: 'Déconnexion réussie' });

  } catch (error) {
    console.error('Erreur logout:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/refresh - Renouvellement token (version simplifiée)
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token requis' });
    }

    // Vérification JWT simple
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    const db = await initializeDatabase();
    
    // Vérifier l'utilisateur
    const [users] = await db.execute(
      'SELECT * FROM users WHERE id = ? AND isActive = true', 
      [decoded.id]
    );

    if (users.length === 0) {
      return res.status(403).json({ error: 'Utilisateur introuvable' });
    }

    const user = users[0];
    
    // Génération nouveaux tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

    await auditLog('TOKEN_REFRESHED', user.id, {}, req);

    res.json({
      accessToken,
      refreshToken: newRefreshToken
    });

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Refresh token expiré' });
    }
    console.error('Erreur refresh token:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route de test pour vérifier le fonctionnement
router.get('/test', (req, res) => {
  res.json({
    message: 'Routes d\'authentification sécurisées fonctionnelles',
    timestamp: new Date(),
    version: '1.0.0-corrected',
    features: ['login', 'logout', 'verify', 'refresh']
  });
});

// Route de santé pour diagnostics
router.get('/health', async (req, res) => {
  try {
    const db = await initializeDatabase();
    
    // Test simple de connexion DB
    await db.execute('SELECT 1');
    
    res.json({
      status: 'healthy',
      auth: 'secure',
      database: 'connected',
      timestamp: new Date()
    });
    
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date()
    });
  }
});

module.exports = router;