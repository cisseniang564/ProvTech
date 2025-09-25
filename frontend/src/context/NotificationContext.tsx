// frontend/src/context/NotificationContext.tsx
import React, { createContext, useContext } from 'react';
import toast from 'react-hot-toast';

interface NotificationContextType {
  success: (message: string, description?: string) => void;
  error: (message: string, description?: string) => void;
  warning: (message: string, description?: string) => void;
  info: (message: string, description?: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    // Retourner un contexte par défaut si non fourni
    return {
      success: (message: string, description?: string) => {
        toast.success(description ? `${message}: ${description}` : message);
      },
      error: (message: string, description?: string) => {
        toast.error(description ? `${message}: ${description}` : message);
      },
      warning: (message: string, description?: string) => {
        toast(description ? `${message}: ${description}` : message, { icon: '⚠️' });
      },
      info: (message: string, description?: string) => {
        toast(description ? `${message}: ${description}` : message, { icon: 'ℹ️' });
      }
    };
  }
  return context;
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const value: NotificationContextType = {
    success: (message: string, description?: string) => {
      toast.success(description ? `${message}: ${description}` : message);
    },
    error: (message: string, description?: string) => {
      toast.error(description ? `${message}: ${description}` : message);
    },
    warning: (message: string, description?: string) => {
      toast(description ? `${message}: ${description}` : message, { icon: '⚠️' });
    },
    info: (message: string, description?: string) => {
      toast(description ? `${message}: ${description}` : message, { icon: 'ℹ️' });
    }
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export default NotificationProvider;