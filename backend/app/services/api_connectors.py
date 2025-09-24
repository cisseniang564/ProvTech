# backend/app/services/api_connectors.py - Service d'Intégration APIs Actuarielles (DEV MODE + full providers + fallbacks)
import os
import re
import asyncio
import httpx
import pandas as pd
from io import StringIO
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta, date
from dataclasses import dataclass
from enum import Enum
import json
import logging
from pydantic import BaseModel, Field
from fastapi import HTTPException
import numpy as np
import random

logger = logging.getLogger(__name__)

# ===== CONFIGURATION ET TYPES =====

class APIProvider(str, Enum):
    """Fournisseurs d'APIs actuarielles supportés"""
    WILLIS_TOWERS_WATSON = "willis_towers_watson"
    MILLIMAN = "milliman"
    AON = "aon"
    MOODY_ANALYTICS = "moody_analytics"
    SAS = "sas"
    EIOPA = "eiopa"  # European Insurance and Occupational Pensions Authority
    NAIC = "naic"    # National Association of Insurance Commissioners
    CUSTOM = "custom"

class DataType(str, Enum):
    """Types de données actuarielles"""
    LOSS_TRIANGLES = "loss_triangles"
    MORTALITY_TABLES = "mortality_tables"
    INTEREST_RATES = "interest_rates"
    ECONOMIC_SCENARIOS = "economic_scenarios"
    REGULATORY_DATA = "regulatory_data"
    MARKET_DATA = "market_data"
    CLAIMS_DATA = "claims_data"
    PREMIUM_DATA = "premium_data"

@dataclass
class APIConfiguration:
    """Configuration d'une API externe"""
    provider: APIProvider
    name: str
    base_url: str
    api_key: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    headers: Dict[str, str] = None
    timeout: int = 30
    rate_limit: int = 100  # requêtes par minute
    retry_count: int = 3
    cache_ttl: int = 3600  # en secondes
    enabled: bool = True

@dataclass
class APIEndpoint:
    """Endpoint spécifique d'une API"""
    path: str
    method: str = "GET"
    data_type: DataType = DataType.LOSS_TRIANGLES
    params: Dict[str, Any] = None
    response_format: str = "json"  # json, csv, xml
    transform_function: Optional[str] = None

class APIResponseModel(BaseModel):
    """Modèle de réponse normalisée"""
    provider: APIProvider
    data_type: DataType
    timestamp: datetime
    data: Any
    metadata: Dict[str, Any] = {}
    raw_response: Optional[Dict] = None

# ===== SERVICE PRINCIPAL =====

