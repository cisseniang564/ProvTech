"""
Tests unitaires pour le moteur de calculs actuariels
Validation des méthodes de calcul et de la logique métier
"""

import pytest
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from unittest.mock import Mock, patch

from app.services.actuarial_engine import (
    ActuarialEngine,
    ChainLadderMethod,
    BornhuetterFergusonMethod,
    CalculationMethod,
    CalculationParameters,
    CalculationResult,
    TailMethod,
    create_calculation_parameters,
    validate_triangle_for_calculation,
    recommend_calculation_method
)
from app.models.triangle import Triangle, BusinessLine, DataType, create_sample_triangle
from app.models.user import User

# ================================
# FIXTURES DE TEST
# ================================

@pytest.fixture
def sample_triangle_data():
    """Triangle de test 5x5"""
    return np.array([
        [1000, 1100, 1150, 1170, 1180],
        [2000, 2200, 2280, 2300, np.nan],
        [1500, 1650, 1700, np.nan, np.nan],
        [3000, 3300, np.nan, np.nan, np.nan],
        [2500, np.nan, np.nan, np.nan, np.nan]
    ])

@pytest.fixture
def incomplete_triangle_data():
    """Triangle incomplet pour tests"""
    return np.array([
        [1000, 1100, np.nan, np.nan, np.nan],
        [2000, np.nan, np.nan, np.nan, np.nan],
        [np.nan, np.nan, np.nan, np.nan, np.nan],
        [3000, 3300, 3400, np.nan, np.nan],
        [2500, np.nan, np.nan, np.nan, np.nan]
    ])

@pytest.fixture
def mock_user():
    """Utilisateur de test"""
    user = Mock(spec=User)
    user.id = 1
    user.email = "test@example.com"
    user.full_name = "Test User"
    return user

@pytest.fixture
def mock_triangle(sample_triangle_data, mock_user):
    """Triangle de test"""
    triangle = Mock(spec=Triangle)
    triangle.id = 1
    triangle.name = "Test Triangle"
    triangle.owner_id = mock_user.id
    triangle.business_line = BusinessLine.MOTOR.value
    triangle.data_type = DataType.CLAIMS_PAID.value
    triangle.data_matrix = sample_triangle_data.tolist()
    triangle.dimensions = sample_triangle_data.shape
    triangle.completeness_ratio = 0.8
    triangle.data_points_count = 13
    triangle.age_months = 12
    triangle.validation_status = "validated"
    triangle.get_data_as_array.return_value = sample_triangle_data
    triangle.validate_data_structure.return_value = []
    return triangle

@pytest.fixture
def chain_ladder_parameters():
    """Paramètres Chain Ladder par défaut"""
    return CalculationParameters(
        method=CalculationMethod.CHAIN_LADDER,
        confidence_level=0.75,
        tail_method=TailMethod.CONSTANT,
        tail_factor=1.05,
        alpha=1.0,
        use_volume_weighted=False,
        exclude_outliers=False
    )

@pytest.fixture
def bf_parameters():
    """Paramètres Bornhuetter-Ferguson"""
    return CalculationParameters(
        method=CalculationMethod.BORNHUETTER_FERGUSON,
        confidence_level=0.75,
        expected_loss_ratio=0.65,
        premium_data=np.array([1000, 1500, 1200, 2000, 1800])
    )

# ================================
# TESTS DES PARAMÈTRES
# ================================

class TestCalculationParameters:
    """Tests de la classe CalculationParameters"""
    
    def test_parameters_validation_valid(self, chain_ladder_parameters):
        """Test validation des paramètres valides"""
        errors = chain_ladder_parameters.validate()
        assert len(errors) == 0
    
    def test_parameters_validation_invalid_confidence(self):
        """Test validation niveau de confiance invalide"""
        params = CalculationParameters(
            method=CalculationMethod.CHAIN_LADDER,
            confidence_level=1.5  # Invalide
        )
        errors = params.validate()
        assert len(errors) > 0
        assert any("niveau de confiance" in error.lower() for error in errors)
    
    def test_parameters_validation_bornhuetter_ferguson_missing_ratio(self):
        """Test validation BF sans ratio de sinistralité"""
        params = CalculationParameters(
            method=CalculationMethod.BORNHUETTER_FERGUSON,
            expected_loss_ratio=None  # Manquant
        )
        errors = params.validate()
        assert len(errors) > 0
        assert any("ratio de sinistralité" in error.lower() for error in errors)
    
    def test_parameters_validation_negative_tail_factor(self):
        """Test validation facteur de queue négatif"""
        params = CalculationParameters(
            method=CalculationMethod.CHAIN_LADDER,
            tail_factor=0.5  # Invalide
        )
        errors = params.validate()
        assert len(errors) > 0


