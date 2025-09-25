// ===================================
// PAGE DE CONNEXION
// ===================================

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

import { useAuth } from '../context/AuthContext';
import { LoginCredentials } from '@/types';

// ============ VALIDATION SCHEMA ============
const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'L\'email est requis')
    .email('Format d\'email invalide'),
  password: z
    .string()
    .min(1, 'Le mot de passe est requis')
    .min(6, 'Le mot de passe doit contenir au moins 6 caractères'),
  remember_me: z.boolean().optional(),
});

type LoginFormData = z.infer<typeof loginSchema>;

// ============ COMPOSANT PRINCIPAL ============
const Login: React.FC = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { login, isAuthenticated, isLoading, error } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // ============ FORM MANAGEMENT ============
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    setError,
    clearErrors,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    mode: 'onChange',
    defaultValues: {
      email: '',
      password: '',
      remember_me: false,
    },
  });

  // ============ REDIRECTION SI DÉJÀ CONNECTÉ ============
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      const from = location.state?.from?.pathname || '/dashboard';
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, location]);

  // ============ GESTION DES ERREURS API ============
  useEffect(() => {
    if (error) {
      if (error.includes('email')) {
        setError('email', { message: error });
      } else if (error.includes('password') || error.includes('mot de passe')) {
        setError('password', { message: error });
      } else {
        toast.error(error);
      }
    }
  }, [error, setError]);

  // ============ SOUMISSION DU FORMULAIRE ============
  const onSubmit = async (data: LoginFormData) => {
    try {
      setIsSubmitting(true);
      clearErrors();

      const credentials: LoginCredentials = {
        email: data.email.toLowerCase().trim(),
        password: data.password,
        remember_me: data.remember_me,
      };

      await login(credentials);

      // La redirection est gérée par l'useEffect ci-dessus
    } catch (error: any) {
      console.error('Login error:', error);
      
      // Gestion spécifique des erreurs
      if (error.response?.status === 401) {
        setError('password', { 
          message: 'Email ou mot de passe incorrect' 
        });
      } else if (error.response?.status === 429) {
        toast.error('Trop de tentatives de connexion. Veuillez réessayer plus tard.');
      } else if (error.response?.status === 423) {
        toast.error('Compte temporairement verrouillé. Contactez l\'administrateur.');
      } else {
        toast.error('Erreur de connexion. Veuillez réessayer.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============ TOGGLES ============
  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  // ============ DEMO CREDENTIALS ============
  const fillDemoCredentials = (role: 'admin' | 'actuaire' | 'analyste') => {
    const demoCredentials = {
      admin: { email: 'admin@provtech.com', password: 'admin123' },
      actuaire: { email: 'actuaire@provtech.com', password: 'actuary123' },
      analyste: { email: 'analyste@provtech.com', password: 'analyst123' },
    };

    const form = document.getElementById('loginForm') as HTMLFormElement;
    if (form) {
      (form.email as any).value = demoCredentials[role].email;
      (form.password as any).value = demoCredentials[role].password;
    }
  };

  // ============ AFFICHAGE DU LOADER ============
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  // ============ RENDU ============
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto h-16 w-16 flex items-center justify-center rounded-full bg-primary-100">
            <svg
              className="h-8 w-8 text-primary-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <h1 className="mt-6 text-3xl font-bold text-gray-900">
            ProvTech
          </h1>
          <h2 className="mt-2 text-lg text-gray-600">
            Simulateur de Provisionnement Actuariel
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            Connectez-vous à votre compte
          </p>
        </div>

        {/* Formulaire de connexion */}
        <div className="bg-white py-8 px-6 shadow-lg rounded-lg border">
          <form 
            id="loginForm"
            className="space-y-6" 
            onSubmit={handleSubmit(onSubmit)}
          >
            {/* Email */}
            <div>
              <label htmlFor="email" className="form-label">
                Adresse email
              </label>
              <input
                {...register('email')}
                type="email"
                autoComplete="email"
                className={`form-input ${errors.email ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                placeholder="votre@email.com"
              />
              {errors.email && (
                <p className="form-error">{errors.email.message}</p>
              )}
            </div>

            {/* Mot de passe */}
            <div>
              <label htmlFor="password" className="form-label">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className={`form-input pr-10 ${errors.password ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={togglePasswordVisibility}
                >
                  {showPassword ? (
                    <EyeSlashIcon className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                  ) : (
                    <EyeIcon className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="form-error">{errors.password.message}</p>
              )}
            </div>

            {/* Se souvenir & Mot de passe oublié */}
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  {...register('remember_me')}
                  type="checkbox"
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <label className="ml-2 block text-sm text-gray-700">
                  Se souvenir de moi
                </label>
              </div>

              <div className="text-sm">
                <Link
                  to="/forgot-password"
                  className="text-primary-600 hover:text-primary-500 font-medium"
                >
                  Mot de passe oublié ?
                </Link>
              </div>
            </div>

            {/* Bouton de connexion */}
            <button
              type="submit"
              disabled={!isValid || isSubmitting}
              className={`
                w-full flex justify-center items-center py-3 px-4 border border-transparent 
                rounded-lg shadow-sm text-sm font-medium text-white
                ${isValid && !isSubmitting
                  ? 'bg-primary-600 hover:bg-primary-700 focus:ring-primary-500'
                  : 'bg-gray-400 cursor-not-allowed'
                }
                focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors
              `}
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Connexion en cours...
                </>
              ) : (
                'Se connecter'
              )}
            </button>
          </form>

          {/* Comptes de démonstration */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-xs text-gray-500 text-center mb-4">
                Comptes de démonstration
              </p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => fillDemoCredentials('admin')}
                  className="btn-sm btn-outline text-xs"
                >
                  Admin
                </button>
                <button
                  type="button"
                  onClick={() => fillDemoCredentials('actuaire')}
                  className="btn-sm btn-outline text-xs"
                >
                  Actuaire
                </button>
                <button
                  type="button"
                  onClick={() => fillDemoCredentials('analyste')}
                  className="btn-sm btn-outline text-xs"
                >
                  Analyste
                </button>
              </div>
            </div>
          )}

          {/* Lien d'inscription */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Pas encore de compte ?{' '}
              <Link
                to="/register"
                className="text-primary-600 hover:text-primary-500 font-medium"
              >
                Créer un compte
              </Link>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center">
          <p className="text-xs text-gray-500">
            © 2024 ProvTech. Tous droits réservés.
          </p>
          <div className="mt-2 space-x-4">
            <Link to="/privacy" className="text-xs text-gray-500 hover:text-gray-700">
              Confidentialité
            </Link>
            <Link to="/terms" className="text-xs text-gray-500 hover:text-gray-700">
              Conditions d'utilisation
            </Link>
            <Link to="/support" className="text-xs text-gray-500 hover:text-gray-700">
              Support
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;