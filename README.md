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
