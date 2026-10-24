import { randomBytes, scryptSync, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { renderGraficos } from './graficos.js';
import { renderRespostas } from './respostas.js';

const derive = promisify(scrypt);
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const layout = (title, content) => `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Feira</title><style>body{font:16px system-ui;background:#f4f7fe;color:#14274a;margin:0}main{max-width:1000px;margin:40px auto;padding:24px}form{max-width:420px}label{display:block;margin-top:16px}input{box-sizing:border-box;width:100%;padding:12px;font:inherit;margin:8px 0;border:1px solid #cbd8ed;border-radius:12px}button,a.botao{display:inline-block;background:#235ce6;color:white;padding:12px 18px;border:0;border-radius:12px;font:inherit;margin:12px 0;cursor:pointer}table{border-collapse:collapse;width:100%;background:white}td,th{padding:12px;border:1px solid #dce5f5;text-align:left;overflow-wrap:anywhere}section{overflow:auto}.erro{color:#962323}</style><main>${content}</main></html>`;

export function createAdmin(db) {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const production = process.env.NODE_ENV === 'production';
  const origin = new URL(process.env.APP_ORIGIN || 'http://localhost:3000').origin;
  if (production && (!process.env.APP_ORIGIN || !origin.startsWith('https://'))) throw new Error('Em produção, configure APP_ORIGIN com HTTPS.');
  const configured = Boolean(email && password && password.length >= 16);
  if (!configured) console.warn('Painel administrativo indisponível: configure ADMIN_EMAIL e ADMIN_PASSWORD com pelo menos 16 caracteres no .env. O questionário continua disponível.');
  const salt = randomBytes(32);
  const expected = scryptSync(password || randomBytes(32).toString('hex'), salt, 64);
  const sessions = new Map();
  const attempts = new Map();
  let globalAttempts = { count: 0, until: 0 };
  const cookieName = production ? '__Host-feira_admin' : 'feira_admin';
  const hash = value => createHash('sha256').update(value).digest('hex');
  const cookie = (token, age) => `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${production ? '; Secure' : ''}`;
  function token(req) {
    return req.headers.cookie?.split(';').map(c => c.trim()).find(c => c.startsWith(cookieName + '='))?.slice(cookieName.length + 1) || '';
  }
  function session(req) {
    const key = hash(token(req)); const found = sessions.get(key); const now = Date.now();
    if (!found || now > found.expires || now > found.idle) { sessions.delete(key); return null; }
    found.idle = now + 30 * 60_000;
    return found;
  }
  function redirect(res, location) { res.writeHead(303, { Location: location }); res.end(); }
  function html(res, status, content) {
    const themed = content.replace('<title>', '<script src="/tema.js"></script><title>').replace('<main>', '<link rel="stylesheet" href="/tema.css"><main>');
    res.writeHead(status, {'Content-Type':'text/html; charset=utf-8'}); res.end(themed);
  }
  function requireAdmin(req, res, api = false) {
    const found = session(req);
    if (found) return found;
    if (api) { res.writeHead(401, {'Content-Type':'application/json'}); res.end(JSON.stringify({erro:'Faça login para acessar os dados.'})); }
    else redirect(res, '/admin/login');
    return null;
  }
  async function form(req) {
    if (!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) throw new Error('FORM');
    let body = ''; let bytes = 0;
    for await (const chunk of req) { bytes += chunk.length; if (bytes > 8192) throw new Error('FORM'); body += chunk; }
    return new URLSearchParams(body);
  }
  async function handle(req, res, path) {
    if (!(path === '/admin' || path.startsWith('/admin/'))) return false;
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    if (path === '/admin/login' && req.method === 'GET') {
      if (session(req)) { redirect(res, '/admin'); return true; }
      const error = new URL(req.url, origin).searchParams.has('erro');
      html(res, configured ? 200 : 503, layout('Login administrativo', configured ? `<h1>Área da organização</h1><p>Entre para consultar as avaliações.</p>${error ? '<p class="erro" role="alert">E-mail ou senha inválidos. Tente novamente.</p>' : ''}<form method="post" action="/admin/login"><label>E-mail<input type="email" name="email" autocomplete="username" maxlength="254" required></label><label>Senha<input type="password" name="password" autocomplete="current-password" maxlength="1024" required></label><button>Entrar</button></form><a href="/">Voltar ao questionário</a>` : '<h1>Acesso administrativo indisponível</h1><p>Configure ADMIN_EMAIL e uma ADMIN_PASSWORD de pelo menos 16 caracteres no .env e reinicie o servidor.</p>'));
      return true;
    }
    if (req.method === 'POST' && ['/admin/login', '/admin/logout'].includes(path)) {
      if (req.headers.origin !== origin || (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin')) {
        html(res, 403, layout('Endereço não permitido', `<h1>Abra o login pelo endereço correto</h1><p>O endereço usado para enviar o formulário não corresponde ao configurado no servidor. Isso não significa que sua senha esteja errada.</p><p><a href="${esc(origin)}/admin/login">Abrir uma nova página de login</a></p><p>Se o servidor acabou de ser atualizado, abra esse link e preencha o formulário novamente.</p>`));
        return true;
      }
      let data; try { data = await form(req); } catch { html(res, 400, 'Formulário inválido.'); return true; }
      if (path === '/admin/logout') {
        const found = requireAdmin(req, res);
        if (!found) return true;
        if (data.get('csrf') !== found.csrf) { html(res, 403, 'Formulário inválido.'); return true; }
        sessions.delete(hash(token(req))); res.setHeader('Set-Cookie', cookie('', 0)); redirect(res, '/admin/login'); return true;
      }
      if (!configured) { html(res, 503, 'Acesso administrativo indisponível.'); return true; }
      const now = Date.now();
      for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
      if (globalAttempts.until <= now) globalAttempts = {count:0, until:now + 15 * 60_000};
      const ip = req.socket.remoteAddress;
      const entry = attempts.get(ip) || {count:0, until:now + 15 * 60_000};
      if (entry.count >= 5 || globalAttempts.count >= 100) { res.setHeader('Retry-After', '900'); html(res, 429, 'Muitas tentativas. Aguarde 15 minutos.'); return true; }
      entry.count++; globalAttempts.count++; attempts.set(ip, entry);
      const submitted = data.get('password') || '';
      const derived = await derive(submitted, salt, 64);
      const validPassword = timingSafeEqual(derived, expected);
      if (!validPassword || data.get('email')?.trim().toLowerCase() !== email) { redirect(res, '/admin/login?erro=1'); return true; }
      attempts.delete(ip);
      for (const [key, value] of sessions) if (value.expires < now || value.idle < now) sessions.delete(key);
      sessions.delete(hash(token(req)));
      if (sessions.size >= 100) sessions.delete(sessions.keys().next().value);
      const newToken = randomBytes(32).toString('hex');
      sessions.set(hash(newToken), {csrf:randomBytes(32).toString('hex'), expires:now + 8 * 60 * 60_000, idle:now + 30 * 60_000});
      res.setHeader('Set-Cookie', cookie(newToken, 8 * 60 * 60)); redirect(res, '/admin'); return true;
    }
    const found = requireAdmin(req, res);
    if (!found) return true;
    if (path === '/admin/graficos' && req.method === 'GET') {
      html(res, 200, renderGraficos(db, found.csrf));
      return true;
    }
    if (path !== '/admin' || req.method !== 'GET') { html(res, 404, 'Página não encontrada.'); return true; }
    const rows = db.prepare('SELECT curso, nota, comentario, gostou, sugestoes, data FROM respostas ORDER BY data DESC LIMIT 500').all();
    const total = db.prepare('SELECT COUNT(*) AS total FROM respostas').get().total;
    html(res, 200, layout('Painel administrativo', renderRespostas(rows, total, found.csrf)));
    return true;
  }
  return {handle, requireAdmin};
}
