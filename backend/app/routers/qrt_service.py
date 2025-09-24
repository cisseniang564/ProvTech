# backend/app/routers/qrt_service.py
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, validator
from enum import Enum
import pandas as pd
import numpy as np
import logging
import uuid
import io
import json
import xml.etree.ElementTree as ET
from xml.dom import minidom

from ..main import verify_token, find_user_by_id, log_audit

router = APIRouter(prefix="/api/v1/qrt", tags=["QRT Automatisés"])
logger = logging.getLogger("qrt_service")

# ===== MODÈLES PYDANTIC =====

class QRTTemplate(str, Enum):
    S_02_01 = "S.02.01"  # Balance sheet
    S_12_01 = "S.12.01"  # Life and Health SLT Technical Provisions  
    S_17_01 = "S.17.01"  # Non-Life Technical Provisions
    S_19_01 = "S.19.01"  # Non-Life insurance claims
    S_25_01 = "S.25.01"  # Solvency Capital Requirement
    S_28_01 = "S.28.01"  # Minimum Capital Requirement
    S_05_01 = "S.05.01"  # Premiums, claims and expenses by line of business

class ReportingPeriod(str, Enum):
    QUARTERLY = "quarterly"
    ANNUAL = "annual"
    
class QRTRequest(BaseModel):
    templates: List[QRTTemplate]
    reporting_period: ReportingPeriod
    reference_date: str
    calculation_id: Optional[str] = None
    currency: str = "EUR"
    output_format: str = "xlsx"  # xlsx, xbrl, csv
    include_validation: bool = True

class QRTValidation(BaseModel):
    template: QRTTemplate
    rules_checked: int
    rules_passed: int
    rules_failed: int
    errors: List[Dict[str, str]]
    warnings: List[Dict[str, str]]

# ===== BASE DE DONNÉES SIMULÉE =====

QRT_GENERATIONS = []
VALIDATION_RULES = {}

# Templates QRT avec leurs structures
QRT_TEMPLATES_STRUCTURE = {
    QRTTemplate.S_02_01: {
        "name": "Balance Sheet",
        "description": "Bilan prudentiel Solvabilité II",
        "sections": {
            "assets": ["cash", "bonds", "equities", "investment_funds", "derivatives", "deposits_other_than_cash", "other_assets"],
            "technical_provisions": ["best_estimate", "risk_margin", "technical_provisions_total"],
            "liabilities": ["contingent_liabilities", "provisions_other_than_technical", "debt_securities", "other_liabilities"],
            "own_funds": ["ordinary_share_capital", "retained_earnings", "other_reserves", "reconciliation_reserve"]
        },
        "validation_rules": [
            {"id": "S.02.01.01", "description": "Total assets = Total liabilities + Own funds", "type": "balance"},
            {"id": "S.02.01.02", "description": "Technical provisions >= Best estimate + Risk margin", "type": "logic"},
            {"id": "S.02.01.03", "description": "All monetary amounts >= 0", "type": "format"}
        ]
    },
    QRTTemplate.S_17_01: {
        "name": "Non-Life Technical Provisions", 
        "description": "Provisions techniques Non-Vie",
        "sections": {
            "best_estimate_gross": ["motor_vehicle_liability", "other_motor", "fire_other_property", "general_liability", "miscellaneous"],
            "best_estimate_net": ["motor_vehicle_liability", "other_motor", "fire_other_property", "general_liability", "miscellaneous"],
            "risk_margin": ["motor_vehicle_liability", "other_motor", "fire_other_property", "general_liability", "miscellaneous"],
            "technical_provisions_total": ["motor_vehicle_liability", "other_motor", "fire_other_property", "general_liability", "miscellaneous"]
        },
        "validation_rules": [
            {"id": "S.17.01.01", "description": "TP Total = BE + Risk Margin par LoB", "type": "calculation"},
            {"id": "S.17.01.02", "description": "Risk Margin > 0 pour chaque LoB active", "type": "logic"},
            {"id": "S.17.01.03", "description": "BE Net <= BE Gross", "type": "consistency"}
        ]
    },
    QRTTemplate.S_19_01: {
        "name": "Non-Life Insurance Claims",
        "description": "Triangles de liquidation Non-Vie", 
        "sections": {
            "claims_paid": ["accident_year", "development_year", "amount"],
            "claims_outstanding": ["accident_year", "development_year", "amount"],
            "claims_incurred": ["accident_year", "development_year", "amount"]
        },
        "validation_rules": [
            {"id": "S.19.01.01", "description": "Incurred = Paid + Outstanding", "type": "calculation"},
            {"id": "S.19.01.02", "description": "Cohérence temporelle des triangles", "type": "consistency"},
            {"id": "S.19.01.03", "description": "Pas de montants négatifs", "type": "format"}
        ]
    },
    QRTTemplate.S_25_01: {
        "name": "Solvency Capital Requirement",
        "description": "Capital de solvabilité requis",
        "sections": {
            "market_risk": ["interest_rate", "equity", "property", "spread", "concentration", "currency"],
            "credit_risk": ["type1", "type2"],
            "underwriting_risk": ["premium_reserve", "lapse", "catastrophe"],
            "operational_risk": ["amount"],
            "diversification": ["effect"],
            "scr_total": ["before_diversification", "after_diversification"]
        },
        "validation_rules": [
            {"id": "S.25.01.01", "description": "SCR = sqrt(sum(SCR_i^2) + 2*sum(Corr_ij*SCR_i*SCR_j))", "type": "calculation"},
            {"id": "S.25.01.02", "description": "Effet diversification < 0", "type": "logic"},
            {"id": "S.25.01.03", "description": "SCR Total >= somme des composantes - diversification", "type": "consistency"}
        ]
    }
}

