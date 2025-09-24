# backend/tests/test_actuarial_methods.py

"""
Suite de tests complète pour les méthodes actuarielles

Ce module teste toutes les méthodes, validations, et utilitaires
avec des cas de test réels et des cas limites.
"""

import pytest
import math
from typing import List, Dict, Any
from datetime import datetime

# Imports à tester
from app.actuarial.methods import (
    method_registry,
    create_method,
    list_available_methods,
    get_method_details,
    search_methods,
    compare_methods
)
from app.actuarial.base.method_interface import (
    TriangleData,
    CalculationResult,
    create_triangle_data,
    compare_calculation_results,
    MethodValidator
)
from app.actuarial.base.triangle_utils import (
    validate_triangle_data,
    calculate_development_factors,
    complete_triangle_with_factors,
    estimate_ultimate_simple,
    calculate_triangle_statistics,
    detect_outliers,
    quick_triangle_analysis
)

# ============================================================================
# Fixtures de test
# ============================================================================

@pytest.fixture
def sample_triangle():
    """Triangle d'exemple pour les tests"""
    return [
        [1000000, 1400000, 1650000, 1750000, 1800000],
        [1100000, 1600000, 1900000, 2100000],
        [1200000, 1800000, 2200000],
        [1300000, 2000000],
        [1400000]
    ]

@pytest.fixture  
def small_triangle():
    """Petit triangle pour tests de cas limites"""
    return [
        [500000, 700000],
        [600000]
    ]

@pytest.fixture
def invalid_triangle():
    """Triangle invalide pour tests d'erreur"""
    return [
        [1000, 800],  # Décroissant - invalide
        [1100, 1500, 1200],  # Décroissant - invalide
        [1200]
    ]

@pytest.fixture
def triangle_data_object(sample_triangle):
    """Objet TriangleData pour tests"""
    return create_triangle_data(
        data=sample_triangle,
        currency="EUR",
        business_line="Motor Insurance"
    )

# ============================================================================
# Tests des utilitaires de base
# ============================================================================

class TestTriangleUtils:
    """Tests des utilitaires de triangle"""
    
    def test_validate_triangle_data_valid(self, sample_triangle):
        """Test validation d'un triangle valide"""
        errors = validate_triangle_data(sample_triangle)
        assert errors == []
    
    def test_validate_triangle_data_invalid(self, invalid_triangle):
        """Test validation d'un triangle invalide"""
        errors = validate_triangle_data(invalid_triangle)
        assert len(errors) > 0
        assert any("décroissante" in error.lower() for error in errors)
    
    def test_validate_triangle_data_empty(self):
        """Test validation triangle vide"""
        errors = validate_triangle_data([])
        assert "Triangle vide" in errors
    
    def test_calculate_development_factors(self, sample_triangle):
        """Test calcul des facteurs de développement"""
        factors = calculate_development_factors(sample_triangle)
        
        assert len(factors) == 4  # 5 périodes - 1
        assert all(f >= 1.0 for f in factors)  # Tous >= 1
        assert isinstance(factors[0], float)
    
    def test_calculate_development_factors_methods(self, sample_triangle):
        """Test différentes méthodes de calcul des facteurs"""
        simple = calculate_development_factors(sample_triangle, "simple_average")
        weighted = calculate_development_factors(sample_triangle, "weighted_average") 
        median = calculate_development_factors(sample_triangle, "median")
        
        assert len(simple) == len(weighted) == len(median)
        assert all(isinstance(f, float) for f in simple + weighted + median)
    
    def test_complete_triangle_with_factors(self, sample_triangle):
        """Test completion du triangle"""
        factors = calculate_development_factors(sample_triangle)
        completed = complete_triangle_with_factors(sample_triangle, factors)
        
        assert len(completed) == len(sample_triangle)
        assert all(len(row) >= len(sample_triangle[i]) for i, row in enumerate(completed))
    
    def test_estimate_ultimate_simple(self, sample_triangle):
        """Test estimation des ultimates"""
        factors = calculate_development_factors(sample_triangle)
        ultimates = estimate_ultimate_simple(sample_triangle, factors)
        
        assert len(ultimates) == len(sample_triangle)
        assert all(isinstance(u, float) and u > 0 for u in ultimates)
        
        # L'ultimate doit être >= à la dernière valeur observée
        for i, (row, ultimate) in enumerate(zip(sample_triangle, ultimates)):
            if row:
                assert ultimate >= row[-1]
    
    def test_calculate_triangle_statistics(self, sample_triangle):
        """Test calcul des statistiques"""
        stats = calculate_triangle_statistics(sample_triangle)
        
        required_keys = [
            "accident_years", "max_development_periods", "data_points",
            "density", "min_value", "max_value", "mean_value", "std_dev"
        ]
        
        for key in required_keys:
            assert key in stats
            assert isinstance(stats[key], (int, float))
        
        assert stats["accident_years"] == 5
        assert 0 <= stats["density"] <= 1
        assert stats["min_value"] <= stats["max_value"]
    
    def test_detect_outliers(self, sample_triangle):
        """Test détection d'outliers"""
        outliers_iqr = detect_outliers(sample_triangle, "iqr")
        outliers_zscore = detect_outliers(sample_triangle, "zscore")
        outliers_ratios = detect_outliers(sample_triangle, "development_ratios")
        
        # Vérifier le format des outliers
        for outlier_list in [outliers_iqr, outliers_zscore, outliers_ratios]:
            assert isinstance(outlier_list, list)
            for outlier in outlier_list:
                assert len(outlier) == 4  # (année, période, valeur, raison)
                assert isinstance(outlier[0], int)  # année
                assert isinstance(outlier[1], int)  # période
                assert isinstance(outlier[2], float)  # valeur
                assert isinstance(outlier[3], str)  # raison
    
    def test_quick_triangle_analysis(self, sample_triangle):
        """Test analyse rapide complète"""
        analysis = quick_triangle_analysis(sample_triangle)
        
        required_keys = [
            "basic_stats", "development_factors", "development_pattern",
            "link_ratios_stability", "outliers_iqr", "validation_errors"
        ]
        
        for key in required_keys:
            assert key in analysis

