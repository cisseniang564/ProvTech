// frontend/src/components/regulatory/DocumentationGenerator.tsx
import React, { useState, useMemo, useEffect } from 'react';
import {
  FileText, Download, Eye, Edit, Save, Share2, Clock, 
  CheckCircle, AlertTriangle, BookOpen, FileCheck, 
  Printer, Mail, Globe, Archive, RefreshCw, Settings,
  Layout, PenTool, Stamp, Shield, Award, Target,
  BarChart3, PieChart, TrendingUp, Calculator, Database,
  Users, Building, Calendar, Map, Layers, Zap
} from 'lucide-react';

// ===== TYPES POUR LA DOCUMENTATION =====
interface DocumentTemplate {
  id: string;
  name: string;
  description: string;
  type: 'TECHNICAL_NOTE' | 'QRT_REPORT' | 'ACPR_FILING' | 'EIOPA_REPORT' | 'BOARD_SUMMARY' | 'VALIDATION_REPORT';
  regulatoryFramework: 'IFRS17' | 'SOLVENCY2' | 'PILIER3' | 'ACPR' | 'EIOPA' | 'GENERAL';
  sections: DocumentSection[];
  language: 'fr' | 'en';
  format: 'PDF' | 'WORD' | 'EXCEL' | 'HTML';
  automationLevel: 'FULL' | 'PARTIAL' | 'MANUAL';
  frequency: 'ANNUAL' | 'QUARTERLY' | 'MONTHLY' | 'AD_HOC';
  mandatoryFields: string[];
  validationRules: ValidationRule[];
  version: string;
  lastUpdated: string;
}

interface DocumentSection {
  id: string;
  title: string;
  type: 'TEXT' | 'TABLE' | 'CHART' | 'KPI' | 'FORMULA' | 'SIGNATURE' | 'APPENDIX';
  content?: string;
  dataSource?: DataSourceConfig;
  formatting?: SectionFormatting;
  order: number;
  required: boolean;
  conditions?: string[];
}

interface DataSourceConfig {
  type: 'CALCULATION_RESULT' | 'TRIANGLE_DATA' | 'KPI_METRIC' | 'REGULATORY_RATIO' | 'EXTERNAL_DATA';
  source: string;
  query?: string;
  transformation?: string;
  refreshRate?: 'REAL_TIME' | 'HOURLY' | 'DAILY' | 'MANUAL';
}

interface SectionFormatting {
  style: 'FORMAL' | 'EXECUTIVE' | 'TECHNICAL' | 'REGULATORY';
  fontSize: number;
  fontFamily: string;
  alignment: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFY';
  spacing: number;
  borders: boolean;
  colors?: {
    background: string;
    text: string;
    accent: string;
  };
}

interface ValidationRule {
  field: string;
  rule: 'REQUIRED' | 'NUMERIC' | 'DATE' | 'PERCENTAGE' | 'CURRENCY' | 'CUSTOM';
  message: string;
  customValidation?: string;
}

interface GeneratedDocument {
  id: string;
  templateId: string;
  templateName: string;
  title: string;
  status: 'GENERATING' | 'COMPLETED' | 'ERROR' | 'VALIDATED' | 'APPROVED';
  generatedAt: string;
  generatedBy: string;
  calculationIds: string[];
  dataSnapshot: any;
  content: DocumentContent;
  validationErrors: string[];
  approvalChain?: {
    stepId: string;
    approver: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    timestamp?: string;
    comments?: string;
  }[];
  metadata: {
    version: string;
    pageCount: number;
    fileSize: number;
    checksum: string;
    watermark?: string;
  };
}

interface DocumentContent {
  sections: RenderedSection[];
  annexes: DocumentAnnex[];
  signatures: ElectronicSignature[];
  references: DocumentReference[];
}

interface RenderedSection {
  sectionId: string;
  title: string;
  content: string | TableData | ChartData;
  renderedHtml: string;
  lastUpdated: string;
}

interface TableData {
  headers: string[];
  rows: (string | number)[][];
  formatting?: {
    headerStyle: string;
    cellStyle: string;
    alternateRows: boolean;
  };
}

interface ChartData {
  type: 'LINE' | 'BAR' | 'PIE' | 'AREA' | 'SCATTER';
  data: any[];
  config: {
    title: string;
    xAxis: string;
    yAxis: string;
    colors: string[];
  };
}