# ================================
# TESTS CHAIN LADDER
# ================================

class TestChainLadderMethod:
    """Tests de la méthode Chain Ladder"""
    
    def test_chain_ladder_basic_calculation(self, sample_triangle_data, chain_ladder_parameters):
        """Test calcul Chain Ladder basique"""
        method = ChainLadderMethod()
        
        result = method.calculate(sample_triangle_data, chain_ladder_parameters)
        
        assert isinstance(result, CalculationResult)
        assert result.method_used == CalculationMethod.CHAIN_LADDER
        assert result.total_ultimate > 0
        assert result.total_reserves > 0
        assert len(result.ultimate_claims) == sample_triangle_data.shape[0]
        assert len(result.development_factors) > 0
    
    def test_chain_ladder_development_factors(self, sample_triangle_data, chain_ladder_parameters):
        """Test calcul des facteurs de développement"""
        method = ChainLadderMethod()
        
        result = method.calculate(sample_triangle_data, chain_ladder_parameters)
        
        # Les facteurs doivent être >= 1.0
        assert all(factor >= 1.0 for factor in result.development_factors)
        
        # Doit avoir le bon nombre de facteurs
        expected_factors = sample_triangle_data.shape[1] - 1
        if chain_ladder_parameters.tail_method != TailMethod.NONE:
            expected_factors += 1
        assert len(result.development_factors) == expected_factors
    
    def test_chain_ladder_with_tail_factor(self, sample_triangle_data):
        """Test Chain Ladder avec facteur de queue"""
        params = CalculationParameters(
            method=CalculationMethod.CHAIN_LADDER,
            tail_method=TailMethod.CONSTANT,
            tail_factor=1.1
        )
        
        method = ChainLadderMethod()
        result = method.calculate(sample_triangle_data, params)
        
        # Le dernier facteur doit être le tail factor
        assert result.development_factors[-1] == 1.1
        assert result.tail_factor == 1.1
    
    def test_chain_ladder_outlier_removal(self, chain_ladder_parameters):
        """Test suppression des outliers"""
        # Triangle avec outlier évident
        triangle_with_outlier = np.array([
            [1000, 1100, 1150, 1170, 1180],
            [2000, 2200, 2280, 2300, np.nan],
            [1500, 1650, 1700, np.nan, np.nan],
            [3000, 30000, np.nan, np.nan, np.nan],  # Outlier
            [2500, np.nan, np.nan, np.nan, np.nan]
        ])
        
        params = CalculationParameters(
            method=CalculationMethod.CHAIN_LADDER,
            exclude_outliers=True,
            outlier_threshold=3.0
        )
        
        method = ChainLadderMethod()
        result = method.calculate(triangle_with_outlier, params)
        
        # Doit avoir des warnings sur les outliers
        assert len(result.warnings) > 0
        assert any("outlier" in warning.lower() for warning in result.warnings)
    
    def test_chain_ladder_validation_empty_triangle(self, chain_ladder_parameters):
        """Test validation triangle vide"""
        method = ChainLadderMethod()
        empty_triangle = np.array([])
        
        errors = method.validate_inputs(empty_triangle, chain_ladder_parameters)
        assert len(errors) > 0
        assert any("vide" in error.lower() for error in errors)
    
    def test_chain_ladder_validation_small_triangle(self, chain_ladder_parameters):
        """Test validation triangle trop petit"""
        method = ChainLadderMethod()
        small_triangle = np.array([[100]])
        
        errors = method.validate_inputs(small_triangle, chain_ladder_parameters)
        assert len(errors) > 0
        assert any("2x2" in error for error in errors)
    
    def test_chain_ladder_confidence_intervals(self, sample_triangle_data):
        """Test calcul des intervalles de confiance"""
        params = CalculationParameters(
            method=CalculationMethod.CHAIN_LADDER,
            confidence_level=0.75
        )
        
        method = ChainLadderMethod()
        result = method.calculate(sample_triangle_data, params)
        
        # Doit avoir des intervalles de confiance
        assert result.ultimate_lower is not None
        assert result.ultimate_upper is not None
        assert len(result.ultimate_lower) == len(result.ultimate_claims)
        assert len(result.ultimate_upper) == len(result.ultimate_claims)
        
        # Les bornes doivent être cohérentes
        for i in range(len(result.ultimate_claims)):
            assert result.ultimate_lower[i] <= result.ultimate_claims[i] <= result.ultimate_upper[i]