# ===== FONCTIONS DE GÉNÉRATION =====

def fetch_calculation_data_for_qrt(calculation_id: str) -> Dict[str, Any]:
    """Récupérer données depuis vos APIs pour QRT"""
    # Utilise vos structures existantes
    return {
        "id": calculation_id,
        "triangle_name": "RC Automobile 2024",
        "business_lines": {
            "motor_vehicle_liability": {
                "best_estimate": 8500000,
                "risk_margin": 680000,
                "technical_provisions": 9180000,
                "premiums_written": 12000000,
                "claims_paid": 6800000
            },
            "other_motor": {
                "best_estimate": 2150000,
                "risk_margin": 172000,
                "technical_provisions": 2322000,
                "premiums_written": 3000000,
                "claims_paid": 1700000
            },
            "fire_other_property": {
                "best_estimate": 1500000,
                "risk_margin": 120000,
                "technical_provisions": 1620000,
                "premiums_written": 2200000,
                "claims_paid": 1100000
            },
            "general_liability": {
                "best_estimate": 500000,
                "risk_margin": 40000,
                "technical_provisions": 540000,
                "premiums_written": 800000,
                "claims_paid": 450000
            }
        },
        "scr_components": {
            "market_risk": 1800000,
            "credit_risk": 300000,
            "underwriting_risk": 2200000,
            "operational_risk": 450000,
            "diversification_effect": -800000,
            "scr_total": 3950000
        },
        "own_funds": {
            "tier1_unrestricted": 6000000,
            "tier1_restricted": 500000,
            "tier2": 200000,
            "total": 6700000
        },
        "balance_sheet": {
            "total_assets": 25000000,
            "total_technical_provisions": 13662000,
            "other_liabilities": 4638000,
            "total_own_funds": 6700000
        }
    }

