from datetime import datetime
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session

def audit_log(db: Session, action: str, entity_id: Optional[str], meta: Optional[Dict[str, Any]] = None):
    # Si vous avez une table audit, insérez ici. À défaut, no-op.
    # Exemple:
    # db.add(Audit(action=action, entity_id=entity_id, meta=meta, created_at=datetime.utcnow()))
    # db.commit()
    return
