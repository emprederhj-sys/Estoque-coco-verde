# Design: Integração front-backend (sessão, metas/preços, PUT/DELETE, .env)

## Context

O backend scaffold (Node/Express/SQLite) foi introduzido em
`docs/superpowers/specs/2026-08-10-backend-scaffold-design.md` como uma
etapa isolada: o servidor expõe `/api/movimentacoes` e `/api/auth/login`,
mas o front-end (`public/index.html`) continua 100% em cima de
`localStorage` — nenhuma chamada `fetch`/`/api/` existe nele hoje, e o
login não mantém nenhum estado de sessão no servidor.

Esta etapa fecha essa lacuna: o front passa a consumir a API de verdade,
o login vira uma sessão persistente (sobrevive a refresh da página), e o
backend ganha os recursos que hoje só existem no `localStorage` do
navegador — metas e configurações (preços, WhatsApp, estoque mínimo) —
além de edição/exclusão de movimentações e configuração via `.env`.

## Escopo

- Sessão de autenticação persistente por cookie httpOnly, com tabela
  `sessoes` no SQLite. Sem dependências novas: o token é gerado com
  `node:crypto` e o cookie é lido manualmente do header (sem
  `cookie-parser`/`express-session`).
- `GET /api/auth/me` (verifica sessão ativa) e `POST /api/auth/logout`
  (novo), além do `POST /api/auth/login` existente passando a criar a
  sessão e setar o cookie.
- `PUT /api/auth/senha` (novo, dono-only): regrava o hash bcrypt de
  `dono` ou `funcionario` em `usuarios`. Substitui o comportamento atual
  de `salvarSenhas()` no front, que grava a senha nova em texto puro no
  `localStorage` (`KSD`/`KSF`) — órfão desde que o login passou a
  validar contra o hash em `usuarios`.
- Middlewares `requireAuth` e `requireDono` (`server/middleware/auth.js`),
  aplicados a todas as rotas de dados a partir desta etapa — inclusive
  `GET`/`POST /api/movimentacoes`, que hoje são públicas.
- `PUT /api/movimentacoes/:id` e `DELETE /api/movimentacoes/:id`
  (dono-only).
- Tabela e rotas `metas` (`GET`/`POST`/`DELETE`, qualquer papel logado).
- Tabela e rotas `config`: `preco_compra`, `preco_venda`,
  `whatsapp_numero`, `estoque_minimo`. `GET` é para qualquer papel
  logado; a escrita é dividida em duas rotas por sensibilidade —
  `PUT /api/config/precos` (dono-only, espelha a aba "Financeiro", hoje
  escondida do Funcionário) e `PUT /api/config/alertas` (qualquer papel
  logado, espelha as abas "WhatsApp" e "Metas", visíveis para os dois
  papéis hoje).
- Front-end (`public/index.html`) trocando leitura/escrita de
  `localStorage` por chamadas à API, usando um cache em memória (ver
  seção "Estratégia de integração no front-end").
- `.env` configurável via `process.loadEnvFile()` nativo do Node (sem
  `dotenv`), com `.env.example` documentando as variáveis.

Fora de escopo:

- Migração automática de dados existentes no `localStorage` do
  navegador para o banco — quem já tiver dados salvos localmente
  recadastra manualmente (são poucos campos: metas e preços).
- `mutado` (som ligado/desligado) continua em `localStorage` — é
  preferência de UI do navegador, não dado de negócio.
- Proteção CSRF via token — o cookie usa `sameSite=lax`, considerado
  suficiente para um app interno de mesma origem.
- Atrelar o `.env` a uma plataforma de deploy específica (Render,
  Railway, VPS) — só variáveis de ambiente genéricas nesta etapa.
- Qualquer alteração em `public/index.html` além do necessário para
  consumir a API (layout, novas telas, etc. não fazem parte disto).

## Sessão / autenticação

- **Tabela `sessoes`:** `token TEXT PRIMARY KEY`, `papel TEXT NOT NULL`,
  `criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))`,
  `expira_em TEXT NOT NULL`.
- **Login (`POST /api/auth/login`):** validação e checagem de senha
  como hoje; em caso de sucesso, gera `token = crypto.randomBytes(32).toString('hex')`,
  insere a linha em `sessoes` com `expira_em = now + SESSION_TTL_HOURS`,
  e responde com `Set-Cookie: sid=<token>; HttpOnly; SameSite=Lax; Path=/[; Secure]`
  (`Secure` só quando `NODE_ENV=production`) além do corpo `{ papel }`
  de sempre.
