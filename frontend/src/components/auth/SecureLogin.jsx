import React, { useState } from 'react';
import { AlertCircle, Eye, EyeOff, LogIn, Shield } from 'lucide-react';

const SecureLogin = ({ onLoginSuccess }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Configuration API - correspond à votre backend port 3001
  const API_BASE_URL = 'http://localhost:3001/api';

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Appel à votre endpoint POST /api/auth/login
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `Erreur ${response.status}`);
      }

      // Succès - Stockage des tokens JWT
      if (data.success && data.tokens) {
        localStorage.setItem('provtech_access_token', data.tokens.accessToken);
        localStorage.setItem('provtech_refresh_token', data.tokens.refreshToken);
        localStorage.setItem('provtech_user', JSON.stringify(data.user));
        
        setSuccess(`Connexion réussie ! Bienvenue ${data.user.first_name}`);
        
        // Callback vers le parent (AuthContext) si fourni
        if (onLoginSuccess) {
          onLoginSuccess({
            user: data.user,
            tokens: data.tokens
          });
        } else {
          // Navigation automatique si pas de callback
          setTimeout(() => {
            if (!data.user.has_2fa) {
              window.location.href = '/migration/2fa';
            } else if (data.user.role === 'ADMIN') {
              window.location.href = '/admin';
            } else {
              window.location.href = '/dashboard';
            }
          }, 1500);
        }
      }

    } catch (error) {
      console.error('Erreur de connexion:', error);
      setError(error.message || 'Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && formData.email && formData.password && !loading) {
      handleLogin();
    }
  };

  // Test avec utilisateurs existants de votre backend
  const fillTestUser = (userType) => {
    const testUsers = {
      admin: { email: 'admin@provtech.com', password: 'Admin123!' },
      actuaire: { email: 'actuaire@provtech.com', password: 'Actuaire123!' },
      test: { email: 'test@provtech.com', password: 'Test123!' }
    };
    
    setFormData(testUsers[userType]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-xl p-8">
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
            <Shield className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">ProvTech</h1>
          <p className="text-gray-600 mt-2">Authentification Hybride Sécurisée</p>
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700">
            <span className="text-sm">{success}</span>
          </div>
        )}

        {/* Champs de connexion */}
        <div className="space-y-6">
          
          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email professionnel
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="votre.email@provtech.com"
            />
          </div>

          {/* Mot de passe */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Mot de passe
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                onKeyPress={handleKeyPress}
                className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Votre mot de passe sécurisé"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4 text-gray-400" />
                ) : (
                  <Eye className="w-4 h-4 text-gray-400" />
                )}
              </button>
            </div>
          </div>

          {/* Bouton de connexion */}
          <button
            onClick={handleLogin}
            disabled={loading || !formData.email || !formData.password}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <LogIn className="w-4 h-4" />
            )}
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>

        </div>

        {/* Boutons de test - Utiles pour développement */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-500 mb-3 text-center">Test rapide (dev uniquement)</p>
          <div className="flex gap-2 justify-center">
            <button
              type="button"
              onClick={() => fillTestUser('admin')}
              className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
            >
              Admin
            </button>
            <button
              type="button"
              onClick={() => fillTestUser('actuaire')}
              className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
            >
              Actuaire
            </button>
            <button
              type="button"
              onClick={() => fillTestUser('test')}
              className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
            >
              Test
            </button>
          </div>
        </div>

        {/* Statut Backend */}
        <div className="mt-4 text-center">
          <p className="text-xs text-gray-400">
            Backend: localhost:3001 • JWT + 2FA Ready
          </p>
        </div>

      </div>
    </div>
  );
};

export default SecureLogin;