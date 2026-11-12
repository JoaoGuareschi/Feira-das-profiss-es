import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, mkdtempSync, linkSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// A API de backup inclui transações confirmadas, mesmo quando o SQLite usa WAL.
// O destino só aparece depois da cópia e validação completas.
export async function copiarBanco(origem, destino) {
  origem = resolve(origem);
  destino = resolve(destino);
  if (!existsSync(origem)) throw new Error('Banco de origem não encontrado. Nenhum banco vazio foi criado.');
  if (existsSync(destino)) throw new Error('O destino já existe. Escolha outro nome; nenhum banco será sobrescrito.');
  const db = new DatabaseSync(origem, {readOnly:true});
  let temporaria;
  try {
    if (db.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw new Error('Banco de origem com falha de integridade.');
    db.prepare('SELECT COUNT(*) FROM respostas').get();
    mkdirSync(dirname(destino), {recursive:true});
    temporaria = mkdtempSync(join(dirname(destino), '.copia-banco-'));
    const arquivo = join(temporaria, 'feira.sqlite');
    await backup(db, arquivo);
    const copia = new DatabaseSync(arquivo, {readOnly:true});
    let total;
    try {
      if (copia.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw new Error('Cópia com falha de integridade.');
      total = copia.prepare('SELECT COUNT(*) AS total FROM respostas').get().total;
    } finally { copia.close(); }
    // Publicação atômica: linkSync falha se alguém criar o destino durante a cópia.
    linkSync(arquivo, destino);
    return {destino, total};
  } finally {
    db.close();
    if (temporaria) rmSync(temporaria, {recursive:true, force:true});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [origem, destino] = process.argv.slice(2);
  if (!origem || !destino || process.argv.length !== 4) {
    console.error('Uso: node banco.js caminho/origem.sqlite caminho/copia.sqlite');
    process.exitCode = 1;
  } else {
    try {
      const resultado = await copiarBanco(origem, destino);
      console.log(`Cópia verificada: ${resultado.total} avaliações. Arquivo: ${resultado.destino}`);
      console.log('Guarde também uma cópia fora da hospedagem. Backup em disco temporário também desaparece.');
    } catch (error) {
      console.error('Não foi possível copiar o banco:', error.message);
      process.exitCode = 1;
    }
  }
}