def generate_s_02_01_balance_sheet(data: Dict[str, Any]) -> pd.DataFrame:
    """Générer S.02.01 - Balance Sheet"""
    
    balance_sheet = data.get("balance_sheet", {})
    own_funds = data.get("own_funds", {})
    
    # Structure du bilan S.02.01
    rows = [
        # ASSETS
        {"item": "R0010", "description": "Goodwill", "solvency_ii_value": 0},
        {"item": "R0020", "description": "Deferred acquisition costs", "solvency_ii_value": 0},
        {"item": "R0030", "description": "Intangible assets", "solvency_ii_value": 500000},
        {"item": "R0040", "description": "Deferred tax assets", "solvency_ii_value": 200000},
        {"item": "R0050", "description": "Pension benefit surplus", "solvency_ii_value": 0},
        {"item": "R0060", "description": "Property, plant & equipment held for own use", "solvency_ii_value": 1800000},
        {"item": "R0070", "description": "Investments", "solvency_ii_value": 18000000},
        {"item": "R0080", "description": "Property (other than for own use)", "solvency_ii_value": 2000000},
        {"item": "R0090", "description": "Holdings in related undertakings", "solvency_ii_value": 0},
        {"item": "R0100", "description": "Equities", "solvency_ii_value": 3000000},
        {"item": "R0110", "description": "Bonds", "solvency_ii_value": 12000000},
        {"item": "R0120", "description": "Government bonds", "solvency_ii_value": 8000000},
        {"item": "R0130", "description": "Corporate bonds", "solvency_ii_value": 4000000},
        {"item": "R0140", "description": "Collective investment undertakings", "solvency_ii_value": 1000000},
        {"item": "R0150", "description": "Derivatives", "solvency_ii_value": 0},
        {"item": "R0160", "description": "Deposits other than cash equivalents", "solvency_ii_value": 0},
        {"item": "R0170", "description": "Other investments", "solvency_ii_value": 0},
        {"item": "R0180", "description": "Assets held for index-linked and unit-linked contracts", "solvency_ii_value": 0},
        {"item": "R0190", "description": "Loans and mortgages", "solvency_ii_value": 1000000},
        {"item": "R0200", "description": "Loans on policies", "solvency_ii_value": 0},
        {"item": "R0210", "description": "Loans and mortgages to individuals", "solvency_ii_value": 500000},
        {"item": "R0220", "description": "Other loans and mortgages", "solvency_ii_value": 500000},
        {"item": "R0230", "description": "Reinsurance recoverables", "solvency_ii_value": 800000},
        {"item": "R0240", "description": "Insurance and intermediaries receivables", "solvency_ii_value": 600000},
        {"item": "R0250", "description": "Reinsurance receivables", "solvency_ii_value": 100000},
        {"item": "R0260", "description": "Receivables (trade, not insurance)", "solvency_ii_value": 400000},
        {"item": "R0270", "description": "Own shares", "solvency_ii_value": 0},
        {"item": "R0280", "description": "Amounts due in respect of own fund items", "solvency_ii_value": 0},
        {"item": "R0290", "description": "Cash and cash equivalents", "solvency_ii_value": 1000000},
        {"item": "R0300", "description": "Any other assets, not elsewhere shown", "solvency_ii_value": 100000},
        {"item": "R0310", "description": "TOTAL ASSETS", "solvency_ii_value": balance_sheet.get("total_assets", 25000000)},
        
        # TECHNICAL PROVISIONS
        {"item": "R0320", "description": "Technical provisions – non-life", "solvency_ii_value": balance_sheet.get("total_technical_provisions", 13662000)},
        {"item": "R0330", "description": "Best Estimate", "solvency_ii_value": 12650000},
        {"item": "R0340", "description": "Risk margin", "solvency_ii_value": 1012000},
        {"item": "R0350", "description": "Technical provisions – life (excl. health)", "solvency_ii_value": 0},
        {"item": "R0360", "description": "Technical provisions – health", "solvency_ii_value": 0},
        {"item": "R0370", "description": "Technical provisions – total", "solvency_ii_value": 13662000},
        
        # OTHER LIABILITIES
        {"item": "R0380", "description": "Contingent liabilities", "solvency_ii_value": 0},
        {"item": "R0390", "description": "Provisions other than technical provisions", "solvency_ii_value": 300000},
        {"item": "R0400", "description": "Pension benefit obligations", "solvency_ii_value": 200000},
        {"item": "R0410", "description": "Deposits from reinsurers", "solvency_ii_value": 150000},
        {"item": "R0420", "description": "Deferred tax liabilities", "solvency_ii_value": 800000},
        {"item": "R0430", "description": "Derivatives", "solvency_ii_value": 0},
        {"item": "R0440", "description": "Debts owed to credit institutions", "solvency_ii_value": 2000000},
        {"item": "R0450", "description": "Financial liabilities other than debts", "solvency_ii_value": 0},
        {"item": "R0460", "description": "Insurance & intermediaries payables", "solvency_ii_value": 500000},
        {"item": "R0470", "description": "Reinsurance payables", "solvency_ii_value": 200000},
        {"item": "R0480", "description": "Payables (trade, not insurance)", "solvency_ii_value": 488000},
        {"item": "R0490", "description": "Subordinated liabilities", "solvency_ii_value": 0},
        {"item": "R0500", "description": "Any other liabilities", "solvency_ii_value": 0},
        {"item": "R0510", "description": "TOTAL LIABILITIES", "solvency_ii_value": 18300000},
        
        # OWN FUNDS
        {"item": "R0520", "description": "Ordinary share capital", "solvency_ii_value": 2000000},
        {"item": "R0530", "description": "Share premium account", "solvency_ii_value": 0},
        {"item": "R0540", "description": "Initial funds, members' contributions", "solvency_ii_value": 0},
        {"item": "R0550", "description": "Subordinated mutual member accounts", "solvency_ii_value": 0},
        {"item": "R0560", "description": "Surplus reserves", "solvency_ii_value": 0},
        {"item": "R0570", "description": "Preference shares", "solvency_ii_value": 0},
        {"item": "R0580", "description": "Share premium account", "solvency_ii_value": 0},
        {"item": "R0590", "description": "Reconciliation reserve", "solvency_ii_value": 4200000},
        {"item": "R0600", "description": "Subordinated liabilities", "solvency_ii_value": 500000},
        {"item": "R0610", "description": "TOTAL OWN FUNDS", "solvency_ii_value": own_funds.get("total", 6700000)}
    ]
    
    return pd.DataFrame(rows)

