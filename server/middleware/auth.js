const { randomBytes } = require('node:crypto');

const COOKIE_NAME = 'sid';

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

function criarSessao(db, papel, ttlHoras) {
  const token = randomBytes(32).toString('hex');
  const expiraEm = new Date(Date.now() + ttlHoras * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessoes (token, papel, expira_em) VALUES (?, ?, ?)').run(
    token,
    papel,
    expiraEm
  );
  return token;
}

function buscarSessaoValida(db, token) {
  if (!token) return null;
  const sessao = db.prepare('SELECT * FROM sessoes WHERE token = ?').get(token);
  if (!sessao) return null;
  if (new Date(sessao.expira_em).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessoes WHERE token = ?').run(token);
    return null;
  }
  return sessao;
}

function apagarSessao(db, token) {
  if (!token) return;
  db.prepare('DELETE FROM sessoes WHERE token = ?').run(token);
}

function cookieAttrs() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `HttpOnly; SameSite=Lax; Path=/${secure}`;
}

function setSessionCookie(res, token, ttlHoras) {
  const maxAge = Math.round(ttlHoras * 60 * 60);
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; Max-Age=${maxAge}; ${cookieAttrs()}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Max-Age=0; ${cookieAttrs()}`);
}

function requireAuth(db) {
  return (req, res, next) => {
    const cookies = parseCookies(req.headers.cookie);
    const sessao = buscarSessaoValida(db, cookies[COOKIE_NAME]);
    if (!sessao) {
      res.status(401).json({ errors: ['sessao invalida ou expirada'] });
      return;
    }
    req.papel = sessao.papel;
    req.sessionToken = sessao.token;
    next();
  };
}

function requireDono(db) {
  const auth = requireAuth(db);
  return (req, res, next) => {
    auth(req, res, () => {
      if (req.papel !== 'dono') {
        res.status(403).json({ errors: ['apenas o dono pode acessar este recurso'] });
        return;
      }
      next();
    });
  };
}

module.exports = {
  COOKIE_NAME,
  parseCookies,
  criarSessao,
  apagarSessao,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  requireDono,
};
