from app.models.triangle import Triangle

class BusinessValidationError(Exception):
    pass

def ensure_triangle_ready(tri: Triangle) -> None:
    if not tri:
        raise BusinessValidationError("Triangle is missing")
    # Exemple de validations minimales
    if not tri.n_rows or not tri.n_cols:
        raise BusinessValidationError("Triangle shape is invalid")
    if tri.triangles_ready is False:
        raise BusinessValidationError("Triangle not processed yet")
