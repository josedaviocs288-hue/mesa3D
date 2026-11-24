import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,mkdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {startServer} from './helpers/server.js';

test('demoWithoutEnv', async t => {
  const server = await startServer();t.after(server.stop);
  assert.equal((await fetch(server.baseUrl+'/api/health')).status,200);
  const html = await (await fetch(server.baseUrl+'/')).text();
  assert.match(html,/O sabor começa/);
  assert.match(await (await fetch(server.baseUrl+'/styles.css')).text(),/--forest:#17352e/);
  assert.notEqual((await fetch(server.baseUrl+'/api/manage/state',{redirect:'manual'})).status,200);
});

test('dataSurvivesRestart', async t => {
  const dataDir=await mkdtemp(path.join(tmpdir(),'mesa3d-persist-'));
  let server; t.after(async()=>{await server?.stop();await rm(dataDir,{recursive:true,force:true,maxRetries:5,retryDelay:100})});
  server=await startServer({dataDir});await server.stop();
  const {openPlatform}=await import('../platform.js');
  const db=openPlatform(dataDir);
  db.prepare('INSERT INTO restaurants(id,slug,catalog,created_at) VALUES(?,?,?,?)').run('persist','persist',JSON.stringify({restaurant:{name:'Persistente',slug:'persist'},dishes:[]}),'2026-01-01');db.close();
  await mkdir(path.join(dataDir,'uploads'),{recursive:true});await writeFile(path.join(dataDir,'uploads','fixture.txt'),'preserved');
  server=await startServer({dataDir});
  const state=await(await fetch(server.baseUrl+'/api/state?loja=persist')).json();
  assert.equal(state.restaurant.name,'Persistente');
  assert.equal(await readFile(path.join(dataDir,'uploads','fixture.txt'),'utf8'),'preserved');
});

test('legacyDishDoesNotOpenUnrelatedDish',async t=>{
 const s=await startServer();t.after(s.stop);
 const r=await fetch(s.baseUrl+'/cardapio/brasa-e-raiz/2');assert.equal(r.status,404);assert.match(await r.text(),/cardápio/i);
 const menu=await fetch(s.baseUrl+'/cardapio/brasa-e-raiz',{redirect:'manual'});assert.equal(menu.status,302);assert.equal(menu.headers.get('location'),'/?loja=brasa-e-raiz');
 const svg=await fetch(s.baseUrl+'/api/qr.svg?url='+encodeURIComponent(s.baseUrl+'/?loja=brasa-e-raiz'));assert.equal(svg.status,200);assert.match(await svg.text(),/<svg/);
});
