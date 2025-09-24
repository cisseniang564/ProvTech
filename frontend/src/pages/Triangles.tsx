// frontend/src/pages/Triangles.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Filter,
  Download,
  Trash2,
  Edit,
  Eye,
  Calendar,
  TrendingUp,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import Layout from '../components/common/Layout';
import { useTriangles } from '../hooks/useTriangles';
// ⚠️ Utiliser le type Triangle du service pour éviter les conflits de champs
import type { Triangle } from '../services/triangleService';
import { getTriangleName } from '../utils/triangleUtils';

type TriFilterType = 'all' | 'paid' | 'incurred' | 'frequency' | 'severity';
type SortBy = 'name' | 'date' | 'type';
type SortOrder = 'asc' | 'desc';

const Triangles: React.FC = () => {
  const navigate = useNavigate();

  const {
    triangles,
    isLoading,
    error,
    deleteTriangle,
    // duplicateTriangle // <- n'existe pas dans le hook : retiré
  } = useTriangles();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<TriFilterType>('all');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedTriangles, setSelectedTriangles] = useState<string[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [triangleToDelete, setTriangleToDelete] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Statistiques (adaptées au type disponible)
  const stats = {
    total: triangles?.length || 0,
    paid: triangles?.filter((t) => t.type === 'paid').length || 0,
    incurred: triangles?.filter((t) => t.type === 'incurred').length || 0,
    // plus de 'reported' → afficher 'frequency' comme 3e catégorie
    frequency: triangles?.filter((t) => t.type === 'frequency').length || 0,
    recent:
      triangles?.filter((t) => {
        const date = new Date((t as any).updated_at ?? Date.now());
        const dayAgo = new Date();
        dayAgo.setDate(dayAgo.getDate() - 1);
        return date > dayAgo;
      }).length || 0,
  };

  // Filtrage et tri (sans status / businessLine)
  const filteredTriangles = triangles
    ?.filter((triangle) => {
      const matchSearch = getTriangleName(triangle).toLowerCase().includes(searchTerm.toLowerCase()); // ✅ CORRECTION 1
      const matchType = filterType === 'all' || triangle.type === filterType;
      return matchSearch && matchType;
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'name':
          comparison = getTriangleName(a).localeCompare(getTriangleName(b)); // ✅ CORRECTION : Tri aussi
          break;
        case 'date': {
          const aDate = new Date((a as any).updated_at ?? 0).getTime();
          const bDate = new Date((b as any).updated_at ?? 0).getTime();
          comparison = bDate - aDate;
          break;
        }
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

  const handleDelete = async (id: string) => {
    try {
      await deleteTriangle(id);
      setShowDeleteModal(false);
      setTriangleToDelete(null);
    } catch (e) {
      console.error('Erreur suppression:', e);
    }
  };

  // Dupliquer retiré (fonction non fournie par le hook)
  // const handleDuplicate = async (id: string) => { ... }

  const handleBulkExport = () => {
    const data =
      selectedTriangles.length > 0
        ? triangles?.filter((t) => selectedTriangles.includes(t.id))
        : filteredTriangles;

    const csv = convertToCSV(data || []);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `triangles_export_${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const convertToCSV = (data: Triangle[]) => {
    const headers = ['Nom', 'Type', 'Devise', 'Créé le', 'Modifié le'];
    const rows = data.map((t) => [
      getTriangleName(t), // ✅ CORRECTION 2
      t.type,
      t.currency,
      new Date((t as any).created_at ?? Date.now()).toLocaleDateString('fr-FR'),
      new Date((t as any).updated_at ?? Date.now()).toLocaleDateString('fr-FR'),
    ]);

    return [headers, ...rows].map((row) => row.join(',')).join('\n');
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Triangles de Développement</h1>
                <p className="text-sm text-gray-500 mt-1">
                  Gérez vos triangles de sinistres et lancez des calculs actuariels
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => navigate('/import')}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  <Download className="h-4 w-4" />
                  Importer
                </button>
                <button
                  onClick={() => navigate('/triangles/new')}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" />
                  Nouveau Triangle
                </button>
              </div>
            </div>
          </div>

          {/* Statistiques */}
          <div className="px-6 py-4 grid grid-cols-5 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-sm text-gray-500">Total</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{stats.paid}</p>
              <p className="text-sm text-gray-500">Payés</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{stats.incurred}</p>
              <p className="text-sm text-gray-500">Survenus</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-600">{stats.frequency}</p>
              <p className="text-sm text-gray-500">Fréquence</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-600">{stats.recent}</p>
              <p className="text-sm text-gray-500">Récents (24h)</p>
            </div>
          </div>
        </div>

        {/* Filtres et recherche */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4">
            <div className="flex items-center gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Rechercher par nom..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                <Filter className="h-4 w-4" />
                Filtres
                {showFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {selectedTriangles.length > 0 && (
                <button
                  onClick={handleBulkExport}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  <Download className="h-4 w-4" />
                  Exporter ({selectedTriangles.length})
                </button>
              )}
            </div>

            {/* Filtres avancés */}
            {showFilters && (
              <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value as TriFilterType)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">Tous</option>
                    <option value="paid">Payés</option>
                    <option value="incurred">Survenus</option>
                    <option value="frequency">Fréquence</option>
                    <option value="severity">Sévérité</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Trier par</label>
                  <div className="flex gap-2">
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortBy)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="name">Nom</option>
                      <option value="date">Date</option>
                      <option value="type">Type</option>
                    </select>
                    <button
                      onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                      className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      {sortOrder === 'asc' ? '↑' : '↓'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Liste des triangles */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-500">Chargement des triangles...</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
              <p className="mt-4 text-red-600">Erreur: {error?.message ?? String(error)}</p>
            </div>
          ) : filteredTriangles?.length === 0 ? (
            <div className="p-8 text-center">
              <TrendingUp className="h-12 w-12 text-gray-400 mx-auto" />
              <p className="mt-4 text-gray-500">Aucun triangle trouvé</p>
              <button
                onClick={() => navigate('/import')}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Importer votre premier triangle
              </button>
            </div>
          ) : (
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedTriangles.length === (filteredTriangles?.length ?? 0)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedTriangles(filteredTriangles?.map((t) => t.id) || []);
                        } else {
                          setSelectedTriangles([]);
                        }
                      }}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nom
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Devise
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Dernière modification
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredTriangles?.map((triangle) => (
                  <tr key={triangle.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedTriangles.includes(triangle.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedTriangles([...selectedTriangles, triangle.id]);
                          } else {
                            setSelectedTriangles(selectedTriangles.filter((id) => id !== triangle.id));
                          }
                        }}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => navigate(`/triangles/${triangle.id}`)}
                        className="text-blue-600 hover:text-blue-700 font-medium"
                      >
                        {getTriangleName(triangle)}  {/* ✅ CORRECTION 3 */}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded-full
                        ${triangle.type === 'paid' ? 'bg-blue-100 text-blue-800' : ''}
                        ${triangle.type === 'incurred' ? 'bg-green-100 text-green-800' : ''}
                        ${triangle.type === 'frequency' ? 'bg-purple-100 text-purple-800' : ''}
                        ${triangle.type === 'severity' ? 'bg-rose-100 text-rose-800' : ''}
                      `}
                      >
                        {triangle.type === 'paid'
                          ? 'Payés'
                          : triangle.type === 'incurred'
                          ? 'Survenus'
                          : triangle.type === 'frequency'
                          ? 'Fréquence'
                          : 'Sévérité'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">{triangle.currency}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date((triangle as any).updated_at ?? Date.now()).toLocaleDateString('fr-FR')}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => navigate(`/triangles/${triangle.id}`)}
                          className="p-1 hover:bg-gray-100 rounded"
                          title="Voir"
                        >
                          <Eye className="h-4 w-4 text-gray-600" />
                        </button>
                        <button
                          onClick={() => navigate(`/triangles/${triangle.id}/edit`)}
                          className="p-1 hover:bg-gray-100 rounded"
                          title="Modifier"
                        >
                          <Edit className="h-4 w-4 text-gray-600" />
                        </button>
                        {/* Bouton Dupliquer retiré car l'action n'existe pas dans le hook */}
                        <button
                          onClick={() => {
                            setTriangleToDelete(triangle.id);
                            setShowDeleteModal(true);
                          }}
                          className="p-1 hover:bg-gray-100 rounded"
                          title="Supprimer"
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal de suppression */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Confirmer la suppression</h3>
              <p className="text-gray-600 mb-6">
                Êtes-vous sûr de vouloir supprimer ce triangle ? Cette action est irréversible.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setTriangleToDelete(null);
                  }}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  onClick={() => triangleToDelete && handleDelete(triangleToDelete)}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Triangles;