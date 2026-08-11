const { test } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const bcrypt = require('bcryptjs');
const { DatabaseSync } = require('node:sqlite');
const { createDb } = require('./db');

test('createDb cria as tabelas movimentacoes e usuarios', () => {
  const db = createDb(':memory:');
  const tabelas = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((row) => row.name);

  assert.ok(tabelas.includes('movimentacoes'));
  assert.ok(tabelas.includes('usuarios'));
});

test('createDb semeia dono e funcionario com senha hasheada', () => {
  const db = createDb(':memory:');
  const dono = db.prepare('SELECT * FROM usuarios WHERE papel = ?').get('dono');
  const funcionario = db.prepare('SELECT * FROM usuarios WHERE papel = ?').get('funcionario');

  assert.ok(dono, 'usuario dono deveria existir');
  assert.ok(funcionario, 'usuario funcionario deveria existir');
  assert.notStrictEqual(dono.senha_hash, 'dono123');
  assert.notStrictEqual(funcionario.senha_hash, 'func123');
  assert.ok(bcrypt.compareSync('dono123', dono.senha_hash));
  assert.ok(bcrypt.compareSync('func123', funcionario.senha_hash));
});

test('createDb nao duplica usuarios ao reabrir o mesmo arquivo', () => {
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'estoque-')), 'teste.sqlite');

  createDb(dbPath);
  createDb(dbPath);

  const db = new DatabaseSync(dbPath);
  const { c } = db.prepare('SELECT COUNT(*) as c FROM usuarios').get();
  assert.strictEqual(c, 2);
});

test('movimentacoes rejeita tipo fora de entrada/saida no banco', () => {
  const db = createDb(':memory:');
  assert.throws(() => {
    db
      .prepare('INSERT INTO movimentacoes (tipo, quantidade) VALUES (?, ?)')
      .run('invalido', 1);
  }, /CHECK constraint failed/);
});
