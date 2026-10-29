import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

test('10.001 avaliações: gravação, paginação, gráficos, CSV e persistência após reinício', async () => {
  const dir=await mkdtemp(join(tmpdir(),'feira-capacidade-'));
  const base='http://localhost:31985';
  let child;
  async function start() {
    child=spawn(process.execPath,['server.js'],{cwd:new URL('.',import.meta.url),env:{...process.env,PORT:'31985',APP_ORIGIN:base,DATA_DIR:dir,NODE_ENV:'development',RENDER:'false',OPEN_CHROME:'0',ADMIN_EMAIL:'teste@example.test',ADMIN_PASSWORD:'senha-somente-para-teste-123'},stdio:['ignore','pipe','pipe']});
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Servidor não iniciou')),10000);
      child.stdout.on('data',chunk=>{if(String(chunk).includes('Feira disponível')){clearTimeout(timer);resolve();}});
      child.once('exit',()=>{clearTimeout(timer);reject(Error('Servidor encerrou'));});
    });
  }
  async function stop() {
    if(child && child.exitCode===null){const ended=new Promise(resolve=>child.once('exit',resolve));child.kill();await ended;}
  }
  try {
    await start();
    const cursos=await (await fetch(base+'/api/cursos')).json();
    const db=new DatabaseSync(join(dir,'feira.sqlite'));
    try {
      const insert=db.prepare('INSERT INTO respostas (id,curso,nota,comentario,data,gostou,sugestoes) VALUES (?,?,?,?,?,?,?)');
      db.exec('BEGIN');
      for(let i=0;i<10000;i++)insert.run(randomUUID(),cursos[i%cursos.length],i%5+1,'',new Date(1700000000000+i*1000).toISOString(),'Opinião de teste','Sugestão de teste');
      db.exec('COMMIT');
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM respostas').get().n,10000);
    } finally {db.close();}
    const response=await fetch(base+'/api/respostas',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({id:randomUUID(),curso:cursos[0],nota:5,gostou:'Avaliação 10001',sugestoes:''})});
    assert.equal(response.status,200);
    await stop();await start();
    const login=await fetch(base+'/admin/login',{method:'POST',redirect:'manual',headers:{Origin:base,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'teste@example.test',password:'senha-somente-para-teste-123'})});
    assert.equal(login.status,303);
    const headers={Cookie:login.headers.get('set-cookie').split(';')[0]};
    const page=await (await fetch(base+'/admin?pagina=201',{headers})).text();
    assert.ok(page.includes('10001 de 10001 avaliações'));
    assert.ok(page.includes('Página 201 de 201'));
    assert.equal((page.match(/class="response-card"/g)||[]).length,1);
    const charts=await (await fetch(base+'/admin/graficos',{headers})).text();
    assert.ok(charts.includes('<b>10.001</b>'));
    const csv=await (await fetch(base+'/api/exportar',{headers})).text();
    assert.equal(csv.trim().split(/\r?\n/).length,10002);
    assert.ok(csv.includes('Avaliação 10001'));
  } finally {await stop();await rm(dir,{recursive:true,force:true});}
});
