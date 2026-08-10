# Backend Scaffold (Node.js + Express + SQLite) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a Node.js/Express/SQLite backend scaffold for the coco-verde stock app, alongside the existing static front-end, without changing the front-end's current localStorage-based behavior.

**Architecture:** An Express app serves `public/index.html` (the unmodified current front-end) as static content and exposes two example JSON APIs (`/api/movimentacoes`, `/api/auth/login`) backed by a SQLite database accessed through Node's built-in `node:sqlite` module. All writes go through parameterized prepared statements and a shared validation layer; passwords are stored only as bcrypt hashes.

**Tech Stack:** Node.js v24 (built-in `node:sqlite`, `node:test`, `node --watch`), Express 5, bcryptjs 3 (pure-JS bcrypt, no native build step). No ORM, no test framework beyond Node's built-in `node:test`/`node:assert`.

## Global Constraints

- Node.js v24+ is required (`node:sqlite` was verified working on the dev machine's v24.18.1 with no `--experimental-sqlite` flag needed). Record this as `"engines": { "node": ">=24.0.0" }` in `package.json`.
- Runtime dependencies are limited to `express` (`^5.2.1`) and `bcryptjs` (`^3.0.3`). Do not add nodemon, an ORM, supertest, or any other package — use `node --watch` for dev reload and `node:test` + global `fetch` for HTTP-level tests.
- Every SQL statement that includes a value from outside the source code (request body, query string) MUST use a parameterized prepared statement (`db.prepare(sql).run(...params)` / `.get(...params)` / `.all(...params)` with `?` placeholders). Never build SQL by concatenating or interpolating a value into the string.
- Every field coming from the front-end (HTTP request body) MUST be validated by a function in `server/validation.js` before any `INSERT`/`UPDATE`. If validation fails, the route responds `400` with the list of errors and performs no database write.
- Passwords are never stored, logged, or returned in plain text. Only `bcrypt` hashes (via `bcryptjs`, cost factor `10`) are persisted, in the `usuarios` table.
- `public/index.html` (the moved copy of the current front-end) must not be modified in this plan — its content is byte-for-byte identical to the current `index.html`.
- All backend code is CommonJS (`require`/`module.exports`), matching Node's default module system — no `"type": "module"` in `package.json`.

---

### Task 1: Project scaffolding

**Files:**
- Create: `public/` (directory, via `git mv index.html public/index.html`)
- Create: `data/` (directory; the SQLite file itself is created at runtime, not committed)
- Create: `package.json`
- Create: `.gitignore`
- Delete: `index(2).html`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: an `npm install`-able project root with `express` and `bcryptjs` available in `node_modules`, and the front-end reachable at `public/index.html`. Later tasks assume `require('express')` and `require('bcryptjs')` resolve, and that `public/index.html` exists.

- [ ] **Step 1: Move the front-end into `public/`**

```bash
mkdir -p public
git mv index.html public/index.html
```

- [ ] **Step 2: Remove the duplicate file**

```bash
git rm "index(2).html"
```

- [ ] **Step 3: Create `package.json`**

```json
{
  "name": "estoque-coco-verde",
  "version": "1.0.0",
  "private": true,
  "description": "Backend para gerenciamento de entradas e saidas de estoque de coco verde",
  "main": "server/index.js",
  "engines": {
    "node": ">=24.0.0"
  },
  "scripts": {
    "start": "node server/index.js",
    "dev": "node --watch server/index.js",
    "test": "node --test"
  },
  "dependencies": {
    "bcryptjs": "^3.0.3",
    "express": "^5.2.1"
  }
}
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
data/
.env
```

- [ ] **Step 5: Install dependencies**

```bash
npm install
```

Expected: exits `0`, creates `node_modules/` and `package-lock.json` with `express` and `bcryptjs` present.

- [ ] **Step 6: Commit**

```bash
git add public/index.html "index(2).html" package.json package-lock.json .gitignore
git commit -m "chore: scaffold Node/Express/SQLite backend project structure"
```

Note: `git add "index(2).html"` stages its removal (it was already `git rm`'d in Step 2); `git status` should show it as deleted, `public/index.html` as renamed/added, and the new files as added.

---

### Task 2: Input validation layer

**Files:**
- Create: `server/validation.js`
- Test: `server/validation.test.js`

**Interfaces:**
- Consumes: nothing beyond plain JS objects (no dependency on Express or the database).
- Produces:
  - `validarMovimentacao(body)` → `{ valid: boolean, errors: string[], data?: { tipo: string, quantidade: number, detalhe: string, observacao: string, usuario: string } }`
  - `validarLogin(body)` → `{ valid: boolean, errors: string[], data?: { papel: string, senha: string } }`
  - Both are used by Task 4 (`routes/movimentacoes.js`) and Task 5 (`routes/auth.js`) respectively.

- [ ] **Step 1: Write the failing tests**

Create `server/validation.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { validarMovimentacao, validarLogin } = require('./validation');

test('validarMovimentacao aceita dados validos e sanitiza texto', () => {
  const result = validarMovimentacao({
    tipo: 'entrada',
    quantidade: '10',
    detalhe: '  Fornecedor X  ',
    observacao: '',
    usuario: 'Ana',
  });

  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.data, {
    tipo: 'entrada',
    quantidade: 10,
    detalhe: 'Fornecedor X',
    observacao: '',
    usuario: 'Ana',
  });
});

test('validarMovimentacao rejeita tipo fora de entrada/saida', () => {
  const result = validarMovimentacao({ tipo: 'transferencia', quantidade: 5 });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test('validarMovimentacao rejeita quantidade zero ou negativa', () => {
  assert.strictEqual(validarMovimentacao({ tipo: 'saida', quantidade: 0 }).valid, false);
  assert.strictEqual(validarMovimentacao({ tipo: 'saida', quantidade: -3 }).valid, false);
});

test('validarMovimentacao rejeita quantidade nao numerica', () => {
  const result = validarMovimentacao({ tipo: 'entrada', quantidade: 'abc' });
  assert.strictEqual(result.valid, false);
});

test('validarLogin rejeita papel invalido', () => {
  const result = validarLogin({ papel: 'admin', senha: '123456' });
  assert.strictEqual(result.valid, false);
});

test('validarLogin rejeita senha vazia', () => {
  const result = validarLogin({ papel: 'dono', senha: '' });
  assert.strictEqual(result.valid, false);
});

test('validarLogin aceita papel e senha validos', () => {
  const result = validarLogin({ papel: 'dono', senha: 'dono123' });
  assert.deepStrictEqual(result, {
    valid: true,
    errors: [],
    data: { papel: 'dono', senha: 'dono123' },
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test server/validation.test.js`
Expected: FAIL — `Error: Cannot find module './validation'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `server/validation.js`:

```js
const TIPOS_VALIDOS = ['entrada', 'saida'];
const PAPEIS_VALIDOS = ['dono', 'funcionario'];
const MAX_TEXTO = 200;

function limitarTexto(valor) {
  return typeof valor === 'string' ? valor.trim().slice(0, MAX_TEXTO) : '';
}

function validarMovimentacao(body) {
  body = body || {};
  const errors = [];

  if (!TIPOS_VALIDOS.includes(body.tipo)) {
    errors.push(`tipo deve ser um de: ${TIPOS_VALIDOS.join(', ')}`);
  }

  const quantidade = Number(body.quantidade);
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    errors.push('quantidade deve ser um numero inteiro positivo');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    data: {
      tipo: body.tipo,
      quantidade,
      detalhe: limitarTexto(body.detalhe),
      observacao: limitarTexto(body.observacao),
      usuario: limitarTexto(body.usuario),
    },
  };
}

function validarLogin(body) {
  body = body || {};
  const errors = [];

  if (!PAPEIS_VALIDOS.includes(body.papel)) {
    errors.push(`papel deve ser um de: ${PAPEIS_VALIDOS.join(', ')}`);
  }
  if (typeof body.senha !== 'string' || body.senha.length === 0) {
    errors.push('senha e obrigatoria');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [], data: { papel: body.papel, senha: body.senha } };
}

module.exports = { validarMovimentacao, validarLogin };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test server/validation.test.js`
Expected: PASS — 7 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add server/validation.js server/validation.test.js
git commit -m "feat: add input validation for movimentacoes and login"
```

---

### Task 3: SQLite access layer

**Files:**
- Create: `server/db.js`
- Test: `server/db.test.js`

**Interfaces:**
- Consumes: `bcryptjs` (`hashSync`, `compareSync`) from Task 1's dependencies.
- Produces: `createDb(dbPath)` → a `node:sqlite` `DatabaseSync` instance, with the `movimentacoes` and `usuarios` tables created (`CREATE TABLE IF NOT EXISTS`) and `usuarios` seeded with `dono`/`funcionario` rows (bcrypt-hashed passwords) the first time it's called against a given file. Pass `':memory:'` for an ephemeral in-test database. Task 4 and Task 5 call `createDb` to get the `db` object they pass into their routers.

- [ ] **Step 1: Write the failing tests**

Create `server/db.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test server/db.test.js`
Expected: FAIL — `Error: Cannot find module './db'`.

- [ ] **Step 3: Write the implementation**

Create `server/db.js`:

```js
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

function createDb(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA);
  seedUsuarios(db);
  return db;
}

module.exports = { createDb };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test server/db.test.js`
Expected: PASS — 4 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add server/db.js server/db.test.js
git commit -m "feat: add SQLite access layer with schema and bcrypt-seeded usuarios"
```

---

### Task 4: Express app + movimentações API

**Files:**
- Create: `server/index.js`
- Create: `server/routes/movimentacoes.js`
- Test: `server/routes/movimentacoes.test.js`

**Interfaces:**
- Consumes: `createDb` from Task 3 (`server/db.js`), `validarMovimentacao` from Task 2 (`server/validation.js`).
- Produces:
  - `movimentacoesRouter(db)` (in `server/routes/movimentacoes.js`) → an Express `Router` with `GET /` and `POST /`. Task 5 follows the same `(db) => Router` pattern for its own router.
  - `createApp(db)` (in `server/index.js`) → an Express `app` with JSON body parsing, `public/` served as static, and `movimentacoesRouter(db)` mounted at `/api/movimentacoes`. Exported as `module.exports = { createApp }`. Task 5 modifies this file to also mount its router. When run directly (`node server/index.js`), the file creates a persistent `db` via `createDb(path to data/estoque.sqlite)` and calls `app.listen`.

- [ ] **Step 1: Write the failing test**

Create `server/routes/movimentacoes.test.js`:

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test server/routes/movimentacoes.test.js`
Expected: FAIL — `Error: Cannot find module '../index'` (neither `server/index.js` nor `server/routes/movimentacoes.js` exist yet).

- [ ] **Step 3: Write the router implementation**

Create `server/routes/movimentacoes.js`:

```js
const express = require('express');
const { validarMovimentacao } = require('../validation');

function movimentacoesRouter(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const rows = db.prepare('SELECT * FROM movimentacoes ORDER BY id DESC').all();
    res.json(rows);
  });

  router.post('/', (req, res) => {
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

  return router;
}

module.exports = movimentacoesRouter;
```

- [ ] **Step 4: Write the Express app**

Create `server/index.js`:

```js
const express = require('express');
const path = require('node:path');
const { createDb } = require('./db');
const movimentacoesRouter = require('./routes/movimentacoes');

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use('/api/movimentacoes', movimentacoesRouter(db));
  return app;
}

if (require.main === module) {
  const dbPath = path.join(__dirname, '..', 'data', 'estoque.sqlite');
  const db = createDb(dbPath);
  const app = createApp(db);
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
  });
}

module.exports = { createApp };
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test server/routes/movimentacoes.test.js`
Expected: PASS — 2 tests, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add server/index.js server/routes/movimentacoes.js server/routes/movimentacoes.test.js
git commit -m "feat: add Express app serving public/ and the movimentacoes API"
```

---

### Task 5: Auth API

**Files:**
- Modify: `server/index.js` (mount the new router)
- Create: `server/routes/auth.js`
- Test: `server/routes/auth.test.js`

**Interfaces:**
- Consumes: `createDb` (Task 3), `validarLogin` (Task 2), `createApp` (Task 4, now also mounting this router).
- Produces: `authRouter(db)` → an Express `Router` with `POST /login`. No later task depends on this beyond the manual verification in Task 6.

- [ ] **Step 1: Write the failing tests**

Create `server/routes/auth.test.js`:

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test server/routes/auth.test.js`
Expected: FAIL — `Error: Cannot find module '../routes/auth'` (route not mounted, route file doesn't exist).

- [ ] **Step 3: Write the router implementation**

Create `server/routes/auth.js`:

```js
const express = require('express');
const bcrypt = require('bcryptjs');
const { validarLogin } = require('../validation');

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

    res.status(200).json({ papel });
  });

  return router;
}

module.exports = authRouter;
```

- [ ] **Step 4: Mount the router in `server/index.js`**

Replace the full contents of `server/index.js` with:

```js
const express = require('express');
const path = require('node:path');
const { createDb } = require('./db');
const movimentacoesRouter = require('./routes/movimentacoes');
const authRouter = require('./routes/auth');

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use('/api/movimentacoes', movimentacoesRouter(db));
  app.use('/api/auth', authRouter(db));
  return app;
}

if (require.main === module) {
  const dbPath = path.join(__dirname, '..', 'data', 'estoque.sqlite');
  const db = createDb(dbPath);
  const app = createApp(db);
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
  });
}

module.exports = { createApp };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test server/routes/auth.test.js`
Expected: PASS — 3 tests, 0 failures.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all tests across `server/validation.test.js`, `server/db.test.js`, `server/routes/movimentacoes.test.js`, `server/routes/auth.test.js` pass (16 tests total, 0 failures).

- [ ] **Step 7: Commit**

```bash
git add server/index.js server/routes/auth.js server/routes/auth.test.js
git commit -m "feat: add bcrypt-backed auth API"
```

---

### Task 6: README and manual end-to-end verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: the running app from Tasks 1–5 (`npm start`).
- Produces: nothing consumed by other tasks — this is the final task.

- [ ] **Step 1: Rewrite `README.md`**

Replace the full contents of `README.md` with:

```markdown
# Estoque Coco Verde

Sistema de controle de estoque de coco verde: registro de entradas e
saidas, metas, precos e alertas de estoque minimo.

## Front-end

`public/index.html` e uma aplicacao de pagina unica que hoje guarda todos
os dados no `localStorage` do navegador (movimentacoes, metas, precos,
senhas de Dono/Funcionario). Ela funciona sozinha, sem depender do
backend.

## Backend

Um servidor Express com banco SQLite (`node:sqlite`, nativo do Node,
sem dependencia externa) serve o front-end e expoe uma API de exemplo em
`/api`. O front-end ainda nao consome essa API — a integracao e uma etapa
futura.

### Rodando localmente

Requer Node.js 24 ou superior.

```bash
npm install
npm start
```

Abra `http://localhost:3000`.

Para desenvolvimento com recarregamento automático do servidor:

```bash
npm run dev
```

### Rodando os testes

```bash
npm test
```

### API de exemplo

- `GET /api/movimentacoes` — lista as movimentacoes registradas no banco.
- `POST /api/movimentacoes` — registra uma movimentacao. Corpo JSON:
  `{ "tipo": "entrada" | "saida", "quantidade": number, "detalhe": string, "observacao": string, "usuario": string }`.
  Retorna `400` se os dados forem invalidos; nada e gravado nesse caso.
- `POST /api/auth/login` — verifica papel e senha. Corpo JSON:
  `{ "papel": "dono" | "funcionario", "senha": string }`. Usuarios
  padrao (semeados no primeiro start): `dono`/`dono123` e
  `funcionario`/`func123`. Retorna `200` (sem o hash) ou `401`.

### Seguranca

- Todo acesso ao SQLite usa queries parametrizadas (`db.prepare(sql).run(...)`),
  nunca concatenacao de string.
- Todo input recebido pelas rotas e validado (`server/validation.js`)
  antes de qualquer gravacao.
- Senhas sao armazenadas apenas como hash bcrypt (`server/db.js`,
  tabela `usuarios`), nunca em texto puro.

## Estrutura de pastas

```
public/            front-end estatico (index.html)
server/            backend Express
  index.js         monta o app e as rotas
  db.js            acesso ao SQLite (schema + seed)
  validation.js    validacao de input
  routes/          rotas da API
data/              banco SQLite, criado em runtime (nao versionado)
```
```

- [ ] **Step 2: Manual verification — start the server**

Run: `npm start`
Expected: prints `Servidor rodando em http://localhost:3000`. Leave it running for the next steps, then stop it (Ctrl+C) when done.

- [ ] **Step 3: Manual verification — front-end still serves as before**

Open `http://localhost:3000` in a browser (or `curl -I http://localhost:3000`).
Expected: the same login screen from the current `index.html` loads, `Content-Type: text/html`.

- [ ] **Step 4: Manual verification — invalid input is rejected and not persisted**

```bash
curl -i -X POST http://localhost:3000/api/movimentacoes \
  -H "Content-Type: application/json" \
  -d '{"tipo":"transferencia","quantidade":-5}'
```

Expected: `HTTP/1.1 400`, JSON body with an `errors` array.

- [ ] **Step 5: Manual verification — valid input is persisted**

```bash
curl -i -X POST http://localhost:3000/api/movimentacoes \
  -H "Content-Type: application/json" \
  -d '{"tipo":"entrada","quantidade":100,"detalhe":"Fornecedor Teste","usuario":"Verificacao"}'

curl http://localhost:3000/api/movimentacoes
```

Expected: first call returns `201` with the created row; second call returns a JSON array including that row.

- [ ] **Step 6: Manual verification — login and password hashing**

```bash
curl -i -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"papel":"dono","senha":"dono123"}'

curl -i -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"papel":"dono","senha":"errada"}'
```

Expected: first call `200` with `{"papel":"dono"}` (no hash in the body); second call `401`.

Then inspect the database file directly to confirm no plain-text password is stored:

```bash
node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('data/estoque.sqlite');console.log(db.prepare('SELECT * FROM usuarios').all())"
```

Expected: `senha_hash` values start with `$2` (bcrypt format), not `dono123`/`func123`.

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "docs: document backend scaffold, setup, and security notes"
```