interface DocumentAnnex {
  id: string;
  title: string;
  type: 'CALCULATION_DETAIL' | 'DATA_SOURCE' | 'METHODOLOGY' | 'REFERENCE';
  content: string;
  attachments: string[];
}

interface ElectronicSignature {
  signerId: string;
  signerName: string;
  signerRole: string;
  timestamp: string;
  digitalCertificate: string;
  hash: string;
  valid: boolean;
}

interface DocumentReference {
  type: 'REGULATION' | 'STANDARD' | 'INTERNAL_POLICY' | 'EXTERNAL_SOURCE';
  title: string;
  reference: string;
  url?: string;
  version?: string;
}

// ===== TEMPLATES PRÉDÉFINIS =====
const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    id: 'ifrs17_technical_note',
    name: 'Note Technique IFRS 17',
    description: 'Documentation technique complète des calculs IFRS 17',
    type: 'TECHNICAL_NOTE',
    regulatoryFramework: 'IFRS17',
    sections: [
      {
        id: 'executive_summary',
        title: 'Résumé Exécutif',
        type: 'TEXT',
        order: 1,
        required: true,
        content: 'Synthèse des principaux résultats et impacts IFRS 17'
      },
      {
        id: 'methodology',
        title: 'Méthodologie',
        type: 'TEXT',
        order: 2,
        required: true,
        content: 'Description détaillée des méthodes actuarielles utilisées'
      },
      {
        id: 'csm_analysis',
        title: 'Analyse du CSM',
        type: 'TABLE',
        order: 3,
        required: true,
        dataSource: {
          type: 'CALCULATION_RESULT',
          source: 'ifrs17_csm',
          refreshRate: 'DAILY'
        }
      },
      {
        id: 'risk_adjustment',
        title: 'Risk Adjustment',
        type: 'KPI',
        order: 4,
        required: true,
        dataSource: {
          type: 'REGULATORY_RATIO',
          source: 'risk_adjustment_metrics',
          refreshRate: 'DAILY'
        }
      },
      {
        id: 'sensitivity_analysis',
        title: 'Analyses de Sensibilité',
        type: 'CHART',
        order: 5,
        required: true
      },
      {
        id: 'validation_controls',
        title: 'Contrôles de Validation',
        type: 'TABLE',
        order: 6,
        required: true
      },
      {
        id: 'signature_section',
        title: 'Signatures',
        type: 'SIGNATURE',
        order: 7,
        required: true
      }
    ],
    language: 'fr',
    format: 'PDF',
    automationLevel: 'FULL',
    frequency: 'QUARTERLY',
    mandatoryFields: ['calculation_date', 'business_line', 'methodologies', 'assumptions'],
    validationRules: [
      {
        field: 'csm_balance',
        rule: 'NUMERIC',
        message: 'Le solde CSM doit être numérique'
      },
      {
        field: 'confidence_level',
        rule: 'PERCENTAGE',
        message: 'Le niveau de confiance doit être un pourcentage valide'
      }
    ],
    version: '2.1',
    lastUpdated: '2024-12-15T10:00:00Z'
  },
  {
    id: 'solvency2_qrt',
    name: 'QRT Solvency II Automatisés',
    description: 'Génération automatique des templates QRT EIOPA',
    type: 'QRT_REPORT',
    regulatoryFramework: 'SOLVENCY2',
    sections: [
      {
        id: 'balance_sheet',
        title: 'S.02.01 - Bilan',
        type: 'TABLE',
        order: 1,
        required: true,
        dataSource: {
          type: 'REGULATORY_RATIO',
          source: 'solvency2_balance_sheet',
          refreshRate: 'DAILY'
        }
      },
      {
        id: 'scr_calculation',
        title: 'S.25.01 - SCR Standard Formula',
        type: 'TABLE',
        order: 2,
        required: true,
        dataSource: {
          type: 'CALCULATION_RESULT',
          source: 'scr_modules',
          refreshRate: 'DAILY'
        }
      },
      {
        id: 'mcr_calculation',
        title: 'S.28.01 - MCR',
        type: 'TABLE',
        order: 3,
        required: true
      },
      {
        id: 'own_funds',
        title: 'S.23.01 - Fonds Propres',
        type: 'TABLE',
        order: 4,
        required: true
      }
    ],
    language: 'en',
    format: 'EXCEL',
    automationLevel: 'FULL',
    frequency: 'QUARTERLY',
    mandatoryFields: ['reporting_date', 'currency', 'entity_name'],
    validationRules: [
      {
        field: 'scr_ratio',
        rule: 'PERCENTAGE',
        message: 'Le ratio SCR doit être un pourcentage'
      }
    ],
    version: '2.8.0',
    lastUpdated: '2024-12-10T09:00:00Z'
  },
  {
    id: 'acpr_filing',
    name: 'Dossier ACPR',
    description: 'Rapport annuel pour l\'Autorité de Contrôle',
    type: 'ACPR_FILING',
    regulatoryFramework: 'ACPR',
    sections: [
      {
        id: 'company_profile',
        title: 'Profil de l\'Entreprise',
        type: 'TEXT',
        order: 1,
        required: true
      },
      {
        id: 'financial_position',
        title: 'Situation Financière',
        type: 'TABLE',
        order: 2,
        required: true
      },
      {
        id: 'risk_management',
        title: 'Gestion des Risques',
        type: 'TEXT',
        order: 3,
        required: true
      },
      {
        id: 'actuarial_function',
        title: 'Fonction Actuarielle',
        type: 'TEXT',
        order: 4,
        required: true
      }
    ],
    language: 'fr',
    format: 'PDF',
    automationLevel: 'PARTIAL',
    frequency: 'ANNUAL',
    mandatoryFields: ['entity_registration', 'reporting_year', 'actuarial_certification'],
    validationRules: [],
    version: '1.5',
    lastUpdated: '2024-11-30T14:00:00Z'
  }
];