# ============================================================================
# Tests des interfaces de base
# ============================================================================

class TestMethodInterface:
    """Tests des interfaces de méthodes"""
    
    def test_create_triangle_data(self, sample_triangle):
        """Test création d'objet TriangleData"""
        triangle_data = create_triangle_data(
            data=sample_triangle,
            currency="USD",
            business_line="Property"
        )
        
        assert isinstance(triangle_data, TriangleData)
        assert triangle_data.data == sample_triangle
        assert triangle_data.currency == "USD"
        assert triangle_data.business_line == "Property"
        assert triangle_data.accident_years is not None
        assert triangle_data.development_periods is not None
    
    def test_create_triangle_data_invalid(self, invalid_triangle):
        """Test création avec données invalides"""
        with pytest.raises(ValueError):
            create_triangle_data(invalid_triangle)
    
    def test_method_validator(self, sample_triangle, invalid_triangle):
        """Test du validateur de méthodes"""
        # Triangle valide
        errors_valid = MethodValidator.validate_triangle_structure(sample_triangle)
        assert errors_valid == []
        
        # Triangle invalide
        errors_invalid = MethodValidator.validate_triangle_structure(invalid_triangle)
        assert len(errors_invalid) > 0
        
        # Paramètres
        params = {"learning_rate": 0.1, "n_estimators": 100}
        expected = {"learning_rate": 0.1, "n_estimators": 50, "max_depth": 10}
        
        param_errors = MethodValidator.validate_parameters(params, expected)
        assert isinstance(param_errors, list)

# ============================================================================
# Tests du registry de méthodes  
# ============================================================================

class TestMethodRegistry:
    """Tests du registry de méthodes"""
    
    def test_list_available_methods(self):
        """Test liste des méthodes disponibles"""
        methods = list_available_methods()
        
        assert isinstance(methods, list)
        assert len(methods) > 0
        
        # Vérifier la structure
        for method in methods:
            required_keys = ["method_id", "name", "category", "recommended"]
            for key in required_keys:
                assert key in method
    
    def test_list_methods_by_category(self):
        """Test liste par catégorie"""
        deterministic = list_available_methods(category="deterministic")
        stochastic = list_available_methods(category="stochastic") 
        ml = list_available_methods(category="machine_learning")
        
        for method_list in [deterministic, stochastic, ml]:
            assert isinstance(method_list, list)
            
        # Vérifier les catégories
        for method in deterministic:
            assert method["category"] == "deterministic"
    
    def test_search_methods(self):
        """Test recherche de méthodes"""
        results = search_methods("chain")
        
        assert isinstance(results, list)
        assert any("chain" in r["name"].lower() for r in results)
    
    def test_get_method_details(self):
        """Test détails d'une méthode"""
        details = get_method_details("chain_ladder")
        
        assert isinstance(details, dict)
        assert details["method_id"] == "chain_ladder"
        assert "name" in details
        assert "parameters" in details
    
    def test_get_method_details_invalid(self):
        """Test détails méthode inexistante"""
        with pytest.raises(ValueError):
            get_method_details("nonexistent_method")
    
    def test_create_method(self):
        """Test création d'instance de méthode"""
        method = create_method("chain_ladder")
        
        assert method.method_id == "chain_ladder"
        assert method.method_name == "Chain Ladder"
        assert hasattr(method, "calculate")
        assert hasattr(method, "validate_input")
    
    def test_create_method_invalid(self):
        """Test création méthode inexistante"""
        with pytest.raises(ValueError):
            create_method("invalid_method")
    
    def test_compare_methods_spec(self):
        """Test comparaison des spécifications"""
        comparison = compare_methods(["chain_ladder", "cape_cod"])
        
        assert isinstance(comparison, dict)
        assert "methods" in comparison
        assert "comparison" in comparison

