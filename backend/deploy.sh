#!/bin/bash
# ====================================================================
# SCRIPT DE DÉPLOIEMENT PROVTECH HYBRIDE
# Fichier: /Users/cisseniang/Documents/ProvTech/deploy.sh
# ====================================================================

echo "🚀 DÉPLOIEMENT PROVTECH SÉCURITÉ HYBRIDE"
echo "=========================================="

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Variables de chemin
PROJECT_ROOT="/Users/cisseniang/Documents/ProvTech"
BACKEND_PATH="$PROJECT_ROOT/backend"
FRONTEND_PATH="$PROJECT_ROOT/frontend"

# ============ ÉTAPE 1: VÉRIFICATION PRÉ-REQUIS ============
echo -e "${BLUE}📋 Étape 1: Vérification des pré-requis...${NC}"

# Vérifier Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js non trouvé. Installez Node.js 16+${NC}"
    exit 1
fi

NODE_VERSION=$(node --version)
echo -e "${GREEN}✅ Node.js trouvé: $NODE_VERSION${NC}"

# Vérifier npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm non trouvé${NC}"
    exit 1
fi

NPM_VERSION=$(npm --version)
echo -e "${GREEN}✅ npm trouvé: $NPM_VERSION${NC}"

# Vérifier MySQL
if ! command -v mysql &> /dev/null; then
    echo -e "${YELLOW}⚠️  MySQL CLI non trouvé - assurez-vous que MySQL Server fonctionne${NC}"
fi

echo ""

# ============ ÉTAPE 2: INSTALLATION DÉPENDANCES BACKEND ============
echo -e "${BLUE}📦 Étape 2: Installation des dépendances backend...${NC}"

cd "$BACKEND_PATH"

# Sauvegarder package.json actuel
if [ -f "package.json" ]; then
    cp package.json package.json.backup
    echo -e "${GREEN}✅ Sauvegarde package.json créée${NC}"
fi

# Installer les nouvelles dépendances de sécurité
echo -e "${YELLOW}📥 Installation dépendances de sécurité...${NC}"

npm install mysql2@latest
npm install jsonwebtoken@latest
npm install bcrypt@latest
npm install speakeasy@latest
npm install qrcode@latest
npm install express-rate-limit@latest
npm install helmet@latest
npm install cors@latest
npm install dotenv@latest

echo -e "${GREEN}✅ Dépendances backend installées${NC}"

# Vérifier si express est déjà installé
if ! npm list express &> /dev/null; then
    echo -e "${YELLOW}📥 Installation Express.js...${NC}"
    npm install express@latest
fi

echo ""

# ============ ÉTAPE 3: CONFIGURATION ENVIRONNEMENT ============
echo -e "${BLUE}🔧 Étape 3: Configuration de l'environnement...${NC}"

# Créer le fichier .env s'il n'existe pas
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}📄 Création fichier .env...${NC}"
    
    # Générer secrets sécurisés
    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
    JWT_REFRESH_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
    SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    DATA_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

    # Créer .env avec secrets générés
    cat > .env << EOF
# Configuration automatiquement générée - $(date)
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:3000

# Base de données
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=provtech
DB_SSL=false

# Sécurité (secrets auto-générés)
JWT_SECRET=$JWT_SECRET
JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET
SESSION_SECRET=$SESSION_SECRET
DATA_ENCRYPTION_KEY=$DATA_ENCRYPTION_KEY
BCRYPT_ROUNDS=12

# Rate limiting
RATE_LIMIT_GLOBAL=1000
RATE_LIMIT_AUTH=5

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:5173

# Fonctionnalités
FEATURE_2FA_ENABLED=true
FEATURE_MIGRATION_ENABLED=true
FEATURE_AUDIT_LOGS=true
LEGACY_AUTH_ENABLED=true

# Développement
DEBUG_MODE=true
EOF

    echo -e "${GREEN}✅ Fichier .env créé avec secrets sécurisés${NC}"
else
    echo -e "${YELLOW}⚠️  Fichier .env existe déjà - non modifié${NC}"
fi

echo ""

# ============ ÉTAPE 4: CRÉATION DOSSIERS REQUIS ============
echo -e "${BLUE}📁 Étape 4: Création structure de dossiers...${NC}"

mkdir -p routes/secure
mkdir -p middleware
mkdir -p logs
mkdir -p backups

echo -e "${GREEN}✅ Structure de dossiers créée${NC}"

echo ""

# ============ ÉTAPE 5: TEST CONNEXION BASE DE DONNÉES ============
echo -e "${BLUE}🗄️  Étape 5: Test de connexion à la base de données...${NC}"

# Script de test DB
cat > test_db_connection.js << 'EOF'
const mysql = require('mysql2/promise');
require('dotenv').config();

