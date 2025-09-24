# backend/app/routers/documentation_service.py
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse, JSONResponse
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel
from enum import Enum
import json
import uuid
import io
import base64
import logging

# Imports pour génération de documents
try:
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4, letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch, cm
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False
    print("ReportLab non disponible - simulation des PDFs")

from ..main import verify_token, find_user_by_id, log_audit

router = APIRouter(prefix="/api/v1/documentation", tags=["Documentation Réglementaire"])
logger = logging.getLogger("documentation")

# ===== MODÈLES PYDANTIC =====

class DocumentType(str, Enum):
    IFRS17_TECHNICAL_NOTE = "ifrs17_technical_note"
    SOLVENCY2_REPORT = "solvency2_report"
    ACPR_SUBMISSION = "acpr_submission"
    EIOPA_QRT = "eiopa_qrt"
    METHODOLOGY_DOCUMENTATION = "methodology_documentation"
    AUDIT_TRAIL = "audit_trail"
    EXECUTIVE_SUMMARY = "executive_summary"
    VALIDATION_REPORT = "validation_report"

class OutputFormat(str, Enum):
    PDF = "pdf"
    DOCX = "docx"
    XLSX = "xlsx"
    HTML = "html"
    JSON = "json"

class DocumentRequest(BaseModel):
    documentType: DocumentType
    calculationId: str
    triangleId: str
    outputFormat: OutputFormat = OutputFormat.PDF
    includeCharts: bool = True
    includeDetailedTables: bool = True
    language: str = "fr"  # fr, en
    customParams: Optional[Dict[str, Any]] = {}

class TemplateCustomization(BaseModel):
    companyName: str = "Compagnie d'Assurance"
    companyLogo: Optional[str] = None
    reportDate: Optional[str] = None
    signatoryName: str = "Responsable Actuariat"
    signatoryTitle: str = "Actuaire en Chef"
    confidentialityLevel: str = "Confidentiel"
    
# ===== BASE DE DONNÉES SIMULÉE =====

DOCUMENT_TEMPLATES = {
    DocumentType.IFRS17_TECHNICAL_NOTE: {
        "title": "Note Technique IFRS 17",
        "sections": [
            "executive_summary",
            "calculation_methodology", 
            "data_sources",
            "assumptions",
            "results_analysis",
            "sensitivity_analysis",
            "validation_controls",
            "conclusion"
        ],
        "required_approvals": ["CHEF_ACTUAIRE", "DIRECTION"],
        "regulatory_mapping": {
            "IFRS17_CSM": "Contract Service Margin",
            "IFRS17_RA": "Risk Adjustment",
            "IFRS17_LIC": "Liability for Incurred Claims"
        }
    },
    DocumentType.SOLVENCY2_REPORT: {
        "title": "Rapport Solvabilité II",
        "sections": [
            "executive_summary",
            "technical_provisions",
            "scr_calculation",
            "own_funds",
            "solvency_ratio",
            "risk_profile",
            "appendices"
        ],
        "required_approvals": ["DIRECTION", "CONSEIL"],
        "regulatory_mapping": {
            "TP_TOTAL": "Provisions Techniques Totales",
            "SCR": "Solvency Capital Requirement", 
            "MCR": "Minimum Capital Requirement"
        }
    },
    DocumentType.METHODOLOGY_DOCUMENTATION: {
        "title": "Documentation Méthodologique",
        "sections": [
            "introduction",
            "data_preparation",
            "methods_selection",
            "parameters_calibration",
            "validation_procedures",
            "limitations",
            "references"
        ],
        "required_approvals": ["CHEF_ACTUAIRE"],
        "regulatory_mapping": {}
    }
}

GENERATED_DOCUMENTS = []

# ===== UTILITAIRES DE GÉNÉRATION =====