# ============================================================================
# Tests des méthodes actuarielles individuelles
# ============================================================================

class TestDeterministicMethods:
    """Tests des méthodes déterministes"""
    
    def test_chain_ladder_basic(self, triangle_data_object):
        """Test Chain Ladder de base"""
        method = create_method("chain_ladder")
        result = method.calculate(triangle_data_object)
        
        assert isinstance(result, CalculationResult)
        assert result.method_id == "chain_ladder"
        assert result.ultimate_total > 0
        assert result.reserves >= 0
        assert len(result.ultimates_by_year) == len(triangle_data_object.data)
        assert len(result.development_factors) >= 0
        assert isinstance(result.calculation_time, float)
    
    def test_chain_ladder_parameters(self, triangle_data_object):
        """Test Chain Ladder avec paramètres"""
        method = create_method("chain_ladder")
        result = method.calculate(
            triangle_data_object,
            factor_method="weighted_average",
            tail_factor=1.01
        )
        
        assert result.ultimate_total > 0
        # Vérifier que le tail factor a été ajouté
        if result.development_factors:
            assert result.development_factors[-1] >= 1.01
    
    def test_cape_cod_basic(self, triangle_data_object):
        """Test Cape Cod de base"""
        method = create_method("cape_cod")
        result = method.calculate(triangle_data_object, expected_loss_ratio=0.75)
        
        assert isinstance(result, CalculationResult)
        assert result.method_id == "cape_cod"
        assert result.ultimate_total > 0
        assert "expected_loss_ratio" in result.metadata
    
    def test_bornhuetter_ferguson_basic(self, triangle_data_object):
        """Test Bornhuetter-Ferguson de base"""
        method = create_method("bornhuetter_ferguson")
        result = method.calculate(triangle_data_object, expected_loss_ratio=0.70)
        
        assert isinstance(result, CalculationResult)
        assert result.method_id == "bornhuetter_ferguson"
        assert result.ultimate_total > 0
    
    def test_expected_loss_ratio(self, triangle_data_object):
        """Test Expected Loss Ratio"""
        method = create_method("expected_loss_ratio")
        result = method.calculate(triangle_data_object, expected_loss_ratio=0.65)
        
        assert isinstance(result, CalculationResult)
        assert result.ultimate_total > 0
        # ELR ne produit pas de facteurs de développement
        assert len(result.development_factors) == 0

class TestStochasticMethods:
    """Tests des méthodes stochastiques"""
    
    def test_mack_method_basic(self, triangle_data_object):
        """Test méthode de Mack de base"""
        method = create_method("mack_method")
        result = method.calculate(
            triangle_data_object,
            confidence_level=0.95,
            bootstrap_iterations=50  # Réduit pour les tests
        )
        
        assert isinstance(result, CalculationResult)
        assert result.method_id == "mack_method"
        assert result.ultimate_total > 0
        
        # Vérifier la présence des intervalles de confiance
        assert "confidence_intervals" in result.metadata
        ci = result.metadata["confidence_intervals"]
        assert "lower_bounds" in ci
        assert "upper_bounds" in ci
        assert "confidence_level" in ci

