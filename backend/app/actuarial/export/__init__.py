# backend/app/actuarial/export/__init__.py

"""
Système d'export et de visualisation pour les résultats actuariels

Ce module fournit :
- Export en multiple formats (JSON, CSV, Excel, PDF)
- Génération de graphiques et visualisations
- Templates de rapports actuariels
- Comparaison visuelle des méthodes
- Export pour réglementations (Solvabilité II, etc.)
"""

import json
import csv
import io
from typing import List, Dict, Any, Optional, Union, BinaryIO
from datetime import datetime
from dataclasses import dataclass, field
from abc import ABC, abstractmethod
import base64
import tempfile
from pathlib import Path

from ..base.method_interface import CalculationResult, TriangleData, compare_calculation_results
from ..config import get_logger, config

# ============================================================================
# Interfaces et classes de base pour l'export
# ============================================================================

class ExportFormat:
    """Formats d'export disponibles"""
    JSON = "json"
    CSV = "csv" 
    EXCEL = "excel"
    PDF = "pdf"
    HTML = "html"
    MARKDOWN = "markdown"

@dataclass
class ExportOptions:
    """Options d'export"""
    format: str = ExportFormat.JSON
    include_triangle: bool = True
    include_factors: bool = True
    include_diagnostics: bool = True
    include_warnings: bool = True
    include_metadata: bool = True
    precision: int = 2
    currency_symbol: str = "€"
    language: str = "fr"
    template: Optional[str] = None
    custom_fields: Dict[str, Any] = field(default_factory=dict)

class BaseExporter(ABC):
    """Classe de base pour tous les exporters"""
    
    def __init__(self, options: ExportOptions):
        self.options = options
        self.logger = get_logger(f"export.{self.__class__.__name__}")
    
    @abstractmethod
    def export_single_result(self, result: CalculationResult, triangle_data: TriangleData) -> Union[str, bytes]:
        """Exporter un seul résultat"""
        pass
    
    @abstractmethod
    def export_comparison(self, results: List[CalculationResult], 
                         triangle_data: TriangleData, comparison: Dict[str, Any]) -> Union[str, bytes]:
        """Exporter une comparaison de résultats"""
        pass
    
    @abstractmethod
    def get_content_type(self) -> str:
        """Obtenir le content-type MIME"""
        pass
    
    @abstractmethod
    def get_file_extension(self) -> str:
        """Obtenir l'extension de fichier"""
        pass

# ============================================================================
# Exporters spécifiques
# ============================================================================

class JSONExporter(BaseExporter):
    """Export au format JSON"""
    
    def export_single_result(self, result: CalculationResult, triangle_data: TriangleData) -> str:
        """Exporter un résultat en JSON"""
        
        export_data = {
            "export_info": {
                "format": "json",
                "timestamp": datetime.utcnow().isoformat(),
                "generated_by": "Actuarial Methods System",
                "version": "1.0"
            },
            "triangle_data": {
                "data": triangle_data.data,
                "currency": triangle_data.currency,
                "business_line": triangle_data.business_line,
                "accident_years": triangle_data.accident_years,
                "development_periods": triangle_data.development_periods,
                "metadata": triangle_data.metadata
            } if self.options.include_triangle else None,
            "calculation_result": self._format_result_for_json(result)
        }
        
        # Ajouter les champs personnalisés
        export_data.update(self.options.custom_fields)
        
        return json.dumps(export_data, indent=2, ensure_ascii=False)
    
    def export_comparison(self, results: List[CalculationResult], 
                         triangle_data: TriangleData, comparison: Dict[str, Any]) -> str:
        """Exporter une comparaison en JSON"""
        
        export_data = {
            "export_info": {
                "format": "json_comparison",
                "timestamp": datetime.utcnow().isoformat(),
                "methods_count": len(results)
            },
            "triangle_data": {
                "data": triangle_data.data,
                "currency": triangle_data.currency,
                "business_line": triangle_data.business_line
            } if self.options.include_triangle else None,
            "results": [self._format_result_for_json(result) for result in results],
            "comparison": comparison
        }
        
        return json.dumps(export_data, indent=2, ensure_ascii=False)
    
    def _format_result_for_json(self, result: CalculationResult) -> Dict[str, Any]:
        """Formater un résultat pour JSON"""
        formatted = result.to_dict()
        
        # Filtrer selon les options
        if not self.options.include_factors:
            formatted.pop("development_factors", None)
        
        if not self.options.include_diagnostics:
            formatted.pop("diagnostics", None)
        
        if not self.options.include_warnings:
            formatted.pop("warnings", None)
        
        if not self.options.include_metadata:
            formatted.pop("metadata", None)
        
        return formatted
    
    def get_content_type(self) -> str:
        return "application/json"
    
    def get_file_extension(self) -> str:
        return "json"

