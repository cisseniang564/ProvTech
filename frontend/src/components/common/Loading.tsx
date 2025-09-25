// ===================================
// COMPOSANTS DE CHARGEMENT
// ===================================

import React from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

// ============ TYPES ============
interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: 'primary' | 'white' | 'gray';
  className?: string;
}

interface LoadingPageProps {
  message?: string;
  submessage?: string;
}

interface LoadingButtonProps {
  isLoading: boolean;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
}

interface LoadingOverlayProps {
  isVisible: boolean;
  message?: string;
  progress?: number;
}

interface SkeletonProps {
  variant?: 'text' | 'rectangular' | 'circular';
  width?: string | number;
  height?: string | number;
  className?: string;
  animation?: 'pulse' | 'wave';
}

// ============ SPINNER DE BASE ============
export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  color = 'primary',
  className = '',
}) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16',
  };

  const colorClasses = {
    primary: 'border-primary-500',
    white: 'border-white',
    gray: 'border-gray-500',
  };

  return (
    <div
      className={`
        animate-spin rounded-full border-2 border-t-transparent
        ${sizeClasses[size]}
        ${colorClasses[color]}
        ${className}
      `}
      role="status"
      aria-label="Chargement en cours"
    >
      <span className="sr-only">Chargement...</span>
    </div>
  );
};

// ============ PAGE DE CHARGEMENT COMPLÈTE ============
export const LoadingPage: React.FC<LoadingPageProps> = ({
  message = 'Chargement en cours...',
  submessage,
}) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        {/* Logo/Icône */}
        <div className="mx-auto h-16 w-16 flex items-center justify-center rounded-full bg-primary-100 mb-6">
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

        {/* Spinner */}
        <LoadingSpinner size="lg" className="mx-auto mb-4" />

        {/* Messages */}
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          {message}
        </h2>
        
        {submessage && (
          <p className="text-gray-600 text-sm max-w-md mx-auto">
            {submessage}
          </p>
        )}

        {/* Animation de points */}
        <div className="flex justify-center space-x-1 mt-4">
          <div className="w-2 h-2 bg-primary-500 rounded-full animate-bounce"></div>
          <div className="w-2 h-2 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
          <div className="w-2 h-2 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
        </div>
      </div>
    </div>
  );
};

// ============ BOUTON AVEC LOADING ============
export const LoadingButton: React.FC<LoadingButtonProps> = ({
  isLoading,
  children,
  className = '',
  disabled = false,
  onClick,
  type = 'button',
}) => {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || isLoading}
      className={`
        relative inline-flex items-center justify-center
        ${isLoading ? 'cursor-not-allowed opacity-75' : ''}
        ${className}
      `}
    >
      {isLoading && (
        <LoadingSpinner 
          size="sm" 
          color="white" 
          className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2"
        />
      )}
      
      <span className={isLoading ? 'opacity-0' : 'opacity-100'}>
        {children}
      </span>
    </button>
  );
};

// ============ OVERLAY DE CHARGEMENT ============
export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  isVisible,
  message = 'Traitement en cours...',
  progress,
}) => {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4 text-center">
        <LoadingSpinner size="lg" className="mx-auto mb-4" />
        
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          {message}
        </h3>

        {typeof progress === 'number' && (
          <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
            <div
              className="bg-primary-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            ></div>
            <p className="text-sm text-gray-600 mt-2">
              {Math.round(progress)}%
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// ============ SKELETON LOADING ============
export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'rectangular',
  width = '100%',
  height = '1rem',
  className = '',
  animation = 'pulse',
}) => {
  const baseClasses = 'bg-gray-200 animate-pulse';
  
  const variantClasses = {
    text: 'rounded',
    rectangular: 'rounded',
    circular: 'rounded-full',
  };

  const animationClasses = {
    pulse: 'animate-pulse',
    wave: 'animate-pulse', // On peut ajouter une animation wave personnalisée plus tard
  };

  const style: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  };

  return (
    <div
      className={`
        ${baseClasses}
        ${variantClasses[variant]}
        ${animationClasses[animation]}
        ${className}
      `}
      style={style}
      aria-label="Contenu en cours de chargement"
    />
  );
};

// ============ SKELETON POUR TABLEAUX ============
export const TableSkeleton: React.FC<{ rows?: number; cols?: number }> = ({
  rows = 5,
  cols = 4,
}) => {
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={`header-${i}`} height="2rem" />
        ))}
      </div>
      
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div 
          key={`row-${rowIndex}`}
          className="grid gap-4" 
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        >
          {Array.from({ length: cols }).map((_, colIndex) => (
            <Skeleton key={`cell-${rowIndex}-${colIndex}`} height="1.5rem" />
          ))}
        </div>
      ))}
    </div>
  );
};

// ============ SKELETON POUR CARTES ============
export const CardSkeleton: React.FC = () => {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="space-y-4">
        <Skeleton height="1.5rem" width="60%" />
        <Skeleton height="1rem" />
        <Skeleton height="1rem" width="80%" />
        <div className="pt-4">
          <Skeleton height="2rem" width="30%" />
        </div>
      </div>
    </div>
  );
};

// ============ LOADING POUR TRIANGLE ============
export const TriangleSkeleton: React.FC<{ size?: number }> = ({ size = 10 }) => {
  return (
    <div className="p-4">
      <div className="space-y-2">
        {Array.from({ length: size }).map((_, rowIndex) => (
          <div key={rowIndex} className="flex space-x-2">
            {Array.from({ length: size - rowIndex }).map((_, colIndex) => (
              <Skeleton
                key={`${rowIndex}-${colIndex}`}
                variant="rectangular"
                width="3rem"
                height="3rem"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

// ============ REFRESH BUTTON ============
export const RefreshButton: React.FC<{
  onRefresh: () => void;
  isRefreshing?: boolean;
  className?: string;
}> = ({ onRefresh, isRefreshing = false, className = '' }) => {
  return (
    <button
      onClick={onRefresh}
      disabled={isRefreshing}
      className={`
        inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm 
        leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 
        focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500
        disabled:opacity-50 disabled:cursor-not-allowed transition-colors
        ${className}
      `}
    >
      <ArrowPathIcon
        className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
      />
      <span className="ml-2">
        {isRefreshing ? 'Actualisation...' : 'Actualiser'}
      </span>
    </button>
  );
};

// Export par défaut
export default LoadingSpinner;