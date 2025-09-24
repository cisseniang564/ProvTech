"""
Seeds - Données de test pour peupler la base de données
database/seeds/seed_data.py
"""

import json
import random
import numpy as np
from datetime import datetime, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from faker import Faker
import bcrypt

# Import des modèles (à adapter selon votre structure)
from app.models.user import User
from app.models.triangle import Triangle
from app.models.calculation import Calculation
from app.core.config import settings

fake = Faker('fr_FR')

# Configuration de la base de données
engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# ============================================================================
# DONNÉES DE BASE
# ============================================================================

def hash_password(password: str) -> str:
    """Hacher un mot de passe"""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def generate_triangle_data(size: int = 10, triangle_type: str = "paid") -> dict:
    """
    Générer des données de triangle réalistes
    """
    np.random.seed(random.randint(1, 10000))
    
    # Générer la matrice du triangle
    triangle = []
    for i in range(size):
        row = []
        for j in range(size):
            if j <= size - i - 1:
                if j == 0:
                    # Première colonne : montants initiaux
                    value = random.uniform(500000, 2000000)
                else:
                    # Développement avec facteurs décroissants
                    if row and row[-1]:
                        factor = 1.0 + np.exp(-j * 0.3) * random.uniform(0.05, 0.3)
                        value = row[-1] * factor
                    else:
                        value = random.uniform(100000, 500000)
                row.append(round(value, 2))
            else:
                row.append(None)
        triangle.append(row)
    
    # Années d'accident et périodes de développement
    current_year = 2024
    accident_years = list(range(current_year - size + 1, current_year + 1))
    development_periods = list(range(1, size + 1))
    
    # Primes pour Bornhuetter-Ferguson
    premiums = [random.uniform(1000000, 3000000) for _ in range(size)]
    
    # Exposition
    exposure = [random.uniform(0.8, 1.2) * 1000000 for _ in range(size)]
    
    return {
        "values": triangle,
        "accident_years": accident_years,
        "development_periods": development_periods,
        "premiums": premiums,
        "exposure": exposure
    }

def generate_calculation_results(triangle_data: dict, method: str) -> dict:
    """
    Générer des résultats de calcul réalistes
    """
    size = len(triangle_data["values"])
    
    # Calculer les ultimates et réserves
    ultimate_claims = []
    reserves = []
    
    for i, row in enumerate(triangle_data["values"]):
        # Dernière valeur connue
        last_known = next((v for v in reversed(row) if v is not None), 0)
        
        # Estimer l'ultimate
        remaining_dev = size - i - 1
        if remaining_dev > 0:
            # Appliquer des facteurs de développement
            ultimate = last_known * (1 + random.uniform(0.05, 0.2) * remaining_dev)
        else:
            ultimate = last_known
        
        ultimate_claims.append(round(ultimate, 2))
        reserves.append(round(ultimate - last_known, 2))
    
    # Facteurs de développement
    development_factors = [round(1 + random.uniform(0.01, 0.3) * np.exp(-i * 0.5), 4) 
                          for i in range(size - 1)]
    
    # Intervalles de confiance
    reserves_lower = [round(r * 0.85, 2) for r in reserves]
    reserves_upper = [round(r * 1.15, 2) for r in reserves]
    
    results = {
        "ultimate_claims": ultimate_claims,
        "reserves": reserves,
        "development_factors": development_factors,
        "reserves_lower": reserves_lower,
        "reserves_upper": reserves_upper,
        "confidence_level": 0.95,
        "total_reserves": sum(reserves),
        "mse": round(random.uniform(0.02, 0.08), 4),
        "mae": round(random.uniform(0.01, 0.05), 4),
        "r_squared": round(random.uniform(0.85, 0.98), 4),
        "calculation_time": round(random.uniform(0.5, 5.0), 3)
    }
    
    # Ajouter des spécificités selon la méthode
    if method == "bornhuetter_ferguson":
        results["expected_loss_ratio"] = round(random.uniform(0.65, 0.85), 3)
        results["credibility_weights"] = [round(random.uniform(0.3, 0.9), 3) for _ in range(size)]
    elif method == "mack":
        results["process_variance"] = round(random.uniform(0.01, 0.05), 4)
        results["parameter_variance"] = round(random.uniform(0.01, 0.05), 4)
    elif method == "bootstrap":
        results["n_simulations"] = 1000
        results["percentiles"] = {
            "p5": [round(r * 0.75, 2) for r in reserves],
            "p50": reserves,
            "p95": [round(r * 1.25, 2) for r in reserves]
        }
    
    return results

