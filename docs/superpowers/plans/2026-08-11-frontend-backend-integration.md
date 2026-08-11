# Integração front-backend (sessão, metas/preços, PUT/DELETE, .env) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o front-end (`public/index.html`) consumir a API de verdade em vez de `localStorage`, com sessão de login persistente, PUT/DELETE em movimentações, e as tabelas/rotas de metas e configurações (preços, WhatsApp, estoque mínimo) que hoje só existem no navegador.

**Architecture:** Sessão por cookie httpOnly com tabela `sessoes` no SQLite (sem libs novas — `node:crypto` gera o token, cookie parseado manualmente). O front mantém um cache em memória alimentado por `fetch` no login/restauração de sessão; a UI síncrona existente continua lendo esse cache, e as ações de escrita chamam a API e atualizam o cache no sucesso.

**Tech Stack:** Node.js v24 (`node:sqlite`, `node:test`, `node:crypto`, `process.loadEnvFile`), Express 5, bcryptjs 3. Nenhuma dependência nova.

## Global Constraints

- Runtime dependencies continuam limitadas a `express` e `bcryptjs` — nenhuma lib nova (sem `cookie-parser`, `express-session`, `jsonwebtoken`, `dotenv`).
- Toda query com valor externo usa `db.prepare(sql).run/get/all(...params)` com `?` — nunca concatenação.
- Todo campo vindo do front é validado em `server/validation.js` antes de qualquer `INSERT`/`UPDATE`.
- Senhas nunca em texto puro — só hash bcrypt (custo 10) em `usuarios.senha_hash`.
- Todo módulo novo em CommonJS (`require`/`module.exports`).
- `GET /api/movimentacoes`, `POST /api/movimentacoes`, `GET/POST/DELETE /api/metas` exigem sessão válida (`requireAuth`); `PUT`/`DELETE /api/movimentacoes/:id`, `PUT /api/config/precos`, `PUT /api/auth/senha` exigem papel `dono` (`requireDono`); `GET /api/config` e `PUT /api/config/alertas` exigem apenas sessão válida (qualquer papel).
- Testes seguem o padrão do repo: `node:test` + `node:assert`, TDD (teste falhando antes da implementação).

---

### Task 1: Tabela de sessões e middleware de autenticação

**Files:**
- Modify: `server/db.js` (adiciona tabela `sessoes` ao `SCHEMA`)
- Modify: `server/db.test.js` (estende o teste de tabelas)
- Create: `server/middleware/auth.js`
- Test: `server/middleware/auth.test.js`

**Interfaces:**
- Consumes: `createDb` de `server/db.js` (Task 3 da fase anterior, já existe).
- Produces: `{ COOKIE_NAME, parseCookies(header), criarSessao(db, papel, ttlHoras) => token, apagarSessao(db, token), setSessionCookie(res, token, ttlHoras), clearSessionCookie(res), requireAuth(db) => middleware, requireDono(db) => middleware }` de `server/middleware/auth.js`. Tasks 2, 3, 4, 5, 6 usam `requireAuth`/`requireDono`; Task 2 usa todo o resto.

- [ ] **Step 1: Adicionar a tabela `sessoes` ao schema**

Em `server/db.js`, troque:

```js
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  papel TEXT NOT NULL UNIQUE CHECK(papel IN ('dono','funcionario')),
  senha_hash TEXT NOT NULL
);
`;
```

por:

```js
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
`;
```

- [ ] **Step 2: Estender o teste de criação de tabelas**

Em `server/db.test.js`, troque:

```js
  assert.ok(tabelas.includes('movimentacoes'));
  assert.ok(tabelas.includes('usuarios'));
});
```

por:

```js
  assert.ok(tabelas.includes('movimentacoes'));
  assert.ok(tabelas.includes('usuarios'));
  assert.ok(tabelas.includes('sessoes'));
});
```

- [ ] **Step 3: Rodar `node --test server/db.test.js`**

Expected: PASS (a tabela já existe pelo Step 1; este teste só confirma).

- [ ] **Step 4: Escrever os testes falhando do middleware**

Create `server/middleware/auth.test.js`:

```js
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
```

- [ ] **Step 5: Rodar para verificar que falha**

Run: `node --test server/middleware/auth.test.js`
Expected: FAIL — `Error: Cannot find module './auth'`.

- [ ] **Step 6: Escrever a implementação**

Create `server/middleware/auth.js`:

```js
const { randomBytes } = require('node:crypto');

const COOKIE_NAME = 'sid';

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

function criarSessao(db, papel, ttlHoras) {
  const token = randomBytes(32).toString('hex');
  const expiraEm = new Date(Date.now() + ttlHoras * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessoes (token, papel, expira_em) VALUES (?, ?, ?)').run(
    token,
    papel,
    expiraEm
  );
  return token;
}

function buscarSessaoValida(db, token) {
  if (!token) return null;
  const sessao = db.prepare('SELECT * FROM sessoes WHERE token = ?').get(token);
  if (!sessao) return null;
  if (new Date(sessao.expira_em).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessoes WHERE token = ?').run(token);
    return null;
  }
  return sessao;
}

function apagarSessao(db, token) {
  if (!token) return;
  db.prepare('DELETE FROM sessoes WHERE token = ?').run(token);
}

function cookieAttrs() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `HttpOnly; SameSite=Lax; Path=/${secure}`;
}

function setSessionCookie(res, token, ttlHoras) {
  const maxAge = Math.round(ttlHoras * 60 * 60);
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; Max-Age=${maxAge}; ${cookieAttrs()}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Max-Age=0; ${cookieAttrs()}`);
}

function requireAuth(db) {
  return (req, res, next) => {
    const cookies = parseCookies(req.headers.cookie);
    const sessao = buscarSessaoValida(db, cookies[COOKIE_NAME]);
    if (!sessao) {
      res.status(401).json({ errors: ['sessao invalida ou expirada'] });
      return;
    }
    req.papel = sessao.papel;
    req.sessionToken = sessao.token;
    next();
  };
}

function requireDono(db) {
  const auth = requireAuth(db);
  return (req, res, next) => {
    auth(req, res, () => {
      if (req.papel !== 'dono') {
        res.status(403).json({ errors: ['apenas o dono pode acessar este recurso'] });
        return;
      }
      next();
    });
  };
}

module.exports = {
  COOKIE_NAME,
  parseCookies,
  criarSessao,
  apagarSessao,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  requireDono,
};
```

- [ ] **Step 7: Rodar para verificar que passa**

Run: `node --test server/middleware/auth.test.js`
Expected: PASS — 7 tests, 0 failures.

- [ ] **Step 8: Commit**

```bash
git add server/db.js server/db.test.js server/middleware/auth.js server/middleware/auth.test.js
git commit -m "feat: add sessoes table and requireAuth/requireDono middleware"
```

---

### Task 2: Sessão persistente no login (`/login`, `/me`, `/logout`)

**Files:**
- Modify: `server/routes/auth.js`
- Modify: `server/routes/auth.test.js`

**Interfaces:**
- Consumes: `criarSessao`, `apagarSessao`, `setSessionCookie`, `clearSessionCookie`, `parseCookies`, `COOKIE_NAME`, `requireAuth` de `server/middleware/auth.js` (Task 1).
- Produces: `GET /api/auth/me` retorna `200 { papel }` com sessão válida, `401` sem sessão — usado pelo front (Task 8) para restaurar sessão ao carregar a página. `POST /api/auth/logout` sempre `200`.

- [ ] **Step 1: Escrever os testes falhando**

Em `server/routes/auth.test.js`, adicione ao final do arquivo (depois do último `test(...)` existente):

```js
test('POST /api/auth/login com sucesso seta cookie de sessao', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ papel: 'dono', senha: 'dono123' }),
    });
    const setCookie = res.headers.get('set-cookie');
    assert.ok(setCookie && setCookie.startsWith('sid='));
  } finally {
    server.close();
  }
});

test('GET /api/auth/me com cookie valido retorna o papel', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ papel: 'dono', senha: 'dono123' }),
    });
    const cookie = loginRes.headers.get('set-cookie').split(';')[0];

    const meRes = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } });
    assert.strictEqual(meRes.status, 200);
    const body = await meRes.json();
    assert.strictEqual(body.papel, 'dono');
  } finally {
    server.close();
  }
});

test('GET /api/auth/me sem cookie retorna 401', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/api/auth/me`);
    assert.strictEqual(res.status, 401);
  } finally {
    server.close();
  }
});

test('POST /api/auth/logout limpa a sessao', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ papel: 'dono', senha: 'dono123' }),
    });
    const cookie = loginRes.headers.get('set-cookie').split(';')[0];

    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    assert.strictEqual(logoutRes.status, 200);

    const meRes = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } });
    assert.strictEqual(meRes.status, 401);
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Rodar para verificar que falha**

Run: `node --test server/routes/auth.test.js`
Expected: FAIL — `/me` e `/logout` retornam 404 (rotas não existem), e o teste de cookie falha porque `/login` não seta `Set-Cookie`.

- [ ] **Step 3: Reescrever `server/routes/auth.js`**

Replace the full contents of `server/routes/auth.js` with:

```js
const express = require('express');
const bcrypt = require('bcryptjs');
const { validarLogin } = require('../validation');
const {
  criarSessao,
  apagarSessao,
  setSessionCookie,
  clearSessionCookie,
  parseCookies,
  COOKIE_NAME,
  requireAuth,
} = require('../middleware/auth');

const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS) || 168;