- **`GET /api/auth/me`:** lê o cookie `sid`, busca a sessão; se existir
  e não estiver expirada, responde `200 { papel }`; senão `401`. Usado
  pelo front no carregamento da página para decidir se pula a tela de
  login.
- **`POST /api/auth/logout`:** apaga a linha de `sessoes` correspondente
  ao cookie (se existir) e responde `Set-Cookie: sid=; Max-Age=0` para
  limpar o cookie no navegador. Sempre `200`, mesmo sem sessão ativa.
- **`PUT /api/auth/senha`** (dono-only): corpo `{ papel: 'dono'|'funcionario', novaSenha: string }`;
  valida (`novaSenha` com pelo menos 4 caracteres, mesmo mínimo que o
  front já usa), regrava `usuarios.senha_hash` com `bcrypt.hashSync`.
  Não invalida sessões existentes daquele papel (fora de escopo nesta
  etapa).
- **Expiração:** verificada de forma preguiçosa em `requireAuth` (sem
  job de limpeza) — se `expira_em < now`, trata como não autenticado e
  apaga a linha.
- **`requireAuth(db)`:** middleware que injeta `req.papel` a partir do
  cookie válido, ou responde `401 { errors: [...] }`.
- **`requireDono(db)`:** aplica `requireAuth` e, além disso, exige
  `req.papel === 'dono'`, senão `403`.

## Schema SQLite (adições)

```sql
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
```

`config` é semeada com a linha `id = 1` (valores default acima) na
primeira execução de `createDb`, do mesmo jeito que `usuarios` já é
semeada hoje.

## Rotas (visão completa após esta etapa)

| Rota | Método | Acesso | Observação |
|---|---|---|---|
| `/api/auth/login` | POST | público | cria sessão, seta cookie |
| `/api/auth/logout` | POST | público | apaga sessão, limpa cookie |
| `/api/auth/me` | GET | público | checa sessão ativa |
| `/api/auth/senha` | PUT | dono | regrava hash de um papel |
| `/api/movimentacoes` | GET | logado | como hoje, agora exige sessão |
| `/api/movimentacoes` | POST | logado | como hoje, agora exige sessão |
| `/api/movimentacoes/:id` | PUT | dono | novo |
| `/api/movimentacoes/:id` | DELETE | dono | novo |
| `/api/metas` | GET | logado | novo |
| `/api/metas` | POST | logado | novo |
| `/api/metas/:id` | DELETE | logado | novo |
| `/api/config` | GET | logado | novo |
| `/api/config/precos` | PUT | dono | novo — `preco_compra`, `preco_venda` |
| `/api/config/alertas` | PUT | logado | novo — `whatsapp_numero`, `estoque_minimo` |

Validações novas em `server/validation.js`: `validarMeta(body)` (`nome`
string não vazia até 100 chars, `quantidade` inteiro positivo),
`validarConfigPrecos(body)` (`preco_compra`/`preco_venda` números
positivos), `validarConfigAlertas(body)` (`whatsapp_numero` string de
dígitos, `estoque_minimo` inteiro positivo). `PUT /movimentacoes/:id`
reaproveita `validarMovimentacao`.

## Estratégia de integração no front-end

O front hoje é um único arquivo com funções síncronas espalhadas
(`load()`, `loadMetas()`, `getPC()` etc.) que leem `localStorage` na
hora e alimentam renderização, gráficos e alertas diretamente. Reescrever
tudo para async traria alto risco de regressão num arquivo grande sem
testes de UI.

Abordagem escolhida — **cache em memória sincronizado com a API**:

- No carregamento da página, `GET /api/auth/me` decide se mostra a tela
  de login ou pula direto pra tela do app (sessão ainda válida).
- Ao autenticar (login novo ou sessão restaurada), o front busca tudo
  de uma vez (`GET /api/movimentacoes`, `GET /api/metas`, e
  `GET /api/config` só se `papel === 'dono'`) e guarda em variáveis JS
  em memória, no mesmo formato usado hoje pelas funções `load()` /
  `loadMetas()` / `getPC()` etc. — que passam a ler dessas variáveis em
  vez de `localStorage`.