def fetch_calculation_data(calculation_id: str) -> Dict[str, Any]:
    """Récupérer les données de calcul depuis vos APIs existantes"""
    # Simulation - remplacez par vos vraies données
    return {
        "id": calculation_id,
        "triangle_id": f"triangle_{calculation_id}",
        "triangle_name": f"Triangle RC Auto {datetime.now().year}",
        "status": "completed",
        "methods": [
            {
                "id": "chain_ladder",
                "name": "Chain Ladder",
                "ultimate": 12500000,
                "reserves": 3200000,
                "diagnostics": {"r2": 0.94, "mape": 0.08, "rmse": 0.15},
                "development_factors": [1.45, 1.22, 1.08, 1.03, 1.01]
            },
            {
                "id": "bornhuetter_ferguson", 
                "name": "Bornhuetter-Ferguson",
                "ultimate": 12800000,
                "reserves": 3350000,
                "diagnostics": {"r2": 0.91, "mape": 0.12, "rmse": 0.18},
                "development_factors": [1.42, 1.20, 1.07, 1.02, 1.01]
            }
        ],
        "summary": {
            "best_estimate": 12650000,
            "range": {"min": 11800000, "max": 13500000},
            "confidence": 92.5,
            "convergence": True
        },
        "metadata": {
            "currency": "EUR",
            "business_line": "RC Automobile",
            "data_points": 120,
            "last_updated": datetime.now().isoformat()
        }
    }

def fetch_regulatory_context() -> Dict[str, Any]:
    """Récupérer le contexte réglementaire"""
    return {
        "ifrs17": {
            "effective_date": "2023-01-01",
            "discount_curve": "EIOPA Risk-Free Rate",
            "risk_adjustment": "75% confidence level",
            "csm_approach": "Variable Fee Approach"
        },
        "solvency2": {
            "standard_formula": True,
            "volatility_adjustment": False,
            "matching_adjustment": False,
            "transitional_measures": False
        },
        "company_profile": {
            "license_type": "Composite Insurance",
            "main_activities": ["Motor", "Property", "Liability"],
            "geographical_scope": "France",
            "regulatory_authority": "ACPR"
        }
    }

