# backend/app/actuarial/compliance/__init__.py

"""
Système de conformité réglementaire et validation actuarielle

Ce module fournit :
- Validation Solvabilité II
- Conformité IFRS 17
- Standards actuariels internationaux (IAS, US GAAP)
- Tests de cohérence et validation croisée
- Certification des calculs
- Audit trail complet
"""

from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime, date
from enum import Enum
import json
import hashlib
from abc import ABC, abstractmethod

from ..base.method_interface import CalculationResult, TriangleData
from ..base.triangle_utils import calculate_triangle_statistics
from ..config import get_logger, config

# ============================================================================
# Enums et constantes réglementaires
# ============================================================================

class RegulatoryFramework(Enum):
    """Frameworks réglementaires supportés"""
    SOLVENCY_II = "solvency_ii"
    IFRS_17 = "ifrs_17"
    US_GAAP = "us_gaap"
    SWISS_TEST = "swiss_test"
    ORSA = "orsa"
    EIOPA_GUIDELINES = "eiopa_guidelines"

class ComplianceLevel(Enum):
    """Niveaux de conformité"""
    COMPLIANT = "compliant"
    WARNING = "warning"
    NON_COMPLIANT = "non_compliant"
    NOT_APPLICABLE = "not_applicable"

class ValidationSeverity(Enum):
    """Sévérité des violations"""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"

@dataclass
class ComplianceRule:
    """Règle de conformité réglementaire"""
    id: str
    name: str
    description: str
    framework: RegulatoryFramework
    severity: ValidationSeverity
    category: str
    reference: str  # Article/section réglementaire
    active: bool = True
    tolerance: Optional[float] = None

@dataclass
class ComplianceViolation:
    """Violation de conformité détectée"""
    rule_id: str
    rule_name: str
    severity: ValidationSeverity
    description: str
    current_value: Any
    expected_value: Any
    deviation: Optional[float] = None
    remediation: Optional[str] = None
    reference: Optional[str] = None

@dataclass
class ComplianceReport:
    """Rapport de conformité complet"""
    framework: RegulatoryFramework
    assessment_date: datetime
    overall_status: ComplianceLevel
    violations: List[ComplianceViolation] = field(default_factory=list)
    warnings: List[ComplianceViolation] = field(default_factory=list)
    passed_rules: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def get_summary(self) -> Dict[str, Any]:
        """Résumé du rapport"""
        return {
            "framework": self.framework.value,
            "status": self.overall_status.value,
            "total_violations": len(self.violations),
            "critical_violations": len([v for v in self.violations if v.severity == ValidationSeverity.CRITICAL]),
            "warnings": len(self.warnings),
            "compliance_rate": len(self.passed_rules) / (len(self.passed_rules) + len(self.violations)) if (len(self.passed_rules) + len(self.violations)) > 0 else 1.0
        }

# ============================================================================
# Interface de base pour les validateurs
# ============================================================================

