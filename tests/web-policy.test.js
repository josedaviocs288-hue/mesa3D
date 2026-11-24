import test from 'node:test';
import assert from 'node:assert/strict';
import {startServer,login} from './helpers/server.js';

test('generationNeverStarts; logoutRevokesSession',async t=>{
 const s=await startServer({env:{OWNER_EMAIL:'owner@example.test',OWNER_PASSWORD:'Test-password-1234!',MESHY_API_KEY:'fixture-not-a-real-key'}});t.after(s.stop);
 const cookie=await login(s.baseUrl,'owner@example.test','Test-password-1234!');
 const state=await(await fetch(s.baseUrl+'/api/manage/state',{headers:{Cookie:cookie}})).json();
 assert.equal(state.capabilities.local3d,false);assert.equal(state.capabilities.meshyConfigured,false);
 const status=await(await fetch(s.baseUrl+'/api/local3d/status',{headers:{Cookie:cookie}})).json();assert.equal(status.ready,false);
 for(const [url,method] of [['/api/local3d/jobs','POST'],['/api/dishes/demo-filet/portions/demo-100/generate','POST'],['/api/dishes/demo-filet/portions/demo-100/job','GET']]){
  const r=await fetch(s.baseUrl+url,{method,headers:{Cookie:cookie}});assert.equal(r.status,503);assert.equal((await r.json()).code,'RECONSTRUCTION_DISABLED');
 }
 await fetch(s.baseUrl+'/api/auth/logout',{method:'POST',headers:{Cookie:cookie}});
 assert.equal((await fetch(s.baseUrl+'/api/manage/state',{headers:{Cookie:cookie}})).status,401);
});

test('twoRestaurantIsolation; serverCalculatesOrderPrice; publicStateHidesDrafts',async t=>{
 const s=await startServer({env:{OWNER_EMAIL:'owner@example.test',OWNER_PASSWORD:'Test-password-1234!'}});t.after(s.stop);
 const owner=await login(s.baseUrl,'owner@example.test','Test-password-1234!');
 const call=(url,body,cookie=owner,method='POST')=>fetch(s.baseUrl+url,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 for(const slug of ['one','two']) assert.equal((await call('/api/owner/restaurants',{name:slug,slug,email:slug+'@example.test',password:'Restaurant-1234!'})).status,201);
 const cookies=await Promise.all(['one','two'].map(slug=>login(s.baseUrl,slug+'@example.test','Restaurant-1234!')));
 let first;
 for(const [i,cookie] of cookies.entries()){
  const r=await call('/api/dishes',{name:'Dish '+i,category:'Test',published:true,portions:[{id:'shared-portion',label:'Individual',grams:200,price:i?77:12.5,dimensions:{width:25,depth:24,height:6}}]},cookie);
  assert.equal(r.status,200);const dish=await r.json();if(!i)first=dish;
 }
 assert.equal((await call('/api/dishes/'+first.id,undefined,cookies[1],'DELETE')).status,404);
 const forbidden=await call('/api/orders?loja=two',{items:[{dishId:first.id,portionId:'shared-portion',qty:1}],customerName:'Test',tableNumber:'8'});assert.notEqual(forbidden.status,201);
 const order=await call('/api/orders?loja=one',{items:[{dishId:first.id,portionId:'shared-portion',qty:2,price:0}],customerName:'Test',tableNumber:'8'});assert.equal(order.status,201);assert.equal((await order.json()).totalCents,2500);
 const draft=await call('/api/dishes',{...first,published:false},cookies[0]);assert.equal(draft.status,200);
 assert.equal((await(await fetch(s.baseUrl+'/api/state?loja=one')).json()).dishes.length,0);
});

test('cartIsScopedToRestaurant',async()=>{
 const {cartKey,readCart}=await import('../public/cart.js');
 const values=new Map();const storage={getItem:k=>values.get(k)};
 values.set(cartKey('one'),JSON.stringify([{dishId:'same',portionId:'same',qty:2}]));
 assert.deepEqual(readCart(storage,'two'),[]);assert.equal(readCart(storage,'one')[0].qty,2);
 values.set(cartKey('one'),'{}');assert.deepEqual(readCart(storage,'one'),[]);
});