def generate_ifrs17_technical_note(calculation_data: Dict, customization: TemplateCustomization) -> Dict[str, Any]:
    """Générer une note technique IFRS 17"""
    
    # Calculs IFRS 17 basés sur vos données
    best_estimate = calculation_data["summary"]["best_estimate"]
    risk_adjustment = best_estimate * 0.08  # 8% de RA typique
    csm = 0  # Pour sinistres, CSM = 0
    
    # Analyse des méthodes
    methods_analysis = []
    for method in calculation_data["methods"]:
        methods_analysis.append({
            "method": method["name"],
            "ultimate": method["ultimate"],
            "reserves": method["reserves"],
            "quality_score": method["diagnostics"]["r2"],
            "reliability": "Élevée" if method["diagnostics"]["r2"] > 0.9 else "Modérée",
            "comments": f"R² de {method['diagnostics']['r2']:.2f}, MAPE de {method['diagnostics']['mape']:.2f}"
        })
    
    # Structure du document
    document_content = {
        "header": {
            "title": "Note Technique IFRS 17",
            "subtitle": f"Provisionnement {calculation_data['metadata']['business_line']}",
            "company": customization.companyName,
            "date": customization.reportDate or datetime.now().strftime("%d/%m/%Y"),
            "confidentiality": customization.confidentialityLevel,
            "version": "1.0"
        },
        "executive_summary": {
            "key_figures": {
                "best_estimate": best_estimate,
                "risk_adjustment": risk_adjustment,
                "liability_total": best_estimate + risk_adjustment,
                "confidence_level": calculation_data["summary"]["confidence"]
            },
            "main_conclusions": [
                f"Les provisions techniques s'élèvent à {best_estimate/1e6:.1f}M€",
                f"L'ajustement pour risque représente {risk_adjustment/1e6:.1f}M€ (niveau de confiance 75%)",
                f"La convergence des méthodes est {'excellente' if calculation_data['summary']['convergence'] else 'à améliorer'}",
                f"Les contrôles de qualité valident la fiabilité des estimations"
            ]
        },
        "methodology": {
            "data_source": {
                "description": f"Triangle de développement {calculation_data['metadata']['business_line']}",
                "points_count": calculation_data["metadata"]["data_points"],
                "currency": calculation_data["metadata"]["currency"],
                "last_update": calculation_data["metadata"]["last_updated"]
            },
            "methods_used": methods_analysis,
            "selection_criteria": [
                "Qualité de l'ajustement (R² > 0.85)",
                "Cohérence avec données historiques",
                "Stabilité des facteurs de développement",
                "Robustesse face aux outliers"
            ]
        },
        "ifrs17_components": {
            "liability_incurred_claims": {
                "description": "Provision pour sinistres survenus",
                "amount": best_estimate,
                "methodology": "Méthodes actuarielles standards",
                "uncertainty": calculation_data["summary"]["range"]
            },
            "risk_adjustment": {
                "description": "Ajustement pour risque non financier",
                "amount": risk_adjustment,
                "confidence_level": "75%",
                "methodology": "Méthode du percentile"
            },
            "contractual_service_margin": {
                "description": "Marge de service contractuel",
                "amount": csm,
                "note": "Nulle pour les sinistres déjà survenus"
            }
        },
        "validation_controls": {
            "statistical_tests": [
                {"test": "Test de normalité des résidus", "result": "Validé", "p_value": 0.12},
                {"test": "Test de autocorrélation", "result": "Validé", "p_value": 0.08},
                {"test": "Test de stabilité temporelle", "result": "Validé", "coefficient": 0.94}
            ],
            "benchmark_analysis": {
                "market_comparison": "Conforme aux practices du marché",
                "prior_year_variation": "+2.3%",
                "explanation": "Évolution cohérente avec l'inflation des coûts"
            }
        },
        "sensitivity_analysis": [
            {
                "parameter": "Facteurs de développement +10%",
                "impact_amount": best_estimate * 0.10,
                "impact_percent": 10.0
            },
            {
                "parameter": "Inflation +1%",
                "impact_amount": best_estimate * 0.05,
                "impact_percent": 5.0
            },
            {
                "parameter": "Taux d'actualisation +50bp",
                "impact_amount": -best_estimate * 0.02,
                "impact_percent": -2.0
            }
        ],
        "conclusion": {
            "opinion": "Les provisions techniques ont été calculées conformément aux normes IFRS 17",
            "limitations": [
                "Incertitude inhérente aux projections actuarielles",
                "Sensibilité aux changements d'environnement économique",
                "Dépendance à la qualité des données historiques"
            ],
            "recommendations": [
                "Surveillance continue des patterns de développement",
                "Mise à jour trimestrielle des hypothèses",
                "Renforcement des contrôles qualité"
            ]
        },
        "appendices": {
            "regulatory_framework": fetch_regulatory_context(),
            "detailed_calculations": calculation_data,
            "audit_trail": {
                "calculated_by": customization.signatoryName,
                "validated_by": "Service Contrôle",
                "approved_by": "Direction Actuariat",
                "timestamp": datetime.now().isoformat()
            }
        }
    }
    
    return document_content

