const express = require('express');
const path = require('node:path');
const { createDb } = require('./db');
const movimentacoesRouter = require('./routes/movimentacoes');
const authRouter = require('./routes/auth');
const metasRouter = require('./routes/metas');
const configRouter = require('./routes/config');

try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use('/api/movimentacoes', movimentacoesRouter(db));
  app.use('/api/auth', authRouter(db));
  app.use('/api/metas', metasRouter(db));
  app.use('/api/config', configRouter(db));
  return app;
}

if (require.main === module) {
  const dbPath = process.env.DB_PATH
    ? path.resolve(__dirname, '..', process.env.DB_PATH)
    : path.join(__dirname, '..', 'data', 'estoque.sqlite');
  const db = createDb(dbPath);
  const app = createApp(db);
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
  });
}

module.exports = { createApp };
