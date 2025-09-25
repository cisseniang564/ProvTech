// frontend/src/context/ThemeContext.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  actualTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ 
  children, 
  defaultTheme = 'system' 
}) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    // Récupérer le thème depuis localStorage
    const savedTheme = localStorage.getItem('app-theme') as Theme;
    return savedTheme || defaultTheme;
  });

  const [actualTheme, setActualTheme] = useState<'light' | 'dark'>('light');

  // Déterminer le thème réel à appliquer
  useEffect(() => {
    const determineTheme = () => {
      if (theme === 'system') {
        // Utiliser les préférences système
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        setActualTheme(mediaQuery.matches ? 'dark' : 'light');
        
        // Écouter les changements de préférence système
        const handleChange = (e: MediaQueryListEvent) => {
          setActualTheme(e.matches ? 'dark' : 'light');
        };
        
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
      } else {
        setActualTheme(theme as 'light' | 'dark');
      }
    };

    determineTheme();
  }, [theme]);

  // Appliquer le thème au document
  useEffect(() => {
    const root = document.documentElement;
    
    if (actualTheme === 'dark') {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
      
      // Variables CSS pour le mode sombre
      root.style.setProperty('--bg-primary', '#1a1a1a');
      root.style.setProperty('--bg-secondary', '#2d2d2d');
      root.style.setProperty('--text-primary', '#ffffff');
      root.style.setProperty('--text-secondary', '#a0a0a0');
      root.style.setProperty('--border-color', '#404040');
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
      
      // Variables CSS pour le mode clair
      root.style.setProperty('--bg-primary', '#ffffff');
      root.style.setProperty('--bg-secondary', '#f9fafb');
      root.style.setProperty('--text-primary', '#111827');
      root.style.setProperty('--text-secondary', '#6b7280');
      root.style.setProperty('--border-color', '#e5e7eb');
    }
    
    // Métadonnées pour les navigateurs mobiles
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', actualTheme === 'dark' ? '#1a1a1a' : '#ffffff');
    }
  }, [actualTheme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('app-theme', newTheme);
  };

  const toggleTheme = () => {
    const newTheme = actualTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, actualTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

// Hook pour les classes Tailwind conditionnelles selon le thème
export const useThemeClasses = () => {
  const { actualTheme } = useTheme();
  
  return {
    bg: {
      primary: actualTheme === 'dark' ? 'bg-gray-900' : 'bg-white',
      secondary: actualTheme === 'dark' ? 'bg-gray-800' : 'bg-gray-50',
      tertiary: actualTheme === 'dark' ? 'bg-gray-700' : 'bg-gray-100',
      hover: actualTheme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100',
    },
    text: {
      primary: actualTheme === 'dark' ? 'text-white' : 'text-gray-900',
      secondary: actualTheme === 'dark' ? 'text-gray-300' : 'text-gray-600',
      tertiary: actualTheme === 'dark' ? 'text-gray-400' : 'text-gray-500',
    },
    border: {
      primary: actualTheme === 'dark' ? 'border-gray-700' : 'border-gray-200',
      secondary: actualTheme === 'dark' ? 'border-gray-600' : 'border-gray-300',
    },
    divide: actualTheme === 'dark' ? 'divide-gray-700' : 'divide-gray-200',
    ring: actualTheme === 'dark' ? 'ring-gray-600' : 'ring-gray-300',
    shadow: actualTheme === 'dark' ? 'shadow-2xl' : 'shadow',
  };
};

// Composant ThemeToggle pour basculer facilement
export const ThemeToggle: React.FC = () => {
  const { theme, actualTheme, setTheme } = useTheme();
  
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setTheme('light')}
        className={`p-2 rounded-lg transition-colors ${
          theme === 'light' 
            ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300' 
            : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
        }`}
        title="Mode clair"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" 
          />
        </svg>
      </button>
      
      <button
        onClick={() => setTheme('dark')}
        className={`p-2 rounded-lg transition-colors ${
          theme === 'dark' 
            ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300' 
            : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
        }`}
        title="Mode sombre"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" 
          />
        </svg>
      </button>
      
      <button
        onClick={() => setTheme('system')}
        className={`p-2 rounded-lg transition-colors ${
          theme === 'system' 
            ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300' 
            : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
        }`}
        title="Préférences système"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" 
          />
        </svg>
      </button>
    </div>
  );
};

export default ThemeProvider;