def generate_s_17_01_technical_provisions(data: Dict[str, Any]) -> pd.DataFrame:
    """Générer S.17.01 - Non-Life Technical Provisions"""
    
    business_lines = data.get("business_lines", {})
    
    # Mapping des lignes d'activité EIOPA
    lob_mapping = {
        "motor_vehicle_liability": "Motor vehicle liability insurance",
        "other_motor": "Other motor insurance", 
        "fire_other_property": "Fire and other damage to property insurance",
        "general_liability": "General liability insurance",
        "miscellaneous": "Miscellaneous financial loss"
    }
    
    rows = []
    
    for lob_key, lob_data in business_lines.items():
        if lob_key in lob_mapping:
            rows.append({
                "line_of_business": lob_mapping[lob_key],
                "lob_code": lob_key,
                "best_estimate_gross": lob_data.get("best_estimate", 0),
                "best_estimate_net": lob_data.get("best_estimate", 0) * 0.95,  # Effet réassurance
                "risk_margin": lob_data.get("risk_margin", 0),
                "technical_provisions_total": lob_data.get("technical_provisions", 0),
                "technical_provisions_net": lob_data.get("technical_provisions", 0) * 0.95
            })
    
    # Ligne totale
    rows.append({
        "line_of_business": "TOTAL",
        "lob_code": "total",
        "best_estimate_gross": sum(row["best_estimate_gross"] for row in rows),
        "best_estimate_net": sum(row["best_estimate_net"] for row in rows),
        "risk_margin": sum(row["risk_margin"] for row in rows),
        "technical_provisions_total": sum(row["technical_provisions_total"] for row in rows),
        "technical_provisions_net": sum(row["technical_provisions_net"] for row in rows)
    })
    
    return pd.DataFrame(rows)

def generate_s_19_01_claims_development(data: Dict[str, Any]) -> pd.DataFrame:
    """Générer S.19.01 - Claims Development Triangle"""
    
    # Simulation d'un triangle de développement basé sur vos données
    business_lines = data.get("business_lines", {})
    
    # Triangle pour RC Automobile (principale LoB)
    motor_data = business_lines.get("motor_vehicle_liability", {})
    base_claims = motor_data.get("best_estimate", 8500000)
    
    # Génération triangle run-off (5 années de développement)
    triangle_data = []
    accident_years = [2019, 2020, 2021, 2022, 2023]
    development_years = [0, 1, 2, 3, 4]
    
    # Facteurs de développement typiques RC Auto
    cum_factors = [1.0, 1.45, 1.67, 1.75, 1.78]
    
    for i, acc_year in enumerate(accident_years):
        for j, dev_year in enumerate(development_years):
            if j <= (len(accident_years) - 1 - i):  # Triangle supérieur seulement
                # Montant payé cumulé
                paid_cumulative = base_claims * (0.8 + i * 0.05) * (cum_factors[j] - 0.2) / cum_factors[-1]
                
                # Montant payé incrémental
                paid_incremental = paid_cumulative if j == 0 else paid_cumulative - (base_claims * (0.8 + i * 0.05) * (cum_factors[j-1] - 0.2) / cum_factors[-1])
                
                # Provisions restantes
                best_estimate_claims = base_claims * (0.8 + i * 0.05) * cum_factors[j] / cum_factors[-1] - paid_cumulative
                
                triangle_data.append({
                    "accident_year": acc_year,
                    "development_year": dev_year,
                    "claims_paid_incremental": max(0, paid_incremental),
                    "claims_paid_cumulative": paid_cumulative,
                    "best_estimate_claims_provisions": max(0, best_estimate_claims),
                    "claims_incurred": paid_cumulative + best_estimate_claims
                })
    
    return pd.DataFrame(triangle_data)

