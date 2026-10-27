import { randomBytes, scryptSync, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { renderGraficos } from './graficos.js';
import { renderRespostas } from './respostas.js';
import { resolvePublicConfig } from './origem.js';

const derive = promisify(scrypt);
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const layout = (title, content) => `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Feira</title><style>body{font-family:system-ui,sans-serif;margin:0;background:#eef4ff;color:#15233b}main{max-width:720px;margin:40px auto;padding:24px 20px}h1{margin:0 0 16px;font-size:clamp(2rem,3vw,2.7rem)}p{line-height:1.6}label{display:block;margin:16px 0 6px;font-weight:700}input,button,select{font:inherit}input,select{width:100%;padding:12px 14px;border:1px solid #c9d6f2;border-radius:10px;background:#fff;color:#13264d}button{display:inline-flex;align-items:center;justify-content:center;padding:12px 18px;border:none;border-radius:10px;background:#1d5ce6;color:#fff;font-weight:700;cursor:pointer}a{color:#1d5ce6;text-decoration:none}a:hover{text-decoration:underline}.erro{color:#a52626;background:#fde9e9;border:1px solid #f3b5b5;padding:10px 12px;border-radius:10px;margin:12px 0}form{display:grid;gap:8px}.muted{color:#5a6c90}.status{margin-top:12px}.sr-only{position:absolute;left:-9999px}</style><body><main>${content}</main></body></html>`;

export function createAdmin(db) {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const {production, origin} = resolvePublicConfig();
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
    if (path === '/admin/excluir') {
      if (req.method !== 'GET' && req.method !== 'POST') { html(res, 405, 'Método não permitido.'); return true; }
      let data;
      if (req.method === 'POST') {
        if (req.headers.origin !== origin || (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin')) { html(res, 403, 'Origem não permitida.'); return true; }
        try { data = await form(req); } catch { html(res, 400, 'Formulário inválido.'); return true; }
        if (data.get('csrf') !== found.csrf) { html(res, 403, 'Formulário inválido.'); return true; }
        if (data.get('confirmar') !== 'sim') { html(res, 400, 'Confirme a exclusão antes de continuar.'); return true; }
      } else data = new URL(req.url, origin).searchParams;
      const id = data.get('id');
      const resposta = db.prepare('SELECT id, curso, nota, data FROM respostas WHERE id = ?').get(id || '');
      if (!resposta) { html(res, 404, layout('Avaliação não encontrada','<h1>Avaliação não encontrada</h1><a href="/admin">Voltar às avaliações</a>')); return true; }
      if (req.method === 'POST') {
        db.prepare('DELETE FROM respostas WHERE id = ?').run(id);
        redirect(res, '/admin?excluida=1'); return true;
      }
      html(res, 200, layout('Confirmar exclusão', `<h1>Excluir esta avaliação?</h1><p><strong>${esc(resposta.curso)}</strong> · Nota ${resposta.nota}/5</p><p>Esta ação é permanente e remove a avaliação do banco.</p><form method="post"><input type="hidden" name="csrf" value="${esc(found.csrf)}"><input type="hidden" name="confirmar" value="sim"><input type="hidden" name="id" value="${esc(id || '')}"><button>Confirmar exclusão</button></form><p><a href="/admin">Cancelar</a></p>`));
      return true;
    }
    if (path === '/admin/graficos' && req.method === 'GET') {
      html(res, 200, renderGraficos(db, found.csrf));
      return true;
    }
    if (path !== '/admin' || req.method !== 'GET') { html(res, 404, 'Página não encontrada.'); return true; }
    const params = new URL(req.url, origin).searchParams;
    const filtros = {q:(params.get('q') || '').trim().slice(0,200),curso:params.get('curso') || '',nota:params.get('nota') || '',ordem:params.get('ordem') || 'recentes'};
    const orders = {recentes:'data DESC, id ASC',antigas:'data ASC, id ASC',maior:'nota DESC, data DESC, id ASC',menor:'nota ASC, data DESC, id ASC',curso:'curso COLLATE NOCASE ASC, data DESC, id ASC'};
    if (!Object.hasOwn(orders, filtros.ordem)) filtros.ordem = 'recentes';
    if (!/^[1-5]$/.test(filtros.nota)) filtros.nota = '';
    const clauses = []; const values = [];
    if (filtros.q) {
      clauses.push("(curso LIKE ? ESCAPE '\\' OR gostou LIKE ? ESCAPE '\\' OR sugestoes LIKE ? ESCAPE '\\' OR comentario LIKE ? ESCAPE '\\')");
      const term = '%' + filtros.q.replace(/[\\%_]/g,'\\$&') + '%';
      values.push(term,term,term,term);
    }
    if (filtros.curso) {clauses.push('curso = ?');values.push(filtros.curso);}
    if (filtros.nota) {clauses.push('nota = ?');values.push(Number(filtros.nota));}
    const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
    const encontrados = db.prepare('SELECT COUNT(*) AS total FROM respostas' + where).get(...values).total;
    const paginas = Math.max(1,Math.ceil(encontrados/50));
    const pagina = Math.min(paginas, Math.max(1, Number.parseInt(params.get('pagina'),10) || 1));
    const rows = db.prepare('SELECT id, curso, nota, comentario, gostou, sugestoes, data FROM respostas' + where + ' ORDER BY ' + orders[filtros.ordem] + ' LIMIT 50 OFFSET ?').all(...values,(pagina-1)*50);
    const total = db.prepare('SELECT COUNT(*) AS total FROM respostas').get().total;
    const cursos = db.prepare('SELECT DISTINCT curso FROM respostas ORDER BY curso COLLATE NOCASE').all().map(r=>r.curso);
    html(res, 200, layout('Painel administrativo', renderRespostas(rows, total, found.csrf, {filtros,cursos,encontrados,pagina,paginas,excluida:params.get('excluida')==='1'})));
    return true;
  }
  return {handle, requireAdmin};
}
