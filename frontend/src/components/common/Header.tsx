// ===================================
// HEADER DE NAVIGATION
// ===================================

import React, { useState, Fragment } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, Transition } from '@headlessui/react';
import {
  Bars3Icon,
  BellIcon,
  MagnifyingGlassIcon,
  SunIcon,
  MoonIcon,
  Cog6ToothIcon,
  UserIcon,
  ArrowRightOnRectangleIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../../context/AuthContext';
import { ROLES } from '../../types';

// ============ TYPES ============
interface HeaderProps {
  onMenuClick: () => void;
  isMobileMenuOpen: boolean;
}

interface NotificationBadgeProps {
  count: number;
}

// ============ BADGE DE NOTIFICATIONS ============
const NotificationBadge: React.FC<NotificationBadgeProps> = ({ count }) => {
  if (count === 0) return null;
  
  return (
    <span className="absolute -top-2 -right-2 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-500 rounded-full min-w-[1.25rem] h-5">
      {count > 99 ? '99+' : count}
    </span>
  );
};

// ============ COMPOSANT PRINCIPAL ============
const Header: React.FC<HeaderProps> = ({ onMenuClick, isMobileMenuOpen }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [notificationCount] = useState(3); // TODO: Récupérer depuis l'état global
  
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // ============ GESTION DU THÈME ============
  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle('dark');
    // TODO: Sauvegarder la préférence dans le localStorage ou les préférences utilisateur
  };

  // ============ GESTION DE LA RECHERCHE ============
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // TODO: Implémenter la recherche globale
      console.log('Searching for:', searchQuery);
      navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  // ============ DÉCONNEXION ============
  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // ============ NAVIGATION RAPIDE ============
  const quickActions = [
    {
      name: 'Nouveau triangle',
      href: '/data-import',
      permission: 'triangles:write',
    },
    {
      name: 'Nouveau calcul',
      href: '/calculations/new',
      permission: 'calculations:write',
    },
    {
      name: 'Rapports',
      href: '/reports',
      permission: 'exports:read',
    },
  ];

  // ============ RENDU ============
  return (
    <header className="bg-white shadow-sm border-b border-gray-200 dark:bg-gray-800 dark:border-gray-700">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Section gauche - Logo et menu burger */}
          <div className="flex items-center space-x-4">
            {/* Bouton menu burger mobile */}
            <button
              type="button"
              className="lg:hidden inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 dark:text-gray-300 dark:hover:bg-gray-700"
              onClick={onMenuClick}
              aria-expanded={isMobileMenuOpen}
            >
              <span className="sr-only">Ouvrir le menu principal</span>
              <Bars3Icon className="h-6 w-6" />
            </button>

            {/* Logo */}
            <Link to="/dashboard" className="flex items-center space-x-2">
              <div className="h-8 w-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <svg
                  className="h-5 w-5 text-white"
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
              <span className="hidden sm:block text-xl font-bold text-gray-900 dark:text-white">
                ProvTech
              </span>
            </Link>
          </div>

          {/* Section centre - Barre de recherche */}
          <div className="hidden md:block flex-1 max-w-lg mx-8">
            <form onSubmit={handleSearch} className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
                placeholder="Rechercher triangles, calculs..."
              />
            </form>
          </div>

          {/* Section droite - Actions et profil */}
          <div className="flex items-center space-x-4">
            {/* Actions rapides */}
            <div className="hidden xl:flex items-center space-x-2">
              {quickActions.map((action) => (
                <Link
                  key={action.name}
                  to={action.href}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-600"
                >
                  {action.name}
                </Link>
              ))}
            </div>

            {/* Bouton thème */}
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded-lg dark:text-gray-300 dark:hover:text-gray-200"
              title={isDarkMode ? 'Mode clair' : 'Mode sombre'}
            >
              {isDarkMode ? (
                <SunIcon className="h-5 w-5" />
              ) : (
                <MoonIcon className="h-5 w-5" />
              )}
            </button>

            {/* Notifications */}
            <button
              type="button"
              className="relative p-2 text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded-lg dark:text-gray-300 dark:hover:text-gray-200"
              onClick={() => navigate('/notifications')}
            >
              <span className="sr-only">Voir les notifications</span>
              <BellIcon className="h-6 w-6" />
              <NotificationBadge count={notificationCount} />
            </button>

            {/* Menu profil */}
            <Menu as="div" className="relative">
              <div>
                <Menu.Button className="max-w-xs bg-white dark:bg-gray-800 rounded-full flex items-center text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 lg:p-2 lg:rounded-md lg:hover:bg-gray-50 dark:lg:hover:bg-gray-700">
                  <div className="h-8 w-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                    <UserIcon className="h-5 w-5 text-gray-600 dark:text-gray-300" />
                  </div>
                  <div className="hidden lg:ml-3 lg:block">
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-200">
                      {user?.name}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {user?.role && ROLES[user.role]}
                    </div>
                  </div>
                  <ChevronDownIcon className="hidden lg:block h-4 w-4 ml-2 text-gray-400" />
                </Menu.Button>
              </div>

              <Transition
                as={Fragment}
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
              >
                <Menu.Items className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
                  <div className="py-1">
                    {/* Informations utilisateur */}
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {user?.name}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {user?.email}
                      </p>
                      <p className="text-xs text-primary-600 dark:text-primary-400 mt-1">
                        {user?.role && ROLES[user.role]}
                      </p>
                    </div>

                    {/* Menu items */}
                    <Menu.Item>
                      {({ active }) => (
                        <Link
                          to="/profile"
                          className={`${
                            active ? 'bg-gray-100 dark:bg-gray-700' : ''
                          } flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-200`}
                        >
                          <UserIcon className="mr-3 h-4 w-4" />
                          Mon profil
                        </Link>
                      )}
                    </Menu.Item>

                    <Menu.Item>
                      {({ active }) => (
                        <Link
                          to="/settings"
                          className={`${
                            active ? 'bg-gray-100 dark:bg-gray-700' : ''
                          } flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-200`}
                        >
                          <Cog6ToothIcon className="mr-3 h-4 w-4" />
                          Paramètres
                        </Link>
                      )}
                    </Menu.Item>

                    {/* Divider */}
                    <div className="border-t border-gray-100 dark:border-gray-700"></div>

                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={handleLogout}
                          className={`${
                            active ? 'bg-gray-100 dark:bg-gray-700' : ''
                          } flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200`}
                        >
                          <ArrowRightOnRectangleIcon className="mr-3 h-4 w-4" />
                          Se déconnecter
                        </button>
                      )}
                    </Menu.Item>
                  </div>
                </Menu.Items>
              </Transition>
            </Menu>
          </div>
        </div>
      </div>

      {/* Barre de recherche mobile */}
      <div className="md:hidden px-4 pb-3">
        <form onSubmit={handleSearch} className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
            placeholder="Rechercher..."
          />
        </form>
      </div>
    </header>
  );
};

export default Header;