const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Configuration basique
app.use(cors());
app.use(express.json());

// Test routes step by step
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Test 1: Add middleware routes
try {
  const { migrationRouter } = require('./middleware/CompatibilityAuth');
  app.use('/api/migration', migrationRouter);
  console.log('✅ Migration routes mounted');
} catch (error) {
  console.error('❌ Migration routes failed:', error.message);
}

// Test 2: Add auth routes
try {
  const authRoutes = require('./routes/secure/auth');
  app.use('/api/auth', authRoutes);
  console.log('✅ Auth routes mounted');
} catch (error) {
  console.error('❌ Auth routes failed:', error.message);
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});