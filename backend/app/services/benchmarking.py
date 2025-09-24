from fastapi import APIRouter

router = APIRouter(prefix="/benchmarking", tags=["benchmarking"])

@router.get("/methods")
def list_methods():
    return {"methods": ["chain_ladder", "bornhuetter_ferguson", "mack", "cape_cod", "glm"]}
