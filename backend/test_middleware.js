const express = require('express');
require('dotenv').config();

console.log('Test import CompatibilityAuth...');

try {
  const { 
    compatibilityAuth, 
    requirePermission, 
    migrationRouter,
    initializeDatabase 
  } = require('./middleware/CompatibilityAuth');
  
  console.log('✅ CompatibilityAuth importé sans erreur');
  
  const app = express();
  app.use('/test', migrationRouter);
  console.log('✅ migrationRouter monté sans erreur');
  
  app.listen(3001, () => console.log('Test middleware réussi sur port 3001'));
  
} catch (error) {
  console.error('❌ Erreur CompatibilityAuth:', error.message);
  console.error('Stack:', error.stack);
}