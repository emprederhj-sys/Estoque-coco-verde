const { test } = require('node:test');
const assert = require('node:assert');
const { createDb } = require('../db');
const { createApp } = require('../index');

function startTestServer() {
  const db = createDb(':memory:');
  const app = createApp(db);
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      resolve({ server, baseUrl: `http://localhost:${server.address().port}` });
    });
  });
}

test('POST /api/auth/login com credenciais corretas retorna 200 sem expor o hash', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ papel: 'dono', senha: 'dono123' }),
    });
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(body.papel, 'dono');
    assert.strictEqual('senha_hash' in body, false);
  } finally {
    server.close();
  }
});

test('POST /api/auth/login com senha errada retorna 401', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ papel: 'dono', senha: 'errada' }),
    });
    assert.strictEqual(res.status, 401);
  } finally {
    server.close();
  }
});

test('POST /api/auth/login com papel invalido retorna 400', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ papel: 'admin', senha: 'qualquer' }),
    });
    assert.strictEqual(res.status, 400);
  } finally {
    server.close();
  }
});
