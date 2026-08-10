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
  estático e expõe rotas de exemplo em `/api/movimentacoes` e
  `/api/auth/login`.
- Criar acesso a SQLite via módulo nativo `node:sqlite` (disponível no Node
  instalado, v24 — sem dependência nativa extra) em `server/db.js`, com
  schema para as tabelas `movimentacoes` e `usuarios`.
- Criar `server/validation.js` com funções de validação/sanitização dos
  dados recebidos pelas rotas antes de qualquer gravação no banco.
- Criar `package.json` com `express` e `bcryptjs` como dependências de
  produção.
- Criar `.gitignore` (`node_modules/`, `data/*.sqlite`, `.env`).
- Remover `index(2).html`.
- Reescrever `README.md` com descrição real do projeto e instruções de uso.

Fora de escopo (etapa futura): ligar as funções de registro de
entrada/saída do front-end à API real, sessão/token de autenticação
(cookies, JWT etc.), tabelas de metas e configurações no banco.

## Segurança

Requisitos aplicados desde esta etapa de scaffold, não deixados para depois:

- **Queries sempre parametrizadas.** Todo acesso ao SQLite usa
  `db.prepare(sql).run(params)` / `.get(params)` / `.all(params)` do
  `node:sqlite`, com `?` como placeholder. Nenhum valor vindo de fora do
  código (body da requisição, query string) é concatenado diretamente numa
  string SQL — nem para nomes de coluna nem para valores.
- **Validação e sanitização de todo input do front.** `server/validation.js`
  expõe uma função por recurso (`validarMovimentacao`, `validarLogin`) que:
  - rejeita campos ausentes ou de tipo errado (ex.: `quantidade` precisa ser
    inteiro positivo, `tipo` precisa ser exatamente `'entrada'` ou
    `'saida'`);
  - faz `trim()` e limita o tamanho de campos de texto livre (`detalhe`,
    `observacao`, `usuario`);
  - roda **antes** de qualquer instrução SQL — se a validação falhar, a
    rota responde `400` com a lista de erros e nada é gravado.
- **Senhas nunca em texto puro.** Nova tabela `usuarios` guarda apenas
  `senha_hash` (bcrypt, via `bcryptjs`, custo 10 — mesma API do pacote
  `bcrypt` nativo, mas em JS puro, sem exigir build tools no Windows). No
  primeiro start, `server/db.js` semeia as duas linhas (`dono`,
  `funcionario`) com hash dos valores hoje usados como padrão no front
  (`dono123` / `func123`), para não quebrar a integração futura. Nenhuma
  rota ou log jamais expõe a senha em texto puro, só o hash fica no banco.

## Estrutura de pastas

```
Estoque-coco-verde/
├── public/
│   └── index.html
├── server/
│   ├── index.js
│   ├── db.js
│   ├── validation.js
│   └── routes/
│       ├── movimentacoes.js
│       └── auth.js
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

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  papel TEXT NOT NULL UNIQUE CHECK(papel IN ('dono','funcionario')),
  senha_hash TEXT NOT NULL
);
```

Os campos de `movimentacoes` espelham o que o front-end já usa em
`localStorage` (`tipo, qtd, detalhe, obs, usuario, data`), para facilitar a
integração futura. `usuarios` substitui o par `KSD`/`KSF` (senha em texto
puro no `localStorage`) por hash bcrypt no banco.

## Rotas de exemplo

- `GET /api/movimentacoes` — lista todas as movimentações do banco.
- `POST /api/movimentacoes` — valida o corpo (`server/validation.js`) e
  insere uma movimentação (`tipo`, `quantidade`, `detalhe`, `observacao`,
  `usuario` no corpo JSON) via query parametrizada.
- `POST /api/auth/login` — recebe `{ papel, senha }`, valida o formato,
  busca o hash em `usuarios` por `papel` e compara com `bcrypt.compare`;
  responde `200` (sem devolver o hash) ou `401`.

Servem para validar que o backend funciona ponta a ponta, incluindo os
requisitos de segurança acima; o front-end não consome essas rotas nesta
etapa.

## Scripts

- `npm start` → `node server/index.js`
- `npm run dev` → `node --watch server/index.js` (watch nativo do Node,
  sem dependência de `nodemon`)

## Testes / verificação

Não há testes automatizados nesta etapa (escopo é scaffold). Verificação
manual: `npm install && npm start`, confirmar que `http://localhost:3000/`
serve o `index.html` normalmente e que:

- `GET`/`POST /api/movimentacoes` funcionam via curl, e que um `POST` com
  campo inválido (ex.: `tipo` fora de `entrada`/`saida`, `quantidade`
  negativa) retorna `400` sem gravar nada no banco;
- `POST /api/auth/login` com `dono`/`dono123` e `funcionario`/`func123`
  retorna `200`, e com senha errada retorna `401`;
- abrindo `data/estoque.sqlite` (ex.: `sqlite3` CLI), a coluna
  `senha_hash` nunca contém a senha em texto puro.