# ============================================================================
# SEED USERS
# ============================================================================

def seed_users(db):
    """Créer les utilisateurs de test"""
    print("🌱 Seeding users...")
    
    users_data = [
        {
            "email": "admin@provtech.com",
            "username": "admin",
            "password": "Admin123!",
            "full_name": "Administrateur Système",
            "role": "admin",
            "company": "ProvTech SaaS",
            "department": "IT",
            "quota_triangles": 1000,
            "quota_calculations": 10000
        },
        {
            "email": "marie.actuaire@assuranceco.fr",
            "username": "marie_actuaire",
            "password": "Actuaire123!",
            "full_name": "Marie Dubois",
            "role": "actuary",
            "company": "AssuranceCo",
            "department": "Actuariat",
            "quota_triangles": 100,
            "quota_calculations": 1000
        },
        {
            "email": "jean.analyst@assuranceco.fr",
            "username": "jean_analyst",
            "password": "Analyst123!",
            "full_name": "Jean Martin",
            "role": "analyst",
            "company": "AssuranceCo",
            "department": "Analyse Risques",
            "quota_triangles": 50,
            "quota_calculations": 500
        },
        {
            "email": "sophie.viewer@clientco.fr",
            "username": "sophie_viewer",
            "password": "Viewer123!",
            "full_name": "Sophie Laurent",
            "role": "viewer",
            "company": "ClientCo",
            "department": "Finance",
            "quota_triangles": 10,
            "quota_calculations": 100
        },
        {
            "email": "paul.auditeur@auditfirm.fr",
            "username": "paul_auditeur",
            "password": "Auditor123!",
            "full_name": "Paul Moreau",
            "role": "auditor",
            "company": "AuditFirm",
            "department": "Audit Externe",
            "quota_triangles": 20,
            "quota_calculations": 200
        }
    ]
    
    users = []
    for user_data in users_data:
        # Vérifier si l'utilisateur existe déjà
        existing = db.query(User).filter(User.email == user_data["email"]).first()
        if not existing:
            user = User(
                email=user_data["email"],
                username=user_data["username"],
                hashed_password=hash_password(user_data["password"]),
                full_name=user_data["full_name"],
                role=user_data["role"],
                company=user_data["company"],
                department=user_data["department"],
                quota_triangles=user_data["quota_triangles"],
                quota_calculations=user_data["quota_calculations"],
                is_active=True,
                is_verified=True,
                created_at=datetime.utcnow() - timedelta(days=random.randint(30, 365))
            )
            db.add(user)
            users.append(user)
            print(f"  ✅ Créé: {user.username} ({user.role})")
    
    db.commit()
    return users

# ============================================================================
# SEED TRIANGLES
# ============================================================================

