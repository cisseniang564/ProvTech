// frontend/src/pages/TrianglesList.tsx - URLS CORRIGÉES + NOMS PERSONNALISÉS
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Download, Trash2, Plus, BarChart3, RefreshCw, TrendingUp } from 'lucide-react';
import Layout from '../components/common/Layout';
// import { ApiClient } from '../services/api'; // ❌ Temporairement non utilisé
import { useNotifications } from '../context/NotificationContext';
import { getTriangleName } from '../utils/triangleUtils';  // ✅ AJOUT IMPORT

interface Triangle {
  id: string;
  name: string;
  triangle_name?: string;    // ✅ AJOUT
  business_line?: string;    // ✅ AJOUT
  branch: string;
  type: string;
  currency: string;
  data: number[][];
  created_at: string;
  status: string;
}

const TrianglesList: React.FC = () => {
  const navigate = useNavigate();
  const { success, error: showError } = useNotifications();
  
  const [triangles, setTriangles] = useState<Triangle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTriangle, setSelectedTriangle] = useState<Triangle | null>(null);
  const [calculatingFor, setCalculatingFor] = useState<string | null>(null);

  useEffect(() => {
    loadTriangles();
  }, []);

  // ✅ CORRECTION PRINCIPALE: Fetch direct sans ApiClient
  const loadTriangles = async () => {
    try {
      setLoading(true);
      
      console.log('🔄 Chargement triangles...');
      
      // ✅ URL DIRECTE SANS DUPLICATION
      const response = await fetch('http://localhost:8000/api/v1/triangles');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('✅ Réponse backend:', data);
      
      // ✅ DEBUG: Afficher les noms pour vérifier
      console.log('🔍 Debug noms de triangles:');
      const trianglesList = Array.isArray(data) ? data : (data?.data ?? []);
      trianglesList.forEach((triangle: Triangle, index: number) => {
        console.log(`Triangle ${index}:`, {
          id: triangle.id,
          name: triangle.name,
          triangle_name: triangle.triangle_name,
          business_line: triangle.business_line,
          branch: triangle.branch,
          displayName: getTriangleName(triangle)  // ✅ VOIR LE NOM FINAL
        });
      });
      
      setTriangles(trianglesList);
      
      console.log('✅ Triangles chargés:', trianglesList);

    } catch (error) {
      console.error('❌ Erreur chargement triangles:', error);
      showError('Erreur', `Impossible de charger les triangles: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const runCalculation = async (triangle: Triangle) => {
    try {
      setCalculatingFor(triangle.id);
      
      console.log('🧮 Lancement calcul pour:', getTriangleName(triangle), '(ID:', triangle.id, ')');  // ✅ CORRECTION
      
      const payload = {
        triangleId: String(triangle.id),
        methods: ["chain_ladder"]
      };

      console.log('📤 Payload envoyé:', JSON.stringify(payload, null, 2));
      
      // ✅ URL DIRECTE SANS DUPLICATION
      const response = await fetch('http://localhost:8000/api/v1/calculations/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Erreur API:', errorData);
        throw new Error(`Erreur ${response.status}: ${JSON.stringify(errorData.detail)}`);
      }
      
      const result = await response.json();
      console.log('✅ Calcul lancé avec succès:', result);
      
      success(
        'Calcul lancé !', 
        `${getTriangleName(triangle)} - ID: ${result.calculation_id} (${result.estimated_time}s)`  // ✅ CORRECTION
      );
      
      // Récupération du résultat après 6 secondes
      setTimeout(async () => {
        try {
          console.log('🔍 Récupération du résultat pour:', result.calculation_id);
          
          // ✅ URL DIRECTE SANS DUPLICATION
          const resultResponse = await fetch(`http://localhost:8000/api/v1/calculations/${result.calculation_id}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          });
          
          if (resultResponse.ok) {
            const calcResult = await resultResponse.json();
            console.log('📊 Résultat final:', calcResult);
            
            if (calcResult.status === 'completed' && calcResult.summary?.best_estimate) {
              const ultimate = calcResult.summary.best_estimate;
              success(
                'Calcul terminé !', 
                `${getTriangleName(triangle)}: ${ultimate.toLocaleString()} ${triangle.currency}`  // ✅ CORRECTION
              );
            }
          }
        } catch (error) {
          console.warn('⚠️ Impossible de récupérer le résultat:', error);
        }
      }, 6000);
      
    } catch (error) {
      console.error('💥 Erreur calcul complète:', error);
      showError(
        'Erreur de calcul', 
        `${getTriangleName(triangle)}: ${error.message || 'Erreur inconnue'}`  // ✅ CORRECTION
      );
    } finally {
      setCalculatingFor(null);
    }
  };

  // ✅ FONCTION POUR NAVIGUER VERS /results SANS ID
  const viewResults = (triangle: Triangle) => {
    console.log('🔍 Navigation vers résultats généraux depuis triangle:', triangle.id, getTriangleName(triangle));  // ✅ CORRECTION
    
    // Navigation vers la page résultats générale (sans ID)
    navigate('/results');
  };

  const deleteTriangle = async (triangleId: string) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce triangle ?')) {
      return;
    }

    try {
      // ✅ URL DIRECTE SANS DUPLICATION
      const response = await fetch(`http://localhost:8000/api/v1/triangles/${triangleId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      success('Triangle supprimé', 'Le triangle a été supprimé avec succès');
      loadTriangles();
    } catch (error) {
      console.error('❌ Erreur suppression:', error);
      showError('Erreur', `Impossible de supprimer le triangle: ${error.message}`);
    }
  };

  const viewTriangleData = (triangle: Triangle) => {
    setSelectedTriangle(triangle);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getBranchName = (branch: string) => {
    const branches: Record<string, string> = {
      'auto': 'Automobile',
      'property': 'Dommages aux biens',
      'liability': 'Responsabilité civile',
      'health': 'Santé',
      'life': 'Vie',
      'rc': 'Responsabilité Civile',      // ✅ AJOUT
      'dab': 'Dommages aux Biens'         // ✅ AJOUT
    };
    return branches[branch] || branch;
  };

  const getTypeName = (type: string) => {
    const types: Record<string, string> = {
      'paid': 'Payés',
      'incurred': 'Survenus',
      'reported': 'Déclarés'
    };
    return types[type] || type;
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Chargement des triangles...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">📊 Triangles de développement</h1>
                <p className="text-sm text-gray-500 mt-1">
                  {triangles.length} triangle(s) • Gérez vos données actuarielles
                </p>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={loadTriangles}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 text-blue-600 border border-blue-600 rounded-md hover:bg-blue-50"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Actualiser
                </button>
                
                <button
                  onClick={() => navigate('/data-import')}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" />
                  Importer
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Liste des triangles */}
        {triangles.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun triangle</h3>
            <p className="text-gray-600 mb-6">
              Commencez par importer vos données de triangle de développement
            </p>
            <button
              onClick={() => navigate('/data-import')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Importer des données
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Triangle
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Données
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Créé
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {triangles.map((triangle) => (
                    <tr key={triangle.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {getTriangleName(triangle)}  {/* ✅ CORRECTION PRINCIPALE */}
                          </div>
                          <div className="text-sm text-gray-500">
                            {getBranchName(triangle.branch)} • {triangle.currency}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                          {getTypeName(triangle.type)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {triangle.data.length} lignes
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {formatDate(triangle.created_at)}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium">
                        <div className="flex items-center gap-2">
                          {/* Voir les données */}
                          <button
                            onClick={() => viewTriangleData(triangle)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Voir les données"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          
                          {/* Lancer un calcul */}
                          <button
                            onClick={() => runCalculation(triangle)}
                            disabled={calculatingFor === triangle.id}
                            className="text-green-600 hover:text-green-900 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Lancer un calcul"
                          >
                            {calculatingFor === triangle.id ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <BarChart3 className="h-4 w-4" />
                            )}
                          </button>

                          {/* ✅ BOUTON: Voir Résultats (SANS ID) */}
                          <button
                            onClick={() => viewResults(triangle)}
                            className="text-purple-600 hover:text-purple-900"
                            title="Voir les résultats"
                          >
                            <TrendingUp className="h-4 w-4" />
                          </button>
                          
                          {/* Supprimer */}
                          <button
                            onClick={() => deleteTriangle(triangle.id)}
                            className="text-red-600 hover:text-red-900"
                            title="Supprimer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal de visualisation */}
        {selectedTriangle && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  📊 Données - {getTriangleName(selectedTriangle)}  {/* ✅ CORRECTION */}
                </h3>
                <button
                  onClick={() => setSelectedTriangle(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
                >
                  &times;
                </button>
              </div>
              
              {/* Info triangle */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Branche</p>
                    <p className="font-medium">{getBranchName(selectedTriangle.branch)}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Type</p>
                    <p className="font-medium">{getTypeName(selectedTriangle.type)}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Devise</p>
                    <p className="font-medium">{selectedTriangle.currency}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Statut</p>
                    <p className="font-medium">{selectedTriangle.status}</p>
                  </div>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="min-w-full border border-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="border border-gray-200 px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Période
                      </th>
                      {selectedTriangle.data[0]?.map((_, colIndex) => (
                        <th key={colIndex} className="border border-gray-200 px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                          Dév {colIndex}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {selectedTriangle.data.map((row, rowIndex) => (
                      <tr key={rowIndex} className="hover:bg-gray-50">
                        <td className="border border-gray-200 px-4 py-2 font-medium text-gray-900">
                          Période {rowIndex + 1}
                        </td>
                        {row.map((value, colIndex) => (
                          <td key={colIndex} className="border border-gray-200 px-4 py-2 text-right text-sm text-gray-600">
                            {typeof value === 'number' ? value.toLocaleString('fr-FR') : '-'}
                          </td>
                        ))}
                        {Array.from({ length: Math.max(0, (selectedTriangle.data[0]?.length || 0) - row.length) }).map((_, emptyIndex) => (
                          <td key={`empty-${emptyIndex}`} className="border border-gray-200 px-4 py-2 text-right text-sm text-gray-400">
                            -
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div className="mt-6 flex justify-end gap-3">
                {/* Lancer calcul depuis modal */}
                <button
                  onClick={() => runCalculation(selectedTriangle)}
                  disabled={calculatingFor === selectedTriangle.id}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {calculatingFor === selectedTriangle.id ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Calcul...
                    </>
                  ) : (
                    <>
                      <BarChart3 className="h-4 w-4" />
                      Lancer un calcul
                    </>
                  )}
                </button>

                {/* ✅ BOUTON: Voir Résultats dans modal (SANS ID) */}
                <button
                  onClick={() => {
                    viewResults(selectedTriangle);
                    setSelectedTriangle(null);
                  }}
                  className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 flex items-center gap-2"
                >
                  <TrendingUp className="h-4 w-4" />
                  Voir Résultats
                </button>
                
                <button
                  onClick={() => setSelectedTriangle(null)}
                  className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default TrianglesList;