class RegulatoryValidator(ABC):
    """Classe de base pour tous les validateurs réglementaires"""
    
    def __init__(self, framework: RegulatoryFramework):
        self.framework = framework
        self.rules = self._load_rules()
        self.logger = get_logger(f"compliance.{framework.value}")
    
    @abstractmethod
    def _load_rules(self) -> List[ComplianceRule]:
        """Charger les règles spécifiques au framework"""
        pass
    
    @abstractmethod
    def validate_calculation(self, result: CalculationResult, 
                           triangle_data: TriangleData, **context) -> ComplianceReport:
        """Valider un calcul selon le framework"""
        pass
    
    def validate_method_appropriateness(self, method_id: str, 
                                      triangle_data: TriangleData) -> List[ComplianceViolation]:
        """Valider que la méthode est appropriée selon le framework"""
        violations = []
        
        # Règles générales d'appropriateness des méthodes
        stats = calculate_triangle_statistics(triangle_data.data)
        
        # Exemple de validation générique
        if method_id in ["gradient_boosting", "neural_network", "random_forest"] and self.framework == RegulatoryFramework.SOLVENCY_II:
            violations.append(ComplianceViolation(
                rule_id="SII_METHOD_APPROPRIATENESS_001",
                rule_name="Méthodes ML non validées en Solvabilité II",
                severity=ValidationSeverity.WARNING,
                description="Les méthodes ML ne sont pas explicitement reconnues par Solvabilité II",
                current_value=method_id,
                expected_value="méthodes traditionnelles",
                remediation="Utiliser comme méthode de validation croisée uniquement"
            ))
        
        return violations
    
    def _create_compliance_report(self, violations: List[ComplianceViolation], 
                                warnings: List[ComplianceViolation],
                                passed_rules: List[str]) -> ComplianceReport:
        """Créer un rapport de conformité"""
        
        # Déterminer le statut global
        if any(v.severity == ValidationSeverity.CRITICAL for v in violations):
            overall_status = ComplianceLevel.NON_COMPLIANT
        elif violations:
            overall_status = ComplianceLevel.WARNING
        else:
            overall_status = ComplianceLevel.COMPLIANT
        
        return ComplianceReport(
            framework=self.framework,
            assessment_date=datetime.utcnow(),
            overall_status=overall_status,
            violations=violations,
            warnings=warnings,
            passed_rules=passed_rules
        )

# ============================================================================
# Validateur Solvabilité II
# ============================================================================

