# app/routers/__init__.py
from .triangles_simple import router as triangles_router
from .calculations_simple import router as calculations_router

ROUTERS = [
    (triangles_router, "/api/v1/triangles", ["triangles"]),
    (calculations_router, "/api/v1/calculations", ["calculations"]),
]