// ===== COMPOSANTS DE GÉNÉRATION =====
const TemplateSelector: React.FC<{
  templates: DocumentTemplate[];
  selectedTemplate: DocumentTemplate | null;
  onSelectTemplate: (template: DocumentTemplate) => void;
  filterCriteria: {
    framework: string;
    type: string;
    frequency: string;
  };
  onFilterChange: (criteria: any) => void;
}> = ({ templates, selectedTemplate, onSelectTemplate, filterCriteria, onFilterChange }) => {
  
  const filteredTemplates = useMemo(() => {
    return templates.filter(template => {
      if (filterCriteria.framework !== 'ALL' && template.regulatoryFramework !== filterCriteria.framework) return false;
      if (filterCriteria.type !== 'ALL' && template.type !== filterCriteria.type) return false;
      if (filterCriteria.frequency !== 'ALL' && template.frequency !== filterCriteria.frequency) return false;
      return true;
    });
  }, [templates, filterCriteria]);

  const getFrameworkIcon = (framework: string) => {
    switch (framework) {
      case 'IFRS17': return '📊';
      case 'SOLVENCY2': return '🛡️';
      case 'ACPR': return '🏛️';
      case 'EIOPA': return '🇪🇺';
      case 'PILIER3': return '📋';
      default: return '📄';
    }
  };

  const getAutomationBadge = (level: string) => {
    const configs = {
      FULL: { color: 'green', text: 'Automatique' },
      PARTIAL: { color: 'yellow', text: 'Semi-Auto' },
      MANUAL: { color: 'gray', text: 'Manuel' }
    };
    const config = configs[level as keyof typeof configs] || configs.MANUAL;
    
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-${config.color}-100 text-${config.color}-700`}>
        {config.text}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h3 className="font-medium text-gray-900 mb-3">Filtres</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cadre réglementaire
            </label>
            <select
              value={filterCriteria.framework}
              onChange={(e) => onFilterChange({...filterCriteria, framework: e.target.value})}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">Tous</option>
              <option value="IFRS17">IFRS 17</option>
              <option value="SOLVENCY2">Solvency II</option>
              <option value="ACPR">ACPR</option>
              <option value="EIOPA">EIOPA</option>
              <option value="PILIER3">Pilier 3</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type de document
            </label>
            <select
              value={filterCriteria.type}
              onChange={(e) => onFilterChange({...filterCriteria, type: e.target.value})}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">Tous</option>
              <option value="TECHNICAL_NOTE">Note technique</option>
              <option value="QRT_REPORT">Rapport QRT</option>
              <option value="ACPR_FILING">Dossier ACPR</option>
              <option value="BOARD_SUMMARY">Synthèse direction</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fréquence
            </label>
            <select
              value={filterCriteria.frequency}
              onChange={(e) => onFilterChange({...filterCriteria, frequency: e.target.value})}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">Toutes</option>
              <option value="ANNUAL">Annuelle</option>
              <option value="QUARTERLY">Trimestrielle</option>
              <option value="MONTHLY">Mensuelle</option>
              <option value="AD_HOC">Ad-hoc</option>
            </select>
          </div>
        </div>
      </div>

      {/* Liste des templates */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTemplates.map(template => (
          <div
            key={template.id}
            className={`p-4 border-2 rounded-lg cursor-pointer transition-all hover:shadow-md ${
              selectedTemplate?.id === template.id 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-200 hover:border-blue-300'
            }`}
            onClick={() => onSelectTemplate(template)}
          >
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">{getFrameworkIcon(template.regulatoryFramework)}</span>
                <h3 className="font-medium text-gray-900">{template.name}</h3>
              </div>
              {getAutomationBadge(template.automationLevel)}
            </div>
            
            <p className="text-sm text-gray-600 mb-3 line-clamp-2">
              {template.description}
            </p>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Sections:</span>
                <span className="font-medium">{template.sections.length}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Format:</span>
                <span className="font-medium">{template.format}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Fréquence:</span>
                <span className="font-medium">{template.frequency}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Version:</span>
                <span className="font-medium text-blue-600">v{template.version}</span>
              </div>
            </div>
            
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  Mis à jour: {new Date(template.lastUpdated).toLocaleDateString('fr-FR')}
                </span>
                {selectedTemplate?.id === template.id && (
                  <CheckCircle className="h-4 w-4 text-blue-600" />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {filteredTemplates.length === 0 && (
        <div className="text-center py-8">
          <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Aucun template trouvé
          </h3>
          <p className="text-gray-600">
            Aucun template ne correspond aux critères de filtrage sélectionnés.
          </p>
        </div>
      )}
    </div>
  );
};

const DataSourceMapper: React.FC<{
  template: DocumentTemplate;
  availableCalculations: any[];
  mappings: Record<string, string>;
  onMappingChange: (sectionId: string, sourceId: string) => void;
}> = ({ template, availableCalculations, mappings, onMappingChange }) => {
  
  const sectionsWithDataSources = template.sections.filter(s => s.dataSource);
  
  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Database className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <h3 className="font-medium text-blue-900">Mapping des Sources de Données</h3>
            <p className="text-sm text-blue-700 mt-1">
              Configurez les sources de données pour chaque section du document. 
              Les données seront automatiquement extraites et formatées.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {sectionsWithDataSources.map(section => (
          <div key={section.id} className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="font-medium text-gray-900">{section.title}</h4>
                <p className="text-sm text-gray-600 mt-1">
                  Type: {section.dataSource?.type} • 
                  Rafraîchissement: {section.dataSource?.refreshRate}
                </p>
              </div>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                section.required ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
              }`}>
                {section.required ? 'Obligatoire' : 'Optionnel'}
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Source de données
                </label>
                <select
                  value={mappings[section.id] || ''}
                  onChange={(e) => onMappingChange(section.id, e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Sélectionner une source</option>
                  {availableCalculations.map(calc => (
                    <option key={calc.id} value={calc.id}>
                      {calc.name} ({calc.status})
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Transformation
                </label>
                <input
                  type="text"
                  placeholder="ex: sum(ultimate), format(currency)"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                  defaultValue={section.dataSource?.transformation}
                />
              </div>
            </div>
            
            {section.dataSource?.query && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Requête personnalisée
                </label>
                <textarea
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  defaultValue={section.dataSource.query}
                  placeholder="SELECT * FROM calculations WHERE..."
                />
              </div>
            )}
          </div>
        ))}
      </div>
      
      {sectionsWithDataSources.length === 0 && (
        <div className="text-center py-8">
          <Settings className="h-8 w-8 mx-auto text-gray-400 mb-3" />
          <p className="text-gray-600">
            Ce template ne nécessite aucune configuration de source de données.
          </p>
        </div>
      )}
    </div>
  );
};

