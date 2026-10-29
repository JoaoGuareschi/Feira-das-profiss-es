import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

test('campos opcionais e limites de 3000/1500 são respeitados no banco e no formulário', async () => {
  const dir = await mkdtemp(join(tmpdir(),'feira-limites-'));
  const base = 'http://localhost:31986';
  const child = spawn(process.execPath,['server.js'],{cwd:new URL('.',import.meta.url),env:{...process.env,PORT:'31986',APP_ORIGIN:base,NODE_ENV:'development',RENDER:'false',DATA_DIR:dir,OPEN_CHROME:'0'},stdio:['ignore','pipe','pipe']});
  try {
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Servidor indisponível')),10000);
      child.stdout.on('data',data=>{if(String(data).includes('Feira disponível')){clearTimeout(timer);resolve();}});
      child.once('exit',()=>{clearTimeout(timer);reject(Error('Servidor encerrado'));});
    });
    const cursos=await (await fetch(base+'/api/cursos')).json();
    const send=data=>fetch(base+'/api/respostas',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({id:randomUUID(),curso:cursos[0],nota:5,...data})});
    const id=randomUUID();
    assert.equal((await send({id,gostou:'漢'.repeat(3000),sugestoes:'漢'.repeat(1500)})).status,200);
    assert.equal((await send({gostou:'x'.repeat(3001)})).status,400);
    assert.equal((await send({sugestoes:'x'.repeat(1501)})).status,400);
    assert.equal((await send({gostou:'',sugestoes:''})).status,200);
    const db=new DatabaseSync(join(dir,'feira.sqlite'));
    try {
      const saved=db.prepare('SELECT gostou, sugestoes FROM respostas WHERE id = ?').get(id);
      assert.equal(saved.gostou.length,3000);assert.equal(saved.sugestoes.length,1500);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM respostas').get().n,2);
    } finally {db.close();}
    const html=await readFile(new URL('./index.html',import.meta.url),'utf8');
    assert.match(html, /id="gostou" maxlength="3000"/);
    assert.match(html, /id="sugestoes" maxlength="1500"/);
    assert.ok(!html.includes('id="gostou-contagem"'));
    assert.ok(!html.includes('id="sugestoes-contagem"'));
    for (const field of html.matchAll(/<textarea[^>]+>/g)) assert.ok(!field[0].includes('required'));
  } finally {
    if(child.exitCode===null){const stopped=new Promise(resolve=>child.once('exit',resolve));child.kill();await stopped;}
    await rm(dir,{recursive:true,force:true});
  }
});
