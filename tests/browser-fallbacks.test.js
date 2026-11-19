import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

function context(state){
 const nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,innerHTML:'',textContent:'',value:'',addEventListener(){},closest(){return {classList:{toggle(){}}}}});return nodes.get(id)};
 const sandbox={URL,URLSearchParams,encodeURIComponent,location:{search:'',origin:'http://localhost'},
  document:{getElementById:node,querySelectorAll:()=>[],addEventListener(){}},
  api:async()=>state,money:String,escapeHtml:String,toast(){},firstPhoto:()=>'/assets/placeholder.svg',portionPhoto:()=>'/assets/placeholder.svg',viewerUrl:()=>'',publicUrl:()=>'',
  setTimeout:()=>1,clearTimeout(){},window:{addEventListener(){}},customElements:{whenDefined:()=>new Promise(()=>{}),get:()=>undefined},
  browserCapabilities:()=>({webgl:true,secure:true,apple:false,origin:'http://localhost'}),
 };
 return {nodes,node,sandbox};
}
async function execute(file,sandbox){const code=(await readFile(new URL('../public/'+file,import.meta.url),'utf8')).replace(/^import .*?;\r?\n/gm,'');vm.runInNewContext(code,sandbox);await new Promise(resolve=>setImmediate(resolve));}

test('blockedLocalStorageStillShowsMenu',async()=>{
 const {readCart,cartKey}=await import('../public/cart.js');
 const s=context({restaurant:{slug:'one',name:'Menu'},dishes:[],capabilities:{}});Object.assign(s.sandbox,{readCart,cartKey});
 Object.defineProperty(s.sandbox,'localStorage',{get(){throw new DOMException('Blocked','SecurityError')}});
 await execute('menu.js',s.sandbox);assert.equal(s.node('emptyState').hidden,false);assert.doesNotMatch(s.node('dishGrid').innerHTML,/Não foi possível/);
});

test('blockedVendorStillSelectsPhotoAndMetadata',async()=>{
 const p={id:'p',modelStatus:'ready',modelUrl:'/media/a.glb',grams:200,price:10,dimensions:{width:20,depth:20,height:3},assets:{originalUrl:'/media/a.glb',posterUrl:'/assets/photo.jpg',iosUrl:'/media/model.usdz'}};
 const s=context({restaurant:{slug:'one',name:'Menu'},dishes:[{id:'d',name:'Dish',published:true,portions:[p]}]});s.sandbox.location.search='?id=d&porcao=p';
 let selected;s.sandbox.createViewerController=()=>({select(portion){selected=portion},destroy(){}});
 s.sandbox.ensureViewerLibrary=()=>Promise.reject(new Error('Vendor blocked'));
 await execute('view.js',s.sandbox);assert.equal(s.node('viewName').textContent,'Dish');assert.equal(selected,p);assert.match(s.node('viewerFeedback').textContent,/foto|visualizador/i);
});

test('viewerLibraryTimeoutAllowsRetry',async()=>{
 const {ensureViewerLibrary}=await import('../public/viewer-library.js');
 const registry={get:()=>undefined,whenDefined:()=>new Promise(()=>{})};
 await assert.rejects(ensureViewerLibrary({registry,load:async()=>{},timeoutMs:5}),/indisponível/);
 class Viewer{}
 const ready={get:()=>Viewer};assert.equal(await ensureViewerLibrary({registry:ready}),Viewer);
 await assert.rejects(ensureViewerLibrary({registry,load:async()=>{throw new Error('Blocked')},timeoutMs:20}),/Blocked/);
});
