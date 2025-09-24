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
