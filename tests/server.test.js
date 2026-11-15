import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {getBounds} from '../glb.js';

test('acesso, isolamento, revisão 3D e pedido calculado no servidor',async()=>{
  const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
  const dataDir=await fs.mkdtemp(path.join(root,'test-data-'));
  const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:'0',HOST:'127.0.0.1',MESA3D_DATA_DIR:dataDir,OWNER_EMAIL:'admin@example.test',OWNER_PASSWORD:'Test-password-1234!',PILOT_ACCESS_CODE:''},stdio:['ignore','pipe','pipe']});
  let base='',stderr='';child.stderr.on('data',x=>stderr+=String(x));
  try{
    base=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Servidor não iniciou. '+stderr)),15000);
      child.stdout.on('data',x=>{const m=String(x).match(/http:\/\/127\.0\.0\.1:(\d+)/);if(m){clearTimeout(timer);resolve(`http://127.0.0.1:${m[1]}`)}});
      child.on('error',reject);child.on('exit',code=>reject(new Error(`Servidor encerrou: ${code} ${stderr}`)));
    });
    const call=async(url,options={})=>{
      const response=await fetch(base+url,options),body=await response.json().catch(()=>({}));
      return {response,body};
    };
    assert.equal((await call('/api/health')).body.ok,true);
    assert.equal((await fetch(base+'/teste-camera.html')).status,200);
    assert.equal((await fetch(base+'/assets/regua-10cm.glb')).status,200);
    assert.equal((await call('/api/manage/state')).response.status,401);
    assert.equal((await call('/api/dishes',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).response.status,401);
    const ownerLogin=await call('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@example.test',password:'Test-password-1234!'})});
    assert.equal(ownerLogin.response.status,200);
    const tunnelLogin=await call('/api/auth/login',{method:'POST',headers:{Origin:base.replace('http:','https:'),'X-Forwarded-Proto':'https','Content-Type':'application/json'},body:JSON.stringify({email:'admin@example.test',password:'Test-password-1234!'})});
    assert.equal(tunnelLogin.response.status,200);
    assert.match(tunnelLogin.response.headers.get('set-cookie'),/Secure/i);
    const ownerCookie=ownerLogin.response.headers.get('set-cookie').split(';')[0];
    const created=await call('/api/owner/restaurants',{method:'POST',headers:{Cookie:ownerCookie,'Content-Type':'application/json'},body:JSON.stringify({name:'Restaurante Teste',slug:'restaurante-teste',email:'loja@example.test',password:'Restaurant-1234!'})});
    assert.equal(created.response.status,201,created.body.error);
    const ownerOnly=await call('/api/owner/restaurants',{method:'POST',headers:{Cookie:ownerCookie,'Content-Type':'application/json'},body:JSON.stringify({name:'Almoço EEEP',slug:'almoco-eeep'})});
    assert.equal(ownerOnly.response.status,201,ownerOnly.body.error);
    const ownerView=await call('/api/manage/state?loja=almoco-eeep',{headers:{Cookie:ownerCookie}});
    assert.equal(ownerView.body.restaurant.slug,'almoco-eeep');
    const ownerDish=await call('/api/dishes?loja=almoco-eeep',{method:'POST',headers:{Cookie:ownerCookie,'Content-Type':'application/json'},body:JSON.stringify({name:'Almoço escolar',category:'Almoço',published:false,portions:[{label:'Prato normal',grams:350,price:0,dimensions:{width:25,depth:24,height:6}}]})});
    assert.equal(ownerDish.response.status,200,ownerDish.body.error);
    assert.equal((await call('/api/state?loja=almoco-eeep')).body.dishes.length,0);
    const restaurantLogin=await call('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'loja@example.test',password:'Restaurant-1234!'})});
    assert.equal(restaurantLogin.response.status,200);
    const cookie=restaurantLogin.response.headers.get('set-cookie').split(';')[0];
    const protectedHeaders={Cookie:cookie,'Content-Type':'application/json'};
    const portionId='test-portion-1';
    const dish=await call('/api/dishes',{method:'POST',headers:protectedHeaders,body:JSON.stringify({name:'Prato de teste',category:'Teste',description:'Sabor real',prepMinutes:10,published:true,portions:[{id:portionId,label:'Individual',grams:200,price:12.5,dimensions:{width:34,depth:20,height:3.1},upAxis:'z'}]})});
    assert.equal(dish.response.status,200,dish.body.error);
    const photo=new FormData();photo.append('photos',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlJhL8AAAAASUVORK5CYII=','base64')],{type:'image/png'}),'test.png');
    assert.equal((await call(`/api/dishes/${dish.body.id}/portions/${portionId}/photos`,{method:'POST',headers:{Cookie:cookie},body:photo})).response.status,200);
    const model=new FormData();model.append('model',new Blob([await fs.readFile(path.join(root,'public/assets/filet-demo-optimized.glb'))],{type:'model/gltf-binary'}),'test.glb');
    const upload=await call(`/api/dishes/${dish.body.id}/portions/${portionId}/model`,{method:'POST',headers:{Cookie:cookie},body:model});
    assert.equal(upload.response.status,200,upload.body.error);
    assert.equal(upload.body.portion.modelStatus,'review');
    const before=await call('/api/state?loja=restaurante-teste');
    assert.equal(before.body.dishes[0].portions[0].modelUrl,'');
    assert.equal((await call(`/api/dishes/${dish.body.id}/portions/${portionId}/approve`,{method:'POST',headers:protectedHeaders,body:JSON.stringify({shapeConfirmed:true,scaleConfirmed:true})})).response.status,200);
    const state=await call('/api/state?loja=restaurante-teste');
    const saved=state.body.dishes[0].portions[0];
    assert.equal(saved.modelStatus,'ready');
    const glb=Buffer.from(await (await fetch(base+saved.modelUrl)).arrayBuffer()),size=getBounds(glb).size;
    assert.ok(Math.abs(size[0]-.34)<.002);assert.ok(Math.abs(size[1]-.031)<.002);assert.ok(Math.abs(size[2]-.2)<.002);
    assert.ok(saved.modelReport.triangles>0);
    const order=await call('/api/orders?loja=restaurante-teste',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:[{dishId:dish.body.id,portionId,qty:2,price:0}],customerName:'Maria',tableNumber:'8'})});
    assert.equal(order.response.status,201,order.body.error);assert.equal(order.body.totalCents,2500);
    const listed=await call('/api/manage/orders',{headers:{Cookie:cookie}});
    assert.equal(listed.body[0].id,order.body.id);
    const online=await call('/api/orders?loja=restaurante-teste',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:[{dishId:dish.body.id,portionId,qty:1}],customerName:'Ana',tableNumber:'9',paymentIntent:true})});
    assert.equal(online.body.status,'awaiting_payment');
    const confirmation=await call(`/api/orders/${online.body.id}`);
    assert.equal(confirmation.body.paymentStatus,'unpaid');
    const firstShop=await call('/api/state');
    assert.equal(firstShop.body.dishes.some(d=>d.id===dish.body.id),false);
  }finally{
    child.kill();
    await new Promise(resolve=>child.once('exit',resolve));
    await fs.rm(dataDir,{recursive:true,force:true,maxRetries:10,retryDelay:200});
  }
});