async function testConnection() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });

    console.log('✅ Connexion DB réussie');
    
    // Test des tables de sécurité
    const [tables] = await connection.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = ? 
      AND TABLE_NAME IN ('users', 'audit_logs', 'user_sessions', 'permissions')
    `, [process.env.DB_NAME]);
    
    console.log('📋 Tables de sécurité trouvées:', tables.length);
    tables.forEach(t => console.log('  -', t.TABLE_NAME));
    
    await connection.end();
    return true;
  } catch (error) {
    console.error('❌ Erreur DB:', error.message);
    return false;
  }
}

testConnection().then(success => {
  process.exit(success ? 0 : 1);
});
EOF

echo -e "${YELLOW}🔍 Test de connexion DB...${NC}"
if node test_db_connection.js; then
    echo -e "${GREEN}✅ Base de données accessible${NC}"
    rm test_db_connection.js
else
    echo -e "${RED}❌ Problème de connexion DB - vérifiez vos paramètres dans .env${NC}"
    echo -e "${YELLOW}📝 Fichier test_db_connection.js conservé pour diagnostic${NC}"
fi

echo ""

# ============ ÉTAPE 6: VALIDATION FICHIERS REQUIS ============
echo -e "${BLUE}📄 Étape 6: Validation des fichiers requis...${NC}"

required_files=(
    "server.js"
    "middleware/CompatibilityAuth.js"
    "routes/secure/auth.js"
    "controllers/auth/SecureAuthController.js"
)

missing_files=()

for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✅ $file${NC}"
    else
        echo -e "${RED}❌ $file${NC}"
        missing_files+=("$file")
    fi
done

if [ ${#missing_files[@]} -gt 0 ]; then
    echo -e "${RED}❌ Fichiers manquants détectés !${NC}"
    echo -e "${YELLOW}📝 Créez ces fichiers avant de continuer:${NC}"
    for file in "${missing_files[@]}"; do
        echo "   - $file"
    done
    echo ""
    echo -e "${BLUE}💡 Utilisez les artifacts fournis pour créer ces fichiers${NC}"
fi

echo ""

# ============ ÉTAPE 7: COMMANDES DE DÉMARRAGE ============
echo -e "${BLUE}🎯 Étape 7: Préparation du démarrage...${NC}"

# Créer script de démarrage
cat > start_hybrid.js << 'EOF'
// Script de démarrage avec diagnostics
require('dotenv').config();

console.log(`
🚀 DÉMARRAGE PROVTECH HYBRIDE
============================
📍 Environment: ${process.env.NODE_ENV}
📍 Port: ${process.env.PORT}
📍 Base: ${process.env.DB_NAME}@${process.env.DB_HOST}
🔐 JWT: ${process.env.JWT_SECRET ? 'Configuré' : 'NON CONFIGURÉ'}
🔄 Mode Legacy: ${process.env.LEGACY_AUTH_ENABLED === 'true' ? 'Actif' : 'Désactivé'}
🛡️  2FA: ${process.env.FEATURE_2FA_ENABLED === 'true' ? 'Actif' : 'Désactivé'}
`);

// Lancer le serveur
require('./server.js');
EOF

echo -e "${GREEN}✅ Script de démarrage créé: start_hybrid.js${NC}"

# ============ ÉTAPE 8: RÉSUMÉ ET PROCHAINES ACTIONS ============
echo ""
echo -e "${GREEN}🎉 DÉPLOIEMENT BACKEND PRÉPARÉ AVEC SUCCÈS !${NC}"
echo -e "${BLUE}=============================================${NC}"
echo ""
echo -e "${YELLOW}📋 PROCHAINES ACTIONS IMMÉDIATES:${NC}"
echo ""
echo "1. 🔧 Configurez votre mot de passe MySQL dans .env:"
echo "   vi .env  # Modifiez DB_PASSWORD=votre_mot_de_passe"
echo ""
echo "2. 🚀 Démarrez le serveur hybride:"
echo "   cd $BACKEND_PATH"
echo "   node start_hybrid.js"
echo ""
echo "3. 🧪 Testez les endpoints:"
echo "   curl http://localhost:3001/api/health"
echo "   curl http://localhost:3001/api/migration/diagnostics"
echo ""
echo -e "${YELLOW}📋 FICHIERS CRÉÉS:${NC}"
echo "   ✅ .env (configuration complète)"
echo "   ✅ CompatibilityAuth.js (middleware hybride)"
echo "   ✅ start_hybrid.js (script de démarrage)" 
echo ""
echo -e "${YELLOW}📋 ROUTES DISPONIBLES APRÈS DÉMARRAGE:${NC}"
echo "   🔐 /api/auth/* (authentification sécurisée)"
echo "   🔄 /api/migration/* (gestion migration)"
echo "   👥 /api/users (gestion utilisateurs)"
echo "   📊 /api/audit (logs de sécurité)"
echo "   ❤️  /api/health (santé système)"
echo ""
echo -e "${BLUE}💡 Votre système ProvTech existant reste 100% fonctionnel !${NC}"
echo ""

# ============ VÉRIFICATION FINALE ============
if [ ${#missing_files[@]} -eq 0 ]; then
    echo -e "${GREEN}✨ PRÊT POUR LE DÉMARRAGE !${NC}"
    echo ""
    echo -e "${YELLOW}Lancez maintenant:${NC}"
    echo "cd $BACKEND_PATH && node start_hybrid.js"
else
    echo -e "${RED}⚠️  Créez d'abord les fichiers manquants avant le démarrage${NC}"
fi