def seed_triangles(db, users):
    """Créer les triangles de test"""
    print("🌱 Seeding triangles...")
    
    triangle_configs = [
        {
            "name": "Auto RC - Sinistres Payés 2024",
            "description": "Triangle de développement des sinistres payés pour l'automobile RC",
            "triangle_type": "paid",
            "insurance_line": "auto_liability",
            "currency": "EUR",
            "size": 10
        },
        {
            "name": "Auto Dommages - Sinistres Survenus 2024",
            "description": "Triangle des sinistres survenus pour l'automobile dommages",
            "triangle_type": "incurred",
            "insurance_line": "auto_physical",
            "currency": "EUR",
            "size": 8
        },
        {
            "name": "Dommages aux Biens - Fréquence",
            "description": "Triangle de fréquence pour les dommages aux biens",
            "triangle_type": "frequency",
            "insurance_line": "property",
            "currency": "EUR",
            "size": 12
        },
        {
            "name": "RC Professionnelle - IBNR",
            "description": "Estimation IBNR pour la responsabilité professionnelle",
            "triangle_type": "ibnr",
            "insurance_line": "professional_liability",
            "currency": "EUR",
            "size": 15
        },
        {
            "name": "Accidents du Travail - Sinistres Payés",
            "description": "Triangle des sinistres payés pour les accidents du travail",
            "triangle_type": "paid",
            "insurance_line": "workers_comp",
            "currency": "EUR",
            "size": 10
        },
        {
            "name": "Marine - Sinistres Survenus USD",
            "description": "Triangle en USD pour l'assurance maritime",
            "triangle_type": "incurred",
            "insurance_line": "marine",
            "currency": "USD",
            "size": 7
        }
    ]
    
    triangles = []
    
    # Assigner les triangles aux utilisateurs (sauf viewer)
    actuary = next((u for u in users if u.role == "actuary"), None)
    analyst = next((u for u in users if u.role == "analyst"), None)
    
    for i, config in enumerate(triangle_configs):
        # Alterner entre actuaire et analyste
        user = actuary if i % 2 == 0 else analyst
        if not user:
            user = users[0]  # Admin par défaut
        
        # Générer les données du triangle
        triangle_data = generate_triangle_data(config["size"], config["triangle_type"])
        
        # Calculer les statistiques
        values_array = np.array(triangle_data["values"])
        total = np.nansum(np.where(values_array == None, np.nan, values_array))
        
        metadata = {
            "source": "import",
            "import_file": f"triangle_{config['insurance_line']}_2024.csv",
            "statistics": {
                "size": config["size"],
                "total": float(total),
                "completeness": 0.85 + random.uniform(0, 0.15),
                "cv": random.uniform(0.05, 0.25)
            },
            "validation": {
                "valid": True,
                "validated_at": datetime.utcnow().isoformat(),
                "warnings": []
            },
            "tags": [config["insurance_line"], "2024", "Q4"]
        }
        
        triangle = Triangle(
            name=config["name"],
            description=config["description"],
            triangle_type=config["triangle_type"],
            insurance_line=config["insurance_line"],
            currency=config["currency"],
            unit="thousands",
            user_id=user.id,
            data=json.dumps(triangle_data),
            metadata=json.dumps(metadata),
            is_locked=False,
            version=1,
            created_at=datetime.utcnow() - timedelta(days=random.randint(1, 60))
        )
        
        db.add(triangle)
        triangles.append(triangle)
        print(f"  ✅ Créé: {triangle.name} (user: {user.username})")
    
    db.commit()
    return triangles

# ============================================================================
# SEED CALCULATIONS
# ============================================================================