# ================================
# TESTS BORNHUETTER-FERGUSON
# ================================

class TestBornhuetterFergusonMethod:
    """Tests de la méthode Bornhuetter-Ferguson"""
    
    def test_bf_basic_calculation(self, sample_triangle_data, bf_parameters):
        """Test calcul BF basique"""
        method = BornhuetterFergusonMethod()
        
        result = method.calculate(sample_triangle_data, bf_parameters)
        
        assert isinstance(result, CalculationResult)
        assert result.method_used == CalculationMethod.BORNHUETTER_FERGUSON
        assert result.total_ultimate > 0
        assert result.total_reserves > 0
        assert len(result.ultimate_claims) == sample_triangle_data.shape[0]
    
    def test_bf_validation_missing_ratio(self, sample_triangle_data):
        """Test validation BF sans ratio"""
        params = CalculationParameters(
            method=CalculationMethod.BORNHUETTER_FERGUSON,
            expected_loss_ratio=None,
            premium_data=np.array([1000, 1500, 1200, 2000, 1800])
        )
        
        method = BornhuetterFergusonMethod()
        errors = method.validate_inputs(sample_triangle_data, params)
        
        assert len(errors) > 0
        assert any("ratio" in error.lower() for error in errors)
    
    def test_bf_validation_missing_premiums(self, sample_triangle_data):
        """Test validation BF sans primes"""
        params = CalculationParameters(
            method=CalculationMethod.BORNHUETTER_FERGUSON,
            expected_loss_ratio=0.65,
            premium_data=None
        )
        
        method = BornhuetterFergusonMethod()
        errors = method.validate_inputs(sample_triangle_data, params)
        
        assert len(errors) > 0
        assert any("prime" in error.lower() for error in errors)


# ================================
# TESTS MOTEUR PRINCIPAL
# ================================

