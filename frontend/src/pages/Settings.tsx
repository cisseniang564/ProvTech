// frontend/src/pages/Settings.tsx

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../types';

type ProfileForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;        // champs locaux (non envoyés à l'API)
  department: string;   // champs locaux (non envoyés à l'API)
  company: string;      // champs locaux (non envoyés à l'API)
  timezone: string;     // champs locaux (non envoyés à l'API)
};

const Settings: React.FC = () => {
  const { user, updateUser } = useAuth();

  // Découper le nom complet pour pré-remplir le formulaire
  const splitName = (full?: string) => {
    if (!full) return { first: 'Jean', last: 'Dupont' };
    const parts = full.trim().split(/\s+/);
    if (parts.length === 1) return { first: parts[0], last: '' };
    return { first: parts[0], last: parts.slice(1).join(' ') };
  };

  const initial = splitName(user?.name);

  const [profile, setProfile] = useState<ProfileForm>({
    firstName: initial.first,
    lastName: initial.last,
    email: user?.email || 'jean.dupont@company.com',
    // Les champs ci-dessous ne font pas partie de `User` côté type ⇒ on les garde localement
    phone: '+33 1 23 45 67 89',
    department: 'Actuariat',
    company: 'Assurance XYZ',
    timezone: 'Europe/Paris',
  });

  const handleProfileUpdate = async () => {
    try {
      // N'envoyer que des propriétés valides pour `Partial<User>`
      await updateUser?.({
        name: `${profile.firstName} ${profile.lastName}`.trim(),
        email: profile.email,
      });
      alert('Profil mis à jour avec succès');
    } catch (error) {
      console.error('Erreur lors de la mise à jour:', error);
      alert('Erreur lors de la mise à jour du profil');
    }
  };

  const roleLabel = user?.role ? ROLES[user.role] : '—';

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Paramètres</h1>

      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Informations du profil</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">Prénom</label>
            <input
              type="text"
              value={profile.firstName}
              onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Nom</label>
            <input
              type="text"
              value={profile.lastName}
              onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              value={profile.email}
              onChange={(e) => setProfile({ ...profile, email: e.target.value })}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>

          {/* Champs locaux pour confort utilisateur (non sauvegardés dans `User`) */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Téléphone</label>
            <input
              type="tel"
              value={profile.phone}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Département</label>
            <input
              type="text"
              value={profile.department}
              onChange={(e) => setProfile({ ...profile, department: e.target.value })}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Rôle</label>
            <input
              type="text"
              value={roleLabel}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-100 text-gray-500 sm:text-sm"
              disabled
            />
          </div>
        </div>

        <div className="mt-6">
          <button
            onClick={handleProfileUpdate}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Mettre à jour le profil
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