class SolvencyIIValidator(RegulatoryValidator):
    """Validateur pour Solvabilité II"""
    
    def __init__(self):
        super().__init__(RegulatoryFramework.SOLVENCY_II)
    
    def _load_rules(self) -> List[ComplianceRule]:
        """Règles Solvabilité II"""
        return [
            ComplianceRule(
                id="SII_TP_001",
                name="Best Estimate - Prudence",
                description="Les provisions techniques doivent être calculées sans marge de prudence",
                framework=RegulatoryFramework.SOLVENCY_II,
                severity=ValidationSeverity.ERROR,
                category="technical_provisions",
                reference="Article 77 Directive 2009/138/CE"
            ),
            ComplianceRule(
                id="SII_TP_002", 
                name="Methods Appropriateness",
                description="Les méthodes actuarielles doivent être appropriées aux données",
                framework=RegulatoryFramework.SOLVENCY_II,
                severity=ValidationSeverity.WARNING,
                category="methodology",
                reference="Article 78 Directive 2009/138/CE"
            ),
            ComplianceRule(
                id="SII_TP_003",
                name="Data Quality",
                description="Les données doivent être complètes, précises et appropriées",
                framework=RegulatoryFramework.SOLVENCY_II,
                severity=ValidationSeverity.ERROR,
                category="data_quality",
                reference="Article 82 Directive 2009/138/CE"
            ),
            ComplianceRule(
                id="SII_VAL_001",
                name="Independent Validation",
                description="Validation indépendante des calculs actuariels requise",
                framework=RegulatoryFramework.SOLVENCY_II,
                severity=ValidationSeverity.WARNING,
                category="validation",
                reference="Guidelines EIOPA"
            ),
            ComplianceRule(
                id="SII_DOC_001",
                name="Documentation Requirements",
                description="Documentation complète des méthodes et hypothèses requise",
                framework=RegulatoryFramework.SOLVENCY_II,
                severity=ValidationSeverity.WARNING,
                category="documentation",
                reference="Article 123 Directive 2009/138/CE"
            )
        ]
    
    def validate_calculation(self, result: CalculationResult, 
                           triangle_data: TriangleData, **context) -> ComplianceReport:
        """Validation Solvabilité II complète"""
        
        violations = []
        warnings = []
        passed_rules = []
        
        # 1. Validation de la méthode
        method_violations = self.validate_method_appropriateness(result.method_id, triangle_data)
        violations.extend(method_violations)
        
        # 2. Validation de la qualité des données
        data_violations = self._validate_data_quality(triangle_data)
        violations.extend(data_violations)
        
        # 3. Validation des résultats
        result_violations = self._validate_result_reasonableness(result, triangle_data, context)
        violations.extend(result_violations)
        
        # 4. Validation de la documentation
        doc_violations = self._validate_documentation(result, context)
        warnings.extend(doc_violations)
        
        # 5. Tests de cohérence
        consistency_violations = self._validate_consistency(result, context)
        violations.extend(consistency_violations)
        
        # Marquer les règles passées
        all_rule_ids = [rule.id for rule in self.rules]
        violation_rule_ids = [v.rule_id for v in violations + warnings]
        passed_rules = [rule_id for rule_id in all_rule_ids if rule_id not in violation_rule_ids]
        
        return self._create_compliance_report(violations, warnings, passed_rules)
    
    def _validate_data_quality(self, triangle_data: TriangleData) -> List[ComplianceViolation]:
        """Validation de la qualité des données selon Solvabilité II"""
        violations = []
        
        stats = calculate_triangle_statistics(triangle_data.data)
        
        # Densité des données
        if stats.get("density", 0) < 0.7:
            violations.append(ComplianceViolation(
                rule_id="SII_TP_003",
                rule_name="Data Quality - Completeness",
                severity=ValidationSeverity.WARNING,
                description=f"Triangle peu dense ({stats.get('density', 0):.1%}), peut affecter la fiabilité",
                current_value=f"{stats.get('density', 0):.1%}",
                expected_value=">70%",
                reference="Article 82 - Données complètes et appropriées"
            ))
        
        # Nombre de points de données
        if stats.get("data_points", 0) < 10:
            violations.append(ComplianceViolation(
                rule_id="SII_TP_003",
                rule_name="Data Quality - Sufficiency", 
                severity=ValidationSeverity.ERROR,
                description="Données insuffisantes pour estimation fiable",
                current_value=stats.get("data_points", 0),
                expected_value="≥10",
                remediation="Collecter plus de données historiques ou ajuster la méthode"
            ))
        
        # Variabilité excessive
        if stats.get("coefficient_of_variation", 0) > 2.0:
            violations.append(ComplianceViolation(
                rule_id="SII_TP_003",
                rule_name="Data Quality - Stability",
                severity=ValidationSeverity.WARNING,
                description="Forte variabilité des données détectée",
                current_value=f"{stats.get('coefficient_of_variation', 0):.2f}",
                expected_value="<2.0",
                remediation="Investiguer les causes de variabilité"
            ))
        
        return violations
    
    def _validate_result_reasonableness(self, result: CalculationResult, 
                                      triangle_data: TriangleData, 
                                      context: Dict[str, Any]) -> List[ComplianceViolation]:
        """Validation du caractère raisonnable des résultats"""
        violations = []
        
        # Ratio réserves/payés
        if result.paid_to_date > 0:
            reserves_ratio = result.reserves / result.paid_to_date
            
            # Ratio très élevé suspect
            if reserves_ratio > 5.0:
                violations.append(ComplianceViolation(
                    rule_id="SII_TP_001",
                    rule_name="Best Estimate Reasonableness",
                    severity=ValidationSeverity.WARNING,
                    description="Ratio réserves/payés très élevé, vérifier les calculs",
                    current_value=f"{reserves_ratio:.2f}",
                    expected_value="<5.0",
                    remediation="Revoir les facteurs de développement et hypothèses"
                ))
            
            # Ratio négatif impossible
            if reserves_ratio < 0:
                violations.append(ComplianceViolation(
                    rule_id="SII_TP_001",
                    rule_name="Best Estimate - Non-negative",
                    severity=ValidationSeverity.CRITICAL,
                    description="Réserves négatives non conformes à Solvabilité II",
                    current_value=f"{result.reserves:,.0f}",
                    expected_value="≥0",
                    remediation="Revoir la méthode de calcul"
                ))
        
        # Avertissements excessifs
        if len(result.warnings) > 5:
            violations.append(ComplianceViolation(
                rule_id="SII_TP_002",
                rule_name="Method Appropriateness - Warnings",
                severity=ValidationSeverity.WARNING,
                description="Nombreux avertissements indiquent des problèmes méthodologiques",
                current_value=len(result.warnings),
                expected_value="≤5",
                remediation="Investiguer et résoudre les avertissements"
            ))
        
        return violations
    
    def _validate_documentation(self, result: CalculationResult, 
                              context: Dict[str, Any]) -> List[ComplianceViolation]:
        """Validation de la documentation"""
        violations = []
        
        # Documentation des hypothèses
        if not context.get("documented_assumptions"):
            violations.append(ComplianceViolation(
                rule_id="SII_DOC_001",
                rule_name="Documentation - Assumptions",
                severity=ValidationSeverity.WARNING,
                description="Hypothèses actuarielles non documentées",
                current_value="Non documenté",
                expected_value="Documenté",
                remediation="Documenter toutes les hypothèses clés"
            ))
        
        # Validation indépendante
        if not context.get("independent_review"):
            violations.append(ComplianceViolation(
                rule_id="SII_VAL_001",
                rule_name="Independent Validation", 
                severity=ValidationSeverity.WARNING,
                description="Validation indépendante non effectuée",
                current_value="Non effectuée",
                expected_value="Effectuée",
                remediation="Organiser une revue indépendante des calculs"
            ))
        
        return violations
    
    def _validate_consistency(self, result: CalculationResult, 
                            context: Dict[str, Any]) -> List[ComplianceViolation]:
        """Tests de cohérence"""
        violations = []
        
        # Cohérence temporelle
        if context.get("previous_ultimate"):
            previous_ultimate = context["previous_ultimate"]
            variation = abs(result.ultimate_total - previous_ultimate) / previous_ultimate
            
            if variation > 0.3:  # Variation > 30%
                violations.append(ComplianceViolation(
                    rule_id="SII_TP_002",
                    rule_name="Temporal Consistency",
                    severity=ValidationSeverity.WARNING,
                    description="Forte variation vs période précédente",
                    current_value=f"{variation:.1%}",
                    expected_value="<30%",
                    remediation="Justifier la variation ou revoir les calculs"
                ))
        
        return violations

