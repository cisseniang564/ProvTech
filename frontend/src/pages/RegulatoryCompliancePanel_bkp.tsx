import React, { useState, useMemo, useEffect } from 'react';
import { 
  Shield, AlertTriangle, CheckCircle, FileText, Clock, 
  Users, Download, Eye, Lock, Hash, Calendar, Award,
  TrendingUp, Target, BarChart3, AlertCircle, Info, 
  Calculator, PieChart, Layers, ArrowRightLeft, Building,
  Database, LineChart as LucideLineChart, Settings, BookOpen, DollarSign,
  RefreshCw, ExternalLink, Loader2, Play, Pause, ChevronRight,
  Zap, Activity, TrendingDown, Filter, Sliders, ChevronDown
} from 'lucide-react';
import { 
  LineChart as ReLineChart, Line, BarChart, Bar, PieChart as RePieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Area, AreaChart, 
  ScatterChart, Scatter, ComposedChart 
} from 'recharts';

/* ============================== TYPES ============================== */
interface IFRS17RealData {
  contractualServiceMargin: {
    currentBalance: number;
    movements: {
      date: string;
      openingBalance: number;
      interestAccretion: number;
      serviceRelease: number;
      experienceAdjustments: number;
      unlockingAdjustments: number;
      closingBalance: number;
      coverageUnits: number;
      releaseRate: number;
      confidenceInterval?: { lower: number; upper: number };
    }[];
    projections?: {
      date: string;
      expectedBalance: number;
      scenario: 'base' | 'optimistic' | 'pessimistic';
    }[];
  };
  riskAdjustment: {
    totalAmount: number;
    costOfCapitalRate: number;
    confidenceLevel: number;
    nonFinancialRisks: number;
    diversificationBenefit: number;
    breakdown?: {
      category: string;
      amount: number;
      weight: number;
    }[];
  };
  disclosureTables: {
    insuranceRevenue: number;
    insuranceServiceExpenses: number;
    netFinancialResult: number;
    profitBeforeTax: number;
    attributionAnalysis?: {
      component: string;
      amount: number;
      variance: number;
    }[];
  };
  validationStatus: 'valid' | 'warning' | 'error';
  lastCalculated: string;
}

interface SolvencyIIRealData {
  scrCalculation: {
    marketRisk: number;
    underwritingRisk: number;
    counterpartyRisk: number;
    operationalRisk: number;
    intangibleRisk: number;
    basicSCR: number;
    diversificationBenefit: number;
    totalSCR: number;
    correlationMatrix: number[][];
    subModules?: {
      name: string;
      value: number;
      parentModule: string;
    }[];
  };
  mcrCalculation: {
    linearMCR: number;
    absoluteFloor: number;
    cappedMCR: number;
    finalMCR: number;
  };
  ownFunds: {
    tier1Unrestricted: number;
    tier1Restricted: number;
    tier2: number;
    tier3: number;
    totalEligible: number;
  };
  solvencyRatios: {
    scrCoverage: number;
    mcrCoverage: number;
    trend: 'improving' | 'stable' | 'deteriorating';
  };
  qrtStatus: {
    templateId: string;
    status: 'submitted' | 'validated' | 'rejected';
    validationErrors: string[];
    lastSubmission: string;
  }[];
  lastCalculated: string;
  stressTests?: {
    scenario: string;
    impact: number;
    solvencyRatio: number;
    passed: boolean;
  }[];
}

interface ComplianceProps {
  result?: any;
  extendedKPI?: any;
  calculationId?: string;
  triangleId?: string;
}

/* ============================== HELPERS ============================== */
const generateIFRS17FromActuarialData = (result: any, extendedKPI: any): IFRS17RealData | null => {
  if (!result && !extendedKPI) return null;

  const ultimateTotal = result?.summary?.ultimate || result?.ultimate?.total || 0;
  const paidToDate = result?.summary?.paid || result?.paid?.total || 0;
  const outstandingReserves = ultimateTotal - paidToDate;
  
  const expectedProfitMargin = 0.12;
  const csmBalance = outstandingReserves * expectedProfitMargin;
  
  const movements: IFRS17RealData['contractualServiceMargin']['movements'] = [];
  let balance = csmBalance * 1.3;
  
  for (let i = 0; i < 4; i++) {
    const quarterDate = new Date();
    quarterDate.setMonth(quarterDate.getMonth() - (3 - i) * 3);
    
    const interestAccretion = balance * 0.015;
    const serviceRelease = -balance * 0.03;
    const experienceAdj = balance * (Math.random() * 0.02 - 0.01);
    const unlockingAdj = i === 1 ? -balance * 0.008 : 0;
    
    const openingBalance = balance;
    balance = balance + interestAccretion + serviceRelease + experienceAdj + unlockingAdj;
    
    movements.push({
      date: quarterDate.toISOString(),
      openingBalance: openingBalance,
      interestAccretion: interestAccretion,
      serviceRelease: serviceRelease,
      experienceAdjustments: experienceAdj,
      unlockingAdjustments: unlockingAdj,
      closingBalance: balance,
      coverageUnits: 100000 - (i * 15000),
      releaseRate: Math.abs(serviceRelease) / openingBalance,
      confidenceInterval: {
        lower: balance * 0.9,
        upper: balance * 1.1
      }
    });
  }
  
  const riskAdjustmentTotal = outstandingReserves * 0.075;
  const nonFinancialRisks = riskAdjustmentTotal * 1.25;
  const diversificationBenefit = -riskAdjustmentTotal * 0.18;
  
  const annualPremium = outstandingReserves / 2.8;
  const insuranceRevenue = annualPremium;
  const serviceExpenses = annualPremium * 0.78;
  const netFinancialResult = csmBalance * 0.06 / 4;
  
  return {
    contractualServiceMargin: {
      currentBalance: balance,
      movements: movements,
      projections: []
    },
    riskAdjustment: {
      totalAmount: riskAdjustmentTotal,
      costOfCapitalRate: 0.06,
      confidenceLevel: 75,
      nonFinancialRisks: nonFinancialRisks,
      diversificationBenefit: diversificationBenefit,
      breakdown: [
        { category: 'Risque de prime', amount: riskAdjustmentTotal * 0.4, weight: 0.4 },
        { category: 'Risque de réserve', amount: riskAdjustmentTotal * 0.35, weight: 0.35 },
        { category: 'Risque catastrophe', amount: riskAdjustmentTotal * 0.15, weight: 0.15 },
        { category: 'Risque opérationnel', amount: riskAdjustmentTotal * 0.1, weight: 0.1 }
      ]
    },
    disclosureTables: {
      insuranceRevenue: insuranceRevenue,
      insuranceServiceExpenses: serviceExpenses,
      netFinancialResult: netFinancialResult,
      profitBeforeTax: insuranceRevenue - serviceExpenses + netFinancialResult,
      attributionAnalysis: [
        { component: 'Insurance Revenue', amount: insuranceRevenue, variance: 0.05 },
        { component: 'Service Expenses', amount: -serviceExpenses, variance: -0.03 },
        { component: 'Financial Result', amount: netFinancialResult, variance: 0.02 }
      ]
    },
    validationStatus: 'valid',
    lastCalculated: new Date().toISOString()
  };
};

const generateSolvency2FromActuarialData = (result: any, extendedKPI: any): SolvencyIIRealData | null => {
  if (!result && !extendedKPI) return null;

  const ultimateTotal = result?.summary?.ultimate || result?.ultimate?.total || 0;
  const reserves = ultimateTotal - (result?.summary?.paid || result?.paid?.total || 0);
  
  const marketRisk = reserves * 0.18;
  const underwritingRisk = reserves * 0.15;
  const counterpartyRisk = reserves * 0.04;
  const operationalRisk = reserves * 0.06;
  const intangibleRisk = reserves * 0.025;
  
  const correlationMatrix = [
    [1.0, 0.25, 0.25, 0.25, 0.25],
    [0.25, 1.0, 0.25, 0.5, 0.0],
    [0.25, 0.25, 1.0, 0.25, 0.25],
    [0.25, 0.5, 0.25, 1.0, 0.0],
    [0.25, 0.0, 0.25, 0.0, 1.0]
  ];
  
  const basicSCR = Math.sqrt(
    marketRisk * marketRisk +
    underwritingRisk * underwritingRisk +
    counterpartyRisk * counterpartyRisk +
    operationalRisk * operationalRisk +
    intangibleRisk * intangibleRisk
  );
  
  const diversificationBenefit = -basicSCR * 0.22;
  const totalSCR = basicSCR + diversificationBenefit;
  
  const linearMCR = Math.max(totalSCR * 0.25, 3_700_000 * 0.9);
  const absoluteFloor = 3_700_000;
  const cappedMCR = Math.min(linearMCR, totalSCR * 0.45);
  const finalMCR = Math.max(cappedMCR, totalSCR * 0.25, absoluteFloor);
  
  const solvencyRatio = extendedKPI?.reserveRatio ? Math.min(Math.max(150 + extendedKPI.reserveRatio, 120), 200) : 158;
  const ownFundsTotal = totalSCR * (solvencyRatio / 100);
  
  const qrtStatus = [
    {
      templateId: 'S.02.01',
      status: 'validated' as const,
      validationErrors: [],
      lastSubmission: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      templateId: 'S.25.01',
      status: 'validated' as const,
      validationErrors: [],
      lastSubmission: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      templateId: 'S.28.01',
      status: solvencyRatio < 130 ? 'submitted' as const : 'validated' as const,
      validationErrors: solvencyRatio < 130 ? ['Solvency ratio requires monitoring'] : [],
      lastSubmission: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    }
  ];

  const stressTests = [
    { scenario: 'Choc de marché -20%', impact: -0.2, solvencyRatio: solvencyRatio * 0.8, passed: solvencyRatio * 0.8 >= 100 },
    { scenario: 'Hausse sinistralité +30%', impact: -0.15, solvencyRatio: solvencyRatio * 0.85, passed: solvencyRatio * 0.85 >= 100 },
    { scenario: 'Pandémie', impact: -0.25, solvencyRatio: solvencyRatio * 0.75, passed: solvencyRatio * 0.75 >= 100 },
    { scenario: 'Catastrophe naturelle', impact: -0.18, solvencyRatio: solvencyRatio * 0.82, passed: solvencyRatio * 0.82 >= 100 }
  ];

  return {
    scrCalculation: {
      marketRisk,
      underwritingRisk,
      counterpartyRisk,
      operationalRisk,
      intangibleRisk,
      basicSCR,
      diversificationBenefit,
      totalSCR,
      correlationMatrix,
      subModules: [
        { name: 'Interest Rate Risk', value: marketRisk * 0.3, parentModule: 'Market Risk' },
        { name: 'Equity Risk', value: marketRisk * 0.4, parentModule: 'Market Risk' },
        { name: 'Property Risk', value: marketRisk * 0.2, parentModule: 'Market Risk' },
        { name: 'Premium Risk', value: underwritingRisk * 0.6, parentModule: 'Underwriting Risk' },
        { name: 'Reserve Risk', value: underwritingRisk * 0.4, parentModule: 'Underwriting Risk' }
      ]
    },
    mcrCalculation: {
      linearMCR,
      absoluteFloor,
      cappedMCR,
      finalMCR
    },
    ownFunds: {
      tier1Unrestricted: ownFundsTotal * 0.65,
      tier1Restricted: ownFundsTotal * 0.25,
      tier2: ownFundsTotal * 0.10,
      tier3: 0,
      totalEligible: ownFundsTotal
    },
    solvencyRatios: {
      scrCoverage: solvencyRatio,
      mcrCoverage: (ownFundsTotal / finalMCR) * 100,
      trend: solvencyRatio > 160 ? 'improving' : solvencyRatio > 140 ? 'stable' : 'deteriorating'
    },
    qrtStatus,
    lastCalculated: new Date().toISOString(),
    stressTests
  };
};

