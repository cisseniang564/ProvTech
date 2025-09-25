// frontend/src/utils/triangleUtils.ts
// Utilitaires pour normaliser les noms de triangles et autres fonctions de formatage

/**
 * Normalise le nom d'un triangle en priorisant les champs dans cet ordre :
 * 1. triangle_name (nom explicite saisi par l'utilisateur)
 * 2. name (nom de backup, mais pas s'il est générique)
 * 3. business_line (branche d'activité)
 * 4. branch (branche alternative)
 * 5. Fallback générique
 */
export const getTriangleName = (triangleData: any): string => {
  // Vérifier d'abord triangle_name - le champ prioritaire depuis DataImport
  if (triangleData?.triangle_name && typeof triangleData.triangle_name === 'string') {
    const name = triangleData.triangle_name.trim();
    if (name && name !== '' && name !== 'undefined' && name !== 'null') {
      return name;
    }
  }

  // Ensuite le champ name générique, mais éviter les noms génériques du backend
  if (triangleData?.name && typeof triangleData.name === 'string') {
    const name = triangleData.name.trim();
    if (name && name !== '' && name !== 'undefined' && name !== 'null') {
      // Éviter les noms génériques du backend
      const genericTerms = ['triangle importé', 'triangle mocké', 'triangle simulé', 'triangle de'];
      const isGeneric = genericTerms.some(term => 
        name.toLowerCase().includes(term)
      );
      
      if (!isGeneric) {
        return name;
      }
    }
  }

  // Utiliser business_line si c'est un nom personnalisé
  if (triangleData?.business_line && typeof triangleData.business_line === 'string') {
    const businessLine = triangleData.business_line.trim();
    if (businessLine && businessLine !== '' && businessLine !== 'undefined' && businessLine !== 'null') {
      // Si c'est une vraie branche d'activité (pas un nom générique), l'utiliser
      const genericTerms = ['triangle', 'importé', 'mocké', 'simulé'];
      const isGeneric = genericTerms.some(term => 
        businessLine.toLowerCase().includes(term)
      );
      
      if (!isGeneric) {
        return businessLine;
      }
    }
  }

  // Utiliser branch en fallback
  if (triangleData?.branch && typeof triangleData.branch === 'string') {
    const branch = triangleData.branch.trim();
    if (branch && branch !== '' && branch !== 'undefined' && branch !== 'null') {
      return getBusinessLineLabel(branch);
    }
  }

  // Fallback vers metadata
  if (triangleData?.metadata) {
    if (triangleData.metadata.triangle_name) {
      const name = triangleData.metadata.triangle_name.trim();
      if (name && name !== '' && name !== 'undefined' && name !== 'null') {
        return name;
      }
    }
    if (triangleData.metadata.business_line) {
      const businessLine = triangleData.metadata.business_line.trim();
      if (businessLine && businessLine !== '' && businessLine !== 'undefined' && businessLine !== 'null') {
        return businessLine;
      }
    }
  }

  // Fallback final avec l'ID si disponible
  if (triangleData?.id || triangleData?.triangle_id) {
    const id = triangleData.id || triangleData.triangle_id;
    return `Triangle ${id}`;
  }

  // Dernière option : utiliser le nom original même s'il est générique
  if (triangleData?.name && typeof triangleData.name === 'string') {
    return triangleData.name.trim();
  }

  return 'Triangle sans nom';
};

/**
 * Normalise un objet triangle en s'assurant que le nom est correct
 */
export const normalizeTriangle = (triangleData: any) => {
  if (!triangleData) return null;

  return {
    ...triangleData,
    displayName: getTriangleName(triangleData),
    // Conserver les champs originaux pour compatibilité
    triangleName: getTriangleName(triangleData),
    triangle_name: triangleData.triangle_name || getTriangleName(triangleData)
  };
};

/**
 * Mappe de traduction des codes de branches vers des noms lisibles
 */
const BUSINESS_LINE_LABELS: Record<string, string> = {
  'auto': 'Automobile',
  'rc': 'Responsabilité Civile', 
  'dab': 'Dommages aux Biens',
  'property': 'Dommages aux Biens',
  'liability': 'RC Générale',
  'health': 'Santé',
  'life': 'Vie',
  'workers_comp': 'Accidents du Travail',
  'marine': 'Marine',
  'aviation': 'Aviation',
  'construction': 'Construction',
  'cyber': 'Cyber Risques',
  'd_o': 'Directors & Officers',
  'credit': 'Crédit',
  'surety': 'Caution',
  'transport': 'Transport',
  'agriculture': 'Agriculture',
  'energy': 'Énergie',
  'professional': 'RC Professionnelle',
  'product': 'RC Produits',
  'environmental': 'Environnement',
  'terrorism': 'Terrorisme',
  'political': 'Risques Politiques',
  'other': 'Autre'
};

/**
 * Obtient le libellé d'une branche d'activité
 */
export const getBusinessLineLabel = (code: string): string => {
  if (!code) return '';
  const cleanCode = code.toLowerCase().trim();
  return BUSINESS_LINE_LABELS[cleanCode] || code;
};

/**
 * Mappe de traduction des types de triangles
 */
const TRIANGLE_TYPE_LABELS: Record<string, string> = {
  'paid': 'Payés',
  'incurred': 'Survenus',
  'reported': 'Déclarés',
  'frequency': 'Fréquence',
  'severity': 'Coût moyen'
};

/**
 * Obtient le libellé d'un type de triangle
 */
export const getTriangleTypeLabel = (type: string): string => {
  if (!type) return '';
  const cleanType = type.toLowerCase().trim();
  return TRIANGLE_TYPE_LABELS[cleanType] || type;
};