class ActuarialAPIService:
    """Service principal pour la gestion des APIs actuarielles"""
    
    def __init__(self):
        # DEV MODE activé par défaut en local
        self.dev_mode: bool = str(os.getenv("ACTUARIAL_API_DEV_MODE", "true")).lower() in ("1", "true", "yes", "on")
        self.configurations: Dict[APIProvider, APIConfiguration] = {}
        self.endpoints: Dict[APIProvider, List[APIEndpoint]] = {}
        self.cache: Dict[str, Any] = {}
        self.rate_limiters: Dict[APIProvider, List[datetime]] = {}
        self._load_default_configurations()
    
    def _load_default_configurations(self):
        """Charge les configurations par défaut des APIs populaires"""
        # Enregistre TOUS les providers avec des URLs placeholders (en DEV, on ne les appelle pas)
        self.register_api(APIConfiguration(
            provider=APIProvider.EIOPA,
            name="EIOPA Regulatory Data",
            base_url="https://webgate.ec.europa.eu/eiopa/api/v1",
            headers={"Accept": "application/json"},
            timeout=60
        ))
        self.register_api(APIConfiguration(
            provider=APIProvider.WILLIS_TOWERS_WATSON,
            name="WTW Actuarial APIs",
            base_url="https://api.willistowerswatson.com/actuarial/v2",
            timeout=45
        ))
        self.register_api(APIConfiguration(
            provider=APIProvider.MILLIMAN,
            name="Milliman Actuarial Intelligence",
            base_url="https://api.milliman.com/actuarial/v1",
            timeout=30
        ))
        self.register_api(APIConfiguration(
            provider=APIProvider.SAS,
            name="SAS Risk Management",
            base_url="https://api.sas.com/risk/actuarial/v1",
            timeout=45
        ))
        self.register_api(APIConfiguration(
            provider=APIProvider.AON,
            name="AON Actuarial Services",
            base_url="https://api.aon.com/actuarial/v1",
            timeout=45
        ))
        self.register_api(APIConfiguration(
            provider=APIProvider.MOODY_ANALYTICS,
            name="Moody's Analytics Risk",
            base_url="https://api.moodysanalytics.com/risk/v1",
            timeout=45
        ))
        self.register_api(APIConfiguration(
            provider=APIProvider.NAIC,
            name="NAIC Data",
            base_url="https://api.naic.org/data/v1",
            timeout=45
        ))
        self.register_api(APIConfiguration(
            provider=APIProvider.CUSTOM,
            name="Custom Provider",
            base_url="https://custom.example.com/api/v1",
            timeout=45
        ))
        
        self._register_default_endpoints()
    
    def _attach_generic_endpoints(self, provider: APIProvider):
        """Attache des endpoints génériques couvrant tous les DataType usuels"""
        if provider not in self.endpoints:
            self.endpoints[provider] = []
        eps = self.endpoints[provider]

        def add(ep: APIEndpoint):
            eps.append(ep)

        # Triangles – period en query (optionnel)
        add(APIEndpoint(
            path="/triangles/{lob}",
            data_type=DataType.LOSS_TRIANGLES,
            params={"period": "{period}"}
        ))
        # Mortalité
        add(APIEndpoint(
            path="/mortality-tables/{country}/{table}",
            data_type=DataType.MORTALITY_TABLES,
            params={"country": "{country}", "tableType": "{table}"}
        ))
        # Taux – générique
        add(APIEndpoint(
            path="/interest-rates",
            data_type=DataType.INTEREST_RATES,
            params={"currency": "{currency}", "date": "{date}"}
        ))
        # Scénarios éco
        add(APIEndpoint(
            path="/economic-scenarios/{model}",
            data_type=DataType.ECONOMIC_SCENARIOS,
            params={"model": "{model}", "scenarios": "{count}"}
        ))
        # Données réglementaires génériques
        add(APIEndpoint(
            path="/regulatory",
            data_type=DataType.REGULATORY_DATA,
            params={"country": "{country}", "date": "{date}"}
        ))
        # Marché, sinistres, primes – stubs génériques
        add(APIEndpoint(
            path="/market-data",
            data_type=DataType.MARKET_DATA,
            params={"symbol": "{symbol}"}
        ))
        add(APIEndpoint(
            path="/claims",
            data_type=DataType.CLAIMS_DATA,
            params={"lob": "{lob}", "from": "{from}", "to": "{to}"}
        ))
        add(APIEndpoint(
            path="/premiums",
            data_type=DataType.PREMIUM_DATA,
            params={"lob": "{lob}", "period": "{period}"}
        ))

    def _register_default_endpoints(self):
        """Enregistre les endpoints par défaut"""
        # Spécifiques EIOPA
        self.endpoints[APIProvider.EIOPA] = [
            APIEndpoint(
                path="/solvency2/sct",
                data_type=DataType.REGULATORY_DATA,
                params={"reportingDate": "{date}", "countryCode": "{country}"}
            ),
            APIEndpoint(
                path="/qrt/templates",
                data_type=DataType.REGULATORY_DATA,
                params={"templateId": "{template}", "period": "{period}"}
            ),
            APIEndpoint(
                path="/interest-rates/term-structure",
                data_type=DataType.INTEREST_RATES,
                params={"currency": "{currency}", "date": "{date}"}
            ),
        ]
        # Ajoute aussi les génériques à EIOPA (pour triangles etc.)
        self._attach_generic_endpoints(APIProvider.EIOPA)

        # Tous les autres providers → endpoints génériques
        for prov in [
            APIProvider.WILLIS_TOWERS_WATSON,
            APIProvider.MILLIMAN,
            APIProvider.SAS,
            APIProvider.AON,
            APIProvider.MOODY_ANALYTICS,
            APIProvider.NAIC,
            APIProvider.CUSTOM,
        ]:
            self._attach_generic_endpoints(prov)
    
    def register_api(self, config: APIConfiguration):
        """Enregistre une config (écrase si elle existe)"""
        self.configurations[config.provider] = config
        logger.info(f"API {config.name} enregistrée pour le fournisseur {config.provider}")
    
    def register_endpoint(self, provider: APIProvider, endpoint: APIEndpoint):
        """Enregistre un nouvel endpoint"""
        if provider not in self.endpoints:
            self.endpoints[provider] = []
        self.endpoints[provider].append(endpoint)

    # ===== Helpers =====

    def _format_url_optional(self, base_url: str, path: str, params: Dict[str, Any]) -> str:
        """
        Remplace les {placeholders} présents si la clé existe ; sinon, supprime le segment.
        Gère aussi les segments mixtes.
        """
        segments = [seg for seg in path.strip("/").split("/") if seg != ""]
        out_segments: List[str] = []

        for seg in segments:
            m = re.fullmatch(r"\{([a-zA-Z0-9_]+)\}", seg)
            if m:
                key = m.group(1)
                val = params.get(key)
                if val not in (None, ""):
                    out_segments.append(str(val))
                continue

            placeholders = re.findall(r"\{([a-zA-Z0-9_]+)\}", seg)
            if placeholders:
                seg_fmt = seg
                ok = True
                for key in placeholders:
                    if key in params and params[key] not in (None, ""):
                        seg_fmt = seg_fmt.replace("{%s}" % key, str(params[key]))
                    else:
                        ok = False
                        break
                if ok:
                    out_segments.append(seg_fmt)
            else:
                out_segments.append(seg)

        return base_url.rstrip("/") + "/" + "/".join(out_segments)

    # ===== Données factices (DEV MODE) =====

    def _dev_fake_response(self, data_type: DataType, params: Dict[str, Any]) -> Any:
        """Données factices cohérentes pour TOUS les DataType"""
        if data_type == DataType.LOSS_TRIANGLES:
            size = 10
            base = random.uniform(8000, 12000)
            triangle = []
            for i in range(size):
                row = []
                remaining = base * (1 - i*0.05)
                for j in range(size):
                    if j > i:
                        row.append(0.0)
                    else:
                        val = max(0.0, remaining * (0.6**j) * random.uniform(0.9, 1.1))
                        row.append(round(val, 2))
                triangle.append(row)
            return {
                "triangle": triangle,
                "currency": "EUR",
                "line_of_business": params.get("lob", "unknown"),
                "period": params.get("period"),
                "source": "dev_mode"
            }

        if data_type == DataType.INTEREST_RATES:
            cur = params.get("currency", "EUR")
            the_date = params.get("date") or date.today().isoformat()
            return {
                "currency": cur,
                "date": the_date,
                "term_structure": [{"maturity_years": n, "rate": round(0.01 + 0.0015*n + random.uniform(-0.0004, 0.0004), 6)} for n in range(1, 31)]
            }

        if data_type == DataType.REGULATORY_DATA:
            return {
                "country": params.get("country", "FR"),
                "reporting_date": params.get("date") or date.today().isoformat(),
                "dataset": "EIOPA_DEV_FAKE",
                "records": 1234,
                "items": [{"template": "S.06.02", "count": 250}, {"template": "S.17.01", "count": 340}]
            }

        if data_type == DataType.MORTALITY_TABLES:
            country = params.get("country", "FR")
            table_type = params.get("tableType", "standard")
            year = datetime.utcnow().year
            # qx croissant avec l'âge (valeurs artificielles)
            rows = [{"age": a, "qx": round(min(0.999999, 0.0003 * (1.08 ** a)), 6)} for a in range(0, 121)]
            return {"country": country, "table_type": table_type, "year": year, "mortality_rates": rows}

        if data_type == DataType.ECONOMIC_SCENARIOS:
            model = params.get("model", "ESG_DEV")
            count = int(params.get("count", 100))
            horizons = [1, 3, 5, 10]
            scenarios = []
            for s in range(count):
                scenarios.append({
                    "id": f"{model}_{s+1}",
                    "inflation": [round(random.gauss(0.02, 0.005), 4) for _ in horizons],
                    "gdp_growth": [round(random.gauss(0.015, 0.01), 4) for _ in horizons],
                    "equity_return": [round(random.gauss(0.06, 0.15), 4) for _ in horizons]
                })
            return {"model": model, "horizons_years": horizons, "scenarios": scenarios}

        if data_type == DataType.MARKET_DATA:
            symbol = params.get("symbol") or "INDEX_EQUITY_DEV"
            base_price = random.uniform(90, 110)
            series = [{"date": (date.today() - timedelta(days=i)).isoformat(), "close": round(base_price * (1 + random.uniform(-0.02, 0.02)), 2)} for i in range(30)]
            return {"symbol": symbol, "series": list(reversed(series))}

        if data_type == DataType.CLAIMS_DATA:
            lob = params.get("lob", "auto")
            start = params.get("from") or (date.today() - timedelta(days=365)).isoformat()
            end = params.get("to") or date.today().isoformat()
            statuses = ["open", "closed", "reopened"]
            claims = []
            for i in range(200):
                loss_dt = (date.today() - timedelta(days=random.randint(0, 400))).isoformat()
                claims.append({
                    "claim_id": f"CLM{100000+i}",
                    "lob": lob,
                    "loss_date": loss_dt,
                    "reported_date": loss_dt,
                    "paid": round(random.uniform(0, 50000), 2),
                    "case_reserve": round(random.uniform(0, 70000), 2),
                    "status": random.choice(statuses)
                })
            return {"from": start, "to": end, "lob": lob, "claims": claims}

        if data_type == DataType.PREMIUM_DATA:
            lob = params.get("lob", "property")
            period = params.get("period", f"{datetime.utcnow().year}")
            months = [f"{m:02d}" for m in range(1, 13)]
            rows = [{"month": f"{period}-{m}", "written_premium": round(random.uniform(50000, 150000), 2), "earned_premium": round(random.uniform(40000, 130000), 2), "exposure": round(random.uniform(80, 120), 2)} for m in months]
            return {"lob": lob, "period": period, "premiums": rows}

        # fallback générique
        return {"dev": True, "params": params}

    # ===== Opérations =====
    
    async def test_connection(self, provider: APIProvider) -> Dict[str, Any]:
        """Teste la connexion à une API"""
        config = self.configurations.get(provider)
        if not config:
            raise HTTPException(status_code=404, detail=f"Configuration non trouvée pour {provider}")
        
        if self.dev_mode:
            return {
                "provider": provider.value,
                "status": "connected",
                "status_code": 200,
                "response_time": 0.0,
                "timestamp": datetime.utcnow().isoformat(),
                "dev_mode": True
            }
        
        try:
            async with httpx.AsyncClient(timeout=config.timeout) as client:
                for test_url in (config.base_url.rstrip("/"), f"{config.base_url.rstrip('/')}/health"):
                    try:
                        response = await client.get(test_url, headers=self._build_headers(config))
                        return {
                            "provider": provider.value,
                            "status": "connected" if response.status_code < 400 else "error",
                            "status_code": response.status_code,
                            "response_time": getattr(response, "elapsed", None).total_seconds() if getattr(response, "elapsed", None) else None,
                            "timestamp": datetime.utcnow().isoformat()
                        }
                    except Exception:
                        continue
                return {
                    "provider": provider.value,
                    "status": "error",
                    "error": "Aucun endpoint de santé joignable",
                    "timestamp": datetime.utcnow().isoformat()
                }
                
        except Exception as e:
            logger.error(f"Erreur de connexion à {provider}: {str(e)}")
            return {
                "provider": provider.value,
                "status": "error",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
    
    async def fetch_data(
        self, 
        provider: APIProvider, 
        data_type: DataType, 
        params: Dict[str, Any] = None,
        use_cache: bool = True
    ) -> APIResponseModel:
        """Récupère des données depuis une API externe"""
        
        config = self.configurations.get(provider)
        if not config or not config.enabled:
            raise HTTPException(status_code=404, detail=f"API {provider} non disponible")
        
        # Rate limit
        if not self._check_rate_limit(provider):
            raise HTTPException(status_code=429, detail="Rate limit dépassé")
        
        # Cache
        safe_params = (params or {}).copy()
        cache_key = f"{provider.value}:{data_type.value}:{json.dumps(safe_params, sort_keys=True)}"
        if use_cache and cache_key in self.cache:
            cached_data = self.cache[cache_key]
            if datetime.utcnow() - cached_data["timestamp"] < timedelta(seconds=config.cache_ttl):
                return APIResponseModel(**cached_data["response"])
        
        # Endpoint
        endpoints = self.endpoints.get(provider, [])
        endpoint = next((ep for ep in endpoints if ep.data_type == data_type), None)

        # Fallback dynamique en DEV: crée un endpoint stub si absent
        if endpoint is None and self.dev_mode:
            endpoint = APIEndpoint(path=f"/dev/{data_type.value}", data_type=data_type, params={})
            logger.info(f"DEV MODE: endpoint dynamique créé pour {provider.value}:{data_type.value}")

        if not endpoint:
            raise HTTPException(
                status_code=404, 
                detail=f"Endpoint non trouvé pour {data_type} chez {provider}"
            )
        
        try:
            # URL (placeholders optionnels)
            url = self._format_url_optional(config.base_url, endpoint.path, safe_params)
            headers = self._build_headers(config)

            # DEV MODE → court-circuit
            if self.dev_mode:
                response_data = self._dev_fake_response(data_type, safe_params)
            else:
                response_data = await self._execute_request_with_retry(
                    config, endpoint, url, headers, safe_params
                )
            
            # Transformations
            transformed_data = await self._transform_data(
                response_data, endpoint, provider, data_type
            )
            
            # Réponse normalisée
            api_response = APIResponseModel(
                provider=provider,
                data_type=data_type,
                timestamp=datetime.utcnow(),
                data=transformed_data,
                metadata={
                    "source_url": "dev://fake" if self.dev_mode else url,
                    "endpoint_path": endpoint.path,
                    "params_used": safe_params,
                    "dev_mode": self.dev_mode
                },
                raw_response=response_data if len(str(response_data)) < 10000 else None
            )
            
            # Cache
            if use_cache:
                self.cache[cache_key] = {
                    "timestamp": datetime.utcnow(),
                    "response": api_response.dict()
                }
            
            return api_response
            
        except (httpx.RequestError, httpx.HTTPStatusError) as e:
            if self.dev_mode:
                logger.warning(f"DEV MODE fallback après erreur réseau: {e}")
                response_data = self._dev_fake_response(data_type, safe_params)
                transformed_data = await self._transform_data(
                    response_data, endpoint, provider, data_type
                )
                api_response = APIResponseModel(
                    provider=provider,
                    data_type=data_type,
                    timestamp=datetime.utcnow(),
                    data=transformed_data,
                    metadata={
                        "source_url": "dev://fake",
                        "endpoint_path": endpoint.path,
                        "params_used": safe_params,
                        "dev_mode": True
                    },
                    raw_response=response_data
                )
                if use_cache:
                    self.cache[cache_key] = {"timestamp": datetime.utcnow(), "response": api_response.dict()}
                return api_response
            logger.error(f"Erreur réseau: {e}")
            raise HTTPException(status_code=500, detail=f"Erreur API: {str(e)}")
        except Exception as e:
            logger.error(f"Erreur lors de la récupération de données {data_type} depuis {provider}: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Erreur API: {str(e)}")
    
    async def _execute_request_with_retry(
        self, 
        config: APIConfiguration, 
        endpoint: APIEndpoint, 
        url: str, 
        headers: Dict[str, str], 
        params: Dict[str, Any]
    ) -> Any:
        """Exécute une requête avec retry automatique"""
        last_error = None
        
        for attempt in range(config.retry_count):
            try:
                async with httpx.AsyncClient(timeout=config.timeout) as client:
                    if endpoint.method.upper() == "GET":
                        response = await client.get(url, headers=headers, params=params)
                    elif endpoint.method.upper() == "POST":
                        response = await client.post(url, headers=headers, json=params)
                    else:
                        raise ValueError(f"Méthode HTTP non supportée: {endpoint.method}")
                    
                    response.raise_for_status()
                    
                    if endpoint.response_format == "json":
                        return response.json()
                    elif endpoint.response_format in ("csv", "xml"):
                        return response.text
                    else:
                        return response.json()
                        
            except Exception as e:
                last_error = e
                if attempt < config.retry_count - 1:
                    await asyncio.sleep(2 ** attempt)  # Backoff exponentiel
                    continue
                break
        
        raise last_error
    
    async def _transform_data(
        self, 
        raw_data: Any, 
        endpoint: APIEndpoint, 
        provider: APIProvider, 
        data_type: DataType
    ) -> Any:
        """Transforme les données selon le type et le fournisseur"""
        if endpoint.transform_function:
            transform_func = getattr(self, endpoint.transform_function, None)
            if transform_func:
                return await transform_func(raw_data, provider)
        
        if data_type == DataType.LOSS_TRIANGLES:
            return self._transform_loss_triangles(raw_data, provider)
        elif data_type == DataType.MORTALITY_TABLES:
            return self._transform_mortality_tables(raw_data, provider)
        elif data_type == DataType.INTEREST_RATES:
            return self._transform_interest_rates(raw_data, provider)
        elif data_type == DataType.REGULATORY_DATA:
            return self._transform_regulatory_data(raw_data, provider)
        else:
            return raw_data  # autres types: déjà au bon format ou factices
    
    def _transform_loss_triangles(self, raw_data: Any, provider: APIProvider) -> Dict[str, Any]:
        """Transforme les données de triangles de développement"""
        if provider == APIProvider.EIOPA:
            if isinstance(raw_data, list) and raw_data:
                triangle_data = []
                for row in raw_data:
                    triangle_data.append([float(row.get(f"dev_{i}", 0)) for i in range(10)])
                return {
                    "triangle": triangle_data,
                    "currency": raw_data[0].get("currency", "EUR"),
                    "line_of_business": raw_data[0].get("lob", "unknown"),
                    "reporting_date": raw_data[0].get("reporting_date")
                }
        try:
            if isinstance(raw_data, str):  # CSV
                df = pd.read_csv(StringIO(raw_data))
                triangle = df.select_dtypes(include=[np.number]).values.tolist()
            elif isinstance(raw_data, dict) and "triangle" in raw_data:
                triangle = raw_data["triangle"]
            elif isinstance(raw_data, list):
                triangle = raw_data
            else:
                triangle = [[]]
            return {
                "triangle": triangle,
                "currency": "EUR",
                "line_of_business": raw_data.get("line_of_business", "unknown") if isinstance(raw_data, dict) else "unknown",
                "source": provider.value
            }
        except Exception as e:
            logger.warning(f"Erreur transformation triangle {provider}: {e}")
            return {"triangle": [[]], "error": str(e)}
    
    def _transform_mortality_tables(self, raw_data: Any, provider: APIProvider) -> Dict[str, Any]:
        """Transforme les tables de mortalité"""
        try:
            if isinstance(raw_data, dict) and "mortality_rates" in raw_data:
                return raw_data
            if isinstance(raw_data, list):
                return {"mortality_rates": raw_data, "table_type": "standard", "country": "FR", "year": datetime.now().year}
            return raw_data
        except Exception as e:
            return {"mortality_rates": [], "error": str(e)}
    
    def _transform_interest_rates(self, raw_data: Any, provider: APIProvider) -> Dict[str, Any]:
        """Transforme les courbes de taux"""
        try:
            if isinstance(raw_data, dict) and "term_structure" in raw_data:
                return raw_data
            if isinstance(raw_data, list):
                return {"term_structure": raw_data, "currency": "EUR", "date": datetime.now().isoformat(), "source": provider.value}
            return raw_data
        except Exception as e:
            return {"term_structure": [], "error": str(e)}
    
    def _transform_regulatory_data(self, raw_data: Any, provider: APIProvider) -> Dict[str, Any]:
        """Transforme les données réglementaires"""
        return raw_data
    
    def _build_headers(self, config: APIConfiguration) -> Dict[str, str]:
        """Construit les headers pour l'authentification"""
        headers = config.headers.copy() if config.headers else {}
        if config.api_key:
            headers["Authorization"] = f"Bearer {config.api_key}"
        elif config.username and config.password:
            import base64
            credentials = base64.b64encode(f"{config.username}:{config.password}".encode()).decode()
            headers["Authorization"] = f"Basic {credentials}"
        headers.setdefault("User-Agent", "ProvTech-Actuarial-Platform/1.0")
        headers.setdefault("Accept", "application/json")
        return headers
    
    def _check_rate_limit(self, provider: APIProvider) -> bool:
        """Vérifie le rate limiting"""
        config = self.configurations.get(provider)
        if not config:
            return False
        
        now = datetime.utcnow()
        if provider not in self.rate_limiters:
            self.rate_limiters[provider] = []
        
        self.rate_limiters[provider] = [t for t in self.rate_limiters[provider] if now - t < timedelta(minutes=1)]
        if len(self.rate_limiters[provider]) >= config.rate_limit:
            return False
        self.rate_limiters[provider].append(now)
        return True
    
    async def get_available_endpoints(self, provider: APIProvider) -> List[Dict[str, Any]]:
        """Retourne la liste des endpoints disponibles"""
        endpoints = self.endpoints.get(provider, [])
        return [
            {
                "path": ep.path,
                "method": ep.method,
                "data_type": ep.data_type.value,
                "response_format": ep.response_format,
                "params": ep.params
            }
            for ep in endpoints
        ]
    
    async def get_api_status(self) -> Dict[str, Any]:
        """Retourne le statut de toutes les APIs"""
        status: Dict[str, Any] = {}
        for provider, config in self.configurations.items():
            try:
                connection_test = await self.test_connection(provider)
                status[provider.value] = {
                    "name": config.name,
                    "enabled": config.enabled,
                    "status": connection_test.get("status", "unknown"),
                    "endpoints_count": len(self.endpoints.get(provider, [])),
                    "cache_entries": len([k for k in self.cache.keys() if k.startswith(f"{provider.value}:")]),
                    "last_test": connection_test.get("timestamp")
                }
            except Exception as e:
                status[provider.value] = {
                    "name": config.name,
                    "enabled": config.enabled,
                    "status": "error",
                    "error": str(e)
                }
        return status
    
    def clear_cache(self, provider: Optional[APIProvider] = None):
        """Vide le cache (pour un fournisseur spécifique ou tous)"""
        if provider:
            keys_to_remove = [k for k in self.cache.keys() if k.startswith(f"{provider.value}:")]
            for key in keys_to_remove:
                del self.cache[key]
        else:
            self.cache.clear()

# ===== INSTANCE GLOBALE =====
actuarial_api_service = ActuarialAPIService()

# ===== FONCTIONS UTILITAIRES =====

async def fetch_loss_triangles_from_api(
    provider: APIProvider, 
    line_of_business: str, 
    period: Optional[str] = None
) -> Dict[str, Any]:
    """Fonction utilitaire pour récupérer des triangles depuis une API"""
    params: Dict[str, Any] = {"lob": line_of_business}
    if period:
        params["period"] = period
    
    response = await actuarial_api_service.fetch_data(
        provider=provider,
        data_type=DataType.LOSS_TRIANGLES,
        params=params
    )
    return response.data

async def fetch_regulatory_data(
    provider: APIProvider = APIProvider.EIOPA,
    country: str = "FR",
    reporting_date: Optional[str] = None
) -> Dict[str, Any]:
    """Fonction utilitaire pour récupérer des données réglementaires"""
    params: Dict[str, Any] = {"country": country}
    if reporting_date:
        params["date"] = reporting_date
    
    response = await actuarial_api_service.fetch_data(
        provider=provider,
        data_type=DataType.REGULATORY_DATA,
        params=params
    )
    return response.data

# ===== MODÈLES PYDANTIC POUR L'API =====

class APIConfigurationRequest(BaseModel):
    """Modèle pour la configuration d'une API"""
    provider: APIProvider
    name: str
    base_url: str
    api_key: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    headers: Optional[Dict[str, str]] = None
    timeout: int = Field(default=30, ge=1, le=300)
    rate_limit: int = Field(default=100, ge=1, le=1000)
    enabled: bool = True

class DataFetchRequest(BaseModel):
    """Modèle pour une requête de données"""
    provider: APIProvider
    data_type: DataType
    params: Optional[Dict[str, Any]] = {}
    use_cache: bool = True

class EndpointRequest(BaseModel):
    """Modèle pour l'ajout d'un endpoint"""
    provider: APIProvider
    path: str
    method: str = "GET"
    data_type: DataType
    params: Optional[Dict[str, Any]] = None
    response_format: str = "json"
    transform_function: Optional[str] = None
