// frontend/src/components/regulatory/WorkflowApprovalSystem.tsx
import React, { useState, useMemo, useEffect } from 'react';
import {
  CheckCircle, XCircle, Clock, AlertTriangle, User, Calendar,
  FileText, MessageSquare, Eye, Edit, Lock, Unlock, Send,
  ArrowRight, ArrowDown, RotateCcw, Shield, Award, Gavel,
  History, Download, Upload, UserCheck, UserX, Timer,
  ChevronRight, ChevronDown, Filter, Search, Bell
} from 'lucide-react';

// ===== TYPES SYSTÈME D'APPROBATION =====
interface ApprovalLevel {
  id: string;
  name: string;
  role: 'ACTUAIRE_CHEF' | 'DIRECTION' | 'CONSEIL_ADMIN' | 'CONTROLEUR' | 'VALIDEUR';
  required: boolean;
  order: number;
  conditions?: {
    minAmount?: number;
    businessLines?: string[];
    methodTypes?: string[];
  };
}

interface ApprovalStep {
  id: string;
  levelId: string;
  assignedTo: string;
  assignedToName: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DELEGATED' | 'EXPIRED';
  submittedAt?: string;
  processedAt?: string;
  comments?: string;
  signature?: {
    hash: string;
    timestamp: string;
    certificate: string;
  };
  delegation?: {
    fromUser: string;
    toUser: string;
    reason: string;
    validUntil: string;
  };
}

interface WorkflowInstance {
  id: string;
  calculationId: string;
  calculationName: string;
  submittedBy: string;
  submittedByName: string;
  submittedAt: string;
  currentStep: number;
  status: 'DRAFT' | 'SUBMITTED' | 'IN_PROGRESS' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  dueDate?: string;
  approvalLevels: ApprovalLevel[];
  steps: ApprovalStep[];
  metadata: {
    businessLine: string;
    totalAmount: number;
    methodsUsed: string[];
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    regulatoryRequirement: 'IFRS17' | 'SOLVENCY2' | 'BOTH' | 'PILIER3';
  };
  documents: {
    id: string;
    name: string;
    type: 'CALCULATION_RESULTS' | 'TECHNICAL_NOTE' | 'VALIDATION_REPORT' | 'SUPPORTING_DOC';
    uploadedAt: string;
    uploadedBy: string;
    size: number;
    hash: string;
  }[];
  auditTrail: {
    timestamp: string;
    action: string;
    userId: string;
    userName: string;
    details: string;
    ipAddress?: string;
  }[];
  version: number;
  previousVersions?: string[];
}

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  applicableFor: {
    businessLines: string[];
    calculationTypes: string[];
    amountThresholds: { min?: number; max?: number };
  };
  levels: ApprovalLevel[];
  slaHours: number;
  autoEscalation: boolean;
  mandatoryDocuments: string[];
}

// ===== TEMPLATES PRÉDÉFINIS =====
const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'ifrs17_standard',
    name: 'IFRS 17 - Workflow Standard',
    description: 'Processus d\'approbation standard pour les calculs IFRS 17',
    applicableFor: {
      businessLines: ['motor', 'property', 'liability'],
      calculationTypes: ['CSM', 'RA', 'liability_release'],
      amountThresholds: { min: 0, max: 50000000 }
    },
    levels: [
      {
        id: 'actuaire_chef',
        name: 'Chef Actuaire',
        role: 'ACTUAIRE_CHEF',
        required: true,
        order: 1
      },
      {
        id: 'direction',
        name: 'Direction Technique',
        role: 'DIRECTION',
        required: true,
        order: 2,
        conditions: { minAmount: 10000000 }
      }
    ],
    slaHours: 72,
    autoEscalation: true,
    mandatoryDocuments: ['CALCULATION_RESULTS', 'TECHNICAL_NOTE']
  },
  {
    id: 'solvency2_critical',
    name: 'Solvency II - Critique',
    description: 'Processus renforcé pour calculs critiques Solvency II',
    applicableFor: {
      businessLines: ['all'],
      calculationTypes: ['SCR', 'MCR', 'own_funds'],
      amountThresholds: { min: 100000000 }
    },
    levels: [
      {
        id: 'actuaire_chef',
        name: 'Chef Actuaire',
        role: 'ACTUAIRE_CHEF',
        required: true,
        order: 1
      },
      {
        id: 'controleur',
        name: 'Contrôleur Interne',
        role: 'CONTROLEUR',
        required: true,
        order: 2
      },
      {
        id: 'direction',
        name: 'Direction Générale',
        role: 'DIRECTION',
        required: true,
        order: 3
      },
      {
        id: 'conseil',
        name: 'Conseil d\'Administration',
        role: 'CONSEIL_ADMIN',
        required: true,
        order: 4,
        conditions: { minAmount: 500000000 }
      }
    ],
    slaHours: 120,
    autoEscalation: true,
    mandatoryDocuments: ['CALCULATION_RESULTS', 'TECHNICAL_NOTE', 'VALIDATION_REPORT']
  }
];