/**
 * Formatage sécurisé d'un nombre
 */
export const formatNumber = (value: any, decimals: number = 0): string => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
};

/**
 * Formatage sécurisé d'une devise
 */
export const formatCurrency = (value: any, currency: string = 'EUR'): string => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0 €';
  
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  } catch (error) {
    // Fallback si la devise n'est pas supportée
    return `${formatNumber(num)} ${currency}`;
  }
};

/**
 * Formatage sécurisé d'un pourcentage
 */
export const formatPercentage = (value: any, decimals: number = 1): string => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return `${num.toFixed(decimals)}%`;
};

/**
 * Formatage sécurisé d'une date
 */
export const formatDate = (value: any): string => {
  if (!value) return 'Date non disponible';
  
  let date: Date;
  
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'number') {
    // Timestamp - ajuster si nécessaire
    const ms = value < 1e12 ? value * 1000 : value;
    date = new Date(ms);
  } else if (typeof value === 'string') {
    // Essayer de parser la string
    date = new Date(value);
    // Parfois les dates viennent avec un espace au lieu de T
    if (isNaN(date.getTime())) {
      date = new Date(value.replace(' ', 'T'));
    }
  } else {
    return 'Date invalide';
  }
  
  if (isNaN(date.getTime())) {
    return 'Date invalide';
  }
  
  return date.toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Formatage court d'une date (sans heure)
 */
export const formatDateShort = (value: any): string => {
  if (!value) return 'N/A';
  
  const date = new Date(value);
  if (isNaN(date.getTime())) return 'Date invalide';
  
  return date.toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

/**
 * Obtient une couleur pour un statut
 */
export const getStatusColor = (status: string): string => {
  switch (status?.toLowerCase()) {
    case 'completed':
    case 'success':
    case 'terminé':
    case 'validated':
      return 'green';
    case 'running':
    case 'pending':
    case 'en cours':
    case 'draft':
      return 'blue';
    case 'failed':
    case 'error':
    case 'échec':
    case 'échoué':
      return 'red';
    case 'warning':
    case 'attention':
      return 'yellow';
    case 'archived':
      return 'gray';
    default:
      return 'gray';
  }
};

/**
 * Obtient le libellé français d'un statut
 */
export const getStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    'draft': 'Brouillon',
    'validated': 'Validé',
    'archived': 'Archivé',
    'completed': 'Terminé',
    'running': 'En cours',
    'pending': 'En attente',
    'failed': 'Échoué',
    'error': 'Erreur'
  };
  
  return labels[status?.toLowerCase()] || status || 'Inconnu';
};

/**
 * Valide si un triangle a des données complètes
 */
export const isTriangleComplete = (triangle: any): boolean => {
  if (!triangle || !triangle.data || !Array.isArray(triangle.data)) {
    return false;
  }
  
  // Vérifier qu'il y a au moins quelques lignes et colonnes
  if (triangle.data.length < 2) return false;
  
  // Vérifier que chaque ligne a des données
  return triangle.data.every((row: any) => 
    Array.isArray(row) && row.length > 0 && row.some(cell => 
      typeof cell === 'number' && Number.isFinite(cell) && cell > 0
    )
  );
};

/**
 * Calcule des statistiques de base sur un triangle
 */
export const getTriangleStats = (triangle: any) => {
  if (!triangle?.data || !Array.isArray(triangle.data)) {
    return {
      totalRows: 0,
      totalColumns: 0,
      totalCells: 0,
      filledCells: 0,
      completeness: 0,
      totalAmount: 0
    };
  }
  
  const data = triangle.data;
  const totalRows = data.length;
  const totalColumns = Math.max(...data.map((row: any[]) => Array.isArray(row) ? row.length : 0));
  const totalCells = totalRows * totalColumns;
  
  let filledCells = 0;
  let totalAmount = 0;
  
  data.forEach((row: any[]) => {
    if (Array.isArray(row)) {
      row.forEach(cell => {
        if (typeof cell === 'number' && Number.isFinite(cell) && cell > 0) {
          filledCells++;
          totalAmount += cell;
        }
      });
    }
  });
  
  const completeness = totalCells > 0 ? (filledCells / totalCells) * 100 : 0;
  
  return {
    totalRows,
    totalColumns,
    totalCells,
    filledCells,
    completeness: Math.round(completeness),
    totalAmount
  };
};

/**
 * Debug : affiche toutes les propriétés liées au nom d'un triangle
 */
export const debugTriangleName = (triangleData: any): void => {
  console.group('🔍 Debug Triangle Name');
  console.log('Triangle data:', triangleData);
  console.log('triangle_name:', triangleData?.triangle_name);
  console.log('name:', triangleData?.name);
  console.log('business_line:', triangleData?.business_line);
  console.log('branch:', triangleData?.branch);
  console.log('metadata:', triangleData?.metadata);
  console.log('🎯 Nom final:', getTriangleName(triangleData));
  console.groupEnd();
};

/**
 * Tronque un texte à une longueur donnée
 */
export const truncateText = (text: string, maxLength: number = 50): string => {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
};

/**
 * Génère un identifiant unique simple
 */
export const generateId = (): string => {
  return Math.random().toString(36).substr(2, 9);
};

export default {
  getTriangleName,
  normalizeTriangle,
  getBusinessLineLabel,
  getTriangleTypeLabel,
  formatNumber,
  formatCurrency,
  formatPercentage,
  formatDate,
  formatDateShort,
  getStatusColor,
  getStatusLabel,
  isTriangleComplete,
  getTriangleStats,
  debugTriangleName,
  truncateText,
  generateId
};