// frontend/src/pages/EnhancedRegulatoryDashboard.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield, AlertTriangle, CheckCircle, TrendingUp, TrendingDown,
  BarChart3, PieChart, Download, RefreshCw, Info, Award,
  Calculator, Target, Activity, Gauge, FileText, Eye,
  Building, Users, DollarSign, Percent, Calendar, Clock,
  Zap, TreePine, Brain, Settings, Filter, ChevronRight,
  ArrowUp, ArrowDown, Minus, Play, Pause, RotateCcw,
  Globe, AlertCircle, Star, Layers, Map, Cpu
} from 'lucide-react';
import toast from 'react-hot-toast';

// ===== TYPES =====
interface RegionInfo {
  code: string;
  name: string;
  description: string;
}

interface FrameworkInfo {
  code: string;
  name: string;
  description: string;
  features: string[];
}

interface StressScenario {
  code: string;
  name: string;
  description: string;
  impacts: Record<string, string | number>;
}

interface IFRS17Results {
  compliance_status: string;
  cohort_summary: {
    current_csm: number;
    risk_adjustment: number;
    total_liability: number;
  };
  rollforward_summary: {
    csm_release: number;
    assumption_changes: number;
    validation_checks: string[];
  };
  key_ratios: {
    csm_to_fcf_ratio: number;
    ra_to_fcf_ratio: number;
  };
}

interface Solvency2Results {
  regulatory_status: string;
  capital_ratios: {
    solvency_ratio: number;
    mcr_ratio: number;
  };
  scr_summary: {
    total_scr: number;
    basic_scr: number;
    diversification_benefit: number;
  };
  mcr_summary: {
    mcr: number;
    binding_constraint: string;
  };
}

interface ComprehensiveResults {
  triangle_name: string;
  reporting_period: string;
  region: string;
  ifrs17?: IFRS17Results;
  solvency2?: Solvency2Results;
  stress_testing?: {
    scenarios_tested: string[];
    most_impactful: string;
    max_scr_increase: string;
    capital_adequacy_maintained: boolean;
  };
  overall_compliance_status: string;
}

interface StressTestResults {
  base_calculation_id: string;
  scenarios_tested: string[];
  results_by_scenario: Record<string, {
    ifrs17_stressed: {
      csm: number;
      csm_change_pct: number;
      liability_impact: number;
    };
    solvency2_stressed: {
      total_scr: number;
      scr_change_pct: number;
      solvency_ratio: number;
      capital_adequacy: string;
    };
    overall_impact: {
      severity: string;
      regulatory_action_required: boolean;
      recovery_plan_needed: boolean;
    };
  }>;
  summary: {
    worst_case_scenario: string;
    minimum_solvency_ratio: number;
    capital_buffer_adequate: boolean;
    regulatory_intervention_risk: boolean;
    stress_testing_conclusion: string;
  };
}

// ===== CONFIG API =====
const API = (import.meta as any).env?.VITE_API_URL?.replace(/\/$/, '') || 'http://localhost:8000';

// ===== UTILITAIRES =====
const formatCurrency = (amount: number, currency = 'EUR', compact = false) => {
  if (compact && Math.abs(amount) >= 1000000) {
    return `${(amount / 1000000).toFixed(1)}M ${currency}`;
  }
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatPercentage = (value: number, decimals = 1) => {
  return `${value.toFixed(decimals)}%`;
};

const getComplianceColor = (status: string) => {
  switch (status) {
    case 'FULLY_COMPLIANT': case 'COMPLIANT': return 'text-green-700 bg-green-100 border-green-200';
    case 'PARTIAL_COMPLIANCE': case 'SCR_BREACH': return 'text-orange-700 bg-orange-100 border-orange-200';
    case 'NON_COMPLIANT': case 'MCR_BREACH': return 'text-red-700 bg-red-100 border-red-200';
    default: return 'text-gray-700 bg-gray-100 border-gray-200';
  }
};

const getComplianceIcon = (status: string) => {
  switch (status) {
    case 'FULLY_COMPLIANT': case 'COMPLIANT': return <CheckCircle className="h-5 w-5 text-green-600" />;
    case 'PARTIAL_COMPLIANCE': case 'SCR_BREACH': return <AlertTriangle className="h-5 w-5 text-orange-600" />;
    case 'NON_COMPLIANT': case 'MCR_BREACH': return <AlertCircle className="h-5 w-5 text-red-600" />;
    default: return <Info className="h-5 w-5 text-gray-600" />;
  }
};

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'LOW': return 'text-green-700 bg-green-100';
    case 'MEDIUM': return 'text-yellow-700 bg-yellow-100';
    case 'HIGH': return 'text-red-700 bg-red-100';
    default: return 'text-gray-700 bg-gray-100';
  }
};

