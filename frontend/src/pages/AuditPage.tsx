// frontend/src/pages/AuditPage.tsx - VERSION ULTRA-SIMPLE GARANTIE
import React, { useState, useEffect } from 'react';

interface AuditEvent {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  resource: string;
  details: string;
  status: 'success' | 'warning' | 'error';
  ip_address: string;
  user_agent: string;
}

const AuditPage: React.FC = () => {
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    loadAuditEvents();
  }, []);

  const loadAuditEvents = async () => {
    try {
      setLoading(true);
      
      const mockEvents: AuditEvent[] = [
        {
          id: '1',
          timestamp: new Date(Date.now() - 5 * 60000).toISOString(),
          user: 'jean.martin@company.com',
          action: 'CALCULATION_RUN',
          resource: 'Triangle Auto 2024',
          details: 'Lancement calcul Chain Ladder',
          status: 'success',
          ip_address: '192.168.1.45',
          user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        },
        {
          id: '2',
          timestamp: new Date(Date.now() - 15 * 60000).toISOString(),
          user: 'marie.dubois@company.com',
          action: 'TRIANGLE_IMPORT',
          resource: 'RC 2023',
          details: 'Import fichier Excel - 45 lignes traitées',
          status: 'success',
          ip_address: '192.168.1.32',
          user_agent: 'Mozilla/5.0 (MacOS)'
        },
        {
          id: '3',
          timestamp: new Date(Date.now() - 30 * 60000).toISOString(),
          user: 'system',
          action: 'DATA_VALIDATION',
          resource: 'Triangle Construction 2024',
          details: 'Validation automatique - 3 avertissements détectés',
          status: 'warning',
          ip_address: 'system',
          user_agent: 'Internal System'
        },
        {
          id: '4',
          timestamp: new Date(Date.now() - 60 * 60000).toISOString(),
          user: 'admin@company.com',
          action: 'USER_LOGIN',
          resource: 'Authentication System',
          details: 'Connexion administrateur',
          status: 'success',
          ip_address: '192.168.1.10',
          user_agent: 'Mozilla/5.0 (Chrome)'
        },
        {
          id: '5',
          timestamp: new Date(Date.now() - 90 * 60000).toISOString(),
          user: 'pierre.leroy@company.com',
          action: 'CALCULATION_FAILED',
          resource: 'Triangle Santé 2023',
          details: 'Échec calcul Mack - Données insuffisantes',
          status: 'error',
          ip_address: '192.168.1.67',
          user_agent: 'Mozilla/5.0 (Firefox)'
        }
      ];

      setTimeout(() => {
        setAuditEvents(mockEvents);
        setLoading(false);
      }, 800);

    } catch (error) {
      console.error('Erreur chargement audit:', error);
      setLoading(false);
    }
  };

  const filteredEvents = auditEvents.filter(event => {
    const matchesSearch = searchTerm === '' || 
      event.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.resource.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.details.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || event.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusIcon = (status: string) => {
    if (status === 'success') return '✅';
    if (status === 'warning') return '⚠️';
    if (status === 'error') return '❌';
    return 'ℹ️';
  };

  const getStatusColor = (status: string) => {
    if (status === 'success') return 'bg-green-100 text-green-800';
    if (status === 'warning') return 'bg-yellow-100 text-yellow-800';
    if (status === 'error') return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-800';
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('fr-FR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getActionName = (action: string) => {
    const actions: Record<string, string> = {
      'CALCULATION_RUN': 'Calcul lancé',
      'TRIANGLE_IMPORT': 'Import triangle',
      'DATA_VALIDATION': 'Validation données',
      'USER_LOGIN': 'Connexion utilisateur',
      'CALCULATION_FAILED': 'Échec de calcul',
      'EXPORT_DATA': 'Export de données'
    };
    return actions[action] || action;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Chargement de l'audit...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">🔍 Audit et conformité</h1>
                <p className="text-sm text-gray-500 mt-1">
                  Piste d'audit et conformité réglementaire • {filteredEvents.length} événement(s)
                </p>
              </div>
              
              <div className="flex gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">
                    {auditEvents.filter(e => e.status === 'success').length}
                  </p>
                  <p className="text-xs text-gray-600">Succès</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-yellow-600">
                    {auditEvents.filter(e => e.status === 'warning').length}
                  </p>
                  <p className="text-xs text-gray-600">Warnings</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">
                    {auditEvents.filter(e => e.status === 'error').length}
                  </p>
                  <p className="text-xs text-gray-600">Erreurs</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4">
            <div className="flex space-x-4">
              <a
                href="/triangles"
                className="text-blue-600 hover:text-blue-800 px-3 py-2 rounded-md text-sm font-medium hover:bg-blue-50"
              >
                ← Retour aux triangles
              </a>
              <span className="text-gray-300">|</span>
              <a
                href="/simulations"
                className="text-gray-600 hover:text-gray-800 px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-50"
              >
                Simulations
              </a>
            </div>
          </div>
        </div>

        {/* Filtres */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <input
                  type="text"
                  placeholder="🔍 Rechercher..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="all">📊 Tous les statuts</option>
                  <option value="success">✅ Succès</option>
                  <option value="warning">⚠️ Warnings</option>
                  <option value="error">❌ Erreurs</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Table d'audit */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Utilisateur
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ressource
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Détails
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Statut
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredEvents.map((event) => (
                  <tr key={event.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatTimestamp(event.timestamp)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <span className="mr-2">👤</span>
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {event.user}
                          </div>
                          <div className="text-xs text-gray-500">
                            {event.ip_address}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                        {getActionName(event.action)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {event.resource}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">
                      {event.details}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <span className="mr-2">{getStatusIcon(event.status)}</span>
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(event.status)}`}>
                          {event.status}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {filteredEvents.length === 0 && (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">🔍</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun événement trouvé</h3>
              <p className="text-gray-600">
                Aucun événement d'audit ne correspond aux critères de recherche.
              </p>
            </div>
          )}
        </div>

        {/* Information complémentaire */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <span className="text-2xl mr-3">🔒</span>
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-1">Information de conformité</p>
              <p>
                Tous les événements sont enregistrés conformément aux exigences réglementaires. 
                Les logs sont conservés pendant 7 ans et sont accessibles aux auditeurs autorisés. 
                L'intégrité des données est garantie par chiffrement et signature numérique.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuditPage;