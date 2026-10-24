import http from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { createAdmin } from './admin.js';
import { abrirChrome } from './abrir-chrome.js';

try { loadEnvFile(fileURLToPath(new URL('./.env', import.meta.url))); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

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
const admin = createAdmin(db);
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}
http.createServer(async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
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
      if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { erro: 'Formato inválido.' });
      let body = ''; let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 16384) { json(res, 413, { erro: 'Resposta muito longa.' }); return; }
        body += chunk;
      }
      let dados;
      try { dados = JSON.parse(body); } catch { return json(res, 400, { erro: 'Resposta inválida.' }); }
      const { id, curso, nota, comentario = '', gostou = '', sugestoes = '' } = dados ?? {};
      if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id) || !cursos.includes(curso) || !Number.isInteger(nota) || nota < 1 || nota > 5 || [comentario, gostou, sugestoes].some(v => typeof v !== 'string' || v.length > 1000)) return json(res, 400, { erro: 'Confira o curso, a avaliação e os textos (máximo de 1.000 caracteres por campo).' });
      const anterior = db.prepare('SELECT curso, nota, comentario, gostou, sugestoes FROM respostas WHERE id = ?').get(id);
      if (anterior && (anterior.curso !== curso || anterior.nota !== nota || anterior.comentario !== comentario.trim() || anterior.gostou !== gostou.trim() || anterior.sugestoes !== sugestoes.trim())) return json(res, 409, { erro: 'Identificador já utilizado. Recarregue a página.' });
      db.prepare('INSERT OR IGNORE INTO respostas (id, curso, nota, comentario, data, gostou, sugestoes) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, curso, nota, comentario.trim(), new Date().toISOString(), gostou.trim(), sugestoes.trim());
      return json(res, 200, { salvo: true });
    }
    if (req.method === 'GET' && path === '/api/exportar') {
      if (!admin.requireAdmin(req, res, true)) return;
      const cell = value => '"' + String(value).replace(/^(\s*[=+@\-]|[\t\r\n])/, "'$&").replaceAll('"', '""') + '"';
      const rows = db.prepare('SELECT curso, nota, comentario, gostou, sugestoes, data FROM respostas ORDER BY data').all();
      const csv = '\uFEFF' + [['Curso', 'Nota', 'O que gostou', 'Sugestões', 'Comentário antigo', 'Data (UTC)'], ...rows.map(r => [r.curso, r.nota, r.gostou, r.sugestoes, r.comentario, r.data])].map(r => r.map(cell).join(';')).join('\r\n');
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="respostas.csv"', 'Cache-Control': 'no-store' });
      return res.end(csv);
    }
    json(res, 404, { erro: 'Página não encontrada.' });
  } catch (error) {
    console.error(error);
    if (!res.headersSent) json(res, 500, { erro: 'Não foi possível salvar. Tente novamente.' });
    else res.end();
  }
}).listen(Number(process.env.PORT || 3000), '0.0.0.0', () => {
  console.log('Feira disponível na porta ' + (process.env.PORT || 3000));
  if (process.env.OPEN_CHROME === '1') abrirChrome(`http://localhost:${process.env.PORT || 3000}`);
});
