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
