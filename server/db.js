const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const fs = require('node:fs');
const path = require('node:path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS movimentacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL CHECK(tipo IN ('entrada','saida')),
  quantidade INTEGER NOT NULL,
  detalhe TEXT,
  observacao TEXT,
  usuario TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  papel TEXT NOT NULL UNIQUE CHECK(papel IN ('dono','funcionario')),
  senha_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessoes (
  token TEXT PRIMARY KEY,
  papel TEXT NOT NULL CHECK(papel IN ('dono','funcionario')),
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  expira_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS metas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  quantidade INTEGER NOT NULL CHECK(quantidade > 0)
);

CREATE TABLE IF NOT EXISTS config (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  preco_compra REAL NOT NULL DEFAULT 0,
  preco_venda REAL NOT NULL DEFAULT 0,
  whatsapp_numero TEXT NOT NULL DEFAULT '',
  estoque_minimo INTEGER NOT NULL DEFAULT 50
);
`;

const SENHAS_PADRAO = {
  dono: 'dono123',
  funcionario: 'func123',
};

function seedUsuarios(db) {
  const { c } = db.prepare('SELECT COUNT(*) as c FROM usuarios').get();
  if (c > 0) return;

  const insert = db.prepare('INSERT INTO usuarios (papel, senha_hash) VALUES (?, ?)');
  for (const [papel, senha] of Object.entries(SENHAS_PADRAO)) {
    insert.run(papel, bcrypt.hashSync(senha, 10));
  }
}

function seedConfig(db) {
  const { c } = db.prepare('SELECT COUNT(*) as c FROM config').get();
  if (c > 0) return;

  db.prepare(
    "INSERT INTO config (id, preco_compra, preco_venda, whatsapp_numero, estoque_minimo) VALUES (1, 0, 0, '', 50)"
  ).run();
}

function createDb(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA);
  seedUsuarios(db);
  seedConfig(db);
  return db;
}

module.exports = { createDb };