// ===== DATA FETCHERS =====
const fetchRegions = async (): Promise<{ regions: RegionInfo[] }> => {
  const res = await fetch(`${API}/api/v1/regulatory/regions`);
  if (!res.ok) throw new Error('Erreur chargement régions');
  return res.json();
};

const fetchFrameworks = async (): Promise<{ frameworks: FrameworkInfo[] }> => {
  const res = await fetch(`${API}/api/v1/regulatory/frameworks`);
  if (!res.ok) throw new Error('Erreur chargement frameworks');
  return res.json();
};

const fetchStressScenarios = async (): Promise<{ scenarios: StressScenario[] }> => {
  const res = await fetch(`${API}/api/v1/regulatory/stress-scenarios`);
  if (!res.ok) throw new Error('Erreur chargement scénarios');
  return res.json();
};

const fetchTriangles = async () => {
  const res = await fetch(`${API}/api/v1/triangles`);
  if (!res.ok) throw new Error('Erreur chargement triangles');
  return res.json();
};

// ===== COMPOSANT PRINCIPAL =====
const EnhancedRegulatoryDashboard: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = useState<'overview' | 'ifrs17' | 'solvency2' | 'stress' | 'qrt'>('overview');
  const [selectedTriangle, setSelectedTriangle] = useState<string>('');
  const [selectedRegion, setSelectedRegion] = useState<string>('eu_core');
  const [selectedFrameworks, setSelectedFrameworks] = useState<string[]>(['ifrs17', 'solvency2']);
  const [stressTestRunning, setStressTestRunning] = useState(false);
  
  // ===== QUERIES =====
  const { data: regionsData } = useQuery({
    queryKey: ['regulatory_regions'],
    queryFn: fetchRegions,
    staleTime: 60 * 60 * 1000 // 1h
  });

  const { data: frameworksData } = useQuery({
    queryKey: ['regulatory_frameworks'],
    queryFn: fetchFrameworks,
    staleTime: 60 * 60 * 1000
  });

  const { data: scenariosData } = useQuery({
    queryKey: ['stress_scenarios'],
    queryFn: fetchStressScenarios,
    staleTime: 60 * 60 * 1000
  });

  const { data: trianglesData } = useQuery({
    queryKey: ['triangles'],
    queryFn: fetchTriangles
  });

  // ===== COMPLIANCE CALCULATION =====
  const { data: complianceResults, isLoading: loadingCompliance, refetch: refetchCompliance } = useQuery<{
    comprehensive_results: ComprehensiveResults;
  }>({
    queryKey: ['comprehensive_compliance', selectedTriangle, selectedRegion, selectedFrameworks],
    queryFn: async () => {
      if (!selectedTriangle) return null;
      
      const res = await fetch(`${API}/api/v1/regulatory/comprehensive-compliance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          triangle_id: selectedTriangle,
          compliance_frameworks: selectedFrameworks,
          reporting_period: `${new Date().getFullYear()}Q${Math.ceil(new Date().getMonth() / 3)}`,
          region: selectedRegion,
          include_stress_testing: true
        })
      });
      
      if (!res.ok) throw new Error('Erreur calcul conformité');
      return res.json();
    },
    enabled: !!selectedTriangle,
    staleTime: 5 * 60 * 1000 // 5 min
  });

  // ===== STRESS TEST MUTATION =====
  const stressTestMutation = useMutation({
    mutationFn: async (scenarios: string[]) => {
      const res = await fetch(`${API}/api/v1/regulatory/stress-testing/comprehensive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_calculation_id: selectedTriangle,
          scenarios,
          confidence_levels: [95.0, 99.0, 99.5]
        })
      });
      
      if (!res.ok) throw new Error('Erreur stress testing');
      return res.json();
    },
    onMutate: () => {
      setStressTestRunning(true);
    },
    onSettled: () => {
      setStressTestRunning(false);
    },
    onSuccess: () => {
      toast.success('Tests de stress terminés avec succès');
    },
    onError: () => {
      toast.error('Erreur lors des tests de stress');
    }
  });

  // ===== COMPUTED VALUES =====
  const regions = regionsData?.regions || [];
  const frameworks = frameworksData?.frameworks || [];
  const scenarios = scenariosData?.scenarios || [];
  const triangles = trianglesData || [];
  const results = complianceResults?.comprehensive_results;

  // Sélection automatique du premier triangle si aucun sélectionné
  useEffect(() => {
    if (!selectedTriangle && triangles.length > 0) {
      setSelectedTriangle(triangles[0].id);
    }
  }, [triangles, selectedTriangle]);

  // ===== RENDER FUNCTIONS =====
  const renderOverviewTab = () => (
    <div className="space-y-6">
      {/* Configuration */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Configuration de l'Évaluation
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Triangle d'analyse</label>
            <select
              value={selectedTriangle}
              onChange={(e) => setSelectedTriangle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Sélectionner un triangle...</option>
              {triangles.map((triangle: any) => (
                <option key={triangle.id} value={triangle.id}>
                  {triangle.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Région réglementaire</label>
            <select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {regions.map((region) => (
                <option key={region.code} value={region.code}>
                  {region.description}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Frameworks</label>
            <div className="flex flex-wrap gap-2">
              {frameworks.map((framework) => (
                <button
                  key={framework.code}
                  onClick={() => {
                    if (selectedFrameworks.includes(framework.code)) {
                      setSelectedFrameworks(prev => prev.filter(f => f !== framework.code));
                    } else {
                      setSelectedFrameworks(prev => [...prev, framework.code]);
                    }
                  }}
                  className={`px-3 py-1 text-xs rounded-full border font-medium transition-colors ${
                    selectedFrameworks.includes(framework.code)
                      ? 'bg-blue-100 text-blue-700 border-blue-200'
                      : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-blue-50'
                  }`}
                >
                  {framework.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex gap-3">
          <button
            onClick={() => refetchCompliance()}
            disabled={!selectedTriangle || loadingCompliance}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loadingCompliance ? 'animate-spin' : ''}`} />
            Recalculer
          </button>

          <button
            onClick={() => stressTestMutation.mutate(['adverse_scenario', 'severely_adverse_scenario'])}
            disabled={!selectedTriangle || stressTestMutation.isPending}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
          >
            <Zap className={`h-4 w-4 ${stressTestMutation.isPending ? 'animate-pulse' : ''}`} />
            Stress Test
          </button>
        </div>
      </div>

      {/* Statut global */}
      {results && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className={`p-6 rounded-lg border-2 ${
            results.overall_compliance_status === 'FULLY_COMPLIANT' ? 'border-green-500 bg-green-50' :
            results.overall_compliance_status === 'PARTIAL_COMPLIANCE' ? 'border-orange-500 bg-orange-50' :
            'border-red-500 bg-red-50'
          }`}>
            <div className="flex items-center gap-3 mb-3">
              {getComplianceIcon(results.overall_compliance_status)}
              <div>
                <h3 className="font-medium text-gray-900">Statut Global</h3>
                <p className="text-sm text-gray-600">{results.triangle_name}</p>
              </div>
            </div>
            <div className="text-2xl font-bold mb-2">
              {results.overall_compliance_status === 'FULLY_COMPLIANT' ? 'Conforme' :
               results.overall_compliance_status === 'PARTIAL_COMPLIANCE' ? 'Partielle' : 'Non conforme'}
            </div>
            <p className="text-sm text-gray-600">
              Période: {results.reporting_period} • Région: {results.region.toUpperCase()}
            </p>
          </div>

          {results.ifrs17 && (
            <div className="p-6 rounded-lg border border-gray-200 bg-white">
              <div className="flex items-center gap-3 mb-3">
                <Building className="h-5 w-5 text-blue-600" />
                <div>
                  <h3 className="font-medium text-gray-900">IFRS 17</h3>
                  <span className={`text-xs px-2 py-1 rounded-full ${getComplianceColor(results.ifrs17.compliance_status)}`}>
                    {results.ifrs17.compliance_status}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">CSM Courant</span>
                  <span className="font-medium">{formatCurrency(results.ifrs17.cohort_summary.current_csm, 'EUR', true)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Liability Totale</span>
                  <span className="font-medium">{formatCurrency(results.ifrs17.cohort_summary.total_liability, 'EUR', true)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Ratio CSM/FCF</span>
                  <span className="font-medium">{formatPercentage(results.ifrs17.key_ratios.csm_to_fcf_ratio)}</span>
                </div>
              </div>
            </div>
          )}

          {results.solvency2 && (
            <div className="p-6 rounded-lg border border-gray-200 bg-white">
              <div className="flex items-center gap-3 mb-3">
                <Shield className="h-5 w-5 text-purple-600" />
                <div>
                  <h3 className="font-medium text-gray-900">Solvency II</h3>
                  <span className={`text-xs px-2 py-1 rounded-full ${getComplianceColor(results.solvency2.regulatory_status)}`}>
                    {results.solvency2.regulatory_status}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Ratio SCR</span>
                  <span className={`font-medium ${results.solvency2.capital_ratios.solvency_ratio >= 100 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatPercentage(results.solvency2.capital_ratios.solvency_ratio)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">SCR Total</span>
                  <span className="font-medium">{formatCurrency(results.solvency2.scr_summary.total_scr, 'EUR', true)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Diversification</span>
                  <span className="font-medium text-green-600">
                    -{formatCurrency(Math.abs(results.solvency2.scr_summary.diversification_benefit), 'EUR', true)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stress Testing Results */}
      {stressTestMutation.data && (
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Résultats des Tests de Stress
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">
                {formatPercentage(stressTestMutation.data.stress_testing_results.summary.minimum_solvency_ratio)}
              </div>
              <p className="text-sm text-gray-600 mt-1">Ratio de solvabilité minimal</p>
            </div>

            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">
                {stressTestMutation.data.stress_testing_results.summary.worst_case_scenario}
              </div>
              <p className="text-sm text-gray-600 mt-1">Scénario le plus défavorable</p>
            </div>

            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className={`text-2xl font-bold ${
                stressTestMutation.data.stress_testing_results.summary.stress_testing_conclusion === 'PASSED' ? 'text-green-600' : 'text-red-600'
              }`}>
                {stressTestMutation.data.stress_testing_results.summary.stress_testing_conclusion}
              </div>
              <p className="text-sm text-gray-600 mt-1">Conclusion globale</p>
            </div>
          </div>

          <div className="space-y-3">
            {Object.entries(stressTestMutation.data.stress_testing_results.results_by_scenario).map(([scenario, result]: [string, any]) => (
              <div key={scenario} className="p-4 border border-gray-200 rounded-lg">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-medium text-gray-900">{scenario.replace('_', ' ').toUpperCase()}</h4>
                    <span className={`text-xs px-2 py-1 rounded-full ${getSeverityColor(result.overall_impact.severity)}`}>
                      {result.overall_impact.severity}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold ${result.solvency2_stressed.capital_adequacy === 'ADEQUATE' ? 'text-green-600' : 'text-red-600'}`}>
                      {formatPercentage(result.solvency2_stressed.solvency_ratio)}
                    </div>
                    <p className="text-xs text-gray-500">Ratio post-stress</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-gray-600">SCR Impact:</span>
                    <span className="ml-1 font-medium">+{formatPercentage(result.solvency2_stressed.scr_change_pct)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">CSM Impact:</span>
                    <span className="ml-1 font-medium">{formatPercentage(result.ifrs17_stressed.csm_change_pct)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Action Requise:</span>
                    <span className={`ml-1 font-medium ${result.overall_impact.regulatory_action_required ? 'text-red-600' : 'text-green-600'}`}>
                      {result.overall_impact.regulatory_action_required ? 'Oui' : 'Non'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Plan de Redressement:</span>
                    <span className={`ml-1 font-medium ${result.overall_impact.recovery_plan_needed ? 'text-red-600' : 'text-green-600'}`}>
                      {result.overall_impact.recovery_plan_needed ? 'Nécessaire' : 'Non requis'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderIFRS17Tab = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
          <Building className="h-5 w-5 text-blue-600" />
          Analyse IFRS 17 Détaillée
        </h3>

        {results?.ifrs17 ? (
          <div className="space-y-6">
            {/* CSM Analysis */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h4 className="font-medium text-blue-900 mb-2">Contractual Service Margin</h4>
                <div className="text-2xl font-bold text-blue-900 mb-1">
                  {formatCurrency(results.ifrs17.cohort_summary.current_csm)}
                </div>
                <div className="text-sm text-blue-700">
                  Libération: {formatCurrency(results.ifrs17.rollforward_summary.csm_release)}
                </div>
              </div>

              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <h4 className="font-medium text-green-900 mb-2">Risk Adjustment</h4>
                <div className="text-2xl font-bold text-green-900 mb-1">
                  {formatCurrency(results.ifrs17.cohort_summary.risk_adjustment)}
                </div>
                <div className="text-sm text-green-700">
                  Ratio RA/FCF: {formatPercentage(results.ifrs17.key_ratios.ra_to_fcf_ratio)}
                </div>
              </div>

              <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                <h4 className="font-medium text-purple-900 mb-2">Total Liability</h4>
                <div className="text-2xl font-bold text-purple-900 mb-1">
                  {formatCurrency(results.ifrs17.cohort_summary.total_liability)}
                </div>
                <div className="text-sm text-purple-700">
                  FCF + RA + CSM
                </div>
              </div>
            </div>

            {/* Rollforward Analysis */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-3">Roll-forward CSM</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-lg font-bold text-gray-900">
                    {formatCurrency(results.ifrs17.rollforward_summary.csm_release, 'EUR', true)}
                  </div>
                  <p className="text-sm text-gray-600">Libération Services</p>
                </div>
                <div className="text-center">
                  <div className={`text-lg font-bold ${results.ifrs17.rollforward_summary.assumption_changes >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {results.ifrs17.rollforward_summary.assumption_changes >= 0 ? '+' : ''}
                    {formatCurrency(results.ifrs17.rollforward_summary.assumption_changes, 'EUR', true)}
                  </div>
                  <p className="text-sm text-gray-600">Changements Hypothèses</p>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-blue-600">
                    {results.ifrs17.key_ratios.csm_to_fcf_ratio.toFixed(1)}%
                  </div>
                  <p className="text-sm text-gray-600">Ratio CSM/FCF</p>
                </div>
                <div className="text-center">
                  <div className={`text-lg font-bold ${results.ifrs17.rollforward_summary.validation_checks.length === 0 ? 'text-green-600' : 'text-orange-600'}`}>
                    {results.ifrs17.rollforward_summary.validation_checks.length}
                  </div>
                  <p className="text-sm text-gray-600">Alertes</p>
                </div>
              </div>
            </div>

            {/* Validation Checks */}
            {results.ifrs17.rollforward_summary.validation_checks.length > 0 && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <h4 className="font-medium text-yellow-900 mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Contrôles de Validation
                </h4>
                <ul className="space-y-1">
                  {results.ifrs17.rollforward_summary.validation_checks.map((check, index) => (
                    <li key={index} className="text-sm text-yellow-800">• {check}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <Building className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600">Sélectionnez un triangle et incluez IFRS 17 pour voir l'analyse détaillée</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderSolvency2Tab = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
          <Shield className="h-5 w-5 text-purple-600" />
          Analyse Solvency II Détaillée
        </h3>

        {results?.solvency2 ? (
          <div className="space-y-6">
            {/* Capital Ratios */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className={`p-6 rounded-lg border-2 ${
                results.solvency2.capital_ratios.solvency_ratio >= 100 ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'
              }`}>
                <div className="text-center">
                  <div className={`text-4xl font-bold mb-2 ${
                    results.solvency2.capital_ratios.solvency_ratio >= 100 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {formatPercentage(results.solvency2.capital_ratios.solvency_ratio, 1)}
                  </div>
                  <p className="text-sm font-medium text-gray-700">Ratio de Solvabilité (SCR)</p>
                  <div className="mt-3 w-full bg-gray-200 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all duration-1000 ${
                        results.solvency2.capital_ratios.solvency_ratio >= 100 ? 'bg-green-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(results.solvency2.capital_ratios.solvency_ratio, 200)}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Minimum réglementaire: 100%</p>
                </div>
              </div>

              <div className={`p-6 rounded-lg border-2 ${
                results.solvency2.capital_ratios.mcr_ratio >= 100 ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'
              }`}>
                <div className="text-center">
                  <div className={`text-4xl font-bold mb-2 ${
                    results.solvency2.capital_ratios.mcr_ratio >= 100 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {formatPercentage(results.solvency2.capital_ratios.mcr_ratio, 1)}
                  </div>
                  <p className="text-sm font-medium text-gray-700">Ratio MCR</p>
                  <div className="mt-3 w-full bg-gray-200 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all duration-1000 ${
                        results.solvency2.capital_ratios.mcr_ratio >= 100 ? 'bg-green-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(results.solvency2.capital_ratios.mcr_ratio, 200)}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Seuil d'intervention: 100%</p>
                </div>
              </div>
            </div>

            {/* SCR Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h4 className="font-medium text-blue-900 mb-2">SCR Total</h4>
                <div className="text-2xl font-bold text-blue-900 mb-1">
                  {formatCurrency(results.solvency2.scr_summary.total_scr)}
                </div>
                <div className="text-sm text-blue-700">
                  Capital de solvabilité requis
                </div>
              </div>

              <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                <h4 className="font-medium text-purple-900 mb-2">Basic SCR</h4>
                <div className="text-2xl font-bold text-purple-900 mb-1">
                  {formatCurrency(results.solvency2.scr_summary.basic_scr)}
                </div>
                <div className="text-sm text-purple-700">
                  SCR avant opérationnel
                </div>
              </div>

              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <h4 className="font-medium text-green-900 mb-2">Diversification</h4>
                <div className="text-2xl font-bold text-green-900 mb-1">
                  -{formatCurrency(Math.abs(results.solvency2.scr_summary.diversification_benefit))}
                </div>
                <div className="text-sm text-green-700">
                  Bénéfice de diversification
                </div>
              </div>
            </div>

            {/* MCR Details */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-3">Détails MCR</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-lg font-bold text-gray-900">
                    {formatCurrency(results.solvency2.mcr_summary.mcr)}
                  </div>
                  <p className="text-sm text-gray-600">MCR Final</p>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-orange-600">
                    {results.solvency2.mcr_summary.binding_constraint.replace('_', ' ').toUpperCase()}
                  </div>
                  <p className="text-sm text-gray-600">Contrainte Active</p>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-blue-600">
                    {formatPercentage((results.solvency2.mcr_summary.mcr / results.solvency2.scr_summary.total_scr) * 100)}
                  </div>
                  <p className="text-sm text-gray-600">MCR/SCR Ratio</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <Shield className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600">Sélectionnez un triangle et incluez Solvency II pour voir l'analyse détaillée</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderStressTab = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-600" />
          Tests de Stress Avancés
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {scenarios.map((scenario) => (
            <div key={scenario.code} className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow cursor-pointer"
                 onClick={() => stressTestMutation.mutate([scenario.code])}>
              <h4 className="font-medium text-gray-900 mb-2">{scenario.name}</h4>
              <p className="text-sm text-gray-600 mb-3">{scenario.description}</p>
              <div className="space-y-1">
                {Object.entries(scenario.impacts).slice(0, 2).map(([key, value]) => (
                  <div key={key} className="flex justify-between text-xs">
                    <span className="text-gray-500">{key.replace('_', ' ')}:</span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => stressTestMutation.mutate(['adverse_scenario', 'severely_adverse_scenario'])}
            disabled={stressTestMutation.isPending || !selectedTriangle}
            className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50 flex items-center gap-2"
          >
            <Play className="h-4 w-4" />
            Tests Standards
          </button>

          <button
            onClick={() => stressTestMutation.mutate(['pandemic_scenario', 'cyber_scenario'])}
            disabled={stressTestMutation.isPending || !selectedTriangle}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
          >
            <AlertTriangle className="h-4 w-4" />
            Tests Exceptionnels
          </button>

          <button
            onClick={() => stressTestMutation.mutate(scenarios.map(s => s.code))}
            disabled={stressTestMutation.isPending || !selectedTriangle}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
          >
            <Cpu className="h-4 w-4" />
            Suite Complète
          </button>
        </div>

        {stressTestRunning && (
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <div>
                <p className="font-medium text-blue-900">Tests de stress en cours...</p>
                <p className="text-sm text-blue-700">Calcul des impacts sur les modules réglementaires</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderQRTTab = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
          <FileText className="h-5 w-5 text-indigo-600" />
          Templates QRT et Reporting
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { code: 'S.02.01.02', name: 'Balance Sheet', status: 'ready' },
            { code: 'S.05.01.02', name: 'Premiums & Claims by LoB', status: 'ready' },
            { code: 'S.17.01.02', name: 'Technical Provisions', status: 'ready' },
            { code: 'S.25.01.21', name: 'SCR Standard Formula', status: 'ready' },
            { code: 'S.28.01.01', name: 'MCR Calculation', status: 'ready' },
            { code: 'S.06.02.01', name: 'List of Assets', status: 'draft' }
          ].map((template) => (
            <div key={template.code} className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="font-medium text-gray-900">{template.code}</h4>
                  <p className="text-sm text-gray-600">{template.name}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  template.status === 'ready' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {template.status === 'ready' ? 'Prêt' : 'Brouillon'}
                </span>
              </div>
              
              <div className="flex gap-2 mt-3">
                <button className="flex-1 px-3 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded flex items-center justify-center gap-1">
                  <Eye className="h-3 w-3" />
                  Aperçu
                </button>
                <button className="flex-1 px-3 py-1 text-xs bg-green-100 hover:bg-green-200 text-green-700 rounded flex items-center justify-center gap-1">
                  <Download className="h-3 w-3" />
                  Export
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-indigo-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-indigo-900">Exports Disponibles</h4>
              <p className="text-sm text-indigo-700 mt-1">
                Les templates QRT peuvent être exportés en format Excel (EIOPA), XML (XBRL), 
                ou PDF pour validation interne avant soumission aux régulateurs.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ===== RENDER PRINCIPAL =====
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg shadow-sm">
                  <Shield className="h-6 w-6 text-white" />
                </div>
                Dashboard Conformité Réglementaire
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                IFRS 17 • Solvency II • Stress Testing • QRT Templates
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 text-sm rounded-full ${
                loadingCompliance ? 'bg-blue-100 text-blue-700' :
                results ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {loadingCompliance ? 'Calcul en cours...' :
                 results ? `${results.overall_compliance_status}` : 'Prêt'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-6">
            {[
              { id: 'overview', label: 'Vue d\'ensemble', icon: Gauge },
              { id: 'ifrs17', label: 'IFRS 17', icon: Building },
              { id: 'solvency2', label: 'Solvency II', icon: Shield },
              { id: 'stress', label: 'Stress Testing', icon: Zap },
              { id: 'qrt', label: 'Templates QRT', icon: FileText }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedTab(tab.id as any)}
                className={`flex items-center gap-2 px-3 py-4 text-sm font-medium border-b-2 transition-colors ${
                  selectedTab === tab.id
                    ? 'border-purple-500 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Contenu */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {selectedTab === 'overview' && renderOverviewTab()}
        {selectedTab === 'ifrs17' && renderIFRS17Tab()}
        {selectedTab === 'solvency2' && renderSolvency2Tab()}
        {selectedTab === 'stress' && renderStressTab()}
        {selectedTab === 'qrt' && renderQRTTab()}
      </div>
    </div>
  );
};

export default EnhancedRegulatoryDashboard;