function authRouter(db) {
  const router = express.Router();

  router.post('/login', (req, res) => {
    const result = validarLogin(req.body);
    if (!result.valid) {
      res.status(400).json({ errors: result.errors });
      return;
    }

    const { papel, senha } = result.data;
    const usuario = db.prepare('SELECT senha_hash FROM usuarios WHERE papel = ?').get(papel);
    if (!usuario || !bcrypt.compareSync(senha, usuario.senha_hash)) {
      res.status(401).json({ errors: ['papel ou senha invalidos'] });
      return;
    }

    const token = criarSessao(db, papel, SESSION_TTL_HOURS);
    setSessionCookie(res, token, SESSION_TTL_HOURS);
    res.status(200).json({ papel });
  });

  router.get('/me', requireAuth(db), (req, res) => {
    res.status(200).json({ papel: req.papel });
  });

  router.post('/logout', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    apagarSessao(db, cookies[COOKIE_NAME]);
    clearSessionCookie(res);
    res.status(200).json({ ok: true });
  });

  return router;
}

module.exports = authRouter;
```

- [ ] **Step 4: Rodar para verificar que passa**

Run: `node --test server/routes/auth.test.js`
Expected: PASS — 7 tests, 0 failures (3 originais + 4 novos).

- [ ] **Step 5: Commit**

```bash
git add server/routes/auth.js server/routes/auth.test.js
git commit -m "feat: create persistent session on login, add /me and /logout"
```

---

### Task 3: Troca de senha (`PUT /api/auth/senha`)

**Files:**
- Modify: `server/validation.js`
- Modify: `server/validation.test.js`
- Modify: `server/routes/auth.js`
- Modify: `server/routes/auth.test.js`

**Interfaces:**
- Consumes: `requireDono` de `server/middleware/auth.js` (Task 1).
- Produces: `validarSenha(body)` → `{ valid, errors, data?: { papel, novaSenha } }` em `server/validation.js`. `PUT /api/auth/senha` (dono-only) regrava `usuarios.senha_hash`.

- [ ] **Step 1: Escrever os testes falhando de validação**

Em `server/validation.test.js`, troque a linha de import:

```js
const { validarMovimentacao, validarLogin } = require('./validation');
```

por:

```js
const { validarMovimentacao, validarLogin, validarSenha } = require('./validation');
```

E adicione ao final do arquivo:

```js
test('validarSenha rejeita papel invalido', () => {
  const result = validarSenha({ papel: 'admin', novaSenha: '1234' });
  assert.strictEqual(result.valid, false);
});

test('validarSenha rejeita senha curta', () => {
  const result = validarSenha({ papel: 'dono', novaSenha: '123' });
  assert.strictEqual(result.valid, false);
});

test('validarSenha aceita papel e senha validos', () => {
  const result = validarSenha({ papel: 'funcionario', novaSenha: 'nova1234' });
  assert.deepStrictEqual(result, {
    valid: true,
    errors: [],
    data: { papel: 'funcionario', novaSenha: 'nova1234' },
  });
});
```

- [ ] **Step 2: Rodar para verificar que falha**

Run: `node --test server/validation.test.js`
Expected: FAIL — `validarSenha` não é exportado por `./validation`.

- [ ] **Step 3: Implementar `validarSenha`**

Em `server/validation.js`, troque a linha final:

```js
module.exports = { validarMovimentacao, validarLogin };
```

por:

```js
function validarSenha(body) {
  body = body || {};
  const errors = [];

  if (!PAPEIS_VALIDOS.includes(body.papel)) {
    errors.push(`papel deve ser um de: ${PAPEIS_VALIDOS.join(', ')}`);
  }
  if (typeof body.novaSenha !== 'string' || body.novaSenha.length < 4) {
    errors.push('novaSenha deve ter pelo menos 4 caracteres');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [], data: { papel: body.papel, novaSenha: body.novaSenha } };
}

module.exports = { validarMovimentacao, validarLogin, validarSenha };
```

- [ ] **Step 4: Rodar para verificar que passa**

Run: `node --test server/validation.test.js`
Expected: PASS — 10 tests, 0 failures.

- [ ] **Step 5: Escrever os testes falhando da rota**

Em `server/routes/auth.test.js`, adicione ao final:

```js
test('PUT /api/auth/senha sem ser dono retorna 403', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ papel: 'funcionario', senha: 'func123' }),
    });
    const cookie = loginRes.headers.get('set-cookie').split(';')[0];

    const res = await fetch(`${baseUrl}/api/auth/senha`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ papel: 'dono', novaSenha: 'novaSenha1' }),
    });
    assert.strictEqual(res.status, 403);
  } finally {
    server.close();
  }
});

test('PUT /api/auth/senha como dono regrava o hash e o novo login funciona', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ papel: 'dono', senha: 'dono123' }),
    });
    const cookie = loginRes.headers.get('set-cookie').split(';')[0];

    const res = await fetch(`${baseUrl}/api/auth/senha`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ papel: 'funcionario', novaSenha: 'novaSenhaFunc' }),
    });
    assert.strictEqual(res.status, 200);

    const novoLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ papel: 'funcionario', senha: 'novaSenhaFunc' }),
    });
    assert.strictEqual(novoLogin.status, 200);
  } finally {
    server.close();
  }
});
```

- [ ] **Step 6: Rodar para verificar que falha**

Run: `node --test server/routes/auth.test.js`
Expected: FAIL — `PUT /api/auth/senha` retorna 404 (rota não existe).

- [ ] **Step 7: Implementar a rota**

Em `server/routes/auth.js`, troque:

```js
const { validarLogin } = require('../validation');
const {
  criarSessao,
  apagarSessao,
  setSessionCookie,
  clearSessionCookie,
  parseCookies,
  COOKIE_NAME,
  requireAuth,
} = require('../middleware/auth');
```

por:

```js
const { validarLogin, validarSenha } = require('../validation');
const {
  criarSessao,
  apagarSessao,
  setSessionCookie,
  clearSessionCookie,
  parseCookies,
  COOKIE_NAME,
  requireAuth,
  requireDono,
} = require('../middleware/auth');
```

E troque:

```js
  router.post('/logout', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    apagarSessao(db, cookies[COOKIE_NAME]);
    clearSessionCookie(res);
    res.status(200).json({ ok: true });
  });

  return router;
```

por:

```js
  router.post('/logout', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    apagarSessao(db, cookies[COOKIE_NAME]);
    clearSessionCookie(res);
    res.status(200).json({ ok: true });
  });

  router.put('/senha', requireDono(db), (req, res) => {
    const result = validarSenha(req.body);
    if (!result.valid) {
      res.status(400).json({ errors: result.errors });
      return;
    }

    const { papel, novaSenha } = result.data;
    const hash = bcrypt.hashSync(novaSenha, 10);
    db.prepare('UPDATE usuarios SET senha_hash = ? WHERE papel = ?').run(hash, papel);
    res.status(200).json({ papel });
  });

  return router;
```

- [ ] **Step 8: Rodar para verificar que passa**

Run: `node --test server/routes/auth.test.js`
Expected: PASS — 9 tests, 0 failures.

- [ ] **Step 9: Commit**

```bash
git add server/validation.js server/validation.test.js server/routes/auth.js server/routes/auth.test.js
git commit -m "feat: add PUT /api/auth/senha (dono-only)"
```

---

### Task 4: Autenticação e PUT/DELETE em movimentações

**Files:**
- Modify: `server/routes/movimentacoes.js`
- Modify: `server/routes/movimentacoes.test.js`

**Interfaces:**
- Consumes: `requireAuth`, `requireDono` de `server/middleware/auth.js` (Task 1).
- Produces: `GET`/`POST /api/movimentacoes` agora exigem sessão. `PUT`/`DELETE /api/movimentacoes/:id` (dono-only) — nenhuma task depende disso além da integração do front (Task 9).

- [ ] **Step 1: Reescrever os testes**

Replace the full contents of `server/routes/movimentacoes.test.js` with:

```js
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
```

- [ ] **Step 2: Rodar para verificar que falha**

Run: `node --test server/routes/movimentacoes.test.js`
Expected: FAIL — os testes sem cookie esperam 401 mas hoje recebem 200/201/400 (rota aberta), e `PUT`/`DELETE` retornam 404 (não existem).

- [ ] **Step 3: Reescrever a rota**

Replace the full contents of `server/routes/movimentacoes.js` with:

```js
const express = require('express');
const { validarMovimentacao } = require('../validation');
const { requireAuth, requireDono } = require('../middleware/auth');

