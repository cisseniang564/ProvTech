// ===================================
// SIDEBAR - NAVIGATION LATÉRALE
// ===================================

import React, { Fragment } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Dialog, Transition } from '@headlessui/react';
import {
  XMarkIcon,
  HomeIcon,
  DocumentArrowUpIcon,
  CalculatorIcon,
  DocumentChartBarIcon,
  Cog6ToothIcon,
  ShieldCheckIcon,
  ChartBarIcon,
  BeakerIcon,
  UserGroupIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../../context/AuthContext';

// ============ TYPES ============
interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavigationItem {
  name: string;
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  current?: boolean;
  badge?: string | number;
  permission?: string;
  description?: string;
}

interface NavigationSection {
  title: string;
  items: NavigationItem[];
}

// ============ CONFIGURATION DE LA NAVIGATION ============
const useNavigationConfig = () => {
  const location = useLocation();
  const { user, hasPermission } = useAuth();

  const navigationSections: NavigationSection[] = [
    {
      title: 'Principal',
      items: [
        {
          name: 'Tableau de bord',
          href: '/dashboard',
          icon: HomeIcon,
          description: 'Vue d\'ensemble de vos données',
        },
        {
          name: 'Import de données',
          href: '/data-import',
          icon: DocumentArrowUpIcon,
          permission: 'triangles:write',
          description: 'Importer vos triangles de liquidation',
        },
        {
          name: 'Calculs',
          href: '/calculations',
          icon: CalculatorIcon,
          permission: 'calculations:read',
          description: 'Méthodes actuarielles et résultats',
        },
        {
          name: 'Rapports',
          href: '/reports',
          icon: DocumentChartBarIcon,
          permission: 'exports:read',
          description: 'Génération de rapports IFRS 17',
        },
      ],
    },
    {
      title: 'Outils avancés',
      items: [
        {
          name: 'Benchmarking',
          href: '/benchmarking',
          icon: ChartBarIcon,
          permission: 'triangles:read',
          description: 'Comparaison avec le marché',
        },
        {
          name: 'Simulations',
          href: '/simulation',
          icon: BeakerIcon,
          permission: 'calculations:write',
          description: 'Analyses prospectives',
        },
      ],
    },
    {
      title: 'Administration',
      items: [
        {
          name: 'Audit',
          href: '/audit',
          icon: ShieldCheckIcon,
          permission: 'audit:read',
          description: 'Piste d\'audit et conformité',
        },
        {
          name: 'Utilisateurs',
          href: '/users',
          icon: UserGroupIcon,
          permission: 'users:read',
          description: 'Gestion des utilisateurs',
        },
        {
          name: 'Paramètres',
          href: '/settings',
          icon: Cog6ToothIcon,
          description: 'Configuration de l\'application',
        },
      ],
    },
  ];

  // Filtrer les éléments selon les permissions
  const filteredSections = navigationSections.map(section => ({
    ...section,
    items: section.items.filter(item => 
      !item.permission || hasPermission(item.permission)
    ).map(item => ({
      ...item,
      current: location.pathname === item.href || 
               (item.href !== '/dashboard' && location.pathname.startsWith(item.href)),
    })),
  })).filter(section => section.items.length > 0);

  return filteredSections;
};

// ============ COMPOSANT ITEM DE NAVIGATION ============
const NavigationItem: React.FC<{ item: NavigationItem; onClick?: () => void }> = ({ 
  item, 
  onClick 
}) => {
  const Icon = item.icon;
  
  return (
    <Link
      to={item.href}
      onClick={onClick}
      className={`
        group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors
        ${item.current
          ? 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-200'
          : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white'
        }
      `}
    >
      <Icon
        className={`
          flex-shrink-0 h-5 w-5 mr-3
          ${item.current
            ? 'text-primary-600 dark:text-primary-200'
            : 'text-gray-400 group-hover:text-gray-500 dark:group-hover:text-gray-300'
          }
        `}
      />
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <span>{item.name}</span>
          {item.badge && (
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200">
              {item.badge}
            </span>
          )}
        </div>
        {item.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {item.description}
          </p>
        )}
      </div>
    </Link>
  );
};