test('convite protege páginas e APIs sem impedir visualizador AR de buscar o GLB',async()=>{
  const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
  const dataDir=await fs.mkdtemp(path.join(root,'test-data-'));
  const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:'0',HOST:'127.0.0.1',MESA3D_DATA_DIR:dataDir,PILOT_ACCESS_CODE:'private-test-1234',MESA3D_ENCRYPTION_KEY:'test-key'},stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr.on('data',x=>stderr+=String(x));
  try{
    const base=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Servidor não iniciou. '+stderr)),15000);
      child.stdout.on('data',x=>{const m=String(x).match(/http:\/\/127\.0\.0\.1:(\d+)/);if(m){clearTimeout(timer);resolve(`http://127.0.0.1:${m[1]}`)}});
      child.on('error',reject);child.on('exit',code=>reject(new Error(`Servidor encerrou: ${code} ${stderr}`)));
    });
    assert.equal((await fetch(base+'/api/health')).status,200);
    const blocked=await fetch(base+'/teste-camera.html',{redirect:'manual'});
    assert.equal(blocked.status,302);
    assert.match(blocked.headers.get('location'),/^\/convite\.html\?voltar=/);
    assert.equal((await fetch(base+'/api/state')).status,401);
    assert.equal((await fetch(base+'/convite.html')).status,200);
    assert.match((await (await fetch(base+'/convite.js')).text()),/inviteForm/);
    assert.equal((await fetch(base+'/assets/regua-10cm.glb')).status,200);
    const wrong=await fetch(base+'/api/pilot/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'wrong'})});
    assert.equal(wrong.status,401);
    const access=await fetch(base+'/api/pilot/access',{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-Proto':'https',Origin:base.replace('http:','https:')},body:JSON.stringify({code:'private-test-1234'})});
    assert.equal(access.status,200);
    assert.match(access.headers.get('set-cookie'),/Secure/i);
    const cookie=access.headers.get('set-cookie').split(';')[0];
    const state=await (await fetch(base+'/api/state',{headers:{Cookie:cookie}})).json();
    const modelUrl=state.dishes[0].portions[0].modelUrl;
    assert.ok(modelUrl.startsWith('/media/'));
    assert.equal((await fetch(base+modelUrl)).status,200);
    assert.equal((await fetch(base+'/teste-camera.html',{headers:{Cookie:cookie}})).status,200);
  }finally{
    child.kill();
    await new Promise(resolve=>child.once('exit',resolve));
    await fs.rm(dataDir,{recursive:true,force:true,maxRetries:10,retryDelay:200});
  }
});
