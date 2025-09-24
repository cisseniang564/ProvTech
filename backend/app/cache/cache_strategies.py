import json
import hashlib
from typing import Any, Dict, Optional

from .redis_client import get_redis, CACHE_ENABLED

def _key(triangle_id: str, method: str, params: Dict[str, Any]) -> str:
    blob = json.dumps({"triangle_id": triangle_id, "method": method, "params": params}, sort_keys=True, ensure_ascii=False)
    return "calc:" + hashlib.sha256(blob.encode("utf-8")).hexdigest()

def cached_result(triangle_id: str, method: str, params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not CACHE_ENABLED:
        return None
    r = get_redis()
    if not r:
        return None
    v = r.get(_key(triangle_id, method, params))
    return json.loads(v) if v else None

def cache_result_if_enabled(triangle_id: str, method: str, params: Dict[str, Any], result: Dict[str, Any], ttl_seconds: int = 3600) -> None:
    if not CACHE_ENABLED:
        return
    r = get_redis()
    if not r:
        return
    r.setex(_key(triangle_id, method, params), ttl_seconds, json.dumps(result))
