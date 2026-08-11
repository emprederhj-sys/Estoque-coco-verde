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
