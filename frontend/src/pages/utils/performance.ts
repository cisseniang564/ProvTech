// frontend/src/utils/performance.ts - UTILITAIRES DE PERFORMANCE

// ===== CACHE SIMPLE POUR ÉVITER LES APPELS RÉPÉTÉS =====
class SimpleCache {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();

  set(key: string, data: any, ttlMs: number = 300000) { // 5 min par défaut
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs
    });
  }

  get(key: string): any | null {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return null;
    }

    return item.data;
  }

  clear() {
    this.cache.clear();
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }
}

export const apiCache = new SimpleCache();

// ===== HOOK POUR APPELS API AVEC CACHE =====
import { useState, useEffect } from 'react';

export function useCachedApi<T>(
  key: string, 
  apiCall: () => Promise<T>, 
  dependencies: any[] = [],
  ttlMs: number = 300000
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Vérifier le cache d'abord
        const cachedData = apiCache.get(key);
        if (cachedData) {
          setData(cachedData);
          setLoading(false);
          return;
        }

        // Sinon, appel API
        const result = await apiCall();
        apiCache.set(key, result, ttlMs);
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [key, ttlMs, ...dependencies]);

  return { data, loading, error, refetch: () => {
    apiCache.clear(); // Force refresh
    setLoading(true);
  }};
}

// ===== DEBOUNCE POUR RECHERCHE =====
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// ===== FORMATAGE MONÉTAIRE OPTIMISÉ =====
const currencyFormatters = new Map<string, Intl.NumberFormat>();

export function formatCurrency(amount: number, currency: string = 'EUR'): string {
  let formatter = currencyFormatters.get(currency);
  
  if (!formatter) {
    formatter = new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    currencyFormatters.set(currency, formatter);
  }

  return formatter.format(amount);
}

// ===== VALIDATION DE DONNÉES TRIANGLE =====
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateTriangleData(data: number[][]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data || data.length === 0) {
    errors.push('Aucune donnée fournie');
    return { isValid: false, errors, warnings };
  }

  // Vérifier structure triangulaire
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    
    if (!Array.isArray(row)) {
      errors.push(`Ligne ${i + 1}: Format invalide`);
      continue;
    }

    // Vérifier que la ligne n'a pas plus de valeurs que son index + 1
    if (row.length > i + 1) {
      warnings.push(`Ligne ${i + 1}: Plus de valeurs que d'années de développement (${row.length} vs ${i + 1})`);
    }

    // Vérifier les valeurs
    for (let j = 0; j < row.length; j++) {
      const value = row[j];
      
      if (value !== null && value !== undefined) {
        if (typeof value !== 'number' || isNaN(value)) {
          errors.push(`Ligne ${i + 1}, Colonne ${j + 1}: Valeur non numérique (${value})`);
        } else if (value < 0) {
          warnings.push(`Ligne ${i + 1}, Colonne ${j + 1}: Valeur négative (${value})`);
        }
      }
    }
  }

  // Vérifications supplémentaires
  if (data.length < 3) {
    warnings.push('Triangle avec moins de 3 années - Résultats potentiellement peu fiables');
  }

  const maxCols = Math.max(...data.map(row => row.length));
  if (maxCols < 3) {
    warnings.push('Triangle avec moins de 3 colonnes de développement');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

// ===== UTILITAIRES DE DATES =====
export function formatDate(dateString: string, options?: Intl.DateTimeFormatOptions): string {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };

  return new Date(dateString).toLocaleDateString('fr-FR', options || defaultOptions);
}

export function getRelativeTime(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  
  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'À l\'instant';
  if (minutes < 60) return `Il y a ${minutes} min`;
  if (hours < 24) return `Il y a ${hours}h`;
  if (days < 30) return `Il y a ${days} jour(s)`;
  
  return formatDate(dateString);
}

// ===== STOCKAGE LOCAL SÉCURISÉ =====
export class SecureStorage {
  private static encrypt(data: string): string {
    // Simple obfuscation - pour une vraie app, utilisez crypto-js
    return btoa(encodeURIComponent(data));
  }

  private static decrypt(data: string): string {
    try {
      return decodeURIComponent(atob(data));
    } catch {
      return '';
    }
  }

  static setItem(key: string, value: any): void {
    try {
      const serialized = JSON.stringify(value);
      const encrypted = this.encrypt(serialized);
      localStorage.setItem(`provtech_${key}`, encrypted);
    } catch (error) {
      console.warn('Erreur sauvegarde localStorage:', error);
    }
  }

  static getItem<T>(key: string, defaultValue?: T): T | null {
    try {
      const encrypted = localStorage.getItem(`provtech_${key}`);
      if (!encrypted) return defaultValue || null;

      const decrypted = this.decrypt(encrypted);
      return JSON.parse(decrypted);
    } catch (error) {
      console.warn('Erreur lecture localStorage:', error);
      return defaultValue || null;
    }
  }

  static removeItem(key: string): void {
    localStorage.removeItem(`provtech_${key}`);
  }

  static clear(): void {
    // Supprimer uniquement les clés de l'app
    const keys = Object.keys(localStorage).filter(key => key.startsWith('provtech_'));
    keys.forEach(key => localStorage.removeItem(key));
  }
}

// ===== EXPORT UTILITAIRES =====
export const utils = {
  formatCurrency,
  formatDate,
  getRelativeTime,
  validateTriangleData,
  useDebounce,
  useCachedApi,
  apiCache,
  SecureStorage
};

export default utils;