# ============================================================================
# Validateur IFRS 17
# ============================================================================

class IFRS17Validator(RegulatoryValidator):
    """Validateur pour IFRS 17"""
    
    def __init__(self):
        super().__init__(RegulatoryFramework.IFRS_17)
    
    def _load_rules(self) -> List[ComplianceRule]:
        """Règles IFRS 17"""
        return [
            ComplianceRule(
                id="IFRS17_FC_001",
                name="Fulfillment Cash Flows",
                description="Cash flows d'exécution comprenant toutes les sorties futures",
                framework=RegulatoryFramework.IFRS_17,
                severity=ValidationSeverity.ERROR,
                category="measurement",
                reference="IFRS 17.33"
            ),
            ComplianceRule(
                id="IFRS17_RA_001",
                name="Risk Adjustment",
                description="Ajustement pour risque requis pour l'incertitude",
                framework=RegulatoryFramework.IFRS_17,
                severity=ValidationSeverity.ERROR,
                category="measurement",
                reference="IFRS 17.37"
            ),
            ComplianceRule(
                id="IFRS17_DISC_001",
                name="Discount Rate",
                description="Actualisation avec taux reflétant les caractéristiques des cash flows",
                framework=RegulatoryFramework.IFRS_17,
                severity=ValidationSeverity.ERROR,
                category="measurement",
                reference="IFRS 17.36"
            )
        ]
    
    def validate_calculation(self, result: CalculationResult, 
                           triangle_data: TriangleData, **context) -> ComplianceReport:
        """Validation IFRS 17"""
        
        violations = []
        warnings = []
        passed_rules = []
        
        # 1. Validation des cash flows d'exécution
        fc_violations = self._validate_fulfillment_cash_flows(result, triangle_data, context)
        violations.extend(fc_violations)
        
        # 2. Validation de l'ajustement pour risque
        ra_violations = self._validate_risk_adjustment(result, context)
        violations.extend(ra_violations)
        
        # 3. Validation de l'actualisation
        disc_violations = self._validate_discounting(result, context)
        violations.extend(disc_violations)
        
        # Marquer les règles passées
        all_rule_ids = [rule.id for rule in self.rules]
        violation_rule_ids = [v.rule_id for v in violations + warnings]
        passed_rules = [rule_id for rule_id in all_rule_ids if rule_id not in violation_rule_ids]
        
        return self._create_compliance_report(violations, warnings, passed_rules)
    
    def _validate_fulfillment_cash_flows(self, result: CalculationResult, 
                                       triangle_data: TriangleData,
                                       context: Dict[str, Any]) -> List[ComplianceViolation]:
        """Validation des cash flows d'exécution"""
        violations = []
        
        # Vérifier que tous les cash flows futurs sont inclus
        if not context.get("includes_future_claims"):
            violations.append(ComplianceViolation(
                rule_id="IFRS17_FC_001",
                rule_name="Complete Future Cash Flows",
                severity=ValidationSeverity.ERROR,
                description="Tous les cash flows futurs doivent être inclus",
                current_value="Partiellement inclus",
                expected_value="Complètement inclus",
                reference="IFRS 17.33"
            ))
        
        return violations
    
    def _validate_risk_adjustment(self, result: CalculationResult, 
                                context: Dict[str, Any]) -> List[ComplianceViolation]:
        """Validation de l'ajustement pour risque"""
        violations = []
        
        if not context.get("risk_adjustment_calculated"):
            violations.append(ComplianceViolation(
                rule_id="IFRS17_RA_001",
                rule_name="Risk Adjustment Required",
                severity=ValidationSeverity.ERROR,
                description="Ajustement pour risque obligatoire sous IFRS 17",
                current_value="Non calculé",
                expected_value="Calculé",
                reference="IFRS 17.37"
            ))
        
        return violations
    
    def _validate_discounting(self, result: CalculationResult, 
                            context: Dict[str, Any]) -> List[ComplianceViolation]:
        """Validation de l'actualisation"""
        violations = []
        
        if not context.get("discounted"):
            violations.append(ComplianceViolation(
                rule_id="IFRS17_DISC_001",
                rule_name="Discounting Required",
                severity=ValidationSeverity.ERROR,
                description="Actualisation obligatoire sous IFRS 17",
                current_value="Non actualisé",
                expected_value="Actualisé",
                reference="IFRS 17.36"
            ))
        
        return violations

