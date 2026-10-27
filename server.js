import http from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { createAdmin } from './admin.js';
import { abrirChrome } from './abrir-chrome.js';
import { createHash } from 'node:crypto';

try { loadEnvFile(fileURLToPath(new URL('./.env', import.meta.url))); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

const port = process.env.PORT || 10000;
const cursos = JSON.parse(readFileSync(new URL('./cursos.json', import.meta.url), 'utf8'));
if (!Array.isArray(cursos) || cursos.some(c => typeof c !== 'string' || !c.trim()) || new Set(cursos).size !== cursos.length) throw new Error('Confira a lista em cursos.json.');
const pasta = process.env.DATA_DIR ? pathToFileURL(resolve(process.env.DATA_DIR) + '/') : new URL('./dados/', import.meta.url);
mkdirSync(pasta, { recursive: true });
const db = new DatabaseSync(fileURLToPath(new URL('feira.sqlite', pasta)));
db.exec(`CREATE TABLE IF NOT EXISTS respostas (
  id TEXT PRIMARY KEY, curso TEXT NOT NULL, nota INTEGER NOT NULL CHECK(nota BETWEEN 1 AND 5),
  comentario TEXT NOT NULL, data TEXT NOT NULL
)`);
// Migração aditiva: mantém intactas todas as avaliações antigas.
const colunas = db.prepare('PRAGMA table_info(respostas)').all().map(c => c.name);
db.exec('BEGIN');
try {
  for (const coluna of ['gostou', 'sugestoes']) {
    if (!colunas.includes(coluna)) db.exec(`ALTER TABLE respostas ADD COLUMN ${coluna} TEXT NOT NULL DEFAULT ''`);
  }
  db.exec('COMMIT');
} catch (error) { db.exec('ROLLBACK'); throw error; }
const pagina = readFileSync(new URL('./index.html', import.meta.url));
const scripts = [...pagina.toString('utf8').matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
const scriptHashes = scripts.map(([,source]) => `'sha256-${createHash('sha256').update(source.replace(/\r\n?/g, '\n')).digest('base64')}'`).join(' ');
const publicCsp = `default-src 'none'; script-src 'self' ${scriptHashes}; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; font-src 'self' data:; worker-src 'self' blob:; manifest-src 'self';`;
const appOrigin = new URL(process.env.APP_ORIGIN || `http://localhost:${port}`).origin;
const submissionLimits = new Map();
function allowSubmission(ip) {
  const now = Date.now();
  for (const [key, value] of submissionLimits) if (value.expires <= now) submissionLimits.delete(key);
  if (!submissionLimits.has(ip)) {
    if (submissionLimits.size >= 10000) return false;
    submissionLimits.set(ip, {count:0,expires:now+10*60_000});
  }
  return ++submissionLimits.get(ip).count <= 120;
}
const admin = createAdmin(db);
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}
http.createServer(async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', publicCsp);
    if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    // Preserva a origem em formulários locais para a validação contra CSRF.
    res.setHeader('Referrer-Policy', 'same-origin');
    const path = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && ['/tema.js', '/tema.css'].includes(path)) {
      res.writeHead(200, {'Content-Type':path.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8'});
      return res.end(readFileSync(new URL('.' + path, import.meta.url)));
    }
    if (await admin.handle(req, res, path)) return;
    if (req.method === 'GET' && path === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
      return res.end(pagina);
    }
    if (req.method === 'GET' && path === '/api/cursos') return json(res, 200, cursos);
    if (req.method === 'POST' && path === '/api/respostas') {
      if ((req.headers.origin && req.headers.origin !== appOrigin) || req.headers['sec-fetch-site'] === 'cross-site') return json(res,403,{erro:'Origem não permitida.'});
      if (!allowSubmission(req.socket.remoteAddress)) {
        res.setHeader('Retry-After','600');
        return json(res,429,{erro:'Muitos envios. Aguarde alguns minutos antes de tentar novamente.'});
      }
      if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { erro: 'Formato inválido.' });
      let body = ''; let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 16384) { json(res, 413, { erro: 'Resposta muito longa.' }); return; }
        body += chunk;
      }
      let dados;
      try { dados = JSON.parse(body); } catch { return json(res, 400, { erro: 'Resposta inválida.' }); }
      if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return json(res,400,{erro:'Resposta inválida.'});
      const { id, curso, nota, comentario = '', gostou = '', sugestoes = '' } = dados ?? {};
      if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id) || !cursos.includes(curso) || !Number.isInteger(nota) || nota < 1 || nota > 5 || [comentario, gostou, sugestoes].some(v => typeof v !== 'string') || comentario.length > 1000 || gostou.length > 1000 || sugestoes.length > 1000) return json(res,400,{erro:'Dados inválidos.'});
      const anterior = db.prepare('SELECT curso, nota, comentario, gostou, sugestoes FROM respostas WHERE id = ?').get(id);
      if (anterior && (anterior.curso !== curso || anterior.nota !== nota || anterior.comentario !== comentario.trim() || anterior.gostou !== gostou.trim() || anterior.sugestoes !== sugestoes.trim())) return json(res, 200, { salvo: true });
      db.prepare('INSERT OR IGNORE INTO respostas (id, curso, nota, comentario, data, gostou, sugestoes) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, curso, nota, comentario.trim(), new Date().toISOString(), gostou.trim(), sugestoes.trim());
      return json(res, 200, { salvo: true });
    }
    if (req.method === 'GET' && path === '/api/exportar') {
      if (!admin.requireAdmin(req, res, true)) return;
      const cell = value => '"' + String(value).replace(/^(\s*[=+@\-|[\t\r\n])/, "'$&").replaceAll('"', '""') + '"';
      const rows = db.prepare('SELECT curso, nota, comentario, gostou, sugestoes, data FROM respostas ORDER BY data').all();
      const csv = '\uFEFF' + [['Curso', 'Nota', 'O que gostou', 'Sugestões', 'Comentário antigo', 'Data (UTC)'], ...rows.map(r => [r.curso, r.nota, r.gostou, r.sugestoes, r.comentario, r.data])].map(row => row.map(cell).join(',')).join('\n');
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="respostas.csv"', 'Cache-Control': 'no-store' });
      return res.end(csv);
    }
    json(res, 404, { erro: 'Página não encontrada.' });
  } catch (error) {
    console.error(error);
    if (!res.headersSent) json(res, 500, { erro: 'Não foi possível salvar. Tente novamente.' });
    else res.end();
  }
}).listen(Number(port), process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'), () => {
  console.log('Feira disponível na porta ' + port);
  if (process.env.OPEN_CHROME === '1') abrirChrome(`http://localhost:${port}`);
});
