# backend/app/actuarial/methods/random_forest.py

from typing import List, Dict, Any, Tuple
from datetime import datetime
import math
import random

from ..base.method_interface import (
    MachineLearningMethod,
    TriangleData, 
    CalculationResult,
    MethodConfig
)
from ..base.triangle_utils import (
    validate_triangle_data,
    calculate_triangle_statistics
)

class RandomForestMethod(MachineLearningMethod):
    """
    Implémentation Random Forest pour réserves actuarielles
    
    Utilise un ensemble d'arbres de décision avec bootstrapping et
    sélection aléatoire de features pour prédire les développements futurs.
    """
    
    def __init__(self):
        config = MethodConfig(
            id="random_forest",
            name="Random Forest Actuariel",
            description="Ensemble d'arbres de décision pour prédiction robuste des développements",
            category="machine_learning",
            recommended=True,
            processing_time="< 6s",
            accuracy=88,
            parameters={
                "n_estimators": 100,  # Nombre d'arbres
                "max_depth": 10,  # Profondeur maximale des arbres
                "min_samples_split": 2,  # Minimum pour split
                "min_samples_leaf": 1,  # Minimum par feuille
                "max_features": "sqrt",  # Nombre de features par split ("sqrt", "log2", int)
                "bootstrap": True,  # Bootstrapping des échantillons
                "bootstrap_features": True,  # Bootstrap des features aussi
                "oob_score": True,  # Out-of-bag evaluation
                "feature_importance_method": "impurity",  # "impurity" ou "permutation"
                "random_state": 42
            }
        )
        super().__init__(config)
    
    @property
    def method_id(self) -> str:
        return "random_forest"
    
    @property
    def method_name(self) -> str:
        return "Random Forest Actuariel"
    
    def validate_input(self, triangle_data: TriangleData, **kwargs) -> List[str]:
        """Valider les données pour Random Forest"""
        errors = validate_triangle_data(triangle_data.data)
        
        if not errors:
            if len(triangle_data.data) < 4:
                errors.append("Random Forest nécessite au moins 4 années d'accident")
            
            # Volume de données
            data_points = sum(len(row) for row in triangle_data.data)
            if data_points < 15:
                errors.append("Données insuffisantes pour RF (minimum 15 points)")
            
            # Densité
            max_periods = max(len(row) for row in triangle_data.data) if triangle_data.data else 0
            total_possible = len(triangle_data.data) * max_periods
            density = data_points / total_possible if total_possible > 0 else 0
            
            if density < 0.4:
                errors.append("Triangle trop peu dense pour RF (densité < 40%)")
        
        return errors
    
    def calculate(self, triangle_data: TriangleData, **kwargs) -> CalculationResult:
        """
        Calcul Random Forest complet
        """
        self._start_timing()
        self._log_calculation_start(triangle_data)
        
        # Paramètres
        params = self.get_default_parameters()
        params.update(kwargs)
        
        # 1. Validation
        validation_errors = self.validate_input(triangle_data, **kwargs)
        if validation_errors:
            raise ValueError(f"Erreurs de validation: {', '.join(validation_errors)}")
        
        # 2. Préparation des données
        print("🔧 Préparation des données...")
        features, targets, feature_names = self._prepare_rf_training_data(triangle_data.data)
        
        print(f"📊 Dataset: {len(features)} échantillons, {len(feature_names)} features")
        print(f"🎯 Features: {feature_names[:5]}...") # Afficher les 5 premiers
        
        # 3. Entraînement de la forêt
        print("🌲 Entraînement Random Forest...")
        forest = self._train_random_forest(features, targets, feature_names, params)
        
        # 4. Évaluation OOB (Out-of-Bag)
        oob_score = self._calculate_oob_score(forest, features, targets) if params.get("oob_score", True) else None
        if oob_score:
            print(f"📊 Score OOB: R² = {oob_score.get('r2', 0):.3f}")
        
        # 5. Prédictions
        print("🔮 Prédiction des développements...")
        completed_triangle = self._predict_missing_values_rf(
            triangle_data.data, forest, feature_names
        )
        
        # 6. Calcul des ultimates
        ultimates_by_year = [row[-1] if row else 0 for row in completed_triangle]
        ultimate_total = sum(ultimates_by_year)
        
        # 7. Importance des features
        feature_importance = self._calculate_feature_importance_rf(forest, feature_names, params)
        print(f"📈 Top features: {list(feature_importance.keys())[:3]}")
        
        # 8. Calculs de synthèse
        paid_to_date = sum(row[0] if row else 0 for row in triangle_data.data)
        reserves = ultimate_total - paid_to_date
        
        # 9. Diagnostics RF
        triangle_stats = calculate_triangle_statistics(triangle_data.data)
        diagnostics = self._calculate_rf_diagnostics(
            triangle_data.data, completed_triangle, ultimates_by_year,
            forest, oob_score, feature_importance
        )
        
        # 10. Avertissements
        warnings = self._generate_rf_warnings(
            triangle_data, triangle_stats, forest, oob_score, feature_importance
        )
        
        # 11. Métadonnées
        metadata = {
            "currency": triangle_data.currency,
            "business_line": triangle_data.business_line,
            "parameters_used": params,
            "triangle_statistics": triangle_stats,
            "feature_importance": feature_importance,
            "oob_score": oob_score,
            "forest_statistics": self._get_forest_statistics(forest),
            "feature_names": feature_names
        }
        
        calculation_time = self._stop_timing()
        
        result = CalculationResult(
            method_id=self.method_id,
            method_name=self.method_name,
            ultimate_total=ultimate_total,
            paid_to_date=paid_to_date,
            reserves=reserves,
            ultimates_by_year=ultimates_by_year,
            development_factors=[],
            completed_triangle=completed_triangle,
            diagnostics=diagnostics,
            warnings=warnings,
            metadata=metadata,
            calculation_time=calculation_time,
            timestamp=datetime.utcnow()
        )
        
        self._log_calculation_end(result)
        return result
    
    def _prepare_rf_training_data(self, triangle_data: List[List[float]]) -> Tuple[List[List[float]], List[float], List[str]]:
        """Préparer les données pour Random Forest"""
        
        features = []
        targets = []
        
        # Features pour Random Forest (plus simples que NN)
        feature_names = [
            # Features de base
            "accident_year", "development_period", "calendar_year",
            "cumulative_to_date", "log_cumulative", "previous_increment",
            "increment_ratio", "maturity_ratio",
            
            # Features contextuelles
            "accident_year_size", "relative_accident_year",
            "development_velocity", "payment_regularity",
            
            # Features temporelles
            "seasonal_month", "trend_component", "calendar_effect",
            
            # Features statistiques
            "volatility_indicator", "pattern_consistency", "year_rank"
        ]
        
        # Calculer des stats globales
        global_stats = self._calculate_global_triangle_stats(triangle_data)
        
        for i, row in enumerate(triangle_data):
            if len(row) < 2:
                continue
            
            for j in range(1, len(row)):
                # Features de base
                accident_year = i
                development_period = j
                calendar_year = i + j
                cumulative_to_date = row[j-1]
                log_cumulative = math.log(max(cumulative_to_date, 1))
                previous_increment = row[j] - row[j-1] if j > 0 else row[j]
                increment_ratio = row[j] / max(row[j-1], 1) if j > 0 and row[j-1] > 0 else 1
                
                # Maturité
                max_periods = global_stats.get("max_periods", j+1)
                maturity_ratio = j / max_periods
                
                # Contexte de l'année d'accident
                accident_year_size = sum(row)
                avg_year_size = global_stats.get("avg_year_size", accident_year_size)
                relative_accident_year = accident_year_size / avg_year_size if avg_year_size > 0 else 1
                
                # Vélocité de développement
                if j >= 2:
                    prev_increment = row[j-1] - row[j-2]
                    development_velocity = (previous_increment - prev_increment) / max(abs(prev_increment), 1)
                else:
                    development_velocity = 0
                
                # Régularité des paiements
                payment_regularity = self._calculate_payment_regularity(row, j)
                
                # Features temporelles
                seasonal_month = (calendar_year % 12) / 12  # Effet saisonnier normalisé
                trend_component = development_period * 0.05  # Tendance linéaire
                calendar_effect = math.sin(2 * math.pi * calendar_year / 10)  # Cycle économique
                
                # Features statistiques
                volatility_indicator = self._calculate_volatility_indicator(row, j)
                pattern_consistency = self._calculate_pattern_consistency(triangle_data, i, j)
                
                # Rang de l'année (pour capturer l'ordre chronologique)
                year_rank = i / len(triangle_data)
                
                # Assembler les features
                feature_vector = [
                    accident_year, development_period, calendar_year,
                    cumulative_to_date, log_cumulative, previous_increment,
                    increment_ratio, maturity_ratio,
                    accident_year_size, relative_accident_year,
                    development_velocity, payment_regularity,
                    seasonal_month, trend_component, calendar_effect,
                    volatility_indicator, pattern_consistency, year_rank
                ]
                
                features.append(feature_vector)
                targets.append(row[j])
        
        return features, targets, feature_names
    
    def _calculate_global_triangle_stats(self, triangle_data: List[List[float]]) -> Dict[str, float]:
        """Calculer les statistiques globales du triangle"""
        
        max_periods = max(len(row) for row in triangle_data) if triangle_data else 1
        year_sizes = [sum(row) if row else 0 for row in triangle_data]
        avg_year_size = sum(year_sizes) / len(year_sizes) if year_sizes else 1
        
        return {
            "max_periods": max_periods,
            "avg_year_size": avg_year_size,
            "n_years": len(triangle_data)
        }
    
    def _calculate_payment_regularity(self, row: List[float], current_period: int) -> float:
        """Calculer la régularité des paiements"""
        
        if current_period < 3:
            return 1.0  # Pas assez de données
        
        # Calculer les increments
        increments = [row[i] - row[i-1] for i in range(1, min(current_period + 1, len(row)))]
        
        if len(increments) < 2:
            return 1.0
        
        # Coefficient de variation des increments
        mean_increment = sum(increments) / len(increments)
        if mean_increment <= 0:
            return 0.5
        
        variance = sum((inc - mean_increment) ** 2 for inc in increments) / len(increments)
        cv = math.sqrt(variance) / mean_increment
        
        # Transformer en score de régularité (1 = très régulier, 0 = très irrégulier)
        regularity = 1 / (1 + cv)
        
        return regularity
    
    def _calculate_volatility_indicator(self, row: List[float], current_period: int) -> float:
        """Calculer un indicateur de volatilité"""
        
        if current_period < 2:
            return 0.0
        
        # Ratios de développement
        ratios = []
        for i in range(1, min(current_period + 1, len(row))):
            if row[i-1] > 0:
                ratio = row[i] / row[i-1]
                ratios.append(ratio)
        
        if len(ratios) < 2:
            return 0.0
        
        # Écart-type des ratios
        mean_ratio = sum(ratios) / len(ratios)
        variance = sum((r - mean_ratio) ** 2 for r in ratios) / len(ratios)
        volatility = math.sqrt(variance)
        
        # Normaliser entre 0 et 1
        return min(1.0, volatility / 0.5)  # 0.5 comme référence de volatilité élevée
    
    def _calculate_pattern_consistency(self, triangle_data: List[List[float]], 
                                     target_year: int, target_period: int) -> float:
        """Calculer la consistance du pattern avec les autres années"""
        
        if target_period >= len(triangle_data[target_year]):
            return 0.5
        
        # Collecter les valeurs à la même période
        same_period_values = []
        for i, row in enumerate(triangle_data):
            if i != target_year and len(row) > target_period:
                same_period_values.append(row[target_period])
        
        if len(same_period_values) < 2:
            return 0.5
        
        # Position relative de la valeur cible
        target_value = triangle_data[target_year][target_period]
        same_period_values.sort()
        
        # Rang centile
        rank = sum(1 for val in same_period_values if val <= target_value)
        percentile = rank / len(same_period_values) if same_period_values else 0.5
        
        # Consistance = distance à la médiane (0.5)
        consistency = 1 - 2 * abs(percentile - 0.5)
        
        return max(0, consistency)
    
    def _train_random_forest(self, features: List[List[float]], targets: List[float], 
                           feature_names: List[str], params: Dict) -> Dict[str, Any]:
        """Entraîner la Random Forest"""
        
        n_estimators = params.get("n_estimators", 100)
        max_depth = params.get("max_depth", 10)
        bootstrap = params.get("bootstrap", True)
        
        print(f"🌳 Entraînement de {n_estimators} arbres...")
        
        trees = []
        oob_predictions = {}  # Pour out-of-bag evaluation
        
        for tree_idx in range(n_estimators):
            # Bootstrap des échantillons
            if bootstrap:
                bootstrap_features, bootstrap_targets, oob_indices = self._bootstrap_samples(features, targets)
            else:
                bootstrap_features, bootstrap_targets = features, targets
                oob_indices = []
            
            # Entraîner un arbre
            tree = self._train_decision_tree(
                bootstrap_features, bootstrap_targets, feature_names, 
                max_depth, params
            )
            
            trees.append({
                "tree": tree,
                "oob_indices": oob_indices
            })
            
            # Prédictions OOB
            if bootstrap and oob_indices:
                for idx in oob_indices:
                    pred = self._predict_tree_rf(tree, features[idx], feature_names)
                    if idx not in oob_predictions:
                        oob_predictions[idx] = []
                    oob_predictions[idx].append(pred)
            
            if tree_idx % 20 == 0:
                print(f"🌲 Arbres entraînés: {tree_idx + 1}/{n_estimators}")
        
        forest = {
            "trees": trees,
            "feature_names": feature_names,
            "n_estimators": len(trees),
            "oob_predictions": oob_predictions,
            "max_depth": max_depth
        }
        
        print(f"✅ Random Forest entraînée: {len(trees)} arbres")
        
        return forest
    
    def _bootstrap_samples(self, features: List[List[float]], 
                         targets: List[float]) -> Tuple[List[List[float]], List[float], List[int]]:
        """Créer un échantillon bootstrap"""
        
        n_samples = len(features)
        bootstrap_indices = [random.randint(0, n_samples - 1) for _ in range(n_samples)]
        
        bootstrap_features = [features[i] for i in bootstrap_indices]
        bootstrap_targets = [targets[i] for i in bootstrap_indices]
        
        # Indices out-of-bag
        oob_indices = [i for i in range(n_samples) if i not in bootstrap_indices]
        
        return bootstrap_features, bootstrap_targets, oob_indices
    
    def _train_decision_tree(self, features: List[List[float]], targets: List[float],
                           feature_names: List[str], max_depth: int, params: Dict) -> Dict[str, Any]:
        """Entraîner un arbre de décision pour RF"""
        
        return self._build_tree_node(features, targets, feature_names, max_depth, params, 0)
    
    def _build_tree_node(self, features: List[List[float]], targets: List[float],
                       feature_names: List[str], max_depth: int, params: Dict, 
                       current_depth: int) -> Dict[str, Any]:
        """Construire un nœud de l'arbre"""
        
        # Conditions d'arrêt
        if (current_depth >= max_depth or 
            len(features) < params.get("min_samples_split", 2) or
            len(set(targets)) == 1):  # Toutes les targets identiques
            
            mean_target = sum(targets) / len(targets) if targets else 0
            return {
                "type": "leaf",
                "value": mean_target,
                "samples": len(features)
            }
        
        # Sélectionner des features aléatoirement
        max_features_param = params.get("max_features", "sqrt")
        if max_features_param == "sqrt":
            n_features_to_try = int(math.sqrt(len(feature_names)))
        elif max_features_param == "log2":
            n_features_to_try = max(1, int(math.log2(len(feature_names))))
        elif isinstance(max_features_param, int):
            n_features_to_try = min(max_features_param, len(feature_names))
        else:
            n_features_to_try = len(feature_names)
        
        feature_indices = random.sample(range(len(feature_names)), n_features_to_try)
        
        # Trouver le meilleur split
        best_feature_idx = None
        best_threshold = None
        best_mse = float('inf')
        
        for feature_idx in feature_indices:
            feature_values = [f[feature_idx] for f in features]
            unique_values = sorted(set(feature_values))
            
            if len(unique_values) < 2:
                continue
            
            # Essayer plusieurs seuils
            for i in range(len(unique_values) - 1):
                threshold = (unique_values[i] + unique_values[i+1]) / 2
                
                left_targets = [targets[j] for j, f in enumerate(features) if f[feature_idx] <= threshold]
                right_targets = [targets[j] for j, f in enumerate(features) if f[feature_idx] > threshold]
                
                if len(left_targets) == 0 or len(right_targets) == 0:
                    continue
                
                # Calculer MSE pondéré
                left_mse = self._calculate_mse(left_targets)
                right_mse = self._calculate_mse(right_targets)
                
                total_samples = len(left_targets) + len(right_targets)
                weighted_mse = (len(left_targets) * left_mse + len(right_targets) * right_mse) / total_samples
                
                if weighted_mse < best_mse:
                    best_mse = weighted_mse
                    best_feature_idx = feature_idx
                    best_threshold = threshold
        
        # Si pas de bon split trouvé
        if best_feature_idx is None:
            mean_target = sum(targets) / len(targets) if targets else 0
            return {
                "type": "leaf",
                "value": mean_target,
                "samples": len(features)
            }
        
        # Créer les sous-ensembles
        left_features = [f for f in features if f[best_feature_idx] <= best_threshold]
        left_targets = [targets[i] for i, f in enumerate(features) if f[best_feature_idx] <= best_threshold]
        right_features = [f for f in features if f[best_feature_idx] > best_threshold]
        right_targets = [targets[i] for i, f in enumerate(features) if f[best_feature_idx] > best_threshold]
        
        # Construire récursivement
        return {
            "type": "split",
            "feature_idx": best_feature_idx,
            "feature_name": feature_names[best_feature_idx],
            "threshold": best_threshold,
            "samples": len(features),
            "mse": best_mse,
            "left": self._build_tree_node(left_features, left_targets, feature_names, max_depth, params, current_depth + 1),
            "right": self._build_tree_node(right_features, right_targets, feature_names, max_depth, params, current_depth + 1)
        }
    
    def _calculate_mse(self, targets: List[float]) -> float:
        """Calculer MSE pour une liste de targets"""
        if not targets:
            return 0
        
        mean = sum(targets) / len(targets)
        return sum((t - mean) ** 2 for t in targets) / len(targets)
    
    def _predict_tree_rf(self, tree: Dict[str, Any], features: List[float], 
                        feature_names: List[str]) -> float:
        """Prédire avec un arbre RF"""
        
        if tree["type"] == "leaf":
            return tree["value"]
        
        feature_value = features[tree["feature_idx"]]
        
        if feature_value <= tree["threshold"]:
            return self._predict_tree_rf(tree["left"], features, feature_names)
        else:
            return self._predict_tree_rf(tree["right"], features, feature_names)
    
    def _predict_forest(self, forest: Dict[str, Any], features: List[float]) -> float:
        """Prédire avec la forêt complète (moyenne des arbres)"""
        
        predictions = []
        for tree_data in forest["trees"]:
            tree = tree_data["tree"]
            pred = self._predict_tree_rf(tree, features, forest["feature_names"])
            predictions.append(pred)
        
        return sum(predictions) / len(predictions) if predictions else 0
    
    def _calculate_oob_score(self, forest: Dict[str, Any], 
                           features: List[List[float]], targets: List[float]) -> Dict[str, float]:
        """Calculer le score Out-of-Bag"""
        
        oob_predictions = forest.get("oob_predictions", {})
        
        if not oob_predictions:
            return {"r2": 0, "mse": 0, "mae": 0}
        
        # Moyenner les prédictions OOB pour chaque échantillon
        oob_pred_final = {}
        oob_targets_final = {}
        
        for idx, pred_list in oob_predictions.items():
            if idx < len(targets):
                oob_pred_final[idx] = sum(pred_list) / len(pred_list)
                oob_targets_final[idx] = targets[idx]
        
        if not oob_pred_final:
            return {"r2": 0, "mse": 0, "mae": 0}
        
        # Calculer métriques
        pred_values = list(oob_pred_final.values())
        true_values = list(oob_targets_final.values())
        
        # MSE
        mse = sum((p - t) ** 2 for p, t in zip(pred_values, true_values)) / len(pred_values)
        
        # MAE
        mae = sum(abs(p - t) for p, t in zip(pred_values, true_values)) / len(pred_values)
        
        # R²
        mean_true = sum(true_values) / len(true_values)
        ss_tot = sum((t - mean_true) ** 2 for t in true_values)
        ss_res = sum((p - t) ** 2 for p, t in zip(pred_values, true_values))
        r2 = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0
        
        return {
            "r2": max(0, min(1, r2)),
            "mse": mse,
            "mae": mae,
            "oob_samples": len(pred_values)
        }
    
    def _predict_missing_values_rf(self, triangle_data: List[List[float]], 
                                 forest: Dict[str, Any], feature_names: List[str]) -> List[List[float]]:
        """Prédire les valeurs manquantes avec RF"""
        
        completed = []
        max_periods = max(len(row) for row in triangle_data) + 2
        
        for i, row in enumerate(triangle_data):
            completed_row = list(row) if row else []
            
            for j in range(len(completed_row), max_periods):
                if j == 0:
                    completed_row.append(0)
                    continue
                
                # Créer les features pour cette prédiction
                features = self._create_rf_prediction_features(
                    i, j, completed_row, triangle_data, feature_names
                )
                
                # Prédire avec la forêt
                predicted_value = self._predict_forest(forest, features)
                
                # Assurer la monotonie
                if completed_row:
                    predicted_value = max(predicted_value, completed_row[-1])
                
                completed_row.append(max(0, predicted_value))
            
            completed.append(completed_row)
        
        return completed
    
    def _create_rf_prediction_features(self, accident_year: int, development_period: int,
                                     current_row: List[float], all_data: List[List[float]],
                                     feature_names: List[str]) -> List[float]:
        """Créer les features pour une prédiction RF"""
        
        calendar_year = accident_year + development_period
        
        # Features de base
        cumulative_to_date = current_row[-1] if current_row else 0
        log_cumulative = math.log(max(cumulative_to_date, 1))
        
        if len(current_row) >= 2:
            previous_increment = current_row[-1] - current_row[-2]
            increment_ratio = current_row[-1] / max(current_row[-2], 1)
        else:
            previous_increment = current_row[0] if current_row else 0
            increment_ratio = 1
        
        # Maturity
        max_periods = max(len(r) for r in all_data) if all_data else development_period
        maturity_ratio = development_period / max_periods
        
        # Contexte
        accident_year_size = sum(current_row) if current_row else 0
        avg_size = sum(sum(r) for r in all_data) / len(all_data) if all_data else accident_year_size
        relative_accident_year = accident_year_size / avg_size if avg_size > 0 else 1
        
        # Autres features (estimées)
        development_velocity = 0
        payment_regularity = 0.8  # Valeur par défaut
        seasonal_month = (calendar_year % 12) / 12
        trend_component = development_period * 0.05
        calendar_effect = math.sin(2 * math.pi * calendar_year / 10)
        volatility_indicator = 0.2  # Valeur par défaut
        pattern_consistency = 0.6  # Valeur par défaut
        year_rank = accident_year / len(all_data) if all_data else 0
        
        return [
            accident_year, development_period, calendar_year,
            cumulative_to_date, log_cumulative, previous_increment,
            increment_ratio, maturity_ratio,
            accident_year_size, relative_accident_year,
            development_velocity, payment_regularity,
            seasonal_month, trend_component, calendar_effect,
            volatility_indicator, pattern_consistency, year_rank
        ]
    
    def _calculate_feature_importance_rf(self, forest: Dict[str, Any], 
                                       feature_names: List[str], params: Dict) -> Dict[str, float]:
        """Calculer l'importance des features pour RF"""
        
        importance = [0.0] * len(feature_names)
        
        # Importance basée sur la réduction d'impureté
        for tree_data in forest["trees"]:
            tree = tree_data["tree"]
            self._accumulate_feature_importance(tree, importance)
        
        # Normaliser
        total_importance = sum(importance)
        if total_importance > 0:
            importance = [imp / total_importance for imp in importance]
        else:
            importance = [1.0 / len(feature_names)] * len(feature_names)
        
        # Créer dictionnaire trié
        feature_importance_dict = {}
        for name, imp in zip(feature_names, importance):
            feature_importance_dict[name] = round(imp, 4)
        
        return dict(sorted(feature_importance_dict.items(), key=lambda x: x[1], reverse=True))
    
    def _accumulate_feature_importance(self, node: Dict[str, Any], importance: List[float]):
        """Accumuler l'importance d'un nœud"""
        
        if node["type"] == "leaf":
            return
        
        # Augmenter l'importance de la feature utilisée
        feature_idx = node["feature_idx"]
        if 0 <= feature_idx < len(importance):
            # Pondérer par le nombre d'échantillons et la réduction MSE
            weight = node.get("samples", 1) * (1 / max(node.get("mse", 1), 1e-10))
            importance[feature_idx] += weight
        
        # Récursion
        if "left" in node:
            self._accumulate_feature_importance(node["left"], importance)
        if "right" in node:
            self._accumulate_feature_importance(node["right"], importance)
    
    def _get_forest_statistics(self, forest: Dict[str, Any]) -> Dict[str, Any]:
        """Statistiques de la forêt"""
        
        trees = forest.get("trees", [])
        
        # Profondeurs des arbres
        depths = []
        for tree_data in trees:
            depth = self._calculate_tree_depth(tree_data["tree"])
            depths.append(depth)
        
        # Nombres de feuilles
        leaf_counts = []
        for tree_data in trees:
            leaf_count = self._count_leaves(tree_data["tree"])
            leaf_counts.append(leaf_count)
        
        return {
            "n_trees": len(trees),
            "avg_tree_depth": sum(depths) / len(depths) if depths else 0,
            "max_tree_depth": max(depths) if depths else 0,
            "avg_leaves_per_tree": sum(leaf_counts) / len(leaf_counts) if leaf_counts else 0,
            "total_leaves": sum(leaf_counts)
        }
    
    def _calculate_tree_depth(self, node: Dict[str, Any]) -> int:
        """Calculer la profondeur d'un arbre"""
        
        if node["type"] == "leaf":
            return 1
        
        left_depth = self._calculate_tree_depth(node["left"]) if "left" in node else 0
        right_depth = self._calculate_tree_depth(node["right"]) if "right" in node else 0
        
        return 1 + max(left_depth, right_depth)
    
    def _count_leaves(self, node: Dict[str, Any]) -> int:
        """Compter le nombre de feuilles"""
        
        if node["type"] == "leaf":
            return 1
        
        left_leaves = self._count_leaves(node["left"]) if "left" in node else 0
        right_leaves = self._count_leaves(node["right"]) if "right" in node else 0
        
        return left_leaves + right_leaves
    
    def _calculate_rf_diagnostics(self, observed: List[List[float]],
                                completed: List[List[float]],
                                ultimates: List[float],
                                forest: Dict[str, Any],
                                oob_score: Dict[str, float],
                                feature_importance: Dict[str, float]) -> Dict[str, float]:
        """Diagnostics Random Forest"""
        
        # Scores OOB
        oob_r2 = oob_score.get("r2", 0) if oob_score else 0
        oob_mse = oob_score.get("mse", 0) if oob_score else 0
        
        # Complexité de la forêt
        forest_stats = self._get_forest_statistics(forest)
        avg_tree_depth = forest_stats.get("avg_tree_depth", 0)
        
        # Diversité des features importantes
        top_features_count = len([f for f in feature_importance.values() if f > 0.05])
        feature_diversity = top_features_count / len(feature_importance) if feature_importance else 0
        
        # Stabilité estimée (basée sur OOB et complexité)
        complexity_factor = min(1.0, avg_tree_depth / 10)  # Normaliser la complexité
        model_stability = oob_r2 * (1 - 0.3 * complexity_factor)  # Pénaliser la complexité excessive
        
        return {
            "oob_r2": round(oob_r2, 4),
            "oob_mse": round(oob_mse, 6),
            "avg_tree_depth": round(avg_tree_depth, 1),
            "feature_diversity": round(feature_diversity, 4),
            "model_stability": round(max(0, model_stability), 4),
            "ensemble_strength": round(forest.get("n_estimators", 0) / 100, 2),
            "convergence": 1.0
        }
    
    def _generate_rf_warnings(self, triangle_data: TriangleData,
                            stats: Dict[str, float],
                            forest: Dict[str, Any],
                            oob_score: Dict[str, float],
                            feature_importance: Dict[str, float]) -> List[str]:
        """Avertissements Random Forest"""
        warnings = []
        
        # Performance OOB
        if oob_score:
            oob_r2 = oob_score.get("r2", 0)
            if oob_r2 < 0.6:
                warnings.append(f"Score OOB faible (R² = {oob_r2:.2f}) - modèle peu performant")
        else:
            warnings.append("Score OOB non disponible - pas d'évaluation de performance")
        
        # Données
        data_points = stats.get("data_points", 0)
        if data_points < 25:
            warnings.append(f"Peu de données ({data_points} points) - RF peut être instable")
        
        # Complexité des arbres
        forest_stats = self._get_forest_statistics(forest)
        avg_depth = forest_stats.get("avg_tree_depth", 0)
        if avg_depth > 15:
            warnings.append("Arbres très profonds - risque de surapprentissage")
        elif avg_depth < 3:
            warnings.append("Arbres très shallow - modèle possiblement sous-ajusté")
        
        # Importance des features
        if feature_importance:
            top_importance = max(feature_importance.values())
            if top_importance > 0.6:
                warnings.append("Une feature domine le modèle - diversité limitée")
        
        # Nombre d'arbres
        n_trees = forest.get("n_estimators", 0)
        if n_trees < 50:
            warnings.append("Peu d'arbres - augmenter n_estimators pour plus de stabilité")
        
        warnings.append("RF expérimental en actuariat - comparer avec méthodes traditionnelles")
        
        return warnings
    
    def get_method_info(self) -> Dict[str, Any]:
        """Informations détaillées sur Random Forest"""
        return {
            "method_id": self.method_id,
            "method_name": self.method_name,
            "category": self.config.category,
            "description": self.config.description,
            "advantages": [
                "Robuste aux outliers et au bruit",
                "Gère naturellement les interactions non-linéaires",
                "Fournit l'importance des variables",
                "Évaluation OOB intégrée",
                "Moins prone au surapprentissage que les arbres seuls"
            ],
            "limitations": [
                "Moins interprétable que les méthodes traditionnelles",
                "Peut surajuster avec des données très bruitées",
                "Performance dépend des hyperparamètres",
                "Pas d'interprétation actuarielle directe"
            ],
            "best_use_cases": [
                "Triangles avec patterns irréguliers",
                "Données avec outliers",
                "Recherche de relations non-linéaires",
                "Validation de méthodes traditionnelles"
            ],
            "assumptions": [
                "Patterns historiques informatifs",
                "Relations non-linéaires dans les données",
                "Features engineered pertinentes",
                "Stabilité des relations dans le temps"
            ],
            "parameters": self.config.parameters
        }

def create_random_forest_method() -> RandomForestMethod:
    """Factory pour créer une instance Random Forest"""
    return RandomForestMethod()