# ============================================================================
# Gestionnaire de conformité principal
# ============================================================================

class ComplianceManager:
    """Gestionnaire principal de conformité réglementaire"""
    
    def __init__(self):
        self.validators = {
            RegulatoryFramework.SOLVENCY_II: SolvencyIIValidator(),
            RegulatoryFramework.IFRS_17: IFRS17Validator()
        }
        self.logger = get_logger("compliance_manager")
        
    def validate_calculation(self, result: CalculationResult, triangle_data: TriangleData,
                           frameworks: List[RegulatoryFramework], **context) -> Dict[RegulatoryFramework, ComplianceReport]:
        """
        Valider un calcul selon plusieurs frameworks réglementaires
        
        Args:
            result: Résultat du calcul actuariel
            triangle_data: Données du triangle
            frameworks: Frameworks à appliquer
            **context: Contexte additionnel (documentation, etc.)
            
        Returns:
            Dict avec un rapport par framework
        """
        
        reports = {}
        
        for framework in frameworks:
            if framework not in self.validators:
                self.logger.warning(f"Framework non supporté", framework=framework.value)
                continue
            
            try:
                self.logger.info(f"Validation démarrée", framework=framework.value, method=result.method_id)
                
                validator = self.validators[framework]
                report = validator.validate_calculation(result, triangle_data, **context)
                
                reports[framework] = report
                
                self.logger.info(
                    f"Validation terminée",
                    framework=framework.value,
                    status=report.overall_status.value,
                    violations=len(report.violations)
                )
                
            except Exception as e:
                self.logger.error(f"Erreur validation", framework=framework.value, error=str(e))
                
                # Créer un rapport d'erreur
                error_report = ComplianceReport(
                    framework=framework,
                    assessment_date=datetime.utcnow(),
                    overall_status=ComplianceLevel.NON_COMPLIANT,
                    violations=[
                        ComplianceViolation(
                            rule_id="SYSTEM_ERROR",
                            rule_name="System Error",
                            severity=ValidationSeverity.CRITICAL,
                            description=f"Erreur système lors de la validation: {str(e)}",
                            current_value="Error",
                            expected_value="Success"
                        )
                    ]
                )
                reports[framework] = error_report
        
        return reports
    
    def get_compliance_summary(self, reports: Dict[RegulatoryFramework, ComplianceReport]) -> Dict[str, Any]:
        """Créer un résumé de conformité multi-frameworks"""
        
        summary = {
            "assessment_date": datetime.utcnow().isoformat(),
            "frameworks_assessed": [fw.value for fw in reports.keys()],
            "overall_compliant": all(
                report.overall_status in [ComplianceLevel.COMPLIANT, ComplianceLevel.WARNING] 
                for report in reports.values()
            ),
            "framework_details": {},
            "critical_violations": [],
            "recommendations": []
        }
        
        for framework, report in reports.items():
            summary["framework_details"][framework.value] = report.get_summary()
            
            # Collecter les violations critiques
            critical_violations = [v for v in report.violations if v.severity == ValidationSeverity.CRITICAL]
            for violation in critical_violations:
                summary["critical_violations"].append({
                    "framework": framework.value,
                    "rule": violation.rule_name,
                    "description": violation.description,
                    "remediation": violation.remediation
                })
        
        # Générer des recommandations
        if summary["critical_violations"]:
            summary["recommendations"].append("Résoudre les violations critiques avant mise en production")
        
        if any(len(report.warnings) > 3 for report in reports.values()):
            summary["recommendations"].append("Investiguer les avertissements multiples")
        
        return summary
    
    def register_validator(self, framework: RegulatoryFramework, validator: RegulatoryValidator):
        """Enregistrer un validateur personnalisé"""
        self.validators[framework] = validator
        self.logger.info(f"Validateur enregistré", framework=framework.value)
    
    def get_supported_frameworks(self) -> List[str]:
        """Obtenir la liste des frameworks supportés"""
        return [fw.value for fw in self.validators.keys()]

