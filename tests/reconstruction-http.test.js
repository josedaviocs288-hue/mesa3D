import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {mkdtemp,rm,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openPlatform} from '../platform.js';
import {ReconstructionStore} from '../reconstruction/store.js';
import {createReconstructionRouter,portionSnapshot} from '../reconstruction/routes.js';
import {safeJobDirectory} from '../reconstruction/files.js';
const dimensions={width:34,depth:20,height:3.1};
async function fixture(t,{ready=true}={}){
 const dir=await mkdtemp(path.join(tmpdir(),'mesa3d-routes-'));const db=openPlatform(dir),store=new ReconstructionStore(db);
 const catalog={restaurant:{slug:'one'},dishes:[{id:'dish',name:'Dish',portions:[{id:'portion',dimensions,upAxis:'y',photos:[],modelUrl:'',modelStatus:'missing'}]}]};
 for(const id of ['one','two'])db.prepare('INSERT INTO restaurants(id,slug,catalog,created_at) VALUES(?,?,?,?)').run(id,id,JSON.stringify(catalog),'2026');
 const app=express();app.use(express.json());const auth=(req,res,next)=>{req.shopId=req.headers['x-test-shop'];if(!['one','two'].includes(req.shopId))return res.sendStatus(401);next()};
 app.use('/api/reconstruction',createReconstructionRouter({db,store,dataDir:dir,requireUser:auth,shopContext:(req,res,next)=>next(),getShop:req=>({id:req.shopId}),getCatalog:req=>JSON.parse(db.prepare('SELECT catalog FROM restaurants WHERE id=?').get(req.shopId).catalog),getReadiness:async()=>({ready,enabled:ready,reasons:ready?[]:['DISABLED']})}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100})});
 const call=(url,opts={})=>fetch(base+'/api/reconstruction'+url,{...opts,headers:{'x-test-shop':'one',...opts.headers}});
 return {dir,db,store,call,base,catalog};
}
function photos(count=30,valid=true){const body=new FormData();body.append('dishId','dish');body.append('portionId','portion');for(let n=0;n<count;n++)body.append('photos',new Blob([valid?Buffer.from('ffd8ffe00010','hex'):Buffer.from('invalid')],{type:'image/jpeg'}),'capture.jpg');return body;}
test('private routes require session; readiness blocks uploads',async t=>{const s=await fixture(t,{ready:false});assert.equal((await fetch(s.base+'/api/reconstruction/jobs')).status,401);assert.equal((await s.call('/jobs',{method:'POST',body:photos()})).status,503);assert.equal(s.store.list('one').length,0)});
test('capture limits, ownership, private files and cancellation',async t=>{const s=await fixture(t);for(const body of [photos(29),photos(30,false)])assert.equal((await s.call('/jobs',{method:'POST',body})).status,400);const r=await s.call('/jobs',{method:'POST',body:photos()});assert.equal(r.status,202);const j=await r.json();assert.equal(j.runToken,undefined);assert.equal(j.payload,undefined);assert.equal((await s.call('/jobs/'+j.id,{headers:{'x-test-shop':'two'}})).status,404);assert.equal((await s.call('/jobs/'+j.id+'/model')).status,409);assert.equal((await s.call('/jobs/'+j.id+'/cancel',{method:'POST'})).status,200);assert.equal(s.store.get(j.id).status,'cancelled');});
test('stale result cannot publish; approval preserves security and queues assets',async t=>{const s=await fixture(t);const portion=s.catalog.dishes[0].portions[0];const j=s.store.enqueue({restaurantId:'one',dishId:'dish',portionId:'portion',identity:portionSnapshot(portion),payload:{dimensions}});const c=s.store.claim('w');const dir=await safeJobDirectory(s.dir,j.id,{create:true});await writeFile(path.join(dir,'model.glb'),await readFile(new URL('../public/assets/filet-demo-optimized.glb',import.meta.url)));await writeFile(path.join(dir,'poster.png'),Buffer.from('89504e470d0a1a0a','hex'));s.store.finish(j.id,c.runToken,{});
 const submit=()=>s.call('/jobs/'+j.id+'/approve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({shapeConfirmed:true,scaleConfirmed:true})});
 portion.dimensions={...dimensions,width:35};s.db.prepare('UPDATE restaurants SET catalog=? WHERE id=?').run(JSON.stringify(s.catalog),'one');assert.equal((await submit()).status,409);assert.equal(s.store.get(j.id).status,'review');
 // Replace with a properly calibrated, embedded-texture fixture.
 const {calibrateGlb}=await import('../glb.js');const bytes=calibrateGlb(await readFile(new URL('../public/assets/filet-demo-optimized.glb',import.meta.url)),dimensions,'z',true).buffer;await writeFile(path.join(dir,'model.glb'),bytes);portion.dimensions=dimensions;s.db.prepare('UPDATE restaurants SET catalog=? WHERE id=?').run(JSON.stringify(s.catalog),'one');
 const approved=await submit();assert.equal(approved.status,200,await approved.text());const catalog=JSON.parse(s.db.prepare('SELECT catalog FROM restaurants WHERE id=?').get('one').catalog);assert.match(catalog.dishes[0].portions[0].modelUrl,/^\/media\//);assert.equal(s.store.get(j.id).status,'completed');assert.equal(s.store.list('one').filter(j=>j.kind==='assets').length,1);assert.equal((await submit()).status,409);
});