class TestMLMethods:
    """Tests des méthodes Machine Learning"""
    
    @pytest.mark.slow
    def test_gradient_boosting_basic(self, triangle_data_object):
        """Test Gradient Boosting - peut être lent"""
        method = create_method("gradient_boosting")
        result = method.calculate(
            triangle_data_object,
            n_estimators=10,  # Réduit pour les tests
            learning_rate=0.2
        )
        
        assert isinstance(result, CalculationResult)
        assert result.method_id == "gradient_boosting"
        assert result.ultimate_total > 0
        assert "feature_importance" in result.metadata
    
    @pytest.mark.slow 
    def test_neural_network_basic(self, triangle_data_object):
        """Test Neural Network - peut être lent"""
        method = create_method("neural_network")
        result = method.calculate(
            triangle_data_object,
            epochs=5,  # Très réduit pour les tests
            hidden_layers=[16, 8]
        )
        
        assert isinstance(result, CalculationResult)
        assert result.method_id == "neural_network"
        assert result.ultimate_total > 0
    
    @pytest.mark.slow
    def test_random_forest_basic(self, triangle_data_object):
        """Test Random Forest - peut être lent"""
        method = create_method("random_forest")
        result = method.calculate(
            triangle_data_object,
            n_estimators=10,  # Réduit pour les tests
            max_depth=3
        )
        
        assert isinstance(result, CalculationResult)
        assert result.method_id == "random_forest"
        assert result.ultimate_total > 0

# ============================================================================
# Tests d'intégration et cas limites
# ============================================================================

class TestIntegrationAndEdgeCases:
    """Tests d'intégration et cas limites"""
    
    def test_small_triangle(self, small_triangle):
        """Test avec très petit triangle"""
        triangle_data = create_triangle_data(small_triangle)
        
        # Chain Ladder devrait fonctionner
        method = create_method("chain_ladder")
        result = method.calculate(triangle_data)
        assert result.ultimate_total > 0
        
        # Les méthodes ML peuvent échouer avec trop peu de données
        with pytest.raises(ValueError):
            ml_method = create_method("gradient_boosting")
            ml_method.calculate(triangle_data)
    
    def test_validation_errors(self, invalid_triangle):
        """Test gestion des erreurs de validation"""
        with pytest.raises(ValueError):
            triangle_data = create_triangle_data(invalid_triangle)
    
    def test_all_methods_with_valid_data(self, triangle_data_object):
        """Test que toutes les méthodes peuvent calculer avec des données valides"""
        methods = list_available_methods()
        successful_methods = []
        failed_methods = []
        
        for method_info in methods:
            method_id = method_info["method_id"]
            try:
                method = create_method(method_id)
                
                # Paramètres réduits pour les tests
                if method_info["category"] == "machine_learning":
                    if "gradient" in method_id:
                        result = method.calculate(triangle_data_object, n_estimators=5)
                    elif "neural" in method_id:
                        result = method.calculate(triangle_data_object, epochs=3, hidden_layers=[8])
                    else:
                        result = method.calculate(triangle_data_object, n_estimators=5, max_depth=3)
                elif method_id == "mack_method":
                    result = method.calculate(triangle_data_object, bootstrap_iterations=20)
                else:
                    result = method.calculate(triangle_data_object)
                
                assert result.ultimate_total > 0
                successful_methods.append(method_id)
                
            except Exception as e:
                failed_methods.append((method_id, str(e)))
        
        # Au moins les méthodes déterministes doivent fonctionner
        deterministic_success = [m for m in successful_methods if m in ["chain_ladder", "cape_cod", "bornhuetter_ferguson", "expected_loss_ratio"]]
        assert len(deterministic_success) >= 3
        
        print(f"✅ Méthodes réussies: {successful_methods}")
        if failed_methods:
            print(f"❌ Méthodes échouées: {failed_methods}")
    
    def test_compare_calculation_results(self, triangle_data_object):
        """Test comparaison de résultats de calcul"""
        # Calculer avec plusieurs méthodes
        results = []
        for method_id in ["chain_ladder", "cape_cod"]:
            method = create_method(method_id)
            if method_id == "cape_cod":
                result = method.calculate(triangle_data_object, expected_loss_ratio=0.75)
            else:
                result = method.calculate(triangle_data_object)
            results.append(result)
        
        # Comparer
        comparison = compare_calculation_results(results)
        
        assert isinstance(comparison, dict)
        assert "methods" in comparison
        assert "ultimate_total" in comparison
        assert "reserves" in comparison
        
        # Vérifier les métriques
        ult_stats = comparison["ultimate_total"]
        assert "min" in ult_stats
        assert "max" in ult_stats
        assert "mean" in ult_stats
        assert ult_stats["min"] <= ult_stats["max"]
    
    def test_method_info_consistency(self):
        """Test cohérence des informations de méthodes"""
        methods = list_available_methods()
        
        for method_info in methods:
            method_id = method_info["method_id"]
            
            # Créer l'instance
            method = create_method(method_id)
            
            # Vérifier la cohérence
            assert method.method_id == method_id
            assert method.method_name == method_info["name"]
            
            # Vérifier que get_method_info fonctionne
            detailed_info = method.get_method_info()
            assert isinstance(detailed_info, dict)
            assert "advantages" in detailed_info
            assert "limitations" in detailed_info