# ============================================================================
# Système d'audit trail
# ============================================================================

@dataclass
class AuditEntry:
    """Entrée d'audit trail"""
    timestamp: datetime
    calculation_id: str
    method_id: str
    user_id: Optional[str]
    triangle_hash: str
    result_hash: str
    compliance_status: Dict[str, str]  # Framework -> Status
    metadata: Dict[str, Any] = field(default_factory=dict)

class AuditTrailManager:
    """Gestionnaire de l'audit trail"""
    
    def __init__(self):
        self.logger = get_logger("audit_trail")
        self._audit_entries = []  # En production: base de données
    
    def record_calculation(self, result: CalculationResult, triangle_data: TriangleData,
                          compliance_reports: Dict[RegulatoryFramework, ComplianceReport],
                          user_id: Optional[str] = None) -> str:
        """Enregistrer un calcul dans l'audit trail"""
        
        # Générer les hash pour intégrité
        triangle_hash = self._hash_triangle_data(triangle_data)
        result_hash = self._hash_calculation_result(result)
        calculation_id = f"{result.method_id}_{triangle_hash[:8]}_{int(result.timestamp.timestamp())}"
        
        # Créer l'entrée d'audit
        audit_entry = AuditEntry(
            timestamp=datetime.utcnow(),
            calculation_id=calculation_id,
            method_id=result.method_id,
            user_id=user_id,
            triangle_hash=triangle_hash,
            result_hash=result_hash,
            compliance_status={
                fw.value: report.overall_status.value 
                for fw, report in compliance_reports.items()
            },
            metadata={
                "ultimate_total": result.ultimate_total,
                "calculation_time": result.calculation_time,
                "warnings_count": len(result.warnings),
                "triangle_size": (len(triangle_data.data), max(len(row) for row in triangle_data.data) if triangle_data.data else 0)
            }
        )
        
        self._audit_entries.append(audit_entry)
        
        self.logger.info(
            "Calcul enregistré dans audit trail",
            calculation_id=calculation_id,
            method=result.method_id,
            compliance_status=audit_entry.compliance_status
        )
        
        return calculation_id
    
    def _hash_triangle_data(self, triangle_data: TriangleData) -> str:
        """Générer un hash des données triangle pour intégrité"""
        triangle_str = json.dumps(triangle_data.data, sort_keys=True)
        return hashlib.sha256(triangle_str.encode()).hexdigest()
    
    def _hash_calculation_result(self, result: CalculationResult) -> str:
        """Générer un hash du résultat pour intégrité"""
        result_data = {
            "method_id": result.method_id,
            "ultimate_total": result.ultimate_total,
            "ultimates_by_year": result.ultimates_by_year,
            "development_factors": result.development_factors
        }
        result_str = json.dumps(result_data, sort_keys=True, default=str)
        return hashlib.sha256(result_str.encode()).hexdigest()
    
    def get_audit_history(self, method_id: Optional[str] = None, 
                         limit: int = 100) -> List[AuditEntry]:
        """Récupérer l'historique d'audit"""
        entries = self._audit_entries
        
        if method_id:
            entries = [e for e in entries if e.method_id == method_id]
        
        # Trier par timestamp descendant et limiter
        entries.sort(key=lambda e: e.timestamp, reverse=True)
        return entries[:limit]

