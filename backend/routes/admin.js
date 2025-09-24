// ====================================================================
// ROUTES D'ADMINISTRATION PROVTECH
// Fichier: /Users/cisseniang/Documents/ProvTech/backend/routes/admin.js
// ====================================================================

const express = require('express');
const { initializeDatabase, requirePermission, auditLog } = require('../middleware/CompatibilityAuth');
const bcrypt = require('bcrypt');

const router = express.Router();

// ============ ROUTES ADMIN - GESTION UTILISATEURS ============

// GET /api/admin/users - Liste des utilisateurs (Admin uniquement)
router.get('/users', 
  requirePermission('users:read'),
  async (req, res) => {
    const db = await initializeDatabase();
    
    try {
      const { limit = 50, offset = 0, search = '', role = '' } = req.query;
      
      let whereClause = 'WHERE isActive = true';
      const params = [];
      
      if (search) {
        whereClause += ' AND (email LIKE ? OR firstName LIKE ? OR lastName LIKE ?)';
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }
      
      if (role) {
        whereClause += ' AND role = ?';
        params.push(role);
      }
      
      const [users] = await db.execute(`
        SELECT 
          id, email, firstName, lastName, role, department,
          mfa_enabled, last_login, created_at, restrictions,
          migrated_to_secure, legacy_auth_enabled, failed_login_attempts,
          locked_until
        FROM users 
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `, [...params, parseInt(limit), parseInt(offset)]);

      // Compter le total
      const [countResult] = await db.execute(`
        SELECT COUNT(*) as total FROM users ${whereClause}
      `, params);

      await auditLog('ADMIN_USERS_LIST', req.user.id, { 
        count: users.length, 
        search, 
        role 
      }, req);

      res.json({
        users,
        total: countResult[0].total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

    } catch (error) {
      console.error('Erreur lecture utilisateurs admin:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

// POST /api/admin/users - Créer utilisateur (Admin uniquement)
router.post('/users',
  requirePermission('users:write'),
  async (req, res) => {
    const db = await initializeDatabase();
    
    try {
      const { 
        email, 
        firstName, 
        lastName, 
        role = 'ACTUAIRE_JUNIOR', 
        department,
        restrictions = {},
        temporaryPassword 
      } = req.body;

      // Validation
      if (!email || !firstName || !lastName) {
        return res.status(400).json({ 
          error: 'Champs obligatoires: email, firstName, lastName' 
        });
      }

      // Email unique
      const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
      if (existing.length > 0) {
        return res.status(409).json({ error: 'Email déjà utilisé' });
      }

      // Générer mot de passe temporaire
      const tempPassword = temporaryPassword || Math.random().toString(36).slice(-10) + '!';
      const hashedPassword = await bcrypt.hash(tempPassword, 12);

      const userId = require('crypto').randomUUID();

      await db.execute(`
        INSERT INTO users (
          id, email, password, firstName, lastName, role, department,
          restrictions, isActive, must_change_password, 
          legacy_auth_enabled, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, true, true, true, NOW())
      `, [
        userId, email.toLowerCase(), hashedPassword, firstName, lastName,
        role, department, JSON.stringify(restrictions)
      ]);

      await auditLog('ADMIN_USER_CREATED', req.user.id, {
        created_user_id: userId,
        email,
        role,
        department
      }, req);

      res.status(201).json({
        message: 'Utilisateur créé avec succès',
        user: { 
          id: userId, 
          email: email.toLowerCase(), 
          firstName, 
          lastName, 
          role, 
          department 
        },
        temporaryPassword: tempPassword,
        instructions: 'Partagez ce mot de passe temporaire de manière sécurisée'
      });

    } catch (error) {
      console.error('Erreur création utilisateur admin:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

// PUT /api/admin/users/:id - Modifier utilisateur
router.put('/users/:id',
  requirePermission('users:write'),
  async (req, res) => {
    const db = await initializeDatabase();
    
    try {
      const userId = req.params.id;
      const { 
        firstName, 
        lastName, 
        role, 
        department, 
        restrictions,
        isActive,
        resetPassword
      } = req.body;

      // Vérifier existence
      const [users] = await db.execute('SELECT * FROM users WHERE id = ?', [userId]);
      if (users.length === 0) {
        return res.status(404).json({ error: 'Utilisateur introuvable' });
      }

      const originalUser = users[0];

      // Construction requête dynamique
      const updates = [];
      const params = [];

      if (firstName !== undefined) {
        updates.push('firstName = ?');
        params.push(firstName);
      }
      if (lastName !== undefined) {
        updates.push('lastName = ?');
        params.push(lastName);
      }
      if (role !== undefined) {
        updates.push('role = ?');
        params.push(role);
      }
      if (department !== undefined) {
        updates.push('department = ?');
        params.push(department);
      }
      if (restrictions !== undefined) {
        updates.push('restrictions = ?');
        params.push(JSON.stringify(restrictions));
      }
      if (isActive !== undefined) {
        updates.push('isActive = ?');
        params.push(isActive);
      }

      // Reset mot de passe si demandé
      if (resetPassword) {
        const newPassword = Math.random().toString(36).slice(-10) + '!';
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        updates.push('password = ?', 'must_change_password = true');
        params.push(hashedPassword, true);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'Aucune modification spécifiée' });
      }

      params.push(userId);

      await db.execute(`
        UPDATE users SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = ?
      `, params);

      await auditLog('ADMIN_USER_UPDATED', req.user.id, {
        updated_user_id: userId,
        changes: Object.keys(req.body),
        reset_password: !!resetPassword
      }, req);

      const response = {
        message: 'Utilisateur modifié avec succès',
        userId
      };

      if (resetPassword) {
        response.temporaryPassword = newPassword;
        response.instructions = 'Nouveau mot de passe temporaire généré';
      }

      res.json(response);

    } catch (error) {
      console.error('Erreur modification utilisateur admin:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

// DELETE /api/admin/users/:id - Désactiver utilisateur (soft delete)
router.delete('/users/:id',
  requirePermission('users:delete'),
  async (req, res) => {
    const db = await initializeDatabase();
    
    try {
      const userId = req.params.id;

      // Vérifier existence
      const [users] = await db.execute('SELECT email FROM users WHERE id = ?', [userId]);
      if (users.length === 0) {
        return res.status(404).json({ error: 'Utilisateur introuvable' });
      }

      // Soft delete
      await db.execute(`
        UPDATE users SET 
          isActive = false,
          deactivated_at = NOW(),
          deactivated_by = ?
        WHERE id = ?
      `, [req.user.id, userId]);

      // Désactiver les sessions
      await db.execute(`
        UPDATE user_sessions SET 
          is_active = false,
          logout_reason = 'ACCOUNT_DEACTIVATED'
        WHERE user_id = ?
      `, [userId]);

      await auditLog('ADMIN_USER_DELETED', req.user.id, {
        deleted_user_id: userId,
        email: users[0].email
      }, req);

      res.json({
        message: 'Utilisateur désactivé avec succès',
        userId
      });

    } catch (error) {
      console.error('Erreur suppression utilisateur admin:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

// ============ ROUTES ADMIN - STATISTIQUES ============

// GET /api/admin/stats - Statistiques système
router.get('/stats',
  requirePermission('admin:read'),
  async (req, res) => {
    const db = await initializeDatabase();
    
    try {
      // Statistiques utilisateurs
      const [userStats] = await db.execute(`
        SELECT 
          COUNT(*) as total_users,
          SUM(isActive = true) as active_users,
          SUM(migrated_to_secure = true) as migrated_users,
          SUM(mfa_enabled = true) as mfa_users,
          SUM(failed_login_attempts > 0) as users_with_failed_attempts
        FROM users
      `);

      // Statistiques par rôle
      const [roleStats] = await db.execute(`
        SELECT role, COUNT(*) as count
        FROM users 
        WHERE isActive = true
        GROUP BY role
        ORDER BY count DESC
      `);

      // Sessions actives
      const [sessionStats] = await db.execute(`
        SELECT COUNT(*) as active_sessions
        FROM user_sessions 
        WHERE is_active = true AND expires_at > NOW()
      `);

      // Activité récente (7 derniers jours)
      const [activityStats] = await db.execute(`
        SELECT 
          DATE(timestamp) as date,
          COUNT(*) as events
        FROM audit_logs 
        WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY DATE(timestamp)
        ORDER BY date DESC
      `);

      await auditLog('ADMIN_STATS_VIEW', req.user.id, {}, req);

      res.json({
        users: userStats[0],
        roles: roleStats,
        sessions: sessionStats[0],
        activity: activityStats
      });

    } catch (error) {
      console.error('Erreur statistiques admin:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

// ============ ROUTES ADMIN - SESSIONS ============

// GET /api/admin/sessions - Sessions actives
router.get('/sessions',
  requirePermission('admin:read'),
  async (req, res) => {
    const db = await initializeDatabase();
    
    try {
      const { limit = 50, offset = 0 } = req.query;

      const [sessions] = await db.execute(`
        SELECT 
          s.id, s.user_email, s.ip_address, s.user_agent,
          s.created_at, s.last_used_at, s.expires_at,
          u.firstName, u.lastName, u.role
        FROM user_sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.is_active = true AND s.expires_at > NOW()
        ORDER BY s.last_used_at DESC
        LIMIT ? OFFSET ?
      `, [parseInt(limit), parseInt(offset)]);

      const [countResult] = await db.execute(`
        SELECT COUNT(*) as total FROM user_sessions 
        WHERE is_active = true AND expires_at > NOW()
      `);

      res.json({
        sessions,
        total: countResult[0].total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

    } catch (error) {
      console.error('Erreur sessions admin:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

// DELETE /api/admin/sessions/:id - Terminer session
router.delete('/sessions/:id',
  requirePermission('admin:write'),
  async (req, res) => {
    const db = await initializeDatabase();
    
    try {
      const sessionId = req.params.id;

      const [sessions] = await db.execute(`
        SELECT user_email FROM user_sessions WHERE id = ?
      `, [sessionId]);

      if (sessions.length === 0) {
        return res.status(404).json({ error: 'Session introuvable' });
      }

      await db.execute(`
        UPDATE user_sessions SET 
          is_active = false,
          logout_reason = 'ADMIN_TERMINATED'
        WHERE id = ?
      `, [sessionId]);

      await auditLog('ADMIN_SESSION_TERMINATED', req.user.id, {
        terminated_session_id: sessionId,
        user_email: sessions[0].user_email
      }, req);

      res.json({
        message: 'Session terminée avec succès',
        sessionId
      });

    } catch (error) {
      console.error('Erreur terminer session admin:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

// ============ ROUTES ADMIN - SÉCURITÉ ============

// POST /api/admin/unlock-user/:id - Débloquer utilisateur
router.post('/unlock-user/:id',
  requirePermission('users:write'),
  async (req, res) => {
    const db = await initializeDatabase();
    
    try {
      const userId = req.params.id;

      await db.execute(`
        UPDATE users SET 
          failed_login_attempts = 0,
          locked_until = NULL
        WHERE id = ?
      `, [userId]);

      await auditLog('ADMIN_USER_UNLOCKED', req.user.id, {
        unlocked_user_id: userId
      }, req);

      res.json({
        message: 'Utilisateur débloqué avec succès',
        userId
      });

    } catch (error) {
      console.error('Erreur déblocage utilisateur admin:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

// POST /api/admin/reset-2fa/:id - Réinitialiser 2FA
router.post('/reset-2fa/:id',
  requirePermission('users:write'),
  async (req, res) => {
    const db = await initializeDatabase();
    
    try {
      const userId = req.params.id;

      const [users] = await db.execute('SELECT email FROM users WHERE id = ?', [userId]);
      if (users.length === 0) {
        return res.status(404).json({ error: 'Utilisateur introuvable' });
      }

      await db.execute(`
        UPDATE users SET 
          mfa_enabled = false,
          mfa_secret = NULL,
          temp_mfa_secret = NULL
        WHERE id = ?
      `, [userId]);

      await auditLog('ADMIN_2FA_RESET', req.user.id, {
        reset_user_id: userId,
        email: users[0].email
      }, req);

      res.json({
        message: '2FA réinitialisé avec succès',
        userId,
        note: 'L\'utilisateur devra reconfigurer son 2FA'
      });

    } catch (error) {
      console.error('Erreur reset 2FA admin:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

module.exports = router;