const DocumentPreview: React.FC<{
  document: GeneratedDocument;
  onEdit: (sectionId: string) => void;
  onValidate: () => void;
  onDownload: (format: string) => void;
}> = ({ document, onEdit, onValidate, onDownload }) => {
  
  const [previewSection, setPreviewSection] = useState<string | null>(null);
  
  const getStatusIcon = (status: GeneratedDocument['status']) => {
    switch (status) {
      case 'GENERATING': return <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />;
      case 'COMPLETED': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'ERROR': return <AlertTriangle className="h-4 w-4 text-red-600" />;
      case 'VALIDATED': return <Shield className="h-4 w-4 text-purple-600" />;
      case 'APPROVED': return <Award className="h-4 w-4 text-gold-600" />;
      default: return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };
  
  const getStatusText = (status: GeneratedDocument['status']) => {
    const map = {
      GENERATING: 'Génération en cours...',
      COMPLETED: 'Généré',
      ERROR: 'Erreur',
      VALIDATED: 'Validé',
      APPROVED: 'Approuvé'
    };
    return map[status] || status;
  };

  return (
    <div className="space-y-6">
      {/* En-tête du document */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              {document.title}
            </h2>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span>Template: {document.templateName}</span>
              <span>•</span>
              <span>Généré le: {new Date(document.generatedAt).toLocaleDateString('fr-FR')}</span>
              <span>•</span>
              <span>Par: {document.generatedBy}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {getStatusIcon(document.status)}
              <span className="text-sm font-medium">{getStatusText(document.status)}</span>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => onDownload('PDF')}
                className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                PDF
              </button>
              
              <button
                onClick={() => onDownload('WORD')}
                className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Word
              </button>
              
              <button
                onClick={onValidate}
                className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2"
                disabled={document.status !== 'COMPLETED'}
              >
                <FileCheck className="h-4 w-4" />
                Valider
              </button>
            </div>
          </div>
        </div>
        
        {/* Métadonnées du document */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
          <div className="bg-gray-50 p-3 rounded">
            <p className="text-gray-600">Version</p>
            <p className="font-medium">{document.metadata.version}</p>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <p className="text-gray-600">Pages</p>
            <p className="font-medium">{document.metadata.pageCount}</p>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <p className="text-gray-600">Taille</p>
            <p className="font-medium">{(document.metadata.fileSize / 1024 / 1024).toFixed(1)} MB</p>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <p className="text-gray-600">Checksum</p>
            <p className="font-medium font-mono text-xs">{document.metadata.checksum.substring(0, 8)}...</p>
          </div>
        </div>
        
        {/* Erreurs de validation */}
        {document.validationErrors.length > 0 && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-red-900">Erreurs de validation</h4>
                <ul className="mt-2 space-y-1">
                  {document.validationErrors.map((error, index) => (
                    <li key={index} className="text-sm text-red-700">• {error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Sections du document */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900">Contenu du document</h3>
        
        {document.content.sections.map((section, index) => (
          <div key={section.sectionId} className="bg-white border border-gray-200 rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h4 className="font-medium text-gray-900">
                  {index + 1}. {section.title}
                </h4>
                <p className="text-sm text-gray-600 mt-1">
                  Dernière mise à jour: {new Date(section.lastUpdated).toLocaleString('fr-FR')}
                </p>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={() => setPreviewSection(previewSection === section.sectionId ? null : section.sectionId)}
                  className="p-2 text-gray-500 hover:text-blue-600"
                  title="Aperçu"
                >
                  <Eye className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onEdit(section.sectionId)}
                  className="p-2 text-gray-500 hover:text-orange-600"
                  title="Éditer"
                >
                  <Edit className="h-4 w-4" />
                </button>
              </div>
            </div>
            
            {previewSection === section.sectionId && (
              <div className="p-6 bg-gray-50 border-t border-gray-200">
                <div 
                  className="prose max-w-none"
                  dangerouslySetInnerHTML={{ __html: section.renderedHtml }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
      
      {/* Annexes */}
      {document.content.annexes.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Annexes</h3>
          <div className="space-y-3">
            {document.content.annexes.map(annex => (
              <div key={annex.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <div>
                  <h4 className="font-medium text-gray-900">{annex.title}</h4>
                  <p className="text-sm text-gray-600">{annex.type}</p>
                </div>
                <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                  Voir →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Signatures électroniques */}
      {document.content.signatures.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Signatures électroniques</h3>
          <div className="space-y-3">
            {document.content.signatures.map(signature => (
              <div key={signature.signerId} className="flex items-center justify-between p-3 border border-gray-200 rounded">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${signature.valid ? 'bg-green-500' : 'bg-red-500'}`} />
                  <div>
                    <p className="font-medium text-gray-900">{signature.signerName}</p>
                    <p className="text-sm text-gray-600">{signature.signerRole}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">
                    {new Date(signature.timestamp).toLocaleString('fr-FR')}
                  </p>
                  <p className="text-xs text-gray-500">
                    {signature.valid ? '✓ Signature valide' : '✗ Signature invalide'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ===== COMPOSANT PRINCIPAL =====
const DocumentationGenerator: React.FC<{
  calculationIds?: string[];
  autoGenerate?: boolean;
  onDocumentGenerated?: (document: GeneratedDocument) => void;
}> = ({ calculationIds = [], autoGenerate = false, onDocumentGenerated }) => {
  
  const [activeStep, setActiveStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);
  const [dataMappings, setDataMappings] = useState<Record<string, string>>({});
  const [generatedDocument, setGeneratedDocument] = useState<GeneratedDocument | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [filterCriteria, setFilterCriteria] = useState({
    framework: 'ALL',
    type: 'ALL',
    frequency: 'ALL'
  });
  
  // Simulations de données
  const availableCalculations = [
    { id: 'calc1', name: 'Provisions Motor Q4 2024', status: 'completed' },
    { id: 'calc2', name: 'IFRS 17 Life Q4 2024', status: 'completed' },
    { id: 'calc3', name: 'Solvency II Q4 2024', status: 'in_progress' }
  ];
  
  useEffect(() => {
    if (autoGenerate && selectedTemplate && Object.keys(dataMappings).length > 0) {
      handleGenerate();
    }
  }, [autoGenerate, selectedTemplate, dataMappings]);
  
  const handleSelectTemplate = (template: DocumentTemplate) => {
    setSelectedTemplate(template);
    setActiveStep(2);
  };
  
  const handleMappingChange = (sectionId: string, sourceId: string) => {
    setDataMappings(prev => ({ ...prev, [sectionId]: sourceId }));
  };
  
  const handleGenerate = async () => {
    if (!selectedTemplate) return;
    
    setIsGenerating(true);
    setActiveStep(3);
    
    // Simulation de génération
    setTimeout(() => {
      const generatedDoc: GeneratedDocument = {
        id: `doc_${Date.now()}`,
        templateId: selectedTemplate.id,
        templateName: selectedTemplate.name,
        title: `${selectedTemplate.name} - ${new Date().toLocaleDateString('fr-FR')}`,
        status: 'COMPLETED',
        generatedAt: new Date().toISOString(),
        generatedBy: 'Jean Actuaire',
        calculationIds: Object.values(dataMappings),
        dataSnapshot: {},
        content: {
          sections: selectedTemplate.sections.map(section => ({
            sectionId: section.id,
            title: section.title,
            content: section.content || 'Contenu généré automatiquement...',
            renderedHtml: `<p>${section.content || 'Contenu généré automatiquement pour la section'} <strong>${section.title}</strong>.</p>`,
            lastUpdated: new Date().toISOString()
          })),
          annexes: [
            {
              id: 'annex1',
              title: 'Détails des calculs',
              type: 'CALCULATION_DETAIL',
              content: 'Détails techniques des méthodes utilisées',
              attachments: []
            }
          ],
          signatures: [],
          references: [
            {
              type: 'REGULATION',
              title: 'IFRS 17 Insurance Contracts',
              reference: 'IFRS 17',
              url: 'https://www.ifrs.org/issued-standards/list-of-standards/ifrs-17-insurance-contracts/'
            }
          ]
        },
        validationErrors: [],
        metadata: {
          version: '1.0',
          pageCount: Math.floor(Math.random() * 50) + 10,
          fileSize: Math.floor(Math.random() * 5000000) + 1000000,
          checksum: 'sha256:' + Math.random().toString(36).substring(2, 15),
          watermark: 'CONFIDENTIEL'
        }
      };
      
      setGeneratedDocument(generatedDoc);
      setIsGenerating(false);
      onDocumentGenerated?.(generatedDoc);
    }, 3000);
  };
  
  const handleEdit = (sectionId: string) => {
    console.log('Editing section:', sectionId);
    // Logique d'édition
  };
  
  const handleValidate = () => {
    if (generatedDocument) {
      setGeneratedDocument({
        ...generatedDocument,
        status: 'VALIDATED'
      });
    }
  };
  
  const handleDownload = (format: string) => {
    console.log('Downloading in format:', format);
    // Logique de téléchargement
  };
  
  const steps = [
    { id: 1, name: 'Sélection Template', completed: !!selectedTemplate },
    { id: 2, name: 'Configuration Données', completed: Object.keys(dataMappings).length > 0 },
    { id: 3, name: 'Génération', completed: !!generatedDocument }
  ];

  return (
    <div className="max-w-7xl mx-auto bg-white rounded-lg shadow-lg">
      {/* En-tête avec steps */}
      <div className="border-b border-gray-200">
        <div className="px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Générateur de Documentation Réglementaire
          </h1>
          
          <nav aria-label="Progress">
            <ol role="list" className="flex items-center">
              {steps.map((step, stepIdx) => (
                <li key={step.id} className={`${stepIdx !== steps.length - 1 ? 'pr-8 sm:pr-20' : ''} relative`}>
                  <div className="absolute inset-0 flex items-center" aria-hidden="true">
                    {stepIdx !== steps.length - 1 && (
                      <div className={`h-0.5 w-full ${step.completed ? 'bg-blue-600' : 'bg-gray-200'}`} />
                    )}
                  </div>
                  <button
                    onClick={() => setActiveStep(step.id)}
                    className={`relative flex h-8 w-8 items-center justify-center rounded-full border-2 ${
                      activeStep === step.id
                        ? 'border-blue-600 bg-blue-600'
                        : step.completed
                        ? 'border-blue-600 bg-blue-600'
                        : 'border-gray-300 bg-white'
                    } hover:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  >
                    {step.completed ? (
                      <CheckCircle className="h-5 w-5 text-white" />
                    ) : (
                      <span className={`h-2.5 w-2.5 rounded-full ${
                        activeStep === step.id ? 'bg-white' : 'bg-transparent'
                      }`} />
                    )}
                  </button>
                  <div className="mt-2">
                    <p className={`text-xs font-medium ${
                      activeStep === step.id || step.completed ? 'text-blue-600' : 'text-gray-500'
                    }`}>
                      {step.name}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </div>
      
      {/* Contenu */}
      <div className="p-6">
        {activeStep === 1 && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-6">
              Sélection du Template de Documentation
            </h2>
            <TemplateSelector
              templates={DOCUMENT_TEMPLATES}
              selectedTemplate={selectedTemplate}
              onSelectTemplate={handleSelectTemplate}
              filterCriteria={filterCriteria}
              onFilterChange={setFilterCriteria}
            />
          </div>
        )}
        
        {activeStep === 2 && selectedTemplate && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Configuration des Sources de Données
              </h2>
              <button
                onClick={() => setActiveStep(1)}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                ← Changer de template
              </button>
            </div>
            
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="font-medium text-blue-900 mb-2">
                Template sélectionné: {selectedTemplate.name}
              </h3>
              <p className="text-sm text-blue-700">
                {selectedTemplate.description}
              </p>
            </div>
            
            <DataSourceMapper
              template={selectedTemplate}
              availableCalculations={availableCalculations}
              mappings={dataMappings}
              onMappingChange={handleMappingChange}
            />
            
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setActiveStep(1)}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Précédent
              </button>
              <button
                onClick={handleGenerate}
                disabled={Object.keys(dataMappings).length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Zap className="h-4 w-4" />
                Générer le Document
              </button>
            </div>
          </div>
        )}
        
        {activeStep === 3 && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Document Généré
              </h2>
              <button
                onClick={() => setActiveStep(2)}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                ← Reconfigurer
              </button>
            </div>
            
            {isGenerating ? (
              <div className="text-center py-12">
                <RefreshCw className="h-12 w-12 mx-auto text-blue-600 animate-spin mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Génération en cours...
                </h3>
                <p className="text-gray-600">
                  Extraction des données et formatage du document.
                </p>
              </div>
            ) : generatedDocument ? (
              <DocumentPreview
                document={generatedDocument}
                onEdit={handleEdit}
                onValidate={handleValidate}
                onDownload={handleDownload}
              />
            ) : (
              <div className="text-center py-12">
                <AlertTriangle className="h-12 w-12 mx-auto text-red-500 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Erreur de génération
                </h3>
                <p className="text-gray-600">
                  Une erreur est survenue lors de la génération du document.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentationGenerator;