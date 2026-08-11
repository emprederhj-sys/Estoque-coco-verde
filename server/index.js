const express = require('express');
const path = require('node:path');
const { createDb } = require('./db');
const movimentacoesRouter = require('./routes/movimentacoes');
const authRouter = require('./routes/auth');

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use('/api/movimentacoes', movimentacoesRouter(db));
  app.use('/api/auth', authRouter(db));
  return app;
}

if (require.main === module) {
  const dbPath = path.join(__dirname, '..', 'data', 'estoque.sqlite');
  const db = createDb(dbPath);
  const app = createApp(db);
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
  });
}

module.exports = { createApp };
