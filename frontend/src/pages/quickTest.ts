// quickTest.ts - Script pour tester rapidement les calculs

import testData from './testData';

export const runQuickTests = () => {
  console.log('🧪 Tests du Centre de Conformité Réglementaire');
  console.log('=' .repeat(50));
  
  // Test 1: Vérification des données de base
  console.log('\n📊 Test 1: Données de base');
  console.log(`Ultimate Claims: ${(testData.result.summary.ultimate / 1e6).toFixed(1)}M€`);
  console.log(`Outstanding Reserves: ${(testData.result.summary.outstanding / 1e6).toFixed(1)}M€`);
  console.log(`Combined Ratio: ${testData.kpi.combinedRatio}%`);
  console.log(`SCR Ratio: ${testData.kpi.solvencyMetrics.scrRatio}%`);
  
  // Test 2: Calculs IFRS 17 basiques
  console.log('\n📈 Test 2: Calculs IFRS 17');
  const expectedCSM = testData.result.summary.outstanding * 0.12; // 12% margin
  const riskAdjustment = testData.result.summary.outstanding * 0.075; // 7.5% RA
  console.log(`CSM Estimé: ${(expectedCSM / 1e6).toFixed(1)}M€`);
  console.log(`Risk Adjustment Estimé: ${(riskAdjustment / 1e6).toFixed(1)}M€`);
  
  // Test 3: Calculs Solvency II basiques  
  console.log('\n🛡️ Test 3: Calculs Solvency II');
  const marketRisk = testData.result.summary.outstanding * 0.18;
  const underwritingRisk = testData.result.summary.outstanding * 0.15;
  const estimatedSCR = Math.sqrt(marketRisk**2 + underwritingRisk**2) * 0.78; // Avec diversification
  console.log(`SCR Estimé: ${(estimatedSCR / 1e6).toFixed(1)}M€`);
  console.log(`Own Funds: ${(testData.kpi.solvencyMetrics.ownFunds / 1e6).toFixed(1)}M€`);
  
  // Test 4: Cohérence des ratios
  console.log('\n🔍 Test 4: Validation des ratios');
  const calculatedSCRRatio = (testData.kpi.solvencyMetrics.ownFunds / testData.kpi.solvencyMetrics.scr) * 100;
  const ratioMatch = Math.abs(calculatedSCRRatio - testData.kpi.solvencyMetrics.scrRatio) < 1;
  console.log(`SCR Ratio calculé: ${calculatedSCRRatio.toFixed(1)}%`);
  console.log(`SCR Ratio reporté: ${testData.kpi.solvencyMetrics.scrRatio}%`);
  console.log(`Cohérence: ${ratioMatch ? '✅ OK' : '❌ Erreur'}`);
  
  // Test 5: Validation triangles
  console.log('\n📐 Test 5: Validation triangles');
  const totalByYear = testData.result.byYear.reduce((sum, year) => sum + year.ultimate, 0);
  const triangleMatch = Math.abs(totalByYear - testData.result.summary.ultimate) < 100000;
  console.log(`Total par année: ${(totalByYear / 1e6).toFixed(1)}M€`);
  console.log(`Total résumé: ${(testData.result.summary.ultimate / 1e6).toFixed(1)}M€`);
  console.log(`Cohérence: ${triangleMatch ? '✅ OK' : '❌ Erreur'}`);
  
  // Résumé
  console.log('\n📋 Résumé des tests');
  const allTestsPassed = ratioMatch && triangleMatch;
  console.log(`Status global: ${allTestsPassed ? '✅ Tous les tests passés' : '❌ Certains tests échoués'}`);
  console.log('\n💡 Vous pouvez maintenant utiliser ces données avec votre composant RegulatoryCompliancePanel');
  
  return {
    passed: allTestsPassed,
    results: {
      ratioMatch,
      triangleMatch,
      estimatedCSM: expectedCSM,
      estimatedRA: riskAdjustment,
      estimatedSCR: estimatedSCR
    }
  };
};

// Utilitaire pour générer des variations de données
export const generateTestVariations = () => {
  return {
    // Scénario optimiste
    optimistic: {
      ...testData.props,
      extendedKPI: {
        ...testData.kpi,
        combinedRatio: 87.5,
        solvencyMetrics: {
          ...testData.kpi.solvencyMetrics,
          scrRatio: 195.8,
          mcrRatio: 312.4
        }
      }
    },
    
    // Scénario de stress
    stress: {
      ...testData.props,
      extendedKPI: {
        ...testData.kpi,
        combinedRatio: 118.2,
        solvencyMetrics: {
          ...testData.kpi.solvencyMetrics,
          scrRatio: 78.9, // En dessous du seuil
          mcrRatio: 125.6
        }
      }
    }
  };
};

// Export pour utilisation dans vos tests
export default {
  runQuickTests,
  generateTestVariations,
  testData
};