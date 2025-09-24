# backend/examples/actuarial_methods_usage.py

"""
Exemple d'utilisation complète des méthodes actuarielles

Ce script démontre comment utiliser toutes les méthodes actuarielles
implémentées, de la validation des données jusqu'aux comparaisons multi-méthodes.
"""

import asyncio
import json
from typing import List, Dict, Any
from datetime import datetime

# Imports des méthodes actuarielles
from app.actuarial.methods import (
    method_registry,
    create_method,
    list_available_methods,
    get_methods_by_category,
    compare_methods
)
from app.actuarial.base.method_interface import (
    create_triangle_data,
    compare_calculation_results
)
from app.actuarial.base.triangle_utils import (
    validate_triangle_data,
    quick_triangle_analysis,
    format_triangle_for_display
)

def create_sample_triangle() -> List[List[float]]:
    """Créer un triangle d'exemple pour les démonstrations"""
    return [
        [1000000, 1400000, 1650000, 1750000, 1800000],  # Année d'accident la plus ancienne
        [1100000, 1600000, 1900000, 2100000],           # Année d'accident -1
        [1200000, 1800000, 2200000],                     # Année d'accident -2 
        [1300000, 2000000],                              # Année d'accident -3
        [1400000]                                        # Année d'accident la plus récente
    ]

def print_section(title: str):
    """Imprimer une section avec formatage"""
    print("\n" + "="*80)
    print(f"  {title}")
    print("="*80)

def print_results_summary(results: List, title: str = "RÉSULTATS"):
    """Imprimer un résumé des résultats"""
    print(f"\n📊 {title}")
    print("-" * 60)
    
    for result in results:
        if hasattr(result, 'method_name'):
            # C'est un CalculationResult
            print(f"• {result.method_name}")
            print(f"  Ultimate: {result.ultimate_total:,.0f} EUR")
            print(f"  Réserves: {result.reserves:,.0f} EUR")
            print(f"  Temps: {result.calculation_time:.3f}s")
            if result.warnings:
                print(f"  ⚠️  {len(result.warnings)} avertissement(s)")
            print()
        else:
            # C'est un dictionnaire
            print(f"• {result}")

async def demo_basic_usage():
    """Démonstration de l'utilisation de base"""
    print_section("DÉMONSTRATION D'UTILISATION DE BASE")
    
    # 1. Créer des données triangle
    print("1️⃣ Création des données triangle...")
    sample_data = create_sample_triangle()
    triangle_data = create_triangle_data(
        data=sample_data,
        currency="EUR",
        business_line="Motor Insurance",
        metadata={"source": "demo", "created": datetime.now().isoformat()}
    )
    
    print(f"   Triangle créé: {len(triangle_data.data)} années d'accident")
    print(f"   Devise: {triangle_data.currency}")
    print(f"   Ligne: {triangle_data.business_line}")
    
    # 2. Validation du triangle
    print("\n2️⃣ Validation du triangle...")
    validation_errors = validate_triangle_data(triangle_data.data)
    if validation_errors:
        print(f"   ❌ Erreurs détectées: {validation_errors}")
    else:
        print("   ✅ Triangle valide")
    
    # 3. Analyse rapide
    print("\n3️⃣ Analyse rapide du triangle...")
    analysis = quick_triangle_analysis(triangle_data.data)
    stats = analysis["basic_stats"]
    print(f"   • Points de données: {stats['data_points']}")
    print(f"   • Densité: {stats['density']:.1%}")
    print(f"   • Total payé: {stats['total_paid']:,.0f} EUR")
    print(f"   • Ultimate estimé (CL): {stats['total_ultimate_estimate']:,.0f} EUR")
    
    # 4. Calcul avec Chain Ladder
    print("\n4️⃣ Calcul Chain Ladder...")
    chain_ladder = create_method("chain_ladder")
    cl_result = chain_ladder.calculate(triangle_data)
    
    print(f"   ✅ Chain Ladder terminé en {cl_result.calculation_time:.3f}s")
    print(f"   💰 Ultimate total: {cl_result.ultimate_total:,.0f} EUR")
    print(f"   📊 Réserves: {cl_result.reserves:,.0f} EUR")
    print(f"   🔢 Facteurs: {[f'{f:.3f}' for f in cl_result.development_factors]}")
    
    return triangle_data, cl_result

