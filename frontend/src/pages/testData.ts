// ============================== DONNÉES DE TEST POUR IFRS 17 & SOLVENCY II ==============================

// Triangle de développement des sinistres (en millions d'euros)
export const testTriangleData = {
  // Année d'accident x Année de développement
  claimsTriangle: [
    // AY 2019
    [45.2, 52.1, 58.3, 61.7, 63.2, 64.1], 
    // AY 2020  
    [48.7, 56.9, 64.2, 68.1, 70.3, null],
    // AY 2021
    [52.3, 61.4, 69.8, 74.2, null, null],
    // AY 2022
    [49.8, 58.7, 66.9, null, null, null],
    // AY 2023
    [54.6, 64.2, null, null, null, null],
    // AY 2024
    [51.9, null, null, null, null, null]
  ],
  
  // Primes souscrites par année d'accident
  premiums: [
    { year: 2019, amount: 85.5 },
    { year: 2020, amount: 89.2 },
    { year: 2021, amount: 92.8 },
    { year: 2022, amount: 87.4 },
    { year: 2023, amount: 94.1 },
    { year: 2024, amount: 88.7 }
  ],
  
  // Metadata
  currency: 'EUR',
  unit: 'millions',
  lob: 'Motor Third Party Liability',
  lastUpdated: '2024-12-15'
};

// Résultats de calculs actuariels simulés
export const testActuarialResult = {
  summary: {
    ultimate: 425_600_000, // Total ultimate des sinistres
    paid: 298_400_000,     // Total payé à ce jour
    outstanding: 127_200_000, // Réserves outstanding
    ibnr: 45_800_000       // IBNR
  },
  
  // Détail par année d'accident
  byYear: [
    { 
      year: 2019, 
      ultimate: 64_100_000, 
      paid: 62_800_000, 
      outstanding: 1_300_000,
      developmentFactor: 1.02,
      lossRatio: 0.749
    },
    { 
      year: 2020, 
      ultimate: 72_400_000, 
      paid: 68_900_000, 
      outstanding: 3_500_000,
      developmentFactor: 1.05,
      lossRatio: 0.812
    },
    { 
      year: 2021, 
      ultimate: 78_900_000, 
      paid: 71_200_000, 
      outstanding: 7_700_000,
      developmentFactor: 1.11,
      lossRatio: 0.850
    },
    { 
      year: 2022, 
      ultimate: 75_600_000, 
      paid: 64_300_000, 
      outstanding: 11_300_000,
      developmentFactor: 1.18,
      lossRatio: 0.865
    },
    { 
      year: 2023, 
      ultimate: 82_800_000, 
      paid: 58_100_000, 
      outstanding: 24_700_000,
      developmentFactor: 1.42,
      lossRatio: 0.879
    },
    { 
      year: 2024, 
      ultimate: 51_800_000, 
      paid: 33_100_000, 
      outstanding: 18_700_000,
      developmentFactor: 1.56,
      lossRatio: 0.584 // Partiel car année en cours
    }
  ],
  
  // Statistiques de développement
  developmentPatterns: {
    averageFactors: [1.18, 1.12, 1.06, 1.03, 1.01],
    coefficientOfVariation: [0.08, 0.05, 0.03, 0.02, 0.01],
    confidenceIntervals: {
      lower: [1.12, 1.08, 1.04, 1.02, 1.00],
      upper: [1.24, 1.16, 1.08, 1.04, 1.02]
    }
  },
  
  // Méthodes utilisées
  methods: ['Chain Ladder', 'Bornhuetter-Ferguson', 'Expected Loss Ratio'],
  selectedMethod: 'Chain Ladder',
  
  // Date de calcul
  valuationDate: '2024-12-31',
  calculationId: 'CALC_2024_Q4_001'
};