def generate_s_25_01_scr(data: Dict[str, Any]) -> pd.DataFrame:
    """Générer S.25.01 - Solvency Capital Requirement"""
    
    scr_data = data.get("scr_components", {})
    
    rows = [
        # Market Risk
        {"risk_module": "Market risk", "component": "Interest rate risk", "amount": scr_data.get("market_risk", 1800000) * 0.4},
        {"risk_module": "Market risk", "component": "Equity risk", "amount": scr_data.get("market_risk", 1800000) * 0.3},
        {"risk_module": "Market risk", "component": "Property risk", "amount": scr_data.get("market_risk", 1800000) * 0.15},
        {"risk_module": "Market risk", "component": "Spread risk", "amount": scr_data.get("market_risk", 1800000) * 0.1},
        {"risk_module": "Market risk", "component": "Currency risk", "amount": scr_data.get("market_risk", 1800000) * 0.05},
        {"risk_module": "Market risk", "component": "TOTAL", "amount": scr_data.get("market_risk", 1800000)},
        
        # Credit Risk
        {"risk_module": "Counterparty default risk", "component": "Type 1 exposures", "amount": scr_data.get("credit_risk", 300000) * 0.7},
        {"risk_module": "Counterparty default risk", "component": "Type 2 exposures", "amount": scr_data.get("credit_risk", 300000) * 0.3},
        {"risk_module": "Counterparty default risk", "component": "TOTAL", "amount": scr_data.get("credit_risk", 300000)},
        
        # Non-life underwriting risk
        {"risk_module": "Non-life underwriting risk", "component": "Premium and reserve risk", "amount": scr_data.get("underwriting_risk", 2200000) * 0.85},
        {"risk_module": "Non-life underwriting risk", "component": "Lapse risk", "amount": scr_data.get("underwriting_risk", 2200000) * 0.05},
        {"risk_module": "Non-life underwriting risk", "component": "Catastrophe risk", "amount": scr_data.get("underwriting_risk", 2200000) * 0.1},
        {"risk_module": "Non-life underwriting risk", "component": "TOTAL", "amount": scr_data.get("underwriting_risk", 2200000)},
        
        # Operational Risk  
        {"risk_module": "Operational risk", "component": "Operational risk", "amount": scr_data.get("operational_risk", 450000)},
        
        # Diversification
        {"risk_module": "Diversification", "component": "Diversification effect", "amount": scr_data.get("diversification_effect", -800000)},
        
        # Total SCR
        {"risk_module": "Basic Solvency Capital Requirement", "component": "TOTAL", "amount": scr_data.get("scr_total", 3950000)}
    ]
    
    return pd.DataFrame(rows)

def validate_qrt_template(template: QRTTemplate, df: pd.DataFrame, data: Dict[str, Any]) -> QRTValidation:
    """Valider un template QRT selon les règles EIOPA"""
    
    template_info = QRT_TEMPLATES_STRUCTURE.get(template)
    if not template_info:
        return QRTValidation(
            template=template,
            rules_checked=0,
            rules_passed=0, 
            rules_failed=0,
            errors=[],
            warnings=[]
        )
    
    validation_rules = template_info.get("validation_rules", [])
    errors = []
    warnings = []
    rules_passed = 0
    
    for rule in validation_rules:
        rule_id = rule["id"]
        description = rule["description"]
        rule_type = rule["type"]
        
        try:
            if template == QRTTemplate.S_02_01 and rule_id == "S.02.01.01":
                # Balance check: Total assets = Total liabilities + Own funds
                total_assets = df[df["item"] == "R0310"]["solvency_ii_value"].iloc[0] if "R0310" in df["item"].values else 0
                total_liabilities = df[df["item"] == "R0510"]["solvency_ii_value"].iloc[0] if "R0510" in df["item"].values else 0
                total_own_funds = df[df["item"] == "R0610"]["solvency_ii_value"].iloc[0] if "R0610" in df["item"].values else 0
                
                if abs(total_assets - (total_liabilities + total_own_funds)) > 1000:  # Tolérance 1k€
                    errors.append({
                        "rule_id": rule_id,
                        "description": description,
                        "message": f"Déséquilibre bilan: Actif {total_assets:,.0f} ≠ Passif+FP {total_liabilities + total_own_funds:,.0f}"
                    })
                else:
                    rules_passed += 1
                    
            elif template == QRTTemplate.S_17_01 and rule_id == "S.17.01.01":
                # TP Total = BE + Risk Margin par LoB
                for _, row in df.iterrows():
                    if row.get("lob_code") != "total":
                        be = row.get("best_estimate_gross", 0)
                        rm = row.get("risk_margin", 0)
                        tp = row.get("technical_provisions_total", 0)
                        
                        if abs(tp - (be + rm)) > 100:  # Tolérance 100€
                            errors.append({
                                "rule_id": rule_id,
                                "description": description,
                                "message": f"LoB {row.get('line_of_business')}: TP {tp:,.0f} ≠ BE+RM {be + rm:,.0f}"
                            })
                        else:
                            rules_passed += 1
                            
            elif template == QRTTemplate.S_19_01 and rule_id == "S.19.01.01":
                # Incurred = Paid + Outstanding
                for _, row in df.iterrows():
                    paid_cum = row.get("claims_paid_cumulative", 0)
                    outstanding = row.get("best_estimate_claims_provisions", 0)
                    incurred = row.get("claims_incurred", 0)
                    
                    if abs(incurred - (paid_cum + outstanding)) > 10:
                        errors.append({
                            "rule_id": rule_id, 
                            "description": description,
                            "message": f"Année {row.get('accident_year')}: Incurred {incurred:,.0f} ≠ Paid+Outstanding {paid_cum + outstanding:,.0f}"
                        })
                    else:
                        rules_passed += 1
                        
            # Règles génériques
            elif rule_type == "format":
                # Pas de montants négatifs (sauf diversification)
                numeric_cols = df.select_dtypes(include=[np.number]).columns
                for col in numeric_cols:
                    if col != "diversification_effect" and any(df[col] < 0):
                        warnings.append({
                            "rule_id": rule_id,
                            "description": "Montants négatifs détectés",
                            "message": f"Colonne {col} contient des valeurs négatives"
                        })
                    else:
                        rules_passed += 1
                        
        except Exception as e:
            errors.append({
                "rule_id": rule_id,
                "description": description,
                "message": f"Erreur validation: {str(e)}"
            })
    
    return QRTValidation(
        template=template,
        rules_checked=len(validation_rules),
        rules_passed=rules_passed,
        rules_failed=len(errors),
        errors=errors,
        warnings=warnings
    )

