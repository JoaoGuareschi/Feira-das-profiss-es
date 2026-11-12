import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copiarBanco } from './banco.js';

test('backup consistente inclui WAL, preserva origem e não sobrescreve destino', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'feira-backup-'));
  const origem = join(dir, 'original.sqlite');
  const destino = join(dir, 'backup.sqlite');
  const db = new DatabaseSync(origem);
  try {
    db.exec("PRAGMA journal_mode=WAL; CREATE TABLE respostas(id TEXT PRIMARY KEY, gostou TEXT); INSERT INTO respostas VALUES ('1','Opinião preservada');");
    assert.equal((await copiarBanco(origem, destino)).total, 1);
    const copia = new DatabaseSync(destino, {readOnly:true});
    try { assert.equal(copia.prepare('SELECT gostou FROM respostas').get().gostou, 'Opinião preservada'); }
    finally { copia.close(); }
    const bytes = readFileSync(destino);
    await assert.rejects(copiarBanco(origem, destino), /já existe/);
    assert.deepEqual(readFileSync(destino), bytes);
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM respostas').get().total, 1);
    await assert.rejects(copiarBanco(join(dir, 'ausente.sqlite'), join(dir, 'novo.sqlite')), /não encontrado/);
    assert.equal(existsSync(join(dir, 'novo.sqlite')), false);
  } finally { db.close(); rmSync(dir, {recursive:true, force:true}); }
});
