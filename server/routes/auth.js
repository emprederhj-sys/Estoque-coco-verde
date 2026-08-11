const express = require('express');
const bcrypt = require('bcryptjs');
const { validarLogin, validarSenha } = require('../validation');
const {
  criarSessao,
  apagarSessao,
  setSessionCookie,
  clearSessionCookie,
  parseCookies,
  COOKIE_NAME,
  requireAuth,
  requireDono,
} = require('../middleware/auth');

const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS) || 168;

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

    const token = criarSessao(db, papel, SESSION_TTL_HOURS);
    setSessionCookie(res, token, SESSION_TTL_HOURS);
    res.status(200).json({ papel });
  });

  router.get('/me', requireAuth(db), (req, res) => {
    res.status(200).json({ papel: req.papel });
  });

  router.post('/logout', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    apagarSessao(db, cookies[COOKIE_NAME]);
    clearSessionCookie(res);
    res.status(200).json({ ok: true });
  });

  router.put('/senha', requireDono(db), (req, res) => {
    const result = validarSenha(req.body);
    if (!result.valid) {
      res.status(400).json({ errors: result.errors });
      return;
    }

    const { papel, novaSenha } = result.data;
    const hash = bcrypt.hashSync(novaSenha, 10);
    db.prepare('UPDATE usuarios SET senha_hash = ? WHERE papel = ?').run(hash, papel);
    res.status(200).json({ papel });
  });

  return router;
}

module.exports = authRouter;