// ============ COMPOSANT SECTION ============
const NavigationSection: React.FC<{ 
  section: NavigationSection; 
  onItemClick?: () => void;
}> = ({ section, onItemClick }) => {
  if (section.items.length === 0) return null;

  return (
    <div className="space-y-1">
      <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider dark:text-gray-400">
        {section.title}
      </h3>
      <div className="space-y-1">
        {section.items.map((item) => (
          <NavigationItem
            key={item.name}
            item={item}
            onClick={onItemClick}
          />
        ))}
      </div>
    </div>
  );
};

// ============ CONTENU DE LA SIDEBAR ============
const SidebarContent: React.FC<{ onItemClick?: () => void }> = ({ onItemClick }) => {
  const { user } = useAuth();
  const navigationSections = useNavigationConfig();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-center h-16 bg-primary-600 dark:bg-primary-700">
        <Link to="/dashboard" className="flex items-center space-x-2" onClick={onItemClick}>
          <div className="h-8 w-8 bg-white rounded-lg flex items-center justify-center">
            <svg
              className="h-5 w-5 text-primary-600"
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
          <span className="text-xl font-bold text-white">ProvTech</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-6 overflow-y-auto">
        {navigationSections.map((section) => (
          <NavigationSection
            key={section.title}
            section={section}
            onItemClick={onItemClick}
          />
        ))}
      </nav>

      {/* Footer avec informations utilisateur */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center space-x-3">
          <div className="h-8 w-8 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
            <span className="text-sm font-medium text-primary-600 dark:text-primary-200">
              {user?.name?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {user?.name}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              Connecté
            </p>
          </div>
          <div className="flex-shrink-0">
            <div className="h-2 w-2 bg-green-400 rounded-full"></div>
          </div>
        </div>
      </div>

      {/* Version et dernière mise à jour */}
      <div className="px-4 pb-4">
        <div className="text-xs text-gray-500 dark:text-gray-400 text-center space-y-1">
          <div className="flex items-center justify-center space-x-1">
            <ClockIcon className="h-3 w-3" />
            <span>v1.0.0</span>
          </div>
          <div>Dernière mise à jour: {new Date().toLocaleDateString('fr-FR')}</div>
        </div>
      </div>
    </div>
  );
};

// ============ COMPOSANT PRINCIPAL ============
const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  return (
    <>
      {/* Sidebar desktop */}
      <div className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:border-r lg:border-gray-200 lg:bg-white lg:dark:bg-gray-800 lg:dark:border-gray-700">
        <SidebarContent />
      </div>

      {/* Sidebar mobile */}
      <Transition.Root show={isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-40 lg:hidden" onClose={onClose}>
          <Transition.Child
            as={Fragment}
            enter="transition-opacity ease-linear duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-opacity ease-linear duration-300"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-600 bg-opacity-75" />
          </Transition.Child>

          <div className="fixed inset-0 flex z-40">
            <Transition.Child
              as={Fragment}
              enter="transition ease-in-out duration-300 transform"
              enterFrom="-translate-x-full"
              enterTo="translate-x-0"
              leave="transition ease-in-out duration-300 transform"
              leaveFrom="translate-x-0"
              leaveTo="-translate-x-full"
            >
              <Dialog.Panel className="relative flex-1 flex flex-col max-w-xs w-full bg-white dark:bg-gray-800">
                <Transition.Child
                  as={Fragment}
                  enter="ease-in-out duration-300"
                  enterFrom="opacity-0"
                  enterTo="opacity-100"
                  leave="ease-in-out duration-300"
                  leaveFrom="opacity-100"
                  leaveTo="opacity-0"
                >
                  <div className="absolute top-0 right-0 -mr-12 pt-2">
                    <button
                      type="button"
                      className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
                      onClick={onClose}
                    >
                      <span className="sr-only">Fermer la sidebar</span>
                      <XMarkIcon className="h-6 w-6 text-white" aria-hidden="true" />
                    </button>
                  </div>
                </Transition.Child>

                <SidebarContent onItemClick={onClose} />
              </Dialog.Panel>
            </Transition.Child>
            
            <div className="flex-shrink-0 w-14" aria-hidden="true">
              {/* Force sidebar to shrink to fit close icon */}
            </div>
          </div>
        </Dialog>
      </Transition.Root>
    </>
  );
};

export default Sidebar;