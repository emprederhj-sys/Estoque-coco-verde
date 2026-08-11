const { test } = require('node:test');
const assert = require('node:assert');
const { createDb } = require('../db');
const { criarSessao, apagarSessao, requireAuth, requireDono } = require('./auth');

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader() {},
  };
}

test('criarSessao grava um token valido na tabela sessoes', () => {
  const db = createDb(':memory:');
  const token = criarSessao(db, 'dono', 1);
  const row = db.prepare('SELECT * FROM sessoes WHERE token = ?').get(token);
  assert.strictEqual(row.papel, 'dono');
});

test('apagarSessao remove a linha', () => {
  const db = createDb(':memory:');
  const token = criarSessao(db, 'funcionario', 1);
  apagarSessao(db, token);
  assert.strictEqual(db.prepare('SELECT * FROM sessoes WHERE token = ?').get(token), undefined);
});

test('requireAuth chama next e define req.papel com sessao valida', () => {
  const db = createDb(':memory:');
  const token = criarSessao(db, 'dono', 1);
  const req = { headers: { cookie: `sid=${token}` } };
  const res = mockRes();
  let called = false;
  requireAuth(db)(req, res, () => {
    called = true;
  });
  assert.strictEqual(called, true);
  assert.strictEqual(req.papel, 'dono');
});

test('requireAuth responde 401 sem cookie', () => {
  const db = createDb(':memory:');
  const req = { headers: {} };
  const res = mockRes();
  requireAuth(db)(req, res, () => {
    throw new Error('nao deveria chamar next');
  });
  assert.strictEqual(res.statusCode, 401);
});

test('requireAuth responde 401 com sessao expirada e apaga a linha', () => {
  const db = createDb(':memory:');
  const token = criarSessao(db, 'dono', -1);
  const req = { headers: { cookie: `sid=${token}` } };
  const res = mockRes();
  requireAuth(db)(req, res, () => {
    throw new Error('nao deveria chamar next');
  });
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(db.prepare('SELECT * FROM sessoes WHERE token = ?').get(token), undefined);
});

test('requireDono responde 403 para funcionario', () => {
  const db = createDb(':memory:');
  const token = criarSessao(db, 'funcionario', 1);
  const req = { headers: { cookie: `sid=${token}` } };
  const res = mockRes();
  requireDono(db)(req, res, () => {
    throw new Error('nao deveria chamar next');
  });
  assert.strictEqual(res.statusCode, 403);
});

test('requireDono chama next para dono', () => {
  const db = createDb(':memory:');
  const token = criarSessao(db, 'dono', 1);
  const req = { headers: { cookie: `sid=${token}` } };
  const res = mockRes();
  let called = false;
  requireDono(db)(req, res, () => {
    called = true;
  });
  assert.strictEqual(called, true);
});