def generate_solvency2_report(calculation_data: Dict, customization: TemplateCustomization) -> Dict[str, Any]:
    """Générer un rapport Solvabilité II"""
    
    # Calculs S2 basés sur vos données
    technical_provisions = calculation_data["summary"]["best_estimate"]
    best_estimate = technical_provisions * 0.92  # BE = TP - margin
    risk_margin = technical_provisions * 0.08
    
    # SCR simplifié (formule standard)
    scr_components = {
        "scr_market": technical_provisions * 0.15,
        "scr_credit": technical_provisions * 0.05,
        "scr_underwriting": technical_provisions * 0.25,
        "scr_operational": technical_provisions * 0.03
    }
    scr_total = sum(scr_components.values()) * 0.8  # Effet diversification
    
    # Fonds propres (simulation)
    own_funds = scr_total * 1.8  # Ratio de solvabilité de 180%
    
    document_content = {
        "header": {
            "title": "Rapport Solvabilité II",
            "subtitle": "Calcul des Provisions Techniques et du SCR",
            "company": customization.companyName,
            "date": customization.reportDate or datetime.now().strftime("%d/%m/%Y"),
            "period": f"T4 {datetime.now().year}",
            "version": "1.0"
        },
        "executive_summary": {
            "solvency_ratio": (own_funds / scr_total) * 100,
            "key_figures": {
                "technical_provisions": technical_provisions,
                "best_estimate": best_estimate,
                "risk_margin": risk_margin,
                "scr": scr_total,
                "own_funds": own_funds
            },
            "conclusions": [
                f"Ratio de solvabilité: {(own_funds / scr_total * 100):.1f}%",
                f"Provisions techniques: {technical_provisions/1e6:.1f}M€",
                f"Capital de solvabilité requis: {scr_total/1e6:.1f}M€",
                "Position de solvabilité solide et conforme"
            ]
        },
        "technical_provisions": {
            "best_estimate": {
                "description": "Meilleure estimation des passifs",
                "amount": best_estimate,
                "methodology": "Méthodes actuarielles standards",
                "by_line_of_business": {
                    calculation_data["metadata"]["business_line"]: best_estimate
                }
            },
            "risk_margin": {
                "description": "Marge de risque",
                "amount": risk_margin,
                "cost_of_capital": "6%",
                "methodology": "Méthode simplifiée durée modifiée"
            },
            "total": technical_provisions
        },
        "scr_calculation": {
            "standard_formula": True,
            "components": scr_components,
            "diversification_effect": scr_total - sum(scr_components.values()),
            "total_scr": scr_total,
            "details": {
                "market_risk": {
                    "amount": scr_components["scr_market"],
                    "main_drivers": ["Interest rate risk", "Equity risk", "Currency risk"]
                },
                "credit_risk": {
                    "amount": scr_components["scr_credit"],
                    "main_drivers": ["Counterparty default", "Spread risk"]
                },
                "underwriting_risk": {
                    "amount": scr_components["scr_underwriting"],
                    "main_drivers": ["Premium risk", "Reserve risk", "Catastrophe risk"]
                },
                "operational_risk": {
                    "amount": scr_components["scr_operational"],
                    "methodology": "Formule standard"
                }
            }
        },
        "own_funds": {
            "tier1_unrestricted": own_funds * 0.8,
            "tier1_restricted": own_funds * 0.15,
            "tier2": own_funds * 0.05,
            "total": own_funds,
            "eligible_scr": own_funds,
            "eligible_mcr": own_funds * 0.9
        },
        "validation": {
            "internal_controls": [
                "Validation par service indépendant",
                "Rapprochement avec données comptables",
                "Cohérence avec exercice précédent"
            ],
            "external_benchmarks": "Conforme aux moyennes sectorielles",
            "regulatory_compliance": "Conforme Solvabilité II et directives EIOPA"
        },
        "conclusion": {
            "solvency_position": f"Position de solvabilité robuste ({(own_funds / scr_total * 100):.1f}%)",
            "capital_adequacy": "Fonds propres largement suffisants",
            "risk_profile": "Profil de risque maîtrisé",
            "outlook": "Perspectives stables"
        }
    }
    
    return document_content

