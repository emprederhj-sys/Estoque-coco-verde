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