# ============================================================================
# Tests de performance
# ============================================================================

class TestPerformance:
    """Tests de performance (optionnels, marqués comme slow)"""
    
    @pytest.mark.slow
    def test_calculation_time_reasonable(self, triangle_data_object):
        """Test que les calculs se terminent dans un temps raisonnable"""
        import time
        
        fast_methods = ["chain_ladder", "cape_cod", "bornhuetter_ferguson", "expected_loss_ratio"]
        
        for method_id in fast_methods:
            method = create_method(method_id)
            
            start_time = time.time()
            result = method.calculate(triangle_data_object)
            end_time = time.time()
            
            calculation_time = end_time - start_time
            
            # Les méthodes déterministes doivent être rapides (< 1s)
            assert calculation_time < 1.0, f"{method_id} trop lent: {calculation_time:.3f}s"
            
            # Vérifier que le temps enregistré est cohérent
            assert abs(result.calculation_time - calculation_time) < 0.1
    
    @pytest.mark.slow
    def test_large_triangle_handling(self):
        """Test avec un triangle plus grand"""
        # Créer un triangle 10x10
        large_triangle = []
        for i in range(10):
            row = []
            base_value = 1000000 * (1 + i * 0.1)
            for j in range(10 - i):
                value = base_value * (1.1 ** j)
                row.append(value)
            large_triangle.append(row)
        
        triangle_data = create_triangle_data(large_triangle)
        
        # Test avec Chain Ladder
        method = create_method("chain_ladder")
        result = method.calculate(triangle_data)
        
        assert result.ultimate_total > 0
        assert len(result.ultimates_by_year) == 10

# ============================================================================
# Configuration des tests
# ============================================================================

def pytest_configure(config):
    """Configuration des marqueurs de test"""
    config.addinivalue_line(
        "markers", "slow: marque les tests comme lents (désactivés par défaut)"
    )

# ============================================================================
# Utilitaires de test
# ============================================================================

def run_basic_test_suite():
    """Lancer la suite de tests de base (rapide)"""
    import subprocess
    import sys
    
    try:
        # Tests rapides seulement
        result = subprocess.run([
            sys.executable, "-m", "pytest", 
            __file__, 
            "-v", 
            "-m", "not slow",
            "--tb=short"
        ], capture_output=True, text=True)
        
        print("RÉSULTATS DES TESTS:")
        print("=" * 50)
        print(result.stdout)
        
        if result.stderr:
            print("ERREURS:")
            print(result.stderr)
        
        return result.returncode == 0
        
    except Exception as e:
        print(f"Erreur lors de l'exécution des tests: {e}")
        return False

def run_full_test_suite():
    """Lancer la suite complète de tests (incluant les lents)"""
    import subprocess
    import sys
    
    try:
        result = subprocess.run([
            sys.executable, "-m", "pytest", 
            __file__, 
            "-v", 
            "--tb=short",
            "--durations=10"  # Afficher les 10 tests les plus lents
        ], capture_output=True, text=True)
        
        print("RÉSULTATS DES TESTS COMPLETS:")
        print("=" * 50)
        print(result.stdout)
        
        if result.stderr:
            print("ERREURS:")
            print(result.stderr)
        
        return result.returncode == 0
        
    except Exception as e:
        print(f"Erreur lors de l'exécution des tests: {e}")
        return False

if __name__ == "__main__":
    """Lancer les tests directement"""
    print("🧪 LANCEMENT DES TESTS ACTUARIELS")
    print("=" * 50)
    
    # Tests rapides d'abord
    print("\n1️⃣ Tests rapides...")
    basic_success = run_basic_test_suite()
    
    if basic_success:
        print("✅ Tests rapides réussis!")
        
        # Demander si on veut les tests lents
        import sys
        if "--full" in sys.argv:
            print("\n2️⃣ Tests complets (incluant ML - peut être long)...")
            full_success = run_full_test_suite()
            
            if full_success:
                print("✅ Tous les tests réussis!")
            else:
                print("❌ Certains tests ont échoué")
        else:
            print("\n💡 Utiliser --full pour lancer tous les tests (y compris ML)")
    else:
        print("❌ Tests rapides échoués - corriger avant de continuer")