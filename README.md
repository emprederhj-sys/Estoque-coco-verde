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