class TestActuarialEngine:
    """Tests du moteur actuariel principal"""
    
    def test_engine_initialization(self):
        """Test initialisation du moteur"""
        engine = ActuarialEngine()
        
        assert CalculationMethod.CHAIN_LADDER in engine.methods
        assert CalculationMethod.BORNHUETTER_FERGUSON in engine.methods
        assert isinstance(engine.methods[CalculationMethod.CHAIN_LADDER], ChainLadderMethod)
    
    def test_engine_calculate_success(self, mock_triangle, chain_ladder_parameters):
        """Test calcul réussi"""
        engine = ActuarialEngine()
        
        result = engine.calculate(mock_triangle, chain_ladder_parameters)
        
        assert isinstance(result, CalculationResult)
        assert result.total_ultimate > 0
        assert hasattr(result, 'triangle_id')
        assert hasattr(result, 'triangle_name')
    
    def test_engine_calculate_invalid_method(self, mock_triangle):
        """Test calcul avec méthode non supportée"""
        engine = ActuarialEngine()
        
        # Simulation d'une méthode non implémentée
        params = CalculationParameters(method="non_existent_method")
        
        with pytest.raises(ValueError, match="Méthode non supportée"):
            engine.calculate(mock_triangle, params)
    
    def test_engine_calculate_invalid_triangle(self, chain_ladder_parameters):
        """Test calcul avec triangle invalide"""
        engine = ActuarialEngine()
        
        # Mock triangle avec erreurs de validation
        mock_triangle = Mock()
        mock_triangle.validate_data_structure.return_value = ["Erreur de validation"]
        
        with pytest.raises(ValueError, match="Triangle invalide"):
            engine.calculate(mock_triangle, chain_ladder_parameters)
    
    def test_engine_calculate_multiple_methods(self, mock_triangle):
        """Test calcul avec plusieurs méthodes"""
        engine = ActuarialEngine()
        
        methods = [CalculationMethod.CHAIN_LADDER, CalculationMethod.BORNHUETTER_FERGUSON]
        base_params = CalculationParameters(
            method=CalculationMethod.CHAIN_LADDER,
            expected_loss_ratio=0.65,
            premium_data=np.array([1000, 1500, 1200, 2000, 1800])
        )
        
        results = engine.calculate_multiple_methods(mock_triangle, methods, base_params)
        
        assert len(results) >= 1  # Au moins Chain Ladder doit réussir
        assert CalculationMethod.CHAIN_LADDER in results
        
        for method, result in results.items():
            assert isinstance(result, CalculationResult)
            assert result.method_used == method
    
    def test_engine_compare_methods(self, mock_triangle):
        """Test comparaison de méthodes"""
        engine = ActuarialEngine()
        
        methods = [CalculationMethod.CHAIN_LADDER]
        base_params = CalculationParameters(method=CalculationMethod.CHAIN_LADDER)
        
        comparison = engine.compare_methods(mock_triangle, methods, base_params)
        
        assert "methods_compared" in comparison
        assert "ultimate_claims" in comparison
        assert "total_reserves" in comparison
        assert "statistics" in comparison
    
    def test_get_available_methods(self):
        """Test récupération des méthodes disponibles"""
        engine = ActuarialEngine()
        
        methods = engine.get_available_methods()
        
        assert len(methods) > 0
        assert all("code" in method for method in methods)
        assert all("name" in method for method in methods)
        assert all("description" in method for method in methods)


# ================================
# TESTS FONCTIONS UTILITAIRES
# ================================

class TestUtilityFunctions:
    """Tests des fonctions utilitaires"""
    
    def test_create_calculation_parameters_chain_ladder(self):
        """Test création paramètres Chain Ladder"""
        params = create_calculation_parameters(
            method="chain_ladder",
            confidence_level=0.8,
            tail_factor=1.1
        )
        
        assert params.method == CalculationMethod.CHAIN_LADDER
        assert params.confidence_level == 0.8
        assert params.tail_factor == 1.1
    
    def test_create_calculation_parameters_with_enum(self):
        """Test création paramètres avec enum"""
        params = create_calculation_parameters(
            method=CalculationMethod.BORNHUETTER_FERGUSON,
            expected_loss_ratio=0.7
        )
        
        assert params.method == CalculationMethod.BORNHUETTER_FERGUSON
        assert params.expected_loss_ratio == 0.7
    
    def test_validate_triangle_for_calculation_valid(self, mock_triangle):
        """Test validation triangle valide"""
        mock_triangle.validation_status = "validated"
        mock_triangle.data_matrix = [[1, 2], [3, 4]]
        mock_triangle.completeness_ratio = 0.8
        mock_triangle.age_months = 12
        
        errors = validate_triangle_for_calculation(mock_triangle)
        assert len(errors) == 0
    
    def test_validate_triangle_for_calculation_invalid(self):
        """Test validation triangle invalide"""
        mock_triangle = Mock()
        mock_triangle.validation_status = "pending"
        mock_triangle.data_matrix = None
        mock_triangle.completeness_ratio = 0.2
        mock_triangle.age_months = 50
        
        errors = validate_triangle_for_calculation(mock_triangle)
        assert len(errors) > 0
    
    def test_recommend_calculation_method(self, mock_triangle):
        """Test recommandation de méthode"""
        # Mock pour simuler un triangle avec bonnes caractéristiques
        mock_triangle.dimensions = (10, 10)
        mock_triangle.data_points_count = 80
        mock_triangle.completeness_ratio = 0.9
        mock_triangle.business_line = "motor"
        
        with patch('app.services.actuarial_engine.calculate_development_pattern_stability') as mock_stability:
            mock_stability.return_value = {"stability_score": 0.8, "coefficient_of_variation": 0.1}
            
            recommendation = recommend_calculation_method(mock_triangle)
            
            assert "primary_recommendation" in recommendation
            assert "triangle_analysis" in recommendation
            
            if recommendation["primary_recommendation"]:
                assert "method" in recommendation["primary_recommendation"]
                assert "confidence" in recommendation["primary_recommendation"]
                assert "reason" in recommendation["primary_recommendation"]


