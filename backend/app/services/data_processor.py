from typing import Any, Dict
import numpy as np
from app.models.triangle import Triangle

def to_ndarray(tri: Triangle) -> np.ndarray:
    # Adaptez selon votre stockage. Exemple si `tri.data` est du JSON {matrix: [[...],[...],...]}
    m = tri.data.get("matrix")
    return np.array(m, dtype=float)
