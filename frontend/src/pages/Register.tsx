// frontend/src/pages/Register.tsx

import React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

// Schéma Zod corrigé
const registerSchema = z
  .object({
    name: z.string().min(1, 'Le nom est requis'),
    email: z.string().email('Email invalide'),
    password: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères'),
    confirmPassword: z.string().min(1, 'La confirmation du mot de passe est requise'),
    // ⚠️ z.enum([...]) n'accepte pas d'options. On passe par string()+refine pour personnaliser le message.
    role: z
      .string()
      .refine(
        (val) => ['actuaire', 'analyste', 'auditeur', 'viewer'].includes(val),
        { message: 'Veuillez sélectionner un rôle' }
      ),
    acceptTerms: z
      .boolean()
      .refine((val) => val === true, "Vous devez accepter les conditions d'utilisation"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

const Register: React.FC = () => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFormData) => {
    try {
      // Logique d'inscription
      console.log("Données d'inscription:", data);
    } catch (error) {
      console.error("Erreur lors de l'inscription:", error);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Nom */}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">
          Nom
        </label>
        <input
          {...register('name')}
          type="text"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
        />
        {errors.name?.message && <p className="form-error">{String(errors.name.message)}</p>}
      </div>

      {/* Email */}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
          Email
        </label>
        <input
          {...register('email')}
          type="email"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
        />
        {errors.email?.message && <p className="form-error">{String(errors.email.message)}</p>}
      </div>

      {/* Mot de passe */}
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
          Mot de passe
        </label>
        <input
          {...register('password')}
          type="password"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
        />
        {errors.password?.message && <p className="form-error">{String(errors.password.message)}</p>}
      </div>

      {/* Confirmation */}
      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
          Confirmation du mot de passe
        </label>
        <input
          {...register('confirmPassword')}
          type="password"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
        />
        {errors.confirmPassword?.message && (
          <p className="form-error">{String(errors.confirmPassword.message)}</p>
        )}
      </div>

      {/* Rôle */}
      <div>
        <label htmlFor="role" className="block text-sm font-medium text-gray-700">
          Rôle
        </label>
        <select
          {...register('role')}
          defaultValue="" // pour forcer la sélection
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
        >
          <option value="">Sélectionnez un rôle</option>
          <option value="actuaire">Actuaire</option>
          <option value="analyste">Analyste</option>
          <option value="auditeur">Auditeur</option>
          <option value="viewer">Viewer</option>
        </select>
        {errors.role?.message && <p className="form-error">{String(errors.role.message)}</p>}
        <p className="mt-1 text-sm text-gray-500">
          Votre rôle détermine vos permissions dans l'application
        </p>
      </div>

      {/* CGU */}
      <div className="flex items-center">
        <input
          id="acceptTerms"
          type="checkbox"
          {...register('acceptTerms')}
          className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
        />
        <label htmlFor="acceptTerms" className="ml-2 block text-sm text-gray-700">
          J'accepte les conditions d'utilisation
        </label>
      </div>
      {errors.acceptTerms?.message && <p className="form-error">{String(errors.acceptTerms.message)}</p>}

      {/* Soumettre */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
      >
        {isSubmitting ? 'Création...' : 'Créer le compte'}
      </button>
    </form>
  );
};

export default Register;
