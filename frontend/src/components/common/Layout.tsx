// ===================================
// LAYOUT PRINCIPAL
// ===================================

import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

import Header from './Header';
import Sidebar from './Sidebar';
import { LoadingPage } from './Loading';
import { useAuth } from '../../context/AuthContext';

// ============ TYPES ============
interface LayoutProps {
  children?: React.ReactNode;
}

interface PageConfig {
  title: string;
  description?: string;
  showSidebar?: boolean;
  fullWidth?: boolean;
  background?: 'default' | 'gray' | 'white';
}


// ============ CONFIGURATION DES PAGES ============
const getPageConfig = (pathname: string): PageConfig => {
  const pageConfigs: Record<string, PageConfig> = {
    '/dashboard': {
      title: 'Tableau de bord',
      description: 'Vue d\'ensemble de vos données actuarielles',
      showSidebar: true,
      background: 'gray',
    },
    '/data-import': {
      title: 'Import de données',
      description: 'Importer et valider vos triangles de liquidation',
      showSidebar: true,
    },
    '/calculations': {
      title: 'Calculs actuariels',
      description: 'Configuration et exécution des méthodes actuarielles',
      showSidebar: true,
    },
    '/reports': {
      title: 'Rapports',
      description: 'Génération de rapports de conformité IFRS 17',
      showSidebar: true,
    },
    '/benchmarking': {
      title: 'Benchmarking',
      description: 'Comparaison avec les données du marché',
      showSidebar: true,
    },
    '/simulation': {
      title: 'Simulations',
      description: 'Analyses prospectives et tests de stress',
      showSidebar: true,
    },
    '/audit': {
      title: 'Audit',
      description: 'Piste d\'audit et conformité réglementaire',
      showSidebar: true,
    },
    '/settings': {
      title: 'Paramètres',
      description: 'Configuration de votre compte et préférences',
      showSidebar: true,
    },
    '/profile': {
      title: 'Mon profil',
      description: 'Gestion de votre profil utilisateur',
      showSidebar: true,
    },
    '/notifications': {
      title: 'Notifications',
      description: 'Centre de notifications',
      showSidebar: true,
    },
  };

  // Configuration par défaut pour les pages non spécifiées
  const defaultConfig: PageConfig = {
    title: 'ProvTech',
    showSidebar: true,
    background: 'default',
  };

  // Recherche de configuration exacte
  if (pageConfigs[pathname]) {
    return pageConfigs[pathname];
  }

  // Recherche de configuration par préfixe pour les routes dynamiques
  const matchingPath = Object.keys(pageConfigs).find(path => 
    pathname.startsWith(path) && path !== '/'
  );

  if (matchingPath) {
    return {
      ...pageConfigs[matchingPath],
      title: `${pageConfigs[matchingPath].title} - ProvTech`,
    };
  }

  return defaultConfig;
};