function movimentacoesRouter(db) {
  const router = express.Router();

  router.get('/', requireAuth(db), (req, res) => {
    const rows = db.prepare('SELECT * FROM movimentacoes ORDER BY id DESC').all();
    res.json(rows);
  });

  router.post('/', requireAuth(db), (req, res) => {
    const result = validarMovimentacao(req.body);
    if (!result.valid) {
      res.status(400).json({ errors: result.errors });
      return;
    }

    const { tipo, quantidade, detalhe, observacao, usuario } = result.data;
    const info = db
      .prepare(
        'INSERT INTO movimentacoes (tipo, quantidade, detalhe, observacao, usuario) VALUES (?, ?, ?, ?, ?)'
      )
      .run(tipo, quantidade, detalhe, observacao, usuario);

    const row = db.prepare('SELECT * FROM movimentacoes WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(row);
  });

  router.put('/:id', requireDono(db), (req, res) => {
    const existente = db.prepare('SELECT * FROM movimentacoes WHERE id = ?').get(req.params.id);
    if (!existente) {
      res.status(404).json({ errors: ['movimentacao nao encontrada'] });
      return;
    }

    const result = validarMovimentacao(req.body);
    if (!result.valid) {
      res.status(400).json({ errors: result.errors });
      return;
    }

    const { tipo, quantidade, detalhe, observacao, usuario } = result.data;
    db.prepare(
      'UPDATE movimentacoes SET tipo = ?, quantidade = ?, detalhe = ?, observacao = ?, usuario = ? WHERE id = ?'
    ).run(tipo, quantidade, detalhe, observacao, usuario, req.params.id);

    const row = db.prepare('SELECT * FROM movimentacoes WHERE id = ?').get(req.params.id);
    res.status(200).json(row);
  });

  router.delete('/:id', requireDono(db), (req, res) => {
    const existente = db.prepare('SELECT * FROM movimentacoes WHERE id = ?').get(req.params.id);
    if (!existente) {
      res.status(404).json({ errors: ['movimentacao nao encontrada'] });
      return;
    }

    db.prepare('DELETE FROM movimentacoes WHERE id = ?').run(req.params.id);
    res.status(204).end();
  });

  return router;
}

module.exports = movimentacoesRouter;
```

- [ ] **Step 4: Rodar para verificar que passa**

Run: `node --test server/routes/movimentacoes.test.js`
Expected: PASS — 8 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add server/routes/movimentacoes.js server/routes/movimentacoes.test.js
git commit -m "feat: require session on movimentacoes, add dono-only PUT/DELETE"
```

---

### Task 5: Tabela e rotas de metas

**Files:**
- Modify: `server/db.js` (tabela `metas`)
- Modify: `server/db.test.js`
- Modify: `server/validation.js` (`validarMeta`)
- Modify: `server/validation.test.js`
- Create: `server/routes/metas.js`
- Test: `server/routes/metas.test.js`
- Modify: `server/index.js` (monta a rota)

**Interfaces:**
- Consumes: `requireAuth` de `server/middleware/auth.js` (Task 1), `validarMeta` (este task).
- Produces: `GET`/`POST`/`DELETE /api/metas` (qualquer papel logado). Task 10 (front-end) consome estas rotas.

- [ ] **Step 1: Adicionar a tabela `metas` ao schema**

Em `server/db.js`, troque:

```js
CREATE TABLE IF NOT EXISTS sessoes (
  token TEXT PRIMARY KEY,
  papel TEXT NOT NULL CHECK(papel IN ('dono','funcionario')),
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  expira_em TEXT NOT NULL
);
`;
```

por:

```js
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
`;
```

- [ ] **Step 2: Estender o teste de tabelas**

Em `server/db.test.js`, troque:

```js
  assert.ok(tabelas.includes('movimentacoes'));
  assert.ok(tabelas.includes('usuarios'));
  assert.ok(tabelas.includes('sessoes'));
});
```

por:

```js
  assert.ok(tabelas.includes('movimentacoes'));
  assert.ok(tabelas.includes('usuarios'));
  assert.ok(tabelas.includes('sessoes'));
  assert.ok(tabelas.includes('metas'));
});
```

- [ ] **Step 3: Escrever os testes falhando de `validarMeta`**

Em `server/validation.test.js`, troque:

```js
const { validarMovimentacao, validarLogin, validarSenha } = require('./validation');
```

por:

```js
const { validarMovimentacao, validarLogin, validarSenha, validarMeta } = require('./validation');
```

E adicione ao final:

```js
test('validarMeta aceita nome e quantidade validos', () => {
  const result = validarMeta({ nome: '  Meta 500  ', quantidade: '500' });
  assert.deepStrictEqual(result, {
    valid: true,
    errors: [],
    data: { nome: 'Meta 500', quantidade: 500 },
  });
});

test('validarMeta rejeita nome vazio', () => {
  assert.strictEqual(validarMeta({ nome: '  ', quantidade: 10 }).valid, false);
});

test('validarMeta rejeita quantidade zero ou negativa', () => {
  assert.strictEqual(validarMeta({ nome: 'Meta', quantidade: 0 }).valid, false);
  assert.strictEqual(validarMeta({ nome: 'Meta', quantidade: -5 }).valid, false);
});
```

- [ ] **Step 4: Rodar para verificar que falha**

Run: `node --test server/validation.test.js server/db.test.js`
Expected: FAIL — `validarMeta` não existe.

- [ ] **Step 5: Implementar `validarMeta`**

Em `server/validation.js`, troque:

```js
module.exports = { validarMovimentacao, validarLogin, validarSenha };
```

por:

```js
function validarMeta(body) {
  body = body || {};
  const errors = [];

  const nome = typeof body.nome === 'string' ? body.nome.trim() : '';
  if (!nome || nome.length > 100) {
    errors.push('nome e obrigatorio e deve ter ate 100 caracteres');
  }

  const quantidade = Number(body.quantidade);
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    errors.push('quantidade deve ser um numero inteiro positivo');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [], data: { nome, quantidade } };
}

module.exports = { validarMovimentacao, validarLogin, validarSenha, validarMeta };
```

- [ ] **Step 6: Rodar para verificar que passa**

Run: `node --test server/validation.test.js server/db.test.js`
Expected: PASS.

- [ ] **Step 7: Escrever o teste falhando da rota**

Create `server/routes/metas.test.js`:

```js
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
```

- [ ] **Step 8: Rodar para verificar que falha**

Run: `node --test server/routes/metas.test.js`
Expected: FAIL — `Error: Cannot find module '../routes/metas'` (a rota ainda não existe e não está montada).

- [ ] **Step 9: Implementar a rota**

Create `server/routes/metas.js`:

```js
const express = require('express');
const { validarMeta } = require('../validation');
const { requireAuth } = require('../middleware/auth');

function metasRouter(db) {
  const router = express.Router();

  router.get('/', requireAuth(db), (req, res) => {
    const rows = db.prepare('SELECT * FROM metas ORDER BY id DESC').all();
    res.json(rows);
  });

  router.post('/', requireAuth(db), (req, res) => {
    const result = validarMeta(req.body);
    if (!result.valid) {
      res.status(400).json({ errors: result.errors });
      return;
    }

    const { nome, quantidade } = result.data;
    const info = db
      .prepare('INSERT INTO metas (nome, quantidade) VALUES (?, ?)')
      .run(nome, quantidade);

    const row = db.prepare('SELECT * FROM metas WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(row);
  });

  router.delete('/:id', requireAuth(db), (req, res) => {
    const existente = db.prepare('SELECT * FROM metas WHERE id = ?').get(req.params.id);
    if (!existente) {
      res.status(404).json({ errors: ['meta nao encontrada'] });
      return;
    }

    db.prepare('DELETE FROM metas WHERE id = ?').run(req.params.id);
    res.status(204).end();
  });

  return router;
}

module.exports = metasRouter;
```

- [ ] **Step 10: Montar a rota em `server/index.js`**

Troque:

```js
const movimentacoesRouter = require('./routes/movimentacoes');
const authRouter = require('./routes/auth');
```

por:

```js
const movimentacoesRouter = require('./routes/movimentacoes');
const authRouter = require('./routes/auth');
const metasRouter = require('./routes/metas');
```

E troque:

```js
  app.use('/api/movimentacoes', movimentacoesRouter(db));
  app.use('/api/auth', authRouter(db));
```

por:

```js
  app.use('/api/movimentacoes', movimentacoesRouter(db));
  app.use('/api/auth', authRouter(db));
  app.use('/api/metas', metasRouter(db));
```

- [ ] **Step 11: Rodar para verificar que passa**

Run: `node --test server/routes/metas.test.js`
Expected: PASS — 4 tests, 0 failures.

- [ ] **Step 12: Commit**

```bash
git add server/db.js server/db.test.js server/validation.js server/validation.test.js server/routes/metas.js server/routes/metas.test.js server/index.js
git commit -m "feat: add metas table and GET/POST/DELETE /api/metas"
```

---

### Task 6: Tabela e rotas de configuração (preços e alertas)

**Files:**
- Modify: `server/db.js` (tabela `config` + seed)
- Modify: `server/db.test.js`
- Modify: `server/validation.js` (`validarConfigPrecos`, `validarConfigAlertas`)
- Modify: `server/validation.test.js`
- Create: `server/routes/config.js`
- Test: `server/routes/config.test.js`
- Modify: `server/index.js`

**Interfaces:**
- Consumes: `requireAuth`, `requireDono` (Task 1), `validarConfigPrecos`/`validarConfigAlertas` (este task).
- Produces: `GET /api/config` (qualquer papel), `PUT /api/config/precos` (dono-only), `PUT /api/config/alertas` (qualquer papel). Task 11 (front-end) consome estas rotas.

- [ ] **Step 1: Adicionar a tabela `config` ao schema**

Em `server/db.js`, troque:

```js
CREATE TABLE IF NOT EXISTS metas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  quantidade INTEGER NOT NULL CHECK(quantidade > 0)
);
`;
```

por:

```js
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
```

- [ ] **Step 2: Semear a linha única de config**

Em `server/db.js`, troque:

```js
function createDb(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA);
  seedUsuarios(db);
  return db;
}
```

por:

```js
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
```

- [ ] **Step 3: Estender o teste de tabelas e adicionar teste de seed**

Em `server/db.test.js`, troque:

```js
  assert.ok(tabelas.includes('movimentacoes'));
  assert.ok(tabelas.includes('usuarios'));
  assert.ok(tabelas.includes('sessoes'));
  assert.ok(tabelas.includes('metas'));
});
```

por:

```js
  assert.ok(tabelas.includes('movimentacoes'));
  assert.ok(tabelas.includes('usuarios'));
  assert.ok(tabelas.includes('sessoes'));
  assert.ok(tabelas.includes('metas'));
  assert.ok(tabelas.includes('config'));
});