async def demo_all_methods():
    """Démonstration de toutes les méthodes"""
    print_section("DÉMONSTRATION DE TOUTES LES MÉTHODES")
    
    # Données
    triangle_data = create_triangle_data(create_sample_triangle())
    
    # Lister toutes les méthodes
    print("1️⃣ Méthodes disponibles...")
    methods = list_available_methods()
    print(f"   Total: {len(methods)} méthodes")
    
    for method in methods:
        status = "✅" if method["recommended"] else "ℹ️"
        print(f"   {status} {method['name']} ({method['category']}) - Précision: {method['accuracy']}%")
    
    # Calculer avec chaque méthode
    print("\n2️⃣ Calculs avec toutes les méthodes...")
    results = []
    
    for method_info in methods:
        method_id = method_info["method_id"]
        try:
            print(f"   🔄 {method_info['name']}...")
            
            method = create_method(method_id)
            result = method.calculate(triangle_data)
            results.append(result)
            
            print(f"      ✅ {result.ultimate_total:,.0f} EUR en {result.calculation_time:.3f}s")
            
        except Exception as e:
            print(f"      ❌ Erreur: {str(e)[:60]}...")
    
    print_results_summary(results, "RÉSULTATS DE TOUTES LES MÉTHODES")
    
    return results

async def demo_method_comparison():
    """Démonstration de la comparaison de méthodes"""
    print_section("COMPARAISON DE MÉTHODES")
    
    triangle_data = create_triangle_data(create_sample_triangle())
    
    # Sélectionner quelques méthodes pour comparaison
    methods_to_compare = ["chain_ladder", "cape_cod", "bornhuetter_ferguson", "mack_method"]
    
    print("1️⃣ Méthodes sélectionnées pour comparaison:")
    for method_id in methods_to_compare:
        try:
            method_info = method_registry.get_method_info(method_id)
            print(f"   • {method_info['name']} ({method_info['category']})")
        except:
            print(f"   ❌ {method_id} non disponible")
    
    # Calculer avec chaque méthode
    print("\n2️⃣ Calculs comparatifs...")
    results = []
    
    for method_id in methods_to_compare:
        try:
            method = create_method(method_id)
            
            # Paramètres spécifiques selon la méthode
            if method_id == "cape_cod":
                result = method.calculate(triangle_data, expected_loss_ratio=0.75)
            elif method_id == "bornhuetter_ferguson":
                result = method.calculate(triangle_data, expected_loss_ratio=0.70)
            else:
                result = method.calculate(triangle_data)
            
            results.append(result)
            print(f"   ✅ {method.method_name}: {result.ultimate_total:,.0f} EUR")
            
        except Exception as e:
            print(f"   ❌ {method_id}: {str(e)[:50]}...")
    
    # Comparaison statistique
    if len(results) >= 2:
        print("\n3️⃣ Analyse comparative...")
        comparison = compare_calculation_results(results)
        
        ult_stats = comparison["ultimate_total"]
        print(f"   💰 Ultimate - Min: {ult_stats['min']:,.0f}, Max: {ult_stats['max']:,.0f}, Moyenne: {ult_stats['mean']:,.0f}")
        print(f"   📊 Écart: {ult_stats['range']:,.0f} EUR ({ult_stats['cv']:.1%} CV)")
        
        res_stats = comparison["reserves"] 
        print(f"   🏦 Réserves - Min: {res_stats['min']:,.0f}, Max: {res_stats['max']:,.0f}, Moyenne: {res_stats['mean']:,.0f}")
        print(f"   ⏱️  Temps moyen: {sum(comparison['calculation_times'])/len(comparison['calculation_times']):.3f}s")
        
    return results, comparison if len(results) >= 2 else None

