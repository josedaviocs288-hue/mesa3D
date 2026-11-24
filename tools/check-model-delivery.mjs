import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {publicOrigin} from '../reconstruction/origin.js';
export async function checkModelDelivery(value,{allowLocal=false,fetcher=fetch}={}){
 const origin=publicOrigin(value,{allowLocal}),checks=[];
 const request=(url,options={})=>fetcher(url,{redirect:'error',signal:AbortSignal.timeout(15000),...options});
 const stateResponse=await request(origin+'/api/state');if(stateResponse.status!==200||!stateResponse.headers.get('content-type')?.includes('application/json'))throw new Error('PUBLIC_CATALOG_UNAVAILABLE');
 const state=await stateResponse.json();checks.push({check:'catalog',ok:true});
 const urls=new Map();for(const dish of state.dishes||[])for(const p of dish.portions||[]){if(p.modelStatus!=='ready')continue;for(const url of [p.modelUrl,p.assets?.webUrl,p.assets?.iosUrl].filter(Boolean)){
  if(!/^\/(media|assets)\/[\w-]+\.(glb|usdz)$/.test(url))throw new Error('UNSAFE_MODEL_URL');urls.set(url,url.endsWith('.usdz')?'usdz':'glb');
 }}
 if(!urls.size)throw new Error('NO_PUBLISHED_MODEL');
 for(const [url,type] of urls){
  const r=await request(origin+url,{headers:{Range:'bytes=0-63'}});const mime=type==='glb'?'model/gltf-binary':'model/vnd.usdz+zip';
  if(r.status!==206||!r.headers.get('content-type')?.includes(mime)||!/^bytes 0-63\/\d+$/.test(r.headers.get('content-range')||''))throw new Error('INVALID_MODEL_DELIVERY');
  const bytes=new Uint8Array(await r.arrayBuffer());if(bytes.length!==64||type==='glb'&&(bytes[0]!==0x67||bytes[1]!==0x6c||bytes[2]!==0x54||bytes[3]!==0x46)||type==='usdz'&&(bytes[0]!==0x50||bytes[1]!==0x4b||bytes[2]!==3||bytes[3]!==4))throw new Error('INVALID_MODEL_SIGNATURE');
  checks.push({check:'model-range-mime',path:url,ok:true});
 }
 for(const [url,mime] of [['/vendor/model-viewer.min.js','javascript'],['/decoders/draco/draco_decoder.wasm','application/wasm'],['/decoders/draco/draco_wasm_wrapper.js','javascript']]){
  const r=await request(origin+url,{method:'HEAD'});if(r.status!==200||!r.headers.get('content-type')?.includes(mime))throw new Error('VIEWER_ASSET_UNAVAILABLE');checks.push({check:'viewer-asset',path:url,ok:true});
 }
 return {origin,ok:true,checks,physicalArVerified:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const origin=process.argv[2];if(!origin)throw new Error('Use: node tools/check-model-delivery.mjs https://dominio [--local-test]');console.log(JSON.stringify(await checkModelDelivery(origin,{allowLocal:process.argv.includes('--local-test')}),null,2));}
 catch(error){console.error('Entrega não validada:',/^[A-Z_]+$/.test(error.message)?error.message:'CHECK_FAILED');process.exitCode=1;}
}
