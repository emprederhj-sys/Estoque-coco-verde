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