def generate_pdf_document(content: Dict[str, Any], doc_type: DocumentType) -> bytes:
    """Générer un document PDF à partir du contenu"""
    if not REPORTLAB_AVAILABLE:
        # Simulation sans ReportLab
        return f"PDF simulé pour {doc_type}: {json.dumps(content, indent=2, ensure_ascii=False)}".encode('utf-8')
    
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=2*cm, rightMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)
    
    # Styles
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('CustomTitle', parent=styles['Title'], fontSize=16, alignment=TA_CENTER, spaceAfter=30)
    heading_style = ParagraphStyle('CustomHeading', parent=styles['Heading1'], fontSize=14, spaceAfter=12)
    normal_style = styles['Normal']
    
    story = []
    
    # En-tête du document
    header = content.get("header", {})
    story.append(Paragraph(header.get("title", "Document"), title_style))
    story.append(Paragraph(header.get("subtitle", ""), styles['Heading2']))
    story.append(Spacer(1, 20))
    
    # Informations du document
    info_data = [
        ["Société:", header.get("company", "")],
        ["Date:", header.get("date", "")],
        ["Version:", header.get("version", "")],
        ["Confidentialité:", header.get("confidentiality", "")]
    ]
    info_table = Table(info_data, colWidths=[3*cm, 8*cm])
    info_table.setStyle(TableStyle([
        ('FONT', (0,0), (-1,-1), 'Helvetica', 10),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.black)
    ]))
    story.append(info_table)
    story.append(Spacer(1, 30))
    
    # Résumé exécutif
    if "executive_summary" in content:
        story.append(Paragraph("Résumé Exécutif", heading_style))
        
        exec_summary = content["executive_summary"]
        
        # Chiffres clés
        if "key_figures" in exec_summary:
            story.append(Paragraph("Chiffres Clés", styles['Heading2']))
            figures_data = []
            for key, value in exec_summary["key_figures"].items():
                if isinstance(value, (int, float)):
                    formatted_value = f"{value:,.0f} €" if value > 1000 else f"{value:.2f}"
                else:
                    formatted_value = str(value)
                figures_data.append([key.replace("_", " ").title(), formatted_value])
            
            figures_table = Table(figures_data, colWidths=[8*cm, 4*cm])
            figures_table.setStyle(TableStyle([
                ('FONT', (0,0), (-1,-1), 'Helvetica', 10),
                ('ALIGN', (1,0), (1,-1), 'RIGHT'),
                ('GRID', (0,0), (-1,-1), 0.5, colors.black),
                ('BACKGROUND', (0,0), (-1,0), colors.lightgrey)
            ]))
            story.append(figures_table)
            story.append(Spacer(1, 20))
        
        # Conclusions principales
        if "main_conclusions" in exec_summary:
            story.append(Paragraph("Conclusions Principales", styles['Heading2']))
            for conclusion in exec_summary["main_conclusions"]:
                story.append(Paragraph(f"• {conclusion}", normal_style))
            story.append(Spacer(1, 20))
    
    # Méthodologie
    if "methodology" in content:
        story.append(PageBreak())
        story.append(Paragraph("Méthodologie", heading_style))
        
        methodology = content["methodology"]
        
        # Source des données
        if "data_source" in methodology:
            story.append(Paragraph("Source des Données", styles['Heading2']))
            data_source = methodology["data_source"]
            story.append(Paragraph(f"Description: {data_source.get('description', '')}", normal_style))
            story.append(Paragraph(f"Nombre de points: {data_source.get('points_count', '')}", normal_style))
            story.append(Paragraph(f"Devise: {data_source.get('currency', '')}", normal_style))
            story.append(Spacer(1, 15))
        
        # Méthodes utilisées
        if "methods_used" in methodology:
            story.append(Paragraph("Méthodes Utilisées", styles['Heading2']))
            methods_data = [["Méthode", "Ultimate", "Réserves", "Qualité", "Commentaires"]]
            for method in methodology["methods_used"]:
                methods_data.append([
                    method["method"],
                    f"{method['ultimate']:,.0f} €",
                    f"{method['reserves']:,.0f} €",
                    method["reliability"],
                    method["comments"]
                ])
            
            methods_table = Table(methods_data, colWidths=[3*cm, 2.5*cm, 2.5*cm, 2*cm, 5*cm])
            methods_table.setStyle(TableStyle([
                ('FONT', (0,0), (-1,-1), 'Helvetica', 9),
                ('ALIGN', (1,0), (2,-1), 'RIGHT'),
                ('GRID', (0,0), (-1,-1), 0.5, colors.black),
                ('BACKGROUND', (0,0), (-1,0), colors.lightgrey)
            ]))
            story.append(methods_table)
    
    # Construire le PDF
    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()

# ===== ENDPOINTS =====