def generate_xbrl_output(template: QRTTemplate, df: pd.DataFrame, reference_date: str) -> str:
    """Générer sortie XBRL pour soumission EIOPA"""
    
    # Structure XBRL simplifiée
    root = ET.Element("xbrl", 
                      xmlns="http://www.xbrl.org/2003/instance",
                      xmlns_sii="http://eiopa.europa.eu/xbrl/s2md/dict/dom/sii")
    
    # Context
    context = ET.SubElement(root, "context", id="c1")
    entity = ET.SubElement(context, "entity")
    identifier = ET.SubElement(entity, "identifier", scheme="http://standards.iso.org/iso/17442")
    identifier.text = "123400ABCDEFGHIJKL56"  # LEI example
    
    period = ET.SubElement(context, "period")
    instant = ET.SubElement(period, "instant")
    instant.text = reference_date
    
    # Unit
    unit = ET.SubElement(root, "unit", id="u1")
    measure = ET.SubElement(unit, "measure")
    measure.text = "iso4217:EUR"
    
    # Facts (exemple pour S.02.01)
    if template == QRTTemplate.S_02_01:
        for _, row in df.iterrows():
            if row.get("item") and row.get("solvency_ii_value"):
                fact = ET.SubElement(root, f"sii:{row['item']}", 
                                   contextRef="c1", 
                                   unitRef="u1",
                                   decimals="0")
                fact.text = str(int(row["solvency_ii_value"]))
    
    # Formatter XML
    rough_string = ET.tostring(root, 'utf-8')
    reparsed = minidom.parseString(rough_string)
    return reparsed.toprettyxml(indent="  ")

# ===== ENDPOINTS =====

@router.post("/generate")
async def generate_qrt_templates(
    request: QRTRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(verify_token)
):
    """Générer les templates QRT demandés"""
    
    user = find_user_by_id(current_user["user_id"])
    if not user or user["role"] not in ["ACTUAIRE_SENIOR", "CHEF_ACTUAIRE", "DIRECTION", "ADMIN"]:
        raise HTTPException(status_code=403, detail="Permissions insuffisantes")
    
    try:
        generation_id = str(uuid.uuid4())
        
        # Récupérer les données de calcul
        if request.calculation_id:
            calculation_data = fetch_calculation_data_for_qrt(request.calculation_id)
        else:
            # Utiliser données par défaut/dernières disponibles
            calculation_data = fetch_calculation_data_for_qrt("default")
        
        generated_templates = {}
        validations = {}
        
        # Générer chaque template demandé
        for template in request.templates:
            try:
                if template == QRTTemplate.S_02_01:
                    df = generate_s_02_01_balance_sheet(calculation_data)
                elif template == QRTTemplate.S_17_01:
                    df = generate_s_17_01_technical_provisions(calculation_data)
                elif template == QRTTemplate.S_19_01:
                    df = generate_s_19_01_claims_development(calculation_data)
                elif template == QRTTemplate.S_25_01:
                    df = generate_s_25_01_scr(calculation_data)
                else:
                    # Template non implémenté
                    continue
                
                generated_templates[template] = df
                
                # Validation si demandée
                if request.include_validation:
                    validation = validate_qrt_template(template, df, calculation_data)
                    validations[template] = validation
                    
            except Exception as e:
                logger.error(f"Erreur génération template {template}: {str(e)}")
                continue
        
        if not generated_templates:
            raise HTTPException(status_code=400, detail="Aucun template n'a pu être généré")
        
        # Enregistrer la génération
        generation_record = {
            "id": generation_id,
            "generated_by": current_user["user_id"],
            "generated_at": datetime.utcnow().isoformat(),
            "templates": list(generated_templates.keys()),
            "reference_date": request.reference_date,
            "reporting_period": request.reporting_period,
            "calculation_id": request.calculation_id,
            "currency": request.currency,
            "output_format": request.output_format,
            "validation_results": validations,
            "status": "completed"
        }
        
        QRT_GENERATIONS.append(generation_record)
        
        # Log d'audit
        log_audit(
            current_user["user_id"],
            "QRT_TEMPLATES_GENERATED",
            f"Génération QRT {len(generated_templates)} templates pour période {request.reference_date}",
            ""
        )
        
        # Préparer la réponse selon le format demandé
        if request.output_format == "xlsx":
            # Créer fichier Excel multi-onglets
            buffer = io.BytesIO()
            
            with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
                for template, df in generated_templates.items():
                    sheet_name = template.replace(".", "_")
                    df.to_excel(writer, sheet_name=sheet_name, index=False)
                    
                    # Ajouter feuille de validation si disponible
                    if template in validations:
                        validation_df = pd.DataFrame([
                            {"Metric": "Rules Checked", "Value": validations[template].rules_checked},
                            {"Metric": "Rules Passed", "Value": validations[template].rules_passed},
                            {"Metric": "Rules Failed", "Value": validations[template].rules_failed}
                        ])
                        validation_df.to_excel(writer, sheet_name=f"{sheet_name}_validation", index=False)
            
            buffer.seek(0)
            
            return StreamingResponse(
                io.BytesIO(buffer.getvalue()),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={
                    "Content-Disposition": f"attachment; filename=QRT_{request.reference_date}_{generation_id[:8]}.xlsx"
                }
            )
        
        elif request.output_format == "xbrl":
            # Générer XBRL pour le premier template
            first_template = list(generated_templates.keys())[0]
            xbrl_content = generate_xbrl_output(first_template, generated_templates[first_template], request.reference_date)
            
            return StreamingResponse(
                io.BytesIO(xbrl_content.encode('utf-8')),
                media_type="application/xml",
                headers={
                    "Content-Disposition": f"attachment; filename=QRT_{first_template}_{request.reference_date}.xbrl"
                }
            )
        
        else:
            # Retour JSON par défaut
            return {
                "success": True,
                "generation_id": generation_id,
                "templates_generated": len(generated_templates),
                "validation_results": validations,
                "reference_date": request.reference_date,
                "summary": {
                    "total_templates": len(generated_templates),
                    "validation_errors": sum(len(v.errors) for v in validations.values()),
                    "validation_warnings": sum(len(v.warnings) for v in validations.values())
                }
            }
            
    except Exception as e:
        logger.error(f"Erreur génération QRT: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de la génération QRT: {str(e)}")

@router.get("/templates")
async def get_available_templates(current_user: dict = Depends(verify_token)):
    """Liste des templates QRT disponibles"""
    
    templates_info = []
    
    for template_enum in QRTTemplate:
        template_info = QRT_TEMPLATES_STRUCTURE.get(template_enum)
        if template_info:
            templates_info.append({
                "code": template_enum,
                "name": template_info["name"],
                "description": template_info["description"],
                "sections": list(template_info["sections"].keys()) if "sections" in template_info else [],
                "validation_rules": len(template_info.get("validation_rules", [])),
                "implemented": True
            })
    
    return {
        "success": True,
        "templates": templates_info,
        "total_available": len(templates_info)
    }

@router.get("/generations")
async def get_qrt_generations(
    limit: int = 50,
    offset: int = 0,
    current_user: dict = Depends(verify_token)
):
    """Historique des générations QRT"""
    
    # Pagination
    start = offset
    end = offset + limit
    generations = QRT_GENERATIONS[start:end] if start < len(QRT_GENERATIONS) else []
    
    # Enrichir avec noms utilisateurs
    for generation in generations:
        user = find_user_by_id(generation["generated_by"])
        generation["generated_by_name"] = f"{user['first_name']} {user['last_name']}" if user else "Inconnu"
        generation["time_ago"] = get_time_ago(generation["generated_at"])
    
    return {
        "success": True,
        "generations": sorted(generations, key=lambda x: x["generated_at"], reverse=True),
        "pagination": {
            "total": len(QRT_GENERATIONS),
            "limit": limit,
            "offset": offset,
            "has_more": end < len(QRT_GENERATIONS)
        }
    }

@router.get("/validation/{generation_id}")
async def get_validation_results(
    generation_id: str,
    current_user: dict = Depends(verify_token)
):
    """Résultats de validation détaillés"""
    
    generation = next((g for g in QRT_GENERATIONS if g["id"] == generation_id), None)
    if not generation:
        raise HTTPException(status_code=404, detail="Génération introuvable")
    
    return {
        "success": True,
        "generation_id": generation_id,
        "validation_results": generation.get("validation_results", {}),
        "reference_date": generation["reference_date"],
        "templates": generation["templates"]
    }

@router.post("/submit-eiopa")
async def submit_to_eiopa(
    generation_id: str,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(verify_token)
):
    """Soumettre les QRT à EIOPA (simulation)"""
    
    user = find_user_by_id(current_user["user_id"])
    if not user or user["role"] not in ["CHEF_ACTUAIRE", "DIRECTION", "ADMIN"]:
        raise HTTPException(status_code=403, detail="Permissions insuffisantes pour soumission réglementaire")
    
    generation = next((g for g in QRT_GENERATIONS if g["id"] == generation_id), None)
    if not generation:
        raise HTTPException(status_code=404, detail="Génération introuvable")
    
    # Vérifier que tous les templates ont passé la validation
    validation_results = generation.get("validation_results", {})
    
    blocking_errors = []
    for template, validation in validation_results.items():
        if validation.rules_failed > 0:
            blocking_errors.extend(validation.errors)
    
    if blocking_errors:
        raise HTTPException(
            status_code=400, 
            detail=f"Soumission bloquée: {len(blocking_errors)} erreurs de validation à corriger"
        )
    
    # Simulation de soumission
    submission_id = str(uuid.uuid4())
    
    submission_record = {
        "id": submission_id,
        "generation_id": generation_id,
        "submitted_by": current_user["user_id"],
        "submitted_at": datetime.utcnow().isoformat(),
        "status": "submitted",
        "eiopa_reference": f"EIOPA-{datetime.now().strftime('%Y%m%d')}-{submission_id[:8].upper()}",
        "templates_submitted": generation["templates"],
        "reference_date": generation["reference_date"]
    }
    
    # Programmer la confirmation en arrière-plan (simulation)
    background_tasks.add_task(simulate_eiopa_confirmation, submission_record)
    
    log_audit(
        current_user["user_id"],
        "QRT_SUBMITTED_EIOPA",
        f"Soumission QRT à EIOPA - Réf: {submission_record['eiopa_reference']}",
        ""
    )
    
    return {
        "success": True,
        "submission_id": submission_id,
        "eiopa_reference": submission_record["eiopa_reference"],
        "status": "submitted",
        "message": "QRT soumis avec succès à EIOPA"
    }

# ===== FONCTIONS UTILITAIRES =====

async def simulate_eiopa_confirmation(submission_record: Dict):
    """Simuler la confirmation EIOPA"""
    await asyncio.sleep(30)  # Simulation délai traitement
    
    submission_record["status"] = "accepted"
    submission_record["confirmed_at"] = datetime.utcnow().isoformat()
    
    logger.info(f"EIOPA confirmation simulée pour soumission {submission_record['id']}")

def get_time_ago(timestamp_str: str) -> str:
    """Calculer le temps écoulé"""
    timestamp = datetime.fromisoformat(timestamp_str)
    now = datetime.utcnow()
    diff = now - timestamp
    
    if diff.days > 0:
        return f"Il y a {diff.days} jour{'s' if diff.days > 1 else ''}"
    elif diff.seconds > 3600:
        hours = diff.seconds // 3600
        return f"Il y a {hours} heure{'s' if hours > 1 else ''}"
    else:
        minutes = diff.seconds // 60
        return f"Il y a {minutes} minute{'s' if minutes > 1 else ''}"