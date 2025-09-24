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
