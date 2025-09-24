# backend/app/routers/triangles.py
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Query
from typing import List, Optional
from pydantic import BaseModel
import pandas as pd
import json

router = APIRouter(prefix="/api/v1/triangles", tags=["triangles"])

# ===== MODÈLES PYDANTIC =====
class TriangleBase(BaseModel):
    name: str
    branch: str  # 'auto', 'property', 'liability', etc.
    type: str    # 'paid', 'incurred', 'reported'
    currency: str
    business_line: Optional[str] = None
    description: Optional[str] = None

class TriangleCreate(TriangleBase):
    data: List[List[float]]
    tags: Optional[List[str]] = []

class Triangle(TriangleBase):
    id: str
    data: List[List[float]]
    created_at: str
    updated_at: str
    status: str = "draft"
    
    class Config:
        from_attributes = True

class PaginatedTriangles(BaseModel):
    data: List[Triangle]
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

# ===== ENDPOINTS PRIORITÉ 1 =====

@router.get("/", response_model=PaginatedTriangles)
async def get_triangles(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    branch: Optional[str] = None,
    type: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None
):
    """
    Récupérer tous les triangles avec filtres et pagination
    """
    # TODO: Remplacer par votre logique de base de données
    mock_triangles = [
        Triangle(
            id="1",
            name="Auto 2024",
            branch="auto",
            type="paid",
            currency="EUR",
            data=[[1000000, 500000, 250000], [1200000, 600000], [1100000]],
            created_at="2024-01-01T00:00:00Z",
            updated_at="2024-01-01T00:00:00Z"
        ),
        Triangle(
            id="2", 
            name="RC 2023",
            branch="liability",
            type="incurred",
            currency="EUR",
            data=[[2000000, 1800000, 1600000], [2200000, 2000000], [2100000]],
            created_at="2024-01-01T00:00:00Z",
            updated_at="2024-01-01T00:00:00Z"
        )
    ]
    
    # Appliquer les filtres
    filtered_triangles = mock_triangles
    if branch:
        filtered_triangles = [t for t in filtered_triangles if t.branch == branch]
    if type:
        filtered_triangles = [t for t in filtered_triangles if t.type == type]
    if search:
        filtered_triangles = [t for t in filtered_triangles if search.lower() in t.name.lower()]
    
    # Pagination
    start = (page - 1) * limit
    end = start + limit
    paginated_triangles = filtered_triangles[start:end]
    
    return PaginatedTriangles(
        data=paginated_triangles,
        total=len(filtered_triangles),
        page=page,
        limit=limit,
        total_pages=(len(filtered_triangles) + limit - 1) // limit
    )

@router.get("/{triangle_id}", response_model=Triangle)
async def get_triangle(triangle_id: str):
    """
    Récupérer un triangle par ID
    """
    # TODO: Récupérer depuis la base de données
    if triangle_id == "1":
        return Triangle(
            id="1",
            name="Auto 2024",
            branch="auto",
            type="paid", 
            currency="EUR",
            data=[[1000000, 500000, 250000], [1200000, 600000], [1100000]],
            created_at="2024-01-01T00:00:00Z",
            updated_at="2024-01-01T00:00:00Z"
        )
    
    raise HTTPException(status_code=404, detail="Triangle not found")

@router.post("/", response_model=Triangle)
async def create_triangle(triangle_data: TriangleCreate):
    """
    Créer un nouveau triangle
    """
    # TODO: Sauvegarder en base de données
    import uuid
    from datetime import datetime
    
    new_triangle = Triangle(
        id=str(uuid.uuid4()),
        **triangle_data.dict(),
        created_at=datetime.utcnow().isoformat() + "Z",
        updated_at=datetime.utcnow().isoformat() + "Z"
    )
    
    return new_triangle

@router.post("/validate", response_model=ValidationResult)
async def validate_triangle_data(request: dict):
    """
    Valider les données d'un triangle
    """
    data = request.get("data", [])
    errors = []
    warnings = []
    
    # Validations basiques
    if not data:
        errors.append("Aucune donnée fournie")
    
    if len(data) < 2:
        errors.append("Au moins 2 années de développement requises")
    
    # Vérifier la structure triangulaire
    for i, row in enumerate(data):
        if len(row) > i + 1:
            warnings.append(f"Ligne {i+1}: Plus de valeurs que d'années de développement attendues")
        
        # Vérifier les valeurs négatives
        for j, value in enumerate(row):
            if value < 0:
                warnings.append(f"Valeur négative détectée: ligne {i+1}, colonne {j+1}")
    
    return ValidationResult(
        is_valid=len(errors) == 0,
        errors=errors,
        warnings=warnings,
        summary={
            "total_rows": len(data),
            "total_columns": max(len(row) for row in data) if data else 0,
            "date_range": {"start": "2020-01", "end": "2024-12"}
        }
    )

@router.post("/import", response_model=ImportResult)
async def import_triangle(
    file: UploadFile = File(...),
    name: str = None,
    branch: str = None,
    type: str = None,
    currency: str = "EUR",
    has_headers: bool = True
):
    """
    Importer un triangle depuis un fichier CSV/Excel
    """
    try:
        # Lire le fichier
        if file.filename.endswith('.csv'):
            content = await file.read()
            df = pd.read_csv(pd.io.common.StringIO(content.decode('utf-8')), 
                           header=0 if has_headers else None)
        elif file.filename.endswith(('.xlsx', '.xls')):
            content = await file.read()
            df = pd.read_excel(pd.io.common.BytesIO(content), 
                             header=0 if has_headers else None)
        else:
            raise HTTPException(status_code=400, detail="Format de fichier non supporté")
        
        # Convertir en triangle (logique simplifiée)
        triangle_data = df.values.tolist()
        
        # Créer le triangle
        import uuid
        triangle_id = str(uuid.uuid4())
        
        # TODO: Sauvegarder en base de données
        
        return ImportResult(
            success=True,
            triangle_id=triangle_id,
            errors=[],
            warnings=[],
            rows_processed=len(df),
            rows_imported=len(df)
        )
        
    except Exception as e:
        return ImportResult(
            success=False,
            triangle_id=None,
            errors=[str(e)],
            warnings=[],
            rows_processed=0,
            rows_imported=0
        )

@router.delete("/{triangle_id}")
async def delete_triangle(triangle_id: str):
    """
    Supprimer un triangle
    """
    # TODO: Supprimer de la base de données
    return {"message": "Triangle supprimé avec succès"}

@router.get("/{triangle_id}/export")
async def export_triangle(triangle_id: str, format: str = "excel"):
    """
    Exporter un triangle
    """
    # TODO: Générer le fichier d'export
    return {"message": f"Export {format} généré pour le triangle {triangle_id}"}