async def demo_advanced_features():
    """Démonstration des fonctionnalités avancées"""
    print_section("FONCTIONNALITÉS AVANCÉES")
    
    triangle_data = create_triangle_data(create_sample_triangle())
    
    # 1. Analyse détaillée du triangle
    print("1️⃣ Analyse avancée du triangle...")
    analysis = quick_triangle_analysis(triangle_data.data)
    
    print(f"   • Facteurs de développement: {[f'{f:.3f}' for f in analysis['development_factors']]}")
    print(f"   • Outliers IQR: {len(analysis['outliers_iqr'])}")
    print(f"   • Effets calendaires: {len(analysis['calendar_effects'])} années")
    
    # 2. Méthode stochastique (Mack)
    print("\n2️⃣ Méthode stochastique - Mack...")
    try:
        mack = create_method("mack_method")
        mack_result = mack.calculate(
            triangle_data, 
            confidence_level=0.95,
            bootstrap_iterations=500
        )
        
        print(f"   ✅ Mack terminé: {mack_result.ultimate_total:,.0f} EUR")
        
        # Intervalles de confiance
        confidence_intervals = mack_result.metadata.get("confidence_intervals")
        if confidence_intervals:
            print(f"   📊 IC 95%: [{confidence_intervals['lower_bounds'][-1]:,.0f}, {confidence_intervals['upper_bounds'][-1]:,.0f}]")
        
        # Diagnostics stochastiques
        cv_total = mack_result.diagnostics.get("coefficient_of_variation", 0)
        print(f"   📈 Coefficient de variation: {cv_total:.1%}")
        
    except Exception as e:
        print(f"   ❌ Erreur Mack: {str(e)[:50]}...")
    
    # 3. Machine Learning
    print("\n3️⃣ Méthodes Machine Learning...")
    ml_methods = ["gradient_boosting", "neural_network", "random_forest"]
    
    for ml_method_id in ml_methods:
        try:
            print(f"   🤖 {ml_method_id}...")
            ml_method = create_method(ml_method_id)
            
            # Paramètres réduits pour la démo
            if ml_method_id == "gradient_boosting":
                ml_result = ml_method.calculate(triangle_data, n_estimators=20, learning_rate=0.2)
            elif ml_method_id == "neural_network":
                ml_result = ml_method.calculate(triangle_data, epochs=20, hidden_layers=[32, 16])
            else:  # random_forest
                ml_result = ml_result = ml_method.calculate(triangle_data, n_estimators=20, max_depth=5)
            
            print(f"      ✅ {ml_result.ultimate_total:,.0f} EUR en {ml_result.calculation_time:.3f}s")
            
            # Feature importance si disponible
            feature_importance = ml_result.metadata.get("feature_importance")
            if feature_importance:
                top_features = list(feature_importance.keys())[:3]
                print(f"      🎯 Top features: {top_features}")
            
        except Exception as e:
            print(f"      ❌ {ml_method_id}: {str(e)[:50]}...")

