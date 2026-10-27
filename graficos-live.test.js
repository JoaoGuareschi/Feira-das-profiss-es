import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('consulta a cada 20s, troca dados sem recarregar e trata falha e expiração', async () => {
  let interval; let delay; let replacements = 0; let stopped = false;
  let fail = false; let login = false; let changed = false;
  const table = {scrollLeft:42};
  const nodes = {
    'dados-graficos':{innerHTML:'original',querySelector:()=>table,replaceChildren(...children){replacements++;this.innerHTML=children.join('');}},
    'status-graficos':{}, 'consulta-graficos':{}, 'login-graficos':{hidden:true},
    'atualizar-graficos':{setAttribute(){},addEventListener(type,fn){this.click=fn;}}
  };
  const context = {
    document:{getElementById:id=>nodes[id]}, location:{href:'https://feira.example/admin/graficos'},
    window:{addEventListener(){}}, URL, AbortController,
    setInterval(fn,ms){interval=fn;delay=ms;return 1;},clearInterval(){stopped=true;},setTimeout(){return 2;},clearTimeout(){},
    fetch:async()=> { if(fail)throw Error('offline'); return {ok:true,status:200,url:login?'https://feira.example/admin/login':'https://feira.example/admin/graficos',text:async()=>''}; },
    DOMParser:class {parseFromString(){return {getElementById:id=>id==='dados-graficos'?{innerHTML:changed?'novo':'original',childNodes:['novo']}:{textContent:'Consulta atualizada'}};}}
  };
  vm.runInNewContext(readFileSync(new URL('./graficos-live.js',import.meta.url),'utf8'),context);
  assert.equal(delay,20000);
  await interval(); assert.equal(replacements,0);
  changed=true; await interval(); assert.equal(replacements,1); assert.equal(table.scrollLeft,42);
  assert.equal(nodes['consulta-graficos'].textContent,'Consulta atualizada');
  fail=true; await interval(); assert.equal(nodes['dados-graficos'].innerHTML,'novo');
  assert.match(nodes['status-graficos'].textContent,/Mantivemos os últimos dados/);
  fail=false; login=true; await interval();
  assert.equal(nodes['login-graficos'].hidden,false); assert.equal(stopped,true);
  assert.equal(nodes['dados-graficos'].innerHTML,'');
});