def seed_calculations(db, triangles, users):
    """Créer les calculs de test"""
    print("🌱 Seeding calculations...")
    
    methods = [
        "chain_ladder",
        "bornhuetter_ferguson",
        "mack",
        "cape_cod",
        "bootstrap"
    ]
    
    calculations = []
    
    for triangle in triangles[:4]:  # Créer des calculs pour les 4 premiers triangles
        # 2-3 calculs par triangle
        num_calcs = random.randint(2, 3)
        
        for i in range(num_calcs):
            method = random.choice(methods)
            
            # Paramètres selon la méthode
            parameters = {
                "tail_factor": random.choice(["none", "exponential", "constant"]),
                "confidence_level": 0.95,
                "exclude_outliers": random.choice([True, False])
            }
            
            if method == "bornhuetter_ferguson":
                parameters["expected_loss_ratio"] = round(random.uniform(0.65, 0.85), 3)
            elif method == "bootstrap":
                parameters["n_simulations"] = 1000
                parameters["random_seed"] = 42
            elif method == "mack":
                parameters["include_process_variance"] = True
                parameters["include_parameter_variance"] = True
            
            # Générer les résultats
            triangle_data = json.loads(triangle.data)
            results = generate_calculation_results(triangle_data, method)
            
            # Statut aléatoire (majoritairement complété)
            status = random.choices(
                ["completed", "processing", "failed"],
                weights=[0.8, 0.1, 0.1]
            )[0]
            
            calc_time = random.uniform(500, 5000) if status == "completed" else None
            error_msg = None
            if status == "failed":
                error_msg = random.choice([
                    "Convergence error in development factors",
                    "Insufficient data for calculation",
                    "Memory limit exceeded"
                ])
            
            calculation = Calculation(
                triangle_id=triangle.id,
                user_id=triangle.user_id,
                name=f"{method.replace('_', ' ').title()} - {triangle.name[:20]}",
                description=f"Calcul {method} pour {triangle.name}",
                method=method,
                parameters=json.dumps(parameters),
                status=status,
                progress=100 if status == "completed" else random.randint(0, 80),
                results=json.dumps(results) if status == "completed" else None,
                error_message=error_msg,
                warnings=json.dumps([]) if status == "completed" else None,
                calculation_time_ms=calc_time,
                created_at=triangle.created_at + timedelta(hours=random.randint(1, 48)),
                started_at=triangle.created_at + timedelta(hours=random.randint(1, 48)),
                completed_at=triangle.created_at + timedelta(hours=random.randint(2, 50)) if status == "completed" else None
            )
            
            db.add(calculation)
            calculations.append(calculation)
            print(f"  ✅ Créé: {calculation.name} ({status})")
    
    db.commit()
    return calculations

# ============================================================================
# SEED BENCHMARK DATA
# ============================================================================

def seed_benchmark_data(db):
    """Créer les données de benchmark"""
    print("🌱 Seeding benchmark data...")
    
    insurance_lines = [
        "auto_liability",
        "auto_physical",
        "property",
        "casualty",
        "workers_comp"
    ]
    
    regions = ["Europe", "France", "Germany", "UK", "Spain"]
    
    for line in insurance_lines:
        for region in regions[:3]:  # 3 régions par ligne
            for year in [2023, 2024]:
                for quarter in [1, 2, 3, 4]:
                    if year == 2024 and quarter > 3:  # Pas de données futures
                        continue
                    
                    # Générer des métriques de benchmark
                    size = random.randint(8, 12)
                    metrics = {
                        "average_development_factors": [
                            round(1 + random.uniform(0.01, 0.3) * np.exp(-i * 0.5), 4)
                            for i in range(size)
                        ],
                        "loss_ratios": {
                            "mean": round(random.uniform(0.55, 0.75), 3),
                            "std": round(random.uniform(0.05, 0.15), 3),
                            "p25": round(random.uniform(0.50, 0.60), 3),
                            "p50": round(random.uniform(0.60, 0.70), 3),
                            "p75": round(random.uniform(0.70, 0.80), 3)
                        },
                        "tail_factors": {
                            "exponential": round(random.uniform(1.01, 1.05), 4),
                            "constant": round(random.uniform(1.00, 1.03), 4)
                        },
                        "volatility": {
                            "cv": round(random.uniform(0.05, 0.25), 3),
                            "mse": round(random.uniform(0.02, 0.08), 4)
                        }
                    }
                    
                    # Vérifier si l'entrée existe déjà
                    existing = db.execute(
                        f"""SELECT id FROM benchmark_data 
                        WHERE insurance_line = '{line}' 
                        AND region = '{region}' 
                        AND period_year = {year} 
                        AND period_quarter = {quarter}"""
                    ).first()
                    
                    if not existing:
                        db.execute(
                            """INSERT INTO benchmark_data 
                            (insurance_line, region, period_year, period_quarter, metrics, 
                             source, confidence_level, sample_size, created_at)
                            VALUES (:line, :region, :year, :quarter, :metrics, 
                                    :source, :confidence, :sample, :created)""",
                            {
                                "line": line,
                                "region": region,
                                "year": year,
                                "quarter": quarter,
                                "metrics": json.dumps(metrics),
                                "source": f"Market Study {year}",
                                "confidence": 0.95,
                                "sample": random.randint(50, 200),
                                "created": datetime.utcnow()
                            }
                        )
    
    db.commit()
    print("  ✅ Données de benchmark créées")