// ============ BREADCRUMB ============
const Breadcrumb: React.FC<{ pathname: string }> = ({ pathname }) => {
  const getBreadcrumbItems = (path: string) => {
    const segments = path.split('/').filter(Boolean);
    const items = [
      { name: 'Accueil', href: '/dashboard' },
    ];

    let currentPath = '';
    segments.forEach((segment, index) => {
      currentPath += `/${segment}`;
      
      const segmentNames: Record<string, string> = {
        'dashboard': 'Tableau de bord',
        'data-import': 'Import de données',
        'calculations': 'Calculs',
        'reports': 'Rapports',
        'benchmarking': 'Benchmarking',
        'simulation': 'Simulations',
        'audit': 'Audit',
        'settings': 'Paramètres',
        'profile': 'Mon profil',
        'notifications': 'Notifications',
        'users': 'Utilisateurs',
      };

      items.push({
        name: segmentNames[segment] || segment,
        href: currentPath,
      });
    });

    return items;
  };

  const items = getBreadcrumbItems(pathname);

  if (items.length <= 1) return null;

  return (
    <nav className="flex mb-4" aria-label="Breadcrumb">
      <ol className="inline-flex items-center space-x-1 md:space-x-3">
        {items.map((item, index) => (
          <li key={item.href} className="inline-flex items-center">
            {index > 0 && (
              <svg
                className="w-4 h-4 text-gray-400 mx-1"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            )}
            {index === items.length - 1 ? (
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {item.name}
              </span>
            ) : (
              <a
                href={item.href}
                className="text-sm font-medium text-gray-700 hover:text-primary-600 dark:text-gray-300 dark:hover:text-primary-400"
              >
                {item.name}
              </a>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
};

// ============ COMPOSANT PRINCIPAL ============
const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  
  const pageConfig = getPageConfig(location.pathname);

  // ============ GESTION DU MENU MOBILE ============
  const handleMobileMenuToggle = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const handleMobileMenuClose = () => {
    setIsMobileMenuOpen(false);
  };

  // ============ FERMETURE AUTOMATIQUE DU MENU MOBILE ============
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) { // lg breakpoint
        setIsMobileMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ============ FERMETURE DU MENU LORS DU CHANGEMENT DE ROUTE ============
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // ============ GESTION DU SCROLL ============
  useEffect(() => {
    // Empêcher le scroll du body quand le menu mobile est ouvert
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  // ============ LOADING STATE ============
  if (isLoading) {
    return <LoadingPage message="Chargement de l'application..." />;
  }

  // ============ NON AUTHENTIFIÉ ============
  if (!isAuthenticated) {
    return children ? <>{children}</> : <Outlet />;
  }

  // ============ CLASSES CSS DYNAMIQUES ============
  const getBackgroundClass = () => {
    switch (pageConfig.background) {
      case 'gray':
        return 'bg-gray-50 dark:bg-gray-900';
      case 'white':
        return 'bg-white dark:bg-gray-800';
      default:
        return 'bg-gray-50 dark:bg-gray-900';
    }
  };

  const getContentClass = () => {
    const baseClass = 'flex-1 flex flex-col overflow-hidden';
    const sidebarClass = pageConfig.showSidebar ? 'lg:pl-64' : '';
    return `${baseClass} ${sidebarClass}`;
  };

  const getMainClass = () => {
    const baseClass = 'flex-1 overflow-y-auto focus:outline-none';
    const widthClass = pageConfig.fullWidth ? '' : 'max-w-7xl mx-auto';
    const paddingClass = 'px-4 sm:px-6 lg:px-8 py-6';
    return `${baseClass} ${widthClass} ${paddingClass}`;
  };

  // ============ RENDU ============
  return (
    <div className={`min-h-screen ${getBackgroundClass()}`}>
      {/* Meta tags dynamiques */}
      <Helmet>
        <title>
          {pageConfig.title} - ProvTech
        </title>
        {pageConfig.description && (
          <meta name="description" content={pageConfig.description} />
        )}
      </Helmet>

      {/* Sidebar */}
      {pageConfig.showSidebar && (
        <Sidebar 
          isOpen={isMobileMenuOpen} 
          onClose={handleMobileMenuClose} 
        />
      )}

      {/* Contenu principal */}
      <div className={getContentClass()}>
        {/* Header */}
        <Header 
          onMenuClick={handleMobileMenuToggle}
          isMobileMenuOpen={isMobileMenuOpen}
        />

        {/* Zone de contenu */}
        <main className={getMainClass()}>
          {/* Breadcrumb */}
          <Breadcrumb pathname={location.pathname} />

          {/* Titre de page */}
          {pageConfig.title !== 'ProvTech' && (
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {pageConfig.title}
              </h1>
              {pageConfig.description && (
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {pageConfig.description}
                </p>
              )}
            </div>
          )}

          {/* Contenu de la page */}
          <div className="flex-1">
            {children || <Outlet />}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;