test('createDb semeia a linha unica de config com os defaults', () => {
  const db = createDb(':memory:');
  const config = db.prepare('SELECT * FROM config WHERE id = 1').get();
  assert.ok(config, 'linha de config deveria existir');
  assert.strictEqual(config.preco_compra, 0);
  assert.strictEqual(config.preco_venda, 0);
  assert.strictEqual(config.whatsapp_numero, '');
  assert.strictEqual(config.estoque_minimo, 50);
});
```

- [ ] **Step 4: Rodar para verificar que passa (schema e seed)**

Run: `node --test server/db.test.js`
Expected: PASS.

- [ ] **Step 5: Escrever os testes falhando de validação**

Em `server/validation.test.js`, troque:

```js
const { validarMovimentacao, validarLogin, validarSenha, validarMeta } = require('./validation');
```

por:

```js
const {
  validarMovimentacao,
  validarLogin,
  validarSenha,
  validarMeta,
  validarConfigPrecos,
  validarConfigAlertas,
} = require('./validation');
```

E adicione ao final:

```js
test('validarConfigPrecos aceita numeros positivos', () => {
  const result = validarConfigPrecos({ preco_compra: '2.5', preco_venda: '4' });
  assert.deepStrictEqual(result, {
    valid: true,
    errors: [],
    data: { preco_compra: 2.5, preco_venda: 4 },
  });
});

test('validarConfigPrecos rejeita preco zero ou negativo', () => {
  assert.strictEqual(validarConfigPrecos({ preco_compra: 0, preco_venda: 4 }).valid, false);
  assert.strictEqual(validarConfigPrecos({ preco_compra: 2, preco_venda: -1 }).valid, false);
});

test('validarConfigAlertas aceita numero e estoque minimo validos', () => {
  const result = validarConfigAlertas({ whatsapp_numero: '(62) 99999-8888', estoque_minimo: '30' });
  assert.deepStrictEqual(result, {
    valid: true,
    errors: [],
    data: { whatsapp_numero: '62999998888', estoque_minimo: 30 },
  });
});

test('validarConfigAlertas rejeita numero curto demais', () => {
  assert.strictEqual(validarConfigAlertas({ whatsapp_numero: '123', estoque_minimo: 30 }).valid, false);
});

test('validarConfigAlertas rejeita estoque minimo zero ou negativo', () => {
  assert.strictEqual(
    validarConfigAlertas({ whatsapp_numero: '62999998888', estoque_minimo: 0 }).valid,
    false
  );
});
```

- [ ] **Step 6: Rodar para verificar que falha**

Run: `node --test server/validation.test.js`
Expected: FAIL — `validarConfigPrecos`/`validarConfigAlertas` não existem.

- [ ] **Step 7: Implementar as funções de validação**

Em `server/validation.js`, troque:

```js
module.exports = { validarMovimentacao, validarLogin, validarSenha, validarMeta };
```

por:

```js
function validarConfigPrecos(body) {
  body = body || {};
  const errors = [];

  const precoCompra = Number(body.preco_compra);
  if (!Number.isFinite(precoCompra) || precoCompra <= 0) {
    errors.push('preco_compra deve ser um numero positivo');
  }

  const precoVenda = Number(body.preco_venda);
  if (!Number.isFinite(precoVenda) || precoVenda <= 0) {
    errors.push('preco_venda deve ser um numero positivo');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [], data: { preco_compra: precoCompra, preco_venda: precoVenda } };
}

function validarConfigAlertas(body) {
  body = body || {};
  const errors = [];

  const whatsappNumero =
    typeof body.whatsapp_numero === 'string' ? body.whatsapp_numero.replace(/\D/g, '') : '';
  if (whatsappNumero.length < 10) {
    errors.push('whatsapp_numero deve ter ao menos 10 digitos (DDD + numero)');
  }

  const estoqueMinimo = Number(body.estoque_minimo);
  if (!Number.isInteger(estoqueMinimo) || estoqueMinimo <= 0) {
    errors.push('estoque_minimo deve ser um numero inteiro positivo');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    data: { whatsapp_numero: whatsappNumero, estoque_minimo: estoqueMinimo },
  };
}

module.exports = {
  validarMovimentacao,
  validarLogin,
  validarSenha,
  validarMeta,
  validarConfigPrecos,
  validarConfigAlertas,
};
```

- [ ] **Step 8: Rodar para verificar que passa**

Run: `node --test server/validation.test.js`
Expected: PASS.

- [ ] **Step 9: Escrever o teste falhando da rota**

Create `server/routes/config.test.js`:

```js
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
```

- [ ] **Step 10: Rodar para verificar que falha**

Run: `node --test server/routes/config.test.js`
Expected: FAIL — a rota não existe/não está montada.

- [ ] **Step 11: Implementar a rota**

Create `server/routes/config.js`:

```js
const express = require('express');
const { validarConfigPrecos, validarConfigAlertas } = require('../validation');
const { requireAuth, requireDono } = require('../middleware/auth');

function configRouter(db) {
  const router = express.Router();

  router.get('/', requireAuth(db), (req, res) => {
    const config = db.prepare('SELECT * FROM config WHERE id = 1').get();
    res.json(config);
  });

  router.put('/precos', requireDono(db), (req, res) => {
    const result = validarConfigPrecos(req.body);
    if (!result.valid) {
      res.status(400).json({ errors: result.errors });
      return;
    }

    const { preco_compra, preco_venda } = result.data;
    db.prepare('UPDATE config SET preco_compra = ?, preco_venda = ? WHERE id = 1').run(
      preco_compra,
      preco_venda
    );

    const config = db.prepare('SELECT * FROM config WHERE id = 1').get();
    res.status(200).json(config);
  });

  router.put('/alertas', requireAuth(db), (req, res) => {
    const result = validarConfigAlertas(req.body);
    if (!result.valid) {
      res.status(400).json({ errors: result.errors });
      return;
    }

    const { whatsapp_numero, estoque_minimo } = result.data;
    db.prepare('UPDATE config SET whatsapp_numero = ?, estoque_minimo = ? WHERE id = 1').run(
      whatsapp_numero,
      estoque_minimo
    );

    const config = db.prepare('SELECT * FROM config WHERE id = 1').get();
    res.status(200).json(config);
  });

  return router;
}

module.exports = configRouter;
```

- [ ] **Step 12: Montar a rota em `server/index.js`**

Troque:

```js
const movimentacoesRouter = require('./routes/movimentacoes');
const authRouter = require('./routes/auth');
const metasRouter = require('./routes/metas');
```

por:

```js
const movimentacoesRouter = require('./routes/movimentacoes');
const authRouter = require('./routes/auth');
const metasRouter = require('./routes/metas');
const configRouter = require('./routes/config');
```

E troque:

```js
  app.use('/api/movimentacoes', movimentacoesRouter(db));
  app.use('/api/auth', authRouter(db));
  app.use('/api/metas', metasRouter(db));
```

por:

```js
  app.use('/api/movimentacoes', movimentacoesRouter(db));
  app.use('/api/auth', authRouter(db));
  app.use('/api/metas', metasRouter(db));
  app.use('/api/config', configRouter(db));