@router.post("/generate")
async def generate_document(
    request: DocumentRequest,
    customization: TemplateCustomization = TemplateCustomization(),
    current_user: dict = Depends(verify_token)
):
    """Générer un document réglementaire"""
    
    # Vérifier les permissions
    user = find_user_by_id(current_user["user_id"])
    required_roles = ["ACTUAIRE_SENIOR", "CHEF_ACTUAIRE", "DIRECTION", "ADMIN"]
    if not user or user["role"] not in required_roles:
        raise HTTPException(status_code=403, detail="Permissions insuffisantes pour générer des documents")
    
    try:
        # Récupérer les données de calcul
        calculation_data = fetch_calculation_data(request.calculationId)
        
        # Générer le contenu selon le type
        if request.documentType == DocumentType.IFRS17_TECHNICAL_NOTE:
            content = generate_ifrs17_technical_note(calculation_data, customization)
        elif request.documentType == DocumentType.SOLVENCY2_REPORT:
            content = generate_solvency2_report(calculation_data, customization)
        elif request.documentType == DocumentType.METHODOLOGY_DOCUMENTATION:
            content = generate_methodology_documentation(calculation_data, customization)
        else:
            raise HTTPException(status_code=400, detail=f"Type de document non supporté: {request.documentType}")
        
        # Générer le document dans le format demandé
        document_id = str(uuid.uuid4())
        
        if request.outputFormat == OutputFormat.PDF:
            document_bytes = generate_pdf_document(content, request.documentType)
            media_type = "application/pdf"
            file_extension = "pdf"
        elif request.outputFormat == OutputFormat.JSON:
            document_bytes = json.dumps(content, indent=2, ensure_ascii=False).encode('utf-8')
            media_type = "application/json"
            file_extension = "json"
        else:
            raise HTTPException(status_code=400, detail=f"Format non supporté: {request.outputFormat}")
        
        # Enregistrer le document généré
        document_record = {
            "id": document_id,
            "type": request.documentType,
            "format": request.outputFormat,
            "calculationId": request.calculationId,
            "triangleId": request.triangleId,
            "generatedBy": current_user["user_id"],
            "generatedAt": datetime.utcnow().isoformat(),
            "customization": customization.dict(),
            "size": len(document_bytes),
            "filename": f"{request.documentType}_{request.calculationId}.{file_extension}"
        }
        
        GENERATED_DOCUMENTS.append(document_record)
        
        # Log d'audit
        log_audit(
            current_user["user_id"],
            "DOCUMENT_GENERATED",
            f"Génération {request.documentType} pour calcul {request.calculationId}",
            ""
        )
        
        # Retourner le document
        filename = document_record["filename"]
        
        return StreamingResponse(
            io.BytesIO(document_bytes),
            media_type=media_type,
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Content-Length": str(len(document_bytes))
            }
        )
        
    except Exception as e:
        logger.error(f"Erreur génération document: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de la génération: {str(e)}")

@router.get("/templates")
async def get_available_templates(current_user: dict = Depends(verify_token)):
    """Récupérer les templates disponibles"""
    
    return {
        "success": True,
        "templates": [
            {
                "id": doc_type,
                "title": template["title"],
                "sections": template["sections"],
                "requiredApprovals": template["required_approvals"],
                "description": f"Template pour {template['title']}"
            }
            for doc_type, template in DOCUMENT_TEMPLATES.items()
        ]
    }

@router.get("/history")
async def get_document_history(
    limit: int = 50,
    offset: int = 0,
    current_user: dict = Depends(verify_token)
):
    """Historique des documents générés"""
    
    user_documents = [
        {
            **doc,
            "generatedByName": find_user_by_id(doc["generatedBy"])["first_name"] if find_user_by_id(doc["generatedBy"]) else "Inconnu"
        }
        for doc in GENERATED_DOCUMENTS
    ]
    
    # Pagination
    start = offset
    end = offset + limit
    documents = user_documents[start:end] if start < len(user_documents) else []
    
    return {
        "success": True,
        "documents": sorted(documents, key=lambda x: x["generatedAt"], reverse=True),
        "total": len(user_documents),
        "pagination": {
            "limit": limit,
            "offset": offset,
            "hasMore": end < len(user_documents)
        }
    }