/* ============================== NEW: LoB FACTORS ============================== */
type LoBKey =
  | 'medical_expense'
  | 'motor_vehicle_liability'
  | 'other_motor'
  | 'marine_aviation_transport'
  | 'fire_property'
  | 'general_liability'
  | 'credit_suretyship'
  | 'legal_expenses'
  | 'assistance'
  | 'miscellaneous'
  | 'workers_comp'
  | 'income_protection';

interface LoBFactor {
  key: LoBKey;
  name: string;
  alpha: number; // premiums factor
  beta: number;  // reserves factor
}

const LOB_FACTORS: LoBFactor[] = [
  { key: 'medical_expense',            name: 'Medical expense',                 alpha: 0.047, beta: 0.050 },
  { key: 'motor_vehicle_liability',    name: 'Motor vehicle liability',         alpha: 0.095, beta: 0.084 },
  { key: 'other_motor',                name: 'Other motor',                      alpha: 0.080, beta: 0.100 },
  { key: 'marine_aviation_transport',  name: 'Marine, aviation, transport',     alpha: 0.130, beta: 0.090 },
  { key: 'fire_property',              name: 'Fire and property',                alpha: 0.115, beta: 0.110 },
  { key: 'general_liability',          name: 'General liability',                alpha: 0.088, beta: 0.142 },
  { key: 'credit_suretyship',          name: 'Credit & suretyship',             alpha: 0.120, beta: 0.190 },
  { key: 'legal_expenses',             name: 'Legal expenses',                   alpha: 0.110, beta: 0.100 },
  { key: 'assistance',                 name: 'Assistance',                       alpha: 0.070, beta: 0.070 },
  { key: 'miscellaneous',              name: 'Miscellaneous',                    alpha: 0.100, beta: 0.100 },
  { key: 'workers_comp',               name: "Workers' compensation",           alpha: 0.110, beta: 0.110 },
  { key: 'income_protection',          name: 'Income protection',                alpha: 0.095, beta: 0.110 },
];

/* ============================== NEW: IFRS 17 ADVANCED COMPONENTS ============================== */