# ============================================================================
# Instances globales
# ============================================================================

# Instance globale du gestionnaire de conformité
compliance_manager = ComplianceManager()

# Instance globale de l'audit trail
audit_trail_manager = AuditTrailManager()

# ============================================================================
# Fonctions utilitaires pour l'API
# ============================================================================

def validate_calculation_compliance(result: CalculationResult, triangle_data: TriangleData,
                                  frameworks: List[str], **context) -> Dict[str, Any]:
    """
    Fonction utilitaire pour valider la conformité d'un calcul
    
    Args:
        result: Résultat du calcul
        triangle_data: Données du triangle
        frameworks: Liste des frameworks à appliquer
        **context: Contexte additionnel
        
    Returns:
        Dictionnaire avec les rapports de conformité
    """
    
    # Convertir les strings en enums
    framework_enums = []
    for fw_str in frameworks:
        try:
            framework_enums.append(RegulatoryFramework(fw_str))
        except ValueError:
            continue
    
    if not framework_enums:
        raise ValueError("Aucun framework valide spécifié")
    
    # Valider
    reports = compliance_manager.validate_calculation(result, triangle_data, framework_enums, **context)
    
    # Créer le résumé
    summary = compliance_manager.get_compliance_summary(reports)
    
    # Enregistrer dans l'audit trail si configuré
    if config.enable_audit_log:
        calculation_id = audit_trail_manager.record_calculation(
            result, triangle_data, reports, context.get("user_id")
        )
        summary["audit_trail_id"] = calculation_id
    
    return {
        "compliance_summary": summary,
        "detailed_reports": {fw.value: report.__dict__ for fw, report in reports.items()},
        "supported_frameworks": compliance_manager.get_supported_frameworks()
    }

def get_compliance_requirements(framework: str) -> Dict[str, Any]:
    """Obtenir les exigences d'un framework réglementaire"""
    
    try:
        framework_enum = RegulatoryFramework(framework)
        
        if framework_enum not in compliance_manager.validators:
            raise ValueError(f"Framework '{framework}' non supporté")
        
        validator = compliance_manager.validators[framework_enum]
        
        return {
            "framework": framework,
            "rules": [
                {
                    "id": rule.id,
                    "name": rule.name,
                    "description": rule.description,
                    "severity": rule.severity.value,
                    "category": rule.category,
                    "reference": rule.reference,
                    "active": rule.active
                } 
                for rule in validator.rules
            ],
            "categories": list(set(rule.category for rule in validator.rules)),
            "total_rules": len(validator.rules)
        }
        
    except ValueError as e:
        raise ValueError(str(e))