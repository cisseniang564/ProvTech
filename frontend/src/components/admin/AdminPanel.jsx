import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Shield, 
  Activity, 
  FileText, 
  Settings, 
  Database,
  UserPlus,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  BarChart3
} from 'lucide-react';

const AdminPanel = () => {
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [migrationStats, setMigrationStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Configuration API
  const API_BASE_URL = 'http://localhost:3001/api';
  const getAuthHeaders = () => {
    const token = localStorage.getItem('provtech_access_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  };

  // Chargement des utilisateurs
  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/users`, {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      
      if (response.ok) {
        setUsers(data.users || []);
      } else {
        setError(data.message || 'Erreur chargement utilisateurs');
      }
    } catch (error) {
      setError('Erreur réseau lors du chargement des utilisateurs');
      console.error('Erreur users:', error);
    } finally {
      setLoading(false);
    }
  };

  // Chargement des logs d'audit
  const loadAuditLogs = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/audit?limit=50`, {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      
      if (response.ok) {
        setAuditLogs(data.logs || []);
      } else {
        setError(data.message || 'Erreur chargement audit');
      }
    } catch (error) {
      setError('Erreur réseau lors du chargement des logs');
      console.error('Erreur audit:', error);
    } finally {
      setLoading(false);
    }
  };

  // Chargement des statistiques de migration
  const loadMigrationStats = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/migration/stats`, {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      
      if (response.ok) {
        setMigrationStats(data.stats);
      }
    } catch (error) {
      console.error('Erreur stats migration:', error);
    }
  };

  // Création d'un nouvel utilisateur
  const createUser = async (userData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/users`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(userData)
      });
      
      const data = await response.json();
      
      if (response.ok) {
        loadUsers(); // Recharger la liste
        return { success: true, message: 'Utilisateur créé avec succès' };
      } else {
        return { success: false, message: data.message };
      }
    } catch (error) {
      return { success: false, message: 'Erreur réseau' };
    }
  };

  // Démarrer une migration
  const startMigration = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/migration/start`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ dryRun: false })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        loadMigrationStats();
        return { success: true, jobId: data.jobId };
      } else {
        return { success: false, message: data.message };
      }
    } catch (error) {
      return { success: false, message: 'Erreur réseau' };
    }
  };

  // Chargement initial
  useEffect(() => {
    loadUsers();
    loadMigrationStats();
  }, []);

  // Chargement spécifique par onglet
  useEffect(() => {
    if (activeTab === 'audit') {
      loadAuditLogs();
    }
  }, [activeTab]);

  // Composant de création d'utilisateur
  const UserCreationForm = () => {
    const [formData, setFormData] = useState({
      email: '',
      firstName: '',
      lastName: '',
      role: 'ACTUAIRE'
    });

    const handleSubmit = async () => {
      const result = await createUser(formData);
      if (result.success) {
        setFormData({ email: '', firstName: '', lastName: '', role: 'ACTUAIRE' });
        alert('Utilisateur créé !');
      } else {
        alert('Erreur: ' + result.message);
      }
    };

    return (
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <UserPlus className="w-5 h-5" />
          Créer un utilisateur
        </h3>
        
        <div className="grid grid-cols-2 gap-4">
          <input
            type="email"
            placeholder="Email professionnel"
            value={formData.email}
            onChange={(e) => setFormData({...formData, email: e.target.value})}
            className="px-3 py-2 border rounded-lg"
          />
          
          <select
            value={formData.role}
            onChange={(e) => setFormData({...formData, role: e.target.value})}
            className="px-3 py-2 border rounded-lg"
          >
            <option value="ACTUAIRE">Actuaire</option>
            <option value="ACTUAIRE_SENIOR">Actuaire Senior</option>
            <option value="ACTUAIRE_JUNIOR">Actuaire Junior</option>
            <option value="ADMIN">Administrateur</option>
          </select>
          
          <input
            type="text"
            placeholder="Prénom"
            value={formData.firstName}
            onChange={(e) => setFormData({...formData, firstName: e.target.value})}
            className="px-3 py-2 border rounded-lg"
          />
          
          <input
            type="text"
            placeholder="Nom"
            value={formData.lastName}
            onChange={(e) => setFormData({...formData, lastName: e.target.value})}
            className="px-3 py-2 border rounded-lg"
          />
        </div>
        
        <button
          onClick={handleSubmit}
          disabled={!formData.email || !formData.firstName || !formData.lastName}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
        >
          Créer l'utilisateur
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <Settings className="w-8 h-8 text-blue-600" />
          Dashboard Admin - ProvTech
        </h1>
        <p className="text-gray-600 mt-2">Gestion des utilisateurs, migration et audit</p>
      </div>

      {/* Messages d'erreur */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertTriangle className="w-5 h-5" />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto text-red-500">×</button>
        </div>
      )}

      {/* Statistiques rapides */}
      {migrationStats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Utilisateurs</p>
                <p className="text-2xl font-bold text-blue-600">{migrationStats.totalUsers}</p>
              </div>
              <Users className="w-8 h-8 text-blue-500" />
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Migrés</p>
                <p className="text-2xl font-bold text-green-600">{migrationStats.migratedUsers}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Legacy</p>
                <p className="text-2xl font-bold text-orange-600">{migrationStats.legacyUsers}</p>
              </div>
              <Clock className="w-8 h-8 text-orange-500" />
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">2FA Activé</p>
                <p className="text-2xl font-bold text-purple-600">{migrationStats.users2FA}</p>
              </div>
              <Shield className="w-8 h-8 text-purple-500" />
            </div>
          </div>
        </div>
      )}

      {/* Navigation par onglets */}
      <div className="flex space-x-1 mb-6">
        {[
          { id: 'users', label: 'Utilisateurs', icon: Users },
          { id: 'migration', label: 'Migration', icon: Database },
          { id: 'audit', label: 'Audit', icon: FileText },
          { id: 'create', label: 'Créer', icon: UserPlus }
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Contenu des onglets */}
      <div className="bg-white rounded-lg shadow-lg">
        
        {/* Onglet Utilisateurs */}
        {activeTab === 'users' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Liste des Utilisateurs</h2>
              <button
                onClick={loadUsers}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Actualiser
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Email</th>
                    <th className="text-left py-2">Nom</th>
                    <th className="text-left py-2">Rôle</th>
                    <th className="text-left py-2">2FA</th>
                    <th className="text-left py-2">Migration</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id} className="border-b hover:bg-gray-50">
                      <td className="py-2">{user.email}</td>
                      <td className="py-2">{user.first_name} {user.last_name}</td>
                      <td className="py-2">
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                          {user.role}
                        </span>
                      </td>
                      <td className="py-2">
                        {user.has_2fa ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <Clock className="w-4 h-4 text-orange-500" />
                        )}
                      </td>
                      <td className="py-2">
                        {user.is_migrated ? (
                          <span className="text-green-600 text-xs">✓ Migré</span>
                        ) : (
                          <span className="text-orange-600 text-xs">Legacy</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Onglet Migration */}
        {activeTab === 'migration' && (
          <div className="p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Database className="w-5 h-5" />
              Migration Progressive
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <button
                  onClick={startMigration}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Démarrer Migration Batch
                </button>
                
                <button
                  onClick={loadMigrationStats}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Actualiser Statistiques
                </button>
              </div>
              
              {migrationStats && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-semibold mb-2">Progression Migration</h3>
                  <div className="space-y-2 text-sm">
                    <p>Total: {migrationStats.totalUsers} utilisateurs</p>
                    <p>Migrés: {migrationStats.migratedUsers}</p>
                    <p>Restants: {migrationStats.legacyUsers}</p>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-green-600 h-2 rounded-full" 
                        style={{
                          width: `${(migrationStats.migratedUsers / migrationStats.totalUsers) * 100}%`
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Onglet Audit */}
        {activeTab === 'audit' && (
          <div className="p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Logs d'Audit
            </h2>
            
            <div className="space-y-2">
              {auditLogs.map((log, index) => (
                <div key={index} className="p-3 bg-gray-50 rounded-lg text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{log.action}</span>
                    <span className="text-gray-500">{log.timestamp}</span>
                  </div>
                  <p className="text-gray-700">{log.details}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Onglet Créer */}
        {activeTab === 'create' && (
          <div className="p-6">
            <UserCreationForm />
          </div>
        )}

      </div>
    </div>
  );
};

export default AdminPanel;