class CSVExporter(BaseExporter):
    """Export au format CSV"""
    
    def export_single_result(self, result: CalculationResult, triangle_data: TriangleData) -> str:
        """Exporter un résultat en CSV"""
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        # En-têtes générales
        writer.writerow(["# Résultat Actuariel - " + result.method_name])
        writer.writerow(["# Généré le:", datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")])
        writer.writerow([])
        
        # Résumé
        writer.writerow(["Métrique", "Valeur", "Unité"])
        writer.writerow(["Méthode", result.method_name, ""])
        writer.writerow(["Ultimate Total", f"{result.ultimate_total:,.{self.options.precision}f}", triangle_data.currency])
        writer.writerow(["Réserves", f"{result.reserves:,.{self.options.precision}f}", triangle_data.currency])
        writer.writerow(["Payé à ce jour", f"{result.paid_to_date:,.{self.options.precision}f}", triangle_data.currency])
        writer.writerow(["Temps de calcul", f"{result.calculation_time:.3f}", "secondes"])
        writer.writerow([])
        
        # Ultimates par année
        writer.writerow(["# Ultimates par Année d'Accident"])
        writer.writerow(["Année", "Ultimate", "Unité"])
        for i, ultimate in enumerate(result.ultimates_by_year):
            year = triangle_data.accident_years[i] if triangle_data.accident_years else f"AY-{i}"
            writer.writerow([year, f"{ultimate:,.{self.options.precision}f}", triangle_data.currency])
        writer.writerow([])
        
        # Facteurs de développement si inclus
        if self.options.include_factors and result.development_factors:
            writer.writerow(["# Facteurs de Développement"])
            writer.writerow(["Période", "Facteur"])
            for i, factor in enumerate(result.development_factors):
                writer.writerow([f"{i}-{i+1}", f"{factor:.4f}"])
            writer.writerow([])
        
        # Triangle complété si inclus
        if self.options.include_triangle and result.completed_triangle:
            writer.writerow(["# Triangle Complété"])
            
            # En-têtes des périodes
            max_periods = max(len(row) for row in result.completed_triangle)
            headers = ["Année"] + [f"Période {i}" for i in range(max_periods)]
            writer.writerow(headers)
            
            for i, row in enumerate(result.completed_triangle):
                year = triangle_data.accident_years[i] if triangle_data.accident_years else f"AY-{i}"
                csv_row = [year] + [f"{val:,.{self.options.precision}f}" if j < len(row) else "" 
                                  for j, val in enumerate(row)]
                # Compléter avec des cellules vides si nécessaire
                csv_row += [""] * (len(headers) - len(csv_row))
                writer.writerow(csv_row)
            writer.writerow([])
        
        # Diagnostics si inclus
        if self.options.include_diagnostics and result.diagnostics:
            writer.writerow(["# Diagnostics"])
            writer.writerow(["Métrique", "Valeur"])
            for key, value in result.diagnostics.items():
                writer.writerow([key, f"{value:.4f}" if isinstance(value, float) else str(value)])
            writer.writerow([])
        
        # Avertissements si inclus
        if self.options.include_warnings and result.warnings:
            writer.writerow(["# Avertissements"])
            writer.writerow(["Type", "Message"])
            for warning in result.warnings:
                writer.writerow(["Warning", warning])
        
        return output.getvalue()
    
    def export_comparison(self, results: List[CalculationResult], 
                         triangle_data: TriangleData, comparison: Dict[str, Any]) -> str:
        """Exporter une comparaison en CSV"""
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        # En-têtes
        writer.writerow(["# Comparaison de Méthodes Actuarielles"])
        writer.writerow(["# Généré le:", datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")])
        writer.writerow(["# Nombre de méthodes:", len(results)])
        writer.writerow([])
        
        # Résumé des ultimates
        writer.writerow(["# Comparaison des Ultimates"])
        writer.writerow(["Méthode", "Ultimate Total", "Réserves", "Temps (s)", "Avertissements"])
        
        for result in results:
            writer.writerow([
                result.method_name,
                f"{result.ultimate_total:,.{self.options.precision}f}",
                f"{result.reserves:,.{self.options.precision}f}",
                f"{result.calculation_time:.3f}",
                len(result.warnings)
            ])
        writer.writerow([])
        
        # Statistiques de comparaison
        if comparison and "ultimate_total" in comparison:
            ult_stats = comparison["ultimate_total"]
            writer.writerow(["# Statistiques de Comparaison"])
            writer.writerow(["Métrique", "Valeur"])
            writer.writerow(["Ultimate Minimum", f"{ult_stats['min']:,.{self.options.precision}f}"])
            writer.writerow(["Ultimate Maximum", f"{ult_stats['max']:,.{self.options.precision}f}"])
            writer.writerow(["Ultimate Moyen", f"{ult_stats['mean']:,.{self.options.precision}f}"])
            writer.writerow(["Écart (Max-Min)", f"{ult_stats['range']:,.{self.options.precision}f}"])
            writer.writerow(["Coefficient de Variation", f"{ult_stats['cv']:.2%}"])
        
        return output.getvalue()
    
    def get_content_type(self) -> str:
        return "text/csv"
    
    def get_file_extension(self) -> str:
        return "csv"

class HTMLExporter(BaseExporter):
    """Export au format HTML avec styling"""
    
    def export_single_result(self, result: CalculationResult, triangle_data: TriangleData) -> str:
        """Exporter un résultat en HTML"""
        
        html = f"""
<!DOCTYPE html>
<html lang="{self.options.language}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Résultat Actuariel - {result.method_name}</title>
    <style>
        {self._get_html_styles()}
    </style>
</head>
<body>
    <div class="container">
        <header class="header">
            <h1>🧮 Résultat Actuariel</h1>
            <div class="method-badge {result.method_id.replace('_', '-')}">{result.method_name}</div>
        </header>
        
        <div class="summary-section">
            <h2>📊 Résumé</h2>
            <div class="metrics-grid">
                <div class="metric-card">
                    <div class="metric-label">Ultimate Total</div>
                    <div class="metric-value">{result.ultimate_total:,.{self.options.precision}f} {self.options.currency_symbol}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Réserves</div>
                    <div class="metric-value">{result.reserves:,.{self.options.precision}f} {self.options.currency_symbol}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Payé à ce jour</div>
                    <div class="metric-value">{result.paid_to_date:,.{self.options.precision}f} {self.options.currency_symbol}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Temps de calcul</div>
                    <div class="metric-value">{result.calculation_time:.3f}s</div>
                </div>
            </div>
        </div>
        
        <div class="ultimates-section">
            <h2>🎯 Ultimates par Année d'Accident</h2>
            <table class="data-table">
                <thead>
                    <tr><th>Année d'Accident</th><th>Ultimate</th></tr>
                </thead>
                <tbody>
        """
        
        # Ultimates par année
        for i, ultimate in enumerate(result.ultimates_by_year):
            year = triangle_data.accident_years[i] if triangle_data.accident_years else f"AY-{i}"
            html += f"<tr><td>{year}</td><td>{ultimate:,.{self.options.precision}f} {self.options.currency_symbol}</td></tr>"
        
        html += """
                </tbody>
            </table>
        </div>
        """
        
        # Facteurs de développement
        if self.options.include_factors and result.development_factors:
            html += """
        <div class="factors-section">
            <h2>📈 Facteurs de Développement</h2>
            <table class="data-table">
                <thead>
                    <tr><th>Période</th><th>Facteur</th></tr>
                </thead>
                <tbody>
            """
            for i, factor in enumerate(result.development_factors):
                html += f"<tr><td>{i} → {i+1}</td><td>{factor:.4f}</td></tr>"
            html += "</tbody></table></div>"
        
        # Triangle complété
        if self.options.include_triangle and result.completed_triangle:
            html += self._generate_triangle_html(result.completed_triangle, triangle_data)
        
        # Diagnostics
        if self.options.include_diagnostics and result.diagnostics:
            html += self._generate_diagnostics_html(result.diagnostics)
        
        # Avertissements
        if self.options.include_warnings and result.warnings:
            html += self._generate_warnings_html(result.warnings)
        
        html += f"""
        <footer class="footer">
            <p>Généré le {datetime.utcnow().strftime("%Y-%m-%d à %H:%M:%S")} UTC</p>
            <p>Système de Méthodes Actuarielles v1.0</p>
        </footer>
    </div>
</body>
</html>
        """
        
        return html
    
    def export_comparison(self, results: List[CalculationResult], 
                         triangle_data: TriangleData, comparison: Dict[str, Any]) -> str:
        """Exporter une comparaison en HTML"""
        
        html = f"""
<!DOCTYPE html>
<html lang="{self.options.language}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Comparaison de Méthodes Actuarielles</title>
    <style>
        {self._get_html_styles()}
        .comparison-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }}
        .method-card {{ border: 2px solid #ddd; border-radius: 8px; padding: 15px; }}
        .chart-container {{ width: 100%; height: 400px; background: #f9f9f9; display: flex; align-items: center; justify-content: center; }}
    </style>
</head>
<body>
    <div class="container">
        <header class="header">
            <h1>🔄 Comparaison de Méthodes</h1>
            <div class="subtitle">{len(results)} méthodes comparées</div>
        </header>
        
        <div class="summary-section">
            <h2>📊 Résumé de la Comparaison</h2>
            <div class="comparison-grid">
        """
        
        # Cartes pour chaque méthode
        for result in results:
            html += f"""
                <div class="method-card">
                    <h3>{result.method_name}</h3>
                    <div class="metric-value">{result.ultimate_total:,.{self.options.precision}f} {self.options.currency_symbol}</div>
                    <div class="metric-label">Ultimate Total</div>
                    <div class="small-metrics">
                        <span>Réserves: {result.reserves:,.0f} {self.options.currency_symbol}</span><br>
                        <span>Temps: {result.calculation_time:.3f}s</span>
                        {f'<br><span style="color: orange;">⚠️ {len(result.warnings)} avertissements</span>' if result.warnings else ''}
                    </div>
                </div>
            """
        
        html += "</div></div>"
        
        # Statistiques de comparaison
        if comparison and "ultimate_total" in comparison:
            ult_stats = comparison["ultimate_total"]
            html += f"""
        <div class="stats-section">
            <h2>📈 Statistiques Comparatives</h2>
            <div class="metrics-grid">
                <div class="metric-card">
                    <div class="metric-label">Ultimate Minimum</div>
                    <div class="metric-value">{ult_stats['min']:,.{self.options.precision}f} {self.options.currency_symbol}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Ultimate Maximum</div>
                    <div class="metric-value">{ult_stats['max']:,.{self.options.precision}f} {self.options.currency_symbol}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Écart (Max-Min)</div>
                    <div class="metric-value">{ult_stats['range']:,.{self.options.precision}f} {self.options.currency_symbol}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Coefficient de Variation</div>
                    <div class="metric-value">{ult_stats['cv']:.2%}</div>
                </div>
            </div>
        </div>
            """
        
        html += """
        <footer class="footer">
            <p>Généré le """ + datetime.utcnow().strftime("%Y-%m-%d à %H:%M:%S") + """ UTC</p>
        </footer>
    </div>
</body>
</html>
        """
        
        return html
    
    def _get_html_styles(self) -> str:
        """Styles CSS pour HTML"""
        return """
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); overflow: hidden; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0 0 10px 0; font-size: 2.5em; }
        .method-badge { display: inline-block; padding: 8px 16px; background: rgba(255,255,255,0.2); border-radius: 20px; font-size: 0.9em; }
        .summary-section, .ultimates-section, .factors-section, .triangle-section, .diagnostics-section, .warnings-section, .stats-section { padding: 30px; border-bottom: 1px solid #eee; }
        .summary-section h2, .ultimates-section h2, .factors-section h2, .triangle-section h2, .diagnostics-section h2, .warnings-section h2, .stats-section h2 { color: #333; margin-bottom: 20px; }
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; }
        .metric-card { background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #667eea; }
        .metric-label { font-size: 0.9em; color: #666; margin-bottom: 5px; }
        .metric-value { font-size: 1.8em; font-weight: bold; color: #333; }
        .data-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        .data-table th { background: #f8f9fa; padding: 12px; text-align: left; border-bottom: 2px solid #ddd; }
        .data-table td { padding: 10px 12px; border-bottom: 1px solid #eee; }
        .data-table tr:hover { background: #f8f9fa; }
        .triangle-table { font-size: 0.85em; }
        .triangle-table td { text-align: right; }
        .warning-item { background: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin-bottom: 10px; border-radius: 4px; }
        .diagnostic-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
        .footer { padding: 20px; text-align: center; color: #666; background: #f8f9fa; font-size: 0.9em; }
        .small-metrics { font-size: 0.85em; color: #666; margin-top: 10px; }
        .subtitle { opacity: 0.8; }
        """
    
    def _generate_triangle_html(self, completed_triangle: List[List[float]], triangle_data: TriangleData) -> str:
        """Générer le HTML pour le triangle complété"""
        html = """
        <div class="triangle-section">
            <h2>🔺 Triangle Complété</h2>
            <table class="data-table triangle-table">
                <thead><tr><th>Année</th>
        """
        
        # En-têtes des périodes
        max_periods = max(len(row) for row in completed_triangle) if completed_triangle else 0
        for i in range(max_periods):
            html += f"<th>Période {i}</th>"
        html += "</tr></thead><tbody>"
        
        # Données du triangle
        for i, row in enumerate(completed_triangle):
            year = triangle_data.accident_years[i] if triangle_data.accident_years else f"AY-{i}"
            html += f"<tr><td><strong>{year}</strong></td>"
            
            for j in range(max_periods):
                if j < len(row):
                    html += f"<td>{row[j]:,.{self.options.precision}f}</td>"
                else:
                    html += "<td>-</td>"
            html += "</tr>"
        
        html += "</tbody></table></div>"
        return html
    
    def _generate_diagnostics_html(self, diagnostics: Dict[str, float]) -> str:
        """Générer le HTML pour les diagnostics"""
        html = """
        <div class="diagnostics-section">
            <h2>🔍 Diagnostics</h2>
        """
        
        for key, value in diagnostics.items():
            formatted_value = f"{value:.4f}" if isinstance(value, float) else str(value)
            html += f'<div class="diagnostic-item"><span>{key.replace("_", " ").title()}</span><span><strong>{formatted_value}</strong></span></div>'
        
        html += "</div>"
        return html
    
    def _generate_warnings_html(self, warnings: List[str]) -> str:
        """Générer le HTML pour les avertissements"""
        html = """
        <div class="warnings-section">
            <h2>⚠️ Avertissements</h2>
        """
        
        for warning in warnings:
            html += f'<div class="warning-item">⚠️ {warning}</div>'
        
        html += "</div>"
        return html
    
    def get_content_type(self) -> str:
        return "text/html"
    
    def get_file_extension(self) -> str:
        return "html"

class MarkdownExporter(BaseExporter):
    """Export au format Markdown"""
    
    def export_single_result(self, result: CalculationResult, triangle_data: TriangleData) -> str:
        """Exporter un résultat en Markdown"""
        
        md = f"""# 🧮 Résultat Actuariel - {result.method_name}

*Généré le {datetime.utcnow().strftime("%Y-%m-%d à %H:%M:%S")} UTC*

## 📊 Résumé

| Métrique | Valeur | Unité |
|----------|---------|-------|
| **Ultimate Total** | {result.ultimate_total:,.{self.options.precision}f} | {triangle_data.currency} |
| **Réserves** | {result.reserves:,.{self.options.precision}f} | {triangle_data.currency} |
| **Payé à ce jour** | {result.paid_to_date:,.{self.options.precision}f} | {triangle_data.currency} |
| **Temps de calcul** | {result.calculation_time:.3f} | secondes |

## 🎯 Ultimates par Année d'Accident

| Année d'Accident | Ultimate ({triangle_data.currency}) |
|-------------------|-------------------------------------|
"""
        
        # Ultimates par année
        for i, ultimate in enumerate(result.ultimates_by_year):
            year = triangle_data.accident_years[i] if triangle_data.accident_years else f"AY-{i}"
            md += f"| {year} | {ultimate:,.{self.options.precision}f} |\n"
        
        # Facteurs de développement
        if self.options.include_factors and result.development_factors:
            md += "\n## 📈 Facteurs de Développement\n\n"
            md += "| Période | Facteur |\n|---------|----------|\n"
            for i, factor in enumerate(result.development_factors):
                md += f"| {i} → {i+1} | {factor:.4f} |\n"
        
        # Diagnostics
        if self.options.include_diagnostics and result.diagnostics:
            md += "\n## 🔍 Diagnostics\n\n"
            md += "| Métrique | Valeur |\n|----------|--------|\n"
            for key, value in result.diagnostics.items():
                formatted_value = f"{value:.4f}" if isinstance(value, float) else str(value)
                md += f"| {key.replace('_', ' ').title()} | {formatted_value} |\n"
        
        # Avertissements
        if self.options.include_warnings and result.warnings:
            md += "\n## ⚠️ Avertissements\n\n"
            for warning in result.warnings:
                md += f"- ⚠️ {warning}\n"
        
        return md
    
    def export_comparison(self, results: List[CalculationResult], 
                         triangle_data: TriangleData, comparison: Dict[str, Any]) -> str:
        """Exporter une comparaison en Markdown"""
        
        md = f"""# 🔄 Comparaison de Méthodes Actuarielles

*{len(results)} méthodes comparées - Généré le {datetime.utcnow().strftime("%Y-%m-%d à %H:%M:%S")} UTC*

## 📊 Résumé des Résultats

| Méthode | Ultimate Total | Réserves | Temps (s) | Avertissements |
|---------|----------------|----------|-----------|----------------|
"""
        
        for result in results:
            md += f"| {result.method_name} | {result.ultimate_total:,.{self.options.precision}f} | {result.reserves:,.{self.options.precision}f} | {result.calculation_time:.3f} | {len(result.warnings)} |\n"
        
        # Statistiques de comparaison
        if comparison and "ultimate_total" in comparison:
            ult_stats = comparison["ultimate_total"]
            md += f"""
## 📈 Statistiques Comparatives

| Métrique | Valeur ({triangle_data.currency}) |
|----------|-----------------------------------|
| **Ultimate Minimum** | {ult_stats['min']:,.{self.options.precision}f} |
| **Ultimate Maximum** | {ult_stats['max']:,.{self.options.precision}f} |
| **Ultimate Moyen** | {ult_stats['mean']:,.{self.options.precision}f} |
| **Écart (Max-Min)** | {ult_stats['range']:,.{self.options.precision}f} |
| **Coefficient de Variation** | {ult_stats['cv']:.2%} |
"""
        
        return md
    
    def get_content_type(self) -> str:
        return "text/markdown"
    
    def get_file_extension(self) -> str:
        return "md"

# ============================================================================
# Factory et gestionnaire principal d'export
# ============================================================================

class ExportManager:
    """Gestionnaire principal pour tous les exports"""
    
    def __init__(self):
        self.exporters = {
            ExportFormat.JSON: JSONExporter,
            ExportFormat.CSV: CSVExporter,
            ExportFormat.HTML: HTMLExporter,
            ExportFormat.MARKDOWN: MarkdownExporter
        }
        self.logger = get_logger("export_manager")
    
    def export_result(self, result: CalculationResult, triangle_data: TriangleData, 
                     options: ExportOptions) -> Dict[str, Any]:
        """
        Exporter un résultat dans le format spécifié
        
        Returns:
            Dict avec content, content_type, filename, etc.
        """
        
        if options.format not in self.exporters:
            raise ValueError(f"Format d'export non supporté: {options.format}")
        
        self.logger.info(f"Export démarré", format=options.format, method=result.method_name)
        
        # Créer l'exporter
        exporter_class = self.exporters[options.format]
        exporter = exporter_class(options)
        
        # Export
        try:
            content = exporter.export_single_result(result, triangle_data)
            
            # Générer le nom de fichier
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"actuarial_result_{result.method_id}_{timestamp}.{exporter.get_file_extension()}"
            
            export_result = {
                "content": content,
                "content_type": exporter.get_content_type(),
                "filename": filename,
                "size": len(content) if isinstance(content, str) else len(content),
                "format": options.format,
                "timestamp": datetime.utcnow().isoformat()
            }
            
            self.logger.info(
                f"Export terminé", 
                format=options.format,
                size=export_result["size"],
                filename=filename
            )
            
            return export_result
            
        except Exception as e:
            self.logger.error(f"Erreur export", format=options.format, error=str(e))
            raise
    
    def export_comparison(self, results: List[CalculationResult], triangle_data: TriangleData,
                         comparison: Dict[str, Any], options: ExportOptions) -> Dict[str, Any]:
        """
        Exporter une comparaison de résultats
        """
        
        if options.format not in self.exporters:
            raise ValueError(f"Format d'export non supporté: {options.format}")
        
        self.logger.info(f"Export comparaison démarré", format=options.format, methods_count=len(results))
        
        # Créer l'exporter
        exporter_class = self.exporters[options.format]
        exporter = exporter_class(options)
        
        try:
            content = exporter.export_comparison(results, triangle_data, comparison)
            
            # Générer le nom de fichier
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            methods_str = "_".join(r.method_id for r in results[:3])  # Max 3 pour nom de fichier
            if len(results) > 3:
                methods_str += f"_and_{len(results)-3}_more"
            filename = f"actuarial_comparison_{methods_str}_{timestamp}.{exporter.get_file_extension()}"
            
            export_result = {
                "content": content,
                "content_type": exporter.get_content_type(),
                "filename": filename,
                "size": len(content) if isinstance(content, str) else len(content),
                "format": options.format,
                "methods_count": len(results),
                "timestamp": datetime.utcnow().isoformat()
            }
            
            self.logger.info(
                f"Export comparaison terminé", 
                format=options.format,
                methods_count=len(results),
                size=export_result["size"]
            )
            
            return export_result
            
        except Exception as e:
            self.logger.error(f"Erreur export comparaison", format=options.format, error=str(e))
            raise
    
    def get_supported_formats(self) -> List[str]:
        """Obtenir la liste des formats supportés"""
        return list(self.exporters.keys())
    
    def register_exporter(self, format_name: str, exporter_class):
        """Enregistrer un nouvel exporter personnalisé"""
        self.exporters[format_name] = exporter_class
        self.logger.info(f"Exporter personnalisé enregistré", format=format_name)

# Instance globale du gestionnaire d'export
export_manager = ExportManager()

# ============================================================================
# Fonctions utilitaires pour l'API
# ============================================================================

def export_calculation_result(result: CalculationResult, triangle_data: TriangleData, 
                             export_format: str = "json", **options) -> Dict[str, Any]:
    """
    Fonction utilitaire pour exporter un résultat de calcul
    
    Args:
        result: Résultat du calcul
        triangle_data: Données du triangle
        export_format: Format d'export
        **options: Options d'export additionnelles
        
    Returns:
        Dictionnaire avec le contenu exporté
    """
    export_options = ExportOptions(format=export_format, **options)
    return export_manager.export_result(result, triangle_data, export_options)

def export_method_comparison(results: List[CalculationResult], triangle_data: TriangleData,
                            export_format: str = "json", **options) -> Dict[str, Any]:
    """
    Fonction utilitaire pour exporter une comparaison de méthodes
    """
    comparison = compare_calculation_results(results)
    export_options = ExportOptions(format=export_format, **options)
    return export_manager.export_comparison(results, triangle_data, comparison, export_options)

def create_export_options(format: str = "json", **kwargs) -> ExportOptions:
    """Créer des options d'export avec des valeurs par défaut intelligentes"""
    return ExportOptions(
        format=format,
        precision=kwargs.get("precision", 2),
        currency_symbol=kwargs.get("currency_symbol", "€"),
        language=kwargs.get("language", "fr"),
        include_triangle=kwargs.get("include_triangle", True),
        include_factors=kwargs.get("include_factors", True),
        include_diagnostics=kwargs.get("include_diagnostics", True),
        include_warnings=kwargs.get("include_warnings", True),
        include_metadata=kwargs.get("include_metadata", False),  # False par défaut pour alléger
        **{k: v for k, v in kwargs.items() if k not in [
            "precision", "currency_symbol", "language", "include_triangle",
            "include_factors", "include_diagnostics", "include_warnings", "include_metadata"
        ]}
    )