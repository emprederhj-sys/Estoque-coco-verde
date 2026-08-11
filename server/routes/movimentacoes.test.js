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

test('POST /api/movimentacoes com quantidade invalida retorna 400 e nao grava', async () => {
  const { server, db, baseUrl } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/api/movimentacoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    const postRes = await fetch(`${baseUrl}/api/movimentacoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'saida', quantidade: 7, detalhe: 'Cliente Y', usuario: 'Bea' }),
    });
    assert.strictEqual(postRes.status, 201);

    const getRes = await fetch(`${baseUrl}/api/movimentacoes`);
    const rows = await getRes.json();
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].tipo, 'saida');
    assert.strictEqual(rows[0].quantidade, 7);
    assert.strictEqual(rows[0].detalhe, 'Cliente Y');
  } finally {
    server.close();
  }
});
