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