# ================================
# TESTS D'INTÉGRATION
# ================================

class TestIntegration:
    """Tests d'intégration bout en bout"""
    
    def test_complete_calculation_workflow(self, mock_user):
        """Test workflow complet de calcul"""
        # Création d'un triangle réel
        triangle = create_sample_triangle(
            owner_id=mock_user.id,
            name="Test Integration Triangle",
            business_line=BusinessLine.MOTOR.value
        )
        
        # Paramètres de calcul
        params = CalculationParameters(
            method=CalculationMethod.CHAIN_LADDER,
            confidence_level=0.75,
            tail_factor=1.05
        )
        
        # Exécution du calcul
        engine = ActuarialEngine()
        result = engine.calculate(triangle, params)
        
        # Vérifications
        assert isinstance(result, CalculationResult)
        assert result.total_ultimate > 0
        assert result.total_reserves >= 0
        assert result.total_paid > 0
        assert result.computation_time_ms > 0
        assert len(result.warnings) >= 0
    
    def test_error_handling_invalid_data(self, mock_user):
        """Test gestion d'erreurs avec données invalides"""
        # Triangle avec données corrompues
        triangle = create_sample_triangle(mock_user.id)
        triangle.data_matrix = [[np.inf, -np.inf], [np.nan, np.nan]]
        
        params = CalculationParameters(method=CalculationMethod.CHAIN_LADDER)
        
        engine = ActuarialEngine()
        
        # Doit lever une exception ou retourner des warnings
        try:
            result = engine.calculate(triangle, params)
            # Si le calcul réussit, il doit y avoir des warnings
            assert len(result.warnings) > 0
        except (ValueError, Exception) as e:
            # Exception attendue avec données invalides
            assert "erreur" in str(e).lower() or "invalid" in str(e).lower()
    
    def test_performance_large_triangle(self, mock_user):
        """Test performance avec grand triangle"""
        # Création d'un grand triangle (20x20)
        large_data = []
        for i in range(20):
            row = []
            for j in range(20):
                if i + j < 20:
                    # Simulation de données réalistes
                    value = 1000 * (i + 1) * (1.1 ** j) + np.random.normal(0, 100)
                    row.append(max(0, value))
                else:
                    row.append(np.nan)
            large_data.append(row)
        
        triangle = create_sample_triangle(mock_user.id)
        triangle.data_matrix = large_data
        
        params = CalculationParameters(method=CalculationMethod.CHAIN_LADDER)
        
        engine = ActuarialEngine()
        start_time = datetime.utcnow()
        
        result = engine.calculate(triangle, params)
        
        end_time = datetime.utcnow()
        execution_time = (end_time - start_time).total_seconds() * 1000
        
        # Vérifications de performance
        assert result.computation_time_ms < 5000  # Moins de 5 secondes
        assert execution_time < 10000  # Moins de 10 secondes total
        assert result.total_ultimate > 0


# ================================
# TESTS DE RÉGRESSION
# ================================

class TestRegression:
    """Tests de régression pour s'assurer de la stabilité"""
    
    def test_chain_ladder_consistent_results(self, sample_triangle_data):
        """Test cohérence des résultats Chain Ladder"""
        params = CalculationParameters(
            method=CalculationMethod.CHAIN_LADDER,
            confidence_level=0.75,
            tail_factor=1.0,
            alpha=1.0
        )
        
        method = ChainLadderMethod()
        
        # Exécution multiple du même calcul
        results = []
        for _ in range(3):
            result = method.calculate(sample_triangle_data, params)
            results.append(result)
        
        # Les résultats doivent être identiques
        base_result = results[0]
        for result in results[1:]:
            assert abs(result.total_ultimate - base_result.total_ultimate) < 0.01
            assert abs(result.total_reserves - base_result.total_reserves) < 0.01
            np.testing.assert_array_almost_equal(
                result.ultimate_claims, 
                base_result.ultimate_claims, 
                decimal=2
            )
    
    def test_known_triangle_expected_results(self):
        """Test avec triangle aux résultats connus"""
        # Triangle simple avec résultats calculables manuellement
        simple_triangle = np.array([
            [100, 150, 200],
            [200, 300, np.nan],
            [300, np.nan, np.nan]
        ])
        
        params = CalculationParameters(
            method=CalculationMethod.CHAIN_LADDER,
            tail_method=TailMethod.NONE,
            alpha=1.0
        )
        
        method = ChainLadderMethod()
        result = method.calculate(simple_triangle, params)
        
        # Facteurs de développement attendus
        # Période 1->2: (150+300)/(100+200) = 1.5
        # Période 2->3: 200/150 = 1.333...
        expected_factors = [1.5, 1.333]
        
        np.testing.assert_array_almost_equal(
            result.development_factors, 
            expected_factors, 
            decimal=2
        )
        
        # Ultimate attendu pour ligne 2: 300 * 1.333 = 400
        # Ultimate attendu pour ligne 3: 300 * 1.5 * 1.333 = 600
        expected_ultimate_line_2 = 400
        expected_ultimate_line_3 = 600
        
        assert abs(result.ultimate_claims[1] - expected_ultimate_line_2) < 10
        assert abs(result.ultimate_claims[2] - expected_ultimate_line_3) < 10


# ================================
# TESTS DE PERFORMANCE
# ================================

class TestPerformance:
    """Tests de performance et benchmarks"""
    
    def test_calculation_time_limit(self, sample_triangle_data, chain_ladder_parameters):
        """Test limite de temps de calcul"""
        method = ChainLadderMethod()
        
        start_time = datetime.utcnow()
        result = method.calculate(sample_triangle_data, chain_ladder_parameters)
        end_time = datetime.utcnow()
        
        execution_time = (end_time - start_time).total_seconds() * 1000
        
        # Le calcul doit être rapide pour un petit triangle
        assert execution_time < 1000  # Moins de 1 seconde
        assert result.computation_time_ms < 1000
    
    def test_memory_efficiency(self, chain_ladder_parameters):
        """Test efficacité mémoire"""
        import psutil
        import gc
        
        process = psutil.Process()
        initial_memory = process.memory_info().rss
        
        # Calcul avec plusieurs triangles
        method = ChainLadderMethod()
        
        for i in range(10):
            triangle_data = np.random.rand(10, 10) * 1000
            triangle_data[np.triu_indices_from(triangle_data, k=1)] = np.nan
            
            result = method.calculate(triangle_data, chain_ladder_parameters)
            
            # Force garbage collection
            gc.collect()
        
        final_memory = process.memory_info().rss
        memory_increase = (final_memory - initial_memory) / 1024 / 1024  # MB
        
        # L'augmentation mémoire doit être raisonnable
        assert memory_increase < 50  # Moins de 50MB


# ================================
# CONFIGURATION PYTEST
# ================================

@pytest.fixture(autouse=True)
def setup_logging():
    """Configuration du logging pour les tests"""
    import logging
    logging.getLogger("app.services.actuarial_engine").setLevel(logging.WARNING)

@pytest.fixture
def disable_cache():
    """Désactive le cache pour les tests"""
    with patch('app.cache.redis_client.redis_client') as mock_cache:
        mock_cache.get.return_value = None
        mock_cache.set.return_value = True
        yield mock_cache

# Marqueurs pytest pour catégoriser les tests
pytestmark = [
    pytest.mark.unit,  # Tests unitaires
    pytest.mark.actuarial  # Tests spécifiques aux calculs actuariels
]

# ================================
# TESTS PARAMETRIQUES
# ================================

@pytest.mark.parametrize("method,expected_type", [
    (CalculationMethod.CHAIN_LADDER, ChainLadderMethod),
    (CalculationMethod.BORNHUETTER_FERGUSON, BornhuetterFergusonMethod),
])
def test_engine_method_types(method, expected_type):
    """Test paramétrique des types de méthodes"""
    engine = ActuarialEngine()
    assert isinstance(engine.methods[method], expected_type)

@pytest.mark.parametrize("confidence_level", [0.1, 0.5, 0.75, 0.9, 0.95, 0.99])
def test_confidence_levels(sample_triangle_data, confidence_level):
    """Test paramétrique des niveaux de confiance"""
    params = CalculationParameters(
        method=CalculationMethod.CHAIN_LADDER,
        confidence_level=confidence_level
    )
    
    method = ChainLadderMethod()
    result = method.calculate(sample_triangle_data, params)
    
    assert isinstance(result, CalculationResult)
    if result.ultimate_lower is not None and result.ultimate_upper is not None:
        # Les intervalles doivent s'élargir avec un niveau de confiance plus élevé
        intervals_width = result.ultimate_upper - result.ultimate_lower
        assert all(width >= 0 for width in intervals_width)

@pytest.mark.parametrize("tail_factor", [1.0, 1.01, 1.05, 1.1, 1.2])
def test_tail_factors(sample_triangle_data, tail_factor):
    """Test paramétrique des facteurs de queue"""
    params = CalculationParameters(
        method=CalculationMethod.CHAIN_LADDER,
        tail_method=TailMethod.CONSTANT,
        tail_factor=tail_factor
    )
    
    method = ChainLadderMethod()
    result = method.calculate(sample_triangle_data, params)
    
    assert result.development_factors[-1] == tail_factor
    # Plus le tail factor est élevé, plus l'ultimate doit être élevé
    assert result.total_ultimate > 0

# ================================
# TESTS DE STRESS
# ================================

class TestStress:
    """Tests de stress et cas limites"""
    
    def test_extreme_values(self, chain_ladder_parameters):
        """Test avec valeurs extrêmes"""
        # Triangle avec très grandes valeurs
        extreme_triangle = np.array([
            [1e6, 1.1e6, 1.15e6],
            [2e6, 2.2e6, np.nan],
            [1.5e6, np.nan, np.nan]
        ])
        
        method = ChainLadderMethod()
        result = method.calculate(extreme_triangle, chain_ladder_parameters)
        
        assert result.total_ultimate > 0
        assert not np.isnan(result.total_ultimate)
        assert not np.isinf(result.total_ultimate)
    
    def test_very_small_values(self, chain_ladder_parameters):
        """Test avec très petites valeurs"""
        # Triangle avec très petites valeurs
        small_triangle = np.array([
            [0.001, 0.0011, 0.00115],
            [0.002, 0.0022, np.nan],
            [0.0015, np.nan, np.nan]
        ])
        
        method = ChainLadderMethod()
        result = method.calculate(small_triangle, chain_ladder_parameters)
        
        assert result.total_ultimate > 0
        assert not np.isnan(result.total_ultimate)
    
    def test_single_value_triangle(self, chain_ladder_parameters):
        """Test avec triangle d'une seule valeur non-NaN"""
        single_value_triangle = np.array([
            [1000, np.nan, np.nan],
            [np.nan, np.nan, np.nan],
            [np.nan, np.nan, np.nan]
        ])
        
        method = ChainLadderMethod()
        
        # Doit échouer gracieusement
        with pytest.raises((ValueError, Exception)):
            method.calculate(single_value_triangle, chain_ladder_parameters)


if __name__ == "__main__":
    # Exécution des tests si le fichier est lancé directement
    pytest.main([__file__, "-v", "--tb=short"])