@router.post("/validate-compliance/{document_id}")
async def validate_compliance(
    document_id: str,
    current_user: dict = Depends(verify_token)
):
    """Valider la conformité réglementaire d'un document"""
    
    user = find_user_by_id(current_user["user_id"])
    if not user or user["role"] not in ["CHEF_ACTUAIRE", "DIRECTION", "ADMIN"]:
        raise HTTPException(status_code=403, detail="Permissions insuffisantes")
    
    document = next((d for d in GENERATED_DOCUMENTS if d["id"] == document_id), None)
    if not document:
        raise HTTPException(status_code=404, detail="Document introuvable")
    
    # Contrôles de conformité
    compliance_checks = {
        "ifrs17_compliance": True,
        "solvency2_compliance": True,
        "acpr_requirements": True,
        "eiopa_guidelines": True,
        "data_quality": True,
        "methodology_soundness": True,
        "documentation_completeness": True
    }
    
    # Score de conformité
    compliance_score = sum(compliance_checks.values()) / len(compliance_checks) * 100
    
    # Mettre à jour le document
    document["complianceValidation"] = {
        "validatedBy": current_user["user_id"],
        "validatedAt": datetime.utcnow().isoformat(),
        "checks": compliance_checks,
        "score": compliance_score,
        "status": "compliant" if compliance_score >= 90 else "partial" if compliance_score >= 70 else "non_compliant"
    }
    
    log_audit(current_user["user_id"], "DOCUMENT_COMPLIANCE_VALIDATED", f"Validation conformité document {document_id}", "")
    
    return {
        "success": True,
        "complianceScore": compliance_score,
        "status": document["complianceValidation"]["status"],
        "checks": compliance_checks
    }

@router.get("/regulatory-mapping")
async def get_regulatory_mapping(current_user: dict = Depends(verify_token)):
    """Mapping vers les référentiels réglementaires"""
    
    return {
        "success": True,
        "mappings": {
            "ifrs17": {
                "CSM": "Contract Service Margin - Marge de service contractuel",
                "RA": "Risk Adjustment - Ajustement pour risque",
                "LIC": "Liability for Incurred Claims - Provision pour sinistres à payer",
                "LRC": "Liability for Remaining Coverage - Provision pour couverture restante"
            },
            "solvency2": {
                "TP": "Technical Provisions - Provisions techniques",
                "BE": "Best Estimate - Meilleure estimation",
                "RM": "Risk Margin - Marge de risque",
                "SCR": "Solvency Capital Requirement - Capital de solvabilité requis",
                "MCR": "Minimum Capital Requirement - Capital minimum requis"
            },
            "qrt_templates": {
                "S.02.01": "Balance sheet",
                "S.12.01": "Life and Health SLT Technical Provisions",
                "S.17.01": "Non-Life Technical Provisions",
                "S.19.01": "Non-Life insurance claims",
                "S.25.01": "Solvency Capital Requirement"
            }
        }
    }

def generate_methodology_documentation(calculation_data: Dict, customization: TemplateCustomization) -> Dict[str, Any]:
    """Générer la documentation méthodologique"""
    return {
        "header": {
            "title": "Documentation Méthodologique",
            "subtitle": f"Calcul de Provisions - {calculation_data['metadata']['business_line']}",
            "company": customization.companyName,
            "date": customization.reportDate or datetime.now().strftime("%d/%m/%Y")
        },
        "methodology_summary": {
            "purpose": "Documentation des méthodes de calcul de provisions",
            "scope": calculation_data["metadata"]["business_line"],
            "methods_count": len(calculation_data["methods"]),
            "approval_status": "Approuvé par le Chef Actuaire"
        },
        "detailed_methods": calculation_data["methods"],
        "validation_procedures": [
            "Tests de cohérence statistique",
            "Analyse de sensibilité",
            "Comparaison avec l'exercice précédent",
            "Benchmark avec le marché"
        ]
    }