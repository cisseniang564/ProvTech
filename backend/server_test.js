const express = require('express');
const app = express();

app.get('/test', (req, res) => {
  res.json({ message: 'Test OK' });
});

app.listen(3001, () => {
  console.log('Serveur test sur port 3001');
});