async def demo_api_integration():
    """Démonstration de l'intégration API"""
    print_section("INTÉGRATION API (Simulation)")
    
    # Simuler des appels API
    print("1️⃣ Simulation d'appels API...")
    
    # Liste des méthodes
    print("   GET /actuarial/methods")
    methods = list_available_methods()
    print(f"      → {len(methods)} méthodes retournées")
    
    # Méthodes par catégorie
    print("   GET /actuarial/methods/by-category")
    by_category = get_methods_by_category()
    for category, methods_list in by_category.items():
        print(f"      → {category}: {len(methods_list)} méthodes")
    
    # Comparaison de méthodes
    print("   POST /actuarial/methods/compare")
    comparison = compare_methods(["chain_ladder", "cape_cod", "mack_method"])
    print(f"      → {len(comparison['methods'])} méthodes comparées")
    
    # Calcul simple (simulation)
    print("   POST /actuarial/calculate")
    triangle_data = create_triangle_data(create_sample_triangle())
    chain_ladder = create_method("chain_ladder")
    result = chain_ladder.calculate(triangle_data)
    print(f"      → Ultimate: {result.ultimate_total:,.0f} EUR")
    
    print("\n2️⃣ Format de réponse API (exemple):")
    api_response = {
        "success": True,
        "result": {
            "method_name": result.method_name,
            "ultimate_total": result.ultimate_total,
            "reserves": result.reserves,
            "calculation_time": result.calculation_time
        },
        "summary": result.get_summary()
    }
    print(json.dumps(api_response, indent=2, default=str))

def print_triangle_formatted(triangle_data: List[List[float]], title: str = "Triangle"):
    """Afficher un triangle formaté"""
    print(f"\n{title}:")
    formatted = format_triangle_for_display(triangle_data, precision=0)
    
    for i, row in enumerate(formatted):
        year_label = f"AY-{len(formatted)-1-i:2d}"
        values = "  ".join(f"{val:>12}" for val in row)
        print(f"  {year_label}: {values}")

async def run_complete_demo():
    """Lancer la démonstration complète"""
    print("🎯 DÉMONSTRATION COMPLÈTE DES MÉTHODES ACTUARIELLES")
    print("=" * 80)
    print("Cette démonstration présente toutes les fonctionnalités disponibles")
    print("dans le système de méthodes actuarielles.")
    
    try:
        # 1. Utilisation de base
        triangle_data, cl_result = await demo_basic_usage()
        
        # Afficher le triangle
        print_triangle_formatted(triangle_data.data, "Triangle d'exemple")
        
        # 2. Toutes les méthodes
        all_results = await demo_all_methods()
        
        # 3. Comparaison
        comp_results, comparison = await demo_method_comparison()
        
        # 4. Fonctionnalités avancées
        await demo_advanced_features()
        
        # 5. API
        await demo_api_integration()
        
        # Résumé final
        print_section("RÉSUMÉ FINAL")
        print(f"✅ Démonstration terminée avec succès!")
        print(f"📊 {len(all_results)} méthodes testées")
        print(f"🔄 {len(comp_results)} méthodes comparées") 
        print(f"⏱️  Temps total: ~{sum(r.calculation_time for r in all_results):.2f}s")
        
        # Recommandations
        print("\n💡 RECOMMANDATIONS:")
        print("• Chain Ladder: Méthode de référence, toujours utiliser")
        print("• Cape Cod/BF: Pour données limitées avec expertise a priori") 
        print("• Mack: Quand intervalles de confiance requis")
        print("• ML: Pour exploration de patterns complexes (expérimental)")
        print("• Toujours comparer plusieurs méthodes pour validation")
        
        return True
        
    except Exception as e:
        print(f"\n❌ ERREUR dans la démonstration: {str(e)}")
        return False

# Point d'entrée pour les tests
if __name__ == "__main__":
    """
    Lancer la démonstration complète
    
    Usage:
        python -m backend.examples.actuarial_methods_usage
    """
    
    import sys
    import os
    
    # Ajouter le répertoire parent au path pour les imports
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    
    # Lancer la démo
    success = asyncio.run(run_complete_demo())
    sys.exit(0 if success else 1)