- Toda a UI existente (renderização, cálculo financeiro, gráficos,
  alertas de meta) continua síncrona, sem mudanças.
- Ações de escrita (nova movimentação, editar/excluir, nova/excluir
  meta, salvar preços) chamam a API correspondente; no sucesso,
  atualizam o cache local com a resposta do servidor e re-renderizam.
  Em erro, mostram o alerta de erro já existente no app e não alteram
  o cache.
- Adapta os nomes de campo: o front usa `qtd`/`obs`/`ts`/`data` (local),
  a API usa `quantidade`/`observacao`/`criado_em` — o mapeamento é feito
  na função que popula o cache a partir da resposta da API.
- Um wrapper `api(path, options)` centraliza `fetch(..., { credentials: 'include' })`,
  parse de JSON e o tratamento padrão de erro (corpo `{ errors: [...] }`).
- Novo botão de logout, chamando `POST /api/auth/logout` e voltando
  para a tela de login.

## `.env` de produção

Sem a dependência `dotenv` — Node 24 tem `process.loadEnvFile()` nativo,
chamado no topo de `server/index.js` (só quando o arquivo existir; em
testes, que rodam com `':memory:'`, não é necessário).

Variáveis (documentadas em `.env.example`, commitado; `.env` real
permanece no `.gitignore`):

```
PORT=3000
NODE_ENV=development
SESSION_TTL_HOURS=168
DB_PATH=data/estoque.sqlite
```

- `NODE_ENV=production` ativa o atributo `Secure` no cookie de sessão.
- `SESSION_TTL_HOURS` controla `expira_em` nas novas sessões (default
  168h = 7 dias).
- `DB_PATH` substitui o caminho fixo `data/estoque.sqlite` hoje
  hard-coded em `server/index.js`, útil para ambientes com volume
  montado em outro caminho — sem amarrar a nenhuma plataforma
  específica.

## Estrutura de pastas (após esta etapa)

```
Estoque-coco-verde/
├── public/
│   └── index.html          (agora consome a API em vez de localStorage)
├── server/
│   ├── index.js             (loadEnvFile, monta rotas novas)
│   ├── db.js                 (+ tabelas sessoes, metas, config)
│   ├── validation.js         (+ validarMeta, validarConfig)
│   ├── middleware/
│   │   └── auth.js           (requireAuth, requireDono)
│   └── routes/
│       ├── movimentacoes.js  (+ PUT/DELETE :id)
│       ├── auth.js           (+ logout, me, senha)
│       ├── metas.js          (novo)
│       └── config.js         (novo)
├── data/
├── .env.example              (novo)
├── .gitignore
├── package.json
└── README.md
```

## Testes / verificação

Segue o padrão já usado no repo: `node:test` + `node:assert`, um
arquivo `*.test.js` por módulo, testes escritos antes da implementação
(TDD, como nas fases anteriores). Cobertura esperada:

- `server/middleware/auth.test.js`: sessão válida deixa passar, sessão
  ausente/expirada retorna `401`, papel errado em `requireDono` retorna
  `403`.
- `server/routes/auth.test.js` (estendido): login seta cookie
  `Set-Cookie`; `/me` com cookie válido retorna `200`, sem cookie
  retorna `401`; `/logout` limpa a sessão; `/senha` sem ser dono
  retorna `403`, com dono regrava o hash e o novo login funciona.
- `server/routes/movimentacoes.test.js` (estendido): `GET`/`POST` sem
  sessão retornam `401`; `PUT`/`DELETE` como funcionário retornam
  `403`; como dono, editam/excluem corretamente.
- `server/routes/metas.test.js` (novo): CRUD básico, sem sessão `401`.
- `server/routes/config.test.js` (novo): `GET` funciona para qualquer
  papel logado; `PUT /precos` como funcionário retorna `403`, como dono
  grava e `GET` reflete; `PUT /alertas` funciona para qualquer papel
  logado e `GET` reflete os novos valores.

Verificação manual (equivalente à da etapa anterior, com `curl`):
login grava cookie, refresh de sessão via `/me`, movimentação
criada por um papel e editada/excluída só pelo dono retorna `403` para
o funcionário, front-end abre, loga, adiciona movimentação/meta e
reflete no banco (`data/estoque.sqlite`).