// KPI étendus pour les calculs IFRS 17 & Solvency II
export const testExtendedKPI = {
  // Ratios techniques
  combinedRatio: 94.8,
  lossRatio: 73.2,
  expenseRatio: 21.6,
  commissionRatio: 12.4,
  
  // Métriques de profitabilité
  underwritingResult: 15_800_000,
  investmentIncome: 8_200_000,
  netResult: 24_000_000,
  roe: 12.8, // Return on Equity
  roa: 4.2,  // Return on Assets
  
  // Indicateurs de croissance
  premiumGrowth: 6.8, // en %
  reserveRatio: 28.5, // Réserves / Primes
  
  // Métriques de liquidité
  liquidityRatio: 145.2,
  currentRatio: 167.8,
  
  // Concentration des risques
  largestClaim: 2_400_000,
  top10ClaimsRatio: 18.5, // % du total
  
  // Indicateurs de performance actuarielle
  priorYearDevelopment: -2_100_000, // Boni de liquidation
  developmentRatio: -2.4, // en % des réserves
  
  // Données pour Solvency II
  solvencyMetrics: {
    scrRatio: 158.4,
    mcrRatio: 234.7,
    ownFunds: 245_600_000,
    scr: 154_800_000,
    mcr: 104_500_000
  },
  
  // Répartition par ligne d'activité
  businessLines: {
    motor_tpl: { premiums: 425_000_000, reserves: 287_000_000 },
    motor_other: { premiums: 185_000_000, reserves: 92_000_000 },
    property: { premiums: 230_000_000, reserves: 145_000_000 },
    liability: { premiums: 78_000_000, reserves: 89_000_000 },
    misc: { premiums: 52_000_000, reserves: 34_000_000 }
  },
  
  // Informations temporelles
  reportingPeriod: '2024-Q4',
  lastUpdate: '2024-12-31T23:59:59Z'
};

// Données complémentaires pour tests avancés
export const testMarketData = {
  riskFreeRates: {
    '1Y': 0.035,
    '5Y': 0.042,
    '10Y': 0.048,
    '20Y': 0.051
  },
  
  volatilityAdjustment: 0.0085,
  
  equityStress: {
    type1: 0.39, // Actions cotées
    type2: 0.49  // Actions non cotées
  },
  
  creditSpreads: {
    AAA: 0.012,
    AA: 0.018,
    A: 0.025,
    BBB: 0.045,
    BB: 0.085
  }
};

// Fonction utilitaire pour utiliser ces données avec le composant
export const createTestProps = () => ({
  result: testActuarialResult,
  extendedKPI: testExtendedKPI,
  calculationId: testActuarialResult.calculationId,
  triangleId: 'TRI_MOTOR_TPL_2024_Q4'
});

// Tests de cohérence des données
export const validateTestData = () => {
  const checks = [];
  
  // Vérifier cohérence triangle
  const totalUltimate = testActuarialResult.byYear.reduce((sum, year) => sum + year.ultimate, 0);
  const summaryUltimate = testActuarialResult.summary.ultimate;
  
  checks.push({
    name: 'Triangle Consistency',
    passed: Math.abs(totalUltimate - summaryUltimate) < 100000,
    details: `Total by year: ${totalUltimate}, Summary: ${summaryUltimate}`
  });
  
  // Vérifier cohérence ratios
  const calculatedCombined = testExtendedKPI.lossRatio + testExtendedKPI.expenseRatio;
  checks.push({
    name: 'Combined Ratio Consistency', 
    passed: Math.abs(calculatedCombined - testExtendedKPI.combinedRatio) < 0.1,
    details: `Calculated: ${calculatedCombined}, Reported: ${testExtendedKPI.combinedRatio}`
  });
  
  // Vérifier solvabilité
  const scrCoverage = (testExtendedKPI.solvencyMetrics.ownFunds / testExtendedKPI.solvencyMetrics.scr) * 100;
  checks.push({
    name: 'SCR Coverage Consistency',
    passed: Math.abs(scrCoverage - testExtendedKPI.solvencyMetrics.scrRatio) < 1,
    details: `Calculated: ${scrCoverage.toFixed(1)}%, Reported: ${testExtendedKPI.solvencyMetrics.scrRatio}%`
  });
  
  return checks;
};

// Export par défaut pour utilisation simple
export default {
  triangle: testTriangleData,
  result: testActuarialResult,
  kpi: testExtendedKPI,
  market: testMarketData,
  props: createTestProps(),
  validate: validateTestData
};