import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePublicConfig } from './origem.js';
import { createAdmin } from './admin.js';
import { Readable } from 'node:stream';

test('origem local, Render, domínio personalizado e configurações inválidas', () => {
  assert.equal(resolvePublicConfig({PORT:'3000'}).origin,'http://localhost:3000');
  const render = {RENDER:'true',RENDER_EXTERNAL_URL:'https://feira-teste.onrender.com',PORT:'10000'};
  assert.equal(resolvePublicConfig(render).origin,render.RENDER_EXTERNAL_URL);
  assert.equal(resolvePublicConfig({...render,APP_ORIGIN:'http://localhost:10000'}).ignoredLocalOrigin,true);
  assert.equal(resolvePublicConfig({...render,APP_ORIGIN:'http://localhost:10000'}).origin,render.RENDER_EXTERNAL_URL);
  assert.equal(resolvePublicConfig({...render,APP_ORIGIN:'https://feira.example/'}).origin,'https://feira.example');
  assert.throws(()=>resolvePublicConfig({NODE_ENV:'production'}));
  assert.throws(()=>resolvePublicConfig({NODE_ENV:'production',APP_ORIGIN:'http://localhost:10000'}));
  assert.throws(()=>resolvePublicConfig({...render,APP_ORIGIN:'https://example.com/admin'}));
});

test('login no Render usa domínio HTTPS e cookie seguro sem confiar no Host', async () => {
  const values={RENDER:'true',RENDER_EXTERNAL_URL:'https://feira-teste.onrender.com',APP_ORIGIN:'http://localhost:10000',NODE_ENV:'production',ADMIN_EMAIL:'admin@example.test',ADMIN_PASSWORD:'senha-exclusiva-de-teste-123'};
  const original=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]));
  Object.assign(process.env,values);
  try {
    const admin=createAdmin({});
    async function login(origin) {
      const req=Readable.from([new URLSearchParams({email:values.ADMIN_EMAIL,password:values.ADMIN_PASSWORD}).toString()]);
      Object.assign(req,{method:'POST',url:'/admin/login',socket:{remoteAddress:'127.0.0.1'},headers:{origin,host:'localhost:10000','x-forwarded-proto':'http','content-type':'application/x-www-form-urlencoded','sec-fetch-site':'same-origin'}});
      const res={headers:{},setHeader(k,v){this.headers[k]=v;},writeHead(status,headers){this.status=status;Object.assign(this.headers,headers);},end(body){this.body=body;}};
      await admin.handle(req,res,'/admin/login'); return res;
    }
    const success=await login(values.RENDER_EXTERNAL_URL);
    assert.equal(success.status,303);
    assert.equal(success.headers.Location,'/admin');
    assert.match(success.headers['Set-Cookie'],/__Host-feira_admin=.*; Secure/);
    const denied=await login('https://externo.example');
    assert.equal(denied.status,403);
    assert.ok(denied.body.includes('https://feira-teste.onrender.com/admin/login'));
    assert.ok(!denied.body.includes('http://localhost'));
  } finally { for(const key of Object.keys(values)) { if(original[key]===undefined)delete process.env[key];else process.env[key]=original[key]; } }
});
