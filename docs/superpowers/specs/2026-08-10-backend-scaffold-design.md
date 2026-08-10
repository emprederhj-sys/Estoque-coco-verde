# Design: Backend scaffold (Node.js + Express + SQLite)

## Context

O projeto hoje é um único arquivo estático `index.html` (SPA) que registra
entradas/saídas de estoque de coco verde, metas, preços e configurações
inteiramente em `localStorage` do navegador. O objetivo desta etapa é
introduzir a estrutura inicial de um backend em Node.js/Express com SQLite,
sem alterar o comportamento do front-end atual (que continua funcionando via
`localStorage`). A integração real (front chamando a API) fica para uma
etapa futura.

Também foram encontrados dois arquivos residuais na raiz, idênticos ao
`index.html`: `index(2).html` (cópia sem uso) e `README.md` (contém o HTML
inteiro em vez de uma descrição do projeto). Ambos serão limpos nesta etapa.

## Escopo

- Mover `index.html` para `public/index.html`, sem alterar seu conteúdo.
- Criar servidor Express (`server/index.js`) que serve `public/` como
  estático e expõe rotas de exemplo em `/api/movimentacoes`.
- Criar acesso a SQLite via módulo nativo `node:sqlite` (disponível no Node
  instalado, v24 — sem dependência nativa extra) em `server/db.js`, com
  schema para a tabela `movimentacoes`.
- Criar `package.json` com `express` como única dependência de produção.
- Criar `.gitignore` (`node_modules/`, `data/*.sqlite`, `.env`).
- Remover `index(2).html`.
- Reescrever `README.md` com descrição real do projeto e instruções de uso.

Fora de escopo (etapa futura): ligar as funções de registro de
entrada/saída do front-end à API real, autenticação, tabelas de metas e
configurações no banco.

## Estrutura de pastas

```
Estoque-coco-verde/
├── public/
│   └── index.html
├── server/
│   ├── index.js
│   ├── db.js
│   └── routes/
│       └── movimentacoes.js
├── data/
│   └── estoque.sqlite        (criado em runtime, git-ignorado)
├── .gitignore
├── package.json
└── README.md
```

## Schema SQLite

```sql
CREATE TABLE IF NOT EXISTS movimentacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL CHECK(tipo IN ('entrada','saida')),
  quantidade INTEGER NOT NULL,
  detalhe TEXT,
  observacao TEXT,
  usuario TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
```

Os campos espelham o que o front-end já usa em `localStorage`
(`tipo, qtd, detalhe, obs, usuario, data`), para facilitar a integração
futura.

## Rotas de exemplo

- `GET /api/movimentacoes` — lista todas as movimentações do banco.
- `POST /api/movimentacoes` — insere uma movimentação (`tipo`, `quantidade`,
  `detalhe`, `observacao`, `usuario` no corpo JSON).

Servem para validar que o backend funciona ponta a ponta; o front-end não
consome essas rotas nesta etapa.

## Scripts

- `npm start` → `node server/index.js`
- `npm run dev` → `node --watch server/index.js` (watch nativo do Node,
  sem dependência de `nodemon`)

## Testes / verificação

Não há testes automatizados nesta etapa (escopo é scaffold). Verificação
manual: `npm install && npm start`, confirmar que `http://localhost:3000/`
serve o `index.html` normalmente e que `GET`/`POST /api/movimentacoes`
funcionam via curl.