```

- [ ] **Step 13: Rodar para verificar que passa**

Run: `node --test server/routes/config.test.js`
Expected: PASS — 4 tests, 0 failures.

- [ ] **Step 14: Rodar a suite completa do backend**

Run: `npm test`
Expected: todos os arquivos `*.test.js` em `server/` passam.

- [ ] **Step 15: Commit**

```bash
git add server/db.js server/db.test.js server/validation.js server/validation.test.js server/routes/config.js server/routes/config.test.js server/index.js
git commit -m "feat: add config table and GET/PUT config routes split by sensitivity"
```

---

### Task 7: Configuração via `.env`

**Files:**
- Modify: `server/index.js`
- Create: `.env.example`

**Interfaces:**
- Consumes: nada de tasks anteriores além do `server/index.js` já existente.
- Produces: `PORT`, `NODE_ENV`, `SESSION_TTL_HOURS` (já lido em `server/routes/auth.js` desde a Task 2), `DB_PATH` disponíveis via `process.env` quando `.env` existir na raiz do projeto.

- [ ] **Step 1: Carregar `.env` e usar `DB_PATH`**

Em `server/index.js`, troque:

```js
const express = require('express');
const path = require('node:path');
const { createDb } = require('./db');
const movimentacoesRouter = require('./routes/movimentacoes');
const authRouter = require('./routes/auth');
const metasRouter = require('./routes/metas');
const configRouter = require('./routes/config');
```

por:

```js
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
```

E troque:

```js
if (require.main === module) {
  const dbPath = path.join(__dirname, '..', 'data', 'estoque.sqlite');
  const db = createDb(dbPath);
```

por:

```js
if (require.main === module) {
  const dbPath = process.env.DB_PATH
    ? path.resolve(__dirname, '..', process.env.DB_PATH)
    : path.join(__dirname, '..', 'data', 'estoque.sqlite');
  const db = createDb(dbPath);
```

- [ ] **Step 2: Criar `.env.example`**

Create `.env.example`:

```
PORT=3000
NODE_ENV=development
SESSION_TTL_HOURS=168
DB_PATH=data/estoque.sqlite
```

- [ ] **Step 3: Rodar a suite completa para garantir que nada quebrou**

Run: `npm test`
Expected: todos os testes continuam passando (nenhum arquivo `.env` existe em CI/local por padrão, então o `catch` do Step 1 é exercitado silenciosamente).

- [ ] **Step 4: Verificação manual do `.env`**

```bash
cp .env.example .env
```

Edite `.env` e troque `PORT=3000` por `PORT=4000`. Rode:

```bash
npm start
```

Expected: imprime `Servidor rodando em http://localhost:4000`. Pare o servidor (Ctrl+C) e apague o `.env` de teste ou restaure `PORT=3000` antes de seguir (o `.env` real não é commitado — já está no `.gitignore`).

- [ ] **Step 5: Commit**

```bash
git add server/index.js .env.example
git commit -m "feat: load config from .env via process.loadEnvFile, add DB_PATH support"
```

---

### Task 8: Front-end — wrapper de API e sessão persistente (login/me/logout)

**Files:**
- Modify: `public/index.html`

**Interfaces:**
- Consumes: `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` (Task 2), `GET /api/movimentacoes`, `GET /api/metas`, `GET /api/config` (Tasks 4, 5, 6).
- Produces: `api(caminho, opcoes)`, `mapMovimentacao(row)`, `mapMeta(row)`, `carregarDados()`, caches `movimentacoesCache`/`metasCache`/`configCache`, `iniciarApp(papelApi)` — usados pelas Tasks 9, 10, 11.

- [ ] **Step 1: Adicionar o wrapper de API, os caches e os mapeadores**

Em `public/index.html`, troque:

```
var video=document.getElementById('video-cam');

function load(){try{return JSON.parse(localStorage.getItem(KEY))||[];}catch(e){return[];}}
function save(d){localStorage.setItem(KEY,JSON.stringify(d));}
function loadMetas(){try{return JSON.parse(localStorage.getItem(KM))||[];}catch(e){return[];}}
function saveMetas(m){localStorage.setItem(KM,JSON.stringify(m));}
function getMin(){return parseInt(localStorage.getItem(KMIN))||50;}
function salvarMin(){localStorage.setItem(KMIN,parseInt(document.getElementById('min-val').value)||50);mostrarAlerta('Estoque mínimo salvo!','success',2000);}
function getSenhaDono(){return localStorage.getItem(KSD)||'dono123';}
function getSenhaFunc(){return localStorage.getItem(KSF)||'func123';}
function getPC(){return parseFloat(localStorage.getItem(KPC))||0;}
function getPV(){return parseFloat(localStorage.getItem(KPV))||0;}
function getWA(){return localStorage.getItem(KWA)||'';}
```

por:

```
var video=document.getElementById('video-cam');

var movimentacoesCache=[],metasCache=[],configCache={preco_compra:0,preco_venda:0,whatsapp_numero:'',estoque_minimo:50};

async function api(caminho,opcoes){opcoes=opcoes||{};var res=await fetch(caminho,Object.assign({credentials:'include'},opcoes,{headers:Object.assign({'Content-Type':'application/json'},opcoes.headers||{})}));var body=null;if(res.status!==204)body=await res.json().catch(function(){return null;});if(!res.ok){var msg=(body&&body.errors&&body.errors.join(', '))||('Erro '+res.status);throw new Error(msg);}return body;}

function mapMovimentacao(row){var dt=new Date(row.criado_em.replace(' ','T'));return{id:row.id,tipo:row.tipo,qtd:row.quantidade,detalhe:row.detalhe,obs:row.observacao,usuario:row.usuario,data:dt.toLocaleString('pt-BR'),ts:dt.getTime()};}
function mapMeta(row){return{id:row.id,nome:row.nome,qtd:row.quantidade};}

async function carregarDados(){var resultados=await Promise.all([api('/api/movimentacoes'),api('/api/metas'),api('/api/config')]);movimentacoesCache=resultados[0].map(mapMovimentacao);metasCache=resultados[1].map(mapMeta);configCache=resultados[2];}

function load(){return movimentacoesCache;}
function save(d){movimentacoesCache=d;}
function loadMetas(){return metasCache;}
function saveMetas(m){metasCache=m;}
function getMin(){return configCache.estoque_minimo;}
function salvarMin(){localStorage.setItem(KMIN,parseInt(document.getElementById('min-val').value)||50);mostrarAlerta('Estoque mínimo salvo!','success',2000);}
function getPC(){return configCache.preco_compra;}
function getPV(){return configCache.preco_venda;}
function getWA(){return configCache.whatsapp_numero;}
```

Nota: `getSenhaDono`/`getSenhaFunc` foram removidas (o login agora vai para a API, não compara localmente); `salvarMin` fica temporariamente inalterada — será reescrita na Task 11 junto com `salvarWA`/`salvarPrecos`.

- [ ] **Step 2: Reescrever `entrar`/`sair` e adicionar restauração de sessão**

Troque:

```
var perfil='Dono';
function selecionarPerfil(p){perfil=p;document.getElementById('rbtn-dono').className='role-btn'+(p==='Dono'?' sel':'');document.getElementById('rbtn-func').className='role-btn'+(p==='Funcionário'?' sel':'');}
function entrar(){
  var s=document.getElementById('inp-senha').value;
  var ok=(perfil==='Dono'&&s===getSenhaDono())||(perfil==='Funcionário'&&s===getSenhaFunc());
  if(!ok){var el=document.getElementById('login-erro');el.style.display='block';el.textContent='Senha incorreta. Tente novamente.';return;}
  usuarioAtual=perfil;
  document.getElementById('tela-login').style.display='none';
  document.getElementById('tela-app').style.display='block';
  document.getElementById('usuario-badge').textContent=usuarioAtual;
  document.getElementById('data-atual').textContent=new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  var isFunc=usuarioAtual==='Funcionário';
  document.getElementById('nav-config').style.display=isFunc?'none':'';
  document.getElementById('config-dono-only').style.display=isFunc?'none':'';
  document.getElementById('nav-financeiro').style.display=isFunc?'none':'';
  document.getElementById('bnav-financeiro').style.display=isFunc?'none':'';
  var pc=getPC(),pv=getPV();
  if(pc)document.getElementById('preco-compra').value=pc;
  if(pv)document.getElementById('preco-venda').value=pv;
  var wa=getWA();if(wa)document.getElementById('wa-numero').value=wa;
  document.getElementById('min-val').value=getMin();
  document.getElementById('wa-limite').value=getMin();
  mutado=localStorage.getItem(KMUTE)==='1';
  document.getElementById('som-btn').textContent=mutado?'🔕':'🔔';
  updateCards();calcFinanceiro();
}
function sair(){document.getElementById('tela-app').style.display='none';document.getElementById('tela-login').style.display='block';document.getElementById('inp-senha').value='';document.getElementById('login-erro').style.display='none';if(stream){stream.getTracks().forEach(function(t){t.stop();});stream=null;}}
```

por:

```
var perfil='Dono';
function selecionarPerfil(p){perfil=p;document.getElementById('rbtn-dono').className='role-btn'+(p==='Dono'?' sel':'');document.getElementById('rbtn-func').className='role-btn'+(p==='Funcionário'?' sel':'');}

async function iniciarApp(papelApi){
  usuarioAtual=papelApi==='dono'?'Dono':'Funcionário';
  document.getElementById('tela-login').style.display='none';
  document.getElementById('tela-app').style.display='block';
  document.getElementById('usuario-badge').textContent=usuarioAtual;
  document.getElementById('data-atual').textContent=new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  var isFunc=usuarioAtual==='Funcionário';
  document.getElementById('nav-config').style.display=isFunc?'none':'';
  document.getElementById('config-dono-only').style.display=isFunc?'none':'';
  document.getElementById('nav-financeiro').style.display=isFunc?'none':'';
  document.getElementById('bnav-financeiro').style.display=isFunc?'none':'';
  await carregarDados();
  var pc=getPC(),pv=getPV();
  if(pc)document.getElementById('preco-compra').value=pc;
  if(pv)document.getElementById('preco-venda').value=pv;
  var wa=getWA();if(wa)document.getElementById('wa-numero').value=wa;
  document.getElementById('min-val').value=getMin();
  document.getElementById('wa-limite').value=getMin();
  mutado=localStorage.getItem(KMUTE)==='1';
  document.getElementById('som-btn').textContent=mutado?'🔕':'🔔';
  updateCards();calcFinanceiro();
}

async function entrar(){
  var s=document.getElementById('inp-senha').value;
  var el=document.getElementById('login-erro');
  el.style.display='none';
  try{
    var body=await api('/api/auth/login',{method:'POST',body:JSON.stringify({papel:perfil==='Dono'?'dono':'funcionario',senha:s})});
    await iniciarApp(body.papel);
  }catch(e){
    el.style.display='block';
    el.textContent='Senha incorreta. Tente novamente.';
  }
}

async function sair(){
  try{await api('/api/auth/logout',{method:'POST'});}catch(e){}
  document.getElementById('tela-app').style.display='none';
  document.getElementById('tela-login').style.display='block';
  document.getElementById('inp-senha').value='';
  document.getElementById('login-erro').style.display='none';
  if(stream){stream.getTracks().forEach(function(t){t.stop();});stream=null;}
}

(function restaurarSessao(){
  api('/api/auth/me').then(function(body){
    perfil=body.papel==='dono'?'Dono':'Funcionário';
    return iniciarApp(body.papel);
  }).catch(function(){});
})();
```

- [ ] **Step 3: Verificação manual**

```bash
npm start
```

1. Abra `http://localhost:3000`. Deve mostrar a tela de login (a chamada `GET /api/auth/me` sem cookie retorna 401, capturado pelo `.catch` silencioso).
2. Selecione "Dono", senha `dono123`, clique Entrar. Deve entrar na tela do app, com as abas Financeiro/Config visíveis.
3. Dê F5 (recarregar). Deve pular direto para a tela do app, sem pedir login de novo (sessão restaurada via cookie).
4. Clique "Sair". Deve voltar para a tela de login. Dê F5 de novo — deve continuar na tela de login (sessão foi apagada no logout).
5. Faça login como "Funcionário", senha `func123`. As abas Financeiro/Config devem ficar escondidas, como hoje.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat(front): consume session API (login/me/logout) instead of local password check"
```

---

### Task 9: Front-end — movimentações via API

**Files:**
- Modify: `public/index.html`

**Interfaces:**
- Consumes: `api`, `mapMovimentacao`, `movimentacoesCache` (Task 8), `POST/PUT/DELETE /api/movimentacoes` (Task 4).
- Produces: `registrar`, `confirmarEntrada`, `limparHistorico` passam a persistir via API. Nenhuma task depende disso.

- [ ] **Step 1: Reescrever `registrar`**

Troque:

```
function registrar(tipo){
  var d=load(),u=usuarioAtual;
  if(tipo==='entrada'){
    var q=parseInt(document.getElementById('in-qtd').value)||0,f=document.getElementById('in-forn').value.trim();
    if(q<=0){mostrarAlerta('Informe uma quantidade válida.','danger',3000);return;}
    d.push({tipo:'entrada',qtd:q,detalhe:f||'—',obs:document.getElementById('in-obs').value.trim(),usuario:u,data:new Date().toLocaleString('pt-BR'),ts:Date.now()});
    document.getElementById('in-qtd').value='';document.getElementById('in-forn').value='';document.getElementById('in-obs').value='';
    save(d);updateCards();calcFinanceiro();mostrarAlerta('✅ Entrada de '+q+' cocos registrada!','success',3000);
  }else{
    var q2=parseInt(document.getElementById('out-qtd').value)||0,dest=document.getElementById('out-dest').value.trim(),s=calcSaldo(d);
    if(q2<=0){mostrarAlerta('Informe uma quantidade válida.','danger',3000);return;}
    if(q2>s){mostrarAlerta('❌ Saldo insuficiente! Saldo: '+s+' cocos.','danger',4000);return;}
    d.push({tipo:'saida',qtd:q2,detalhe:dest||'—',obs:document.getElementById('out-obs').value.trim(),usuario:u,data:new Date().toLocaleString('pt-BR'),ts:Date.now()});
    document.getElementById('out-qtd').value='';document.getElementById('out-dest').value='';document.getElementById('out-obs').value='';
    save(d);updateCards();calcFinanceiro();mostrarAlerta('✅ Saída de '+q2+' cocos registrada!','success',3000);
  }
}
```

por:

```
async function registrar(tipo){var u=usuarioAtual;if(tipo==='entrada'){var q=parseInt(document.getElementById('in-qtd').value)||0,f=document.getElementById('in-forn').value.trim();if(q<=0){mostrarAlerta('Informe uma quantidade válida.','danger',3000);return;}try{var row=await api('/api/movimentacoes',{method:'POST',body:JSON.stringify({tipo:'entrada',quantidade:q,detalhe:f||'—',observacao:document.getElementById('in-obs').value.trim(),usuario:u})});movimentacoesCache.unshift(mapMovimentacao(row));document.getElementById('in-qtd').value='';document.getElementById('in-forn').value='';document.getElementById('in-obs').value='';updateCards();calcFinanceiro();mostrarAlerta('✅ Entrada de '+q+' cocos registrada!','success',3000);}catch(e){mostrarAlerta(e.message,'danger',3000);}}else{var q2=parseInt(document.getElementById('out-qtd').value)||0,dest=document.getElementById('out-dest').value.trim(),s=calcSaldo(load());if(q2<=0){mostrarAlerta('Informe uma quantidade válida.','danger',3000);return;}if(q2>s){mostrarAlerta('❌ Saldo insuficiente! Saldo: '+s+' cocos.','danger',4000);return;}try{var row2=await api('/api/movimentacoes',{method:'POST',body:JSON.stringify({tipo:'saida',quantidade:q2,detalhe:dest||'—',observacao:document.getElementById('out-obs').value.trim(),usuario:u})});movimentacoesCache.unshift(mapMovimentacao(row2));document.getElementById('out-qtd').value='';document.getElementById('out-dest').value='';document.getElementById('out-obs').value='';updateCards();calcFinanceiro();mostrarAlerta('✅ Saída de '+q2+' cocos registrada!','success',3000);}catch(e){mostrarAlerta(e.message,'danger',3000);}}}
```

- [ ] **Step 2: Reescrever `confirmarEntrada`**

Troque:

```
function confirmarEntrada(origem){
  var d=load(),u=usuarioAtual,qtd=0,forn='',obs='';
  if(origem==='camera'){qtd=parseInt(document.getElementById('qtd-c').value)||0;forn=document.getElementById('forn-c').value.trim();obs=document.getElementById('obs-c').value.trim()||'Câmera';}
  else if(origem==='galeria'){qtd=parseInt(document.getElementById('qtd-g').value)||0;forn=document.getElementById('forn-g').value.trim();obs=document.getElementById('obs-g').value.trim()||'Galeria/Print';}
  else{qtd=parseInt(document.getElementById('qtd-caixas').value)||0;forn=document.getElementById('forn-caixas').value.trim();obs=document.getElementById('obs-caixas').value.trim()||'Por volumes';}
  if(qtd<=0){mostrarAlerta('Informe uma quantidade válida.','danger',3000);return;}
  d.push({tipo:'entrada',qtd:qtd,detalhe:forn||'—',obs:obs,usuario:u,data:new Date().toLocaleString('pt-BR'),ts:Date.now()});
  save(d);updateCards();calcFinanceiro();mostrarAlerta('✅ '+qtd+' cocos registrados!','success',3000);
  if(origem==='camera'){pontosC=[];linhaC=null;atualizarContadores('camera');retomarCam();document.getElementById('forn-c').value='';document.getElementById('obs-c').value='';}
  else if(origem==='galeria'){pontosG=[];linhaG=null;if(snapG)ctxG.putImageData(snapG,0,0);atualizarContadores('galeria');document.getElementById('forn-g').value='';document.getElementById('obs-g').value='';}
  else{document.getElementById('num-vol').value='';document.getElementById('qtd-caixas').value='';document.getElementById('forn-caixas').value='';document.getElementById('obs-caixas').value='';document.getElementById('resultado-box').style.display='none';document.getElementById('tipo-emb').value='';}
}
```

por:

```
async function confirmarEntrada(origem){var u=usuarioAtual,qtd=0,forn='',obs='';if(origem==='camera'){qtd=parseInt(document.getElementById('qtd-c').value)||0;forn=document.getElementById('forn-c').value.trim();obs=document.getElementById('obs-c').value.trim()||'Câmera';}else if(origem==='galeria'){qtd=parseInt(document.getElementById('qtd-g').value)||0;forn=document.getElementById('forn-g').value.trim();obs=document.getElementById('obs-g').value.trim()||'Galeria/Print';}else{qtd=parseInt(document.getElementById('qtd-caixas').value)||0;forn=document.getElementById('forn-caixas').value.trim();obs=document.getElementById('obs-caixas').value.trim()||'Por volumes';}if(qtd<=0){mostrarAlerta('Informe uma quantidade válida.','danger',3000);return;}try{var row=await api('/api/movimentacoes',{method:'POST',body:JSON.stringify({tipo:'entrada',quantidade:qtd,detalhe:forn||'—',observacao:obs,usuario:u})});movimentacoesCache.unshift(mapMovimentacao(row));}catch(e){mostrarAlerta(e.message,'danger',3000);return;}updateCards();calcFinanceiro();mostrarAlerta('✅ '+qtd+' cocos registrados!','success',3000);if(origem==='camera'){pontosC=[];linhaC=null;atualizarContadores('camera');retomarCam();document.getElementById('forn-c').value='';document.getElementById('obs-c').value='';}else if(origem==='galeria'){pontosG=[];linhaG=null;if(snapG)ctxG.putImageData(snapG,0,0);atualizarContadores('galeria');document.getElementById('forn-g').value='';document.getElementById('obs-g').value='';}else{document.getElementById('num-vol').value='';document.getElementById('qtd-caixas').value='';document.getElementById('forn-caixas').value='';document.getElementById('obs-caixas').value='';document.getElementById('resultado-box').style.display='none';document.getElementById('tipo-emb').value='';}}
```

- [ ] **Step 3: Reescrever `limparHistorico`**

Troque:

```
function limparHistorico(){if(!confirm('Limpar todo o histórico?'))return;save([]);updateCards();calcFinanceiro();if(chartMov)chartMov.destroy();if(chartSaldo)chartSaldo.destroy();mostrarAlerta('Histórico limpo.','success',3000);}
```

por:

```
async function limparHistorico(){if(!confirm('Limpar todo o histórico?'))return;try{var ids=movimentacoesCache.map(function(r){return r.id;});for(var i=0;i<ids.length;i++){await api('/api/movimentacoes/'+ids[i],{method:'DELETE'});}movimentacoesCache=[];updateCards();calcFinanceiro();if(chartMov)chartMov.destroy();if(chartSaldo)chartSaldo.destroy();mostrarAlerta('Histórico limpo.','success',3000);}catch(e){mostrarAlerta(e.message,'danger',3000);}}
```

Nota: `limparHistorico` só é acessível pelo Dono hoje (o botão fica dentro de `#tab-config`, escondida do Funcionário), então usar o `DELETE` dono-only aqui é consistente com o comportamento atual.

- [ ] **Step 4: Verificação manual**

```bash
npm start
```

1. Login como Dono. Na aba Entrada, registre uma entrada de 50 cocos. O card de saldo deve atualizar.
2. Dê F5. A movimentação deve continuar aparecendo no Histórico (foi persistida no SQLite, não só na memória).
3. Na aba Saída, tente registrar uma saída maior que o saldo atual — deve mostrar o alerta de saldo insuficiente sem nenhuma chamada de rede (validação client-side preservada).
4. Na aba Config, clique "Limpar histórico" e confirme. A lista deve esvaziar. Dê F5 — deve continuar vazia.

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "feat(front): persist movimentacoes via API instead of localStorage"
```

---

### Task 10: Front-end — metas via API

**Files:**
- Modify: `public/index.html`

**Interfaces:**
- Consumes: `api`, `mapMeta`, `metasCache` (Task 8), `POST/DELETE /api/metas` (Task 5).
- Produces: `addMeta`, `removeMeta` passam a persistir via API.

- [ ] **Step 1: Reescrever `addMeta` e `removeMeta`**

Troque:

```
function addMeta(){var n=document.getElementById('meta-nome').value.trim(),q=parseInt(document.getElementById('meta-qtd').value)||0;if(!n||q<=0){mostrarAlerta('Preencha nome e quantidade.','danger',3000);return;}var m=loadMetas();m.push({id:Date.now(),nome:n,qtd:q});saveMetas(m);document.getElementById('meta-nome').value='';document.getElementById('meta-qtd').value='';renderMetas();mostrarAlerta('🎯 Meta "'+n+'" adicionada!','success',2000);}
function removeMeta(id){saveMetas(loadMetas().filter(function(m){return m.id!==id;}));renderMetas();}
```

por:

```
async function addMeta(){var n=document.getElementById('meta-nome').value.trim(),q=parseInt(document.getElementById('meta-qtd').value)||0;if(!n||q<=0){mostrarAlerta('Preencha nome e quantidade.','danger',3000);return;}try{var row=await api('/api/metas',{method:'POST',body:JSON.stringify({nome:n,quantidade:q})});metasCache.push(mapMeta(row));document.getElementById('meta-nome').value='';document.getElementById('meta-qtd').value='';renderMetas();mostrarAlerta('🎯 Meta "'+n+'" adicionada!','success',2000);}catch(e){mostrarAlerta(e.message,'danger',3000);}}
async function removeMeta(id){try{await api('/api/metas/'+id,{method:'DELETE'});metasCache=metasCache.filter(function(m){return m.id!==id;});renderMetas();}catch(e){mostrarAlerta(e.message,'danger',3000);}}
```

- [ ] **Step 2: Verificação manual**

```bash
npm start
```

1. Login como Funcionário (a aba Metas é visível para os dois papéis). Adicione uma meta "Meta teste" com quantidade 100.
2. Dê F5. A meta deve continuar na lista.
3. Remova a meta. Dê F5 — deve continuar removida.

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat(front): persist metas via API instead of localStorage"
```

---

### Task 11: Front-end — configuração (preços/alertas) e troca de senha via API

**Files:**
- Modify: `public/index.html`

**Interfaces:**
- Consumes: `api`, `configCache` (Task 8), `PUT /api/config/precos`, `PUT /api/config/alertas` (Task 6), `PUT /api/auth/senha` (Task 3).
- Produces: `salvarPrecos`, `salvarWA`, `salvarMin`, `salvarSenhas` passam a persistir via API. Nenhuma task depende disso — é o último ponto de integração do front.

- [ ] **Step 1: Reescrever `salvarPrecos`**

Troque:

```
function salvarPrecos(){var pc=parseFloat(document.getElementById('preco-compra').value)||0,pv=parseFloat(document.getElementById('preco-venda').value)||0;if(pc<=0||pv<=0){mostrarAlerta('Informe preços válidos.','danger',3000);return;}localStorage.setItem(KPC,pc);localStorage.setItem(KPV,pv);calcFinanceiro();updateCards();mostrarAlerta('Preços salvos!','success',2000);}
```

por:

```
async function salvarPrecos(){var pc=parseFloat(document.getElementById('preco-compra').value)||0,pv=parseFloat(document.getElementById('preco-venda').value)||0;if(pc<=0||pv<=0){mostrarAlerta('Informe preços válidos.','danger',3000);return;}try{configCache=await api('/api/config/precos',{method:'PUT',body:JSON.stringify({preco_compra:pc,preco_venda:pv})});calcFinanceiro();updateCards();mostrarAlerta('Preços salvos!','success',2000);}catch(e){mostrarAlerta(e.message,'danger',3000);}}
```

- [ ] **Step 2: Reescrever `salvarWA`**

Troque:

```
function salvarWA(){var n=document.getElementById('wa-numero').value.replace(/\D/g,''),lim=parseInt(document.getElementById('wa-limite').value)||50;if(!n||n.length<10){mostrarAlerta('Número inválido. Use DDD + número.','danger',3000);return;}localStorage.setItem(KWA,n);localStorage.setItem(KMIN,lim);document.getElementById('min-val').value=lim;mostrarAlerta('Configuração salva!','success',2000);testarMsgWA();}
```

por:

```
async function salvarWA(){var n=document.getElementById('wa-numero').value.replace(/\D/g,''),lim=parseInt(document.getElementById('wa-limite').value)||50;if(!n||n.length<10){mostrarAlerta('Número inválido. Use DDD + número.','danger',3000);return;}try{configCache=await api('/api/config/alertas',{method:'PUT',body:JSON.stringify({whatsapp_numero:n,estoque_minimo:lim})});document.getElementById('min-val').value=lim;mostrarAlerta('Configuração salva!','success',2000);testarMsgWA();}catch(e){mostrarAlerta(e.message,'danger',3000);}}
```

- [ ] **Step 3: Reescrever `salvarMin`**

Troque:

```
function salvarMin(){localStorage.setItem(KMIN,parseInt(document.getElementById('min-val').value)||50);mostrarAlerta('Estoque mínimo salvo!','success',2000);}
```

por:

```
async function salvarMin(){var v=parseInt(document.getElementById('min-val').value)||50;try{configCache=await api('/api/config/alertas',{method:'PUT',body:JSON.stringify({whatsapp_numero:configCache.whatsapp_numero,estoque_minimo:v})});mostrarAlerta('Estoque mínimo salvo!','success',2000);}catch(e){mostrarAlerta(e.message,'danger',3000);}}
```

- [ ] **Step 4: Reescrever `salvarSenhas`**

Troque:

```
function salvarSenhas(){if(usuarioAtual!=='Dono'){mostrarAlerta('Apenas o Dono pode alterar senhas.','danger',3000);return;}var sd=document.getElementById('nova-senha-dono').value,sf=document.getElementById('nova-senha-func').value;if(sd&&sd.length>=4)localStorage.setItem(KSD,sd);if(sf&&sf.length>=4)localStorage.setItem(KSF,sf);mostrarAlerta('Senhas atualizadas!','success',2500);document.getElementById('nova-senha-dono').value='';document.getElementById('nova-senha-func').value='';}
```

por:

```
async function salvarSenhas(){if(usuarioAtual!=='Dono'){mostrarAlerta('Apenas o Dono pode alterar senhas.','danger',3000);return;}var sd=document.getElementById('nova-senha-dono').value,sf=document.getElementById('nova-senha-func').value;try{if(sd&&sd.length>=4)await api('/api/auth/senha',{method:'PUT',body:JSON.stringify({papel:'dono',novaSenha:sd})});if(sf&&sf.length>=4)await api('/api/auth/senha',{method:'PUT',body:JSON.stringify({papel:'funcionario',novaSenha:sf})});mostrarAlerta('Senhas atualizadas!','success',2500);document.getElementById('nova-senha-dono').value='';document.getElementById('nova-senha-func').value='';}catch(e){mostrarAlerta(e.message,'danger',3000);}}
```

- [ ] **Step 5: Remover as constantes de `localStorage` que ficaram sem uso**

Troque:

```
var KEY='coco_v4',KM='coco_metas_v4',KSD='coco_sd',KSF='coco_sf',KPC='coco_pc',KPV='coco_pv',KWA='coco_wa',KMIN='coco_min',KMUTE='coco_mute';
```

por:

```
var KMUTE='coco_mute';
```

`KMUTE` é a única chave de `localStorage` que continua em uso (preferência de som, fora de escopo desta integração). Todas as outras (`KEY`, `KM`, `KSD`, `KSF`, `KPC`, `KPV`, `KWA`, `KMIN`) foram substituídas pelas chamadas de API nas Tasks 8–11.

- [ ] **Step 6: Verificação manual**

```bash
npm start
```

1. Login como Dono. Na aba Financeiro, informe preço de compra `2.50` e venda `4.00`, salve. Dê F5 — os valores devem continuar preenchidos.
2. Ainda como Dono, verifique que a aba Financeiro some ao logar como Funcionário (continua dono-only).
3. Login como Funcionário. Na aba WhatsApp, informe um número válido e limite `30`, salve. Dê F5, logue de novo como Funcionário — os valores devem persistir (confirma que Funcionário pode escrever alertas).
4. Como Dono, na aba Config, troque a senha do Funcionário para `novaSenha1`. Clique Sair, faça login como Funcionário com a nova senha — deve funcionar. A senha antiga (`func123`) não deve mais funcionar.
5. Rode `npm test` uma última vez para confirmar que a suite completa do backend continua passando (esta task só mexeu no front-end).

- [ ] **Step 7: Commit**

```bash
git add public/index.html
git commit -m "feat(front): persist config (precos/alertas) and password change via API"
```

---

### Task 12: README e verificação end-to-end final

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: o app completo das Tasks 1–11.
- Produces: nada — última task do plano.

- [ ] **Step 1: Reescrever `README.md`**

Replace the full contents of `README.md` with:

```markdown
# Estoque Coco Verde

Sistema de controle de estoque de coco verde: registro de entradas e
saidas, metas, precos e alertas de estoque minimo.

## Front-end

`public/index.html` e uma aplicacao de pagina unica que consome a API
do backend (`/api/...`) para tudo: movimentacoes, metas, precos, numero
de WhatsApp e estoque minimo. A sessao de login e persistida por cookie
httpOnly, entao recarregar a pagina mantem o usuario logado.

## Backend

Servidor Express com banco SQLite (`node:sqlite`, nativo do Node, sem
dependencia externa) serve o front-end e expoe a API completa em `/api`.

### Rodando localmente

Requer Node.js 24 ou superior.

```bash
npm install
npm start
```

Abra `http://localhost:3000`. Usuarios padrao (semeados no primeiro
start): `dono`/`dono123` e `funcionario`/`func123`.

Para desenvolvimento com recarregamento automático do servidor:

```bash
npm run dev
```

### Configuração via `.env`

Copie `.env.example` para `.env` e ajuste conforme necessário:

```bash
cp .env.example .env
```

- `PORT` — porta do servidor (default `3000`).
- `NODE_ENV` — `production` ativa o atributo `Secure` no cookie de
  sessão (exige HTTPS).
- `SESSION_TTL_HOURS` — duração da sessão de login em horas (default
  `168` = 7 dias).
- `DB_PATH` — caminho do arquivo SQLite, relativo à raiz do projeto
  (default `data/estoque.sqlite`).

### Rodando os testes

```bash
npm test
```

### Sessão e autenticação

- `POST /api/auth/login` — `{ papel: "dono"|"funcionario", senha }`.
  Sucesso cria uma sessão (tabela `sessoes`) e retorna um cookie
  httpOnly `sid`; `200 { papel }` ou `401`.
- `GET /api/auth/me` — `200 { papel }` com sessão válida, `401` sem.
- `POST /api/auth/logout` — apaga a sessão e limpa o cookie.
- `PUT /api/auth/senha` (dono-only) — `{ papel, novaSenha }`, regrava o
  hash bcrypt daquele papel.

### API

- `GET /api/movimentacoes` (logado) — lista as movimentações.
- `POST /api/movimentacoes` (logado) — registra uma movimentação.
- `PUT /api/movimentacoes/:id` (dono) — edita uma movimentação.
- `DELETE /api/movimentacoes/:id` (dono) — remove uma movimentação.
- `GET /api/metas` (logado) — lista as metas.
- `POST /api/metas` (logado) — cria uma meta (`{ nome, quantidade }`).
- `DELETE /api/metas/:id` (logado) — remove uma meta.
- `GET /api/config` (logado) — retorna preços, WhatsApp e estoque
  mínimo.
- `PUT /api/config/precos` (dono) — atualiza `preco_compra`/`preco_venda`.
- `PUT /api/config/alertas` (logado) — atualiza `whatsapp_numero`/`estoque_minimo`.

Toda rota de escrita responde `400` com `{ errors: [...] }` quando os
dados são inválidos; nada é gravado nesse caso.

### Segurança

- Todo acesso ao SQLite usa queries parametrizadas (`db.prepare(sql).run(...)`),
  nunca concatenacao de string.
- Todo input recebido pelas rotas é validado (`server/validation.js`)
  antes de qualquer gravação.
- Senhas são armazenadas apenas como hash bcrypt (`server/db.js`,
  tabela `usuarios`), nunca em texto puro.
- Sessão de login usa cookie httpOnly + `SameSite=Lax`; token opaco
  gerado com `node:crypto`, validado contra a tabela `sessoes` em cada
  requisição autenticada.

## Estrutura de pastas

```
public/                 front-end estatico (index.html)
server/                 backend Express
  index.js               monta o app e as rotas, carrega .env
  db.js                  acesso ao SQLite (schema + seed)
  validation.js          validacao de input
  middleware/
    auth.js               sessao (cookie), requireAuth/requireDono
  routes/                 rotas da API
data/                    banco SQLite, criado em runtime (nao versionado)
.env.example             variaveis de ambiente documentadas
```
```

- [ ] **Step 2: Verificação manual — suite completa**

Run: `npm test`
Expected: todos os testes de `server/**/*.test.js` passam (validação, db, middleware, auth, movimentações, metas, config).

- [ ] **Step 3: Verificação manual — fluxo completo no navegador**

Run: `npm start`

1. Abra `http://localhost:3000` em uma aba anônima/privada (sem cookies antigos).
2. Login como Dono → registre uma entrada, uma saída, uma meta, ajuste preços, WhatsApp e estoque mínimo, troque a senha do Funcionário.
3. Recarregue a página — tudo deve persistir (sessão + todos os dados).
4. Saia, faça login como Funcionário com a senha nova → confirme que Financeiro/Config seguem escondidos, mas Metas e WhatsApp funcionam.
5. Inspecione `data/estoque.sqlite` para confirmar que não há senha em texto puro:

```bash
node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('data/estoque.sqlite');console.log(db.prepare('SELECT papel, senha_hash FROM usuarios').all())"
```

Expected: `senha_hash` começa com `$2` (bcrypt), não com a senha em texto.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document session, config routes, and .env for the integrated app"
```