// ===== COMPOSANTS UI =====
const WorkflowStatusBadge: React.FC<{ status: WorkflowInstance['status'] }> = ({ status }) => {
  const configs = {
    DRAFT: { color: 'gray', icon: Edit, text: 'Brouillon' },
    SUBMITTED: { color: 'blue', icon: Send, text: 'Soumis' },
    IN_PROGRESS: { color: 'yellow', icon: Clock, text: 'En cours' },
    APPROVED: { color: 'green', icon: CheckCircle, text: 'Approuvé' },
    REJECTED: { color: 'red', icon: XCircle, text: 'Rejeté' },
    CANCELLED: { color: 'gray', icon: XCircle, text: 'Annulé' }
  };
  
  const config = configs[status];
  const Icon = config.icon;
  
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium
      bg-${config.color}-100 text-${config.color}-700`}>
      <Icon className="h-3 w-3" />
      {config.text}
    </span>
  );
};

const PriorityIndicator: React.FC<{ priority: WorkflowInstance['priority'] }> = ({ priority }) => {
  const configs = {
    LOW: { color: 'green', text: 'Faible', dots: 1 },
    NORMAL: { color: 'blue', text: 'Normale', dots: 2 },
    HIGH: { color: 'orange', text: 'Élevée', dots: 3 },
    URGENT: { color: 'red', text: 'Urgente', dots: 4 }
  };
  
  const config = configs[priority];
  
  return (
    <div className="flex items-center gap-1">
      <div className="flex">
        {Array.from({ length: config.dots }).map((_, i) => (
          <div key={i} className={`w-1 h-1 rounded-full bg-${config.color}-500 mr-0.5`} />
        ))}
        {Array.from({ length: 4 - config.dots }).map((_, i) => (
          <div key={i} className="w-1 h-1 rounded-full bg-gray-300 mr-0.5" />
        ))}
      </div>
      <span className={`text-xs text-${config.color}-700 font-medium`}>
        {config.text}
      </span>
    </div>
  );
};

const WorkflowTimeline: React.FC<{ workflow: WorkflowInstance }> = ({ workflow }) => {
  return (
    <div className="space-y-4">
      {workflow.steps.map((step, index) => {
        const level = workflow.approvalLevels.find(l => l.id === step.levelId);
        const isCurrentStep = index === workflow.currentStep;
        const isPastStep = index < workflow.currentStep;
        const isFutureStep = index > workflow.currentStep;
        
        return (
          <div key={step.id} className="relative">
            {index < workflow.steps.length - 1 && (
              <div className={`absolute left-4 top-8 w-0.5 h-16 ${
                isPastStep ? 'bg-green-400' : 'bg-gray-300'
              }`} />
            )}
            
            <div className="flex items-start gap-4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                step.status === 'APPROVED' ? 'bg-green-100 text-green-600' :
                step.status === 'REJECTED' ? 'bg-red-100 text-red-600' :
                step.status === 'PENDING' && isCurrentStep ? 'bg-yellow-100 text-yellow-600' :
                'bg-gray-100 text-gray-400'
              }`}>
                {step.status === 'APPROVED' ? <CheckCircle className="h-4 w-4" /> :
                 step.status === 'REJECTED' ? <XCircle className="h-4 w-4" /> :
                 step.status === 'DELEGATED' ? <ArrowRight className="h-4 w-4" /> :
                 step.status === 'PENDING' ? <Clock className="h-4 w-4" /> :
                 <User className="h-4 w-4" />}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-gray-900">
                    {level?.name || 'Niveau inconnu'}
                  </h4>
                  <div className="text-sm text-gray-500">
                    {step.submittedAt && new Date(step.submittedAt).toLocaleDateString('fr-FR')}
                  </div>
                </div>
                
                <div className="mt-1">
                  <span className="text-sm text-gray-600">
                    Assigné à: <strong>{step.assignedToName}</strong>
                  </span>
                  {step.delegation && (
                    <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                      Délégué à {step.delegation.toUser}
                    </span>
                  )}
                </div>
                
                {step.comments && (
                  <div className="mt-2 p-2 bg-gray-50 rounded text-sm">
                    <MessageSquare className="h-3 w-3 inline mr-1 text-gray-500" />
                    {step.comments}
                  </div>
                )}
                
                {step.signature && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-green-600">
                    <Shield className="h-3 w-3" />
                    Signature électronique vérifiée
                    <span className="text-gray-500">
                      {new Date(step.signature.timestamp).toLocaleString('fr-FR')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const DocumentsManager: React.FC<{ 
  documents: WorkflowInstance['documents'];
  onUpload: (file: File, type: string) => void;
  onDownload: (docId: string) => void;
}> = ({ documents, onUpload, onDownload }) => {
  const [dragOver, setDragOver] = useState(false);
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };
  
  const handleDragLeave = () => {
    setDragOver(false);
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    files.forEach(file => onUpload(file, 'SUPPORTING_DOC'));
  };
  
  const getDocTypeIcon = (type: string) => {
    switch (type) {
      case 'CALCULATION_RESULTS': return '📊';
      case 'TECHNICAL_NOTE': return '📝';
      case 'VALIDATION_REPORT': return '✅';
      case 'SUPPORTING_DOC': return '📎';
      default: return '📄';
    }
  };
  
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };
  
  return (
    <div className="space-y-4">
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
        <p className="text-sm text-gray-600">
          Glissez-déposez vos fichiers ici ou
          <button className="ml-1 text-blue-600 hover:text-blue-700 underline">
            parcourez
          </button>
        </p>
        <p className="text-xs text-gray-500 mt-1">
          PDF, Excel, Word - Max 25MB par fichier
        </p>
      </div>
      
      <div className="space-y-2">
        {documents.map(doc => (
          <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
            <div className="flex items-center gap-3">
              <span className="text-lg">{getDocTypeIcon(doc.type)}</span>
              <div>
                <p className="font-medium text-gray-900">{doc.name}</p>
                <p className="text-xs text-gray-500">
                  {formatFileSize(doc.size)} • 
                  {new Date(doc.uploadedAt).toLocaleDateString('fr-FR')} • 
                  {doc.uploadedBy}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => onDownload(doc.id)}
                className="p-1 text-gray-500 hover:text-blue-600"
                title="Télécharger"
              >
                <Download className="h-4 w-4" />
              </button>
              <button
                className="p-1 text-gray-500 hover:text-green-600"
                title="Voir"
              >
                <Eye className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const ApprovalActions: React.FC<{
  workflow: WorkflowInstance;
  currentUserId: string;
  onApprove: (comments: string) => void;
  onReject: (reason: string) => void;
  onDelegate: (toUser: string, reason: string, validUntil: string) => void;
}> = ({ workflow, currentUserId, onApprove, onReject, onDelegate }) => {
  const [showActions, setShowActions] = useState(false);
  const [comments, setComments] = useState('');
  const [delegationData, setDelegationData] = useState({
    toUser: '',
    reason: '',
    validUntil: ''
  });
  
  const currentStep = workflow.steps[workflow.currentStep];
  const canTakeAction = currentStep?.assignedTo === currentUserId && currentStep?.status === 'PENDING';
  
  if (!canTakeAction) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg text-center">
        <p className="text-sm text-gray-600">
          {workflow.status === 'APPROVED' ? '✅ Workflow approuvé' :
           workflow.status === 'REJECTED' ? '❌ Workflow rejeté' :
           '⏳ En attente d\'une action d\'un autre utilisateur'}
        </p>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <Bell className="h-4 w-4 text-yellow-600" />
          <span className="font-medium text-yellow-800">Action requise</span>
        </div>
        <p className="text-sm text-yellow-700">
          Ce workflow est en attente de votre approbation en tant que {workflow.approvalLevels.find(l => l.id === currentStep.levelId)?.name}.
        </p>
      </div>
      
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Commentaires
          </label>
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            rows={3}
            placeholder="Ajoutez vos commentaires..."
          />
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={() => onApprove(comments)}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center justify-center gap-2"
          >
            <CheckCircle className="h-4 w-4" />
            Approuver
          </button>
          
          <button
            onClick={() => onReject(comments)}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center justify-center gap-2"
          >
            <XCircle className="h-4 w-4" />
            Rejeter
          </button>
          
          <button
            onClick={() => setShowActions(!showActions)}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 flex items-center gap-2"
          >
            <ArrowRight className="h-4 w-4" />
            Déléguer
          </button>
        </div>
        
        {showActions && (
          <div className="p-4 border border-gray-200 rounded-lg space-y-3">
            <h4 className="font-medium text-gray-900">Délégation de pouvoir</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Déléguer à</label>
                <select
                  value={delegationData.toUser}
                  onChange={(e) => setDelegationData({...delegationData, toUser: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded"
                >
                  <option value="">Sélectionner un utilisateur</option>
                  <option value="user1">Marie Dupont</option>
                  <option value="user2">Jean Martin</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm text-gray-700 mb-1">Valide jusqu'au</label>
                <input
                  type="datetime-local"
                  value={delegationData.validUntil}
                  onChange={(e) => setDelegationData({...delegationData, validUntil: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm text-gray-700 mb-1">Raison de la délégation</label>
              <input
                type="text"
                value={delegationData.reason}
                onChange={(e) => setDelegationData({...delegationData, reason: e.target.value})}
                className="w-full p-2 border border-gray-300 rounded"
                placeholder="Ex: Absence, congés..."
              />
            </div>
            
            <button
              onClick={() => onDelegate(delegationData.toUser, delegationData.reason, delegationData.validUntil)}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              disabled={!delegationData.toUser || !delegationData.reason}
            >
              Confirmer la délégation
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ===== COMPOSANT PRINCIPAL =====
const WorkflowApprovalSystem: React.FC<{
  calculationId?: string;
  onWorkflowComplete?: (workflowId: string, status: string) => void;
}> = ({ calculationId, onWorkflowComplete }) => {
  const [activeTab, setActiveTab] = useState<'my-tasks' | 'all-workflows' | 'templates' | 'analytics'>('my-tasks');
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowInstance | null>(null);
  const [filters, setFilters] = useState({
    status: 'ALL',
    priority: 'ALL',
    assignedTo: 'ALL'
  });
  
  // Données simulées
  const [workflows] = useState<WorkflowInstance[]>([
    {
      id: 'wf001',
      calculationId: 'calc123',
      calculationName: 'Provisions Motor Q4 2024',
      submittedBy: 'user1',
      submittedByName: 'Jean Actuaire',
      submittedAt: '2024-12-15T10:00:00Z',
      currentStep: 0,
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      dueDate: '2024-12-20T17:00:00Z',
      approvalLevels: WORKFLOW_TEMPLATES[0].levels,
      steps: [
        {
          id: 'step1',
          levelId: 'actuaire_chef',
          assignedTo: 'chef1',
          assignedToName: 'Marie Chef',
          status: 'PENDING',
          submittedAt: '2024-12-15T10:00:00Z'
        }
      ],
      metadata: {
        businessLine: 'Motor',
        totalAmount: 25000000,
        methodsUsed: ['Chain Ladder', 'Bornhuetter-Ferguson'],
        riskLevel: 'MEDIUM',
        regulatoryRequirement: 'IFRS17'
      },
      documents: [
        {
          id: 'doc1',
          name: 'Résultats_Calcul_Motor_Q4.xlsx',
          type: 'CALCULATION_RESULTS',
          uploadedAt: '2024-12-15T10:05:00Z',
          uploadedBy: 'Jean Actuaire',
          size: 2048576,
          hash: 'sha256:abc123'
        }
      ],
      auditTrail: [
        {
          timestamp: '2024-12-15T10:00:00Z',
          action: 'WORKFLOW_CREATED',
          userId: 'user1',
          userName: 'Jean Actuaire',
          details: 'Workflow créé pour le calcul calc123'
        }
      ],
      version: 1
    }
  ]);
  
  const currentUserId = 'chef1'; // Simulation utilisateur connecté
  
  const filteredWorkflows = useMemo(() => {
    return workflows.filter(wf => {
      if (filters.status !== 'ALL' && wf.status !== filters.status) return false;
      if (filters.priority !== 'ALL' && wf.priority !== filters.priority) return false;
      // Autres filtres...
      return true;
    });
  }, [workflows, filters]);
  
  const myTasks = useMemo(() => {
    return workflows.filter(wf => 
      wf.status === 'IN_PROGRESS' && 
      wf.steps[wf.currentStep]?.assignedTo === currentUserId
    );
  }, [workflows, currentUserId]);
  
  const handleApprove = (comments: string) => {
    console.log('Approving with comments:', comments);
    // Logique d'approbation
  };
  
  const handleReject = (reason: string) => {
    console.log('Rejecting with reason:', reason);
    // Logique de rejet
  };
  
  const handleDelegate = (toUser: string, reason: string, validUntil: string) => {
    console.log('Delegating to:', toUser, reason, validUntil);
    // Logique de délégation
  };
  
  const handleUpload = (file: File, type: string) => {
    console.log('Uploading file:', file.name, type);
    // Logique d'upload
  };
  
  const handleDownload = (docId: string) => {
    console.log('Downloading document:', docId);
    // Logique de téléchargement
  };
  
  return (
    <div className="bg-white rounded-lg shadow-lg">
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8 px-6">
          {[
            { key: 'my-tasks', label: 'Mes Tâches', count: myTasks.length },
            { key: 'all-workflows', label: 'Tous les Workflows', count: workflows.length },
            { key: 'templates', label: 'Templates', count: WORKFLOW_TEMPLATES.length },
            { key: 'analytics', label: 'Analytics', count: 0 }
          ].map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as any)}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {label}
              {count > 0 && (
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                  activeTab === key ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                }`}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>
      
      <div className="p-6">
        {activeTab === 'my-tasks' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">
                Mes Tâches d'Approbation
              </h2>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Timer className="h-4 w-4" />
                {myTasks.length} tâche{myTasks.length !== 1 ? 's' : ''} en attente
              </div>
            </div>
            
            {myTasks.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Aucune tâche en attente
                </h3>
                <p className="text-gray-600">
                  Vous n'avez actuellement aucune approbation en attente.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {myTasks.map(workflow => (
                  <div key={workflow.id} className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                          {workflow.calculationName}
                        </h3>
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <span>Soumis par {workflow.submittedByName}</span>
                          <span>•</span>
                          <span>{new Date(workflow.submittedAt).toLocaleDateString('fr-FR')}</span>
                          <span>•</span>
                          <span>{workflow.metadata.businessLine}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <PriorityIndicator priority={workflow.priority} />
                        <WorkflowStatusBadge status={workflow.status} />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div>
                        <h4 className="font-medium text-gray-900 mb-3">Actions d'approbation</h4>
                        <ApprovalActions
                          workflow={workflow}
                          currentUserId={currentUserId}
                          onApprove={handleApprove}
                          onReject={handleReject}
                          onDelegate={handleDelegate}
                        />
                      </div>
                      
                      <div>
                        <h4 className="font-medium text-gray-900 mb-3">Détails du calcul</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Montant total:</span>
                            <span className="font-medium">
                              {new Intl.NumberFormat('fr-FR', {
                                style: 'currency',
                                currency: 'EUR',
                                minimumFractionDigits: 0
                              }).format(workflow.metadata.totalAmount)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Niveau de risque:</span>
                            <span className={`font-medium ${
                              workflow.metadata.riskLevel === 'HIGH' ? 'text-red-600' :
                              workflow.metadata.riskLevel === 'MEDIUM' ? 'text-yellow-600' :
                              'text-green-600'
                            }`}>
                              {workflow.metadata.riskLevel}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Méthodes utilisées:</span>
                            <span className="font-medium text-right">
                              {workflow.metadata.methodsUsed.join(', ')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-6 pt-4 border-t border-gray-200">
                      <button
                        onClick={() => setSelectedWorkflow(workflow)}
                        className="text-blue-600 hover:text-blue-700 font-medium text-sm flex items-center gap-1"
                      >
                        Voir les détails complets
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'all-workflows' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">
                Tous les Workflows
              </h2>
              
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-gray-500" />
                  <select
                    value={filters.status}
                    onChange={(e) => setFilters({...filters, status: e.target.value})}
                    className="text-sm border border-gray-300 rounded px-2 py-1"
                  >
                    <option value="ALL">Tous les statuts</option>
                    <option value="DRAFT">Brouillon</option>
                    <option value="IN_PROGRESS">En cours</option>
                    <option value="APPROVED">Approuvé</option>
                    <option value="REJECTED">Rejeté</option>
                  </select>
                </div>
                
                <div className="relative">
                  <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Rechercher..."
                    className="pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Workflow
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Statut
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Priorité
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Étape actuelle
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Échéance
                    </th>
                    <th className="relative px-6 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredWorkflows.map(workflow => (
                    <tr key={workflow.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {workflow.calculationName}
                          </div>
                          <div className="text-sm text-gray-500">
                            par {workflow.submittedByName}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <WorkflowStatusBadge status={workflow.status} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <PriorityIndicator priority={workflow.priority} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {workflow.approvalLevels[workflow.currentStep]?.name || 'Terminé'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {workflow.dueDate ? new Date(workflow.dueDate).toLocaleDateString('fr-FR') : '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => setSelectedWorkflow(workflow)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          Voir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        
        {/* Modal de détails du workflow */}
        {selectedWorkflow && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto m-4">
              <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                <h2 className="text-xl font-semibold text-gray-900">
                  Détails du Workflow - {selectedWorkflow.calculationName}
                </h2>
                <button
                  onClick={() => setSelectedWorkflow(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="h-6 w-6" />
                </button>
              </div>
              
              <div className="p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">
                      Timeline d'approbation
                    </h3>
                    <WorkflowTimeline workflow={selectedWorkflow} />
                  </div>
                  
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 mb-4">
                        Documents
                      </h3>
                      <DocumentsManager
                        documents={selectedWorkflow.documents}
                        onUpload={handleUpload}
                        onDownload={handleDownload}
                      />
                    </div>
                    
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 mb-4">
                        Journal d'audit
                      </h3>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {selectedWorkflow.auditTrail.map((entry, index) => (
                          <div key={index} className="text-sm p-3 bg-gray-50 rounded">
                            <div className="flex justify-between items-start">
                              <span className="font-medium">{entry.action}</span>
                              <span className="text-gray-500">
                                {new Date(entry.timestamp).toLocaleString('fr-FR')}
                              </span>
                            </div>
                            <div className="text-gray-600 mt-1">
                              {entry.userName}: {entry.details}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkflowApprovalSystem;