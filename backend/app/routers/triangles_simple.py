# backend/app/routers/triangles_simple.py
from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from typing import List, Optional, Union
from pydantic import BaseModel
import pandas as pd
from datetime import datetime
import io
import uuid
import re
import json

router = APIRouter(prefix="/api/v1/triangles", tags=["triangles"])

# ===== MODÈLES SIMPLES SANS DÉPENDANCES =====
class TriangleResponse(BaseModel):
    id: str
    name: str
    triangle_name: Optional[str] = None
    business_line: Optional[str] = None
    branch: str
    type: str
    currency: str
    data: List[List[float]]
    accident_periods: Optional[List[str]] = None
    development_periods: Optional[List[str]] = None
    created_at: str
    status: str = "draft"

class PaginatedTriangles(BaseModel):
    data: List[TriangleResponse]
    total: int
    page: int
    limit: int
    total_pages: int

class ValidationResult(BaseModel):
    is_valid: bool
    errors: List[str]
    warnings: List[str]
    summary: dict

class ImportResult(BaseModel):
    success: bool
    triangle_id: Optional[str] = None
    errors: Optional[List[str]] = []
    warnings: Optional[List[str]] = []
    rows_processed: int
    rows_imported: int

# ===== STOCKAGE TEMPORAIRE (sans DB) =====
triangles_store = {}
calculations_active_store = {}  # Pour stocker les calculs en cours

# ===== FONCTION HELPER POUR NOMS =====
def get_triangle_name(name: str = None, triangle_name: str = None, business_line: str = None, branch: str = None) -> str:
    if triangle_name and triangle_name.strip() and triangle_name.strip() != "Triangle importé":
        return triangle_name.strip()
    if name and name.strip() and name.strip() != "Triangle importé":
        return name.strip()
    if business_line and business_line.strip():
        return business_line.strip()
    if branch and branch.strip():
        labels = {
            'auto': 'Automobile',
            'rc': 'Responsabilité Civile',
            'dab': 'Dommages aux Biens',
            'property': 'Dommages aux Biens',
            'liability': 'RC Générale',
            'health': 'Santé',
            'life': 'Vie',
        }
        return labels.get(branch.strip(), branch.strip())
    return "Triangle sans nom"

# ===== OUTILS =====
def _looks_like_year_or_period(s: str) -> bool:
    s = (s or "").strip()
    return bool(re.match(r'^\d{4}([-/]\d{1,2})?$', s))

def _is_dev_header(h: str) -> bool:
    h = (str(h) or "").lower().strip()
    # dev_12, dev 12, 12, m12, d12…
    return bool(
        re.search(r'\bdev\b', h)
        or re.match(r'^(dev|d|m)[\s_/-]*\d{1,3}$', h)
        or re.match(r'^\d{2,3}$', h)
        or re.search(r'\b(12|24|36|48|60|72|84|96|108|120)\b', h)
        or 'développement' in h
    )

def _parse_list_field(field: Union[None, str, List[str]]) -> Optional[List[str]]:
    """
    Accepte: None | "['dev_12','dev_24']" | "dev_12,dev_24" | ["dev_12","dev_24"]
    """
    if field is None:
        return None
    if isinstance(field, list):
        return [str(x) for x in field]
    if isinstance(field, str):
        txt = field.strip()
        if not txt:
            return None
        # JSON list ?
        try:
            val = json.loads(txt)
            if isinstance(val, list):
                return [str(x) for x in val]
        except Exception:
            pass
        # CSV simple
        return [p.strip() for p in txt.split(",") if p.strip()]
    return None

# ===== DÉTECTION & PARSING =====
def detect_data_format(df: pd.DataFrame, has_headers: bool = True) -> str:
    """
    Détecte automatiquement 'matrix' vs 'standard'
    - Basé sur les **noms d'en-têtes** ET/OU les **valeurs**.
    """
    if df is None or df.empty or len(df.columns) < 3:
        print("Format standard détecté (df vide ou <3 colonnes)")
        return 'standard'

    ncols = len(df.columns)
    headers = [str(c) for c in df.columns]

    # 1) Heuristique via en-têtes
    if has_headers:
        first_h = headers[0].lower()
        others_h = [h.lower() for h in headers[1:]]
        if ('accident' in first_h or 'origin' in first_h or 'survenance' in first_h or first_h in ('ay', 'ay year', 'accident_year')) and any(_is_dev_header(h) for h in others_h):
            print("Format matriciel détecté (via en-têtes)")
            return 'matrix'
        # même si pas 'accident' explicitement, beaucoup de fichiers mettent 'accident_year'
        if headers[0].lower() in ('accident_year', 'accident year', 'ay') and any(_is_dev_header(h) for h in others_h):
            print("Format matriciel détecté (via en-têtes 'accident_year')")
            return 'matrix'

    # 2) Heuristique via valeurs (ligne 0 = 1ère ligne de **données** car header déjà consommé)
    try:
        first_row = df.iloc[0]
        first_cell = str(first_row.iloc[0]).strip()
        if ncols > 3 and _looks_like_year_or_period(first_cell):
            print(f"Format matriciel détecté (via valeurs: '{first_cell}')")
            return 'matrix'
    except Exception:
        pass

    print("Format standard détecté")
    return 'standard'

def parse_matrix_format(
    df: pd.DataFrame,
    has_headers: bool = True,
    accident_period_column: int = 0,
    first_development_column: int = 1
) -> tuple:
    print("Parsing format matriciel:")
    print(f"   - Colonne période accident: {accident_period_column}")
    print(f"   - Première colonne de développement: {first_development_column}")

    triangle_data: List[List[float]] = []
    accident_periods: List[str] = []
    development_periods: List[str] = []

    if has_headers:
        dev_columns = df.columns[first_development_column:]
        development_periods = [str(col) for col in dev_columns]
        print(f"   - Périodes de développement (headers): {development_periods}")
    else:
        nb = len(df.columns) - first_development_column
        development_periods = [f"Dev_{(i+1)*12}" for i in range(nb)]

    for r_idx, row in df.iterrows():
        acc = str(row.iloc[accident_period_column]).strip()
        if not acc:
            continue
        accident_periods.append(acc)

        values: List[float] = []
        for c_idx in range(first_development_column, len(df.columns)):
            v = row.iloc[c_idx]
            if pd.isna(v) or (isinstance(v, str) and not v.strip()):
                continue
            try:
                if isinstance(v, str):
                    v = re.sub(r'[€$£¥]', '', v).replace(' ', '').replace(',', '.')
                values.append(float(v))
            except Exception:
                # ignore cellule non-numérique
                pass

        if values:
            triangle_data.append(values)
            print(f"   - Ligne {r_idx+1}: {acc} -> {len(values)} valeurs")

    print(f"Parsing matriciel terminé: {len(triangle_data)} lignes")
    return triangle_data, accident_periods, development_periods

def parse_standard_format(
    df: pd.DataFrame,
    has_headers: bool = True,
    accident_period_field: str = "Accident Period",
    development_period_field: str = "Development Period",
    amount_field: str = "Amount"
) -> tuple:
    print("Parsing format standard:")
    print(f"   - Champ période accident: '{accident_period_field}'")
    print(f"   - Champ période développement: '{development_period_field}'")
    print(f"   - Champ montant: '{amount_field}'")

    if not has_headers:
        if len(df.columns) >= 3:
            accident_col = df.columns[0]
            development_col = df.columns[1]
            amount_col = df.columns[2]
        else:
            raise ValueError("Format standard: au moins 3 colonnes requises")
    else:
        accident_col = None
        development_col = None
        amount_col = None

        # Recherche tolérante (mais **pas** des colonnes type 'dev_12' pour la période !)
        for col in df.columns:
            c = str(col).lower()
            if accident_col is None and ('accident' in c or 'origin' in c or 'survenance' in c):
                accident_col = col
                continue
            if development_col is None and (
                'development period' in c or 'dev period' in c or 'elapsed' in c or 'lag' in c or c.strip() in ('dev', 'development')
            ):
                development_col = col
                continue
            if amount_col is None and ('amount' in c or 'montant' in c or 'paid' in c or 'incurred' in c or 'reported' in c):
                amount_col = col

        # Si l'utilisateur a fourni explicitement des noms, on les honore :
        if accident_period_field and accident_period_field in df.columns:
            accident_col = accident_period_field
        if development_period_field and development_period_field in df.columns:
            development_col = development_period_field
        if amount_field and amount_field in df.columns:
            amount_col = amount_field

        if not all([accident_col, development_col, amount_col]):
            raise ValueError(f"Colonnes introuvables. Disponibles: {list(df.columns)}")

    triangle_dict = {}
    accident_periods: List[str] = []
    dev_set = set()

    for _, row in df.iterrows():
        acc = str(row[accident_col]).strip()
        dev = str(row[development_col]).strip()
        amt = row[amount_col]
        if not acc or not dev:
            continue
        try:
            if isinstance(amt, str):
                amt = re.sub(r'[€$£¥]', '', amt).replace(' ', '').replace(',', '.')
            val = float(amt)
        except Exception:
            continue

        if acc not in triangle_dict:
            triangle_dict[acc] = {}
            accident_periods.append(acc)
        triangle_dict[acc][dev] = val
        dev_set.add(dev)

    development_periods_sorted = sorted(list(dev_set), key=lambda x: (len(x), x))
    triangle_data: List[List[float]] = []
    for acc in accident_periods:
        row_vals: List[float] = []
        for dev in development_periods_sorted:
            if dev in triangle_dict[acc]:
                row_vals.append(triangle_dict[acc][dev])
        if row_vals:
            triangle_data.append(row_vals)

    print(f"Parsing standard terminé: {len(triangle_data)} lignes")
    return triangle_data, accident_periods, development_periods_sorted

# ===== CALCULS ACTIFS (mock) =====
def start_calculation(calculation_id: str, triangle_id: str, method: str):
    calculations_active_store[calculation_id] = {
        "id": calculation_id, "triangle_id": triangle_id, "method": method,
        "status": "running", "started_at": datetime.utcnow().isoformat() + "Z"
    }

def complete_calculation(calculation_id: str, success: bool = True):
    if calculation_id in calculations_active_store:
        calculations_active_store[calculation_id]["status"] = "completed" if success else "failed"
        calculations_active_store[calculation_id]["completed_at"] = datetime.utcnow().isoformat() + "Z"

def get_calculation_status(calculation_id: str) -> dict:
    return calculations_active_store.get(calculation_id, {"status": "not_found"})

# ===== ENDPOINTS =====

@router.get("/", response_model=PaginatedTriangles)
async def get_triangles(page: int = 1, limit: int = 10, branch: Optional[str] = None, type: Optional[str] = None):
    mock_triangles = [
        TriangleResponse(
            id="1", name="Auto 2024", triangle_name="Auto 2024",
            business_line="auto", branch="auto", type="paid", currency="EUR",
            data=[[1000000, 500000, 250000], [1200000, 600000], [1100000]],
            created_at=datetime.utcnow().isoformat() + "Z"
        ),
        TriangleResponse(
            id="2", name="RC 2023", triangle_name="RC 2023",
            business_line="liability", branch="liability", type="incurred", currency="EUR",
            data=[[2000000, 1800000, 1600000], [2200000, 2000000], [2100000]],
            created_at=datetime.utcnow().isoformat() + "Z"
        )
    ]
    for t in triangles_store.values():
        mock_triangles.append(t)
    filtered = mock_triangles
    if branch:
        filtered = [t for t in filtered if t.branch == branch]
    if type:
        filtered = [t for t in filtered if t.type == type]
    start = (page - 1) * limit
    end = start + limit
    return PaginatedTriangles(
        data=filtered[start:end], total=len(filtered), page=page,
        limit=limit, total_pages=(len(filtered) + limit - 1) // limit
    )

@router.get("/{triangle_id}", response_model=TriangleResponse)
async def get_triangle(triangle_id: str):
    if triangle_id in triangles_store:
        return triangles_store[triangle_id]
    if triangle_id == "1":
        return TriangleResponse(
            id="1", name="Auto 2024", triangle_name="Auto 2024",
            business_line="auto", branch="auto", type="paid", currency="EUR",
            data=[[1000000, 500000, 250000], [1200000, 600000], [1100000]],
            created_at=datetime.utcnow().isoformat() + "Z"
        )
    raise HTTPException(status_code=404, detail="Triangle not found")

@router.post("/validate", response_model=ValidationResult)
async def validate_triangle_data(request: dict):
    data = request.get("data", [])
    errors, warnings = [], []
    if not data:
        errors.append("Aucune donnée fournie")
        return ValidationResult(is_valid=False, errors=errors, warnings=warnings, summary={})
    if len(data) < 2:
        warnings.append("Au moins 2 années de développement recommandées")
    for i, row in enumerate(data):
        if not isinstance(row, list):
            errors.append(f"Ligne {i+1}: Format invalide, liste attendue")
            continue
        if len(row) > i + 1:
            warnings.append(f"Ligne {i+1}: Plus de valeurs que d'années de développement attendues")
        for j, v in enumerate(row):
            try:
                if float(v) < 0:
                    warnings.append(f"Valeur négative: ligne {i+1}, colonne {j+1}")
            except Exception:
                errors.append(f"Valeur non numérique: ligne {i+1}, colonne {j+1}")
    return ValidationResult(
        is_valid=len(errors) == 0,
        errors=errors,
        warnings=warnings,
        summary={
            "total_rows": len(data),
            "total_columns": max(len(r) for r in data if isinstance(r, list)) if data else 0,
            "date_range": {"start": "2020-01", "end": "2024-12"},
        },
    )

@router.post("/import", response_model=ImportResult)
async def import_triangle(
    file: UploadFile = File(...),
    name: Optional[str] = Form("Triangle importé"),
    triangle_name: Optional[str] = Form(None),
    business_line: Optional[str] = Form(None),
    branch: str = Form("auto"),
    type: str = Form("paid"),
    currency: str = Form("EUR"),
    has_headers: bool = Form(True),
    description: Optional[str] = Form(None),

    # Compat & options (front récent)
    data_format: Optional[str] = Form("auto"),       # 'auto' | 'matrix' | 'standard'
    format: Optional[str] = Form(None),              # alias éventuel du front
    separator: Optional[str] = Form(","),            # délimiteur CSV
    date_format: Optional[str] = Form(None),
    skip_rows: Optional[int] = Form(0),

    # Mapping standard
    accident_period_field: Optional[str] = Form("Accident Period"),
    development_period_field: Optional[str] = Form("Development Period"),
    amount_field: Optional[str] = Form("Amount"),

    # Mapping matrix
    accident_period_column: Optional[int] = Form(0),
    first_development_column: Optional[int] = Form(1),
    development_fields: Optional[Union[str, List[str]]] = Form(None)  # peut arriver en JSON ou CSV
):
    """Importer un triangle depuis un fichier — robuste 'auto/matrix/standard' + headers."""

    try:
        print(f"IMPORT - Fichier: {file.filename} ({file.content_type})")
        print("PARAMÈTRES REÇUS:")
        print(f"   name: '{name}'")
        print(f"   triangle_name: '{triangle_name}'")
        print(f"   business_line: '{business_line}'")
        print(f"   branch: '{branch}'")
        print(f"   data_format: '{data_format}' (alias format='{format}')")
        print(f"   accident_period_column: {accident_period_column}")
        print(f"   first_development_column: {first_development_column}")

        # Choisir le format demandé en priorité si 'format' fourni
        if format and format in ("matrix", "standard", "auto"):
            data_format = format

        final_name = get_triangle_name(name, triangle_name, business_line, branch)
        print(f"NOM FINAL CALCULÉ: '{final_name}'")

        # Lecture du fichier
        if file.filename.endswith(".csv") or file.content_type in ("text/csv", "application/csv"):
            raw = await file.read()
            content_str = None
            for enc in ["utf-8", "utf-8-sig", "iso-8859-1", "cp1252"]:
                try:
                    content_str = raw.decode(enc)
                    print(f"Décodage réussi avec: {enc}")
                    break
                except UnicodeDecodeError:
                    continue
            if content_str is None:
                content_str = raw.decode("utf-8", errors="ignore")
                print("Utilisation utf-8 (ignore erreurs)")

            sep = "\t" if (separator or ",") == "\\t" or (separator or ",") == "\t" else (separator or ",")
            df = pd.read_csv(io.StringIO(content_str), header=0 if has_headers else None, sep=sep, skiprows=skip_rows or 0)
        elif file.filename.endswith((".xlsx", ".xls")):
            raw = await file.read()
            df = pd.read_excel(io.BytesIO(raw), header=0 if has_headers else None, skiprows=skip_rows or 0)
        else:
            return ImportResult(success=False, errors=["Format de fichier non supporté (CSV/Excel)"], warnings=[], rows_processed=0, rows_imported=0)

        print(f"DataFrame créé: {df.shape}")
        print(f"Colonnes: {df.columns.tolist()}")
        print("Premières valeurs:")
        try:
            print(df.head(3).to_string())
        except Exception:
            pass

        # Détection du format si 'auto'
        if (data_format or "auto") == "auto":
            detected = detect_data_format(df, has_headers)
        else:
            detected = data_format or "standard"

        # Filets de sécurité: si le format est 'standard' mais que les colonnes ressemblent à un triangle large -> forcer 'matrix'
        if detected == "standard" and has_headers:
            hdrs = [str(c).lower() for c in df.columns]
            if len(hdrs) >= 3 and (hdrs[0] in ("accident_year", "accident year", "ay") or "accident" in hdrs[0]) and any(_is_dev_header(h) for h in hdrs[1:]):
                print("Forçage en 'matrix' (en-têtes typés triangle détectés)")
                detected = "matrix"

        print(f"Format utilisé: {detected}")

        # Parsing
        if detected == "matrix":
            triangle_data, accident_periods, development_periods = parse_matrix_format(
                df=df,
                has_headers=has_headers,
                accident_period_column=accident_period_column or 0,
                first_development_column=first_development_column or 1
            )

            # Si des noms de colonnes de dev ont été transmis par le front, on peut les remplacer
            dev_fields = _parse_list_field(development_fields)
            if has_headers and dev_fields:
                print(f"Remplacement des noms de périodes de dev par ceux fournis: {dev_fields}")
                development_periods = dev_fields

        else:  # standard
            triangle_data, accident_periods, development_periods = parse_standard_format(
                df=df,
                has_headers=has_headers,
                accident_period_field=accident_period_field or "Accident Period",
                development_period_field=development_period_field or "Development Period",
                amount_field=amount_field or "Amount"
            )

        if not triangle_data:
            return ImportResult(
                success=False,
                errors=["Aucune donnée valide trouvée après parsing"],
                warnings=[],
                rows_processed=len(df),
                rows_imported=0
            )

        print(f"{len(triangle_data)} lignes de données converties")
        print(f"Périodes d'accident (extrait): {accident_periods[:5]}")
        print(f"Périodes de développement: {development_periods}")

        # Stockage
        triangle_id = str(uuid.uuid4())
        triangles_store[triangle_id] = TriangleResponse(
            id=triangle_id,
            name=final_name,
            triangle_name=triangle_name or final_name,
            business_line=business_line or branch,
            branch=branch,
            type=type,
            currency=currency,
            data=triangle_data,
            accident_periods=accident_periods,
            development_periods=development_periods,
            created_at=datetime.utcnow().isoformat() + "Z",
            status="active",
        )

        print(f"Triangle créé avec ID: {triangle_id} et nom: '{final_name}'")

        return ImportResult(
            success=True,
            triangle_id=triangle_id,
            errors=[],
            warnings=[],
            rows_processed=len(df),
            rows_imported=len(triangle_data)
        )

    except Exception as e:
        print(f"ERREUR IMPORT: {e}")
        import traceback; traceback.print_exc()
        return ImportResult(
            success=False,
            triangle_id=None,
            errors=[f"Erreur lors de l'import: {str(e)}"],
            warnings=[],
            rows_processed=0,
            rows_imported=0
        )

@router.get("/calculations/active")
async def get_active_calculations():
    try:
        active_count = len([c for c in calculations_active_store.values() if c.get("status") in ["running", "pending"]])
        pending_reviews = len([t for t in triangles_store.values() if t.status == "draft"])
        return {"active_count": active_count, "pending_reviews": pending_reviews, "last_check": datetime.utcnow().isoformat() + "Z"}
    except Exception as e:
        return {"active_count": 0, "pending_reviews": 0, "last_check": datetime.utcnow().isoformat() + "Z", "error": str(e)}

@router.delete("/{triangle_id}")
async def delete_triangle(triangle_id: str):
    if triangle_id in triangles_store:
        del triangles_store[triangle_id]
        return {"message": "Triangle supprimé avec succès"}
    raise HTTPException(status_code=404, detail="Triangle introuvable")

@router.get("/test/ping")
async def ping():
    return {
        "message": "Triangle router is working!",
        "timestamp": datetime.utcnow().isoformat(),
        "triangles_count": len(triangles_store),
    }

@router.get("/calculations/debug")
async def debug_calculations():
    return {
        "active_calculations": calculations_active_store,
        "total_active": len(calculations_active_store),
        "triangles_count": len(triangles_store),
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }