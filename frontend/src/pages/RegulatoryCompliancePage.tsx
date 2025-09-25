// pages/RegulatoryCompliancePage.tsx
// Wrapper principal pour le centre de conformité - gère les données réelles et de test

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { ArrowLeft, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';

import RegulatoryCompliancePanel from './RegulatoryCompliancePanel';

import testData, { createTestProps } from './testData';
import { validateTestData } from './testData';
console.log(validateTestData());

// Types pour les données
interface ComplianceDataProps {
  result?: any;
  extendedKPI?: any;
  calculationId?: string;
  triangleId?: string;
}

// API Service simulé - remplacez par vos vrais appels API
const complianceAPI = {
  // Récupérer les données d'un calcul spécifique
  getCalculationData: async (calculationId: string): Promise<ComplianceDataProps> => {
    // Simulation d'un appel API - remplacez par votre vraie API
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (calculationId === 'test') {
      return createTestProps();
    }
    
    // Ici vous appelez votre vraie API
    // const response = await fetch(`/api/calculations/${calculationId}/compliance`);
    // return response.json();
    
    // Pour l'instant, retourner des données de test modifiées
    return {
      ...createTestProps(),
      calculationId,
      result: {
        ...testData.result,
        calculationId,
        summary: {
          ...testData.result.summary,
          ultimate: testData.result.summary.ultimate * (1 + Math.random() * 0.1) // Variation pour simuler données réelles
        }
      }
    };
  },

  // Récupérer les données depuis un triangle
  getTriangleData: async (triangleId: string): Promise<ComplianceDataProps> => {
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Simulation - remplacez par votre API
    // const response = await fetch(`/api/triangles/${triangleId}/compliance`);
    // return response.json();
    
    return {
      ...createTestProps(),
      triangleId,
      calculationId: `CALC_FROM_${triangleId}`
    };
  },

  // Récupérer les dernières données disponibles
  getLatestData: async (): Promise<ComplianceDataProps> => {
    await new Promise(resolve => setTimeout(resolve, 600));
    
    // Simulation - remplacez par votre API
    // const response = await fetch('/api/compliance/latest');
    // return response.json();
    
    return {
      ...createTestProps(),
      calculationId: `LATEST_${new Date().toISOString().slice(0, 10)}`
    };
  }
};

const RegulatoryCompliancePage: React.FC = () => {
  const navigate = useNavigate();
  const { calculationId } = useParams<{ calculationId?: string }>();
  const [searchParams] = useSearchParams();
  const triangleId = searchParams.get('triangleId');
  const useTestData = searchParams.get('test') === 'true';
  
  const [dataSource, setDataSource] = useState<'calculation' | 'triangle' | 'latest' | 'test'>('latest');

  // Déterminer la source de données
  useEffect(() => {
    if (useTestData) {
      setDataSource('test');
    } else if (calculationId) {
      setDataSource('calculation');
    } else if (triangleId) {
      setDataSource('triangle');
    } else {
      setDataSource('latest');
    }
  }, [calculationId, triangleId, useTestData]);

  // Query pour récupérer les données
  const {
    data: complianceData,
    isLoading,
    error,
    refetch,
    isFetching
  } = useQuery({
    queryKey: ['compliance', dataSource, calculationId, triangleId],
    queryFn: async () => {
      switch (dataSource) {
        case 'test':
          // Données de test - pas d'appel API
          return createTestProps();
        case 'calculation':
          return complianceAPI.getCalculationData(calculationId!);
        case 'triangle':
          return complianceAPI.getTriangleData(triangleId!);
        case 'latest':
          return complianceAPI.getLatestData();
        default:
          throw new Error('Source de données inconnue');
      }
    },
    enabled: true,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error) => {
      if (failureCount < 2) return true;
      toast.error('Erreur lors du chargement des données de conformité');
      return false;
    }
  });

  // Memoize des props pour éviter les re-renders inutiles
  const complianceProps = useMemo(() => {
    if (!complianceData) return undefined;
    return {
      result: complianceData.result,
      extendedKPI: complianceData.extendedKPI,
      calculationId: complianceData.calculationId,
      triangleId: complianceData.triangleId
    };
  }, [complianceData]);

  // Gestion des erreurs
  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full mx-4">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="h-8 w-8 text-red-600" />
            <h1 className="text-xl font-bold text-gray-900">Erreur de chargement</h1>
          </div>
          <p className="text-gray-600 mb-6">
            Impossible de charger les données de conformité. Vérifiez votre connexion ou essayez à nouveau.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Réessayer
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full bg-gray-200 text-gray-800 py-2 px-4 rounded hover:bg-gray-300 flex items-center justify-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour au Dashboard
            </button>
            <button
              onClick={() => navigate('/compliance?test=true')}
              className="w-full bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700"
            >
              Utiliser les données de test
            </button>
          </div>
        </div>
      </div>
    );
  }

  // État de chargement
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Chargement du Centre de Conformité
          </h2>
          <p className="text-gray-600">
            {dataSource === 'test' && 'Préparation des données de test...'}
            {dataSource === 'calculation' && `Chargement du calcul ${calculationId}...`}
            {dataSource === 'triangle' && `Chargement du triangle ${triangleId}...`}
            {dataSource === 'latest' && 'Récupération des dernières données...'}
          </p>
          {dataSource !== 'test' && (
            <button
              onClick={() => navigate('/compliance?test=true')}
              className="mt-4 text-sm text-blue-600 hover:text-blue-800"
            >
              Passer aux données de test
            </button>
          )}
        </div>
      </div>
    );
  }

  // Affichage principal
  if (!complianceProps) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-yellow-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Aucune donnée disponible
          </h2>
          <p className="text-gray-600 mb-4">
            Les données de conformité ne sont pas disponibles pour cette ressource.
          </p>
          <button
            onClick={() => navigate('/compliance?test=true')}
            className="bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700"
          >
            Utiliser les données de test
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header avec informations sur la source de données */}
      {dataSource === 'test' && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2">
          <div className="max-w-7xl mx-auto flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-yellow-800">
              <AlertTriangle className="h-4 w-4" />
              Mode Test - Données simulées pour démonstration
            </div>
            <button
              onClick={() => navigate('/compliance')}
              className="text-yellow-800 hover:text-yellow-900 underline"
            >
              Passer aux données réelles
            </button>
          </div>
        </div>
      )}

      {/* Composant principal */}
      <RegulatoryCompliancePanel {...complianceProps} />
    </div>
  );
};

export default RegulatoryCompliancePage;