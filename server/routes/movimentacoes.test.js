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

test('GET /api/movimentacoes sem sessao retorna 401', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/api/movimentacoes`);
    assert.strictEqual(res.status, 401);
  } finally {
    server.close();
  }
});

test('POST /api/movimentacoes sem sessao retorna 401', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/api/movimentacoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'entrada', quantidade: 5 }),
    });
    assert.strictEqual(res.status, 401);
  } finally {
    server.close();
  }
});

test('POST /api/movimentacoes com quantidade invalida retorna 400 e nao grava', async () => {
  const { server, db, baseUrl } = await startTestServer();
  try {
    const cookie = await login(baseUrl, 'funcionario', 'func123');
    const res = await fetch(`${baseUrl}/api/movimentacoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ tipo: 'entrada', quantidade: -5 }),
    });
    assert.strictEqual(res.status, 400);

    const { c } = db.prepare('SELECT COUNT(*) as c FROM movimentacoes').get();
    assert.strictEqual(c, 0);
  } finally {
    server.close();
  }
});

test('POST /api/movimentacoes com dados validos grava e GET retorna a movimentacao', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const cookie = await login(baseUrl, 'funcionario', 'func123');
    const postRes = await fetch(`${baseUrl}/api/movimentacoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ tipo: 'saida', quantidade: 7, detalhe: 'Cliente Y', usuario: 'Bea' }),
    });
    assert.strictEqual(postRes.status, 201);

    const getRes = await fetch(`${baseUrl}/api/movimentacoes`, { headers: { Cookie: cookie } });
    const rows = await getRes.json();
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].tipo, 'saida');
    assert.strictEqual(rows[0].quantidade, 7);
    assert.strictEqual(rows[0].detalhe, 'Cliente Y');
  } finally {
    server.close();
  }
});

test('PUT /api/movimentacoes/:id como funcionario retorna 403', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const donoCookie = await login(baseUrl, 'dono', 'dono123');
    const postRes = await fetch(`${baseUrl}/api/movimentacoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: donoCookie },
      body: JSON.stringify({ tipo: 'entrada', quantidade: 10 }),
    });
    const { id } = await postRes.json();

    const funcCookie = await login(baseUrl, 'funcionario', 'func123');
    const res = await fetch(`${baseUrl}/api/movimentacoes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: funcCookie },
      body: JSON.stringify({ tipo: 'entrada', quantidade: 20 }),
    });
    assert.strictEqual(res.status, 403);
  } finally {
    server.close();
  }
});

test('PUT /api/movimentacoes/:id como dono edita a movimentacao', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const cookie = await login(baseUrl, 'dono', 'dono123');
    const postRes = await fetch(`${baseUrl}/api/movimentacoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ tipo: 'entrada', quantidade: 10 }),
    });
    const { id } = await postRes.json();

    const putRes = await fetch(`${baseUrl}/api/movimentacoes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ tipo: 'entrada', quantidade: 25, detalhe: 'Corrigido' }),
    });
    assert.strictEqual(putRes.status, 200);
    const row = await putRes.json();
    assert.strictEqual(row.quantidade, 25);
    assert.strictEqual(row.detalhe, 'Corrigido');
  } finally {
    server.close();
  }
});

test('DELETE /api/movimentacoes/:id como funcionario retorna 403', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const donoCookie = await login(baseUrl, 'dono', 'dono123');
    const postRes = await fetch(`${baseUrl}/api/movimentacoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: donoCookie },
      body: JSON.stringify({ tipo: 'entrada', quantidade: 10 }),
    });
    const { id } = await postRes.json();

    const funcCookie = await login(baseUrl, 'funcionario', 'func123');
    const res = await fetch(`${baseUrl}/api/movimentacoes/${id}`, {
      method: 'DELETE',
      headers: { Cookie: funcCookie },
    });
    assert.strictEqual(res.status, 403);
  } finally {
    server.close();
  }
});

test('DELETE /api/movimentacoes/:id como dono remove a movimentacao', async () => {
  const { server, db, baseUrl } = await startTestServer();
  try {
    const cookie = await login(baseUrl, 'dono', 'dono123');
    const postRes = await fetch(`${baseUrl}/api/movimentacoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ tipo: 'entrada', quantidade: 10 }),
    });
    const { id } = await postRes.json();

    const delRes = await fetch(`${baseUrl}/api/movimentacoes/${id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    assert.strictEqual(delRes.status, 204);

    const { c } = db.prepare('SELECT COUNT(*) as c FROM movimentacoes').get();
    assert.strictEqual(c, 0);
  } finally {
    server.close();
  }
});