# Classes utilitaires pour les tests avancés
class MethodTester:
    """Classe pour tester systématiquement les méthodes"""
    
    def __init__(self):
        self.results = {}
        self.errors = {}
    
    async def test_all_methods(self, triangle_data, test_name="default"):
        """Tester toutes les méthodes disponibles"""
        methods = list_available_methods()
        
        for method_info in methods:
            method_id = method_info["method_id"]
            try:
                method = create_method(method_id)
                result = method.calculate(triangle_data)
                
                self.results[method_id] = {
                    "test_name": test_name,
                    "ultimate": result.ultimate_total,
                    "reserves": result.reserves,
                    "time": result.calculation_time,
                    "warnings": len(result.warnings)
                }
                
            except Exception as e:
                self.errors[method_id] = str(e)
    
    def get_test_summary(self) -> Dict[str, Any]:
        """Obtenir un résumé des tests"""
        return {
            "methods_tested": len(self.results),
            "methods_failed": len(self.errors),
            "success_rate": len(self.results) / (len(self.results) + len(self.errors)) if (len(self.results) + len(self.errors)) > 0 else 0,
            "results": self.results,
            "errors": self.errors
        }

class PerformanceBenchmark:
    """Classe pour benchmarker les performances"""
    
    def __init__(self):
        self.benchmarks = {}
    
    async def benchmark_method(self, method_id: str, triangle_data, iterations: int = 5):
        """Benchmarker une méthode spécifique"""
        times = []
        
        for _ in range(iterations):
            method = create_method(method_id)
            start_time = datetime.now()
            result = method.calculate(triangle_data)
            end_time = datetime.now()
            
            times.append((end_time - start_time).total_seconds())
        
        self.benchmarks[method_id] = {
            "mean_time": sum(times) / len(times),
            "min_time": min(times),
            "max_time": max(times),
            "iterations": iterations
        }
    
    def get_benchmark_results(self) -> Dict[str, Any]:
        """Obtenir les résultats de benchmark"""
        return self.benchmarks

# Documentation intégrée
USAGE_DOCUMENTATION = """
GUIDE D'UTILISATION DES MÉTHODES ACTUARIELLES
============================================

1. MÉTHODES DISPONIBLES:
   • Chain Ladder: Méthode de référence déterministe
   • Cape Cod: Chain Ladder + a priori
   • Bornhuetter-Ferguson: Pondération par maturité
   • Mack: Chain Ladder stochastique avec IC
   • Expected Loss Ratio: Méthode simple a priori
   • Gradient Boosting: ML avec arbres boostés
   • Neural Network: Réseau de neurones
   • Random Forest: Ensemble d'arbres

2. UTILISATION BASIQUE:
```python
from app.actuarial.methods import create_method
from app.actuarial.base.method_interface import create_triangle_data

# Créer les données
triangle_data = create_triangle_data(your_triangle_data)

# Utiliser une méthode
method = create_method("chain_ladder")
result = method.calculate(triangle_data)

print(f"Ultimate: {result.ultimate_total}")
```

3. COMPARAISON MULTI-MÉTHODES:
```python
from app.actuarial.base.method_interface import compare_calculation_results

methods = ["chain_ladder", "cape_cod", "mack_method"]
results = []

for method_id in methods:
    method = create_method(method_id)
    result = method.calculate(triangle_data)
    results.append(result)

comparison = compare_calculation_results(results)
```

4. VALIDATION ET ANALYSE:
```python
from app.actuarial.base.triangle_utils import validate_triangle_data, quick_triangle_analysis

# Validation
errors = validate_triangle_data(your_data)
if errors:
    print("Erreurs:", errors)

# Analyse complète
analysis = quick_triangle_analysis(your_data)
print("Stats:", analysis["basic_stats"])
```

5. API REST:
   POST /actuarial/calculate
   POST /actuarial/calculate/multi-method
   GET  /actuarial/methods
   POST /actuarial/triangle/analyze

6. BONNES PRATIQUES:
   • Toujours valider les données avant calcul
   • Comparer plusieurs méthodes
   • Analyser les avertissements
   • Utiliser Mack pour les intervalles de confiance
   • ML pour exploration (avec prudence)
"""

def print_documentation():
    """Imprimer la documentation d'usage"""
    print(USAGE_DOCUMENTATION)