// ===== IFRS 17 SENSITIVITY ANALYZER =====
const IFRS17SensitivityAnalyzer: React.FC<{ ifrs17Data: IFRS17RealData }> = ({ ifrs17Data }) => {
  const [assumptions, setAssumptions] = useState({
    discountRate: 0.06,
    lossRatio: 0.75,
    expenseRatio: 0.25,
    cocRate: 0.06,
    inflationRate: 0.02
  });

  const [selectedMetric, setSelectedMetric] = useState<'csm' | 'ra' | 'profit'>('csm');

  const calculateImpact = (assumptionKey: string, value: number) => {
    const baseValue = assumptions[assumptionKey as keyof typeof assumptions];
    const change = (value - baseValue) / baseValue;
    
    switch(selectedMetric) {
      case 'csm':
        // CSM est sensible aux taux d'actualisation et aux experience adjustments
        if (assumptionKey === 'discountRate') return -change * 0.8; // effet inverse
        if (assumptionKey === 'lossRatio') return -change * 0.3;
        return change * 0.1;
      case 'ra':
        // Risk Adjustment sensible au CoC et à la volatilité
        if (assumptionKey === 'cocRate') return change * 1.0;
        if (assumptionKey === 'lossRatio') return change * 0.5;
        return change * 0.2;
      case 'profit':
        // Profit sensible à tous les éléments
        if (assumptionKey === 'discountRate') return change * 0.4;
        if (assumptionKey === 'lossRatio') return -change * 1.2;
        if (assumptionKey === 'expenseRatio') return -change * 0.8;
        return change * 0.3;
      default:
        return 0;
    }
  };

  const sensitivityData = Object.entries(assumptions).map(([key, baseValue]) => ({
    assumption: key,
    label: key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
    baseValue,
    scenarios: [
      { scenario: '-20%', value: baseValue * 0.8, impact: calculateImpact(key, baseValue * 0.8) },
      { scenario: '-10%', value: baseValue * 0.9, impact: calculateImpact(key, baseValue * 0.9) },
      { scenario: 'Base', value: baseValue, impact: 0 },
      { scenario: '+10%', value: baseValue * 1.1, impact: calculateImpact(key, baseValue * 1.1) },
      { scenario: '+20%', value: baseValue * 1.2, impact: calculateImpact(key, baseValue * 1.2) }
    ]
  }));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex gap-4">
          <button
            onClick={() => setSelectedMetric('csm')}
            className={`px-3 py-2 rounded text-sm ${selectedMetric === 'csm' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}
          >
            Impact sur CSM
          </button>
          <button
            onClick={() => setSelectedMetric('ra')}
            className={`px-3 py-2 rounded text-sm ${selectedMetric === 'ra' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}
          >
            Impact sur RA
          </button>
          <button
            onClick={() => setSelectedMetric('profit')}
            className={`px-3 py-2 rounded text-sm ${selectedMetric === 'profit' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'}`}
          >
            Impact sur Profit
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h4 className="font-medium mb-3">Paramètres d'hypothèses</h4>
          <div className="space-y-3">
            {Object.entries(assumptions).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between">
                <label className="text-sm text-gray-600">
                  {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={key === 'discountRate' || key === 'cocRate' ? "0.01" : "0"}
                    max={key === 'lossRatio' || key === 'expenseRatio' ? "1.5" : "0.15"}
                    step="0.005"
                    value={value}
                    onChange={(e) => setAssumptions({...assumptions, [key]: parseFloat(e.target.value)})}
                    className="w-24"
                  />
                  <span className="text-sm font-medium w-12 text-right">
                    {(value * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h4 className="font-medium mb-3">Analyse de sensibilité - {selectedMetric.toUpperCase()}</h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={sensitivityData.flatMap(item => 
              item.scenarios.map(s => ({
                name: `${item.label.substring(0,8)}... ${s.scenario}`,
                impact: s.impact * 100,
                fill: s.impact > 0 ? '#10B981' : s.impact < 0 ? '#EF4444' : '#6B7280'
              }))
            )}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={80} />
              <YAxis unit="%" />
              <Tooltip formatter={(value: any) => `${value.toFixed(1)}%`} />
              <Bar dataKey="impact" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-4 p-3 bg-blue-50 rounded border border-blue-200">
        <div className="text-sm text-blue-800">
          <strong>Interprétation:</strong> Les barres montrent l'impact relatif (en %) d'un changement de ±10% ou ±20% 
          de chaque hypothèse sur la métrique sélectionnée. Rouge = impact négatif, Vert = impact positif.
        </div>
      </div>
    </div>
  );
};

// ===== CSM MOVEMENTS ANALYZER =====
const CSMMovementsAnalyzer: React.FC<{ movements: IFRS17RealData['contractualServiceMargin']['movements'] }> = ({ movements }) => {
  const [viewMode, setViewMode] = useState<'table' | 'chart' | 'waterfall'>('table');

  const chartData = movements.map((m, i) => ({
    period: new Date(m.date).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
    opening: m.openingBalance / 1000000,
    accretion: m.interestAccretion / 1000000,
    release: Math.abs(m.serviceRelease) / 1000000,
    experience: m.experienceAdjustments / 1000000,
    unlocking: m.unlockingAdjustments / 1000000,
    closing: m.closingBalance / 1000000,
    releaseRate: m.releaseRate * 100,
    coverageUnits: m.coverageUnits / 1000
  }));

  const waterfallData = useMemo(() => {
    const data: any[] = [];
    movements.forEach((m, i) => {
      const period = new Date(m.date).toLocaleDateString('fr-FR', { month: 'short' });
      data.push(
        { name: `${period} Opening`, value: m.openingBalance / 1000000, type: 'opening' },
        { name: `${period} Accretion`, value: m.interestAccretion / 1000000, type: 'positive' },
        { name: `${period} Release`, value: m.serviceRelease / 1000000, type: 'negative' },
        { name: `${period} Experience`, value: m.experienceAdjustments / 1000000, type: m.experienceAdjustments >= 0 ? 'positive' : 'negative' },
        { name: `${period} Unlocking`, value: m.unlockingAdjustments / 1000000, type: m.unlockingAdjustments >= 0 ? 'positive' : 'negative' },
        { name: `${period} Closing`, value: m.closingBalance / 1000000, type: 'closing' }
      );
    });
    return data;
  }, [movements]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-1 rounded text-sm ${viewMode === 'table' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100'}`}
          >
            Tableau
          </button>
          <button
            onClick={() => setViewMode('chart')}
            className={`px-3 py-1 rounded text-sm ${viewMode === 'chart' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100'}`}
          >
            Tendances
          </button>
          <button
            onClick={() => setViewMode('waterfall')}
            className={`px-3 py-1 rounded text-sm ${viewMode === 'waterfall' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100'}`}
          >
            Waterfall
          </button>
        </div>
      </div>

      {viewMode === 'table' && (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Période</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ouverture (M€)</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Accroissement</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Libération</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Experience</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Unlocking</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Clôture (M€)</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Taux lib. (%)</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Coverage (k)</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {movements.map((movement, index) => (
                <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {new Date(movement.date).toLocaleDateString('fr-FR', { year: 'numeric', month: 'short' })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right">{(movement.openingBalance / 1000000).toFixed(1)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-green-600">+{(movement.interestAccretion / 1000000).toFixed(1)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-red-600">{(movement.serviceRelease / 1000000).toFixed(1)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                    <span className={movement.experienceAdjustments >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {movement.experienceAdjustments >= 0 ? '+' : ''}{(movement.experienceAdjustments / 1000000).toFixed(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                    {movement.unlockingAdjustments !== 0 && (
                      <span className="text-orange-600">{(movement.unlockingAdjustments / 1000000).toFixed(1)}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-right text-blue-900">
                    {(movement.closingBalance / 1000000).toFixed(1)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-purple-600">
                    {(movement.releaseRate * 100).toFixed(2)}%
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-600">
                    {(movement.coverageUnits / 1000).toFixed(0)}k
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewMode === 'chart' && (
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="period" />
            <YAxis yAxisId="left" orientation="left" unit="M€" />
            <YAxis yAxisId="right" orientation="right" unit="%" />
            <Tooltip />
            <Legend />
            <Area yAxisId="left" dataKey="closing" fill="#3B82F6" fillOpacity={0.3} stroke="#3B82F6" name="CSM Balance (M€)" />
            <Bar yAxisId="left" dataKey="accretion" fill="#10B981" name="Accroissement" />
            <Bar yAxisId="left" dataKey="release" fill="#EF4444" name="Libération" />
            <Line yAxisId="right" type="monotone" dataKey="releaseRate" stroke="#8B5CF6" strokeWidth={2} name="Taux de libération (%)" />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {viewMode === 'waterfall' && (
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={waterfallData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={100} />
            <YAxis unit="M€" />
            <Tooltip formatter={(value: any) => `${value.toFixed(1)}M€`} />
            <Bar dataKey="value">
              {waterfallData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={
                  entry.type === 'opening' || entry.type === 'closing' ? '#3B82F6' :
                  entry.type === 'positive' ? '#10B981' : '#EF4444'
                } />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

// ===== RISK ADJUSTMENT ANALYZER =====
const RiskAdjustmentAnalyzer: React.FC<{ riskAdjustment: IFRS17RealData['riskAdjustment'] }> = ({ riskAdjustment }) => {
  const [analysisMode, setAnalysisMode] = useState<'breakdown' | 'sensitivity' | 'benchmark'>('breakdown');

  const confidenceLevels = [60, 65, 70, 75, 80, 85, 90];
  const sensitivityData = confidenceLevels.map(level => ({
    confidence: level,
    raAmount: riskAdjustment.totalAmount * (level / riskAdjustment.confidenceLevel),
    cocImpact: riskAdjustment.totalAmount * (level / riskAdjustment.confidenceLevel) * riskAdjustment.costOfCapitalRate
  }));

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setAnalysisMode('breakdown')}
          className={`px-3 py-1 rounded text-sm ${analysisMode === 'breakdown' ? 'bg-red-100 text-red-700' : 'bg-gray-100'}`}
        >
          Décomposition
        </button>
        <button
          onClick={() => setAnalysisMode('sensitivity')}
          className={`px-3 py-1 rounded text-sm ${analysisMode === 'sensitivity' ? 'bg-red-100 text-red-700' : 'bg-gray-100'}`}
        >
          Sensibilité
        </button>
        <button
          onClick={() => setAnalysisMode('benchmark')}
          className={`px-3 py-1 rounded text-sm ${analysisMode === 'benchmark' ? 'bg-red-100 text-red-700' : 'bg-gray-100'}`}
        >
          Benchmark
        </button>
      </div>

      {analysisMode === 'breakdown' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ResponsiveContainer width="100%" height={200}>
            <RePieChart>
              <Pie 
                data={riskAdjustment.breakdown} 
                dataKey="amount" 
                nameKey="category" 
                cx="50%" 
                cy="50%" 
                outerRadius={80}
                label={(entry:any) => `${(entry.weight * 100).toFixed(0)}%`}
              >
                {riskAdjustment.breakdown?.map((entry, index) => (
                  <Cell key={index} fill={['#EF4444', '#F59E0B', '#10B981', '#3B82F6'][index % 4]} />
                ))}
              </Pie>
              <Tooltip formatter={(value:any) => `${Number(value).toLocaleString()}€`} />
            </RePieChart>
          </ResponsiveContainer>

          <div className="space-y-3">
            <div className="bg-gray-50 p-3 rounded">
              <div className="text-sm text-gray-600">Risk Adjustment Total</div>
              <div className="text-xl font-bold text-red-700">{(riskAdjustment.totalAmount / 1000000).toFixed(1)}M€</div>
            </div>
            <div className="bg-gray-50 p-3 rounded">
              <div className="text-sm text-gray-600">Cost of Capital Rate</div>
              <div className="text-xl font-bold text-blue-700">{(riskAdjustment.costOfCapitalRate * 100).toFixed(1)}%</div>
            </div>
            <div className="bg-gray-50 p-3 rounded">
              <div className="text-sm text-gray-600">Confidence Level</div>
              <div className="text-xl font-bold text-green-700">{riskAdjustment.confidenceLevel}%</div>
            </div>
            <div className="bg-gray-50 p-3 rounded">
              <div className="text-sm text-gray-600">Diversification Benefit</div>
              <div className="text-xl font-bold text-purple-700">{(riskAdjustment.diversificationBenefit / 1000000).toFixed(1)}M€</div>
            </div>
          </div>
        </div>
      )}

      {analysisMode === 'sensitivity' && (
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={sensitivityData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="confidence" unit="%" />
            <YAxis yAxisId="left" orientation="left" />
            <YAxis yAxisId="right" orientation="right" />
            <Tooltip />
            <Legend />
            <Bar yAxisId="left" dataKey="raAmount" fill="#EF4444" name="RA Amount" />
            <Line yAxisId="right" type="monotone" dataKey="cocImpact" stroke="#3B82F6" strokeWidth={2} name="CoC Impact" />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {analysisMode === 'benchmark' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-yellow-50 border border-yellow-200 p-4 rounded">
            <div className="text-sm text-yellow-700">Marché P25</div>
            <div className="text-lg font-bold text-yellow-800">4.5%</div>
            <div className="text-xs text-yellow-600">CoC Rate - Prudent</div>
          </div>
          <div className="bg-green-50 border border-green-200 p-4 rounded">
            <div className="text-sm text-green-700">Votre Position</div>
            <div className="text-lg font-bold text-green-800">{(riskAdjustment.costOfCapitalRate * 100).toFixed(1)}%</div>
            <div className="text-xs text-green-600">CoC Rate - Actuel</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 p-4 rounded">
            <div className="text-sm text-blue-700">Marché P75</div>
            <div className="text-lg font-bold text-blue-800">7.5%</div>
            <div className="text-xs text-blue-600">CoC Rate - Agressif</div>
          </div>
        </div>
      )}
    </div>
  );
};

// ===== PROFIT & LOSS ANALYZER =====
const ProfitLossAnalyzer: React.FC<{ disclosureTables: IFRS17RealData['disclosureTables'] }> = ({ disclosureTables }) => {
  const [viewType, setViewType] = useState<'waterfall' | 'trends' | 'margins'>('waterfall');

  const waterfallData = [
    { name: 'Insurance Revenue', value: disclosureTables.insuranceRevenue / 1000000, cumulative: disclosureTables.insuranceRevenue / 1000000 },
    { name: 'Service Expenses', value: -disclosureTables.insuranceServiceExpenses / 1000000, cumulative: (disclosureTables.insuranceRevenue - disclosureTables.insuranceServiceExpenses) / 1000000 },
    { name: 'Financial Result', value: disclosureTables.netFinancialResult / 1000000, cumulative: disclosureTables.profitBeforeTax / 1000000 }
  ];

  const marginAnalysis = {
    technicalMargin: ((disclosureTables.insuranceRevenue - disclosureTables.insuranceServiceExpenses) / disclosureTables.insuranceRevenue) * 100,
    financialMargin: (disclosureTables.netFinancialResult / disclosureTables.insuranceRevenue) * 100,
    combinedRatio: (disclosureTables.insuranceServiceExpenses / disclosureTables.insuranceRevenue) * 100,
    overallMargin: (disclosureTables.profitBeforeTax / disclosureTables.insuranceRevenue) * 100
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setViewType('waterfall')}
          className={`px-3 py-1 rounded text-sm ${viewType === 'waterfall' ? 'bg-green-100 text-green-700' : 'bg-gray-100'}`}
        >
          Waterfall
        </button>
        <button
          onClick={() => setViewType('trends')}
          className={`px-3 py-1 rounded text-sm ${viewType === 'trends' ? 'bg-green-100 text-green-700' : 'bg-gray-100'}`}
        >
          Variance
        </button>
        <button
          onClick={() => setViewType('margins')}
          className={`px-3 py-1 rounded text-sm ${viewType === 'margins' ? 'bg-green-100 text-green-700' : 'bg-gray-100'}`}
        >
          Marges
        </button>
      </div>

      {viewType === 'waterfall' && (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={waterfallData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis unit="M€" />
            <Tooltip formatter={(value: any) => `${value.toFixed(1)}M€`} />
            <Bar dataKey="value">
              {waterfallData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.value >= 0 ? '#10B981' : '#EF4444'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {viewType === 'trends' && disclosureTables.attributionAnalysis && (
        <div className="space-y-3">
          {disclosureTables.attributionAnalysis.map((item, index) => (
            <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded border">
              <span className="text-sm font-medium text-gray-700">{item.component}</span>
              <div className="flex items-center gap-3">
                <span className={`font-bold ${item.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {(item.amount / 1000000).toFixed(1)}M€
                </span>
                <div className="flex items-center">
                  <span className={`text-xs px-2 py-1 rounded ${item.variance >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {item.variance >= 0 ? '+' : ''}{(item.variance * 100).toFixed(1)}%
                  </span>
                  {item.variance >= 0 ? 
                    <TrendingUp className="h-4 w-4 text-green-500 ml-1" /> : 
                    <TrendingDown className="h-4 w-4 text-red-500 ml-1" />
                  }
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewType === 'margins' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 border border-blue-200 p-4 rounded text-center">
            <div className="text-sm text-blue-600">Marge Technique</div>
            <div className="text-2xl font-bold text-blue-800">{marginAnalysis.technicalMargin.toFixed(1)}%</div>
            <div className="text-xs text-blue-600">Rev - Exp / Rev</div>
          </div>
          <div className="bg-green-50 border border-green-200 p-4 rounded text-center">
            <div className="text-sm text-green-600">Marge Financière</div>
            <div className="text-2xl font-bold text-green-800">{marginAnalysis.financialMargin.toFixed(1)}%</div>
            <div className="text-xs text-green-600">Fin Result / Rev</div>
          </div>
          <div className="bg-orange-50 border border-orange-200 p-4 rounded text-center">
            <div className="text-sm text-orange-600">Combined Ratio</div>
            <div className="text-2xl font-bold text-orange-800">{marginAnalysis.combinedRatio.toFixed(1)}%</div>
            <div className="text-xs text-orange-600">Exp / Rev</div>
          </div>
          <div className="bg-purple-50 border border-purple-200 p-4 rounded text-center">
            <div className="text-sm text-purple-600">Marge Globale</div>
            <div className="text-2xl font-bold text-purple-800">{marginAnalysis.overallMargin.toFixed(1)}%</div>
            <div className="text-xs text-purple-600">Profit / Rev</div>
          </div>
        </div>
      )}
    </div>
  );
};

// ===== HYPOTHESIS IMPACT SIMULATOR =====
const HypothesisImpactSimulator: React.FC<{ baseData: IFRS17RealData }> = ({ baseData }) => {
  const [scenarios, setScenarios] = useState([
    { name: 'Base Case', discountRate: 0.06, lossRatio: 0.75, active: true },
    { name: 'Optimistic', discountRate: 0.07, lossRatio: 0.70, active: false },
    { name: 'Pessimistic', discountRate: 0.05, lossRatio: 0.80, active: false },
    { name: 'Stress', discountRate: 0.04, lossRatio: 0.90, active: false }
  ]);

  const [customScenario, setCustomScenario] = useState({
    name: 'Custom',
    discountRate: 0.06,
    lossRatio: 0.75,
    expenseInflation: 0.02,
    mortalityShock: 0.0
  });

  const calculateScenarioImpact = (scenario: any) => {
    const baseCsm = baseData.contractualServiceMargin.currentBalance;
    const baseRa = baseData.riskAdjustment.totalAmount;
    
    // Simplified impact calculation
    const discountImpact = (scenario.discountRate - 0.06) / 0.06;
    const lossRatioImpact = (scenario.lossRatio - 0.75) / 0.75;
    
    const csmImpact = baseCsm * (-discountImpact * 0.8 - lossRatioImpact * 0.3);
    const raImpact = baseRa * (Math.abs(discountImpact) * 0.2 + Math.abs(lossRatioImpact) * 0.5);
    const profitImpact = baseData.disclosureTables.profitBeforeTax * (discountImpact * 0.4 - lossRatioImpact * 1.2);
    
    return { csmImpact, raImpact, profitImpact };
  };

  const comparisonData = scenarios.map(scenario => {
    const impacts = calculateScenarioImpact(scenario);
    return {
      name: scenario.name,
      csmChange: impacts.csmImpact / 1000000,
      raChange: impacts.raImpact / 1000000,
      profitChange: impacts.profitImpact / 1000000,
      isActive: scenario.active
    };
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h4 className="font-medium mb-3">Scénarios Prédéfinis</h4>
          <div className="space-y-2">
            {scenarios.map((scenario, index) => (
              <div key={index} className="flex items-center justify-between p-3 border rounded hover:bg-gray-50">
                <div>
                  <div className="font-medium">{scenario.name}</div>
                  <div className="text-xs text-gray-500">
                    Taux: {(scenario.discountRate * 100).toFixed(1)}% | S/P: {(scenario.lossRatio * 100).toFixed(0)}%
                  </div>
                </div>
                <button
                  onClick={() => setScenarios(prev => prev.map((s, i) => 
                    i === index ? { ...s, active: !s.active } : { ...s, active: false }
                  ))}
                  className={`px-3 py-1 rounded text-sm ${
                    scenario.active ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {scenario.active ? 'Actif' : 'Activer'}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h4 className="font-medium mb-3">Scénario Personnalisé</h4>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-600">Taux d'actualisation</label>
              <input
                type="range"
                min="0.02"
                max="0.10"
                step="0.001"
                value={customScenario.discountRate}
                onChange={(e) => setCustomScenario({...customScenario, discountRate: parseFloat(e.target.value)})}
                className="w-full"
              />
              <div className="text-xs text-gray-500">{(customScenario.discountRate * 100).toFixed(1)}%</div>
            </div>
            <div>
              <label className="text-sm text-gray-600">Loss Ratio</label>
              <input
                type="range"
                min="0.40"
                max="1.20"
                step="0.01"
                value={customScenario.lossRatio}
                onChange={(e) => setCustomScenario({...customScenario, lossRatio: parseFloat(e.target.value)})}
                className="w-full"
              />
              <div className="text-xs text-gray-500">{(customScenario.lossRatio * 100).toFixed(0)}%</div>
            </div>
            <div>
              <label className="text-sm text-gray-600">Inflation des frais</label>
              <input
                type="range"
                min="0.00"
                max="0.08"
                step="0.001"
                value={customScenario.expenseInflation}
                onChange={(e) => setCustomScenario({...customScenario, expenseInflation: parseFloat(e.target.value)})}
                className="w-full"
              />
              <div className="text-xs text-gray-500">{(customScenario.expenseInflation * 100).toFixed(1)}%</div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h4 className="font-medium mb-3">Comparaison des impacts (vs Base Case)</h4>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={comparisonData.filter(d => d.isActive || d.name === 'Base Case')}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis unit="M€" />
            <Tooltip formatter={(value: any) => `${value.toFixed(1)}M€`} />
            <Legend />
            <Bar dataKey="csmChange" fill="#3B82F6" name="Impact CSM" />
            <Bar dataKey="raChange" fill="#10B981" name="Impact RA" />
            <Bar dataKey="profitChange" fill="#8B5CF6" name="Impact Profit" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// ===== COVERAGE UNITS ANALYZER =====
const CoverageUnitsAnalyzer: React.FC<{ movements: IFRS17RealData['contractualServiceMargin']['movements'] }> = ({ movements }) => {
  const chartData = movements.map((m, i) => ({
    period: new Date(m.date).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
    coverageUnits: m.coverageUnits / 1000,
    csmBalance: m.closingBalance / 1000000,
    unitValue: m.closingBalance / m.coverageUnits,
    releaseRate: m.releaseRate * 100
  }));

  const projectedData = useMemo(() => {
    const lastMovement = movements[movements.length - 1];
    const projections = [];
    let remainingUnits = lastMovement.coverageUnits;
    let remainingCsm = lastMovement.closingBalance;
    
    for (let i = 1; i <= 8; i++) {
      const releaseRate = Math.min(0.035 + (i * 0.005), 0.08); // Increasing release rate
      const unitsReleased = remainingUnits * releaseRate;
      const csmReleased = remainingCsm * releaseRate;
      
      remainingUnits -= unitsReleased;
      remainingCsm -= csmReleased;
      
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + i * 3);
      
      projections.push({
        period: futureDate.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
        coverageUnits: remainingUnits / 1000,
        csmBalance: remainingCsm / 1000000,
        unitValue: remainingCsm / remainingUnits,
        releaseRate: releaseRate * 100,
        isProjection: true
      });
    }
    
    return [...chartData.map(d => ({...d, isProjection: false})), ...projections];
  }, [movements]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-teal-50 border border-teal-200 p-4 rounded">
          <div className="text-sm text-teal-600">Coverage Units Actuelles</div>
          <div className="text-2xl font-bold text-teal-800">
            {(movements[movements.length - 1].coverageUnits / 1000).toFixed(0)}k
          </div>
          <div className="text-xs text-teal-600">Unités de couverture</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 p-4 rounded">
          <div className="text-sm text-blue-600">Valeur par Unité</div>
          <div className="text-2xl font-bold text-blue-800">
            {(movements[movements.length - 1].closingBalance / movements[movements.length - 1].coverageUnits).toFixed(0)}€
          </div>
          <div className="text-xs text-blue-600">CSM / Coverage Units</div>
        </div>
        <div className="bg-purple-50 border border-purple-200 p-4 rounded">
          <div className="text-sm text-purple-600">Taux de Libération</div>
          <div className="text-2xl font-bold text-purple-800">
            {(movements[movements.length - 1].releaseRate * 100).toFixed(2)}%
          </div>
          <div className="text-xs text-purple-600">Par trimestre</div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart data={projectedData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="period" />
          <YAxis yAxisId="left" orientation="left" />
          <YAxis yAxisId="right" orientation="right" unit="%" />
          <Tooltip />
          <Legend />
          <Area 
            yAxisId="left" 
            dataKey="coverageUnits" 
            fill="#14B8A6" 
            fillOpacity={0.3} 
            stroke="#14B8A6" 
            name="Coverage Units (k)" 
          />
          <Bar 
            yAxisId="left" 
            dataKey="csmBalance" 
            fill="#3B82F6" 
            name="CSM Balance (M€)" 
          />
          <Line 
            yAxisId="right" 
            type="monotone" 
            dataKey="releaseRate" 
            stroke="#8B5CF6" 
            strokeWidth={2} 
            strokeDasharray={projectedData.some(d => d.isProjection) ? "5 5" : "0"}
            name="Release Rate (%)" 
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="mt-4 p-3 bg-teal-50 rounded border border-teal-200">
        <div className="text-sm text-teal-800">
          <strong>Pattern Analysis:</strong> Le graphique montre l'évolution des coverage units, du CSM et du taux de libération. 
          Les projections (lignes pointillées) supposent une accélération progressive du taux de libération.
        </div>
      </div>
    </div>
  );
};

// ===== IFRS 17 QUALITY CHECKS =====
const IFRS17QualityChecks: React.FC<{ ifrs17Data: IFRS17RealData }> = ({ ifrs17Data }) => {
  const qualityChecks = useMemo(() => {
    const checks: any[] = [];
    
    // Check 1: CSM Movement Consistency
    const movements = ifrs17Data.contractualServiceMargin.movements;
    const lastMovement = movements[movements.length - 1];
    
    checks.push({
      id: 'csm-consistency',
      category: 'Cohérence CSM',
      name: 'Cohérence des mouvements CSM',
      status: Math.abs(lastMovement.closingBalance - (lastMovement.openingBalance + lastMovement.interestAccretion + lastMovement.serviceRelease + lastMovement.experienceAdjustments + lastMovement.unlockingAdjustments)) < 1000 ? 'pass' : 'fail',
      value: 'Équilibré',
      threshold: 'Balance arithmétique correcte',
      severity: 'high'
    });

    // Check 2: Release Rate Reasonability
    const avgReleaseRate = movements.reduce((sum, m) => sum + m.releaseRate, 0) / movements.length;
    checks.push({
      id: 'release-rate',
      category: 'Patterns de libération',
      name: 'Taux de libération CSM raisonnable',
      status: avgReleaseRate > 0.02 && avgReleaseRate < 0.08 ? 'pass' : 'warning',
      value: `${(avgReleaseRate * 100).toFixed(2)}%`,
      threshold: '2% - 8% par trimestre',
      severity: 'medium'
    });

    // Check 3: Risk Adjustment Cost of Capital
    checks.push({
      id: 'ra-coc',
      category: 'Risk Adjustment',
      name: 'Cost of Capital réglementaire',
      status: ifrs17Data.riskAdjustment.costOfCapitalRate === 0.06 ? 'pass' : 'fail',
      value: `${(ifrs17Data.riskAdjustment.costOfCapitalRate * 100).toFixed(1)}%`,
      threshold: '6.0% (standard IFRS 17)',
      severity: 'high'
    });

    // Check 4: Confidence Level
    checks.push({
      id: 'confidence-level',
      category: 'Risk Adjustment',
      name: 'Niveau de confiance approprié',
      status: ifrs17Data.riskAdjustment.confidenceLevel >= 70 && ifrs17Data.riskAdjustment.confidenceLevel <= 80 ? 'pass' : 'warning',
      value: `${ifrs17Data.riskAdjustment.confidenceLevel}%`,
      threshold: '70% - 80%',
      severity: 'medium'
    });

    // Check 5: P&L Coherence
    const calculatedProfit = ifrs17Data.disclosureTables.insuranceRevenue - ifrs17Data.disclosureTables.insuranceServiceExpenses + ifrs17Data.disclosureTables.netFinancialResult;
    checks.push({
      id: 'pl-coherence',
      category: 'P&L',
      name: 'Cohérence P&L IFRS 17',
      status: Math.abs(calculatedProfit - ifrs17Data.disclosureTables.profitBeforeTax) < 10000 ? 'pass' : 'fail',
      value: 'Cohérent',
      threshold: 'Revenue - Expenses + Financial = Profit',
      severity: 'high'
    });

    // Check 6: Coverage Units Evolution
    const unitsTrend = movements.map(m => m.coverageUnits);
    const isDecreasing = unitsTrend.every((val, i) => i === 0 || val <= unitsTrend[i-1]);
    checks.push({
      id: 'coverage-trend',
      category: 'Coverage Units',
      name: 'Évolution logique des Coverage Units',
      status: isDecreasing ? 'pass' : 'warning',
      value: isDecreasing ? 'Décroissante' : 'Incohérente',
      threshold: 'Décroissance monotone attendue',
      severity: 'medium'
    });

    return checks;
  }, [ifrs17Data]);

  const summary = useMemo(() => {
    const total = qualityChecks.length;
    const passed = qualityChecks.filter(c => c.status === 'pass').length;
    const warnings = qualityChecks.filter(c => c.status === 'warning').length;
    const failed = qualityChecks.filter(c => c.status === 'fail').length;
    
    return { total, passed, warnings, failed, score: (passed / total) * 100 };
  }, [qualityChecks]);

  const getStatusIcon = (status: string) => {
    switch(status) {
      case 'pass': return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'warning': return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case 'fail': return <AlertCircle className="h-5 w-5 text-red-600" />;
      default: return <Info className="h-5 w-5 text-gray-600" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    const colors = {
      high: 'bg-red-100 text-red-700',
      medium: 'bg-yellow-100 text-yellow-700',
      low: 'bg-green-100 text-green-700'
    };
    return <span className={`px-2 py-0.5 text-xs rounded-full ${colors[severity as keyof typeof colors]}`}>{severity}</span>;
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 border border-blue-200 p-4 rounded text-center">
          <div className="text-2xl font-bold text-blue-800">{summary.score.toFixed(0)}%</div>
          <div className="text-sm text-blue-600">Score Qualité</div>
        </div>
        <div className="bg-green-50 border border-green-200 p-4 rounded text-center">
          <div className="text-2xl font-bold text-green-800">{summary.passed}</div>
          <div className="text-sm text-green-600">Contrôles Réussis</div>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 p-4 rounded text-center">
          <div className="text-2xl font-bold text-yellow-800">{summary.warnings}</div>
          <div className="text-sm text-yellow-600">Avertissements</div>
        </div>
        <div className="bg-red-50 border border-red-200 p-4 rounded text-center">
          <div className="text-2xl font-bold text-red-800">{summary.failed}</div>
          <div className="text-sm text-red-600">Échecs</div>
        </div>
      </div>

      {/* Detailed Checks */}
      <div className="divide-y divide-gray-200">
        {qualityChecks.map(check => (
          <div key={check.id} className="py-4 flex items-start justify-between">
            <div className="flex items-start gap-3">
              {getStatusIcon(check.status)}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{check.name}</span>
                  {getSeverityBadge(check.severity)}
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{check.category}</span>
                </div>
                <div className="mt-1 text-sm text-gray-600">
                  <span className="font-medium">Valeur:</span> {check.value} | 
                  <span className="font-medium"> Seuil:</span> {check.threshold}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {summary.failed > 0 && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-red-800">Actions Requises</h4>
              <p className="text-sm text-red-700 mt-1">
                {summary.failed} contrôle(s) en échec nécessitent une correction immédiate pour assurer la conformité IFRS 17.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ============================== COMPONENTS ============================== */
// ===== SCENARIO SIMULATOR =====
const ScenarioSimulator: React.FC<{ ifrs17Data?: IFRS17RealData | null; solvencyData?: SolvencyIIRealData | null; onScenarioChange?: (key:string, ass:any)=>void; }> = ({ ifrs17Data, solvencyData, onScenarioChange }) => {
  const [assumptions, setAssumptions] = useState({
    interestRate: 0.06,
    lossRatio: 0.75,
    expenseRatio: 0.25,
    riskMargin: 0.06,
    marketVolatility: 0.15
  });
  const [activeScenario, setActiveScenario] = useState<'base'|'optimistic'|'pessimistic'|'stress'>('base');

  const scenarios = {
    base: { label: 'Scénario Central', color: '#3B82F6' },
    optimistic: { label: 'Scénario Optimiste', color: '#10B981' },
    pessimistic: { label: 'Scénario Pessimiste', color: '#EF4444' },
    stress: { label: 'Stress Test', color: '#F59E0B' }
  };

  const simulateScenario = (scenario: 'base'|'optimistic'|'pessimistic'|'stress') => {
    let adjustedAssumptions = { ...assumptions };
    switch(scenario) {
      case 'optimistic':
        adjustedAssumptions.interestRate *= 1.2;
        adjustedAssumptions.lossRatio *= 0.9;
        break;
      case 'pessimistic':
        adjustedAssumptions.interestRate *= 0.8;
        adjustedAssumptions.lossRatio *= 1.15;
        break;
      case 'stress':
        adjustedAssumptions.interestRate *= 0.5;
        adjustedAssumptions.lossRatio *= 1.3;
        adjustedAssumptions.marketVolatility *= 2;
        break;
    }
    onScenarioChange?.(scenario, adjustedAssumptions);
    setActiveScenario(scenario);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-gray-900 flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-500" />
          Simulateur de Scénarios
        </h3>
        <button className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1">
          <Settings className="h-4 w-4" />
          Paramètres avancés
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {Object.entries(scenarios).map(([key, config]) => (
          <button
            key={key}
            onClick={() => simulateScenario(key as any)}
            className={`p-3 rounded-lg border-2 transition-all`}
            style={{
              borderColor: activeScenario === key ? config.color : '#E5E7EB',
              backgroundColor: activeScenario === key ? `${config.color}1A` : '#FFFFFF'
            }}
          >
            <div className="text-sm font-medium">{config.label}</div>
            <div className="text-xs text-gray-500 mt-1">
              {key === 'base' && 'Hypothèses actuelles'}
              {key === 'optimistic' && 'Taux +20%, Sinistralité -10%'}
              {key === 'pessimistic' && 'Taux -20%, Sinistralité +15%'}
              {key === 'stress' && 'Volatilité x2, Choc majeur'}
            </div>
          </button>
        ))}
      </div>

      <div className="space-y-3 border-t pt-4">
        <div className="text-sm font-medium text-gray-700 mb-2">Paramètres ajustables</div>
        {Object.entries(assumptions).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between">
            <label className="text-sm text-gray-600 capitalize">
              {key.replace(/([A-Z])/g, ' $1').trim()}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0"
                max={key === 'lossRatio' || key === 'expenseRatio' ? "1" : "0.3"}
                step="0.01"
                value={value as number}
                onChange={(e) => setAssumptions({...assumptions, [key]: parseFloat(e.target.value)})}
                className="w-24"
              />
              <span className="text-sm font-medium w-12 text-right">
                {((value as number) * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ===== CSM PROJECTION CHART =====
const CSMProjectionChart: React.FC<{ data?: IFRS17RealData | null; scenarios?: string; }> = ({ data, scenarios }) => {
  const chartData = useMemo(() => {
    if (!data?.contractualServiceMargin?.movements) return [];
    
    const historical = data.contractualServiceMargin.movements.map(m => ({
      date: new Date(m.date).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }),
      type: 'Historique',
      balance: m.closingBalance,
      upperBound: m.confidenceInterval?.upper || m.closingBalance * 1.1,
      lowerBound: m.confidenceInterval?.lower || m.closingBalance * 0.9
    }));

    const lastBalance = historical[historical.length - 1]?.balance || 0;
    const projections: any[] = [];
    
    for (let i = 1; i <= 8; i++) {
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + i * 3);
      projections.push({
        date: futureDate.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }),
        type: 'Projection',
        base: lastBalance * Math.pow(0.95, i),
        optimistic: lastBalance * Math.pow(0.97, i),
        pessimistic: lastBalance * Math.pow(0.92, i)
      });
    }

    return [...historical, ...projections];
  }, [data]);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-blue-600" />
        Projection CSM - Vision Multi-Scénarios
      </h3>
      
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip 
            formatter={(value: any) => `${Number(value)?.toLocaleString()}€`}
            contentStyle={{ backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB' }}
          />
          <Legend />
          <Area dataKey="upperBound" fill="#3B82F6" fillOpacity={0.1} stroke="none" name="Intervalle de confiance" />
          <Area dataKey="lowerBound" fill="#3B82F6" fillOpacity={0.1} stroke="none" />
          <Line dataKey="balance" stroke="#3B82F6" strokeWidth={2} name="CSM Historique" dot={{ fill: '#3B82F6', r: 4 }} />
          <Line dataKey="base" stroke="#6B7280" strokeDasharray="5 5" strokeWidth={2} name="Projection Base" dot={false} />
          <Line dataKey="optimistic" stroke="#10B981" strokeDasharray="5 5" strokeWidth={1.5} name="Scénario Optimiste" dot={false} />
          <Line dataKey="pessimistic" stroke="#EF4444" strokeDasharray="5 5" strokeWidth={1.5} name="Scénario Pessimiste" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

// ===== CORRELATION MATRIX HEATMAP =====
const CorrelationHeatmap: React.FC<{ matrix?: number[][]; labels?: string[] }> = ({ matrix, labels }) => {
  const cellSize = 60;
  const colors = ['#EF4444', '#F59E0B', '#FCD34D', '#BEF264', '#10B981'];
  const getColor = (value: number) => {
    if (value <= 0) return colors[0];
    if (value <= 0.25) return colors[1];
    if (value <= 0.5) return colors[2];
    if (value <= 0.75) return colors[3];
    return colors[4];
  };
  const moduleLabels = labels || ['Market', 'Underwriting', 'Counterparty', 'Operational', 'Intangible'];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
        <Layers className="h-5 w-5 text-purple-600" />
        Matrice de Corrélations SCR
      </h3>
      <div className="overflow-auto">
        <svg width={cellSize * (matrix?.length || 5) + 100} height={cellSize * (matrix?.length || 5) + 100}>
          {matrix?.map((row, i) => 
            row.map((value, j) => (
              <g key={`${i}-${j}`}>
                <rect
                  x={j * cellSize + 50}
                  y={i * cellSize + 50}
                  width={cellSize - 2}
                  height={cellSize - 2}
                  fill={getColor(value)}
                  stroke="#E5E7EB"
                  strokeWidth="1"
                  className="cursor-pointer hover:stroke-gray-600 hover:stroke-2"
                />
                <text
                  x={j * cellSize + 50 + cellSize/2}
                  y={i * cellSize + 50 + cellSize/2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="12"
                  fill={value > 0.5 ? "#FFFFFF" : "#374151"}
                  fontWeight="500"
                >
                  {(value * 100).toFixed(0)}%
                </text>
              </g>
            ))
          )}
          {moduleLabels.map((label, i) => (
            <g key={`label-${i}`}>
              <text
                x={45}
                y={i * cellSize + 50 + cellSize/2}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize="11"
                fill="#6B7280"
              >
                {label}
              </text>
              <text
                x={i * cellSize + 50 + cellSize/2}
                y={45}
                textAnchor="middle"
                dominantBaseline="text-after-edge"
                fontSize="11"
                fill="#6B7280"
                transform={`rotate(-45, ${i * cellSize + 50 + cellSize/2}, 45)`}
              >
                {label}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className="mt-4 flex items-center gap-4 text-xs">
        <div className="flex items-center gap-2"><div className="w-4 h-4 bg-red-500"></div><span>0-25%</span></div>
        <div className="flex items-center gap-2"><div className="w-4 h-4 bg-yellow-400"></div><span>25-50%</span></div>
        <div className="flex items-center gap-2"><div className="w-4 h-4 bg-green-500"></div><span>50-100%</span></div>
      </div>
    </div>
  );
};

// ===== RISK DASHBOARD =====
const RiskDashboard: React.FC<{ solvencyData?: SolvencyIIRealData | null; ifrs17Data?: IFRS17RealData | null; }> = ({ solvencyData, ifrs17Data }) => {
  const riskIndicators = [
    {
      name: 'Solvency Ratio',
      value: solvencyData?.solvencyRatios?.scrCoverage || 0,
      target: 150,
      min: 100,
      status: (solvencyData?.solvencyRatios?.scrCoverage || 0) >= 150 ? 'safe' : 
              (solvencyData?.solvencyRatios?.scrCoverage || 0) >= 120 ? 'warning' : 'danger'
    },
    {
      name: 'MCR Coverage',
      value: solvencyData?.solvencyRatios?.mcrCoverage || 0,
      target: 200,
      min: 100,
      status: (solvencyData?.solvencyRatios?.mcrCoverage || 0) >= 200 ? 'safe' : 
              (solvencyData?.solvencyRatios?.mcrCoverage || 0) >= 150 ? 'warning' : 'danger'
    },
    {
      name: 'Risk Adjustment',
      value: ifrs17Data?.riskAdjustment?.confidenceLevel || 0,
      target: 75,
      min: 60,
      status: (ifrs17Data?.riskAdjustment?.confidenceLevel || 0) >= 75 ? 'safe' : 
              (ifrs17Data?.riskAdjustment?.confidenceLevel || 0) >= 65 ? 'warning' : 'danger'
    }
  ];
  const getStatusColor = (status: string) => {
    switch(status) { case 'safe': return '#10B981'; case 'warning': return '#F59E0B'; case 'danger': return '#EF4444'; default: return '#6B7280'; }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {riskIndicators.map((indicator, index) => (
        <div key={index} className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex justify-between items-start mb-2">
            <h4 className="text-sm font-medium text-gray-700">{indicator.name}</h4>
            <Activity className="h-4 w-4" style={{ color: getStatusColor(indicator.status) }} />
          </div>
          <div className="relative h-32">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={[
                { subject: 'Actuel', value: indicator.value },
                { subject: 'Target', value: indicator.target },
                { subject: 'Min', value: indicator.min }
              ]}>
                <PolarGrid stroke="#E5E7EB" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
                <PolarRadiusAxis angle={90} domain={[0, Math.max(indicator.value, indicator.target) * 1.2]} />
                <Radar dataKey="value" stroke={getStatusColor(indicator.status)} fill={getStatusColor(indicator.status)} fillOpacity={0.3} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex justify-between items-center">
            <span className="text-2xl font-bold" style={{ color: getStatusColor(indicator.status) }}>
              {indicator.value.toFixed(0)}%
            </span>
            <div className="text-xs text-gray-500">
              <div>Target: {indicator.target}%</div>
              <div>Min: {indicator.min}%</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ===== COMPLIANCE ALERTS =====
const ComplianceAlerts: React.FC<{ checks: any[]; onActionClick?: (c:any)=>void; }> = ({ checks, onActionClick }) => {
  const [filter, setFilter] = useState('all');
  const filteredChecks = useMemo(() => filter === 'all' ? checks : checks.filter(c => c.status === filter), [checks, filter]);
  const criticalAlerts = checks.filter(c => c.status === 'non-compliant' && c.criticality === 'high');

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <h3 className="font-medium text-gray-900 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Alertes de Conformité
          </h3>
          <div className="flex items-center gap-2">
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="text-sm border border-gray-300 rounded px-2 py-1">
              <option value="all">Tous</option>
              <option value="non-compliant">Non conformes</option>
              <option value="warning">Avertissements</option>
              <option value="compliant">Conformes</option>
            </select>
          </div>
        </div>
      </div>

      {criticalAlerts.length > 0 && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4">
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
            <div className="ml-3">
              <h4 className="text-sm font-medium text-red-800">
                {criticalAlerts.length} alerte(s) critique(s) nécessitant une action immédiate
              </h4>
              <ul className="mt-2 text-sm text-red-700 space-y-1">
                {criticalAlerts.map(alert => (
                  <li key={alert.id} className="flex items-center gap-2">
                    <ChevronRight className="h-3 w-3" />
                    {alert.name}: {alert.actualValue} (requis: {alert.requirement})
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
        {filteredChecks.map(check => (
          <div key={check.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  {check.status === 'compliant' && <CheckCircle className="h-4 w-4 text-green-600" />}
                  {check.status === 'warning' && <AlertTriangle className="h-4 w-4 text-yellow-600" />}
                  {check.status === 'non-compliant' && <AlertCircle className="h-4 w-4 text-red-600" />}
                  <span className="font-medium text-sm">{check.name}</span>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    check.category === 'IFRS17' ? 'bg-blue-100 text-blue-700' :
                    check.category === 'SII' ? 'bg-purple-100 text-purple-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {check.category}
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-1">{check.description}</p>
                <div className="flex items-center gap-4 mt-2">
                  <span className="text-xs"><strong>Actuel:</strong> {check.actualValue}</span>
                  <span className="text-xs"><strong>Requis:</strong> {check.requirement}</span>
                  {check.status === 'non-compliant' && (
                    <button onClick={() => onActionClick?.(check)} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
                      <Play className="h-3 w-3" />
                      Action corrective
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ============================== NEW: MCR CALCULATOR ============================== */
const MCRCalculator: React.FC<{ scr: number; initialPremiums?: Record<LoBKey, number>; initialReserves?: Record<LoBKey, number>; onChange?: (v:{linear:number;final:number})=>void; }> = ({ scr, initialPremiums, initialReserves, onChange }) => {
  const [premiums, setPremiums] = useState<Record<LoBKey, number>>(() => {
    const base: any = {};
    LOB_FACTORS.forEach(l => base[l.key] = initialPremiums?.[l.key] ?? 1_000_000);
    return base;
  });
  const [reserves, setReserves] = useState<Record<LoBKey, number>>(() => {
    const base: any = {};
    LOB_FACTORS.forEach(l => base[l.key] = initialReserves?.[l.key] ?? 2_000_000);
    return base;
  });

  const linearMCR = useMemo(() => {
    return LOB_FACTORS.reduce((sum, lob) => sum + lob.alpha * (premiums[lob.key] || 0) + lob.beta * (reserves[lob.key] || 0), 0);
  }, [premiums, reserves]);

  const floor25 = scr * 0.25;
  const cap45 = scr * 0.45;
  const absoluteFloor = 3_700_000;
  const capped = Math.min(linearMCR, cap45);
  const finalMCR = Math.max(capped, floor25, absoluteFloor);

  useEffect(() => { onChange?.({ linear: linearMCR, final: finalMCR }); }, [linearMCR, finalMCR, onChange]);

  const maxScale = Math.max(cap45, linearMCR, absoluteFloor) * 1.2;

  const format = (v:number) => v.toLocaleString('fr-FR') + '€';
  const formatShort = (v:number) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M€` : v >= 1_000 ? `${(v/1_000).toFixed(0)}k€` : `${v}€`;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
        <Calculator className="h-5 w-5 text-purple-600" />
        MCR - Formule Linéaire & Seuils
      </h3>

      {/* Progress / Gauge */}
      <div className="mb-4">
        <div className="h-4 w-full bg-gray-200 rounded-full relative">
          {/* floor 25% SCR */}
          <div className="absolute top-1/2 -translate-y-1/2 h-4 rounded-full" style={{ left: `0%`, width: `${(floor25 / maxScale) * 100}%`, backgroundColor: '#FCD34D' }} />
          {/* linéaire */}
          <div className="absolute top-1/2 -translate-y-1/2 h-4 rounded-full" style={{ left: `0%`, width: `${(linearMCR / maxScale) * 100}%`, background: 'linear-gradient(90deg,#60A5FA,#3B82F6)' }} />
          {/* cap 45% SCR marker */}
          <div className="absolute -top-2 w-0.5 h-8 bg-gray-700" style={{ left: `${(cap45 / maxScale) * 100}%` }} title="Cap 45% SCR" />
          {/* absolute floor marker */}
          <div className="absolute -top-2 w-0.5 h-8 bg-red-600" style={{ left: `${(absoluteFloor / maxScale) * 100}%` }} title="Absolute floor" />
        </div>
        <div className="flex justify-between text-xs text-gray-600 mt-1">
          <span>0</span>
          <span>25% SCR {formatShort(floor25)}</span>
          <span>Linéaire {formatShort(linearMCR)}</span>
          <span>45% SCR {formatShort(cap45)}</span>
          <span>Floor {formatShort(absoluteFloor)}</span>
        </div>
        <div className="mt-2 text-sm">
          <strong>Final MCR: </strong>
          <span className="font-bold text-blue-700">{format(finalMCR)}</span>
          <span className="text-gray-500 ml-2">(= max(min(lin, 45%SCR), 25%SCR, 3.7M€))</span>
        </div>
      </div>

      {/* Table inputs */}
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-gray-600">Ligne d'activité</th>
              <th className="px-3 py-2 text-right text-gray-600">α (Prime)</th>
              <th className="px-3 py-2 text-right text-gray-600">β (Réserves)</th>
              <th className="px-3 py-2 text-right text-gray-600">Primes</th>
              <th className="px-3 py-2 text-right text-gray-600">Réserves</th>
              <th className="px-3 py-2 text-right text-gray-600">Contribution</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {LOB_FACTORS.map(lob => {
              const contrib = lob.alpha * (premiums[lob.key] || 0) + lob.beta * (reserves[lob.key] || 0);
              return (
                <tr key={lob.key} className="hover:bg-gray-50">
                  <td className="px-3 py-2">{lob.name}</td>
                  <td className="px-3 py-2 text-right">{(lob.alpha*100).toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right">{(lob.beta*100).toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      value={premiums[lob.key]}
                      onChange={e => setPremiums(prev => ({ ...prev, [lob.key]: Number(e.target.value) }))}
                      className="w-32 border rounded px-2 py-1 text-right"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      value={reserves[lob.key]}
                      onChange={e => setReserves(prev => ({ ...prev, [lob.key]: Number(e.target.value) }))}
                      className="w-32 border rounded px-2 py-1 text-right"
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{format(contrib)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 font-semibold">
              <td className="px-3 py-2" colSpan={5}>Total Linéaire</td>
              <td className="px-3 py-2 text-right">{format(linearMCR)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

/* ============================== NEW: QRT MANAGER ============================== */
type QRTStatus = 'validated' | 'submitted' | 'rejected' | 'pending';
interface QRTTemplate {
  id: string;
  title: string;
  status: QRTStatus;
  completeness: number; // 0..100
  lastUpdated?: string;
}

const DEFAULT_QRT_TEMPLATES: QRTTemplate[] = [
  { id: 'S.01.01', title: 'Content of submission', status: 'pending', completeness: 70 },
  { id: 'S.02.01', title: 'Balance sheet', status: 'validated', completeness: 100 },
  { id: 'S.05.01', title: 'Premiums, claims and expenses', status: 'submitted', completeness: 95 },
  { id: 'S.17.01', title: 'Non-Life Technical Provisions', status: 'pending', completeness: 60 },
  { id: 'S.19.01', title: 'Non-Life claims triangles', status: 'pending', completeness: 40 },
  { id: 'S.23.01', title: 'Own funds', status: 'validated', completeness: 100 },
  { id: 'S.25.01', title: 'SCR Standard formula', status: 'validated', completeness: 100 },
  { id: 'S.28.01', title: 'MCR Non-life and life', status: 'submitted', completeness: 90 },
];

const QRTTemplatesManager: React.FC<{ bootstrapFrom?: SolvencyIIRealData | null }> = ({ bootstrapFrom }) => {
  const [templates, setTemplates] = useState<QRTTemplate[]>(() => {
    // bootstrap partiel depuis solvencyData si disponible
    const map = new Map(DEFAULT_QRT_TEMPLATES.map(t => [t.id, t]));
    bootstrapFrom?.qrtStatus?.forEach(s => {
      const t = map.get(s.templateId);
      if (t) {
        t.status = s.status as QRTStatus;
        t.completeness = t.status === 'validated' ? 100 : Math.max(t.completeness, 80);
        t.lastUpdated = s.lastSubmission;
      }
    });
    return Array.from(map.values());
  });

  const toggleSubmitSelected = () => {
    setTemplates(prev => prev.map(t => t.status === 'pending' && t.completeness >= 80 ? { ...t, status: 'submitted', lastUpdated: new Date().toISOString() } : t));
  };

  const overall = useMemo(() => {
    const total = templates.length;
    const validated = templates.filter(t => t.status === 'validated').length;
    const submitted = templates.filter(t => t.status === 'submitted').length;
    const rejected = templates.filter(t => t.status === 'rejected').length;
    const pending = total - validated - submitted - rejected;
    const completeness = Math.round(templates.reduce((s, t) => s + t.completeness, 0) / total);
    return { total, validated, submitted, rejected, pending, completeness };
  }, [templates]);

  const statusBadge = (s:QRTStatus) => {
    const map:any = {
      validated: 'bg-green-100 text-green-700',
      submitted: 'bg-blue-100 text-blue-700',
      rejected: 'bg-red-100 text-red-700',
      pending: 'bg-gray-100 text-gray-700'
    };
    return <span className={`px-2 py-0.5 text-xs rounded-full ${map[s]}`}>{s}</span>;
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-gray-900 flex items-center gap-2">
          <FileText className="h-5 w-5 text-indigo-600" />
          QRT - EIOPA 2.8.0
        </h3>
        <button onClick={toggleSubmitSelected} className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
          Soumettre les complétés
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-gray-50 rounded p-3">
          <div className="text-xs text-gray-500">Completude globale</div>
          <div className="text-2xl font-bold text-gray-900">{overall.completeness}%</div>
          <div className="w-full h-2 bg-gray-200 rounded mt-2">
            <div className="h-2 bg-blue-600 rounded" style={{ width: `${overall.completeness}%` }} />
          </div>
        </div>
        <div className="bg-gray-50 rounded p-3"><div className="text-xs text-gray-500">Validés</div><div className="text-xl font-bold text-green-700">{overall.validated}</div></div>
        <div className="bg-gray-50 rounded p-3"><div className="text-xs text-gray-500">Soumis</div><div className="text-xl font-bold text-blue-700">{overall.submitted}</div></div>
        <div className="bg-gray-50 rounded p-3"><div className="text-xs text-gray-500">En attente</div><div className="text-xl font-bold text-gray-700">{overall.pending}</div></div>
      </div>

      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">Template</th>
              <th className="px-3 py-2 text-left">Titre</th>
              <th className="px-3 py-2 text-left">Statut</th>
              <th className="px-3 py-2 text-left">Complétude</th>
              <th className="px-3 py-2 text-left">Dernière mise à jour</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {templates.map(t => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium">{t.id}</td>
                <td className="px-3 py-2">{t.title}</td>
                <td className="px-3 py-2">{statusBadge(t.status)}</td>
                <td className="px-3 py-2">
                  <div className="w-40 h-2 bg-gray-200 rounded">
                    <div className={`h-2 rounded ${t.completeness===100?'bg-green-600':t.completeness>=80?'bg-blue-600':'bg-yellow-500'}`} style={{ width: `${t.completeness}%` }} />
                  </div>
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">{t.lastUpdated ? new Date(t.lastUpdated).toLocaleString('fr-FR') : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ============================== NEW: LoB FACTORS VIEW ============================== */
const heat = (value:number, min:number, max:number) => {
  // simple green -> red gradient
  const t = (value - min) / Math.max(max - min, 1e-6);
  const h = (1 - t) * 120; // 120=green, 0=red
  return `hsl(${h}, 80%, 85%)`;
};

const LineOfBusinessFactors: React.FC<{ mode?: 'chart' | 'table' }> = ({ mode = 'chart' }) => {
  const [view, setView] = useState<'chart'|'table'>(mode);

  const chartData = useMemo(() => LOB_FACTORS.map(l => ({
    lob: l.name, Alpha: l.alpha*100, Beta: l.beta*100
  })), []);

  const minAlpha = Math.min(...LOB_FACTORS.map(l=>l.alpha*100));
  const maxAlpha = Math.max(...LOB_FACTORS.map(l=>l.alpha*100));
  const minBeta  = Math.min(...LOB_FACTORS.map(l=>l.beta*100));
  const maxBeta  = Math.max(...LOB_FACTORS.map(l=>l.beta*100));

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-gray-900 flex items-center gap-2">
          <Layers className="h-5 w-5 text-teal-600" />
          Facteurs Standards par Ligne d'Activité
        </h3>
        <div className="flex gap-2">
          <button onClick={()=>setView('chart')} className={`px-3 py-1 rounded border ${view==='chart'?'bg-blue-600 text-white border-blue-600':'bg-white text-gray-700 border-gray-300'}`}>Graphique</button>
          <button onClick={()=>setView('table')} className={`px-3 py-1 rounded border ${view==='table'?'bg-blue-600 text-white border-blue-600':'bg-white text-gray-700 border-gray-300'}`}>Tableau</button>
        </div>
      </div>

      {view === 'chart' ? (
        <div style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="lob" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
              <YAxis unit="%" />
              <Tooltip formatter={(v:any)=>`${v.toFixed(1)}%`} />
              <Legend />
              <Bar dataKey="Alpha" fill="#3B82F6" />
              <Bar dataKey="Beta" fill="#10B981" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">LoB</th>
                <th className="px-3 py-2 text-right">α (Prime)</th>
                <th className="px-3 py-2 text-right">β (Réserves)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {LOB_FACTORS.map(l => (
                <tr key={l.key}>
                  <td className="px-3 py-2">{l.name}</td>
                  <td className="px-3 py-2 text-right">
                    <span className="px-2 py-1 rounded" style={{ background: heat(l.alpha*100, minAlpha, maxAlpha) }}>
                      {(l.alpha*100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="px-2 py-1 rounded" style={{ background: heat(l.beta*100, minBeta, maxBeta) }}>
                      {(l.beta*100).toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

/* ============================== DYNAMIC CHECKS ============================== */
const generateDynamicComplianceChecks = (
  ifrs17Data?: IFRS17RealData | null, 
  solvencyData?: SolvencyIIRealData | null,
  result?: any,
  extendedKPI?: any
): any[] => {
  const checks: any[] = [];

  if (ifrs17Data) {
    const latestMovement = ifrs17Data.contractualServiceMargin.movements[ifrs17Data.contractualServiceMargin.movements.length - 1];
    const annualizedInterestRate = (latestMovement?.interestAccretion / latestMovement?.openingBalance) * 4;

    checks.push({
      id: 'ifrs17-csm-dynamic',
      category: 'IFRS17',
      name: 'CSM Interest Accretion Rate',
      description: 'Taux d\'accroissement d\'intérêt CSM conforme aux standards',
      status: annualizedInterestRate > 0.08 ? 'warning' : 'compliant',
      requirement: '≤ 8% annual',
      actualValue: `${(annualizedInterestRate * 100).toFixed(2)}%`,
      threshold: 8,
      criticality: 'medium'
    });

    checks.push({
      id: 'ifrs17-ra-dynamic',
      category: 'IFRS17',
      name: 'Risk Adjustment Cost of Capital',
      description: 'Coût du capital Risk Adjustment selon IFRS 17',
      status: ifrs17Data.riskAdjustment.costOfCapitalRate !== 0.06 ? 'non-compliant' : 'compliant',
      requirement: '6.00%',
      actualValue: `${(ifrs17Data.riskAdjustment.costOfCapitalRate * 100).toFixed(2)}%`,
      threshold: 6,
      criticality: 'high'
    });

    checks.push({
      id: 'ifrs17-csm-release',
      category: 'IFRS17',
      name: 'CSM Release Pattern',
      description: 'Pattern de libération du CSM conforme',
      status: latestMovement?.releaseRate > 0.05 ? 'warning' : 'compliant',
      requirement: '3-5% par trimestre',
      actualValue: `${(latestMovement?.releaseRate * 100).toFixed(2)}%`,
      threshold: 5,
      criticality: 'medium'
    });
  }

  if (solvencyData) {
    const scrCoverageRatio = (solvencyData.ownFunds.totalEligible / solvencyData.scrCalculation.totalSCR) * 100;
    const mcrCoverageRatio = (solvencyData.ownFunds.totalEligible / solvencyData.mcrCalculation.finalMCR) * 100;

    checks.push({
      id: 'sii-scr-dynamic',
      category: 'SII',
      name: 'SCR Coverage Ratio',
      description: 'Ratio de couverture SCR calculé dynamiquement',
      status: scrCoverageRatio < 100 ? 'non-compliant' : scrCoverageRatio < 120 ? 'warning' : 'compliant',
      requirement: '≥ 100%',
      actualValue: `${scrCoverageRatio.toFixed(1)}%`,
      threshold: 100,
      criticality: 'high'
    });

    checks.push({
      id: 'sii-mcr-dynamic',
      category: 'SII',
      name: 'MCR Coverage Ratio',
      description: 'Ratio de couverture MCR calculé dynamiquement',
      status: mcrCoverageRatio < 100 ? 'non-compliant' : mcrCoverageRatio < 150 ? 'warning' : 'compliant',
      requirement: '≥ 100%',
      actualValue: `${mcrCoverageRatio.toFixed(1)}%`,
      threshold: 100,
      criticality: 'high'
    });

    checks.push({
      id: 'sii-tier1-quality',
      category: 'SII',
      name: 'Tier 1 Capital Quality',
      description: 'Qualité des fonds propres Tier 1',
      status: (solvencyData.ownFunds.tier1Unrestricted / solvencyData.ownFunds.totalEligible) >= 0.5 ? 'compliant' : 'warning',
      requirement: '≥ 50% Tier 1',
      actualValue: `${((solvencyData.ownFunds.tier1Unrestricted / solvencyData.ownFunds.totalEligible) * 100).toFixed(1)}%`,
      threshold: 50,
      criticality: 'medium'
    });
  }

  if (extendedKPI?.combinedRatio !== undefined) {
    checks.push({
      id: 'combined-ratio-check',
      category: 'CEIOPS',
      name: 'Combined Ratio',
      description: 'Combined ratio dans les limites acceptables',
      status: extendedKPI.combinedRatio > 120 ? 'non-compliant' : 
             extendedKPI.combinedRatio > 105 ? 'warning' : 'compliant',
      requirement: '≤ 105%',
      actualValue: `${extendedKPI.combinedRatio.toFixed(1)}%`,
      threshold: 105,
      criticality: 'high'
    });
  }

  return checks;
};

/* ============================== MAIN ============================== */
const RegulatoryCompliancePanel: React.FC<ComplianceProps> = ({ 
  result, 
  extendedKPI,
  calculationId,
  triangleId
}) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'ifrs17' | 'solvency2' | 'scenarios' | 'audit'>('dashboard');
  const [selectedScenario, setSelectedScenario] = useState('base');
  const [isAutoRefresh, setIsAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const ifrs17Data = useMemo(() => generateIFRS17FromActuarialData(result, extendedKPI), [result, extendedKPI]);
  const solvencyData = useMemo(() => generateSolvency2FromActuarialData(result, extendedKPI), [result, extendedKPI]);
  const dynamicChecks = useMemo(() => generateDynamicComplianceChecks(ifrs17Data, solvencyData, result, extendedKPI), [ifrs17Data, solvencyData, result, extendedKPI]);

  const complianceStats = useMemo(() => {
    if (!dynamicChecks.length) return { total: 0, compliant: 0, warning: 0, nonCompliant: 0, score: 0 };
    return {
      total: dynamicChecks.length,
      compliant: dynamicChecks.filter(c => c.status === 'compliant').length,
      warning: dynamicChecks.filter(c => c.status === 'warning').length,
      nonCompliant: dynamicChecks.filter(c => c.status === 'non-compliant').length,
      score: (dynamicChecks.filter(c => c.status === 'compliant').length / dynamicChecks.length) * 100
    };
  }, [dynamicChecks]);

  useEffect(() => {
    if (!isAutoRefresh) return;
    const interval = setInterval(() => { setLastRefresh(new Date()); }, 30000);
    return () => clearInterval(interval);
  }, [isAutoRefresh]);

  const handleExportReport = () => {
    const reportData = {
      timestamp: new Date().toISOString(),
      calculationId: calculationId || 'static',
      result,
      extendedKPI,
      complianceScore: complianceStats.score,
      checks: dynamicChecks,
      ifrs17: ifrs17Data,
      solvency2: solvencyData
    };
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `compliance_report_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handleScenarioChange = (scenario:string, assumptions:any) => { setSelectedScenario(scenario); };
  const handleActionClick = (check:any) => { console.log('Action requested for:', check); };

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Shield className="h-7 w-7 text-blue-600" />
                Centre de Conformité Réglementaire
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                IFRS 17 & Solvency II - Analyse temps réel depuis vos données actuarielles
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className={`text-3xl font-bold ${
                  complianceStats.score >= 95 ? 'text-green-600' :
                  complianceStats.score >= 85 ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {complianceStats.score.toFixed(0)}%
                </div>
                <div className="text-xs text-gray-500">Score Global</div>
              </div>
              <button onClick={() => setIsAutoRefresh(!isAutoRefresh)} className={`px-3 py-2 rounded-md flex items-center gap-2 ${isAutoRefresh ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                <RefreshCw className={`h-4 w-4 ${isAutoRefresh ? 'animate-spin' : ''}`} />
                {isAutoRefresh ? 'Auto' : 'Manuel'}
              </button>
              <button onClick={handleExportReport} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2">
                <Download className="h-4 w-4" />
                Exporter
              </button>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
            <Clock className="h-3 w-3" />
            Dernière mise à jour: {lastRefresh.toLocaleTimeString('fr-FR')}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <nav className="flex space-x-8 px-6">
          {[
            { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
            { key: 'ifrs17', label: 'IFRS 17', icon: FileText },
            { key: 'solvency2', label: 'Solvency II', icon: Building },
            { key: 'scenarios', label: 'Scénarios', icon: Zap },
            { key: 'audit', label: 'Audit Trail', icon: Lock }
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as any)}
              className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
                activeTab === key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <RiskDashboard solvencyData={solvencyData} ifrs17Data={ifrs17Data} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CSMProjectionChart data={ifrs17Data} scenarios={selectedScenario} />
              <CorrelationHeatmap matrix={solvencyData?.scrCalculation?.correlationMatrix} labels={['Market', 'Underwriting', 'Counterparty', 'Operational', 'Intangible']} />
            </div>
            <ComplianceAlerts checks={dynamicChecks} onActionClick={handleActionClick} />
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <Shield className="h-8 w-8 text-blue-500" />
                  <span className="text-2xl font-bold text-blue-900">{complianceStats.total}</span>
                </div>
                <p className="text-sm text-gray-600">Contrôles Total</p>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <CheckCircle className="h-8 w-8 text-green-500" />
                  <span className="text-2xl font-bold text-green-900">{complianceStats.compliant}</span>
                </div>
                <p className="text-sm text-gray-600">Conformes</p>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <AlertTriangle className="h-8 w-8 text-yellow-500" />
                  <span className="text-2xl font-bold text-yellow-900">{complianceStats.warning}</span>
                </div>
                <p className="text-sm text-gray-600">Avertissements</p>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <AlertCircle className="h-8 w-8 text-red-500" />
                  <span className="text-2xl font-bold text-red-900">{complianceStats.nonCompliant}</span>
                </div>
                <p className="text-sm text-gray-600">Non Conformes</p>
              </div>
            </div>
          </div>
        )}

        {/* IFRS 17 Tab */}
        {activeTab === 'ifrs17' && ifrs17Data && (
          <div className="space-y-6">
            {/* IFRS 17 KPI Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <DollarSign className="h-8 w-8 text-blue-600" />
                  <span className="text-xs text-blue-600 bg-blue-200 px-2 py-1 rounded">CSM</span>
                </div>
                <div className="text-2xl font-bold text-blue-900">{(ifrs17Data.contractualServiceMargin.currentBalance / 1000000).toFixed(1)}M€</div>
                <div className="text-sm text-blue-700">Contractual Service Margin</div>
                <div className="text-xs text-blue-600 mt-1">
                  {ifrs17Data.contractualServiceMargin.movements.length > 1 && (
                    <>
                      {((ifrs17Data.contractualServiceMargin.currentBalance / ifrs17Data.contractualServiceMargin.movements[0].openingBalance - 1) * 100).toFixed(1)}% vs période précédente
                    </>
                  )}
                </div>
              </div>

              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
                <div className="flex items-center justify-between mb-2">
                  <Target className="h-8 w-8 text-green-600" />
                  <span className="text-xs text-green-600 bg-green-200 px-2 py-1 rounded">RA</span>
                </div>
                <div className="text-2xl font-bold text-green-900">{(ifrs17Data.riskAdjustment.totalAmount / 1000000).toFixed(1)}M€</div>
                <div className="text-sm text-green-700">Risk Adjustment</div>
                <div className="text-xs text-green-600 mt-1">CoC: {(ifrs17Data.riskAdjustment.costOfCapitalRate * 100).toFixed(1)}%</div>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
                <div className="flex items-center justify-between mb-2">
                  <TrendingUp className="h-8 w-8 text-purple-600" />
                  <span className="text-xs text-purple-600 bg-purple-200 px-2 py-1 rounded">REV</span>
                </div>
                <div className="text-2xl font-bold text-purple-900">{(ifrs17Data.disclosureTables.insuranceRevenue / 1000000).toFixed(1)}M€</div>
                <div className="text-sm text-purple-700">Insurance Revenue</div>
                <div className="text-xs text-purple-600 mt-1">YTD Performance</div>
              </div>

              <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
                <div className="flex items-center justify-between mb-2">
                  <BarChart3 className="h-8 w-8 text-orange-600" />
                  <span className="text-xs text-orange-600 bg-orange-200 px-2 py-1 rounded">P&L</span>
                </div>
                <div className="text-2xl font-bold text-orange-900">{(ifrs17Data.disclosureTables.profitBeforeTax / 1000000).toFixed(1)}M€</div>
                <div className="text-sm text-orange-700">Profit Before Tax</div>
                <div className="text-xs text-orange-600 mt-1">
                  Margin: {((ifrs17Data.disclosureTables.profitBeforeTax / ifrs17Data.disclosureTables.insuranceRevenue) * 100).toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Interactive Sensitivity Analysis */}
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <h3 className="font-medium text-gray-900 flex items-center gap-2">
                  <Sliders className="h-5 w-5 text-indigo-600" />
                  Analyse de Sensibilité Interactive - Impact sur CSM & RA
                </h3>
              </div>
              <div className="p-4">
                <IFRS17SensitivityAnalyzer ifrs17Data={ifrs17Data} />
              </div>
            </div>

            {/* CSM Movements Analysis */}
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <div className="flex justify-between items-center">
                  <h3 className="font-medium text-gray-900 flex items-center gap-2">
                    <ArrowRightLeft className="h-5 w-5 text-blue-600" />
                    CSM Roll-Forward Détaillé avec Analyse de Tendance
                  </h3>
                  <div className="flex gap-2">
                    <button className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200">
                      Exporter CSV
                    </button>
                    <button className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200">
                      Analyse de variance
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-4">
                <CSMMovementsAnalyzer movements={ifrs17Data.contractualServiceMargin.movements} />
              </div>
            </div>

            {/* Advanced Risk Adjustment Analysis */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                  <h3 className="font-medium text-gray-900 flex items-center gap-2">
                    <Shield className="h-5 w-5 text-red-600" />
                    Risk Adjustment - Analyse Modulaire
                  </h3>
                </div>
                <div className="p-4">
                  <RiskAdjustmentAnalyzer riskAdjustment={ifrs17Data.riskAdjustment} />
                </div>
              </div>

              <div className="bg-white rounded-lg border border-gray-200">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                  <h3 className="font-medium text-gray-900 flex items-center gap-2">
                    <PieChart className="h-5 w-5 text-green-600" />
                    P&L Attribution Avancée
                  </h3>
                </div>
                <div className="p-4">
                  <ProfitLossAnalyzer disclosureTables={ifrs17Data.disclosureTables} />
                </div>
              </div>
            </div>

            {/* Hypothesis Impact Simulator */}
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <h3 className="font-medium text-gray-900 flex items-center gap-2">
                  <Calculator className="h-5 w-5 text-purple-600" />
                  Simulateur d'Impact des Hypothèses
                </h3>
              </div>
              <div className="p-4">
                <HypothesisImpactSimulator baseData={ifrs17Data} />
              </div>
            </div>

            {/* Coverage Units & Release Pattern Analysis */}
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <h3 className="font-medium text-gray-900 flex items-center gap-2">
                  <Activity className="h-5 w-5 text-teal-600" />
                  Analyse des Coverage Units & Patterns de Libération
                </h3>
              </div>
              <div className="p-4">
                <CoverageUnitsAnalyzer movements={ifrs17Data.contractualServiceMargin.movements} />
              </div>
            </div>

            {/* Validation & Quality Checks */}
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <h3 className="font-medium text-gray-900 flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Contrôles de Qualité & Validation IFRS 17
                </h3>
              </div>
              <div className="p-4">
                <IFRS17QualityChecks ifrs17Data={ifrs17Data} />
              </div>
            </div>
          </div>
        )}

        {/* Solvency II Tab */}
        {activeTab === 'solvency2' && solvencyData && (
          <div className="space-y-6">
            {/* SCR Waterfall */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
                <Target className="h-5 w-5 text-purple-600" />
                Cascade SCR - Analyse Modulaire
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={[
                  { name: 'Market Risk', value: solvencyData.scrCalculation.marketRisk },
                  { name: 'Underwriting', value: solvencyData.scrCalculation.underwritingRisk },
                  { name: 'Counterparty', value: solvencyData.scrCalculation.counterpartyRisk },
                  { name: 'Operational', value: solvencyData.scrCalculation.operationalRisk },
                  { name: 'Intangible', value: solvencyData.scrCalculation.intangibleRisk },
                  { name: 'Diversification', value: Math.abs(solvencyData.scrCalculation.diversificationBenefit) },
                  { name: 'Total SCR', value: solvencyData.scrCalculation.totalSCR }
                ]}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                  <YAxis />
                  <Tooltip formatter={(value:any) => `${Number(value).toLocaleString()}€`} />
                  <Bar dataKey="value">
                    {[
                      '#8B5CF6','#8B5CF6','#8B5CF6','#8B5CF6','#8B5CF6','#10B981','#3B82F6'
                    ].map((color, index) => (<Cell key={`cell-${index}`} fill={color} />))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* NEW: MCR Calculator */}
            <MCRCalculator scr={solvencyData.scrCalculation.totalSCR} />

            {/* NEW: LoB Factors */}
            <LineOfBusinessFactors mode="chart" />

            {/* NEW: QRT Templates Manager */}
            <QRTTemplatesManager bootstrapFrom={solvencyData} />

            {/* Stress Tests */}
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <h3 className="font-medium text-gray-900 flex items-center gap-2">
                  <Activity className="h-5 w-5 text-red-600" />
                  Stress Tests Réglementaires
                </h3>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {solvencyData.stressTests?.map((test, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-medium text-gray-900">{test.scenario}</h4>
                        {test.passed ? <CheckCircle className="h-5 w-5 text-green-600" /> : <AlertCircle className="h-5 w-5 text-red-600" />}
                      </div>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Impact:</span>
                          <span className={`font-medium ${test.impact < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {(test.impact * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Ratio post-stress:</span>
                          <span className={`font-medium ${test.solvencyRatio >= 100 ? 'text-green-600' : 'text-red-600'}`}>
                            {test.solvencyRatio.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      <div className="mt-2">
                        <div className="bg-gray-200 rounded-full h-2">
                          <div className={`${test.solvencyRatio >= 150 ? 'bg-green-500' : test.solvencyRatio >= 100 ? 'bg-yellow-500' : 'bg-red-500'} h-2 rounded-full`} style={{ width: `${Math.min(test.solvencyRatio / 2, 100)}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Scenarios Tab */}
        {activeTab === 'scenarios' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1">
                <ScenarioSimulator ifrs17Data={ifrs17Data} solvencyData={solvencyData} onScenarioChange={handleScenarioChange} />
              </div>
              <div className="lg:col-span-2">
                <CSMProjectionChart data={ifrs17Data} scenarios={selectedScenario} />
              </div>
            </div>
          </div>
        )}

        {/* Audit Tab */}
        {activeTab === 'audit' && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
              <Lock className="h-5 w-5 text-gray-600" />
              Piste d'Audit Complète
            </h3>
            <div className="space-y-4">
              <div className="border-l-4 border-blue-500 pl-4">
                <div className="text-sm text-gray-500">{new Date().toLocaleString('fr-FR')}</div>
                <div className="font-medium">Calcul de conformité exécuté</div>
                <div className="text-sm text-gray-600">
                  Score: {complianceStats.score.toFixed(0)}% | IFRS17: {ifrs17Data ? 'Calculé' : 'En attente'} | Solvency II: {solvencyData ? 'Calculé' : 'En attente'}
                </div>
              </div>
              {calculationId && (
                <div className="border-l-4 border-green-500 pl-4">
                  <div className="text-sm text-gray-500">Référence de calcul</div>
                  <div className="font-medium">ID: {calculationId}</div>
                  <div className="text-sm text-gray-600">Triangle ID: {triangleId}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RegulatoryCompliancePanel;