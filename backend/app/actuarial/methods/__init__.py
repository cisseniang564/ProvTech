# backend/app/actuarial/methods/__init__.py

"""
Registry et Factory pour toutes les méthodes actuarielles

Ce module centralise l'accès à toutes les méthodes disponibles et fournit
une interface unifiée pour les créer et les utiliser.
"""

from typing import Dict, List, Type, Any, Optional
from ..base.method_interface import ActuarialMethod, MethodConfig

# Imports des méthodes
from .chain_ladder import create_chain_ladder_method, ChainLadderMethod
from .cape_cod import create_cape_cod_method, CapeCodMethod
from .bornhuetter_ferguson import create_bornhuetter_ferguson_method, BornhuetterFergusonMethod
from .mack_method import create_mack_method, MackMethod
from .expected_loss_ratio import create_expected_loss_ratio_method, ExpectedLossRatioMethod
from .gradient_boosting import create_gradient_boosting_method, GradientBoostingMethod
from .neural_network import create_neural_network_method, NeuralNetworkMethod
from .random_forest import create_random_forest_method, RandomForestMethod

class ActuarialMethodRegistry:
    """
    Registry central pour toutes les méthodes actuarielles
    
    Gère l'enregistrement, la découverte et la création des méthodes.
    Organise les méthodes par catégorie et fournit des métadonnées.
    """
    
    def __init__(self):
        self._methods: Dict[str, Dict[str, Any]] = {}
        self._categories: Dict[str, List[str]] = {
            "deterministic": [],
            "stochastic": [],
            "machine_learning": [],
            "hybrid": []
        }
        self._initialize_methods()
    
    def _initialize_methods(self):
        """Initialiser le registry avec toutes les méthodes disponibles"""
        
        # Méthodes déterministes traditionnelles
        self.register_method(
            method_id="chain_ladder",
            factory_function=create_chain_ladder_method,
            method_class=ChainLadderMethod,
            category="deterministic",
            priority=1  # Méthode de base, haute priorité
        )
        
        self.register_method(
            method_id="cape_cod", 
            factory_function=create_cape_cod_method,
            method_class=CapeCodMethod,
            category="deterministic",
            priority=2
        )
        
        self.register_method(
            method_id="bornhuetter_ferguson",
            factory_function=create_bornhuetter_ferguson_method, 
            method_class=BornhuetterFergusonMethod,
            category="deterministic",
            priority=3
        )
        
        self.register_method(
            method_id="expected_loss_ratio",
            factory_function=create_expected_loss_ratio_method,
            method_class=ExpectedLossRatioMethod,
            category="deterministic", 
            priority=4
        )
        
        # Méthodes stochastiques
        self.register_method(
            method_id="mack_method",
            factory_function=create_mack_method,
            method_class=MackMethod,
            category="stochastic",
            priority=1
        )
        
        # Méthodes Machine Learning
        self.register_method(
            method_id="gradient_boosting",
            factory_function=create_gradient_boosting_method,
            method_class=GradientBoostingMethod,
            category="machine_learning",
            priority=1
        )
        
        self.register_method(
            method_id="neural_network", 
            factory_function=create_neural_network_method,
            method_class=NeuralNetworkMethod,
            category="machine_learning",
            priority=2
        )
        
        self.register_method(
            method_id="random_forest",
            factory_function=create_random_forest_method,
            method_class=RandomForestMethod,
            category="machine_learning",
            priority=3
        )
    
    def register_method(self, method_id: str, factory_function, method_class: Type[ActuarialMethod],
                       category: str, priority: int = 999, **metadata):
        """
        Enregistrer une méthode dans le registry
        
        Args:
            method_id: Identifiant unique de la méthode
            factory_function: Fonction factory pour créer la méthode
            method_class: Classe de la méthode
            category: Catégorie ("deterministic", "stochastic", "machine_learning", "hybrid")
            priority: Priorité d'affichage (1 = le plus important)
            **metadata: Métadonnées supplémentaires
        """
        
        if category not in self._categories:
            raise ValueError(f"Catégorie inconnue: {category}. Catégories disponibles: {list(self._categories.keys())}")
        
        # Créer une instance temporaire pour obtenir la config
        temp_instance = factory_function()
        config = temp_instance.config
        
        method_info = {
            "method_id": method_id,
            "factory_function": factory_function,
            "method_class": method_class,
            "category": category,
            "priority": priority,
            "config": config,
            "name": config.name,
            "description": config.description,
            "recommended": config.recommended,
            "processing_time": config.processing_time,
            "accuracy": config.accuracy,
            "parameters": config.parameters,
            **metadata
        }
        
        self._methods[method_id] = method_info
        
        # Ajouter à la catégorie et trier par priorité
        if method_id not in self._categories[category]:
            self._categories[category].append(method_id)
            self._categories[category].sort(key=lambda mid: self._methods[mid]["priority"])
        
        print(f"✅ Méthode enregistrée: {method_id} ({category})")
    
    def create_method(self, method_id: str) -> ActuarialMethod:
        """
        Créer une instance d'une méthode par son ID
        
        Args:
            method_id: Identifiant de la méthode
            
        Returns:
            Instance de la méthode
            
        Raises:
            ValueError: Si la méthode n'existe pas
        """
        
        if method_id not in self._methods:
            available_methods = list(self._methods.keys())
            raise ValueError(f"Méthode '{method_id}' non trouvée. Méthodes disponibles: {available_methods}")
        
        method_info = self._methods[method_id]
        factory_function = method_info["factory_function"]
        
        return factory_function()
    
    def get_method_info(self, method_id: str) -> Dict[str, Any]:
        """
        Obtenir les informations d'une méthode
        
        Args:
            method_id: Identifiant de la méthode
            
        Returns:
            Dictionnaire avec les informations de la méthode
        """
        
        if method_id not in self._methods:
            raise ValueError(f"Méthode '{method_id}' non trouvée")
        
        return self._methods[method_id].copy()
    
    def list_methods(self, category: Optional[str] = None, 
                    recommended_only: bool = False) -> List[Dict[str, Any]]:
        """
        Lister les méthodes disponibles
        
        Args:
            category: Filtrer par catégorie (optionnel)
            recommended_only: Ne retourner que les méthodes recommandées
            
        Returns:
            Liste des informations des méthodes
        """
        
        methods = []
        
        if category:
            if category not in self._categories:
                raise ValueError(f"Catégorie inconnue: {category}")
            method_ids = self._categories[category]
        else:
            method_ids = list(self._methods.keys())
        
        for method_id in method_ids:
            method_info = self._methods[method_id]
            
            if recommended_only and not method_info.get("recommended", False):
                continue
            
            # Créer une copie avec juste les infos importantes pour la liste
            method_summary = {
                "method_id": method_info["method_id"],
                "name": method_info["name"],
                "description": method_info["description"],
                "category": method_info["category"],
                "recommended": method_info["recommended"],
                "processing_time": method_info["processing_time"],
                "accuracy": method_info["accuracy"],
                "priority": method_info["priority"]
            }
            
            methods.append(method_summary)
        
        # Trier par priorité puis par nom
        methods.sort(key=lambda m: (m["priority"], m["name"]))
        
        return methods
    
    def get_methods_by_category(self) -> Dict[str, List[Dict[str, Any]]]:
        """
        Obtenir toutes les méthodes organisées par catégorie
        
        Returns:
            Dictionnaire avec les méthodes groupées par catégorie
        """
        
        result = {}
        
        for category in self._categories:
            result[category] = self.list_methods(category=category)
        
        return result
    
    def get_recommended_methods(self) -> List[Dict[str, Any]]:
        """
        Obtenir uniquement les méthodes recommandées
        
        Returns:
            Liste des méthodes recommandées
        """
        
        return self.list_methods(recommended_only=True)
    
    def search_methods(self, query: str) -> List[Dict[str, Any]]:
        """
        Rechercher des méthodes par nom ou description
        
        Args:
            query: Terme de recherche
            
        Returns:
            Liste des méthodes correspondantes
        """
        
        query_lower = query.lower()
        matching_methods = []
        
        for method_info in self._methods.values():
            name_match = query_lower in method_info["name"].lower()
            desc_match = query_lower in method_info["description"].lower()
            id_match = query_lower in method_info["method_id"].lower()
            
            if name_match or desc_match or id_match:
                matching_methods.append({
                    "method_id": method_info["method_id"],
                    "name": method_info["name"], 
                    "description": method_info["description"],
                    "category": method_info["category"],
                    "recommended": method_info["recommended"],
                    "match_score": (
                        2 * int(name_match) + 
                        1 * int(desc_match) + 
                        3 * int(id_match)
                    )
                })
        
        # Trier par score de correspondance
        matching_methods.sort(key=lambda m: m["match_score"], reverse=True)
        
        return matching_methods
    
    def validate_method_parameters(self, method_id: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """
        Valider les paramètres pour une méthode
        
        Args:
            method_id: Identifiant de la méthode
            parameters: Paramètres à valider
            
        Returns:
            Dictionnaire avec les résultats de validation
        """
        
        if method_id not in self._methods:
            return {"valid": False, "error": f"Méthode '{method_id}' non trouvée"}
        
        method_info = self._methods[method_id]
        default_params = method_info["parameters"]
        
        validation_result = {
            "valid": True,
            "errors": [],
            "warnings": [],
            "sanitized_parameters": {}
        }
        
        # Vérifier les paramètres requis et les types
        for param_name, param_value in parameters.items():
            if param_name not in default_params:
                validation_result["warnings"].append(f"Paramètre '{param_name}' non reconnu pour {method_id}")
            else:
                # Validation basique du type
                default_value = default_params[param_name]
                if default_value is not None and param_value is not None:
                    if type(param_value) != type(default_value):
                        validation_result["warnings"].append(
                            f"Type inattendu pour '{param_name}': attendu {type(default_value).__name__}, "
                            f"reçu {type(param_value).__name__}"
                        )
            
            validation_result["sanitized_parameters"][param_name] = param_value
        
        # Ajouter les paramètres par défaut manquants
        for param_name, default_value in default_params.items():
            if param_name not in validation_result["sanitized_parameters"]:
                validation_result["sanitized_parameters"][param_name] = default_value
        
        return validation_result
    
    def get_method_comparison(self, method_ids: List[str]) -> Dict[str, Any]:
        """
        Comparer plusieurs méthodes
        
        Args:
            method_ids: Liste des identifiants de méthodes à comparer
            
        Returns:
            Dictionnaire de comparaison
        """
        
        if not method_ids:
            return {"methods": [], "comparison": {}}
        
        methods = []
        for method_id in method_ids:
            if method_id in self._methods:
                methods.append(self._methods[method_id])
        
        if not methods:
            return {"methods": [], "comparison": {}}
        
        comparison = {
            "accuracy_range": {
                "min": min(m["accuracy"] for m in methods),
                "max": max(m["accuracy"] for m in methods)
            },
            "categories": list(set(m["category"] for m in methods)),
            "recommended_count": sum(1 for m in methods if m["recommended"]),
            "complexity_levels": {
                "simple": sum(1 for m in methods if m["category"] == "deterministic"),
                "advanced": sum(1 for m in methods if m["category"] in ["stochastic", "machine_learning"])
            }
        }
        
        return {
            "methods": [
                {
                    "method_id": m["method_id"],
                    "name": m["name"],
                    "category": m["category"], 
                    "accuracy": m["accuracy"],
                    "recommended": m["recommended"]
                } for m in methods
            ],
            "comparison": comparison
        }
    
    def get_registry_stats(self) -> Dict[str, Any]:
        """Obtenir les statistiques du registry"""
        
        return {
            "total_methods": len(self._methods),
            "by_category": {
                category: len(method_ids) 
                for category, method_ids in self._categories.items()
            },
            "recommended_methods": len([m for m in self._methods.values() if m["recommended"]]),
            "average_accuracy": sum(m["accuracy"] for m in self._methods.values()) / len(self._methods),
            "categories": list(self._categories.keys())
        }

# Instance globale du registry
method_registry = ActuarialMethodRegistry()

# Fonctions de commodité pour l'API
def create_method(method_id: str) -> ActuarialMethod:
    """Créer une méthode par son ID"""
    return method_registry.create_method(method_id)

def list_available_methods(category: Optional[str] = None, recommended_only: bool = False) -> List[Dict[str, Any]]:
    """Lister les méthodes disponibles"""
    return method_registry.list_methods(category=category, recommended_only=recommended_only)

def get_method_details(method_id: str) -> Dict[str, Any]:
    """Obtenir les détails d'une méthode"""
    return method_registry.get_method_info(method_id)

def search_methods(query: str) -> List[Dict[str, Any]]:
    """Rechercher des méthodes"""
    return method_registry.search_methods(query)

def get_methods_by_category() -> Dict[str, List[Dict[str, Any]]]:
    """Obtenir les méthodes par catégorie"""
    return method_registry.get_methods_by_category()

def validate_parameters(method_id: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
    """Valider les paramètres d'une méthode"""
    return method_registry.validate_method_parameters(method_id, parameters)

def compare_methods(method_ids: List[str]) -> Dict[str, Any]:
    """Comparer plusieurs méthodes"""
    return method_registry.get_method_comparison(method_ids)

# Export des principales classes et fonctions
__all__ = [
    "ActuarialMethodRegistry",
    "method_registry", 
    "create_method",
    "list_available_methods",
    "get_method_details",
    "search_methods",
    "get_methods_by_category",
    "validate_parameters",
    "compare_methods",
    # Classes de méthodes
    "ChainLadderMethod",
    "CapeCodMethod", 
    "BornhuetterFergusonMethod",
    "MackMethod",
    "ExpectedLossRatioMethod",
    "GradientBoostingMethod",
    "NeuralNetworkMethod",
    "RandomForestMethod"
]