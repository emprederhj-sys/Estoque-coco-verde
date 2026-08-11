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

test('GET /api/metas sem sessao retorna 401', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/api/metas`);
    assert.strictEqual(res.status, 401);
  } finally {
    server.close();
  }
});

test('POST /api/metas com dados validos grava e GET retorna a meta', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const cookie = await login(baseUrl, 'funcionario', 'func123');
    const postRes = await fetch(`${baseUrl}/api/metas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ nome: 'Meta 1000', quantidade: 1000 }),
    });
    assert.strictEqual(postRes.status, 201);

    const getRes = await fetch(`${baseUrl}/api/metas`, { headers: { Cookie: cookie } });
    const rows = await getRes.json();
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].nome, 'Meta 1000');
  } finally {
    server.close();
  }
});

test('POST /api/metas com quantidade invalida retorna 400 e nao grava', async () => {
  const { server, db, baseUrl } = await startTestServer();
  try {
    const cookie = await login(baseUrl, 'dono', 'dono123');
    const res = await fetch(`${baseUrl}/api/metas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ nome: 'Meta invalida', quantidade: -1 }),
    });
    assert.strictEqual(res.status, 400);

    const { c } = db.prepare('SELECT COUNT(*) as c FROM metas').get();
    assert.strictEqual(c, 0);
  } finally {
    server.close();
  }
});

test('DELETE /api/metas/:id remove a meta (qualquer papel logado)', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const cookie = await login(baseUrl, 'funcionario', 'func123');
    const postRes = await fetch(`${baseUrl}/api/metas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ nome: 'Meta a remover', quantidade: 200 }),
    });
    const { id } = await postRes.json();

    const delRes = await fetch(`${baseUrl}/api/metas/${id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    assert.strictEqual(delRes.status, 204);

    const getRes = await fetch(`${baseUrl}/api/metas`, { headers: { Cookie: cookie } });
    const rows = await getRes.json();
    assert.strictEqual(rows.length, 0);
  } finally {
    server.close();
  }
});
