const { test } = require('node:test');
const assert = require('node:assert');
const { createDb } = require('../db');
const { createApp } = require('../index');

function startTestServer() {
  const db = createDb(':memory:');
  const app = createApp(db);
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      resolve({ server, db, baseUrl: `http://localhost:${server.address().port}` });
    });
  });
}

async function login(baseUrl, papel, senha) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ papel, senha }),
  });
  return res.headers.get('set-cookie').split(';')[0];
}

test('GET /api/config funciona para qualquer papel logado', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const cookie = await login(baseUrl, 'funcionario', 'func123');
    const res = await fetch(`${baseUrl}/api/config`, { headers: { Cookie: cookie } });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.estoque_minimo, 50);
  } finally {
    server.close();
  }
});

test('PUT /api/config/precos como funcionario retorna 403', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const cookie = await login(baseUrl, 'funcionario', 'func123');
    const res = await fetch(`${baseUrl}/api/config/precos`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ preco_compra: 2, preco_venda: 4 }),
    });
    assert.strictEqual(res.status, 403);
  } finally {
    server.close();
  }
});

test('PUT /api/config/precos como dono grava e GET reflete', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const cookie = await login(baseUrl, 'dono', 'dono123');
    const putRes = await fetch(`${baseUrl}/api/config/precos`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ preco_compra: 2.5, preco_venda: 4.5 }),
    });
    assert.strictEqual(putRes.status, 200);

    const getRes = await fetch(`${baseUrl}/api/config`, { headers: { Cookie: cookie } });
    const body = await getRes.json();
    assert.strictEqual(body.preco_compra, 2.5);
    assert.strictEqual(body.preco_venda, 4.5);
  } finally {
    server.close();
  }
});

test('PUT /api/config/alertas funciona para qualquer papel logado', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const cookie = await login(baseUrl, 'funcionario', 'func123');
    const putRes = await fetch(`${baseUrl}/api/config/alertas`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ whatsapp_numero: '62999998888', estoque_minimo: 30 }),
    });
    assert.strictEqual(putRes.status, 200);

    const getRes = await fetch(`${baseUrl}/api/config`, { headers: { Cookie: cookie } });
    const body = await getRes.json();
    assert.strictEqual(body.whatsapp_numero, '62999998888');
    assert.strictEqual(body.estoque_minimo, 30);
  } finally {
    server.close();
  }
});