# ============================================================================
# SEED NOTIFICATIONS
# ============================================================================

def seed_notifications(db, users):
    """Créer des notifications de test"""
    print("🌱 Seeding notifications...")
    
    notification_templates = [
        {
            "type": "calculation_complete",
            "title": "Calcul terminé",
            "message": "Le calcul Chain Ladder sur votre triangle a été complété avec succès.",
            "priority": "normal"
        },
        {
            "type": "quota_warning",
            "title": "Quota presque atteint",
            "message": "Vous avez utilisé 80% de votre quota mensuel de calculs.",
            "priority": "high"
        },
        {
            "type": "new_feature",
            "title": "Nouvelle fonctionnalité disponible",
            "message": "La méthode Munich Chain Ladder est maintenant disponible.",
            "priority": "low"
        },
        {
            "type": "compliance_reminder",
            "title": "Rappel IFRS 17",
            "message": "N'oubliez pas de soumettre votre rapport trimestriel avant la fin du mois.",
            "priority": "urgent"
        }
    ]
    
    for user in users:
        # 2-4 notifications par utilisateur
        num_notifications = random.randint(2, 4)
        
        for _ in range(num_notifications):
            template = random.choice(notification_templates)
            
            notification_data = {
                "user_id": user.id,
                "type": template["type"],
                "title": template["title"],
                "message": template["message"],
                "priority": template["priority"],
                "is_read": random.choice([True, False]),
                "created_at": datetime.utcnow() - timedelta(days=random.randint(1, 30))
            }
            
            if notification_data["is_read"]:
                notification_data["read_at"] = notification_data["created_at"] + timedelta(hours=random.randint(1, 24))
            
            db.execute(
                """INSERT INTO notifications 
                (user_id, type, title, message, priority, is_read, read_at, created_at)
                VALUES (:user_id, :type, :title, :message, :priority, :is_read, :read_at, :created_at)""",
                notification_data
            )
    
    db.commit()
    print("  ✅ Notifications créées")

# ============================================================================
# MAIN SEEDER
# ============================================================================

def run_seeds():
    """Exécuter tous les seeds"""
    print("\n" + "="*60)
    print("🚀 DÉMARRAGE DU SEEDING DE LA BASE DE DONNÉES")
    print("="*60)
    
    db = SessionLocal()
    
    try:
        # Seed dans l'ordre des dépendances
        users = seed_users(db)
        triangles = seed_triangles(db, users)
        calculations = seed_calculations(db, triangles, users)
        seed_benchmark_data(db)
        seed_notifications(db, users)
        
        print("\n" + "="*60)
        print("✅ SEEDING TERMINÉ AVEC SUCCÈS!")
        print("="*60)
        
        # Afficher les statistiques
        print("\n📊 Statistiques:")
        print(f"  • Utilisateurs créés: {len(users)}")
        print(f"  • Triangles créés: {len(triangles)}")
        print(f"  • Calculs créés: {len(calculations)}")
        print(f"  • Données de benchmark: Oui")
        print(f"  • Notifications: Oui")
        
        print("\n🔑 Comptes de test:")
        print("  Admin: admin@provtech.com / Admin123!")
        print("  Actuaire: marie.actuaire@assuranceco.fr / Actuaire123!")
        print("  Analyste: jean.analyst@assuranceco.fr / Analyst123!")
        print("  Viewer: sophie.viewer@clientco.fr / Viewer123!")
        print("  Auditeur: paul.auditeur@auditfirm.fr / Auditor123!")
        
    except Exception as e:
        print(f"\n❌ Erreur lors du seeding: {str(e)}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    run_seeds()
